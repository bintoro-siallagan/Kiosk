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
  const [creating, setCreating] = useState(false); // open modal create user
  const [customRoles, setCustomRoles] = useState([]); // custom roles dari RBAC (selain 15 default)

  const load = useCallback(() => {
    setErr(null);
    fetch(`${API}/api/auth/users`, { headers: { Authorization: token ? `Bearer ${token}` : undefined } })
      .then(r => r.ok ? r.json() : r.json().then(j => { throw new Error(j?.error || `HTTP ${r.status}`); }))
      .then(setUsers).catch(setErr);
  }, [API, token]);

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  // Load roles dari RBAC backend supaya dropdown create user mengikuti definisi role yg ada
  useEffect(() => {
    fetch(`${API}/api/rbac`).then(r => r.json()).then(j => {
      if (Array.isArray(j?.roles)) setCustomRoles(j.roles);
    }).catch(() => {});
  }, [API]);

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
    if (!confirm(`Unlock account "${u.name}"?\n\nFailed attempts will be reset to 0.`)) return;
    try {
      await callApi(`/api/auth/users/${u.id}/unlock`);
      setInfo(`✓ Account "${u.name}" reactivated`);
    } catch {}
  };

  const unlockAll = async () => {
    if (!confirm(`Unlock ALL locked accounts (${lockedCount} accounts)?\n\nFailed attempts will be reset.`)) return;
    try {
      const j = await callApi(`/api/auth/users/unlock-all`);
      setInfo(`✓ ${j.unlocked_count} accounts reactivated: ${(j.unlocked || []).join(", ")}`);
    } catch {}
  };

  const setPassword = async (u) => {
    const pwd = prompt(`Set new password for "${u.name}":\n\n(min 6 characters, leave empty to cancel)`);
    if (!pwd) return;
    if (pwd.length < 6) { alert("Password must be at least 6 characters"); return; }
    try {
      await callApi(`/api/auth/users/${u.id}/set-password`, "POST", { password: pwd });
      setInfo(`✓ Password for "${u.name}" updated`);
    } catch {}
  };

  const toggleActive = async (u) => {
    await callApi(`/api/auth/users/${u.id}`, "PATCH", { active: !u.active });
  };

  const deleteUser = async (u) => {
    if (!confirm(`Delete user "${u.name}"?\n\nRole: ${u.role}\nID: ${u.id}\n\n⚠️ This cannot be undone. User won't be able to log in after deletion.`)) return;
    try {
      await callApi(`/api/auth/users/${u.id}`, "DELETE");
      setInfo(`✓ User "${u.name}" deleted permanently`);
    } catch {}
  };

  return (
    <div style={{ padding: 20, color: "#e6edf3", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif" }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>karyaOS / AUTH / USERS</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginTop: 4, letterSpacing: -0.5 }}>👥 Users</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Manage user accounts, reset locked accounts, set passwords, assign roles.</div>
      </header>

      {/* KPI summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginBottom: 16 }}>
        <KpiCard icon="👥" label="TOTAL USERS"    value={users.length} color={CYAN} />
        <KpiCard icon="🔒" label="LOCKED"         value={lockedCount} color={lockedCount ? RED : "#475569"} />
        <KpiCard icon="✅" label="ACTIVE"         value={users.filter(u=>u.active).length} color={GREEN} />
        <KpiCard icon="🔑" label="WITH PASSWORD"  value={users.filter(u=>u.email).length} color={AMBER} />
      </div>

      {/* Action bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <Pills value={filter} onChange={setFilter} options={[["all","All"],["locked",`🔒 Locked (${lockedCount})`],["inactive","Inactive"]]} />
        <div style={{ flex: 1 }} />
        <button onClick={() => setCreating(true)} style={{ padding: "8px 16px", background: `linear-gradient(135deg, ${PURPLE}, #7c3aed)`, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", letterSpacing: 0.3 }}>
          ➕ Add User
        </button>
        {lockedCount > 0 && (
          <button onClick={unlockAll} disabled={busy} style={{ padding: "8px 14px", background: RED, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", letterSpacing: 0.3 }}>
            🔓 Unlock All ({lockedCount})
          </button>
        )}
        <button onClick={load} style={ghostBtn}>{busy ? "⏳" : "↻"} Refresh</button>
      </div>

      {info && (
        <div style={{ padding: "10px 14px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 10, color: "#86efac", fontSize: 13, marginBottom: 12 }}>
          {info}
        </div>
      )}

      {err && <ErrorInline error={err} onRetry={load} label="Unable to load users" />}

      {/* User table */}
      <div style={{ background: CARD_BG, border: BORDER, borderRadius: 12, overflow: "hidden", marginTop: 12 }}>
        <div style={{ padding: "12px 16px", borderBottom: BORDER, fontSize: 11, color: "#94a3b8", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700, display: "grid", gridTemplateColumns: "70px 1fr 1fr 90px 110px 1fr", gap: 10, alignItems: "center" }}>
          <div>ID</div><div>NAME</div><div>USERNAME</div><div>ROLE</div><div>STATUS</div><div style={{ textAlign: "right" }}>ACTIONS</div>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>👤</div>
            <div>{filter === "locked" ? "No locked accounts" : filter === "inactive" ? "No inactive accounts" : "No users"}</div>
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
                <span style={chip("#64748b")}>Inactive</span>
              ) : (
                <span style={chip(GREEN)}>Aktif</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
              {u.is_locked && (
                <button onClick={() => unlockOne(u)} disabled={busy} style={{...actionBtn, background: RED, color: "#fff", borderColor: RED}}>🔓 Unlock</button>
              )}
              <button onClick={() => setPassword(u)} disabled={busy} style={actionBtn}>🔑 Password</button>
              <button onClick={() => toggleActive(u)} disabled={busy} style={actionBtn}>{u.active ? "✕ Deactivate" : "✓ Activate"}</button>
              <button onClick={() => deleteUser(u)} disabled={busy} title="Delete user permanently" style={{ ...actionBtn, background: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.4)", color: "#fca5a5" }}>🗑️ Delete</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18, padding: 14, background: "rgba(168,85,247,0.05)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 10, fontSize: 12, color: "#cbd5e1", lineHeight: 1.6 }}>
        <div style={{ fontWeight: 800, color: PURPLE, marginBottom: 6 }}>💡 Security Tips</div>
        • Locked accounts auto-unlock after 15 minutes without intervention.<br/>
        • The <b>🔓 Unlock</b> button speeds up recovery for staff who forgot their password.<br/>
        • Enable backup PIN for all accounts — PIN login is unaffected by password lockout.<br/>
        • Login attempt audit available at <code>/api/auth/audit</code>.
      </div>

      {creating && (
        <CreateUserModal
          API={API} token={token} roles={customRoles}
          onClose={() => setCreating(false)}
          onCreated={(msg) => { setCreating(false); setInfo(msg); load(); }}
        />
      )}
    </div>
  );
}

function CreateUserModal({ API, token, roles, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState("kasir");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const genPin = () => setPin(String(Math.floor(100000 + Math.random() * 900000)));

  const submit = async () => {
    setErr("");
    if (!name.trim()) { setErr("Name is required"); return; }
    if (!/^\d{6}$/.test(pin)) { setErr("PIN must be 6 digits"); return; }
    if (!role) { setErr("Please select a role"); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/auth/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : undefined },
        body: JSON.stringify({ name: name.trim(), pin, role }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Gagal");
      onCreated(`✓ User "${name}" dibuat — PIN: ${pin}, Role: ${role}`);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20, backdropFilter: "blur(6px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(480px, 100%)", background: "rgba(10,15,28,0.96)", border: `1px solid ${PURPLE}55`, borderRadius: 16, padding: 26 }}>
        <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>NEW USER</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginTop: 6, marginBottom: 16 }}>➕ Tambah New Users</div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 700 }}>FULL NAME *</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g.: Andre Wijaya" autoFocus
            style={{ width: "100%", padding: 10, background: "rgba(0,0,0,0.4)", border: BORDER, borderRadius: 8, color: "#fff", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 700 }}>6-DIGIT PIN *</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={pin} onChange={e => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="e.g.: 123456" inputMode="numeric" maxLength={6}
              style={{ flex: 1, padding: 10, background: "rgba(0,0,0,0.4)", border: BORDER, borderRadius: 8, color: "#fff", fontSize: 18, fontFamily: "'Geist Mono',monospace", letterSpacing: 4, textAlign: "center", boxSizing: "border-box", outline: "none" }} />
            <button onClick={genPin} title="Generate random PIN" style={{ padding: "10px 14px", background: `${PURPLE}22`, border: `1px solid ${PURPLE}55`, borderRadius: 8, color: PURPLE, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>🎲</button>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 700 }}>ROLE *</div>
          <select value={role} onChange={e => setRole(e.target.value)}
            style={{ width: "100%", padding: 10, background: "rgba(0,0,0,0.4)", border: BORDER, borderRadius: 8, color: "#fff", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none", cursor: "pointer" }}>
            {(roles && roles.length > 0 ? roles : [
              { id: "owner", name: "Owner / Director", icon: "💼" },
              { id: "manager", name: "Outlet Manager", icon: "👑" },
              { id: "supervisor", name: "Supervisor", icon: "🧭" },
              { id: "kasir", name: "Kasir / Crew", icon: "🧾" },
              { id: "kitchen", name: "Kitchen", icon: "👨‍🍳" },
              { id: "warehouse", name: "Warehouse", icon: "📦" },
              { id: "finance", name: "Finance", icon: "💰" },
              { id: "hr", name: "HR", icon: "👥" },
              { id: "marketing", name: "Marketing", icon: "🎯" },
              { id: "auditor", name: "Auditor", icon: "🔍" },
            ]).filter(r => r.id !== "super-admin" && r.id !== "customer").map(r => (
              <option key={r.id} value={r.id}>{r.icon || "👤"} {r.name || r.id}</option>
            ))}
          </select>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
            💡 Role determines module access (configure permissions in <b>Roles & Permissions</b>).
          </div>
        </div>

        {err && <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.1)", border: `1px solid ${RED}55`, borderRadius: 8, color: "#fca5a5", fontSize: 12, marginBottom: 12 }}>⚠ {err}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} disabled={busy} style={{ flex: 1, padding: 12, background: "rgba(255,255,255,0.06)", border: BORDER, borderRadius: 10, color: "#fff", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{ flex: 2, padding: 12, background: `linear-gradient(135deg, ${PURPLE}, #7c3aed)`, border: "none", borderRadius: 10, color: "#fff", fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {busy ? "⏳ Processing…" : "➕ Add User"}
          </button>
        </div>
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
