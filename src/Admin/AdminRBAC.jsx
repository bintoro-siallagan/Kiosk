// src/Admin/AdminRBAC.jsx
// RBAC — permission matrix 15 role × 12 modul. Klik cell buat ganti level.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const LEVELS = ["none", "view", "edit", "approve", "full"];
const LV_C = { none: "#161b22", view: "#3b82f6", edit: "#10b981", approve: "#f59e0b", full: "#a855f7" };
const LV_AB = { none: "·", view: "V", edit: "E", approve: "A", full: "F" };

export default function AdminRBAC({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null); // { role, perms: { module_id: level } }

  const load = useCallback(() => {
    fetch(`${apiBase}/api/rbac`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const lv = (roleId, modId) => {
    const p = d.permissions.find(x => x.role_id === roleId && x.module_id === modId);
    return p ? p.level : "none";
  };
  const cycle = (roleId, modId) => {
    const cur = lv(roleId, modId);
    const next = LEVELS[(LEVELS.indexOf(cur) + 1) % LEVELS.length];
    // optimistic
    setD(prev => ({
      ...prev,
      permissions: prev.permissions.map(p =>
        p.role_id === roleId && p.module_id === modId ? { ...p, level: next } : p),
    }));
    fetch(`${apiBase}/api/rbac/permission`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_id: roleId, module_id: modId, level: next }),
    }).then(r => r.json()).then(j => { if (j.ok) setMsg(`✓ ${roleId} · ${modId} → ${next}`); }).catch(() => {});
  };

  const openEdit = (role) => {
    const perms = {};
    for (const m of d.modules) perms[m.id] = lv(role.id, m.id);
    setEditing({ role, perms });
  };

  const saveEdit = async () => {
    const role = editing.role;
    const updates = [];
    for (const [module_id, level] of Object.entries(editing.perms)) {
      updates.push(
        fetch(`${apiBase}/api/rbac/${role.id}/${module_id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ level }),
        })
      );
    }
    try {
      const responses = await Promise.all(updates);
      const ok = responses.every(r => r.ok);
      if (ok) { setMsg(`✓ Saved — ${role.name}`); setEditing(null); load(); }
      else setMsg("Partial failure");
    } catch (e) { setMsg(String(e)); }
  };

  const resetRole = async (role) => {
    const ok = await confirm({
      title: `Reset all access for "${role.name}"?`,
      message: "All permissions for this role will be set to 'none'. Cannot be undone.",
      danger: true, okLabel: "Reset",
    });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/rbac/${role.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg(`✓ Reset — ${role.name}`); load(); }  // English-friendly
    else setMsg(j.error || "gagal");
  };

  // Create custom role
  const [creating, setCreating] = useState(false);
  const [newRole, setNewRole] = useState({ name: "", icon: "⚙️", default_level: "view" });
  const [busy, setBusy] = useState(false);

  const submitCreate = async () => {
    if (!newRole.name.trim()) { setMsg("⚠ Role name is required"); return; }
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/api/rbac/roles`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRole),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "gagal");
      setMsg(`✓ Role "${j.name}" added · ID: ${j.id}`);
      setCreating(false);
      setNewRole({ name: "", icon: "⚙️", default_level: "view" });
      load();
    } catch (e) { setMsg("⚠ " + e.message); }
    setBusy(false);
  };

  const deleteRole = async (role) => {
    if (!role.custom) { setMsg("⚠ Built-in roles cannot be deleted, only reset"); return; }
    const ok = await confirm({
      title: `Delete role "${role.name}"?`,
      message: `This role will be permanently deleted. All users assigned to it need to be re-assigned.`,
      danger: true, okLabel: "Delete",
    });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/rbac/roles/${role.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg(`✓ Role "${role.name}" deleted`); load(); }
    else setMsg("⚠ " + (j.error || "failed"));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Loading RBAC Matrix…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🔐 <b style={{ color: "#a855f7" }}>RBAC — ROLE & PERMISSION MATRIX</b> — {s.roles} roles × {s.modules} modules.
        Click any cell to change access level: <b>none → view → edit → approve → full</b>. Dynamic RBAC, enterprise-ready.
      </div>

      {/* Action bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setCreating(true)} style={{ padding: "9px 16px", background: "linear-gradient(135deg, #a855f7, #7c3aed)", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", letterSpacing: 0.3 }}>
          ➕ Add Custom Role
        </button>
        {s.custom_roles > 0 && (
          <div style={{ padding: "9px 14px", background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 8, color: "#c084fc", fontSize: 11, fontFamily: "'Geist Mono',monospace", fontWeight: 700, alignSelf: "center" }}>
            {s.custom_roles} CUSTOM ROLE{s.custom_roles > 1 ? "S" : ""} ACTIVE
          </div>
        )}
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Roles"    v={String(s.roles)} c="#a855f7" />
        <Kpi label="System Modules" v={String(s.modules)} c="#3b82f6" />
        <Kpi label="Full Access"    v={String(s.full_access_roles)} c="#ef4444" sub="super admin" />
        <Kpi label="Read-only"      v={String(s.readonly_roles)} c="#10b981" sub="auditor" />
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, margin: "14px 2px 10px", flexWrap: "wrap" }}>
        {LEVELS.map(l => (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#9da7b3" }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: LV_C[l], display: "inline-block", border: "1px solid #21262d" }} />
            {l}
          </span>
        ))}
        {msg ? <span style={{ marginLeft: "auto", fontSize: 11, color: "#10b981", fontFamily: "'Geist Mono',monospace" }}>{msg}</span> : null}
      </div>

      {/* Matrix */}
      <div style={{ ...S.card, overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...S.cornerTh }}>ROLE \ MODULE</th>
              {d.modules.map(m => (
                <th key={m.id} style={S.modTh} title={m.name}>
                  <div style={{ fontSize: 15 }}>{m.icon}</div>
                  <div style={{ fontSize: 8, color: "#5b6470", marginTop: 2 }}>{m.name.split(" ")[0]}</div>
                </th>
              ))}
              <th style={{ ...S.modTh, minWidth: 80, fontSize: 9, color: "#5b6470" }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {d.roles.map(r => (
              <tr key={r.id} style={r.custom ? { background: "rgba(168,85,247,0.04)" } : {}}>
                <td style={S.roleTd}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#e6edf3" }}>
                    {r.icon} {r.name}
                    {r.custom && <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px", background: "#a855f722", border: "1px solid #a855f744", borderRadius: 3, color: "#c084fc", fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>CUSTOM</span>}
                  </div>
                  <div style={{ fontSize: 9, color: "#5b6470" }}>{r.cat} · {r.modules_accessible} modul</div>
                </td>
                {d.modules.map(m => {
                  const level = lv(r.id, m.id);
                  return (
                    <td key={m.id} style={{ padding: 2, textAlign: "center" }}>
                      <button onClick={() => cycle(r.id, m.id)} title={`${r.name} · ${m.name} → ${level}`}
                        style={{ width: 38, height: 30, borderRadius: 5, cursor: "pointer", border: "1px solid #21262d",
                          background: LV_C[level], color: level === "none" ? "#5b6470" : "#fff",
                          fontSize: 11, fontWeight: 700, fontFamily: "'Geist Mono',monospace" }}>
                        {LV_AB[level]}
                      </button>
                    </td>
                  );
                })}
                <td style={{ padding: 2, textAlign: "center", whiteSpace: "nowrap" }}>
                  <button onClick={() => openEdit(r)} title="Edit semua permission role" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, marginRight: 4 }}>✏️</button>
                  {r.custom ? (
                    <button onClick={() => deleteRole(r)} title="Hapus custom role" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
                  ) : (
                    <button onClick={() => resetRole(r)} title="Reset semua permission role ke 'none'" style={{ background: "#64748b22", border: "1px solid #64748b44", color: "#94a3b8", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>♻️</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: "#5b6470", marginTop: 8 }}>
        💡 Each role has different dashboard &amp; access. Changes are saved automatically &amp; take effect immediately.
      </div>

      {creating && (
        <div onClick={() => setCreating(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20, backdropFilter: "blur(6px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #a855f755", borderRadius: 14, padding: 24, maxWidth: 460, width: "100%" }}>
            <div style={{ fontSize: 11, color: "#a855f7", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>NEW CUSTOM ROLE</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginTop: 6, marginBottom: 14 }}>➕ Add New Role</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 700 }}>NAMA ROLE *</div>
              <input value={newRole.name} onChange={e => setNewRole({ ...newRole, name: e.target.value })} placeholder="cth: Floor Supervisor" autoFocus style={{ ...modalInp, width: "100%" }} />
              <div style={{ fontSize: 10, color: "#5b6470", marginTop: 4 }}>ID auto-generated from name (slugified). "Floor Supervisor" → id "floor-supervisor"</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 700 }}>ICON</div>
                <input value={newRole.icon} onChange={e => setNewRole({ ...newRole, icon: e.target.value })} maxLength={2} style={{ ...modalInp, width: "100%", textAlign: "center", fontSize: 20 }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 700 }}>DEFAULT AKSES</div>
                <select value={newRole.default_level} onChange={e => setNewRole({ ...newRole, default_level: e.target.value })} style={{ ...modalInp, width: "100%" }}>
                  <option value="none">None (atur manual nanti)</option>
                  <option value="view">View (read-only semua modul)</option>
                  <option value="edit">Edit (bisa ubah semua modul)</option>
                  <option value="approve">Approve</option>
                  <option value="full">Full Access</option>
                </select>
              </div>
            </div>
            <div style={{ padding: 10, background: "rgba(168,85,247,0.06)", border: "1px solid #a855f733", borderRadius: 8, fontSize: 11, color: "#cbd5e1", marginBottom: 14, lineHeight: 1.5 }}>
              💡 After the role is created, configure module-level access by clicking cells in the matrix below. Users can be assigned this role in <b>Users</b>.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setCreating(false)} disabled={busy} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 600 }}>Batal</button>
              <button onClick={submitCreate} disabled={busy || !newRole.name.trim()} style={{ background: "linear-gradient(135deg, #a855f7, #7c3aed)", color: "#fff", border: "none", padding: "8px 18px", borderRadius: 7, cursor: (busy || !newRole.name.trim()) ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 800, opacity: (busy || !newRole.name.trim()) ? 0.5 : 1 }}>
                {busy ? "⏳ Processing…" : "➕ Add Role"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.role.icon} {editing.role.name}</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 12 }}>{editing.role.cat} — atur level akses per modul.</div>
            <div style={{ display: "grid", gap: 8 }}>
              {d.modules.map(m => (
                <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#e6edf3" }}>
                  <span style={{ flex: 1 }}>{m.icon} {m.name}</span>
                  <select value={editing.perms[m.id] || "none"} onChange={e => setEditing({ ...editing, perms: { ...editing.perms, [m.id]: e.target.value } })} style={{ ...modalInp, width: 130 }}>
                    {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Batal</button>
              <button onClick={saveEdit} style={{ background: "#10b981", color: "#04130c", border: "none", padding: "8px 18px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>💾 Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, v, c, sub }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", margin: "4px 0 2px" }}>{v}</div>
      <div style={{ fontSize: 10, color: "#5b6470" }}>{sub || " "}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  cornerTh: { textAlign: "left", padding: "6px 8px", fontSize: 9, color: "#5b6470", fontFamily: "'Geist Mono',monospace", minWidth: 180, position: "sticky", left: 0, background: "#0d1117" },
  modTh: { padding: "4px 2px", textAlign: "center", minWidth: 42 },
  roleTd: { padding: "6px 8px", borderTop: "1px solid #161b22", position: "sticky", left: 0, background: "#0d1117" },
};

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };
