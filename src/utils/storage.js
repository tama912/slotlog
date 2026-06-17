export const STORE         = "surorogue_v1";
export const HISTORY_STORE = "surorogue_history";
export const load          = () => { try { return JSON.parse(localStorage.getItem(STORE) || "[]"); } catch { return []; } };
export const save          = (d) => localStorage.setItem(STORE, JSON.stringify(d));
export const loadHistory   = () => { try { return JSON.parse(localStorage.getItem(HISTORY_STORE) || '{"stores":[],"machines":[]}'); } catch { return {stores:[],machines:[]}; } };
export const saveHistory   = (h) => localStorage.setItem(HISTORY_STORE, JSON.stringify(h));
