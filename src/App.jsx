import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
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
  --sp-1:8px;--sp-2:16px;--sp-3:24px;--sp-4:32px;
  --bg:#f4f3f0;--bg2:#edecea;--card:#ffffff;
  --t1:#18120e;--t2:#6b6560;--t3:#b0aca8;
  --border:rgba(0,0,0,0.09);
  --orange:#f97316;--orange-l:#fff7ed;--orange-m:#fed7aa;
  --invest-bg:#fef3ec;--invest-fg:#c2540a;
  --collect-bg:#f0fdf4;--collect-fg:#15803d;
  --green-border:#86efac;--red-border:#fca5a5;
  --orange-hover:#ea6c0a;
  --green:#15803d;--green-l:#f0fdf4;
  --red:#dc2626;--red-l:#fef2f2;
  --r-md:12px;--r-lg:18px;
  --sh:0 1px 2px rgba(0,0,0,0.06),0 0 1px rgba(0,0,0,0.03);
  --sh-hero:0 2px 6px rgba(249,115,22,0.07),0 1px 2px rgba(0,0,0,0.02);
}
*{box-sizing:border-box;margin:0;padding:0}
input,select,textarea{width:100%;max-width:100%;min-width:0;box-sizing:border-box}
body{background:#e8e4de;color:var(--t1);font-family:'Nunito Sans',sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
.app{max-width:100%;width:100%;margin:0 auto;min-height:100vh;overflow-x:hidden;padding-bottom:88px}
.header{background:#fce4be;border-bottom:none;padding:0;position:sticky;top:0;z-index:50;overflow:hidden;line-height:0;height:110px}
.header-banner{width:100%;height:100%;object-fit:cover;object-position:center;display:block}
.header-logo{display:block;height:88px;width:auto;max-width:320px;object-fit:contain}

.kpi-grid{display:flex;flex-direction:column;gap:8px;padding:10px var(--sp-2) 0}
/* hero: 今月収支 — full width, large */
.kpi{background:var(--card);border-radius:var(--r-md);padding:14px 16px;border:1px solid var(--border)}
.kpi.hero{background:var(--orange-l);border-color:var(--orange-m);padding:16px 22px 14px;border-radius:var(--r-lg);box-shadow:var(--sh-hero)}
.kpi-sub-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.kpi-sub{background:var(--card);border-radius:var(--r-md);padding:6px 9px 5px;border:1px solid var(--border);overflow:hidden;box-shadow:var(--sh)}
.kpi-icon-wrap{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:1px;flex-shrink:0}
.kpi-icon-wrap svg{width:16px;height:16px;stroke-width:1.8}
.kpi-label{font-size:11px;color:var(--t3);font-weight:600;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:2px}
.kpi-hero-label{font-size:10px;color:var(--t3);font-weight:600;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:6px}
/* hero value: bigger */
.kpi-val{font-family:'Nunito',sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;line-height:1}
.kpi-val.hero{font-size:36px;font-weight:800;letter-spacing:-1.5px;line-height:1}
.kpi-val.sub{font-size:16px;font-weight:800;letter-spacing:-0.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1}
.kpi-val.plus{color:var(--green)}.kpi-val.minus{color:var(--red)}.kpi-val.zero{color:var(--t2)}.kpi-val.orange{color:var(--orange)}
.section{padding:var(--sp-2) var(--sp-2) 0}
.section-title{font-size:11px;font-weight:700;color:#6e6760;padding:16px 0 4px;letter-spacing:0.06em;text-transform:uppercase}
.month-nav{display:flex;align-items:center;justify-content:space-between;background:var(--card);border:1px solid var(--border);border-radius:var(--r-md);padding:12px 16px;margin-bottom:var(--sp-2)}
.month-nav-btn{background:none;border:none;cursor:pointer;padding:10px 16px;font-size:18px;color:var(--t2);border-radius:8px;line-height:1;transition:background .12s;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center}
.month-nav-btn:hover{background:var(--bg2)}.month-nav-btn:disabled{color:var(--border);cursor:default}
.month-nav-label{font-family:'Nunito',sans-serif;font-size:16px;font-weight:800;color:var(--t1);letter-spacing:-0.3px}
.graph-card{background:var(--card);border-radius:var(--r-lg);border:1px solid var(--border);padding:16px 14px 14px;margin-bottom:var(--sp-2);overflow:hidden;box-shadow:var(--sh)}
.graph-title{font-size:11px;font-weight:600;color:var(--t3);margin-bottom:12px;padding:0 12px;letter-spacing:0.06em;text-transform:uppercase}
.ctip{background:#fff;border:1px solid var(--border);border-radius:var(--r-md);padding:8px 12px;font-family:'Nunito',sans-serif;font-size:13px;box-shadow:var(--sh)}
.ctip-date{color:var(--t3);font-size:11px;margin-bottom:2px}
.sum-grid{display:flex;flex-direction:column;gap:10px;margin-bottom:var(--sp-2)}
.sum-cell{background:var(--card);border:1px solid var(--border);border-radius:var(--r-md);padding:16px 18px}
.sum-cell.accent{background:var(--orange-l);border-color:var(--orange-m);padding:20px 22px 18px;border-radius:var(--r-lg)}
.sum-sub-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.sum-sub{background:var(--card);border:1px solid var(--border);border-radius:var(--r-md);padding:12px;box-shadow:var(--sh)}
.sum-label{font-size:11px;font-weight:600;color:var(--t3);letter-spacing:0.06em;text-transform:uppercase;margin-bottom:8px}
.sum-val{font-family:'Nunito',sans-serif;font-size:17px;font-weight:800;letter-spacing:-0.5px;line-height:1}
.sum-val.hero{font-size:36px;letter-spacing:-1.5px}
.sum-val.plus{color:var(--green)}.sum-val.minus{color:var(--red)}.sum-val.zero{color:var(--t2)}.sum-val.orange{color:var(--orange)}
.machine-table{background:var(--card);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;margin-bottom:var(--sp-2);box-shadow:var(--sh)}
/* ranking rows */
.machine-row{display:flex;align-items:center;gap:10px;padding:12px 18px;border-bottom:1px solid var(--border)}
.machine-row:last-child{border-bottom:none}
.machine-rank{font-family:'Nunito',sans-serif;font-size:12px;font-weight:800;color:var(--t3);width:22px;flex-shrink:0;text-align:center;line-height:1}
.machine-rank.top{color:var(--orange)}
.machine-info{flex:1;min-width:0}
.machine-name{font-size:14px;font-weight:700;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.machine-meta{font-size:11px;color:var(--t3);margin-top:1px}
/* bar */
.machine-bar-wrap{display:none}
.machine-bar{height:100%;border-radius:3px;transition:width .4s ease}
.machine-bar.plus{background:var(--green)}.machine-bar.minus{background:var(--red)}
.machine-row.first{padding:13px 18px;background:rgba(249,115,22,0.05);border-left:3px solid var(--orange)}
.machine-row.first .machine-name{font-size:15px;font-weight:800}
.machine-row.first .machine-rank{font-size:14px;color:var(--orange)}
.machine-row.first .machine-profit{font-size:15px}
.machine-profit{font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;flex-shrink:0;text-align:right;min-width:68px}

/* record card */
.rec-item{background:var(--card);border:1px solid var(--border);border-radius:var(--r-md);padding:11px 10px 10px 18px;margin-bottom:8px;position:relative;box-shadow:var(--sh)}
.rec-item::before{content:'';position:absolute;left:0;top:11px;bottom:11px;width:3px;border-radius:0 2px 2px 0;background:var(--border)}
.rec-item.plus::before{background:var(--green)}.rec-item.minus::before{background:var(--red)}
/* top row: 機種名(主役) + 収支 */
.rec-header{display:flex;justify-content:space-between;align-items:center;gap:8px}
.rec-header-left{flex:1;min-width:0}
.rec-machine{font-size:14px;font-weight:700;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;line-height:1.2}
.rec-store{font-size:11px;color:var(--t3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;font-weight:500}
.rec-store-inline{font-size:11px;color:var(--t3);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:90px;flex-shrink:0}
.rec-profit{font-family:'Nunito',sans-serif;font-size:24px;font-weight:800;letter-spacing:-1.5px;white-space:nowrap;flex-shrink:0;line-height:1}
.rec-profit.plus{color:var(--green)}.rec-profit.minus{color:var(--red)}.rec-profit.zero{color:var(--t2)}
/* bottom row: 日付 + 投資/回収 + menu */
.rec-footer{display:flex;align-items:center;gap:4px;margin-top:4px;padding-top:0}
.rec-date{font-size:10px;color:var(--t3);font-weight:400;flex-shrink:0;margin-right:2px}
.rec-amounts{display:flex;gap:3px}
.rec-amt{font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;display:inline-flex;align-items:center;gap:2px;white-space:nowrap}
.rec-amt.invest{background:var(--invest-bg);color:var(--invest-fg)}
.rec-amt.collect{background:#dcfce7;color:var(--collect-fg);font-weight:800}
.rec-amt-icon{font-size:10px;opacity:0.5}
.rec-memo{font-size:11px;color:var(--t2);opacity:0.9;margin-top:6px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;max-height:1.5em;line-height:1.4}
/* Win/Lose badge */
.rec-badge{font-family:'Nunito',sans-serif;font-size:10px;font-weight:700;letter-spacing:0.06em;padding:2px 6px;border-radius:3px;flex-shrink:0;align-self:flex-start;margin-top:4px}
.rec-badge.win{background:var(--green-l);color:var(--green)}
.rec-badge.lose{background:var(--red-l);color:var(--red)}
.rec-badge.draw{background:var(--bg2);color:var(--t3)}
/* Hero copy under KPI */
.hero-copy{font-size:10px;font-weight:400;color:var(--t3);margin-top:4px;opacity:0.6}
.hero-copy.win{color:var(--orange);opacity:0.85}
.hero-copy.lose{color:var(--t3)}
.rec-menu-wrap{position:relative;flex-shrink:0;margin-left:8px}
.rec-menu-btn{background:none;border:none;cursor:pointer;color:rgba(24,18,14,0.5);font-size:26px;padding:6px 2px 6px 10px;border-radius:16px;line-height:1;letter-spacing:-6em;transition:background .12s;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center}
.rec-menu-btn:hover{background:var(--bg2);color:var(--t2)}
.rec-menu-dropdown{position:absolute;right:0;top:100%;margin-top:4px;background:var(--card);border:1px solid var(--border);border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.12);z-index:200;min-width:110px}
.rec-menu-item{display:block;width:100%;text-align:left;padding:10px 14px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;background:none;border:none;cursor:pointer;transition:background .12s}
.rec-menu-item:first-child{border-bottom:1px solid var(--border)}
.rec-menu-item.edit{color:var(--t1)}.rec-menu-item.edit:hover{background:var(--orange-l);color:var(--orange)}
.rec-menu-item.del{color:var(--red)}.rec-menu-item.del:hover{background:var(--red-l)}
.month-row{display:flex;justify-content:space-between;align-items:baseline;padding:20px 0 10px;border-bottom:1px solid rgba(0,0,0,0.07);margin-bottom:10px}
.month-label{font-size:14px;font-weight:800;color:var(--t1);letter-spacing:-0.3px}

/* form */
.form-card{background:var(--card);border-radius:var(--r-lg);border:1px solid rgba(0,0,0,0.08);padding:16px 18px 20px;margin-bottom:var(--sp-2);box-shadow:0 2px 8px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04)}
.form-title{font-family:'Nunito',sans-serif;font-size:15px;font-weight:800;color:var(--t1);margin-bottom:var(--sp-2)}
.form-row{display:grid;grid-template-columns:1fr;gap:var(--sp-2);margin-bottom:var(--sp-2);width:100%;box-sizing:border-box}
.form-full{margin-bottom:10px}
.form-label{display:block;font-size:10px;font-weight:700;color:var(--t2);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:5px}
.form-group-sep{height:10px;background:none}
.form-input-wrap{position:relative}
.form-input{width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:11px 14px;background:var(--card);border:1px solid rgba(0,0,0,0.12);border-radius:var(--r-md);color:var(--t1);font-family:'Nunito Sans',sans-serif;font-size:16px;outline:none;transition:border-color .15s,box-shadow .15s;-moz-appearance:textfield}
.form-input::-webkit-outer-spin-button,.form-input::-webkit-inner-spin-button{-webkit-appearance:none}
.form-input:focus{border-color:var(--orange);background:var(--card);border-width:1.5px;box-shadow:0 0 0 3px rgba(249,115,22,0.08)}
.form-row>*,.form-full{width:100%;max-width:100%;min-width:0;box-sizing:border-box;overflow:hidden}
.form-card,.form-full{width:100%;max-width:100%;box-sizing:border-box}
.form-input::placeholder{color:var(--t3)}
/* autocomplete dropdown */
.autocomplete{position:absolute;top:100%;left:0;right:0;background:var(--card);border:1px solid var(--border);border-radius:0 0 var(--r-md) var(--r-md);box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:100;max-height:160px;overflow-y:auto}
.autocomplete-item{padding:12px 13px;font-size:14px;color:var(--t1);cursor:pointer;font-weight:600;border-bottom:1px solid var(--border);min-height:44px;display:flex;align-items:center}
.autocomplete-item:last-child{border-bottom:none}
.autocomplete-item:hover{background:var(--orange-l);color:var(--orange)}
.profit-preview{
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  border-radius:var(--r-md);padding:14px;margin-bottom:10px;
  border:2px solid var(--border);background:var(--card);
  transition:border-color .25s, background .25s;
  text-align:center;min-height:56px;
}
.profit-preview.is-plus{background:var(--green-l);border-color:var(--green-border)}
.profit-preview.is-minus{background:var(--red-l);border-color:var(--red-border)}
.profit-preview.is-zero{background:var(--bg2);border-color:var(--border)}
.profit-preview-val.empty{color:var(--t3);font-size:24px;letter-spacing:0}

.profit-preview-label{font-size:10px;font-weight:700;color:var(--t3);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px}
.profit-preview-val{font-family:'Nunito',sans-serif;font-size:40px;font-weight:800;letter-spacing:-2px;line-height:1}
.profit-preview-val.plus{color:var(--green)}.profit-preview-val.minus{color:var(--red)}.profit-preview-val.zero{color:var(--t2)}
.submit-btn{width:100%;padding:14px;background:var(--orange);color:#fff;font-family:'Nunito',sans-serif;font-size:15px;font-weight:800;border:none;border-radius:var(--r-md);cursor:pointer;transition:background .15s,transform .1s}
.submit-btn:hover{background:var(--orange-hover)}.submit-btn:active{transform:scale(0.98)}.submit-btn:disabled{background:var(--border);cursor:default;transform:none}
.edit-badge{display:inline-block;background:var(--orange-l);color:var(--orange);font-size:10px;font-weight:700;border-radius:4px;padding:2px 8px;margin-left:6px;border:1px solid var(--orange-m);letter-spacing:0.03em}

/* settings */
.settings-section{margin-bottom:var(--sp-3)}
.settings-title{font-size:11px;font-weight:600;color:var(--t3);letter-spacing:0.06em;text-transform:uppercase;margin-bottom:var(--sp-1)}
.settings-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--sh)}
.settings-row{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid var(--border);gap:var(--sp-1)}
.settings-row:last-child{border-bottom:none}
.settings-row-label{font-size:14px;font-weight:700;color:var(--t1)}
.settings-row-sub{font-size:12px;color:var(--t3);margin-top:3px;line-height:1.5}
.settings-btn{background:var(--orange);color:#fff;border:none;border-radius:10px;padding:9px 16px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;transition:background .15s;min-height:44px}
.settings-btn:hover{background:var(--orange-hover)}
.settings-btn.secondary{background:var(--bg2);color:var(--t2);border:1px solid var(--border)}
.settings-btn.secondary:hover{background:var(--border)}
.settings-btn.danger{background:var(--red-l);color:var(--red);border:1.5px solid rgba(220,38,38,0.4);font-weight:700;letter-spacing:0.01em}
.settings-btn.danger:hover{background:var(--red-l)}
.settings-info{font-size:13px;color:var(--t2);background:var(--bg2);border-radius:var(--r-md);padding:12px 16px;margin-bottom:12px;line-height:1.6}

/* undo toast */
.undo-toast{position:fixed;bottom:calc(var(--sp-2) + 64px);left:50%;transform:translateX(-50%);background:#1c1917;color:#fff;border-radius:100px;padding:10px 20px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;display:flex;align-items:center;gap:12px;box-shadow:0 4px 20px rgba(0,0,0,.3);z-index:300;white-space:nowrap;animation:toastIn .25s ease}
.undo-btn{background:var(--orange);color:#fff;border:none;border-radius:20px;padding:8px 16px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;cursor:pointer}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}

/* onboarding */
.onboard-card{background:var(--orange-l);border:1px solid var(--orange-m);border-radius:var(--r-lg);padding:var(--sp-2);margin-bottom:var(--sp-2)}
.onboard-title{font-family:'Nunito',sans-serif;font-size:16px;font-weight:800;color:var(--t1);margin-bottom:14px}
.onboard-steps{display:flex;flex-direction:column;gap:10px;margin-bottom:16px}
.onboard-step{display:flex;align-items:flex-start;gap:12px}
.onboard-num{width:26px;height:26px;border-radius:50%;background:var(--orange);color:#fff;font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.onboard-text{font-size:13px;color:var(--t2);line-height:1.5;padding-top:3px}
.onboard-text strong{color:var(--t1);font-weight:700}
.onboard-btn{width:100%;padding:12px;background:var(--orange);color:#fff;border:none;border-radius:var(--r-md);font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer}

/* show-more */
.show-more-btn{width:100%;padding:12px;background:none;border:1px solid var(--border);border-radius:var(--r-md);font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;color:var(--t2);cursor:pointer;margin-bottom:8px;transition:background .12s;min-height:44px}
.show-more-btn:hover{background:var(--bg2)}

/* empty */
.empty-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r-lg);padding:var(--sp-3) var(--sp-2);text-align:center}
.empty-ico{font-size:32px;margin-bottom:8px}.empty-txt{font-size:14px;color:var(--t2);font-weight:600}.empty-hint{font-size:12px;color:var(--t3);margin-top:4px}

/* bnav */
.bnav{position:fixed;bottom:0;left:0;right:0;width:100%;z-index:100;background:rgba(255,255,255,0.96);backdrop-filter:blur(20px);border-top:1px solid var(--border);display:flex;padding:8px 0;padding-bottom:calc(16px + env(safe-area-inset-bottom,6px))}
.bnav-btn{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;background:none;border:none;cursor:pointer;padding:6px 0;color:var(--t2);font-family:'Nunito',sans-serif;font-size:10px;font-weight:600;letter-spacing:0.04em;transition:color .15s;-webkit-tap-highlight-color:transparent}
.bnav-btn.on{color:var(--orange);font-weight:800}.bnav-btn svg{width:22px;height:22px;stroke-width:2}
.bnav-btn.fab{color:var(--orange);background:none;border-radius:0;width:56px;height:auto;margin-top:0;box-shadow:none;padding:2px 0 4px;gap:0;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0}
.fab-dot{width:42px;height:42px;border-radius:50%;background:var(--orange);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(249,115,22,0.4);margin-top:-22px;margin-bottom:2px}
.fab-dot svg{width:22px;height:22px;stroke-width:2.5;stroke:#fff}
.bnav-btn.fab .bnav-label{font-size:9px;font-weight:500;color:var(--orange);line-height:1}
.bnav-btn.fab:hover .fab-dot{background:var(--orange-hover)}

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
    if (!window.confirm('この実戦記録を削除しますか？')) return;
    setRecords(prev => prev.filter(r => r.id !== id));
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoItem(rec);
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
    setSaved(true); setTimeout(()=>{ setSaved(false); setTab(3); },1200);
  };

  const startEdit = (r) => {
    setEditId(r.id);
    setForm({date:r.date,store:r.store,machine:r.machine,invest:String(r.invest),collect:String(r.collect),memo:r.memo||""});
    setTab(2);
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
    const [menuPos,  setMenuPos]  = useState({top:0,right:0});
    const btnRef = useRef(null);
    return (
      <div className={`rec-item ${profitColor(r.profit)} su`} style={{animationDelay:`${delay}s`}} onClick={()=>menuOpen&&setMenuOpen(false)}>
        {/* 上段: 機種名 ＋ 収支 ＋ ⋯ */}
        <div style={{display:"flex",alignItems:"center",minWidth:0,gap:6}}>
          {r.id===bestRecId&&<span style={{fontSize:13,lineHeight:1,opacity:0.75,flexShrink:0,position:"relative",top:2}}>🏆</span>}
          <div className="rec-machine" style={{flex:1,minWidth:0}} title={r.machine}>{r.machine}</div>
          <div className={`rec-profit ${profitColor(r.profit)}`} style={{flexShrink:0,marginLeft:6}}>{profitStr(r.profit)}</div>
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
      <style>{CSS}</style>
      <div className="app">
        <div className="header" style={tab!==0?{height:"auto",minHeight:0,padding:"14px 0",background:"var(--bg)",borderBottom:"1px solid rgba(0,0,0,0.07)"}:{}}>
          {tab === 0
            ? <img src="/logo.png?v=5" alt="スロログ" className="header-banner"/>
            : tab === 2 && editId
              ? <div style={{display:"flex",alignItems:"center",width:"100%",padding:"0 16px",position:"relative"}}>
                  <button onClick={()=>{setEditId(null);setForm(EMPTY_FORM);setTab(3);}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--orange)",fontSize:13,fontWeight:700,padding:0,fontFamily:"'Nunito',sans-serif",zIndex:1}}>← 戻る</button>
                  <div style={{position:"absolute",left:0,right:0,textAlign:"center",fontFamily:"'Nunito',sans-serif",fontSize:16,fontWeight:800,color:"var(--t1)",letterSpacing:"-0.3px",pointerEvents:"none"}}>記録を編集</div>
                </div>
              : <div style={{fontFamily:"'Nunito',sans-serif",fontSize:18,fontWeight:800,color:"var(--t1)",letterSpacing:"-0.3px",padding:"0 16px",lineHeight:"normal"}}>{["","分析","記録","履歴","設定"][tab]}</div>
          }
        </div>

        {/* ═══ HOME ═══ */}
        {tab===0 && (
          <>
            <div className="kpi-grid">
              {/* Hero: 今月収支 */}
              <div className="kpi hero">
                <div className="kpi-hero-label">今月の収支</div>
                <div className={`kpi-val hero ${profitColor(monthProfit)}`}>{profitStr(monthProfit)}</div>
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
                  <div className={`kpi-val sub ${bestWin>0?"plus":"zero"}`}>{bestWin>0?profitStr(bestWin):"—"}</div>
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
                <div className={`kpi-val hero ${profitColor(viewMonthProfit)}`}>{profitStr(viewMonthProfit)}</div>
                {viewMonthRecs.length > 0 && (
                  <div className="hero-copy">
                    {viewMonthRecs.length}戦{viewMonthRecs.filter(r=>r.profit>0).length}勝{viewMonthRecs.filter(r=>r.profit<0).length}敗
                  </div>
                )}
              </div>
              {/* Sub row — 全期間統計 */}
              <div style={{fontSize:9,color:"var(--t3)",fontWeight:700,letterSpacing:"0.09em",textTransform:"uppercase",marginBottom:6}}>全期間</div>
              <div className="sum-sub-row">
                <div className="sum-sub">
                  <div className="kpi-label">1回あたり</div>
                  <div className={`kpi-val sub ${profitColor(avgProfit)}`}>{records.length?profitStr(avgProfit):"—"}</div>
                </div>
                <div className="sum-sub">
                  <div className="kpi-label">最高勝ち</div>
                  <div className={`kpi-val sub ${bestWin>0?"plus":"zero"}`}>{bestWin>0?profitStr(bestWin):"—"}</div>
                </div>
                <div className="sum-sub">
                  <div className="kpi-label">最大負け</div>
                  <div className={`kpi-val sub ${bestLose<0?"minus":"zero"}`}>{bestLose<0?profitStr(bestLose):"—"}</div>
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
                  {bestWin>0&&<span style={{fontSize:13,color:"var(--t2)"}}>最高 <span style={{fontWeight:800,color:"var(--green)"}}>{profitStr(bestWin)}</span></span>}
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
                      <div className="machine-profit" style={{color:m.profit>0?"var(--green)":m.profit<0?"var(--red)":"var(--t2)"}}>{profitStr(m.profit)}</div>
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
                    <div className={`sum-val ${profitColor(mp)}`} style={{fontSize:16,fontWeight:800,letterSpacing:"-0.5px",lineHeight:1}}>{profitStr(mp)}</div>
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
                <input className="form-input" type="text" inputMode="numeric" placeholder="例: 2026-06-08" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))} maxLength={10} pattern="\d{4}-\d{2}-\d{2}"/>
              </div>
              <div className="form-group-sep"/>
              {/* Group 2: 店舗・機種 */}
              <div className="form-full">
                <label className="form-label">🏠 店舗名</label>
                <AutocompleteInput value={form.store} onChange={v=>setForm(p=>({...p,store:v}))} candidates={history.stores} placeholder="〇〇パチンコ" className="form-input"/>
              </div>
              <div className="form-full">
                <label className="form-label">🎰 機種名</label>
                <AutocompleteInput value={form.machine} onChange={v=>setForm(p=>({...p,machine:v}))} candidates={history.machines} placeholder="〇〇〇" className="form-input"/>
              </div>
              <div className="form-group-sep"/>
              {/* Group 3: 投資・回収 */}
              <div className="form-row">
                <div>
                  <label className="form-label">💸 投資金額</label>
                  <div style={{position:"relative"}}>
                    <span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",fontSize:15,color:"var(--t3)",fontWeight:600,pointerEvents:"none"}}>¥</span>
                    <input className="form-input" type="number" placeholder="10000" value={form.invest} style={{paddingLeft:28}} onChange={e=>setForm(p=>({...p,invest:e.target.value}))}/>
                  </div>
                </div>
                <div>
                  <label className="form-label">💰 回収金額</label>
                  <div style={{position:"relative"}}>
                    <span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",fontSize:15,color:"var(--t3)",fontWeight:600,pointerEvents:"none"}}>¥</span>
                    <input className="form-input" type="number" placeholder="15000" value={form.collect} style={{paddingLeft:28}} onChange={e=>setForm(p=>({...p,collect:e.target.value}))}/>
                  </div>
                </div>
              </div>
              <div className={`profit-preview${(form.invest||form.collect)?previewProfit>0?" is-plus":previewProfit<0?" is-minus":" is-zero":""}`}>
                <div className="profit-preview-label">収支（自動計算）</div>
                <div className={`profit-preview-val ${form.invest||form.collect?profitColor(previewProfit):"empty"}`}>
                  {form.invest||form.collect ? profitStr(previewProfit) : "—"}
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
                    {label:"総実戦回数", val:`${records.length}回`},
                    {label:"通算収支",   val:profitStr(totalProfit), color:totalProfit>0?"var(--green)":totalProfit<0?"var(--red)":"var(--t2)"},
                    {label:"勝率",       val:`${winRate!=null?winRate:0}%`, color:"var(--orange)"},
                    {label:"平均収支",   val:profitStr(avgProfit), color:avgProfit>0?"var(--green)":avgProfit<0?"var(--red)":"var(--t2)"},
                    {label:"最高勝ち",   val:bestWin>0?profitStr(bestWin):"—", color:"var(--green)"},
                    {label:"最高負け",   val:bestLose<0?profitStr(bestLose):"—", color:"var(--red)"},
                  ].map(({label,val,color})=>(
                    <div className="settings-row" key={label}>
                      <div className="settings-row-label">{label}</div>
                      <div style={{fontSize:15,fontWeight:800,color:color||"var(--t1)",fontFamily:"'Nunito',sans-serif",letterSpacing:"-0.3px"}}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="settings-section">
              <div className="settings-title">データのバックアップ</div>
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
              <div className="settings-card" style={{border:"1px solid #fca5a5",background:"var(--red-l)"}}>
                <div className="settings-row" style={{flexDirection:"column",alignItems:"flex-start",gap:12}}>
                  <div><div className="settings-row-label">データをすべて削除</div><div className="settings-row-sub">{records.length}件の記録をすべて削除します。復元できません。</div></div>
                  <button className="settings-btn danger" style={{alignSelf:"flex-end"}} onClick={()=>{if(window.confirm("すべてのデータを削除しますか？この操作は取り消せません。")){setRecords([]);setTab(0);}}}>削除する</button>
                </div>
              </div>
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
