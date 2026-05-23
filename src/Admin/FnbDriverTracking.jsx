// karyaOS — Driver Realtime Location Tracking (live ping)
import { useState, useEffect, useCallback } from "react";
const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const fmtAge = (s) => { if (s == null) return "never"; if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.floor(s/60)}m ago`; return `${Math.floor(s/3600)}h ago`; };

export default function FnbDriverTracking({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/fnb";
  const [drivers, setDrivers] = useState([]);
  const [updated, setUpdated] = useState(0);
  const load = useCallback(async () => {
    const d = await fetch(`${base}/drivers/live`).then(r => r.json());
    setDrivers(d.drivers || []); setUpdated(Date.now());
  }, [base]);
  useEffect(() => { load(); const iv = setInterval(load, 5000); return () => clearInterval(iv); }, [load]);
  const ping = async (d) => {
    // Manual simulate ping for testing (production: driver app GPS)
    const lat = parseFloat(prompt("Latitude:", d.last_lat || "-6.9175"));
    if (isNaN(lat)) return;
    const lng = parseFloat(prompt("Longitude:", d.last_lng || "107.6191"));
    if (isNaN(lng)) return;
    await fetch(`${base}/drivers/${d.id}/ping`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat, lng }) });
    load();
  };
  const online = drivers.filter(d => d.is_online);
  const onDelivery = drivers.filter(d => d.status === "on_delivery");
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>📍 Driver Realtime Tracking</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Live location ping tiap 5 detik · driver app POST /drivers/:id/ping {`{lat,lng}`}.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Stat label="Total" value={drivers.length} color="#22d3ee" />
          <Stat label="Online" value={online.length} color="#10b981" />
          <Stat label="On Delivery" value={onDelivery.length} color="#f59e0b" />
          <Stat label="Update" value={new Date(updated).toLocaleTimeString("id-ID")} color="#a855f7" />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 12 }}>
        {drivers.map(d => (
          <div key={d.id} style={{ background: C.card, border: `2px solid ${d.is_online ? "#10b98166" : C.border}`, borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{d.name}</div>
                <div style={{ fontSize: 11, color: C.sub }}>🛵 {d.vehicle_plate} · {d.phone}</div>
                {d.outlet && <div style={{ fontSize: 11, color: C.dim }}>🏪 {d.outlet}</div>}
              </div>
              <span style={{ background: d.is_online ? "#10b98122" : "#6b728022", color: d.is_online ? "#10b981" : "#9ca3af", padding: "3px 9px", borderRadius: 7, fontSize: 11, fontWeight: 700 }}>{d.is_online ? "🟢 ONLINE" : "⚫ OFFLINE"}</span>
            </div>
            <div style={{ background: "#0a0e16", borderRadius: 9, padding: "8px 11px", marginTop: 8, fontSize: 12, fontFamily: "'Geist Mono',monospace" }}>
              {d.last_lat != null ? (
                <>
                  <div>📍 <b>{d.last_lat?.toFixed(6)}, {d.last_lng?.toFixed(6)}</b></div>
                  <div style={{ color: C.dim, marginTop: 3 }}>⏱ Last ping {fmtAge(d.ping_age_sec)}</div>
                  <a href={`https://maps.google.com/?q=${d.last_lat},${d.last_lng}`} target="_blank" rel="noopener noreferrer"
                     style={{ fontSize: 11, color: "#22d3ee", textDecoration: "none", marginTop: 4, display: "inline-block" }}>🗺️ Buka Google Maps →</a>
                </>
              ) : (
                <div style={{ color: C.dim }}>📍 Belum ada ping</div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.sub, flex: 1 }}>Status: <b>{d.status}</b></span>
              <button onClick={() => ping(d)} style={Ba("#22d3ee")}>📡 Manual Ping</button>
            </div>
          </div>
        ))}
      </div>
      {drivers.length === 0 && <div style={{ padding: "40px", textAlign: "center", color: C.sub, fontSize: 13 }}>Belum ada driver aktif. Tambah dulu di 🚴 Delivery → Drivers tab.</div>}
    </div>
  );
}
function Stat({ label, value, color }) { return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 12px", textAlign: "center", minWidth: 90 }}><div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, fontWeight: 700, color }}>{value}</div><div style={{ fontSize: 10, color: C.dim, letterSpacing: 0.5 }}>{label}</div></div>; }
const Ba = (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
