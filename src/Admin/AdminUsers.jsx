// karyaOS — Admin User Management
// Super-admin only: list users, unlock locked accounts, set new password,
// flip active flag. Built around /api/auth/users endpoints.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ROLE_LIST } from "../lib/rbac.js";
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
  const [editVerticalUser, setEditVerticalUser] = useState(null); // P6: open vertical edit modal
  const [editingUser, setEditingUser] = useState(null); // open full edit modal (nama+role+vertical)
  const [customRoles, setCustomRoles] = useState([]); // custom roles dari RBAC backend (legacy + custom)
  const [search, setSearch] = useState("");

  // Merge: ROLE_LIST (new presets — manager/fnb-manager/finance-spv dll) + legacy /api/rbac
  // ROLE_LIST diutamakan, legacy ditambahin jika id-nya gak overlap.
  const mergedRoles = useMemo(() => {
    const seen = new Set(ROLE_LIST.map(r => r.id));
    const extras = (customRoles || []).filter(r => !seen.has(r.id));
    return [...ROLE_LIST, ...extras];
  }, [customRoles]);

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
    const q = search.trim().toLowerCase();
    return users.filter(u => {
      if (filter === "locked" && !u.is_locked) return false;
      if (filter === "inactive" && u.active) return false;
      if (q) {
        const hay = `${u.name || ""} ${u.username || ""} ${u.email || ""} ${u.role || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, filter, search]);

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

  // Reset PIN — Manager generate ulang PIN 6-digit kasir (lupa PIN, dll).
  // PATCH /api/auth/users/:id dgn { pin } — validasi weak-PIN di backend.
  const resetPin = async (u) => {
    const suggested = String(Math.floor(100000 + Math.random() * 900000));
    const newPin = prompt(
      `Reset PIN untuk "${u.name}":\n\n` +
      `Ketik PIN baru (6 digit angka), atau kosongkan = pakai usulan random.\n` +
      `Usulan: ${suggested}\n\n` +
      `⚠️ Hindari PIN lemah (999999, 123456, sequential, atau berulang).`,
      suggested
    );
    if (newPin === null) return; // cancel
    const pin = (newPin || "").trim();
    if (!/^\d{6}$/.test(pin)) { alert("PIN harus 6 digit angka."); return; }
    if (!confirm(`Reset PIN "${u.name}" → ${pin}?\n\nKasir wajib pakai PIN baru ini untuk login.\nCatat dulu sebelum klik OK.`)) return;
    try {
      await callApi(`/api/auth/users/${u.id}`, "PATCH", { pin });
      setInfo(`✓ PIN "${u.name}" diganti → ${pin} (kasih tau kasir-nya)`);
    } catch (e) {
      alert("Gagal reset PIN: " + (e?.message || e));
    }
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
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search nama / username / role…"
          style={{ flex: 1, minWidth: 220, padding: "8px 12px", background: CARD_BG, border: BORDER, borderRadius: 8, color: "#fff", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
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
        <div style={{ padding: "12px 16px", borderBottom: BORDER, fontSize: 11, color: "#94a3b8", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700, display: "grid", gridTemplateColumns: "60px 1.2fr 1fr 180px 100px 1.5fr", gap: 10, alignItems: "center" }}>
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
            display: "grid", gridTemplateColumns: "60px 1.2fr 1fr 180px 100px 1.5fr", gap: 10, alignItems: "center",
            background: u.is_locked ? "rgba(239,68,68,0.05)" : "transparent",
          }}>
            <div style={{ fontSize: 11, fontFamily: "'Geist Mono',monospace", color: "#94a3b8" }}>{u.id}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{u.name}</div>
              {u.email && <div style={{ fontSize: 11, color: "#94a3b8" }}>{u.email}</div>}
            </div>
            <div style={{ fontSize: 12, color: u.username ? "#cbd5e1" : "#475569", fontFamily: "'Geist Mono',monospace" }}>{u.username || "—"}</div>
            <div style={{ fontSize: 12, color: roleColor(u.role), fontWeight: 700, letterSpacing: 0.2 }} title={u.role}>{roleLabel(u.role)}</div>
            <div>
              {u.is_locked ? (
                <span style={chip(RED)}>🔒 {u.lock_remaining_min}m</span>
              ) : !u.active ? (
                <span style={chip("#64748b")}>Inactive</span>
              ) : (
                <span style={chip(GREEN)}>Active</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap", alignItems: "center" }}>
              {/* P6: Vertical badge + edit */}
              <button onClick={() => setEditVerticalUser(u)} title="Set vertical access" style={verticalBadge(u.vertical)}>
                {u.vertical === "fnb" ? "🍔 FNB" : u.vertical === "cinema" ? "🎬 Cinema" : u.vertical === "hybrid" ? "🌐 Hybrid" : "⤵ Inherit"}
              </button>
              {/* Branch / Outlet code badge — visible at glance */}
              {u.outlet_code ? (
                <span title={`Outlet binding: ${u.outlet_code}`} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "3px 8px", borderRadius: 4,
                  background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.35)",
                  color: "#38BDF8", fontSize: 10, fontWeight: 800,
                  fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5,
                }}>📍 {u.outlet_code}</span>
              ) : (
                <span title="HQ Access — user lihat data semua outlet" style={{
                  padding: "3px 8px", borderRadius: 4,
                  background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.3)",
                  color: "#c4b5fd", fontSize: 10, fontWeight: 800,
                  fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5,
                }}>🌐 HQ ALL</span>
              )}
              {u.is_locked && (
                <button onClick={() => unlockOne(u)} disabled={busy} style={{...actionBtn, background: RED, color: "#fff", borderColor: RED}}>🔓 Unlock</button>
              )}
              <button onClick={() => setEditingUser(u)} disabled={busy} title="Edit nama, role, vertical" style={{ ...actionBtn, background: `${PURPLE}15`, borderColor: `${PURPLE}55`, color: PURPLE }}>✏️ Edit</button>
              <button onClick={() => setPassword(u)} disabled={busy} style={actionBtn}>🔑 Password</button>
              <button onClick={() => resetPin(u)} disabled={busy} style={actionBtn}>🔢 Reset PIN</button>
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
          API={API} token={token} roles={mergedRoles}
          onClose={() => setCreating(false)}
          onCreated={(msg) => { setCreating(false); setInfo(msg); load(); }}
        />
      )}

      {editVerticalUser && (
        <EditVerticalModal
          user={editVerticalUser}
          API={API} token={token}
          onClose={() => setEditVerticalUser(null)}
          onSaved={(msg) => { setEditVerticalUser(null); setInfo(msg); load(); }}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          API={API} token={token} roles={mergedRoles}
          onClose={() => setEditingUser(null)}
          onSaved={(msg) => { setEditingUser(null); setInfo(msg); load(); }}
        />
      )}
    </div>
  );
}

// P6: Quick modal to set/clear vertical access for a user
function EditVerticalModal({ user, API, token, onClose, onSaved }) {
  const [vertical, setVertical] = useState(user.vertical || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`${API}/api/auth/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : undefined },
        body: JSON.stringify({ vertical: vertical || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Gagal");
      const label = vertical === "fnb" ? "F&B only" : vertical === "cinema" ? "Cinema only" : vertical === "hybrid" ? "Hybrid (F&B + Cinema)" : "Inherit company";
      onSaved(`✓ ${user.name} → ${label}`);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20, backdropFilter: "blur(6px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(440px, 100%)", background: "rgba(10,15,28,0.96)", border: `1px solid ${PURPLE}55`, borderRadius: 16, padding: 24 }}>
        <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>VERTICAL ACCESS</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginTop: 6, marginBottom: 4 }}>🎚 Set Vertical: {user.name}</div>
        <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 18, lineHeight: 1.6 }}>
          Pilih modul yg bisa diakses user ini. Filter ini control menu sidebar di admin dashboard.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {[
            { v: "",       l: "⤵ Inherit dari company",       d: "Ikut setting vertical company (default)" },
            { v: "fnb",    l: "🍔 F&B Only",                   d: "User cuma lihat menu F&B (POS, KDS, Stock F&B, dll)" },
            { v: "cinema", l: "🎬 Cinema Only",                d: "User cuma lihat menu Cinema (Ops, Tickets, Studio, dll)" },
            { v: "hybrid", l: "🌐 Hybrid — F&B + Cinema",      d: "User lihat semua modul (untuk multi-vertical company)" },
          ].map(opt => {
            const active = vertical === opt.v;
            return (
              <label key={opt.v || "inherit"} style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: 12,
                background: active ? "rgba(168,85,247,0.08)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${active ? PURPLE : "rgba(255,255,255,0.06)"}`,
                borderRadius: 10, cursor: "pointer",
              }}>
                <input type="radio" name="vertical" checked={active} onChange={() => setVertical(opt.v)} style={{ marginTop: 3, cursor: "pointer" }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: active ? PURPLE : "#fff" }}>{opt.l}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{opt.d}</div>
                </div>
              </label>
            );
          })}
        </div>

        {err && <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.1)", border: `1px solid ${RED}55`, borderRadius: 8, color: "#fca5a5", fontSize: 12, marginBottom: 12 }}>⚠ {err}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} disabled={busy} style={{ flex: 1, padding: 12, background: "rgba(255,255,255,0.06)", border: BORDER, borderRadius: 10, color: "#fff", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={save} disabled={busy} style={{ flex: 2, padding: 12, background: `linear-gradient(135deg, ${PURPLE}, #7c3aed)`, border: "none", borderRadius: 10, color: "#fff", fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {busy ? "⏳ Saving…" : "💾 Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Edit user: nama, role, vertical, outlet binding (4-in-1)
