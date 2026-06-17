import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, CartesianGrid
} from "recharts";
import { load, save, loadHistory, saveHistory } from "./utils/storage";
import { todayStr, thisMonth, fmtDate, fmtMon, addMonth, profitColor, roundY, profitStr, calcYTicks } from "./utils/helpers";
import ProfitStr from "./components/ProfitStr";
import "./styles/app.css";

/* ── Chart Tooltip ── */
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div className="ctip">
      <div className="ctip-date">{label}</div>
      <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:14,color:val>=0?"#16a34a":"#dc2626"}}>
        {val>=0?`+${val.toLocaleString()}円`:`-${Math.abs(val).toLocaleString()}円`}
      </div>
    </div>
  );
};

const Icon = ({ id }) => {
  const d = {
    home: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
    graph:<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    list: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    add:  <><circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><line x1="12" y1="8" x2="12" y2="16" stroke="white" strokeWidth="2.5" strokeLinecap="round"/><line x1="8" y1="12" x2="16" y2="12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/></>,
    gear: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">{d[id]}</svg>;
};

/* ── AutocompleteInput ── */
const AutocompleteInput = ({ value, onChange, candidates, placeholder, className }) => {
  const [open, setOpen] = useState(false);
  const filtered = candidates.filter(c => c.toLowerCase().includes(value.toLowerCase()) && c !== value);
  return (
    <div className="form-input-wrap">
      <input
        className={className}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtered.length > 0 && (
        <div className="autocomplete">
          {filtered.slice(0, 6).map((c, i) => (
            <div key={i} className="autocomplete-item" onMouseDown={() => { onChange(c); setOpen(false); }}>
              {c}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const EMPTY_FORM = { date: todayStr(), store:"", machine:"", invest:"", collect:"", memo:"" };
const LIST_PAGE_SIZE = 10;

export default function App() {
  const [tab,         setTab]         = useState(0);
  const [records,     setRecords]     = useState(load);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [saved,       setSaved]       = useState(false);
  const [editId,      setEditId]      = useState(null);
  const [viewMonth,   setViewMonth]   = useState(thisMonth());
  const [importMsg,   setImportMsg]   = useState("");
  const [undoItem,    setUndoItem]    = useState(null);   // {record, timer}
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [listExpanded,setListExpanded]= useState({});     // {month: bool}
  const [history,     setHistory]     = useState(loadHistory);
  const fileInputRef  = useRef(null);
  const undoTimerRef  = useRef(null);

  useEffect(() => { save(records); }, [records]);
  useEffect(() => { saveHistory(history); }, [history]);

  /* derived */
  const sorted       = useMemo(()=>[...records].sort((a,b)=>b.date.localeCompare(a.date)),[records]);
  const totalProfit  = useMemo(()=>records.reduce((s,r)=>s+r.profit,0),[records]);
  const monthRecs    = useMemo(()=>records.filter(r=>r.date.startsWith(thisMonth())),[records]);
  const monthProfit  = useMemo(()=>monthRecs.reduce((s,r)=>s+r.profit,0),[monthRecs]);
  const winRate      = useMemo(()=>records.length?Math.round(records.filter(r=>r.profit>0).length/records.length*100):null,[records]);
  const avgProfit    = useMemo(()=>records.length?Math.round(records.reduce((s,r)=>s+r.profit,0)/records.length/100)*100:0,[records]);
  // 連勝/連敗ストリーク（最新記録から遡る）
  const streak = useMemo(()=>{
    const s=[...records].sort((a,b)=>b.date.localeCompare(a.date));
    if(!s.length) return {count:0,type:'none'};
    const first=s[0].profit>0?'win':s[0].profit<0?'lose':'none';
    if(first==='none') return {count:0,type:'none'};
    let n=0;
    for(const r of s){ if((r.profit>0?'win':'lose')===first) n++; else break; }
    return {count:n,type:first};
  },[records]);
  // 自己ベスト（最高勝ち・最高負け）
  const bestWin  = useMemo(()=>records.filter(r=>r.profit>0).reduce((m,r)=>r.profit>m?r.profit:m,0),[records]);
  const bestLose = useMemo(()=>records.filter(r=>r.profit<0).reduce((m,r)=>r.profit<m?r.profit:m,0),[records]);
  // 最高収支レコードのid（🏆表示用）
  const bestRecId = useMemo(()=>records.filter(r=>r.profit>0).sort((a,b)=>b.profit-a.profit)[0]?.id||null,[records]);
  const viewMonthRecs   = useMemo(()=>records.filter(r=>r.date.startsWith(viewMonth)),[records,viewMonth]);
  const viewMonthProfit = useMemo(()=>viewMonthRecs.reduce((s,r)=>s+r.profit,0),[viewMonthRecs]);
  const viewMonthWin    = useMemo(()=>viewMonthRecs.length?Math.round(viewMonthRecs.filter(r=>r.profit>0).length/viewMonthRecs.length*100):null,[viewMonthRecs]);
  const chartData    = useMemo(()=>{ const m={}; viewMonthRecs.forEach(r=>{m[r.date]=(m[r.date]||0)+r.profit;}); return Object.entries(m).sort(([a],[b])=>a.localeCompare(b)).map(([date,profit])=>({date:fmtDate(date).replace(/\(.+\)/,"").trim(),profit})); },[viewMonthRecs]);
  const machineStats = useMemo(()=>{ const m={}; records.forEach(r=>{if(!m[r.machine])m[r.machine]={name:r.machine,count:0,profit:0}; m[r.machine].count++; m[r.machine].profit+=r.profit;}); return Object.values(m).sort((a,b)=>b.profit-a.profit); },[records]);
  const grouped      = useMemo(()=>{ const g={}; sorted.forEach(r=>{const mo=r.date.slice(0,7); if(!g[mo])g[mo]=[]; g[mo].push(r);}); return Object.entries(g).sort(([a],[b])=>b.localeCompare(a)); },[sorted]);
  const previewProfit= useMemo(()=>(parseInt(form.collect)||0)-(parseInt(form.invest)||0),[form.invest,form.collect]);
  const canGoNext    = viewMonth < thisMonth();

  /* ── delete with undo ── */
  const handleDelete = useCallback((id) => {
    const rec = records.find(r => r.id === id);
    if (!rec) return;
    setDeleteTarget(rec);
  }, [records]);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    setRecords(prev => prev.filter(r => r.id !== deleteTarget.id));
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoItem(deleteTarget);
    setDeleteTarget(null);
    undoTimerRef.current = setTimeout(() => setUndoItem(null), 7000);
  }, [deleteTarget]);

  const pauseUndoTimer = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  };

  const resumeUndoTimer = () => {
    if (undoItem) undoTimerRef.current = setTimeout(() => setUndoItem(null), 3000);
  };

  const handleUndo = () => {
    if (!undoItem) return;
    setRecords(prev => {
      const exists = prev.some(r => r.id === undoItem.id);
      return exists ? prev : [...prev, undoItem];
    });
    setUndoItem(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  };

  /* ── date input ── */
  const handleDateChange = (val) => {
    // type=date から YYYY-MM-DD が来る場合はそのまま
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      setForm(p=>({...p, date:val}));
      return;
    }
    // 手入力: 数字8桁 → YYYY-MM-DD に自動変換
    const digits = val.replace(/\D/g, '');
    if (digits.length === 8) {
      const formatted = `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`;
      setForm(p=>({...p, date:formatted}));
    } else {
      setForm(p=>({...p, date:val}));
    }
  };

  /* ── submit ── */
  const handleSubmit = () => {
    const inv=parseInt(form.invest), col=parseInt(form.collect);
    const isValidDate = (s) => {
      if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
      const d = new Date(s);
      return d instanceof Date && !isNaN(d) && d.toISOString().slice(0,10)===s;
    };
    if(!form.date||!isValidDate(form.date)||isNaN(inv)||isNaN(col)) return;
    const rec={
      id:editId||Date.now().toString(),
      date:form.date, store:form.store.trim()||"店舗不明",
      machine:form.machine.trim()||"機種不明",
      invest:inv, collect:col, profit:col-inv,
      memo:form.memo.trim(),
    };
    if(editId) setRecords(prev=>prev.map(r=>r.id===editId?rec:r));
    else setRecords(prev=>[...prev,rec]);
    // update input history
    if (form.store.trim()) setHistory(h => ({...h, stores:[...new Set([form.store.trim(),...h.stores])].slice(0,20)}));
    if (form.machine.trim()) setHistory(h => ({...h, machines:[...new Set([form.machine.trim(),...h.machines])].slice(0,20)}));
    setForm({...EMPTY_FORM,date:form.date}); setEditId(null);
    setSaved(true); setTimeout(()=>{ setSaved(false); setTab(3); },1200);
  };

  const startEdit = (r) => {
    setEditId(r.id);
    setForm({date:r.date,store:r.store,machine:r.machine,invest:String(r.invest),collect:String(r.collect),memo:r.memo||""});
    setTab(2);
  };

  const handleExport = () => {
    const payload = {
      appName: "スロログ",
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      records,
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a");
    a.href=url; a.download=`slotlog-backup-${todayStr()}.json`; a.click(); URL.revokeObjectURL(url);
  };
  const handleImport = (e) => {
    const file=e.target.files?.[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=(ev)=>{
      try {
        const parsed=JSON.parse(ev.target.result);
        // 新フォーマット { records: [...] } または旧フォーマット [...]
        const imported = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.records) ? parsed.records : null);
        if(!imported) throw new Error("records が見つかりません");
        if(!window.confirm("現在のデータをバックアップデータで上書きします。よろしいですか？")) { e.target.value=""; return; }
        setRecords(imported);
        setImportMsg(`✓ ${imported.length}件のデータを読み込みました`);
        setTimeout(()=>setImportMsg(""),4000);
      } catch(err) {
        setImportMsg(`⚠ 読み込みに失敗しました: ${err.message||"不正なファイルです"}`);
        setTimeout(()=>setImportMsg(""),5000);
      }
      e.target.value="";
    };
    reader.readAsText(file);
  };

  /* ── RecCard ── */
  const RecCard = ({ r, delay=0 }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuPos,  setMenuPos]  = useState({top:0,right:0});
    const btnRef = useRef(null);
    return (
      <div className={`rec-item ${profitColor(r.profit)} su`} style={{animationDelay:`${delay}s`}} onClick={()=>menuOpen&&setMenuOpen(false)}>
        {/* 上段: 機種名 ＋ 収支 ＋ ⋯ */}
        <div style={{display:"flex",alignItems:"center",minWidth:0,gap:6}}>
          {r.id===bestRecId&&<span style={{fontSize:13,lineHeight:1,opacity:0.75,flexShrink:0,position:"relative",top:2}}>🏆</span>}
          <div className="rec-machine" style={{flex:1,minWidth:0}} title={r.machine}>{r.machine}</div>
          <div className={`rec-profit ${profitColor(r.profit)}`} style={{flexShrink:0,marginLeft:6}}><ProfitStr n={r.profit}/></div>
          <div style={{position:"relative",flexShrink:0}}>
            <button className="rec-menu-btn" style={{padding:"4px 0px",minWidth:28,minHeight:28,fontSize:18,letterSpacing:"-0.3em",marginRight:-4}} ref={btnRef} onClick={e=>{e.stopPropagation();const btn=e.currentTarget.getBoundingClientRect();const spaceBelow=window.innerHeight-btn.bottom;const above=spaceBelow<90;const top=above?btn.top:btn.bottom+4;const right=window.innerWidth-btn.right;setMenuPos({top,right,above});setMenuOpen(o=>!o);}}>⋯</button>
            {menuOpen && createPortal(
              <div className="rec-menu-dropdown" style={{position:"fixed",bottom:`${window.innerHeight-menuPos.top+4}px`,right:menuPos.right,top:"auto",marginTop:0,zIndex:9999}}>
                <button className="rec-menu-item edit" onClick={e=>{e.stopPropagation();setMenuOpen(false);startEdit(r);}}>✏️ 編集</button>
                <button className="rec-menu-item del"  onClick={e=>{e.stopPropagation();setMenuOpen(false);handleDelete(r.id);}}>🗑️ 削除</button>
              </div>,
              document.body
            )}
          </div>
        </div>
        {/* 下段: 日付 + 投資/回収 */}
        <div className="rec-footer">
          <span className="rec-date">{fmtDate(r.date)}</span>
          <div className="rec-amounts" style={{marginLeft:8}}>
            <div className="rec-amt invest">投資 ¥{r.invest.toLocaleString()}</div>
            <div className="rec-amt collect">回収 ¥{r.collect.toLocaleString()}</div>
          </div>
        </div>
        {r.memo && <div className="rec-memo">{r.memo}</div>}
      </div>
    );
  };

  const NAV = [{id:"home",label:"ホーム"},{id:"graph",label:"分析"},{id:"add",label:"記録"},{id:"list",label:"履歴"},{id:"gear",label:"設定"}];

  return (
    <>
      <div className="app">
        <div className="header" style={tab!==0?{height:"auto",minHeight:0,padding:"14px 0",background:"#f2ddba",borderBottom:"1px solid #d8d0c5"}:{}}>
          {tab === 0
            ? <img src="/logo.png?v=5" alt="スロログ" className="header-banner"/>
            : tab === 2 && editId
              ? <div style={{display:"flex",alignItems:"center",width:"100%",padding:"0 16px",position:"relative"}}>
                  <button onClick={()=>{setEditId(null);setForm(EMPTY_FORM);setTab(3);}} style={{background:"none",border:"none",cursor:"pointer",color:"#C96A14",fontSize:13,fontWeight:700,padding:0,fontFamily:"'Nunito',sans-serif",zIndex:1}}>← 戻る</button>
                  <div style={{position:"absolute",left:0,right:0,textAlign:"center",fontFamily:"'Nunito',sans-serif",fontSize:16,fontWeight:800,color:"#4B433C",letterSpacing:"-0.3px",pointerEvents:"none"}}>✏️ 実戦結果を編集</div>
                </div>
              : <div style={{fontFamily:"'Nunito',sans-serif",fontSize:17,fontWeight:800,color:"#4B433C",letterSpacing:"-0.3px",padding:"0 16px",lineHeight:"normal",width:"100%",textAlign:"center"}}>{["","📊 分析","記録","🕒 履歴","⚙️ 設定"][tab]}</div>
          }
        </div>

        {/* ═══ HOME ═══ */}
        {tab===0 && (
          <>
            <div className="kpi-grid">
              {/* Hero: 今月収支 */}
              <div className="kpi hero">
                <div className="kpi-hero-label">今月の収支</div>
                <div className={`kpi-val hero ${profitColor(monthProfit)}`}><ProfitStr n={monthProfit}/></div>
                {monthRecs.length > 0 && (
                  <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:4}}>
                    <span style={{fontSize:10,background:"rgba(0,0,0,0.06)",color:"var(--t2)",padding:"2px 7px",borderRadius:20,fontWeight:600,lineHeight:1.6}}>{monthRecs.length}戦{monthRecs.filter(r=>r.profit>0).length}勝{monthRecs.filter(r=>r.profit<0).length}敗</span>
                    {winRate!=null&&<span style={{fontSize:10,background:"rgba(249,115,22,0.1)",color:"var(--orange)",padding:"2px 7px",borderRadius:20,fontWeight:600,lineHeight:1.6}}>勝率{winRate}%</span>}
                    {streak.count>=2&&<span style={{fontSize:10,background:streak.type==="win"?"rgba(249,115,22,0.1)":"rgba(0,0,0,0.05)",color:streak.type==="win"?"var(--orange)":"var(--t3)",padding:"2px 7px",borderRadius:20,fontWeight:600,lineHeight:1.6}}>{streak.count}{streak.type==="win"?"連勝中":"連敗中"}</span>}
                  </div>
                )}
              </div>
              {/* Sub row: 総収支・勝率・実戦回数 */}
              <div className="kpi-sub-row">
                <div className="kpi-sub">
                  <div className="kpi-icon-wrap" style={{background:"rgba(249,115,22,0.05)"}}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                  </div>
                  <div className="kpi-label">勝率</div>
                  <div className="kpi-val sub orange">{winRate!=null?`${winRate}%`:"0%"}</div>
                  {records.length>0&&<div style={{fontSize:8,color:"var(--t3)",marginTop:2,fontWeight:400,opacity:0.5}}>{records.filter(r=>r.profit>0).length}勝{records.filter(r=>r.profit<0).length}敗</div>}
                </div>
                <div className="kpi-sub">
                  <div className="kpi-icon-wrap" style={{background:"rgba(249,115,22,0.05)"}}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/></svg>
                  </div>
                  <div className="kpi-label">実戦</div>
                  <div className="kpi-val sub orange">{records.length}<span style={{fontSize:11,marginLeft:2,fontWeight:700}}>回</span></div>
                </div>
                <div className="kpi-sub" style={{opacity:bestWin>0?1:0.5}}>
                  <div className="kpi-icon-wrap" style={{background:"rgba(249,115,22,0.05)"}}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>
                  </div>
                  <div className="kpi-label">最高勝ち</div>
                  <div className={`kpi-val sub ${bestWin>0?"plus":"zero"}`}>{bestWin>0?<ProfitStr n={bestWin}/>:<span style={{fontSize:11,color:"var(--t2)",fontWeight:500}}>未記録</span>}</div>
                </div>
              </div>
            </div>
            <div className="section">
              {records.length===0 ? (
                /* ── 初回ガイド ── */
                <div className="onboard-card su">
                  <div className="onboard-title">スロログへようこそ</div>
                  <div style={{fontSize:13,color:"var(--t2)",lineHeight:1.7,marginBottom:20}}>
                    日付・機種・投資額・回収額を入力するだけで<br/>収支が自動計算されます。
                  </div>
                  <button className="onboard-btn" onClick={()=>setTab(2)}>最初の収支を記録する</button>
                </div>
              ) : (
                <>
                  {chartData.length>=2 && (
                    <div className="graph-card su">
                      <div className="graph-title">直近の収支推移</div>
                      <ResponsiveContainer width="100%" height={100}>
                        <BarChart data={chartData} margin={{top:4,right:10,left:0,bottom:0}}>
                          <CartesianGrid stroke="#f0ece4" vertical={false}/>
                          <XAxis dataKey="date" tick={{fontSize:10,fill:"#a8a29e"}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
                          <YAxis ticks={calcYTicks(chartData)} domain={["dataMin","dataMax"]} tick={{fontSize:10,fill:"#a8a29e"}} tickLine={false} axisLine={false} width={48} tickFormatter={v=>{const k=v/1000;return v===0?"0":`${k>=0?"+":""}${k.toFixed(0)}k`;}}/>
                          <Tooltip content={<ChartTip/>} cursor={{fill:"rgba(0,0,0,0.04)"}}/>
                          <ReferenceLine y={0} stroke="#a8a29e" strokeWidth={1.5}/>
                          <Bar dataKey="profit" radius={[4,4,0,0]}>{chartData.map((e,i)=><Cell key={i} fill={e.profit>=0?"#16a34a":"#dc2626"} fillOpacity={0.8}/>)}</Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <div className="section-title" style={{textTransform:"none",letterSpacing:0,fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:5}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>最近の実戦</div>
                  {sorted.slice(0,3).map((r,i)=><RecCard key={r.id} r={r} delay={i*0.05}/>)}
                  {sorted.length>3 && (
                    <div style={{textAlign:"center",paddingBottom:8}}>
                      <button onClick={()=>setTab(2)} style={{background:"none",border:"1px solid var(--border)",borderRadius:"var(--r-md)",padding:"8px 20px",fontSize:13,color:"var(--t2)",fontWeight:700,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>
                        すべての記録を見る →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* ═══ GRAPH ═══ */}
        {tab===1 && (
          <div className="section" style={{paddingTop:14}}>
            <div className="month-nav su">
              <button className="month-nav-btn" onClick={()=>setViewMonth(m=>addMonth(m,-1))}>◀</button>
              <div className="month-nav-label">{fmtMon(viewMonth)}</div>
              <button className="month-nav-btn" disabled={!canGoNext} onClick={()=>setViewMonth(m=>addMonth(m,1))}>▶</button>
            </div>
            <div className="sum-grid su">
              {/* Hero */}
              <div className="sum-cell accent">
                <div className="kpi-hero-label">今月の収支</div>
                <div className={`kpi-val hero ${profitColor(viewMonthProfit)}`}><ProfitStr n={viewMonthProfit}/></div>
                {viewMonthRecs.length > 0 ? (
                  <div className="hero-copy">
                    {viewMonthRecs.length}戦{viewMonthRecs.filter(r=>r.profit>0).length}勝{viewMonthRecs.filter(r=>r.profit<0).length}敗
                  </div>
                ) : (
                  <div style={{fontSize:11,color:"var(--t3)",marginTop:4}}>この月の記録はありません</div>
                )}
              </div>
              {/* Sub row — 全期間統計 */}
              <div style={{fontSize:9,color:"#8a837a",fontWeight:700,letterSpacing:"0.09em",textTransform:"uppercase",marginBottom:6}}>全期間</div>
              <div className="sum-sub-row">
                <div className="sum-sub">
                  <div className="kpi-label">1回あたり</div>
                  <div className={`kpi-val sub ${profitColor(avgProfit)}`}>{records.length?<ProfitStr n={avgProfit}/>:"—"}</div>
                </div>
                <div className="sum-sub">
                  <div className="kpi-label">最高勝ち</div>
                  <div className={`kpi-val sub ${bestWin>0?"plus":"zero"}`}>{bestWin>0?<ProfitStr n={bestWin}/>:<span style={{fontSize:11,color:"var(--t2)",fontWeight:500}}>未記録</span>}</div>
                </div>
                <div className="sum-sub">
                  <div className="kpi-label">最大負け</div>
                  <div className={`kpi-val sub ${bestLose<0?"minus":"zero"}`}>{bestLose<0?<ProfitStr n={bestLose}/>:<span style={{fontSize:11,color:"var(--t2)",fontWeight:500}}>未記録</span>}</div>
                </div>
              </div>
            </div>
            {chartData.length>=1 ? (
              <div className="graph-card su">
                <div className="graph-title">日別収支</div>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={chartData} margin={{top:8,right:10,left:0,bottom:4}}>
                    <CartesianGrid stroke="#f0ece4" vertical={false}/>
                    <XAxis dataKey="date" tick={{fontSize:10,fill:"#a8a29e"}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
                    <YAxis ticks={calcYTicks(chartData)} domain={["dataMin","dataMax"]} tick={{fontSize:10,fill:"#a8a29e"}} tickLine={false} axisLine={false} width={52} tickFormatter={v=>{const k=v/1000;return v===0?"0":`${k>=0?"+":""}${k.toFixed(0)}k`;}}/>
                    <Tooltip content={<ChartTip/>} cursor={{fill:"rgba(0,0,0,0.04)"}}/>
                    <ReferenceLine y={0} stroke="#a8a29e" strokeWidth={2}/>
                    <Bar dataKey="profit" radius={[5,5,0,0]}>{chartData.map((e,i)=><Cell key={i} fill={e.profit>=0?"#16a34a":"#dc2626"} fillOpacity={0.8}/>)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="empty-card su">
                <div className="empty-ico">📊</div>
                <div className="empty-txt">{records.length===0?"まだ分析データがありません":"この月の記録がありません"}</div>
                <div className="empty-hint">{records.length===0?"収支を記録すると日別グラフと機種別成績が表示されます":"◀ ▶ で他の月を確認できます"}</div>
              </div>
            )}
            {/* 通算成績サマリー */}
            {records.length > 0 && (
              <div style={{
                background:"var(--card)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",
                padding:"14px 16px",marginBottom:"var(--sp-2)",
              }}>
                <div style={{marginBottom:8}}>
                  <span style={{fontSize:11,fontWeight:600,color:"var(--t3)",letterSpacing:"0.06em",textTransform:"uppercase"}}>通算成績</span>
                </div>
                <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"baseline"}}>
                  <span style={{fontSize:13,color:"var(--t2)"}}>{records.length}戦<span style={{marginLeft:4,fontWeight:800,color:"var(--green)"}}>{records.filter(r=>r.profit>0).length}勝</span><span style={{marginLeft:2,fontWeight:800,color:"var(--red)"}}>{records.filter(r=>r.profit<0).length}敗</span></span>
                  <span style={{fontSize:13,color:"var(--t2)"}}>勝率 <span style={{fontWeight:800,color:"var(--orange)"}}>{winRate!=null?`${winRate}%`:"0%"}</span></span>
                  {bestWin>0&&<span style={{fontSize:13,color:"var(--t2)"}}>最高 <span style={{fontWeight:800,color:"var(--green)"}}><ProfitStr n={bestWin}/></span></span>}
                </div>
              </div>
            )}
            <div className="section-title" style={{marginTop:4}}>機種別成績（全期間）</div>
            {machineStats.length===0 ? (
              <div className="empty-card su"><div className="empty-ico">🎯</div><div className="empty-txt">機種データがありません</div><div className="empty-hint">収支を記録すると機種別の成績が表示されます</div></div>
            ) : (
              <div className="machine-table su">
                {(() => {
                  const maxAbs = Math.max(...machineStats.map(m=>Math.abs(m.profit)), 1);
                  return machineStats.map((m,i) => (
                    <div className={`machine-row${i===0?" first":""}`} key={i}>
                      <div className={`machine-rank${i<3?" top":""}`}>{i+1}</div>
                      <div className="machine-info">
                        <div className="machine-name">{m.name}</div>
                        <div className="machine-meta">{m.count}回{i===0?" · 最多収支":""}{ i===machineStats.length-1&&machineStats.length>1?" · 要注意":""}</div>
                      </div>
                      <div className="machine-bar-wrap">
                        <div className={`machine-bar ${m.profit>=0?"plus":"minus"}`} style={{width:`${Math.abs(m.profit)/maxAbs*100}%`}}/>
                      </div>
                      <div className="machine-profit" style={{color:m.profit>0?"var(--green)":m.profit<0?"var(--red)":"var(--t2)"}}><ProfitStr n={m.profit}/></div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        )}

        {/* ═══ LIST ═══ */}
        {tab===3 && (
          <div className="section" style={{paddingTop:14}}>
            {sorted.length===0 && (
              <div className="empty-card su"><div className="empty-ico">🕒</div><div className="empty-txt">まだ履歴がありません</div><div className="empty-hint">実戦結果を記録すると<br/>ここに履歴が表示されます</div></div>
            )}
            {grouped.map(([month, recs]) => {
              const mp  = recs.reduce((s,r)=>s+r.profit,0);
              const exp = listExpanded[month] ?? false;
              const visible = exp ? recs : recs.slice(0, LIST_PAGE_SIZE);
              return (
                <div key={month}>
                  <div className="month-row">
                    <div className="month-label">{fmtMon(month)}</div>
                    <div className={`sum-val ${profitColor(mp)}`} style={{fontSize:16,fontWeight:800,letterSpacing:"-0.5px",lineHeight:1}}><ProfitStr n={mp}/></div>
                  </div>
                  {visible.map((r,i)=><RecCard key={r.id} r={r} delay={i*0.03}/>)}
                  {recs.length > LIST_PAGE_SIZE && (
                    <button className="show-more-btn" onClick={()=>setListExpanded(p=>({...p,[month]:!exp}))}>
                      {exp ? `▲ 折りたたむ` : `▼ もっと見る（残り${recs.length-LIST_PAGE_SIZE}件）`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ ADD / EDIT ═══ */}
        {tab===2 && (
          <div className="section" style={{paddingTop:14}}>
            <div className="form-card su">

              {/* Group 1: 日付 */}
              <div className="form-full">
                <label className="form-label">日付</label>
                <div style={{position:"relative"}}>
                  <input className="form-input form-date" type="date" value={form.date} onChange={e=>handleDateChange(e.target.value)} max="2099-12-31" min="2000-01-01" style={{paddingRight:44}}/>
                  <button type="button" onClick={e=>{e.preventDefault();const inp=e.currentTarget.previousElementSibling;try{inp.showPicker();}catch{inp.focus();}}} style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",padding:4,color:"#D27A2A",display:"flex",alignItems:"center",justifyContent:"center",opacity:0.8,transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0.8} onTouchStart={e=>e.currentTarget.style.opacity=1} onTouchEnd={e=>e.currentTarget.style.opacity=0.8}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  </button>
                </div>
              </div>
              <div className="form-group-sep"/>
              {/* Group 2: 店舗・機種 */}
              <div className="form-full">
                <label className="form-label">🏠 店舗名</label>
                <AutocompleteInput value={form.store} onChange={v=>setForm(p=>({...p,store:v}))} candidates={history.stores} placeholder="〇〇パチンコ" className="form-input"/>
              </div>
              <div className="form-full">
                <label className="form-label" style={{color:"var(--orange)"}}>🎰 機種名</label>
                <AutocompleteInput value={form.machine} onChange={v=>setForm(p=>({...p,machine:v}))} candidates={history.machines} placeholder="〇〇〇" className="form-input"/>
              </div>
              <div className="form-group-sep"/>
              {/* Group 3: 投資・回収 */}
              <div className="form-row">
                <div>
                  <label className="form-label" style={{color:"var(--invest-fg)"}}>💸 投資金額</label>
                  <div style={{position:"relative"}}>
                    <span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",fontSize:15,color:"var(--t3)",fontWeight:600,pointerEvents:"none"}}>¥</span>
                    <input className="form-input" type="number" placeholder="10000" value={form.invest} style={{paddingLeft:28}} onChange={e=>setForm(p=>({...p,invest:e.target.value}))}/>
                  </div>
                </div>
                <div>
                  <label className="form-label" style={{color:"var(--collect-fg)"}}>💰 回収金額</label>
                  <div style={{position:"relative"}}>
                    <span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",fontSize:15,color:"var(--t3)",fontWeight:600,pointerEvents:"none"}}>¥</span>
                    <input className="form-input" type="number" placeholder="15000" value={form.collect} style={{paddingLeft:28}} onChange={e=>setForm(p=>({...p,collect:e.target.value}))}/>
                  </div>
                </div>
              </div>
              <div className={`profit-preview${(form.invest||form.collect)?previewProfit>0?" is-plus":previewProfit<0?" is-minus":" is-zero":""}`}>
                <div className="profit-preview-label">収支（自動計算）</div>
                <div className={`profit-preview-val ${form.invest||form.collect?profitColor(previewProfit):"empty"}`}>
                  {form.invest||form.collect ? <ProfitStr n={previewProfit}/> : "—"}
                </div>
                {(form.invest||form.collect) && (
                  <div className="profit-preview-sub" style={{fontSize:12,fontWeight:700,opacity:1}}>
                    {previewProfit > 0 ? "🎯 プラス！" : previewProfit < 0 ? "次回リベンジ" : "±0 引き分け"}
                  </div>
                )}
              </div>
              <div className="form-full">
                <label className="form-label">メモ（任意）</label>
                <input className="form-input" type="text" placeholder="ボーナス回数など" value={form.memo} onChange={e=>setForm(p=>({...p,memo:e.target.value}))}/>
              </div>
              <button className="submit-btn" onClick={handleSubmit} disabled={!form.date||!form.invest||!form.collect}>
                {saved ? "✓ 保存しました！" : editId ? "更新する" : "記録する"}
              </button>
              {editId && (
                <button onClick={()=>{setEditId(null);setForm(EMPTY_FORM);setTab(3);}}
                  style={{width:"100%",marginTop:8,padding:"10px",background:"none",border:"1px solid var(--border)",borderRadius:"var(--r-md)",color:"var(--t2)",fontFamily:"'Nunito',sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                  キャンセル
                </button>
              )}
            </div>
          </div>
        )}

        {/* ═══ SETTINGS ═══ */}
        {tab===4 && (
          <div className="section" style={{paddingTop:14}}>
            {importMsg && (
              <div style={{background:importMsg.includes("失敗")?"var(--red-l)":"var(--green-l)",border:`1px solid ${importMsg.includes("失敗")?"#fca5a5":"#86efac"}`,borderRadius:"var(--r-md)",padding:"12px 16px",marginBottom:14,fontSize:13,fontWeight:700,color:importMsg.includes("失敗")?"var(--red)":"var(--green)"}}>
                {importMsg}
              </div>
            )}
            {/* 累計データ */}
            {records.length > 0 && (
              <div className="settings-section">
                <div className="settings-title">あなたの記録</div>
                <div className="settings-card">
                  {[
                    {label:"総実戦回数", node:<span>{records.length}回</span>},
                    {label:"通算収支",   node:<span>{profitStr(totalProfit)}</span>, color:totalProfit>0?"var(--green)":totalProfit<0?"var(--red)":"var(--t2)"},
                    {label:"勝率",       node:<span>{winRate!=null?winRate:0}%</span>, color:"var(--orange)"},
                    {label:"平均収支",   node:<span>{profitStr(avgProfit)}</span>, color:avgProfit>0?"var(--green)":avgProfit<0?"var(--red)":"var(--t2)"},
                    {label:"最高勝ち",   node:<span>{bestWin>0?profitStr(bestWin):"—"}</span>, color:"var(--green)"},
                    {label:"最高負け",   node:<span>{bestLose<0?profitStr(bestLose):"—"}</span>, color:"var(--red)"},
                  ].map(({label,node,color})=>(
                    <div className="settings-row" key={label}>
                      <div className="settings-row-label">{label}</div>
                      <div style={{fontSize:15,fontWeight:800,color:color||"var(--t1)",fontFamily:"system-ui,sans-serif",letterSpacing:"-0.3px"}}>{node}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="settings-section">
              <div className="settings-title">データのバックアップ</div>
              <div className="settings-card">
                <div className="settings-row">
                  <div>
                    <div className="settings-row-label">エクスポート</div>
                    <div className="settings-row-sub">実戦記録（全{records.length}件）をJSONファイルとして保存</div>
                  </div>
                  <button className="settings-btn" onClick={handleExport}>書き出し</button>
                </div>
                <div className="settings-row">
                  <div>
                    <div className="settings-row-label">インポート</div>
                    <div className="settings-row-sub">JSONファイルから記録を復元（現在のデータは置き換わります）</div>
                  </div>
                  <button className="settings-btn secondary" onClick={()=>fileInputRef.current?.click()}>読み込み</button>
                  <input ref={fileInputRef} type="file" accept=".json" style={{display:"none"}} onChange={handleImport}/>
                </div>
                {importMsg&&<div style={{padding:"10px 16px",fontSize:12,color:importMsg.startsWith("⚠")?"var(--red)":"var(--green)",fontWeight:600,borderTop:"1px solid var(--border)"}}>{importMsg}</div>}
                <div style={{padding:"10px 16px 12px",fontSize:11,color:"#8a837a",lineHeight:1.6,borderTop:"1px solid var(--border)"}}>ブラウザのデータ削除や端末変更に備えて、定期的なバックアップをおすすめします。</div>
              </div>
            </div>
            <div className="settings-section">
              <div className="settings-title">アプリ情報</div>
              <div className="settings-card">
                <div className="settings-row">
                  <div>
                    <div className="settings-row-label">スロログ 🎰</div>
                    <div className="settings-row-sub">毎日の収支をシンプルに</div>
                  </div>
                  <div style={{fontSize:12,color:"var(--t3)",textAlign:"right",lineHeight:1.8}}>
                    <div>v1.0.0 · TamaFactory</div>
                    <div>2026/06/08</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="settings-section">
              <div className="settings-title" style={{color:"var(--red)"}}>危険な操作</div>
              <div className="settings-card" style={{border:"1.5px solid #FF9B9B",background:"#FFF3F3"}}>
                <div className="settings-row" style={{flexDirection:"column",alignItems:"flex-start",gap:12}}>
                  <div><div className="settings-row-label">データをすべて削除</div><div className="settings-row-sub">{records.length}件の記録をすべて削除します。復元できません。</div></div>
                  <button className="settings-btn danger" style={{alignSelf:"flex-end"}} onClick={()=>{if(window.confirm("すべてのデータを削除しますか？この操作は取り消せません。")){setRecords([]);setTab(0);}}}>削除する</button>
                </div>
              </div>
            </div>
            <div style={{textAlign:"center",padding:"16px 0 8px",fontSize:12,color:"var(--t3)",fontWeight:600}}>
              スロログ v1.0.0
            </div>
          </div>
        )}

        {/* Bottom Nav */}
        <nav className="bnav">
          {NAV.map((n,i)=>(
            <button key={i}
              className={`bnav-btn${tab===i?" on":""}${i===2?" fab":""}`}
              onClick={()=>setTab(i)}>
              {i===2
                ? <><div className="fab-dot"><Icon id={n.id}/></div><span className="bnav-label">記録</span></>
                : <><Icon id={n.id}/>{n.label}</>
              }
            </button>
          ))}
        </nav>

        {/* Delete Confirm Modal */}
        {deleteTarget && createPortal(
          <div className="del-overlay" onClick={()=>setDeleteTarget(null)}>
            <div className="del-modal" onClick={e=>e.stopPropagation()}>
              <div className="del-modal-title">この実戦記録を削除しますか？</div>
              <div className="del-modal-body">「{deleteTarget.machine}」の記録が削除されます。この操作は元に戻せません。</div>
              <div className="del-modal-btns">
                <button className="del-modal-cancel" onClick={()=>setDeleteTarget(null)}>キャンセル</button>
                <button className="del-modal-confirm" onClick={confirmDelete}>削除する</button>
              </div>
            </div>
          </div>,
          document.body
        )}
        {/* Undo Toast */}
        {undoItem && (
          <div className="undo-toast" onMouseEnter={pauseUndoTimer} onMouseLeave={resumeUndoTimer} onTouchStart={pauseUndoTimer}>
            <span>「{undoItem.machine}」を削除しました</span>
            <button className="undo-btn" onClick={handleUndo}>元に戻す</button>
            <button className="undo-close" onClick={()=>{setUndoItem(null);if(undoTimerRef.current)clearTimeout(undoTimerRef.current);}}>✕</button>
          </div>
        )}
      </div>
    </>
  );
}
