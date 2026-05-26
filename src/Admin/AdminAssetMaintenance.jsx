// src/Admin/AdminAssetMaintenance.jsx
// Asset & Maintenance — registry aset + jadwal maintenance.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const AC = "#78716c";
const CAT_ICON = { Machine: "⚙️", Refrigeration: "❄️", "IT Equipment": "💻", Furniture: "🪑" };
const STATUS_OPTIONS = ["operational", "maintenance", "broken"];
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";

export default function AdminAssetMaintenance({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/asset-maintenance`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const service = (a) => {
    fetch(`${apiBase}/api/asset-maintenance/${a.id}/service`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ next_in_days: 90 }),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(`✓ ${a.name} (${a.outlet}) di-service`); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  const saveEdit = async () => {
    const payload = {
      asset_code: editing.asset_code,
      name: editing.name,
      category: editing.category,
      outlet: editing.outlet,
      status: editing.status,
    };
    const r = await fetch(`${apiBase}/api/asset-maintenance/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };

  const remove = async (item) => {
    const ok = await confirm({ title: `Hapus "${item.name || item.asset_code || '#' + item.id}"?`, message: "Akan dihapus permanen. Tidak bisa dibatalkan.", danger: true, okLabel: "Delete" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/asset-maintenance/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Asset & Maintenance…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🔧 <b style={{ color: "#d6d3d1" }}>ASSET & MAINTENANCE</b> — registry aset/peralatan + jadwal
        maintenance preventif. Alert telat service biar alat gak rusak mendadak.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Aset" v={String(s.total)} c="#d6d3d1" />
        <Kpi label="Operations" v={String(s.operational)} c="#10b981" />
        <Kpi label="Perlu Perhatian" v={String(s.need_attention)} c={s.need_attention > 0 ? "#ef4444" : "#10b981"} />
        <Kpi label="Segera Service" v={String(s.due_soon)} c={s.due_soon > 0 ? "#f59e0b" : "#10b981"} />
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🔧 REGISTRY ASET — urut jadwal service terdekat</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["KODE", "ASET", "OUTLET", "SERVICE TERAKHIR", "JADWAL BERIKUT", "STATUS", ""].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.assets.map(a => (
              <tr key={a.id} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", color: "#5b6470" }}>{a.asset_code}</td>
                <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{CAT_ICON[a.category] || "📦"} {a.name}</td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{a.outlet}</td>
                <td style={{ ...S.td, color: "#5b6470" }}>{fmtDate(a.last_service)}</td>
                <td style={{ ...S.td, color: "#9da7b3" }}>
                  {fmtDate(a.next_service)}
                  <span style={{ color: a.days_to_service < 0 ? "#f87171" : "#5b6470", fontSize: 10, fontFamily: "'Geist Mono',monospace" }}>
                    {" "}({a.days_to_service < 0 ? `${-a.days_to_service}hr telat` : `${a.days_to_service}hr`})
                  </span>
                </td>
                <td style={S.td}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: a.color, background: a.color + "1f", border: `1px solid ${a.color}55`, borderRadius: 5, padding: "2px 7px", fontFamily: "'Geist Mono',monospace" }}>{a.label}</span>
                </td>
                <td style={S.td}>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {a.m !== "ok" && <button onClick={() => service(a)} style={S.btn}>🔧 Service</button>}
                    <button onClick={() => setEditing({ ...a })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                    <button onClick={() => remove(a)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.name || editing.asset_code || '#' + editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Kode Aset
                <input value={editing.asset_code || ""} onChange={e => setEditing({ ...editing, asset_code: e.target.value })} style={modalInp} />
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Nama Aset
                <input value={editing.name || ""} onChange={e => setEditing({ ...editing, name: e.target.value })} style={modalInp} />
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Kategori
                <select value={editing.category || "Machine"} onChange={e => setEditing({ ...editing, category: e.target.value })} style={modalInp}>
                  {(d.categories || ["Machine", "Refrigeration", "IT Equipment", "Furniture"]).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Outlet
                <input value={editing.outlet || ""} onChange={e => setEditing({ ...editing, outlet: e.target.value })} style={modalInp} />
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Status
                <select value={editing.status || "operational"} onChange={e => setEditing({ ...editing, status: e.target.value })} style={modalInp}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
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

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };

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
  td: { padding: "8px 8px" },
  btn: { background: "#78716c20", border: "1px solid #78716c66", color: "#d6d3d1", fontSize: 11, fontWeight: 700, padding: "4px 11px", borderRadius: 6, cursor: "pointer", fontFamily: "'Geist Mono',monospace" },
};
