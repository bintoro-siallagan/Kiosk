// karyaOS — Admin User Management
// Super-admin only: list users, unlock locked accounts, set new password,
// flip active flag. Built around /api/auth/users endpoints.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorInline } from "../components/ConnectionError.jsx";

const PURPLE = "#a855f7", GREEN = "#10b981", AMBER = "#f59e0b", RED = "#ef4444", CYAN = "#22d3ee";
const CARD_BG = "rgba(255,255,255,0.04)";
const BORDER  = "1px solid rgba(255,255,255,0.08)";

export default function AdminUsers({ apiBase = "" }) {
  const API = apiBase || (typeof window !== "undefined" && window.location.origin) || "";
  const token = typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all"); // all | locked | inactive
  const [info, setInfo] = useState("");

  const load = useCallback(() => {
    setErr(null);
    fetch(`${API}/api/auth/users`, { headers: { Authorization: token ? `Bearer ${token}` : undefined } })
      .then(r => r.ok ? r.json() : r.json().then(j => { throw new Error(j?.error || `HTTP ${r.status}`); }))
      .then(setUsers).catch(setErr);
  }, [API, token]);

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const filtered = useMemo(() => {
    return users.filter(u => {
      if (filter === "locked") return u.is_locked;
      if (filter === "inactive") return !u.active;
      return true;
    });
  }, [users, filter]);

  const lockedCount = users.filter(u => u.is_locked).length;

  const callApi = async (path, method = "POST", body) => {
    setBusy(true); setInfo("");
    try {
      const r = await fetch(`${API}${path}`, {
        method,
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : undefined },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      load();
      return j;
    } catch (e) { setErr(e); throw e; }
    finally { setBusy(false); }
  };

  const unlockOne = async (u) => {
    if (!confirm(`Unlock akun "${u.name}"?\n\nFailed attempts akan di-reset ke 0.`)) return;
    try {
      await callApi(`/api/auth/users/${u.id}/unlock`);
      setInfo(`✓ Akun "${u.name}" sudah aktif kembali`);
    } catch {}
  };

  const unlockAll = async () => {
    if (!confirm(`Unlock SEMUA akun terkunci (${lockedCount} akun)?\n\nFailed attempts akan di-reset.`)) return;
    try {
      const j = await callApi(`/api/auth/users/unlock-all`);
      setInfo(`✓ ${j.unlocked_count} akun sudah aktif kembali: ${(j.unlocked || []).join(", ")}`);
    } catch {}
  };

  const setPassword = async (u) => {
    const pwd = prompt(`Set password baru untuk "${u.name}":\n\n(min 6 karakter, kosongkan untuk batal)`);
    if (!pwd) return;
    if (pwd.length < 6) { alert("Password minimal 6 karakter"); return; }
    try {
      await callApi(`/api/auth/users/${u.id}/set-password`, "POST", { password: pwd });
      setInfo(`✓ Password "${u.name}" sudah diperbarui`);
    } catch {}
  };

  const toggleActive = async (u) => {
    await callApi(`/api/auth/users/${u.id}`, "PATCH", { active: !u.active });
  };

  return (
    <div style={{ padding: 20, color: "#e6edf3", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif" }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>karyaOS / AUTH / USERS</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginTop: 4, letterSpacing: -0.5 }}>👥 Manajemen Pengguna</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Reset akun terkunci, atur password, kelola peran.</div>
      </header>

      {/* KPI summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginBottom: 16 }}>
        <KpiCard icon="👥" label="TOTAL"          value={users.length} color={CYAN} />
        <KpiCard icon="🔒" label="TERKUNCI"       value={lockedCount} color={lockedCount ? RED : "#475569"} />
        <KpiCard icon="✅" label="AKTIF"          value={users.filter(u=>u.active).length} color={GREEN} />
        <KpiCard icon="🔑" label="PUNYA PASSWORD" value={users.filter(u=>u.email).length} color={AMBER} />
      </div>

      {/* Action bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <Pills value={filter} onChange={setFilter} options={[["all","Semua"],["locked",`🔒 Terkunci (${lockedCount})`],["inactive","Nonaktif"]]} />
        <div style={{ flex: 1 }} />
        {lockedCount > 0 && (
          <button onClick={unlockAll} disabled={busy} style={{ padding: "8px 14px", background: RED, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", letterSpacing: 0.3 }}>
            🔓 Buka Semua Akun Terkunci ({lockedCount})
          </button>
        )}
        <button onClick={load} style={ghostBtn}>{busy ? "⏳" : "↻"} Refresh</button>
      </div>

      {info && (
        <div style={{ padding: "10px 14px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 10, color: "#86efac", fontSize: 13, marginBottom: 12 }}>
          {info}
        </div>
      )}

      {err && <ErrorInline error={err} onRetry={load} label="Daftar pengguna belum dapat dimuat" />}

      {/* User table */}
      <div style={{ background: CARD_BG, border: BORDER, borderRadius: 12, overflow: "hidden", marginTop: 12 }}>
        <div style={{ padding: "12px 16px", borderBottom: BORDER, fontSize: 11, color: "#94a3b8", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700, display: "grid", gridTemplateColumns: "70px 1fr 1fr 90px 110px 1fr", gap: 10, alignItems: "center" }}>
          <div>ID</div><div>NAMA</div><div>USERNAME</div><div>ROLE</div><div>STATUS</div><div style={{ textAlign: "right" }}>AKSI</div>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>👤</div>
            <div>{filter === "locked" ? "Tidak ada akun terkunci" : filter === "inactive" ? "Tidak ada akun nonaktif" : "Belum ada pengguna"}</div>
          </div>
        )}
        {filtered.map(u => (
          <div key={u.id} style={{
            padding: "14px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            display: "grid", gridTemplateColumns: "70px 1fr 1fr 90px 110px 1fr", gap: 10, alignItems: "center",
            background: u.is_locked ? "rgba(239,68,68,0.05)" : "transparent",
          }}>
            <div style={{ fontSize: 11, fontFamily: "'Geist Mono',monospace", color: "#94a3b8" }}>{u.id}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{u.name}</div>
              {u.email && <div style={{ fontSize: 11, color: "#94a3b8" }}>{u.email}</div>}
            </div>
            <div style={{ fontSize: 12, color: u.username ? "#cbd5e1" : "#475569", fontFamily: "'Geist Mono',monospace" }}>{u.username || "—"}</div>
            <div style={{ fontSize: 11, color: roleColor(u.role), fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{u.role}</div>
            <div>
              {u.is_locked ? (
                <span style={chip(RED)}>🔒 {u.lock_remaining_min}m</span>
              ) : !u.active ? (
                <span style={chip("#64748b")}>Nonaktif</span>
              ) : (
                <span style={chip(GREEN)}>Aktif</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              {u.is_locked && (
                <button onClick={() => unlockOne(u)} disabled={busy} style={{...actionBtn, background: RED, color: "#fff", borderColor: RED}}>🔓 Unlock</button>
              )}
              <button onClick={() => setPassword(u)} disabled={busy} style={actionBtn}>🔑 Password</button>
              <button onClick={() => toggleActive(u)} disabled={busy} style={actionBtn}>{u.active ? "✕ Nonaktif" : "✓ Aktif"}</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18, padding: 14, background: "rgba(168,85,247,0.05)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 10, fontSize: 12, color: "#cbd5e1", lineHeight: 1.6 }}>
        <div style={{ fontWeight: 800, color: PURPLE, marginBottom: 6 }}>💡 Tips Keamanan</div>
        • Akun terkunci otomatis dibuka setelah 15 menit tanpa intervensi.<br/>
        • Tombol <b>🔓 Unlock</b> bisa mempercepat recovery untuk staf yang lupa password.<br/>
        • Aktifkan PIN backup untuk semua akun — login PIN tidak terpengaruh lockout password.<br/>
        • Audit login attempt tersedia via <code>/api/auth/audit</code>.
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, color }) {
  return (
    <div style={{ padding: 12, background: CARD_BG, border: BORDER, borderRadius: 10 }}>
      <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 1.3, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{icon} {label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color, marginTop: 4, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

function Pills({ value, onChange, options }) {
  return (
    <div style={{ display: "flex", gap: 4, padding: 4, background: CARD_BG, border: BORDER, borderRadius: 10 }}>
      {options.map(([k, lbl]) => (
        <button key={k} onClick={() => onChange(k)} style={{
          padding: "6px 12px", background: value === k ? PURPLE : "transparent",
          border: "none", borderRadius: 7, color: value === k ? "#fff" : "#94a3b8",
          fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", letterSpacing: 0.4,
        }}>{lbl}</button>
      ))}
    </div>
  );
}

function chip(color) {
  return { padding: "4px 9px", background: `${color}22`, border: `1px solid ${color}55`, borderRadius: 6, fontSize: 11, color, fontWeight: 800, fontFamily: "'Geist Mono',monospace", letterSpacing: 0.3 };
}

const ghostBtn = { padding: "8px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" };
const actionBtn = { padding: "5px 10px", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, color: "#cbd5e1", fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", letterSpacing: 0.2 };

function roleColor(role) {
  if (role === "super-admin") return PURPLE;
  if (role === "manager") return CYAN;
  if (role === "kasir") return AMBER;
  return "#94a3b8";
}
