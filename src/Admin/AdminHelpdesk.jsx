// src/Admin/AdminHelpdesk.jsx
// Helpdesk / Complaint Management — tiket komplain pelanggan + SLA.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const AC = "#f97316";
const PRI = { high: "#ef4444", medium: "#f59e0b", low: "#5b6470" };
const STT = { open: "#ef4444", in_progress: "#f59e0b", resolved: "#10b981", closed: "#5b6470" };

export default function AdminHelpdesk({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ subject: "", category: "Komplain Produk", customer: "", outlet: "", priority: "medium" });

  const load = useCallback(() => {
    fetch(`${apiBase}/api/helpdesk`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const add = () => {
    if (!form.subject.trim()) { setMsg("⚠ Subjek tiket wajib"); return; }
    fetch(`${apiBase}/api/helpdesk`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg("✓ Tiket dibuat"); setForm({ ...form, subject: "", customer: "", outlet: "" }); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };
  const setStatus = (t, status) => {
    fetch(`${apiBase}/api/helpdesk/${t.id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }).then(r => r.json()).then(j => { if (j.ok) load(); }).catch(() => {});
  };
  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/helpdesk/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (item) => {
    const ok = await confirm({
      title: `Hapus tiket "${item.ticket_no}"?`,
      message: `${item.subject}. Akan dihapus permanen. Tidak bisa dibatalkan.`,
      danger: true, okLabel: "Hapus",
    });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/helpdesk/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Helpdesk…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🎫 <b style={{ color: "#fb923c" }}>HELPDESK / COMPLAINT</b> — tiket komplain pelanggan, kategori,
        prioritas &amp; SLA penyelesaian.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Tiket" v={String(s.total)} c={AC} />
        <Kpi label="Terbuka" v={String(s.open)} c={s.open > 0 ? "#f59e0b" : "#10b981"} />
        <Kpi label="SLA Terlanggar" v={String(s.sla_breach)} c={s.sla_breach > 0 ? "#ef4444" : "#10b981"} />
        <Kpi label="Avg Resolusi" v={s.avg_resolution + " jam"} c="#3b82f6" />
      </div>

      {s.sla_breach > 0 && (
        <div style={{ ...S.card, marginTop: 10, borderColor: "#ef444455", background: "#1a0d0f" }}>
          <div style={{ fontSize: 13, color: "#fca5a5" }}>🚨 <b>{s.sla_breach} tiket lewat SLA</b> — komplain pelanggan belum tertangani tepat waktu.</div>
        </div>
      )}

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ BUAT TIKET</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1.2fr 1fr 1fr 0.9fr auto", gap: 8, marginTop: 10 }}>
          <input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Subjek komplain" style={S.input} />
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={S.input}>
            {d.categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={form.customer} onChange={e => setForm({ ...form, customer: e.target.value })} placeholder="Pelanggan" style={S.input} />
          <input value={form.outlet} onChange={e => setForm({ ...form, outlet: e.target.value })} placeholder="Outlet" style={S.input} />
          <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} style={S.input}>
            {d.priorities.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={add} style={S.btn}>+ Tiket</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🎫 DAFTAR TIKET — {d.tickets.length}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["TIKET", "KATEGORI", "PELANGGAN", "OUTLET", "PRIORITAS", "UMUR", "STATUS", ""].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.tickets.map(t => (
              <tr key={t.id} style={{ borderTop: "1px solid #161b22", fontSize: 12, opacity: ["resolved", "closed"].includes(t.status) ? 0.55 : 1 }}>
                <td style={{ ...S.td }}>
                  <div style={{ color: "#e6edf3", fontWeight: 600 }}>{t.subject}</div>
                  <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{t.ticket_no}{t.sla_breach ? <span style={{ color: "#ef4444" }}> · ⚠ SLA</span> : ""}</div>
                </td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{t.category}</td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{t.customer}</td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{t.outlet}</td>
                <td style={S.td}><span style={{ fontSize: 10, fontWeight: 700, color: PRI[t.priority], fontFamily: "'Geist Mono',monospace" }}>{t.priority.toUpperCase()}</span></td>
                <td style={{ ...S.td, ...S.mono, color: t.sla_breach ? "#ef4444" : "#5b6470" }}>{t.resolution_hours != null ? `${t.resolution_hours}j (selesai)` : `${t.age_hours}j`}</td>
                <td style={S.td}>
                  <select value={t.status} onChange={e => setStatus(t, e.target.value)}
                    style={{ ...S.input, padding: "4px 6px", fontSize: 11, color: STT[t.status], fontWeight: 700 }}>
                    {["open", "in_progress", "resolved", "closed"].map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                </td>
                <td style={S.td}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => setEditing({ ...t })} title="Edit" style={S.btnEdit}>✏️</button>
                    <button onClick={() => remove(t)} title="Hapus" style={S.btnDel}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={S.modalBg}>
          <div onClick={e => e.stopPropagation()} style={S.modalBox}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#e6edf3", marginBottom: 12 }}>Edit Tiket {editing.ticket_no}</div>
            <Field label="Subjek"><input value={editing.subject || ""} onChange={e => setEditing({ ...editing, subject: e.target.value })} style={modalInp} /></Field>
            <Field label="Kategori">
              <select value={editing.category || ""} onChange={e => setEditing({ ...editing, category: e.target.value })} style={modalInp}>
                {(d.categories || []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Prioritas">
              <select value={editing.priority || "medium"} onChange={e => setEditing({ ...editing, priority: e.target.value })} style={modalInp}>
                {(d.priorities || ["low", "medium", "high"]).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={editing.status || "open"} onChange={e => setEditing({ ...editing, status: e.target.value })} style={modalInp}>
                {["open", "in_progress", "resolved", "closed"].map(st => <option key={st} value={st}>{st}</option>)}
              </select>
            </Field>
            <Field label="Pelanggan"><input value={editing.customer || ""} onChange={e => setEditing({ ...editing, customer: e.target.value })} style={modalInp} /></Field>
            <Field label="Outlet"><input value={editing.outlet || ""} onChange={e => setEditing({ ...editing, outlet: e.target.value })} style={modalInp} /></Field>
            <Field label="Owner (Assigned)"><input value={editing.owner || ""} onChange={e => setEditing({ ...editing, owner: e.target.value })} style={modalInp} /></Field>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => setEditing(null)} style={{ ...S.btn, background: "#21262d", color: "#e6edf3", flex: 1 }}>Batal</button>
              <button onClick={saveEdit} style={{ ...S.btn, flex: 1 }}>Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: "#5b6470", fontWeight: 700, letterSpacing: 0.5, marginBottom: 4, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      {children}
    </div>
  );
}

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "7px 8px" },
  mono: { fontFamily: "'Geist Mono',monospace" },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#f97316", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnEdit: { background: "#f59e0b", color: "#fff", border: "none", borderRadius: 5, padding: "3px 6px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" },
  btnDel: { background: "#ef4444", color: "#fff", border: "none", borderRadius: 5, padding: "3px 6px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" },
  modalBg: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  modalBox: { background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 20, maxWidth: 480, width: "100%", boxShadow: "0 0 40px rgba(0,0,0,0.5)" },
};
