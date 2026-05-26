// karyaOS — WhatsApp Business config + broadcast composer + message log
import { useState, useEffect, useCallback } from "react";
import { useUiKit, EmptyState as UiEmpty, Help } from "../components/uiKit.jsx";
const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const fmtTs = (s) => s ? new Date(s * 1000).toLocaleString("id-ID", { hour12: false }) : "—";
const PROVIDERS = [["fonnte", "Fonnte"], ["wati", "Wati"], ["twilio", "Twilio"], ["meta", "Meta Cloud API"], ["qontak", "Qontak"]];
const STATUS = { queued: { label: "Queued", color: "#f59e0b" }, sent: { label: "Sent", color: "#22d3ee" }, delivered: { label: "Delivered", color: "#10b981" }, read: { label: "Read", color: "#a855f7" }, failed: { label: "Failed", color: "#ef4444" } };
export default function FnbWhatsApp({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/fnb";
  const [tab, setTab] = useState("compose");
  const [cfg, setCfg] = useState({});
  const [cfgEdit, setCfgEdit] = useState({});
  const [messages, setMessages] = useState([]);
  const [summary, setSummary] = useState({});
  const [send, setSend] = useState({ recipient_phone: "", recipient_name: "", template_name: "", message: "" });
  const [toast, setToast] = useState(null);
  const { confirm } = useUiKit();
  const showToast = (m, k = "ok") => { setToast({ m, k }); setTimeout(() => setToast(null), 2200); };
  const removeMsg = async (m) => {
    const ok = await confirm({ title: "Hapus log pesan?", message: `Pesan to ${m.recipient_phone} akan dihapus permanen.`, danger: true, okLabel: "Delete" });
    if (!ok) return;
    await fetch(`${base}/wa-messages/${m.id}`, { method: "DELETE" });
    showToast("Pesan dihapus"); load();
  };
  const clearAllMsgs = async () => {
    const ok = await confirm({ title: "Bersihkan semua log pesan WA?", message: `Semua ${messages.length} pesan akan dihapus permanen. Tidak bisa dibatalkan.`, danger: true, okLabel: "Hapus Semua" });
    if (!ok) return;
    const r = await fetch(`${base}/wa-messages`, { method: "DELETE" });
    const d = await r.json();
    showToast(`${d.deleted || 0} log dihapus`); load();
  };
  const clearFailed = async () => {
    const ok = await confirm({ title: "Hapus log pesan yang gagal?", message: "Hanya pesan with status 'failed' yang dihapus.", danger: true, okLabel: "Hapus Failed" });
    if (!ok) return;
    const r = await fetch(`${base}/wa-messages?status=failed`, { method: "DELETE" });
    const d = await r.json();
    showToast(`${d.deleted || 0} failed dihapus`); load();
  };
  const load = useCallback(async () => {
    const c = await fetch(`${base}/wa-config`).then(r => r.json()); setCfg(c.config || {}); setCfgEdit(c.config || {});
    const m = await fetch(`${base}/wa-messages`).then(r => r.json()); setMessages(m.messages || []); setSummary(m.summary || {});
  }, [base]);
  useEffect(() => { load(); }, [load]);
  const saveCfg = async () => {
    const body = { ...cfgEdit }; if (body.api_key?.startsWith("••••")) delete body.api_key;
    const r = await fetch(`${base}/wa-config`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json(); if (!d.ok) { showToast(d.error, "err"); return; }
    showToast("Config disimpan"); load();
  };
  const submitSend = async () => {
    if (!send.recipient_phone || !send.message) { showToast("Phone + message wajib", "err"); return; }
    const r = await fetch(`${base}/wa-send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(send) });
    const d = await r.json(); if (!d.ok) { showToast(d.error, "err"); return; }
    showToast(d.simulated ? "Pesan disimulasikan (config belum enabled)" : "Pesan dikirim"); setSend({ recipient_phone: "", recipient_name: "", template_name: "", message: "" }); load();
  };
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>💬 WhatsApp Business</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Send broadcast / notif via WA Business API (Fonnte / Wati / Meta Cloud).</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Stat label="Status" value={cfg.is_enabled ? "ENABLED" : "OFF"} color={cfg.is_enabled ? "#10b981" : "#6b7280"} />
          <Stat label="Sent" value={summary.sent || 0} color="#22d3ee" />
          <Stat label="Failed" value={summary.failed || 0} color="#ef4444" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["compose", "✉️ Compose"], ["log", "📜 Log"], ["config", "⚙️ Config"]].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} style={{ background: tab === id ? "#25d36622" : "transparent", border: `1px solid ${tab === id ? "#25d36666" : C.border}`, borderRadius: 8, padding: "8px 14px", color: tab === id ? "#fff" : C.sub, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
        ))}
      </div>
      {tab === "compose" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Nomor tujuan (628xxx)"><input value={send.recipient_phone} onChange={e => setSend({ ...send, recipient_phone: e.target.value })} placeholder="628xxx" style={inp} /></Field>
            <Field label="Nama (opsional)"><input value={send.recipient_name} onChange={e => setSend({ ...send, recipient_name: e.target.value })} style={inp} /></Field>
            <Field label="Template (opsional)"><input value={send.template_name} onChange={e => setSend({ ...send, template_name: e.target.value })} placeholder="welcome_message" style={inp} /></Field>
          </div>
          <Field label="Pesan">
            <textarea value={send.message} onChange={e => setSend({ ...send, message: e.target.value })} rows={5} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} placeholder="Halo {{nama}}! Reservasi Anda CONFIRMED ✅. Date: …" />
          </Field>
          <div style={{ marginTop: 10 }}>
            <button onClick={submitSend} style={B.save}>💬 Send Pesan</button>
          </div>
        </div>
      )}
      {tab === "log" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 8 }}>
            <button onClick={clearFailed} disabled={!messages.length} style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "5px 12px", borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: messages.length ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: messages.length ? 1 : 0.5 }}>🗑️ Hapus Failed</button>
            <button onClick={clearAllMsgs} disabled={!messages.length} style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "5px 12px", borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: messages.length ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: messages.length ? 1 : 0.5 }}>🗑️ Hapus Semua</button>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, color: C.dim, fontSize: 11, letterSpacing: 1, gap: 10 }}>
              <span style={{ width: 140 }}>WAKTU</span><span style={{ width: 140 }}>NOMOR</span><span style={{ flex: 1 }}>PESAN</span><span style={{ width: 90 }}>STATUS</span><span style={{ width: 40 }}></span>
            </div>
            {messages.length === 0 ? <Empty>No pesan.</Empty> : messages.map(m => {
              const st = STATUS[m.status] || STATUS.queued;
              return (
                <div key={m.id} style={{ display: "flex", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, gap: 10, fontSize: 12, alignItems: "center" }}>
                  <span style={{ width: 140, fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>{fmtTs(m.created_at)}</span>
                  <span style={{ width: 140, fontFamily: "'Geist Mono',monospace" }}>{m.recipient_phone}{m.recipient_name ? <div style={{ fontSize: 10, color: C.dim }}>{m.recipient_name}</div> : null}</span>
                  <span style={{ flex: 1, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={m.message}>{m.message}{m.error ? <span style={{ color: "#ef4444", marginLeft: 6 }}> · {m.error}</span> : ""}</span>
                  <span style={{ width: 90 }}><span style={{ background: st.color + "22", color: st.color, padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{st.label}</span></span>
                  <button onClick={() => removeMsg(m)} style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }} title="Delete">🗑️</button>
                </div>
              );
            })}
          </div>
        </>
      )}
      {tab === "config" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Provider"><select value={cfgEdit.provider || "fonnte"} onChange={e => setCfgEdit({ ...cfgEdit, provider: e.target.value })} style={inp}>{PROVIDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Sender number (628xxx)"><input value={cfgEdit.sender_number || ""} onChange={e => setCfgEdit({ ...cfgEdit, sender_number: e.target.value })} style={inp} /></Field>
            <Field label="API Key"><input value={cfgEdit.api_key || ""} onChange={e => setCfgEdit({ ...cfgEdit, api_key: e.target.value })} placeholder="masukkan ulang for update" style={inp} /></Field>
            <Field label="Business account ID"><input value={cfgEdit.business_account_id || ""} onChange={e => setCfgEdit({ ...cfgEdit, business_account_id: e.target.value })} style={inp} /></Field>
            <Field label="Webhook token"><input value={cfgEdit.webhook_token || ""} onChange={e => setCfgEdit({ ...cfgEdit, webhook_token: e.target.value })} style={inp} /></Field>
            <Field label="Status"><label style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "center" }}><input type="checkbox" checked={!!cfgEdit.is_enabled} onChange={e => setCfgEdit({ ...cfgEdit, is_enabled: e.target.checked ? 1 : 0 })} /> Enabled (kalau off, send disimulasikan)</label></Field>
          </div>
          <div style={{ marginTop: 12 }}>
            <button onClick={saveCfg} style={B.save}>💾 Simpan Config</button>
          </div>
        </div>
      )}
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: toast.k === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.k === "err" ? "#ef4444" : "#22c55e"}`, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast.m}</div>}
    </div>
  );
}
function Field({ label, children }) { return <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>{children}</div>; }
function Stat({ label, value, color }) { return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 12px", textAlign: "center", minWidth: 100 }}><div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 14, fontWeight: 700, color }}>{value}</div><div style={{ fontSize: 10, color: C.dim, letterSpacing: 0.5 }}>{label}</div></div>; }
function Empty({ children }) { return <div style={{ padding: "30px 18px", textAlign: "center", color: C.sub, fontSize: 13 }}>{children}</div>; }
const inp = { width: "100%", padding: "8px 11px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const B = { save: { background: "#25d366", border: "none", color: "#04130c", padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" } };
