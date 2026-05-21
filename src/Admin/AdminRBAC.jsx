// src/Admin/AdminRBAC.jsx
// RBAC — permission matrix 15 role × 12 modul. Klik cell buat ganti level.

import { useState, useEffect, useCallback } from "react";

const LEVELS = ["none", "view", "edit", "approve", "full"];
const LV_C = { none: "#161b22", view: "#3b82f6", edit: "#10b981", approve: "#f59e0b", full: "#a855f7" };
const LV_AB = { none: "·", view: "V", edit: "E", approve: "A", full: "F" };

export default function AdminRBAC({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");

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

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat RBAC Matrix…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🔐 <b style={{ color: "#a855f7" }}>RBAC — ROLE & PERMISSION MATRIX</b> — {s.roles} role × {s.modules} modul.
        Klik cell buat ganti level akses: <b>none → view → edit → approve → full</b>. Dynamic RBAC, enterprise-ready.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Role" v={String(s.roles)} c="#a855f7" />
        <Kpi label="Modul Sistem" v={String(s.modules)} c="#3b82f6" />
        <Kpi label="Full Access" v={String(s.full_access_roles)} c="#ef4444" sub="super admin" />
        <Kpi label="Read-only" v={String(s.readonly_roles)} c="#10b981" sub="auditor" />
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, margin: "14px 2px 10px", flexWrap: "wrap" }}>
        {LEVELS.map(l => (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#9da7b3" }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: LV_C[l], display: "inline-block", border: "1px solid #21262d" }} />
            {l}
          </span>
        ))}
        {msg ? <span style={{ marginLeft: "auto", fontSize: 11, color: "#10b981", fontFamily: "'Space Mono',monospace" }}>{msg}</span> : null}
      </div>

      {/* Matrix */}
      <div style={{ ...S.card, overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...S.cornerTh }}>ROLE \ MODUL</th>
              {d.modules.map(m => (
                <th key={m.id} style={S.modTh} title={m.name}>
                  <div style={{ fontSize: 15 }}>{m.icon}</div>
                  <div style={{ fontSize: 8, color: "#5b6470", marginTop: 2 }}>{m.name.split(" ")[0]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.roles.map(r => (
              <tr key={r.id}>
                <td style={S.roleTd}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#e6edf3" }}>{r.icon} {r.name}</div>
                  <div style={{ fontSize: 9, color: "#5b6470" }}>{r.cat} · {r.modules_accessible} modul</div>
                </td>
                {d.modules.map(m => {
                  const level = lv(r.id, m.id);
                  return (
                    <td key={m.id} style={{ padding: 2, textAlign: "center" }}>
                      <button onClick={() => cycle(r.id, m.id)} title={`${r.name} · ${m.name} → ${level}`}
                        style={{ width: 38, height: 30, borderRadius: 5, cursor: "pointer", border: "1px solid #21262d",
                          background: LV_C[level], color: level === "none" ? "#5b6470" : "#fff",
                          fontSize: 11, fontWeight: 700, fontFamily: "'Space Mono',monospace" }}>
                        {LV_AB[level]}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: "#5b6470", marginTop: 8 }}>
        💡 Tiap role punya dashboard &amp; akses berbeda. Perubahan tersimpan otomatis &amp; langsung berlaku.
      </div>
    </div>
  );
}

function Kpi({ label, v, c, sub }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Space Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace", margin: "4px 0 2px" }}>{v}</div>
      <div style={{ fontSize: 10, color: "#5b6470" }}>{sub || " "}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  cornerTh: { textAlign: "left", padding: "6px 8px", fontSize: 9, color: "#5b6470", fontFamily: "'Space Mono',monospace", minWidth: 180, position: "sticky", left: 0, background: "#0d1117" },
  modTh: { padding: "4px 2px", textAlign: "center", minWidth: 42 },
  roleTd: { padding: "6px 8px", borderTop: "1px solid #161b22", position: "sticky", left: 0, background: "#0d1117" },
};
