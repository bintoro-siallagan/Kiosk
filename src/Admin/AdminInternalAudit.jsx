// src/Admin/AdminInternalAudit.jsx
// Internal Audit — audit-program: jadwal, temuan, corrective action.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const AC = "#7c3aed";
const STT = { scheduled: { c: "#5b6470", l: "DIJADWALKAN" }, in_progress: { c: "#f59e0b", l: "BERJALAN" }, completed: { c: "#10b981", l: "SELESAI" } };
const SEV = { Tinggi: "#ef4444", Sedang: "#f59e0b", Rendah: "#10b981" };

export default function AdminInternalAudit({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [exp, setExp] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: "", area: "Keuangan", auditor: "", period: "" });

  const load = useCallback(() => {
    fetch(`${apiBase}/api/internal-audit`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const add = () => {
    if (!form.title.trim()) { setMsg("⚠ Judul audit wajib"); return; }
    fetch(`${apiBase}/api/internal-audit`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg("✓ Audit dijadwalkan"); setForm({ ...form, title: "", auditor: "", period: "" }); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };
  const setStatus = (a, status) => {
    fetch(`${apiBase}/api/internal-audit/${a.id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }).then(r => r.json()).then(j => { if (j.ok) load(); }).catch(() => {});
  };
  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/internal-audit/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (a) => {
    const ok = await confirm({
      title: `Hapus audit "${a.code}"?`,
      message: `${a.title}. Hanya audit dijadwalkan yang bisa dihapus. Akan dihapus permanen.`,
      danger: true, okLabel: "Delete",
    });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/internal-audit/${a.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Internal Audit…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🔍 <b style={{ color: "#a78bfa" }}>INTERNAL AUDIT</b> — audit-program: jadwal audit, temuan,
        corrective action &amp; follow-up. Melengkapi Self-Audit otomatis dengan audit manusia.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Audit" v={String(s.total)} c={AC} />
        <Kpi label="Dijadwalkan" v={String(s.scheduled)} c="#5b6470" />
        <Kpi label="Berjalan" v={String(s.in_progress)} c="#f59e0b" />
        <Kpi label="Temuan Terbuka" v={String(s.open_findings)} c={s.open_findings > 0 ? "#ef4444" : "#10b981"} />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ JADWALKAN AUDIT</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.1fr 1.1fr 1fr auto", gap: 8, marginTop: 10 }}>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Judul audit" style={S.input} />
          <select value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} style={S.input}>
            {d.areas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <input value={form.auditor} onChange={e => setForm({ ...form, auditor: e.target.value })} placeholder="Auditor" style={S.input} />
          <input value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} placeholder="Periode" style={S.input} />
          <button onClick={add} style={S.btn}>+ Audit</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🔍 PROGRAM AUDIT — {d.audits.length}</div>
        <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
          {d.audits.map(a => {
            const st = STT[a.status];
            return (
              <div key={a.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${st.c}`, borderRadius: 9, padding: "10px 13px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: a.findings_count ? "pointer" : "default" }} onClick={() => a.findings_count && setExp(exp === a.id ? null : a.id)}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{a.code} · {a.area} · {a.auditor} · {a.period}</div>
                  </div>
                  {a.findings_count > 0 && <span style={{ fontSize: 10, color: a.open_findings > 0 ? "#f87171" : "#10b981" }}>{a.open_findings}/{a.findings_count} temuan {exp === a.id ? "▲" : "▼"}</span>}
                  {a.rating && <span style={{ fontSize: 9, color: "#a78bfa", fontFamily: "'Geist Mono',monospace" }}>{a.rating}</span>}
                  <select value={a.status} onChange={e => setStatus(a, e.target.value)} onClick={e => e.stopPropagation()}
                    style={{ ...S.input, padding: "4px 6px", fontSize: 10, color: st.c, fontWeight: 700, width: 120 }}>
                    {["scheduled", "in_progress", "completed"].map(x => <option key={x} value={x}>{STT[x].l}</option>)}
                  </select>
                  <button onClick={e => { e.stopPropagation(); setEditing({ ...a, findings_json: JSON.stringify(a.findings || [], null, 2) }); }} title="Edit" style={S.btnEdit}>✏️</button>
                  <button onClick={e => { e.stopPropagation(); remove(a); }} title="Delete" style={S.btnDel}>🗑️</button>
                </div>
                {exp === a.id && a.findings.map((f, i) => (
                  <div key={i} style={{ marginTop: 6, paddingLeft: 10, borderLeft: `2px solid ${SEV[f.severity] || "#5b6470"}` }}>
                    <div style={{ fontSize: 12, color: "#e6edf3" }}>{f.finding} <span style={{ fontSize: 9, color: SEV[f.severity] }}>● {f.severity}</span></div>
                    <div style={{ fontSize: 10.5, color: "#5b6470" }}>↳ {f.corrective_action} <span style={{ color: f.status === "closed" ? "#10b981" : "#f59e0b" }}>[{f.status}]</span></div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={S.modalBg}>
          <div onClick={e => e.stopPropagation()} style={S.modalBox}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#e6edf3", marginBottom: 12 }}>Edit Audit {editing.code}</div>
            <Field label="Judul"><input value={editing.title || ""} onChange={e => setEditing({ ...editing, title: e.target.value })} style={modalInp} /></Field>
            <Field label="Area">
              <select value={editing.area || ""} onChange={e => setEditing({ ...editing, area: e.target.value })} style={modalInp}>
                {(d.areas || []).map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="Auditor"><input value={editing.auditor || ""} onChange={e => setEditing({ ...editing, auditor: e.target.value })} style={modalInp} /></Field>
            <Field label="Periode"><input value={editing.period || ""} onChange={e => setEditing({ ...editing, period: e.target.value })} style={modalInp} /></Field>
            <Field label="Status">
              <select value={editing.status || "scheduled"} onChange={e => setEditing({ ...editing, status: e.target.value })} style={modalInp}>
                {["scheduled", "in_progress", "completed"].map(x => <option key={x} value={x}>{STT[x].l}</option>)}
              </select>
            </Field>
            <Field label="Rating"><input value={editing.rating || ""} onChange={e => setEditing({ ...editing, rating: e.target.value })} placeholder="Memuaskan / Perlu Perbaikan / —" style={modalInp} /></Field>
            <Field label="Findings (JSON)">
              <textarea value={editing.findings_json || ""} onChange={e => {
                const v = e.target.value;
                try { setEditing({ ...editing, findings_json: v, findings: JSON.parse(v) }); }
                catch { setEditing({ ...editing, findings_json: v }); }
              }} rows={5} style={{ ...modalInp, fontFamily: "'Geist Mono',monospace", fontSize: 11 }} />
            </Field>
            <div style={{ fontSize: 10, color: "#5b6470", marginBottom: 8 }}>Notes: audit with status <b>completed</b> immutable — server akan menolak edit.</div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => setEditing(null)} style={{ ...S.btn, background: "#21262d", color: "#e6edf3", flex: 1 }}>Cancel</button>
              <button onClick={saveEdit} style={{ ...S.btn, flex: 1 }}>Save</button>
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
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#7c3aed", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnEdit: { background: "#f59e0b", color: "#fff", border: "none", borderRadius: 5, padding: "3px 6px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" },
  btnDel: { background: "#ef4444", color: "#fff", border: "none", borderRadius: 5, padding: "3px 6px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" },
  modalBg: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  modalBox: { background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 20, maxWidth: 480, width: "100%", maxHeight: "90vh", overflow: "auto", boxShadow: "0 0 40px rgba(0,0,0,0.5)" },
};
