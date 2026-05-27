// src/Admin/AdminDeviceSession.jsx
// Device & Session Control — device authorization, session monitor,
// suspicious login alert, force logout.

import { useState, useEffect, useCallback } from "react";
import { useUiKit , LoadingState} from "../components/uiKit.jsx";

const AC = "#3b82f6";
const DEVICE_TYPES = ["pos", "kiosk", "desktop", "tablet", "mobile"];
const ago = (ts) => {
  if (!ts) return "—";
  const m = Math.floor((Date.now() / 1000 - ts) / 60);
  if (m < 1) return "baru saja";
  if (m < 60) return m + " min lalu";
  const h = Math.floor(m / 60);
  return h < 24 ? h + " hr lalu" : Math.floor(h / 24) + " day lalu";
};
const DEV_ICON = { pos: "💳", kiosk: "🛎️", desktop: "🖥️", tablet: "📱", mobile: "📲" };

export default function AdminDeviceSession({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);

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
  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/device-session/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (item) => {
    const ok = await confirm({
      title: `Hapus "${item.name || '#' + item.id}"?`,
      message: "Device akan dihapus permanen. Tidak bisa dibatalkan.",
      danger: true, okLabel: "Delete",
    });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/device-session/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <LoadingState label="Memuat Device & Session…" />;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🖥️ <b style={{ color: AC }}>DEVICE &amp; SESSION CONTROL</b> — otorisasi device, monitor sesi login,
        deteksi login mencurigakan, force logout &amp; validasi lokasi.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Sesi Active" v={String(s.active_sessions)} c={AC} />
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
                <td style={{ ...S.td, color: "#5b6470", fontFamily: "'Geist Mono',monospace", fontSize: 11 }}>{x.ip}</td>
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
                <span style={{ fontSize: 9, fontWeight: 700, color: dev.authorized ? "#10b981" : "#ef4444", fontFamily: "'Geist Mono',monospace" }}>
                  {dev.authorized ? "● AUTHORIZED" : "○ UNAUTHORIZED"}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#5b6470", margin: "3px 0 8px" }}>{dev.type} · {dev.outlet} · aktif {ago(dev.last_seen)}</div>
              <button onClick={() => toggleDevice(dev.id, dev.authorized ? 0 : 1)}
                style={dev.authorized ? S.btnRevoke : S.btnAuth}>
                {dev.authorized ? "Cabut Otorisasi" : "✓ Otorisasi Device"}
              </button>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => setEditing({ ...dev })} title="Edit" style={{ flex: 1, background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "5px 9px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️ Edit</button>
                <button onClick={() => remove(dev)} title="Delete" style={{ flex: 1, background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "5px 9px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️ Hapus</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 480, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.name || '#' + editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <label style={modalLbl}>Nama Device</label>
                <input value={editing.name || ""} onChange={e => setEditing({ ...editing, name: e.target.value })} style={modalInp} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={modalLbl}>Tipe</label>
                  <select value={editing.type || ""} onChange={e => setEditing({ ...editing, type: e.target.value })} style={modalInp}>
                    {DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={modalLbl}>Outlet</label>
                  <input value={editing.outlet || ""} onChange={e => setEditing({ ...editing, outlet: e.target.value })} style={modalInp} />
                </div>
              </div>
              <div>
                <label style={modalLbl}>Otorisasi</label>
                <select value={editing.authorized ? "1" : "0"} onChange={e => setEditing({ ...editing, authorized: Number(e.target.value) })} style={modalInp}>
                  <option value="1">Authorized</option>
                  <option value="0">Unauthorized</option>
                </select>
              </div>
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
const modalLbl = { fontSize: 10, color: "#9ca3af", fontFamily: "'Geist Mono',monospace", letterSpacing: 0.4, display: "block", marginBottom: 4 };

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
  td: { padding: "8px 8px" },
  btnLogout: { background: "#ef44441f", border: "1px solid #ef444455", color: "#f87171", fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "'Geist Mono',monospace", whiteSpace: "nowrap" },
  btnAuth: { background: "#10b981", color: "#04140c", border: "none", fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", width: "100%" },
  btnRevoke: { background: "transparent", border: "1px solid #21262d", color: "#9da7b3", fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", width: "100%" },
};
