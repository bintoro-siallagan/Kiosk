// src/Admin/AdminIncidents.jsx
// Incident Management — insiden operasional outlet.

import { useState, useEffect, useCallback } from "react";
import { useUiKit , LoadingState} from "../components/uiKit.jsx";

const AC = "#dc2626";
const SEV_C = { low: "#10b981", medium: "#f59e0b", high: "#f97316", critical: "#ef4444" };
const STAT = { open: { c: "#ef4444", l: "TERBUKA" }, in_progress: { c: "#f59e0b", l: "DITANGANI" }, resolved: { c: "#10b981", l: "SELESAI" } };
const CAT_ICON = { Equipment: "🔧", Safety: "⚠️", Service: "🛎️", Hygiene: "🧼", Complaint: "💬" };
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";

export default function AdminIncidents({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ title: "", category: "Equipment", outlet: "Paskal", severity: "medium" });
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/incidents`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const setStatus = (x, status) => {
    fetch(`${apiBase}/api/incidents/${x.id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(`✓ ${x.incident_no} → ${status}`); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };
  const report = () => {
    if (!form.title.trim()) { setMsg("⚠ Judul insiden wajib"); return; }
    fetch(`${apiBase}/api/incidents`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, reported_by: "Admin" }),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg("✓ Insiden dilaporkan"); setForm({ ...form, title: "" }); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/incidents/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };

  const remove = async (item) => {
    const ok = await confirm({ title: `Hapus "${item.title || item.incident_no || '#'+item.id}"?`, message: "Akan dihapus permanen. Tidak bisa dibatalkan.", danger: true, okLabel: "Delete" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/incidents/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <LoadingState label="Memuat Incident Management…" />;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🚨 <b style={{ color: "#f87171" }}>INCIDENT MANAGEMENT</b> — insiden operasional outlet (equipment,
        safety, service, hygiene, complaint). Lacak active issue → resolusi.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Terbuka" v={String(s.open)} c={s.open > 0 ? "#ef4444" : "#10b981"} />
        <Kpi label="Ditangani" v={String(s.in_progress)} c="#f59e0b" />
        <Kpi label="Completed" v={String(s.resolved)} c="#10b981" />
        <Kpi label="Kritis Active" v={String(s.critical)} c={s.critical > 0 ? "#ef4444" : "#10b981"} />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📝 LAPOR INSIDEN</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.1fr 1fr 1fr auto", gap: 8, marginTop: 10 }}>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Judul insiden" style={S.input} />
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={S.input}>
            {d.categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={form.outlet} onChange={e => setForm({ ...form, outlet: e.target.value })} placeholder="Outlet" style={S.input} />
          <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })} style={S.input}>
            {d.severities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={report} style={S.btn}>+ Lapor</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🚨 DAFTAR INSIDEN — {d.incidents.length}</div>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {d.incidents.map(x => {
            const st = STAT[x.status] || STAT.open;
            return (
              <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 11, background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${SEV_C[x.severity]}`, borderRadius: 9, padding: "10px 13px" }}>
                <span style={{ fontSize: 17 }}>{CAT_ICON[x.category] || "🚩"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{x.title}</div>
                  <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>
                    {x.incident_no} · {x.category} · {x.outlet} · {fmtDate(x.created_at)}{x.resolution ? ` · ${x.resolution}` : ""}
                  </div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: SEV_C[x.severity], fontFamily: "'Geist Mono',monospace" }}>{x.severity.toUpperCase()}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: st.c, background: st.c + "1f", border: `1px solid ${st.c}55`, borderRadius: 5, padding: "3px 8px", fontFamily: "'Geist Mono',monospace" }}>{st.l}</span>
                {x.status === "open" && <button onClick={() => setStatus(x, "in_progress")} style={S.act("#f59e0b")}>Tangani</button>}
                {x.status === "in_progress" && <button onClick={() => setStatus(x, "resolved")} style={S.act("#10b981")}>✓ Done</button>}
                <button onClick={() => setEditing({ ...x })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                <button onClick={() => remove(x)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.title || editing.incident_no || '#'+editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <input value={editing.title || ""} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="Judul insiden" style={modalInp} />
              <select value={editing.category || ""} onChange={e => setEditing({ ...editing, category: e.target.value })} style={modalInp}>
                {(d.categories || []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input value={editing.outlet || ""} onChange={e => setEditing({ ...editing, outlet: e.target.value })} placeholder="Outlet" style={modalInp} />
              <select value={editing.severity || ""} onChange={e => setEditing({ ...editing, severity: e.target.value })} style={modalInp}>
                {(d.severities || []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={editing.status || ""} onChange={e => setEditing({ ...editing, status: e.target.value })} style={modalInp}>
                {["open", "in_progress", "resolved"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <textarea value={editing.description || ""} onChange={e => setEditing({ ...editing, description: e.target.value })} placeholder="Description" rows={2} style={{ ...modalInp, resize: "vertical", fontFamily: "inherit" }} />
              <textarea value={editing.resolution || ""} onChange={e => setEditing({ ...editing, resolution: e.target.value })} placeholder="Resolusi" rows={2} style={{ ...modalInp, resize: "vertical", fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Cancel</button>
              <button onClick={saveEdit} style={{ background: "#10b981", color: "#04130c", border: "none", padding: "8px 18px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>💾 Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#dc2626", color: "#fff", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  act: (c) => ({ background: c, color: "#0a0e16", border: "none", borderRadius: 6, padding: "5px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }),
};

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };
