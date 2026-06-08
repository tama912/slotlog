import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, CartesianGrid
} from "recharts";

/* ─── storage ─── */
const STORE        = "surorogue_v1";
const HISTORY_STORE = "surorogue_history";
const load         = () => { try { return JSON.parse(localStorage.getItem(STORE) || "[]"); } catch { return []; } };
const save         = (d) => localStorage.setItem(STORE, JSON.stringify(d));
const loadHistory  = () => { try { return JSON.parse(localStorage.getItem(HISTORY_STORE) || '{"stores":[],"machines":[]}'); } catch { return {stores:[],machines:[]}; } };
const saveHistory  = (h) => localStorage.setItem(HISTORY_STORE, JSON.stringify(h));

/* ─── helpers ─── */
const todayStr    = () => new Date().toISOString().slice(0, 10);
const thisMonth   = () => new Date().toISOString().slice(0, 7);
const fmtDate     = (s) => new Date(s + "T00:00:00").toLocaleDateString("ja-JP", { month:"numeric", day:"numeric", weekday:"short" });
const fmtMon      = (s) => new Date(s + "-01T00:00:00").toLocaleDateString("ja-JP", { year:"numeric", month:"long" });
const addMonth    = (ym, n) => { const [y,m]=ym.split("-").map(Number); const d=new Date(y,m-1+n,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const profitColor = (n) => n > 0 ? "plus" : n < 0 ? "minus" : "zero";
const roundY      = (n) => Math.round(n / 100) * 100;
const profitStr   = (n) => { const r=roundY(n); return r>0?`+${r.toLocaleString()}円`:r<0?`-${Math.abs(r).toLocaleString()}円`:"±0円"; };
const calcYTicks  = (data) => {
  if (!data.length) return [0];
  const vals=data.map(d=>d.profit);
  const mn=Math.min(...vals,0), mx=Math.max(...vals,0);
  const range=mx-mn||1000, rawStep=range/4;
  const mag=Math.pow(10,Math.floor(Math.log10(Math.abs(rawStep)||1)));
  const step=Math.ceil(rawStep/mag)*mag||1000;
  const lo=Math.floor(mn/step)*step, hi=Math.ceil(mx/step)*step;
  const ticks=[];
  for(let v=lo;v<=hi+step*0.01;v+=step) ticks.push(Math.round(v));
  return [...new Set(ticks)];
};

/* ─── CSS ─── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Nunito+Sans:wght@400;600&display=swap');
:root{
  --bg:#fafaf9;--bg2:#f4f4f0;--card:#ffffff;
  --border:#e8e4dc;--border2:#d4cfc5;
  --t1:#1c1917;--t2:#78716c;--t3:#a8a29e;
  --orange:#f97316;--orange-l:#fff7ed;--orange-m:#fed7aa;
  --green:#16a34a;--green-l:#f0fdf4;
  --red:#dc2626;--red-l:#fef2f2;
  --r-sm:10px;--r-md:16px;--r-lg:22px;
}
*{box-sizing:border-box;margin:0;padding:0}
input,select,textarea{width:100%;max-width:100%;min-width:0;box-sizing:border-box}
body{background:var(--bg);color:var(--t1);font-family:'Nunito Sans',sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
.app{max-width:430px;margin:0 auto;min-height:100vh;overflow-x:hidden;padding-bottom:88px}
.header{background:var(--card);border-bottom:1px solid var(--border);padding:18px 20px 14px;position:sticky;top:0;z-index:50}
.logo{font-family:'Nunito',sans-serif;font-size:22px;font-weight:800;color:var(--t1);letter-spacing:-0.3px}
.logo span{color:var(--orange)}
.logo-sub{font-size:12px;color:var(--orange);font-weight:600;margin-top:2px}
.kpi-grid{display:flex;flex-direction:column;gap:10px;padding:14px 14px 0}
/* hero: 今月収支 — full width, large */
.kpi{background:var(--card);border-radius:var(--r-md);padding:14px 16px;border:1px solid var(--border)}
.kpi.hero{background:var(--orange-l);border-color:var(--orange-m);padding:18px 20px;border-radius:var(--r-lg)}
.kpi-sub-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.kpi-sub{background:var(--card);border-radius:var(--r-md);padding:10px 10px;border:1px solid var(--border);overflow:hidden}
.kpi-label{font-size:10px;color:var(--t3);font-weight:700;letter-spacing:0.04em;text-transform:uppercase;margin-bottom:3px}
.kpi-hero-label{font-size:12px;color:var(--orange);font-weight:700;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:8px}
/* hero value: bigger */
.kpi-val{font-family:'Nunito',sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;line-height:1}
.kpi-val.hero{font-size:34px;letter-spacing:-1px}
.kpi-val.sub{font-size:15px;letter-spacing:-0.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi-val.plus{color:var(--green)}.kpi-val.minus{color:var(--red)}.kpi-val.zero{color:var(--t2)}.kpi-val.orange{color:var(--orange)}
.section{padding:14px 14px 0}
.section-title{font-size:13px;font-weight:700;color:var(--t3);padding:14px 0 8px;letter-spacing:0.04em;text-transform:uppercase}
.month-nav{display:flex;align-items:center;justify-content:space-between;background:var(--card);border:1px solid var(--border);border-radius:var(--r-md);padding:10px 14px;margin-bottom:14px}
.month-nav-btn{background:none;border:none;cursor:pointer;padding:10px 16px;font-size:18px;color:var(--t2);border-radius:8px;line-height:1;transition:background .12s;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center}
.month-nav-btn:hover{background:var(--bg2)}.month-nav-btn:disabled{color:var(--border2);cursor:default}
.month-nav-label{font-family:'Nunito',sans-serif;font-size:15px;font-weight:800;color:var(--t1)}
.graph-card{background:var(--card);border-radius:var(--r-lg);border:1px solid var(--border);padding:16px 8px 8px;margin-bottom:14px;overflow:hidden}
.graph-title{font-size:13px;font-weight:700;color:var(--t2);margin-bottom:12px;padding:0 10px}
.ctip{background:#fff;border:1px solid var(--border);border-radius:10px;padding:8px 12px;font-family:'Nunito',sans-serif;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.1)}
.ctip-date{color:var(--t3);font-size:11px;margin-bottom:2px}
.sum-grid{display:flex;flex-direction:column;gap:10px;margin-bottom:14px}
.sum-cell{background:var(--card);border:1px solid var(--border);border-radius:var(--r-md);padding:14px 16px}
.sum-cell.accent{background:var(--orange-l);border-color:var(--orange-m);padding:18px 20px;border-radius:var(--r-lg)}
.sum-sub-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.sum-sub{background:var(--card);border:1px solid var(--border);border-radius:var(--r-md);padding:12px 14px}
.sum-label{font-size:11px;font-weight:700;color:var(--t3);letter-spacing:0.05em;text-transform:uppercase;margin-bottom:5px}
.sum-val{font-family:'Nunito',sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px}
.sum-val.plus{color:var(--green)}.sum-val.minus{color:var(--red)}.sum-val.zero{color:var(--t2)}.sum-val.orange{color:var(--orange)}
.machine-table{background:var(--card);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;margin-bottom:14px}
/* ranking rows */
.machine-row{display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--border)}
.machine-row:last-child{border-bottom:none}
.machine-rank{font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;color:var(--t3);width:20px;flex-shrink:0;text-align:center}
.machine-rank.top{color:var(--orange)}
.machine-info{flex:1;min-width:0}
.machine-name{font-size:14px;font-weight:700;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.machine-meta{font-size:11px;color:var(--t3);margin-top:1px}
/* bar */
.machine-bar-wrap{flex:1;max-width:80px;height:6px;background:var(--bg2);border-radius:3px;overflow:hidden}
.machine-bar{height:100%;border-radius:3px;transition:width .4s ease}
.machine-bar.plus{background:var(--green)}.machine-bar.minus{background:var(--red)}
.machine-profit{font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;flex-shrink:0;text-align:right;min-width:72px}

/* record card */
.rec-item{background:var(--card);border:1px solid var(--border);border-radius:var(--r-md);padding:12px 14px 12px 18px;margin-bottom:8px;position:relative}
.rec-item::before{content:'';position:absolute;left:0;top:8px;bottom:8px;width:4px;border-radius:0 3px 3px 0;background:var(--border2)}
.rec-item.plus::before{background:var(--green)}.rec-item.minus::before{background:var(--red)}
/* top row: 機種名(主役) + 収支 */
.rec-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5px;gap:8px}
.rec-header-left{flex:1;min-width:0}
.rec-machine{font-size:16px;font-weight:800;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;line-height:1.2;margin-bottom:2px}
.rec-store{font-size:11px;color:var(--t3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.rec-profit{font-family:'Nunito',sans-serif;font-size:20px;font-weight:800;letter-spacing:-0.5px;white-space:nowrap;flex-shrink:0}
.rec-profit.plus{color:var(--green)}.rec-profit.minus{color:var(--red)}.rec-profit.zero{color:var(--t2)}
/* bottom row: 日付 + 投資/回収 + menu */
.rec-footer{display:flex;align-items:center;gap:8px;margin-top:7px}
.rec-date{font-size:11px;color:var(--t3);font-weight:600;flex-shrink:0}
.rec-amounts{display:flex;gap:6px;flex:1}
.rec-amt{font-size:11px;font-weight:700;padding:3px 8px;border-radius:5px;display:inline-flex;align-items:center;gap:3px;white-space:nowrap}
.rec-amt.invest{background:#fef3ec;color:#c2540a}
.rec-amt.collect{background:#f0fdf4;color:#15803d}
.rec-amt-icon{font-size:10px;opacity:0.7}
.rec-memo{font-size:11px;color:var(--t3);margin-top:6px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;max-height:1.5em;line-height:1.4}
.rec-menu-wrap{position:relative;flex-shrink:0;margin-left:8px}
.rec-menu-btn{background:none;border:none;cursor:pointer;color:var(--t3);font-size:18px;padding:8px 10px;border-radius:8px;line-height:1;transition:background .12s;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center}
.rec-menu-btn:hover{background:var(--bg2);color:var(--t2)}
.rec-menu-dropdown{position:absolute;right:0;top:100%;margin-top:4px;background:var(--card);border:1px solid var(--border);border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.12);z-index:200;overflow:hidden;min-width:110px}
.rec-menu-item{display:block;width:100%;text-align:left;padding:10px 14px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;background:none;border:none;cursor:pointer;transition:background .12s}
.rec-menu-item:first-child{border-bottom:1px solid var(--border)}
.rec-menu-item.edit{color:var(--t1)}.rec-menu-item.edit:hover{background:var(--orange-l);color:var(--orange)}
.rec-menu-item.del{color:var(--red)}.rec-menu-item.del:hover{background:var(--red-l)}
.month-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0}
.month-label{font-size:12px;font-weight:700;color:var(--t3);letter-spacing:0.06em;text-transform:uppercase}

/* form */
.form-card{background:var(--card);border-radius:var(--r-lg);border:1px solid var(--border);padding:20px;margin-bottom:14px}
.form-title{font-family:'Nunito',sans-serif;font-size:16px;font-weight:800;color:var(--t1);margin-bottom:18px}
.form-row{display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:12px;width:100%;box-sizing:border-box}
.form-full{margin-bottom:12px}
.form-label{display:block;font-size:11px;font-weight:700;color:var(--t2);letter-spacing:0.05em;text-transform:uppercase;margin-bottom:5px}
.form-input-wrap{position:relative}
.form-input{width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:11px 13px;background:var(--bg2);border:1.5px solid var(--border);border-radius:var(--r-sm);color:var(--t1);font-family:'Nunito Sans',sans-serif;font-size:16px;outline:none;transition:border-color .15s;-moz-appearance:textfield}
.form-input::-webkit-outer-spin-button,.form-input::-webkit-inner-spin-button{-webkit-appearance:none}
.form-input:focus{border-color:var(--orange);background:#fff}
.form-row>*,.form-full{width:100%;max-width:100%;min-width:0;box-sizing:border-box;overflow:hidden}
.form-card,.form-full{width:100%;max-width:100%;box-sizing:border-box}
.form-input::placeholder{color:var(--t3)}
/* autocomplete dropdown */
.autocomplete{position:absolute;top:100%;left:0;right:0;background:var(--card);border:1px solid var(--border);border-radius:0 0 var(--r-sm) var(--r-sm);box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:100;max-height:160px;overflow-y:auto}
.autocomplete-item{padding:12px 13px;font-size:14px;color:var(--t1);cursor:pointer;font-weight:600;border-bottom:1px solid var(--border);min-height:44px;display:flex;align-items:center}
.autocomplete-item:last-child{border-bottom:none}
.autocomplete-item:hover{background:var(--orange-l);color:var(--orange)}
.profit-preview{
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  border-radius:var(--r-md);padding:18px 16px;margin-bottom:12px;
  border:2px solid var(--border);background:var(--card);
  transition:border-color .25s, background .25s;
  text-align:center;min-height:80px;
}
.profit-preview.is-plus{background:var(--green-l);border-color:#86efac}
.profit-preview.is-minus{background:var(--red-l);border-color:#fca5a5}
.profit-preview.is-zero{background:#f5f5f3;border-color:var(--border2)}
.profit-preview-val.empty{color:var(--t3);font-size:28px;letter-spacing:0}
.profit-preview-sub{font-size:12px;font-weight:700;margin-top:6px;opacity:0.75}
.profit-preview-label{font-size:10px;font-weight:700;color:var(--t3);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px}
.profit-preview-val{font-family:'Nunito',sans-serif;font-size:36px;font-weight:800;letter-spacing:-1px;line-height:1}
.profit-preview-val.plus{color:var(--green)}.profit-preview-val.minus{color:var(--red)}.profit-preview-val.zero{color:var(--t2)}
.submit-btn{width:100%;padding:14px;background:var(--orange);color:#fff;font-family:'Nunito',sans-serif;font-size:15px;font-weight:800;border:none;border-radius:var(--r-md);cursor:pointer;transition:background .15s,transform .1s}
.submit-btn:hover{background:#ea6c0a}.submit-btn:active{transform:scale(0.98)}.submit-btn:disabled{background:var(--border2);cursor:default;transform:none}
.edit-badge{display:inline-block;background:var(--orange-l);color:var(--orange);font-size:11px;font-weight:700;border-radius:6px;padding:2px 8px;margin-left:8px;border:1px solid var(--orange-m)}

/* settings */
.settings-section{margin-bottom:20px}
.settings-title{font-size:13px;font-weight:700;color:var(--t3);letter-spacing:0.06em;text-transform:uppercase;margin-bottom:10px}
.settings-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden}
.settings-row{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--border)}
.settings-row:last-child{border-bottom:none}
.settings-row-label{font-size:14px;font-weight:700;color:var(--t1)}
.settings-row-sub{font-size:12px;color:var(--t3);margin-top:2px}
.settings-btn{background:var(--orange);color:#fff;border:none;border-radius:8px;padding:10px 18px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;transition:background .15s;min-height:44px}
.settings-btn:hover{background:#ea6c0a}
.settings-btn.secondary{background:var(--bg2);color:var(--t2);border:1px solid var(--border)}
.settings-btn.secondary:hover{background:var(--border)}
.settings-btn.danger{background:var(--red-l);color:var(--red);border:1px solid #fca5a5}
.settings-btn.danger:hover{background:var(--red);color:#fff}
.settings-info{font-size:13px;color:var(--t2);background:var(--bg2);border-radius:var(--r-md);padding:12px 16px;margin-bottom:12px;line-height:1.6}

/* undo toast */
.undo-toast{position:fixed;bottom:88px;left:50%;transform:translateX(-50%);background:#1c1917;color:#fff;border-radius:999px;padding:10px 20px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;display:flex;align-items:center;gap:12px;box-shadow:0 4px 20px rgba(0,0,0,.3);z-index:300;white-space:nowrap;animation:toastIn .25s ease}
.undo-btn{background:var(--orange);color:#fff;border:none;border-radius:20px;padding:8px 16px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;cursor:pointer}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}

/* onboarding */
.onboard-card{background:linear-gradient(135deg,var(--orange-l),#fff);border:1.5px solid var(--orange-m);border-radius:var(--r-lg);padding:20px;margin-bottom:14px}
.onboard-title{font-family:'Nunito',sans-serif;font-size:16px;font-weight:800;color:var(--t1);margin-bottom:14px}
.onboard-steps{display:flex;flex-direction:column;gap:10px;margin-bottom:16px}
.onboard-step{display:flex;align-items:flex-start;gap:12px}
.onboard-num{width:26px;height:26px;border-radius:50%;background:var(--orange);color:#fff;font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.onboard-text{font-size:13px;color:var(--t2);line-height:1.5;padding-top:3px}
.onboard-text strong{color:var(--t1);font-weight:700}
.onboard-btn{width:100%;padding:12px;background:var(--orange);color:#fff;border:none;border-radius:var(--r-md);font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer}

/* show-more */
.show-more-btn{width:100%;padding:12px;background:none;border:1px solid var(--border);border-radius:var(--r-md);font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;color:var(--t2);cursor:pointer;margin-bottom:9px;transition:background .12s;min-height:44px}
.show-more-btn:hover{background:var(--bg2)}

/* empty */
.empty-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r-md);padding:24px 20px;text-align:center}
.empty-ico{font-size:32px;margin-bottom:8px}.empty-txt{font-size:14px;color:var(--t2);font-weight:600}.empty-hint{font-size:12px;color:var(--t3);margin-top:4px}

/* bnav */
.bnav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:430px;z-index:100;background:rgba(255,255,255,0.96);backdrop-filter:blur(20px);border-top:1px solid var(--border);display:flex;padding:8px 0 22px}
.bnav-btn{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;background:none;border:none;cursor:pointer;padding:6px 0;color:var(--t3);font-family:'Nunito',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.04em;transition:color .15s;-webkit-tap-highlight-color:transparent}
.bnav-btn.on{color:var(--orange)}.bnav-btn svg{width:22px;height:22px;stroke-width:2}

@keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.su{animation:slideUp .28s ease both}

`;

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
    list: <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>,
    add:  <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></>,
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
    setRecords(prev => prev.filter(r => r.id !== id));
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoItem(rec);
    undoTimerRef.current = setTimeout(() => setUndoItem(null), 5000);
  }, [records]);

  const handleUndo = () => {
    if (!undoItem) return;
    setRecords(prev => [...prev, undoItem]);
    setUndoItem(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  };

  /* ── submit ── */
  const handleSubmit = () => {
    const inv=parseInt(form.invest), col=parseInt(form.collect);
    if(!form.date||isNaN(inv)||isNaN(col)) return;
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
    setSaved(true); setTimeout(()=>{ setSaved(false); setTab(2); },1200);
  };

  const startEdit = (r) => {
    setEditId(r.id);
    setForm({date:r.date,store:r.store,machine:r.machine,invest:String(r.invest),collect:String(r.collect),memo:r.memo||""});
    setTab(3);
  };

  const handleExport = () => {
    const blob=new Blob([JSON.stringify(records,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a");
    a.href=url; a.download=`surorogue_backup_${todayStr()}.json`; a.click(); URL.revokeObjectURL(url);
  };
  const handleImport = (e) => {
    const file=e.target.files?.[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=(ev)=>{ try { const data=JSON.parse(ev.target.result); if(!Array.isArray(data)) throw new Error(); setRecords(data); setImportMsg(`${data.length}件のデータを読み込みました`); setTimeout(()=>setImportMsg(""),3000); } catch { setImportMsg("読み込みに失敗しました"); setTimeout(()=>setImportMsg(""),4000); } };
    reader.readAsText(file); e.target.value="";
  };

  /* ── RecCard ── */
  const RecCard = ({ r, delay=0 }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    return (
      <div className={`rec-item ${profitColor(r.profit)} su`} style={{animationDelay:`${delay}s`}} onClick={()=>menuOpen&&setMenuOpen(false)}>
        {/* 上段: 機種名（主役）＋収支 */}
        <div className="rec-header">
          <div className="rec-header-left">
            <div className="rec-machine" title={r.machine}>{r.machine}</div>
            <div className="rec-store" title={r.store}>{r.store}</div>
          </div>
          <div className={`rec-profit ${profitColor(r.profit)}`}>{profitStr(r.profit)}</div>
        </div>
        {/* 下段: 日付・投資/回収・メニュー */}
        <div className="rec-footer">
          <div className="rec-date">{fmtDate(r.date)}</div>
          <div className="rec-amounts">
            <div className="rec-amt invest"><span className="rec-amt-icon">↓</span>¥{r.invest.toLocaleString()}</div>
            <div className="rec-amt collect"><span className="rec-amt-icon">↑</span>¥{r.collect.toLocaleString()}</div>
          </div>
          <div className="rec-menu-wrap" style={{marginLeft:"auto"}}>
            <button className="rec-menu-btn" onClick={e=>{e.stopPropagation();setMenuOpen(o=>!o);}}>⋯</button>
            {menuOpen && (
              <div className="rec-menu-dropdown">
                <button className="rec-menu-item edit" onClick={e=>{e.stopPropagation();setMenuOpen(false);startEdit(r);}}>✏️ 編集</button>
                <button className="rec-menu-item del"  onClick={e=>{e.stopPropagation();setMenuOpen(false);handleDelete(r.id);}}>🗑️ 削除</button>
              </div>
            )}
          </div>
        </div>
        {r.memo && <div className="rec-memo">{r.memo}</div>}
      </div>
    );
  };

  const NAV = [{id:"home",label:"ホーム"},{id:"graph",label:"グラフ"},{id:"list",label:"記録"},{id:"add",label:"追加"},{id:"gear",label:"設定"}];

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="header">
          {tab === 0 ? (
            <>
              <div className="logo">スロ<span>ログ</span> 🎰</div>
              <div className="logo-sub">今日も収支を記録しよう</div>
            </>
          ) : (
            <>
              <div className="logo" style={{fontSize:18}}>
                {["","収支分析","実戦履歴","収支を記録","設定"][tab]}
              </div>
              <div className="logo-sub">
                {["","日別グラフと機種別成績","過去の実戦記録","今日の収支を入力","データ管理とアプリ情報"][tab]}
              </div>
            </>
          )}
        </div>

        {/* ═══ HOME ═══ */}
        {tab===0 && (
          <>
            <div className="kpi-grid">
              {/* Hero: 今月収支 */}
              <div className="kpi hero">
                <div className="kpi-hero-label">今月の収支</div>
                <div className={`kpi-val hero ${profitColor(monthProfit)}`}>{profitStr(monthProfit)}</div>
              </div>
              {/* Sub row: 総収支・勝率・実戦回数 */}
              <div className="kpi-sub-row">
                <div className="kpi-sub">
                  <div className="kpi-label">平均収支</div>
                  <div className={`kpi-val sub ${profitColor(avgProfit)}`}>{profitStr(avgProfit)}</div>
                </div>
                <div className="kpi-sub">
                  <div className="kpi-label">勝率</div>
                  <div className="kpi-val sub orange">{winRate!=null?`${winRate}%`:"0%"}</div>
                </div>
                <div className="kpi-sub">
                  <div className="kpi-label">実戦</div>
                  <div className="kpi-val sub orange">{records.length}<span style={{fontSize:12,marginLeft:1,fontWeight:700}}>回</span></div>
                </div>
              </div>
            </div>
            <div className="section">
              {records.length===0 ? (
                /* ── 初回ガイド ── */
                <div className="onboard-card su">
                  <div className="onboard-title">🎰 スロログへようこそ！</div>
                  <div className="onboard-steps">
                    <div className="onboard-step">
                      <div className="onboard-num">1</div>
                      <div className="onboard-text"><strong>「追加」タブ</strong>をタップして、日付・店舗・機種・金額を入力</div>
                    </div>
                    <div className="onboard-step">
                      <div className="onboard-num">2</div>
                      <div className="onboard-text">投資・回収を入れると<strong>収支が自動計算</strong>されます</div>
                    </div>
                    <div className="onboard-step">
                      <div className="onboard-num">3</div>
                      <div className="onboard-text">記録が増えると<strong>グラフと機種別成績</strong>が表示されます</div>
                    </div>
                  </div>
                  <button className="onboard-btn" onClick={()=>setTab(3)}>最初の収支を記録する →</button>
                </div>
              ) : (
                <>
                  {chartData.length>=2 && (
                    <div className="graph-card su">
                      <div className="graph-title">直近の収支推移</div>
                      <ResponsiveContainer width="100%" height={110}>
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
                  <div className="section-title">最近の実戦</div>
                  {sorted.slice(0,3).map((r,i)=><RecCard key={r.id} r={r} delay={i*0.05}/>)}
                  {sorted.length>3 && (
                    <div style={{textAlign:"center",paddingBottom:8}}>
                      <button onClick={()=>setTab(2)} style={{background:"none",border:"1px solid var(--border)",borderRadius:"var(--r-sm)",padding:"8px 20px",fontSize:13,color:"var(--t2)",fontWeight:700,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>
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
                <div className={`kpi-val hero ${profitColor(viewMonthProfit)}`}>{profitStr(viewMonthProfit)}</div>
              </div>
              {/* Sub row */}
              <div className="sum-sub-row">
                <div className="sum-sub">
                  <div className="kpi-label">総収支</div>
                  <div className={`kpi-val sub ${profitColor(totalProfit)}`}>{profitStr(totalProfit)}</div>
                </div>
                <div className="sum-sub">
                  <div className="kpi-label">勝率</div>
                  <div className="kpi-val sub orange">{viewMonthWin!=null?`${viewMonthWin}%`:"0%"}</div>
                </div>
                <div className="sum-sub">
                  <div className="kpi-label">実戦</div>
                  <div className="kpi-val sub orange">{viewMonthRecs.length}<span style={{fontSize:12,marginLeft:1,fontWeight:700}}>回</span></div>
                </div>
              </div>
            </div>
            {chartData.length>=1 ? (
              <div className="graph-card su">
                <div className="graph-title">日別収支</div>
                <ResponsiveContainer width="100%" height={155}>
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
            <div className="section-title" style={{marginTop:4}}>機種別成績（全期間）</div>
            {machineStats.length===0 ? (
              <div className="empty-card su"><div className="empty-ico">🎯</div><div className="empty-txt">機種データがありません</div><div className="empty-hint">収支を記録すると機種別の成績が表示されます</div></div>
            ) : (
              <div className="machine-table su">
                {(() => {
                  const maxAbs = Math.max(...machineStats.map(m=>Math.abs(m.profit)), 1);
                  return machineStats.map((m,i) => (
                    <div className="machine-row" key={i}>
                      <div className={`machine-rank${i<3?" top":""}`}>{i+1}</div>
                      <div className="machine-info">
                        <div className="machine-name">{m.name}</div>
                        <div className="machine-meta">{m.count}回</div>
                      </div>
                      <div className="machine-bar-wrap">
                        <div className={`machine-bar ${m.profit>=0?"plus":"minus"}`} style={{width:`${Math.abs(m.profit)/maxAbs*100}%`}}/>
                      </div>
                      <div className="machine-profit" style={{color:m.profit>0?"var(--green)":m.profit<0?"var(--red)":"var(--t2)"}}>{profitStr(m.profit)}</div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        )}

        {/* ═══ LIST ═══ */}
        {tab===2 && (
          <div className="section" style={{paddingTop:14}}>
            {sorted.length===0 && (
              <div className="empty-card su"><div className="empty-ico">📋</div><div className="empty-txt">記録がありません</div><div className="empty-hint">追加タブから収支を記録してください</div></div>
            )}
            {grouped.map(([month, recs]) => {
              const mp  = recs.reduce((s,r)=>s+r.profit,0);
              const exp = listExpanded[month] ?? false;
              const visible = exp ? recs : recs.slice(0, LIST_PAGE_SIZE);
              return (
                <div key={month}>
                  <div className="month-row">
                    <div className="month-label">{fmtMon(month)}</div>
                    <div className={`sum-val ${profitColor(mp)}`} style={{fontSize:14}}>{profitStr(mp)}</div>
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
        {tab===3 && (
          <div className="section" style={{paddingTop:14}}>
            <div className="form-card su">
              <div className="form-title">
                {editId ? <>編集<span className="edit-badge">修正中</span></> : "🎰 収支を記録"}
              </div>
              <div className="form-row">
                <div>
                  <label className="form-label">日付</label>
                  <input className="form-input" type="text" inputMode="numeric" placeholder="例: 2026-06-08" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))} maxLength={10} pattern="\d{4}-\d{2}-\d{2}"/>
                </div>
                <div>
                  <label className="form-label">店舗名</label>
                  <AutocompleteInput value={form.store} onChange={v=>setForm(p=>({...p,store:v}))} candidates={history.stores} placeholder="〇〇パチンコ" className="form-input"/>
                </div>
              </div>
              <div className="form-full">
                <label className="form-label">機種名</label>
                <AutocompleteInput value={form.machine} onChange={v=>setForm(p=>({...p,machine:v}))} candidates={history.machines} placeholder="〇〇〇" className="form-input"/>
              </div>
              <div className="form-row">
                <div>
                  <label className="form-label">投資金額 (円)</label>
                  <input className="form-input" type="number" placeholder="10000" value={form.invest} onChange={e=>setForm(p=>({...p,invest:e.target.value}))}/>
                </div>
                <div>
                  <label className="form-label">回収金額 (円)</label>
                  <input className="form-input" type="number" placeholder="15000" value={form.collect} onChange={e=>setForm(p=>({...p,collect:e.target.value}))}/>
                </div>
              </div>
              <div className={`profit-preview${(form.invest||form.collect)?previewProfit>0?" is-plus":previewProfit<0?" is-minus":" is-zero":""}`}>
                <div className="profit-preview-label">収支（自動計算）</div>
                <div className={`profit-preview-val ${form.invest||form.collect?profitColor(previewProfit):"empty"}`}>
                  {form.invest||form.collect ? profitStr(previewProfit) : "—"}
                </div>
                {(form.invest||form.collect) && (
                  <div className="profit-preview-sub">
                    {previewProfit > 0 ? "✨ 今日はプラスです！" : previewProfit < 0 ? "💸 マイナスです" : "±0円 引き分け"}
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
                <button onClick={()=>{setEditId(null);setForm(EMPTY_FORM);setTab(2);}}
                  style={{width:"100%",marginTop:8,padding:"10px",background:"none",border:"1px solid var(--border)",borderRadius:"var(--r-sm)",color:"var(--t2)",fontFamily:"'Nunito',sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>
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
            <div className="settings-section">
              <div className="settings-title">データのバックアップ</div>
              <div className="settings-info">機種変更や端末移行時のデータバックアップ用です。</div>
              <div className="settings-card">
                <div className="settings-row">
                  <div><div className="settings-row-label">データをエクスポート</div><div className="settings-row-sub">全 <strong style={{color:"var(--orange)"}}>{records.length}</strong> 件をJSONで保存</div></div>
                  <button className="settings-btn" onClick={handleExport}>書き出し</button>
                </div>
                <div className="settings-row">
                  <div><div className="settings-row-label">データをインポート</div><div className="settings-row-sub">JSONファイルから読み込み（上書き）</div></div>
                  <button className="settings-btn secondary" onClick={()=>fileInputRef.current?.click()}>読み込み</button>
                  <input ref={fileInputRef} type="file" accept=".json" style={{display:"none"}} onChange={handleImport}/>
                </div>
              </div>
            </div>
            <div className="settings-section">
              <div className="settings-title">アプリ情報</div>
              <div className="settings-card">
                <div className="settings-row">
                  <div>
                    <div className="settings-row-label">スロログ 🎰</div>
                    <div className="settings-row-sub">スロット収支をシンプルに記録</div>
                  </div>
                </div>
                <div className="settings-row">
                  <div><div className="settings-row-label">バージョン</div></div>
                  <div style={{fontSize:14,fontWeight:700,color:"var(--t2)"}}>1.0.0</div>
                </div>
                <div className="settings-row">
                  <div><div className="settings-row-label">開発者</div></div>
                  <div style={{fontSize:14,fontWeight:700,color:"var(--t2)"}}>TamaFactory</div>
                </div>
                <div className="settings-row">
                  <div><div className="settings-row-label">最終更新</div></div>
                  <div style={{fontSize:14,fontWeight:700,color:"var(--t2)"}}>2026/06/08</div>
                </div>
              </div>
            </div>
            <div className="settings-section">
              <div className="settings-title" style={{color:"var(--red)"}}>危険な操作</div>
              <div className="settings-card" style={{border:"1px solid #fca5a5",background:"var(--red-l)"}}>
                <div className="settings-row">
                  <div><div className="settings-row-label">データをすべて削除</div><div className="settings-row-sub">この操作は取り消せません</div></div>
                  <button className="settings-btn danger" onClick={()=>{if(window.confirm("すべてのデータを削除しますか？この操作は取り消せません。")){setRecords([]);setTab(0);}}}>削除</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Nav */}
        <nav className="bnav">
          {NAV.map((n,i)=>(
            <button key={i} className={`bnav-btn${tab===i?" on":""}`} onClick={()=>setTab(i)}>
              <Icon id={n.id}/>{n.label}
            </button>
          ))}
        </nav>

        {/* Undo Toast */}
        {undoItem && (
          <div className="undo-toast">
            <span>「{undoItem.machine}」を削除しました</span>
            <button className="undo-btn" onClick={handleUndo}>元に戻す</button>
          </div>
        )}
      </div>
    </>
  );
}