function EditUserModal({ user, API, token, roles, onClose, onSaved }) {
  const [name, setName] = useState(user.name || "");
  const [role, setRole] = useState(user.role || "");
  const [vertical, setVertical] = useState(user.vertical || "");
  const [outletCode, setOutletCode] = useState(user.outlet_code || "");
  const [birthDate, setBirthDate] = useState(user.birth_date || "");
  const [outlets, setOutlets] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Load outlets — filter by selected vertical (kalau ada)
  useEffect(() => {
    fetch(`${API}/api/outlet-master`).then(r => r.json()).then(d => {
      setOutlets(d.outlets || []);
    }).catch(() => {});
  }, [API]);

  const filteredOutlets = vertical
    ? outlets.filter(o => o.vertical === vertical || o.vertical === "hybrid")
    : outlets;

  const save = async () => {
    setErr("");
    if (!name.trim()) { setErr("Nama tidak boleh kosong"); return; }
    if (!role) { setErr("Role wajib dipilih"); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/auth/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : undefined },
        body: JSON.stringify({ name: name.trim(), role, vertical: vertical || null, outlet_code: outletCode || null, birth_date: birthDate || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Gagal update user");
      onSaved(`✓ ${name} updated — role: ${role}${vertical ? `, vertical: ${vertical}` : ""}${outletCode ? `, outlet: ${outletCode}` : ""}`);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const dirty = name.trim() !== (user.name || "")
    || role !== (user.role || "")
    || (vertical || "") !== (user.vertical || "")
    || (outletCode || "") !== (user.outlet_code || "")
    || (birthDate || "") !== (user.birth_date || "");

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20, backdropFilter: "blur(6px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(480px, 100%)", background: "rgba(10,15,28,0.96)", border: `1px solid ${PURPLE}55`, borderRadius: 16, padding: 26 }}>
        <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>EDIT USER</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginTop: 6, marginBottom: 4 }}>✏️ Edit: {user.name}</div>
        <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 16, lineHeight: 1.6 }}>
          ID #{user.id} · username: <code style={{ color: "#cbd5e1" }}>{user.username || "—"}</code>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 700 }}>NAMA *</div>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus
            style={{ width: "100%", padding: 10, background: "rgba(0,0,0,0.4)", border: BORDER, borderRadius: 8, color: "#fff", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 700 }}>ROLE *</div>
          <select value={role} onChange={e => setRole(e.target.value)}
            style={{ width: "100%", padding: 10, background: "rgba(0,0,0,0.4)", border: BORDER, borderRadius: 8, color: "#fff", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none", cursor: "pointer" }}>
            {/* Selalu show current role even kalau gak ada di list, biar gak kosong */}
            {!(roles?.length || ROLE_LIST.length) ? <option value={user.role}>{user.role}</option> : null}
            {(roles && roles.length > 0 ? roles : ROLE_LIST).filter(r => r.id !== "customer").map(r => (
              <option key={r.id} value={r.id}>{r.icon || "👤"} {r.name || r.id}</option>
            ))}
            {/* Kalau current role gak ada di list, append biar tetap selectable */}
            {role && !(roles || ROLE_LIST).find(r => r.id === role) && (
              <option key={role} value={role}>⚙️ {role} (custom)</option>
            )}
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 700 }}>VERTICAL ACCESS</div>
          <select value={vertical} onChange={e => { setVertical(e.target.value); /* reset outlet kalau switch vertical */ if (outletCode) { const o = outlets.find(x => x.code === outletCode); if (o && o.vertical !== e.target.value && o.vertical !== "hybrid" && e.target.value) setOutletCode(""); } }}
            style={{ width: "100%", padding: 10, background: "rgba(0,0,0,0.4)", border: BORDER, borderRadius: 8, color: "#fff", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none", cursor: "pointer" }}>
            <option value="">⤵ Inherit dari company (default)</option>
            <option value="fnb">🍔 F&B Only</option>
            <option value="cinema">🎬 Cinema Only</option>
            <option value="hybrid">🌐 Hybrid — F&B + Cinema</option>
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 700 }}>
            🏬 OUTLET ACCESS
          </div>
          <select value={outletCode} onChange={e => setOutletCode(e.target.value)}
            style={{ width: "100%", padding: 10, background: "rgba(0,0,0,0.4)", border: BORDER, borderRadius: 8, color: "#fff", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none", cursor: "pointer" }}>
            <option value="">🌐 SEMUA OUTLET (HQ Access — lihat data semua lokasi)</option>
            <optgroup label="── Outlet Spesifik ──">
              {filteredOutlets.map(o => (
                <option key={o.code} value={o.code}>
                  📍 {o.code} · {o.name}{o.area ? ` (${o.area})` : ""}
                </option>
              ))}
            </optgroup>
          </select>
          {outletCode ? (
            <div style={{ marginTop: 6, padding: "8px 12px", background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.25)", borderRadius: 6, fontSize: 11.5, color: "#7dd3fc", lineHeight: 1.55 }}>
              📍 <strong>Outlet-bound:</strong> User hanya lihat data outlet ini (sales, tickets, reports). Cocok untuk Outlet Manager / Cashier.
            </div>
          ) : (
            <div style={{ marginTop: 6, padding: "8px 12px", background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 6, fontSize: 11.5, color: "#c4b5fd", lineHeight: 1.55 }}>
              🌐 <strong>HQ Access:</strong> User lihat data semua outlet. Cocok untuk Owner / Regional Manager / Auditor.
            </div>
          )}
        </div>

        {/* Tanggal lahir — untuk birthday recognition. Optional, tapi
            kalau diisi, kasir akan dapat sambutan ulang tahun pagi-pagi. */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 700 }}>
            🎂 TANGGAL LAHIR (opsional)
          </div>
          <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)}
            style={{ width: "100%", padding: 10, background: "rgba(0,0,0,0.4)", border: BORDER, borderRadius: 8, color: "#fff", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none", colorScheme: "dark" }} />
          <div style={{ marginTop: 6, padding: "8px 12px", background: "rgba(236,72,153,0.06)", border: "1px solid rgba(236,72,153,0.20)", borderRadius: 6, fontSize: 11, color: "#f9a8d4", lineHeight: 1.55 }}>
            💛 Saat ulang tahun, kasir dapat sambutan pink-gold di layar POS pagi-pagi. Boleh kosong kalau privacy.
          </div>
        </div>

        {err && <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.1)", border: `1px solid ${RED}55`, borderRadius: 8, color: "#fca5a5", fontSize: 12, marginBottom: 12 }}>⚠ {err}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} disabled={busy} style={{ flex: 1, padding: 12, background: "rgba(255,255,255,0.06)", border: BORDER, borderRadius: 10, color: "#fff", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={save} disabled={busy || !dirty} style={{ flex: 2, padding: 12, background: dirty ? `linear-gradient(135deg, ${PURPLE}, #7c3aed)` : "rgba(255,255,255,0.08)", border: "none", borderRadius: 10, color: dirty ? "#fff" : "#64748b", fontWeight: 800, cursor: busy || !dirty ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {busy ? "⏳ Saving…" : dirty ? "💾 Save Changes" : "No changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateUserModal({ API, token, roles, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState("kasir");
  const [vertical, setVertical] = useState("");  // P6: fnb | cinema | hybrid | "" (inherit)
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
        body: JSON.stringify({ name: name.trim(), pin, role, vertical: vertical || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Gagal");
      // After create, PATCH to apply vertical (POST endpoint mungkin gak handle vertical)
      if (vertical && j.id) {
        try {
          await fetch(`${API}/api/auth/users/${j.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : undefined },
            body: JSON.stringify({ vertical }),
          });
        } catch {}
      }
      onCreated(`✓ User "${name}" dibuat — PIN: ${pin}, Role: ${role}${vertical ? `, Vertical: ${vertical}` : ""}`);
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
            {(roles && roles.length > 0 ? roles : ROLE_LIST.length > 0 ? ROLE_LIST : [
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

        {/* P6: VERTICAL FILTER */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 700 }}>VERTICAL ACCESS</div>
          <select value={vertical} onChange={e => setVertical(e.target.value)}
            style={{ width: "100%", padding: 10, background: "rgba(0,0,0,0.4)", border: BORDER, borderRadius: 8, color: "#fff", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none", cursor: "pointer" }}>
            <option value="">⤵ Inherit dari company (default)</option>
            <option value="fnb">🍔 F&B Only — modul F&B saja</option>
            <option value="cinema">🎬 Cinema Only — modul Cinema saja</option>
            <option value="hybrid">🌐 Hybrid — F&B + Cinema</option>
          </select>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
            💡 Filter menu sidebar berdasarkan vertical user. Inherit = ikut setting company.
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

// P6: Vertical badge style — color by vertical type
function verticalBadge(v) {
  const cfg = {
    fnb:    { bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.4)", color: "#10b981" },
    cinema: { bg: "rgba(168,85,247,0.12)", border: "rgba(168,85,247,0.4)", color: "#a855f7" },
    hybrid: { bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.4)", color: "#fbbf24" },
  };
  const c = cfg[v] || { bg: "rgba(100,116,139,0.1)", border: "rgba(100,116,139,0.3)", color: "#94a3b8" };
  return {
    padding: "5px 10px", background: c.bg, border: `1px solid ${c.border}`,
    borderRadius: 6, color: c.color, fontSize: 11, fontWeight: 700,
    fontFamily: "inherit", cursor: "pointer", letterSpacing: 0.2, whiteSpace: "nowrap",
  };
}

function roleColor(role) {
  if (role === "super-admin") return PURPLE;
  if (role === "manager" || (role || "").endsWith("-manager") || role === "owner") return CYAN;
  if ((role || "").endsWith("-spv") || role === "supervisor") return "#fbbf24";
  if (role === "kasir") return AMBER;
  return "#94a3b8";
}

// Friendly label lookup: 'finance-manager' → '💰 Finance Manager'
function roleLabel(role) {
  const found = ROLE_LIST.find(r => r.id === role);
  if (found) return `${found.icon || "👤"} ${found.name}`;
  // Fallback: title-case slug
  return (role || "").split("-").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ") || "—";
}
