// src/Admin/AdminDeviceSession.jsx
// Device & Session Control — device authorization, session monitor,
// suspicious login alert, force logout.

import { useState, useEffect, useCallback } from "react";

const AC = "#3b82f6";
const ago = (ts) => {
  if (!ts) return "—";
  const m = Math.floor((Date.now() / 1000 - ts) / 60);
  if (m < 1) return "baru saja";
  if (m < 60) return m + " menit lalu";
  const h = Math.floor(m / 60);
  return h < 24 ? h + " jam lalu" : Math.floor(h / 24) + " hari lalu";
};
const DEV_ICON = { pos: "💳", kiosk: "🛎️", desktop: "🖥️", tablet: "📱", mobile: "📲" };

export default function AdminDeviceSession({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/device-session`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const logout = (id) => {
    fetch(`${apiBase}/api/device-session/${id}/logout`, { method: "POST" })
      .then(r => r.json()).then(j => { if (j.ok) { setMsg("✓ Sesi di-logout paksa"); load(); } }).catch(() => {});
  };
  const toggleDevice = (id, authorized) => {
    fetch(`${apiBase}/api/device-session/device/${id}/authorize`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorized }),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(authorized ? "✓ Device diotorisasi" : "✓ Otorisasi device dicabut"); load(); } }).catch(() => {});
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Device & Session…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🖥️ <b style={{ color: AC }}>DEVICE &amp; SESSION CONTROL</b> — otorisasi device, monitor sesi login,
        deteksi login mencurigakan, force logout &amp; validasi lokasi.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Sesi Aktif" v={String(s.active_sessions)} c={AC} />
        <Kpi label="Device Terotorisasi" v={`${s.authorized_devices}/${s.devices}`} c="#10b981" />
        <Kpi label="Login Mencurigakan" v={String(s.suspicious)} c={s.suspicious > 0 ? "#ef4444" : "#10b981"} />
        <Kpi label="Total Device" v={String(s.devices)} c="#a855f7" />
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: "#10b981" }}>{msg}</div> : null}

      {/* Suspicious */}
      {d.suspicious.length > 0 && (
        <div style={{ ...S.card, marginTop: 14, borderColor: "#ef444433" }}>
          <div style={{ ...S.kicker, color: "#ef4444" }}>🚨 SUSPICIOUS LOGIN ALERT — {d.suspicious.length}</div>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {d.suspicious.map(x => (
              <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#0a0e16", borderLeft: "3px solid #ef4444", borderRadius: 8, padding: "10px 13px" }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{x.user_name} <span style={{ color: "#5b6470", fontWeight: 400, fontSize: 11 }}>· {x.user_role}</span></div>
                  <div style={{ fontSize: 11, color: "#f87171", marginTop: 2 }}>{x.suspicious_reason}</div>
                  <div style={{ fontSize: 10, color: "#5b6470" }}>{x.device_name} · {x.location} · {x.ip}</div>
                </div>
                <button onClick={() => logout(x.id)} style={S.btnLogout}>⏏ Force Logout</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active sessions */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🟢 SESI AKTIF — {d.active_sessions.length}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["USER", "DEVICE", "LOKASI", "IP", "LOGIN", "AKTIF", ""].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.active_sessions.map(x => (
              <tr key={x.id} style={{ borderTop: "1px solid #161b22", fontSize: 12, background: x.suspicious ? "#1a0e0e" : "transparent" }}>
                <td style={S.td}>
                  <div style={{ color: "#e6edf3", fontWeight: 600 }}>{x.suspicious ? "⚠️ " : ""}{x.user_name}</div>
                  <div style={{ color: "#5b6470", fontSize: 10 }}>{x.user_role}</div>
                </td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{x.device_name}</td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{x.location}</td>
                <td style={{ ...S.td, color: "#5b6470", fontFamily: "'Space Mono',monospace", fontSize: 11 }}>{x.ip}</td>
                <td style={{ ...S.td, color: "#5b6470" }}>{ago(x.login_at)}</td>
                <td style={{ ...S.td, color: "#5b6470" }}>{ago(x.last_active)}</td>
                <td style={S.td}><button onClick={() => logout(x.id)} style={S.btnLogout}>⏏ Logout</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Devices */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📟 DEVICE REGISTRY — {d.devices.length}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 10, marginTop: 10 }}>
          {d.devices.map(dev => (
            <div key={dev.id} style={{ background: "#0a0e16", border: `1px solid ${dev.authorized ? "#161b22" : "#ef444455"}`, borderRadius: 9, padding: "11px 13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{DEV_ICON[dev.type] || "📟"} {dev.name}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: dev.authorized ? "#10b981" : "#ef4444", fontFamily: "'Space Mono',monospace" }}>
                  {dev.authorized ? "● AUTHORIZED" : "○ UNAUTHORIZED"}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#5b6470", margin: "3px 0 8px" }}>{dev.type} · {dev.outlet} · aktif {ago(dev.last_seen)}</div>
              <button onClick={() => toggleDevice(dev.id, dev.authorized ? 0 : 1)}
                style={dev.authorized ? S.btnRevoke : S.btnAuth}>
                {dev.authorized ? "Cabut Otorisasi" : "✓ Otorisasi Device"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Space Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "8px 8px" },
  btnLogout: { background: "#ef44441f", border: "1px solid #ef444455", color: "#f87171", fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "'Space Mono',monospace", whiteSpace: "nowrap" },
  btnAuth: { background: "#10b981", color: "#04140c", border: "none", fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", width: "100%" },
  btnRevoke: { background: "transparent", border: "1px solid #21262d", color: "#9da7b3", fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", width: "100%" },
};
