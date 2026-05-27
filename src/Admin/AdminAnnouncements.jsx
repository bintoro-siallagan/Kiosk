// src/Admin/AdminAnnouncements.jsx
// White-label P4D — super-admin authoring page + tenant changelog viewer.
// If session.is_super_admin → render Author UI. Else → render Changelog viewer.

import { useEffect, useState } from "react";
import API_HOST from "../apiBase.js";
import { isSuperAdmin } from "../companyAuth.js";

function headers() {
  const tok = localStorage.getItem("adminToken");
  return { "Content-Type": "application/json", ...(tok && { Authorization: "Bearer " + tok }) };
}

export default function AdminAnnouncements() {
  return isSuperAdmin() ? <Author /> : <Changelog />;
}

// ─── Super-admin authoring ─────────────────────────────────────────────
function Author() {
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", kind: "" });

  async function refresh() {
    try {
      const r = await fetch(`${API_HOST}/api/admin/announcements`, { headers: headers() }).then(r => r.json());
      setList(r.data || []);
    } catch (e) { setMsg({ text: e.message, kind: "error" }); }
  }
  useEffect(() => { refresh(); }, []);

  async function save(item) {
    setBusy(true); setMsg({ text: "", kind: "" });
    try {
      const isEdit = !!item.id;
      const r = await fetch(`${API_HOST}/api/admin/announcements${isEdit ? "/" + item.id : ""}`, {
        method: isEdit ? "PATCH" : "POST", headers: headers(),
        body: JSON.stringify(item),
      }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      setEditing(null);
      await refresh();
      setMsg({ text: isEdit ? "Updated." : "Created.", kind: "ok" });
    } catch (e) {
      setMsg({ text: e.message, kind: "error" });
    } finally { setBusy(false); }
  }

  async function del(id) {
    if (!confirm("Hapus announcement ini?")) return;
    await fetch(`${API_HOST}/api/admin/announcements/${id}`, { method: "DELETE", headers: headers() });
    refresh();
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={S.h1}>Announcements <span style={S.badgeSuperOk}>SUPER-ADMIN</span></div>
          <div style={S.muted}>Post pengumuman ke semua tenant: feature launch, scheduled maintenance, hot patches, dll.</div>
        </div>
        <button onClick={() => setEditing({ kind: "banner", severity: "info", audience: "all", is_published: true })}
          style={S.btnPrimary}>+ Tulis announcement</button>
      </div>

      {msg.text && <div style={msg.kind === "error" ? S.alertErr : S.alertOk}>{msg.text}</div>}

      {list.length === 0 ? (
        <div style={S.empty}>Belum ada announcement.</div>
      ) : (
        <div style={S.table}>
          <div style={{ ...S.row, ...S.rowHead }}>
            <div style={{ width: 90 }}>Kind</div>
            <div style={{ width: 90 }}>Severity</div>
            <div style={{ flex: 1 }}>Title</div>
            <div style={{ width: 130 }}>Audience</div>
            <div style={{ width: 90 }}>Published</div>
            <div style={{ width: 150 }}></div>
          </div>
          {list.map(a => (
            <div key={a.id} style={S.row}>
              <div style={{ width: 90 }}><span style={S.pill}>{a.kind}</span></div>
              <div style={{ width: 90 }}><SeverityBadge level={a.severity} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#fff", fontWeight: 600 }}>{a.title}</div>
                {a.body && <div style={{ fontSize: 11, color: "rgba(205,213,223,0.5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.body}</div>}
              </div>
              <div style={{ width: 130, fontSize: 11, fontFamily: "monospace", color: "rgba(205,213,223,0.65)" }}>{a.audience}</div>
              <div style={{ width: 90 }}>
                <span style={a.is_published ? S.badgeOk : S.badgeOff}>{a.is_published ? "LIVE" : "DRAFT"}</span>
              </div>
              <div style={{ width: 150, display: "flex", gap: 6 }}>
                <button onClick={() => setEditing(a)} style={S.btnTiny}>Edit</button>
                <button onClick={() => del(a.id)} style={{ ...S.btnTiny, color: "#fca5a5" }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditModal
          item={editing}
          onClose={() => setEditing(null)}
          onSave={save}
          busy={busy}
        />
      )}
    </div>
  );
}

function EditModal({ item, onClose, onSave, busy }) {
  const [f, setF] = useState(() => ({
    id: item.id,
    kind: item.kind || "banner",
    severity: item.severity || "info",
    title: item.title || "",
    body: item.body || "",
    link_url: item.link_url || "",
    link_label: item.link_label || "",
    audience: item.audience || "all",
    active_from: item.active_from ? new Date(item.active_from * 1000).toISOString().slice(0, 16) : "",
    active_until: item.active_until ? new Date(item.active_until * 1000).toISOString().slice(0, 16) : "",
    is_published: item.is_published !== false,
  }));
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target?.value ?? e }));

  function submit() {
    const payload = { ...f };
    payload.active_from = f.active_from ? Math.floor(new Date(f.active_from).getTime() / 1000) : null;
    payload.active_until = f.active_until ? Math.floor(new Date(f.active_until).getTime() / 1000) : null;
    onSave(payload);
  }

  return (
    <div style={S.modalRoot} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.cardTitle}>{item.id ? "Edit announcement" : "Tulis announcement"}</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={S.label}>Kind</label>
            <select value={f.kind} onChange={set("kind")} style={S.input}>
              <option value="banner">Banner (top bar, dismissible)</option>
              <option value="changelog">Changelog (changelog page)</option>
              <option value="maintenance">Maintenance notice</option>
            </select>
          </div>
          <div>
            <label style={S.label}>Severity</label>
            <select value={f.severity} onChange={set("severity")} style={S.input}>
              <option value="info">Info (blue)</option>
              <option value="success">Success (green)</option>
              <option value="warning">Warning (amber)</option>
              <option value="critical">Critical (red)</option>
            </select>
          </div>
        </div>

        <label style={{ ...S.label, marginTop: 14 }}>Title</label>
        <input value={f.title} onChange={set("title")} style={S.input} placeholder="e.g. New: Outbound webhooks live" />

        <label style={{ ...S.label, marginTop: 14 }}>Body (optional)</label>
        <textarea value={f.body} onChange={set("body")} style={{ ...S.input, minHeight: 70, resize: "vertical", fontFamily: "inherit" }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
          <div>
            <label style={S.label}>Link URL (optional)</label>
            <input value={f.link_url} onChange={set("link_url")} style={S.input} placeholder="https://…" />
          </div>
          <div>
            <label style={S.label}>Link label</label>
            <input value={f.link_label} onChange={set("link_label")} style={S.input} placeholder="Lihat detail" />
          </div>
        </div>

        <label style={{ ...S.label, marginTop: 14 }}>Audience</label>
        <input value={f.audience} onChange={set("audience")} style={S.input}
          placeholder='"all" | "plan:starter,growth" | "company:1,2"' />
        <div style={S.muted}>Format: <code>all</code> (semua), <code>plan:starter,growth</code>, atau <code>company:1,3,5</code></div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
          <div>
            <label style={S.label}>Active from</label>
            <input type="datetime-local" value={f.active_from} onChange={set("active_from")} style={S.input} />
          </div>
          <div>
            <label style={S.label}>Active until</label>
            <input type="datetime-local" value={f.active_until} onChange={set("active_until")} style={S.input} />
          </div>
        </div>

        <label style={{ ...S.label, marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={f.is_published} onChange={e => setF(s => ({ ...s, is_published: e.target.checked }))} />
          Published (visible to tenants now)
        </label>

        <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={S.btnSecondary}>Batal</button>
          <button onClick={submit} disabled={busy || !f.title}
            style={{ ...S.btnPrimary, opacity: (busy || !f.title) ? 0.5 : 1 }}>
            {busy ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tenant-facing changelog ───────────────────────────────────────────
function Changelog() {
  const [list, setList] = useState([]);

  async function refresh() {
    try {
      const r = await fetch(`${API_HOST}/api/announcements/changelog`).then(r => r.json());
      setList(r.data || []);
    } catch {}
  }
  useEffect(() => { refresh(); }, []);

  return (
    <div style={S.page}>
      <div style={S.h1}>What's new</div>
      <div style={S.muted}>Update terbaru di karyaOS. Subscribe ke email digest di Settings → Notifications.</div>

      {list.length === 0 ? (
        <div style={{ ...S.empty, marginTop: 20 }}>Belum ada update.</div>
      ) : (
        <div style={{ marginTop: 24 }}>
          {list.map(a => (
            <div key={a.id} style={S.changelogItem}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <SeverityBadge level={a.severity} />
                <div style={{ fontSize: 11, color: "rgba(205,213,223,0.5)", fontFamily: "monospace" }}>
                  {new Date((a.active_from || a.created_at) * 1000).toLocaleDateString()}
                </div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{a.title}</div>
              {a.body && <div style={{ marginTop: 6, fontSize: 13, color: "rgba(205,213,223,0.75)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{a.body}</div>}
              {a.link_url && (
                <a href={a.link_url} target="_blank" rel="noreferrer" style={S.linkOut}>
                  {a.link_label || "Lihat detail"} →
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SeverityBadge({ level }) {
  const m = {
    info:     { bg: "rgba(59,130,246,0.15)",  c: "#93c5fd", text: "INFO" },
    success:  { bg: "rgba(34,197,94,0.15)",   c: "#86efac", text: "SUCCESS" },
    warning:  { bg: "rgba(251,191,36,0.15)",  c: "#fcd34d", text: "WARNING" },
    critical: { bg: "rgba(239,68,68,0.15)",   c: "#fca5a5", text: "CRITICAL" },
  }[level] || { bg: "rgba(148,163,184,0.1)", c: "#94a3b8", text: String(level || "").toUpperCase() };
  return (
    <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 9, fontWeight: 700,
      letterSpacing: 1, background: m.bg, color: m.c, border: `1px solid ${m.bg}` }}>
      {m.text}
    </span>
  );
}

const S = {
  page: { padding: 28, maxWidth: 1080, margin: "0 auto", color: "#cdd5df", fontFamily: "'Inter',sans-serif" },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 24 },
  h1: { fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.4px", display: "flex", alignItems: "center", gap: 10 },
  muted: { color: "rgba(205,213,223,0.55)", fontSize: 13, lineHeight: 1.6 },
  empty: { padding: 40, textAlign: "center", color: "rgba(205,213,223,0.4)", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 12 },
  table: { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" },
  row: { display: "flex", alignItems: "center", padding: "12px 14px", gap: 12, fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.04)" },
  rowHead: { fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase",
    background: "rgba(0,0,0,0.2)" },
  pill: { padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: 1,
    background: "rgba(255,255,255,0.05)", color: "#cdd5df", border: "1px solid rgba(255,255,255,0.08)", textTransform: "uppercase" },
  badgeOk: { padding: "3px 9px", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: 1,
    background: "rgba(34,197,94,0.15)", color: "#86efac", border: "1px solid rgba(34,197,94,0.3)" },
  badgeOff: { padding: "3px 9px", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: 1,
    background: "rgba(148,163,184,0.1)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.2)" },
  badgeSuperOk: { padding: "3px 9px", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: 1,
    background: "rgba(168,85,247,0.15)", color: "#d8b4fe", border: "1px solid rgba(168,85,247,0.3)" },
  cardTitle: { fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 12 },
  label: { display: "block", fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#9ca3af", marginBottom: 6, textTransform: "uppercase" },
  input: { width: "100%", padding: "11px 14px", borderRadius: 10, background: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.08)", color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none" },
  btnPrimary: { padding: "10px 18px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.16)",
    background: "linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))",
    color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit",
    textShadow: "0 1px 2px rgba(0,0,0,0.45)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)" },
  btnSecondary: { padding: "10px 18px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)", color: "#cdd5df", fontWeight: 600, cursor: "pointer",
    fontSize: 13, fontFamily: "inherit" },
  btnTiny: { padding: "5px 10px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)", color: "#cdd5df", fontWeight: 600, cursor: "pointer",
    fontSize: 11, fontFamily: "inherit" },
  alertOk: { padding: "12px 16px", borderRadius: 10, background: "rgba(34,197,94,0.1)",
    border: "1px solid rgba(34,197,94,0.25)", color: "#86efac", fontSize: 13, marginBottom: 14 },
  alertErr: { padding: "12px 16px", borderRadius: 10, background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5", fontSize: 13, marginBottom: 14 },
  modalRoot: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000, padding: 20 },
  modal: { background: "linear-gradient(180deg, #1a1d29 0%, #131620 100%)", borderRadius: 18,
    padding: 28, maxWidth: 620, width: "100%", maxHeight: "90vh", overflow: "auto",
    border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 30px 80px rgba(0,0,0,0.6)" },
  changelogItem: { padding: 20, marginBottom: 14, borderRadius: 12,
    background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
    border: "1px solid rgba(255,255,255,0.07)" },
  linkOut: { display: "inline-block", marginTop: 10, fontSize: 12, fontWeight: 600,
    color: "var(--brand-primary, #FF6B35)", textDecoration: "none" },
};
