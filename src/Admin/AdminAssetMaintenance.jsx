// src/Admin/AdminAssetMaintenance.jsx
// Asset & Maintenance — registry aset + jadwal maintenance.

import { useState, useEffect, useCallback } from "react";

const AC = "#78716c";
const CAT_ICON = { Machine: "⚙️", Refrigeration: "❄️", "IT Equipment": "💻", Furniture: "🪑" };
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";

export default function AdminAssetMaintenance({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/asset-maintenance`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const service = (a) => {
    fetch(`${apiBase}/api/asset-maintenance/${a.id}/service`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ next_in_days: 90 }),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(`✓ ${a.name} (${a.outlet}) di-service`); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
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
        <Kpi label="Operasional" v={String(s.operational)} c="#10b981" />
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
                <td style={{ ...S.td, fontFamily: "'Space Mono',monospace", color: "#5b6470" }}>{a.asset_code}</td>
                <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{CAT_ICON[a.category] || "📦"} {a.name}</td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{a.outlet}</td>
                <td style={{ ...S.td, color: "#5b6470" }}>{fmtDate(a.last_service)}</td>
                <td style={{ ...S.td, color: "#9da7b3" }}>
                  {fmtDate(a.next_service)}
                  <span style={{ color: a.days_to_service < 0 ? "#f87171" : "#5b6470", fontSize: 10, fontFamily: "'Space Mono',monospace" }}>
                    {" "}({a.days_to_service < 0 ? `${-a.days_to_service}hr telat` : `${a.days_to_service}hr`})
                  </span>
                </td>
                <td style={S.td}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: a.color, background: a.color + "1f", border: `1px solid ${a.color}55`, borderRadius: 5, padding: "2px 7px", fontFamily: "'Space Mono',monospace" }}>{a.label}</span>
                </td>
                <td style={S.td}>
                  {a.m !== "ok" && <button onClick={() => service(a)} style={S.btn}>🔧 Service</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Space Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "8px 8px" },
  btn: { background: "#78716c20", border: "1px solid #78716c66", color: "#d6d3d1", fontSize: 11, fontWeight: 700, padding: "4px 11px", borderRadius: 6, cursor: "pointer", fontFamily: "'Space Mono',monospace" },
};
