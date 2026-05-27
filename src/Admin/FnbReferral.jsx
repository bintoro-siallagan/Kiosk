// karyaOS — F&B Referral Program (referrer + referee reward)
import { useState, useEffect, useCallback } from "react";
import { useUiKit, EmptyState, TooltipButton } from "../components/uiKit.jsx";
const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
import { fmtMoney as rp } from "../lib/currency.js";
const fmtTs = (s) => s ? new Date(s * 1000).toLocaleString("id-ID", { hour12: false }) : "—";
const STATUS = { pending: { label: "Pending", color: "#f59e0b" }, registered: { label: "Register", color: "#22d3ee" }, first_order: { label: "1st Order", color: "#a855f7" }, rewarded: { label: "Rewarded", color: "#10b981" }, expired: { label: "Expired", color: "#6b7280" } };

export default function FnbReferral({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/fnb";
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState({ referrer_phone: "", referrer_name: "", reward_referrer_amount: 25000, reward_referee_amount: 25000 });
  const [toast, setToast] = useState(null);
  const showToast = (m, k = "ok") => { setToast({ m, k }); setTimeout(() => setToast(null), 2200); };
  const load = useCallback(async () => {
    const p = filter ? `?status=${filter}` : "";
    const d = await fetch(`${base}/referrals${p}`).then(r => r.json());
    setRows(d.referrals || []); setSummary(d.summary || {});
  }, [base, filter]);
  useEffect(() => { load(); }, [load]);
  const create = async () => {
    if (!form.referrer_phone) { showToast("Phone wajib", "err"); return; }
    const r = await fetch(`${base}/referrals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json(); if (!d.ok) { showToast(d.error, "err"); return; }
    showToast(`Code dibuat: ${d.referral_code}`); setForm({ referrer_phone: "", referrer_name: "", reward_referrer_amount: 25000, reward_referee_amount: 25000 }); load();
  };
  const setStatus = async (r, status) => { await fetch(`${base}/referrals/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); load(); };
  const { confirm } = useUiKit();
  const remove = async (r) => { if (!(await confirm({ title: `Hapus referral ${r.referral_code}?`, danger: true, okLabel: "Delete" }))) return; await fetch(`${base}/referrals/${r.id}`, { method: "DELETE" }); load(); };
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🤝 Referral Program</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Customer ajak teman → kedua-duanya dapat reward saat referee first order.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Stat label="Total" value={summary.total || 0} color="#22d3ee" />
          <Stat label="Converted" value={summary.converted || 0} color="#10b981" />
          <Stat label="Referrer payout" value={rp(summary.referrer_payout)} color="#fbbf24" />
          <Stat label="Referee payout" value={rp(summary.referee_payout)} color="#f59e0b" />
        </div>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>+ GENERATE REFERRAL CODE</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 8, alignItems: "flex-end" }}>
          <Field label="Phone referrer"><input value={form.referrer_phone} onChange={e => setForm({ ...form, referrer_phone: e.target.value })} placeholder="08xxx" style={inp} /></Field>
          <Field label="Nama"><input value={form.referrer_name} onChange={e => setForm({ ...form, referrer_name: e.target.value })} style={inp} /></Field>
          <Field label="Reward referrer (Rp)"><input type="number" value={form.reward_referrer_amount} onChange={e => setForm({ ...form, reward_referrer_amount: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
          <Field label="Reward referee (Rp)"><input type="number" value={form.reward_referee_amount} onChange={e => setForm({ ...form, reward_referee_amount: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
          <button onClick={create} style={B.save}>+ Generate</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[["", "Semua"], ["pending", "Pending"], ["registered", "Register"], ["first_order", "1st Order"], ["rewarded", "Rewarded"]].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{ background: filter === v ? "#a855f72a" : "transparent", border: `1px solid ${filter === v ? "#a855f766" : C.border}`, borderRadius: 8, padding: "7px 14px", color: filter === v ? "#fff" : C.sub, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
        ))}
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", color: C.dim, fontSize: 11, letterSpacing: 1, padding: "8px 14px", borderBottom: `1px solid ${C.border}`, gap: 10, alignItems: "center" }}>
          <span style={{ width: 130 }}>CODE</span>
          <span style={{ flex: 1.4 }}>REFERRER</span>
          <span style={{ flex: 1.4 }}>REFEREE</span>
          <span style={{ width: 110 }}>STATUS</span>
          <span style={{ width: 140 }}>REWARD</span>
          <span style={{ width: 130 }}>DIBUAT</span>
          <span style={{ width: 200, textAlign: "right" }}>ACTIONS</span>
        </div>
        {rows.length === 0 ? <Empty>No referral.</Empty> : rows.map(r => {
          const st = STATUS[r.status] || STATUS.pending;
          return (
            <div key={r.id} style={{ display: "flex", padding: "11px 14px", borderBottom: `1px solid ${C.border}`, gap: 10, alignItems: "center" }}>
              <span style={{ width: 130, fontFamily: "'Geist Mono',monospace", color: "#fbbf24", fontWeight: 700, fontSize: 12, letterSpacing: 1.5 }}>{r.referral_code}</span>
              <span style={{ flex: 1.4, fontSize: 12.5 }}><div style={{ fontWeight: 700 }}>{r.referrer_name || "—"}</div><div style={{ fontSize: 11, color: C.sub }}>{r.referrer_phone}</div></span>
              <span style={{ flex: 1.4, fontSize: 12.5 }}>{r.referee_name ? <><div style={{ fontWeight: 700 }}>{r.referee_name}</div><div style={{ fontSize: 11, color: C.sub }}>{r.referee_phone || "—"}</div></> : <span style={{ color: C.dim }}>—</span>}</span>
              <span style={{ width: 110 }}><span style={{ background: st.color + "22", color: st.color, padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{st.label}</span></span>
              <span style={{ width: 140, fontSize: 11.5, color: C.sub, fontFamily: "'Geist Mono',monospace" }}>+{rp(r.reward_referrer_amount)}<br />+{rp(r.reward_referee_amount)}</span>
              <span style={{ width: 130, fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>{fmtTs(r.created_at)}</span>
              <span style={{ width: 200, display: "flex", gap: 4, justifyContent: "flex-end" }}>
                {r.status === "registered"  && <button onClick={() => setStatus(r, "first_order")} style={Ba("#a855f7")}>1st Order</button>}
                {r.status === "first_order" && <button onClick={() => setStatus(r, "rewarded")} style={Ba("#10b981")}>✓ Pay</button>}
                <button onClick={() => remove(r)} style={Ba("#ef4444")}>×</button>
              </span>
            </div>
          );
        })}
      </div>
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: toast.k === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.k === "err" ? "#ef4444" : "#22c55e"}`, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast.m}</div>}
    </div>
  );
}
function Field({ label, children }) { return <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>{children}</div>; }
function Stat({ label, value, color }) { return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 12px", textAlign: "center", minWidth: 100 }}><div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 15, fontWeight: 700, color }}>{value}</div><div style={{ fontSize: 10, color: C.dim, letterSpacing: 0.5 }}>{label}</div></div>; }
function Empty({ children }) { return <div style={{ padding: "30px 18px", textAlign: "center", color: C.sub, fontSize: 13 }}>{children}</div>; }
const inp = { width: "100%", padding: "8px 11px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const B = { save: { background: "#10b981", border: "none", color: "#04130c", padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" } };
const Ba = (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
