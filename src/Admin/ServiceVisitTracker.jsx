// karyaOS — Service Visit Tracker (Karya Field Service)
// Admin: create service tickets, manage templates, monitor KPI per dept.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorInline } from "../components/ConnectionError.jsx";
import { EmptyState } from "../components/uiKit.jsx";

const PURPLE = "#a855f7", GREEN = "#10b981", AMBER = "#f59e0b", RED = "#ef4444", CYAN = "#22d3ee", PINK = "#ec4899";
const CARD_BG = "rgba(255,255,255,0.04)";
const BORDER  = "1px solid rgba(255,255,255,0.08)";

const PRIORITY_COLOR = { urgent: RED, high: AMBER, normal: CYAN, low: "#64748b" };
const STATUS_COLOR = { open: AMBER, in_progress: CYAN, completed: GREEN, cancelled: "#64748b" };

export default function ServiceVisitTracker({ apiBase = "" }) {
  const API = apiBase || (typeof window !== "undefined" && window.location.origin) || "";
  const [view, setView] = useState("tickets"); // tickets | templates | kpi
  const [tickets, setTickets] = useState([]);
  const [kpi, setKpi] = useState({ data: [] });
  const [templates, setTemplates] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [selected, setSelected] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState({ status: "", department: "" });

  const load = useCallback(() => {
    setLoading(true); setErr(null);
    Promise.all([
      fetch(`${API}/api/service/tickets`).then(r => r.json()),
      fetch(`${API}/api/service/templates`).then(r => r.json()),
      fetch(`${API}/api/service/kpi?days=30`).then(r => r.json()),
      fetch(`${API}/api/departments?applies_to=service`).then(r => r.json()),
      fetch(`${API}/api/remote-ops/outlets`).then(r => r.json()),
      fetch(`${API}/api/auth/users`).then(r => r.json()),
    ])
    .then(([t, tpl, k, d, o, u]) => {
      setTickets(t?.data || []);
      setTemplates(tpl?.data || []);
      setKpi(k || { data: [] });
      setDepartments(d?.data || []);
      setOutlets(o?.data || []);
      setUsers(Array.isArray(u) ? u : []);
    })
    .catch(setErr).finally(() => setLoading(false));
  }, [API]);

  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  const filtered = useMemo(() => {
    return tickets.filter(t => {
      if (filter.status && t.status !== filter.status) return false;
      if (filter.department && t.department !== filter.department) return false;
      return true;
    });
  }, [tickets, filter]);

  const stats = useMemo(() => ({
    total: tickets.length,
    open: tickets.filter(t => t.status === "open").length,
    inProgress: tickets.filter(t => t.status === "in_progress").length,
    completed: tickets.filter(t => t.status === "completed").length,
    urgent: tickets.filter(t => t.priority === "urgent" && t.status !== "completed" && t.status !== "cancelled").length,
  }), [tickets]);

  return (
    <div style={{ padding: 20, color: "#e6edf3", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif" }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>karyaOS / KFS — FIELD SERVICE</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginTop: 4, letterSpacing: -0.5 }}>🔧 Service Visit Tracker</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Assign department tickets (IT/Maintenance/Supplier/QA) to outlets with checklists + anti-fraud (geofence + selfie).</div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%, 140px),1fr))", gap: 10, marginBottom: 18 }}>
        <Kpi icon="🎫" label="TOTAL TICKETS" value={stats.total} color={CYAN} />
        <Kpi icon="📬" label="OPEN"         value={stats.open} color={AMBER} />
        <Kpi icon="🔨" label="IN PROGRESS"  value={stats.inProgress} color={CYAN} />
        <Kpi icon="✅" label="COMPLETED"    value={stats.completed} color={GREEN} />
        <Kpi icon="🚨" label="URGENT OPEN"  value={stats.urgent} color={stats.urgent ? RED : "#475569"} />
      </div>

      {/* View tabs */}
      <div style={{ display: "flex", gap: 4, padding: 4, background: CARD_BG, border: BORDER, borderRadius: 10, marginBottom: 14, flexWrap: "wrap" }}>
        {[["tickets", "🎫 Tickets"], ["templates", "📋 Templates"], ["kpi", "📊 Dept KPI"]].map(([k, lbl]) => (
          <button key={k} onClick={() => setView(k)} style={{
            padding: "8px 14px", background: view === k ? PURPLE : "transparent",
            border: "none", borderRadius: 7, color: view === k ? "#fff" : "#94a3b8",
            fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
          }}>{lbl}</button>
        ))}
        <div style={{ flex: 1 }} />
        {view === "tickets" && (
          <button onClick={() => setCreating(true)} style={{ padding: "8px 14px", background: `linear-gradient(135deg,${PURPLE},#7c3aed)`, border: "none", borderRadius: 7, color: "#fff", fontSize: 12, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>
            + New Ticket
          </button>
        )}
        {view === "templates" && (
          <button onClick={() => setEditingTemplate({})} style={{ padding: "8px 14px", background: `linear-gradient(135deg,${PURPLE},#7c3aed)`, border: "none", borderRadius: 7, color: "#fff", fontSize: 12, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>
            + New Template
          </button>
        )}
      </div>

      {err && <ErrorInline error={err} onRetry={load} label="Unable to load data" />}

      {/* TICKETS VIEW */}
      {view === "tickets" && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            <select value={filter.status} onChange={e => setFilter(f => ({...f, status: e.target.value}))} style={inp}>
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select value={filter.department} onChange={e => setFilter(f => ({...f, department: e.target.value}))} style={inp}>
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.code} value={d.code}>{d.icon} {d.label}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%, 340px),1fr))", gap: 10 }}>
            {filtered.map(t => <TicketCard key={t.id} ticket={t} departments={departments} onClick={() => setSelected(t)} />)}
            {filtered.length === 0 && !loading && (
              <div style={{ gridColumn: "1/-1" }}>
                <EmptyState icon="🎫" title={filter.status || filter.department ? "Belum ada ticket sesuai filter" : "Belum ada service ticket"} desc={filter.status || filter.department ? "Reset filter atau pilih kombinasi lain." : "Service ticket dari field worker akan muncul di sini setelah dibuat."} />
              </div>
            )}
          </div>
        </>
      )}

      {/* TEMPLATES VIEW */}
      {view === "templates" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%, 320px),1fr))", gap: 10 }}>
          {templates.length === 0 && (
            <div style={{ gridColumn: "1/-1" }}>
              <EmptyState icon="📋" title="Belum ada template" desc="Bikin template checklist per dept (mis. HVAC, Plumbing, IT) untuk standardize field service." />
            </div>
          )}
          {templates.map(tpl => (
            <div key={tpl.id} style={{ padding: 14, background: CARD_BG, border: BORDER, borderRadius: 12 }}>
              <div style={{ fontSize: 10, color: deptColor(departments, tpl.department), fontFamily: "'Geist Mono',monospace", fontWeight: 700, letterSpacing: 1 }}>
                {deptIcon(departments, tpl.department)} {tpl.department.toUpperCase()}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginTop: 4 }}>{tpl.template_name}</div>
              {tpl.description && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, lineHeight: 1.4 }}>{tpl.description}</div>}
              <div style={{ marginTop: 10, fontSize: 11, color: "#cbd5e1" }}>{tpl.items?.length || 0} checklist items</div>
              <button onClick={() => setEditingTemplate(tpl)} style={{ marginTop: 10, padding: "6px 12px", background: "rgba(168,85,247,0.15)", border: `1px solid ${PURPLE}55`, borderRadius: 6, color: PURPLE, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>✏️ Edit Items</button>
            </div>
          ))}
        </div>
      )}

      {/* KPI VIEW */}
      {view === "kpi" && (
        <DeptKpiPanel kpi={kpi.data} departments={departments} />
      )}

      {selected && <TicketDetailDrawer ticket={selected} departments={departments} templates={templates} onClose={() => setSelected(null)} onRefresh={load} API={API} />}
      {creating && <CreateTicketModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} API={API} departments={departments} outlets={outlets} users={users} templates={templates} />}
      {editingTemplate && <TemplateEditModal template={editingTemplate} departments={departments} onClose={() => setEditingTemplate(null)} onSaved={() => { setEditingTemplate(null); load(); }} API={API} />}
    </div>
  );
}

function TicketCard({ ticket, departments, onClick }) {
  const dept = departments.find(d => d.code === ticket.department);
  const due = ticket.due_at ? new Date(ticket.due_at * 1000) : null;
  const overdue = due && due < new Date() && ticket.status !== "completed";
  return (
    <button onClick={onClick} style={{
      textAlign: "left", padding: 14, background: CARD_BG, border: BORDER, borderRadius: 12,
      color: "#fff", cursor: "pointer", fontFamily: "inherit",
      borderLeft: `4px solid ${PRIORITY_COLOR[ticket.priority] || CYAN}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{ticket.ticket_no}</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginTop: 2, lineHeight: 1.3 }}>{ticket.title}</div>
          <div style={{ fontSize: 10, color: dept?.color || "#94a3b8", marginTop: 4, fontWeight: 700, letterSpacing: 0.5 }}>
            {dept?.icon} {dept?.label || ticket.department}
          </div>
          <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 6 }}>
            🏪 {ticket.outlet_name || ticket.outlet_code}
            {ticket.assigned_to_name && <> · 👤 {ticket.assigned_to_name}</>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={chip(STATUS_COLOR[ticket.status] || "#94a3b8")}>{ticket.status.toUpperCase().replace("_"," ")}</span>
          {ticket.priority !== "normal" && (
            <div style={{ marginTop: 4 }}><span style={chip(PRIORITY_COLOR[ticket.priority])}>{ticket.priority.toUpperCase()}</span></div>
          )}
        </div>
      </div>
      {due && (
        <div style={{ marginTop: 8, fontSize: 11, color: overdue ? RED : "#94a3b8", fontWeight: overdue ? 800 : 500 }}>
          {overdue ? "⚠ OVERDUE • " : "📅 SLA: "}{due.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}
        </div>
      )}
      {ticket.on_time != null && (
        <div style={{ marginTop: 4, fontSize: 11, color: ticket.on_time ? GREEN : RED, fontWeight: 700 }}>
          {ticket.on_time ? "✓ ON-TIME" : "⌛ LATE"}
        </div>
      )}
    </button>
  );
}

function DeptKpiPanel({ kpi, departments }) {
  if (kpi.length === 0) return <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>No data yet KPI (30 day terakhir)</div>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%, 320px),1fr))", gap: 12 }}>
      {kpi.map(k => {
        const dept = departments.find(d => d.code === k.department);
        return (
          <div key={k.department} style={{ padding: 14, background: CARD_BG, border: BORDER, borderRadius: 12, borderLeft: `4px solid ${dept?.color || CYAN}` }}>
            <div style={{ fontSize: 11, color: dept?.color || CYAN, fontFamily: "'Geist Mono',monospace", fontWeight: 800, letterSpacing: 1 }}>
              {dept?.icon} {dept?.label || k.department}
            </div>
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <KpiBox label="TOTAL"        value={k.total} color="#cbd5e1" />
              <KpiBox label="COMPLETED"    value={k.completed} color={GREEN} />
              <KpiBox label="IN PROGRESS"  value={k.in_progress} color={CYAN} />
              <KpiBox label="OPEN"         value={k.open} color={AMBER} />
            </div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: BORDER }}>
              <Bar label="COMPLETION" pct={k.completion_pct} color={GREEN} />
              {k.on_time_pct != null && <Bar label="ON-TIME" pct={k.on_time_pct} color={k.on_time_pct >= 80 ? GREEN : k.on_time_pct >= 60 ? AMBER : RED} />}
            </div>
            {(k.avg_response_min != null || k.avg_duration_min != null) && (
              <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8", display: "flex", gap: 14 }}>
                {k.avg_response_min != null && <span>⏱ Avg respond: <b style={{ color: "#fff" }}>{fmtMin(k.avg_response_min)}</b></span>}
                {k.avg_duration_min != null && <span>⌛ Avg durasi: <b style={{ color: "#fff" }}>{fmtMin(k.avg_duration_min)}</b></span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TicketDetailDrawer({ ticket, departments, templates, onClose, onRefresh, API }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState("");
  const [newItemPhoto, setNewItemPhoto] = useState(true);
  const [busyItem, setBusyItem] = useState(false);
  const [syncTplId, setSyncTplId] = useState("");
  const [msg, setMsg] = useState("");

  const reload = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/service/tickets/${ticket.id}`).then(r => r.json()).then(setDetail).finally(() => setLoading(false));
  }, [ticket.id, API]);

  useEffect(() => { reload(); }, [reload]);

  const addItem = async () => {
    if (!newItem.trim()) return;
    setBusyItem(true); setMsg("");
    try {
      const r = await fetch(`${API}/api/service/tickets/${ticket.id}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newItem.trim(), requires_photo: newItemPhoto ? 1 : 0 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Gagal");
      setNewItem(""); setMsg("✓ Item ditambahkan"); reload(); onRefresh?.();
    } catch (e) { setMsg("⚠ " + e.message); }
    setBusyItem(false);
  };

  const removeItem = async (iid) => {
    if (!confirm("Hapus item ini?")) return;
    setBusyItem(true); setMsg("");
    try {
      const r = await fetch(`${API}/api/service/tickets/${ticket.id}/items/${iid}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Gagal");
      setMsg("✓ Item dihapus"); reload(); onRefresh?.();
    } catch (e) { setMsg("⚠ " + e.message); }
    setBusyItem(false);
  };

  const syncTemplate = async () => {
    if (!syncTplId) return;
    setBusyItem(true); setMsg("");
    try {
      const r = await fetch(`${API}/api/service/tickets/${ticket.id}/sync-template`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: parseInt(syncTplId, 10) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Gagal");
      setMsg(`✓ ${j.added} item ditambah${j.skipped ? `, ${j.skipped} dilewati (sudah ada)` : ""}`);
      reload(); onRefresh?.();
    } catch (e) { setMsg("⚠ " + e.message); }
    setBusyItem(false);
  };

  // Show all templates — admin bisa pilih template dari dept manapun
  const deptTemplates = templates || [];

  const dept = departments.find(d => d.code === ticket.department);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(720px, 96vw)", height: "100%", background: "#0a0f1c", borderLeft: "1px solid rgba(255,255,255,0.1)", padding: 20, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: dept?.color || PURPLE, fontFamily: "'Geist Mono',monospace", fontWeight: 800, letterSpacing: 1.5 }}>{ticket.ticket_no} · {ticket.priority.toUpperCase()}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginTop: 4 }}>{ticket.title}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
              🏪 {ticket.outlet_name || ticket.outlet_code} · {dept?.icon} {dept?.label}
              {ticket.assigned_to_name && <> · 👤 {ticket.assigned_to_name}</>}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {ticket.description && <div style={{ padding: 12, background: CARD_BG, border: BORDER, borderRadius: 10, marginBottom: 14, fontSize: 13, color: "#cbd5e1", lineHeight: 1.5 }}>{ticket.description}</div>}

        {loading ? <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>⏳ Loading…</div> : detail && (
          <>
            {/* Status + checkin info */}
            <div style={{ padding: 12, background: STATUS_COLOR[ticket.status] + "11", border: `1px solid ${STATUS_COLOR[ticket.status]}33`, borderRadius: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: STATUS_COLOR[ticket.status], fontWeight: 800, letterSpacing: 1 }}>{ticket.status.toUpperCase().replace("_"," ")}</div>
              {ticket.started_at && (
                <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 4 }}>
                  ▶ Started: {new Date(ticket.started_at * 1000).toLocaleString("id-ID")} · GPS {ticket.start_gps_distance_m != null ? ticket.start_gps_distance_m + "m" : "n/a"}
                </div>
              )}
              {ticket.finished_at && (
                <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 2 }}>
                  ✓ Finished: {new Date(ticket.finished_at * 1000).toLocaleString("id-ID")}
                  {ticket.on_time != null && <span style={{ marginLeft: 6, color: ticket.on_time ? GREEN : RED, fontWeight: 700 }}>{ticket.on_time ? "ON-TIME" : "LATE"}</span>}
                </div>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {ticket.start_selfie && <PhotoThumb src={`${API}/api/service/photo/${ticket.start_selfie}`} label="🤳 Start" />}
                {ticket.finish_selfie && <PhotoThumb src={`${API}/api/service/photo/${ticket.finish_selfie}`} label="🤳 Finish" />}
              </div>
            </div>

            {/* LIVE EDIT — moved on top biar admin langsung lihat */}
            {ticket.status !== "completed" && ticket.status !== "cancelled" && (
              <div style={{ marginBottom: 14, padding: 12, background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.35)", borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: CYAN, fontWeight: 800, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>✏️ EDIT CHECKLIST (LIVE)</div>

                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === "Enter" && addItem()}
                    placeholder="Tambah item to ticket ini…" style={inp} />
                  <button onClick={() => setNewItemPhoto(p => !p)} title="Wajib foto?" style={{ padding: "8px 10px", background: newItemPhoto ? AMBER + "33" : "transparent", border: `1px solid ${newItemPhoto ? AMBER : "rgba(255,255,255,0.15)"}`, borderRadius: 8, color: newItemPhoto ? AMBER : "#64748b", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>📸 {newItemPhoto ? "ON" : "off"}</button>
                  <button onClick={addItem} disabled={busyItem || !newItem.trim()} style={{ padding: "8px 14px", background: CYAN, border: "none", borderRadius: 8, color: "#001620", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", opacity: busyItem || !newItem.trim() ? 0.5 : 1 }}>+ Add</button>
                </div>

                {/* Sync template — selalu tampil, list semua template */}
                <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                  <select value={syncTplId} onChange={e => setSyncTplId(e.target.value)} style={inp}>
                    <option value="">— Pilih template for sync —</option>
                    {deptTemplates.length === 0 && <option disabled>(No template — buat di tab Templates)</option>}
                    {deptTemplates.map(t => <option key={t.id} value={t.id}>[{t.department}] {t.template_name} ({t.items?.length || 0} items)</option>)}
                  </select>
                  <button onClick={syncTemplate} disabled={busyItem || !syncTplId} style={{ padding: "8px 14px", background: PURPLE, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", opacity: busyItem || !syncTplId ? 0.5 : 1 }}>🔄 Sync</button>
                </div>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>Sync menambah item from template yang belum ada (match by label). Item langsung muncul di mobile staff (auto-poll 20s).</div>
                {msg && <div style={{ marginTop: 8, fontSize: 11, color: msg.startsWith("✓") ? GREEN : RED, fontWeight: 700 }}>{msg}</div>}
              </div>
            )}

            {/* Items */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1.5, fontWeight: 700, fontFamily: "'Geist Mono',monospace" }}>📋 CHECKLIST ({detail.items?.length || 0})</div>
            </div>
            {detail.items?.map(it => (
              <div key={it.id} style={{ padding: 10, background: CARD_BG, border: BORDER, borderRadius: 8, marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{it.item_label}{it.requires_photo === 1 && <span style={{ color: AMBER, marginLeft: 4 }}>📸</span>}</div>
                    {it.note && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, fontStyle: "italic" }}>"{it.note}"</div>}
                  </div>
                  <span style={chip(it.status === "done" ? GREEN : it.status === "skipped" ? "#64748b" : AMBER)}>{it.status.toUpperCase()}</span>
                  {it.status !== "done" && ticket.status !== "completed" && ticket.status !== "cancelled" && (
                    <button onClick={() => removeItem(it.id)} disabled={busyItem} title="Hapus item" style={{ padding: "2px 8px", background: "transparent", border: "none", color: RED, fontSize: 16, cursor: "pointer", lineHeight: 1 }}>×</button>
                  )}
                </div>
                {it.photos?.length > 0 && (
                  <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                    {it.photos.map(p => <PhotoThumb key={p} src={`${API}/api/service/photo/${p}`} small />)}
                  </div>
                )}
              </div>
            ))}

          </>
        )}
      </div>
    </div>
  );
}

function CreateTicketModal({ onClose, onCreated, API, departments, outlets, users, templates }) {
  const [form, setForm] = useState({
    outlet_code: "", department: "", template_id: "", title: "", description: "",
    priority: "normal", assigned_to_name: "", due_at_str: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const filteredTemplates = templates.filter(t => !form.department || t.department === form.department);

  const submit = async () => {
    setErr("");
    if (!form.outlet_code || !form.department || !form.title) { setErr("Outlet, dept, title wajib"); return; }
    setBusy(true);
    try {
      const outlet = outlets.find(o => o.code === form.outlet_code);
      const body = {
        ...form,
        outlet_name: outlet?.name || form.outlet_code,
        due_at: form.due_at_str ? Math.floor(new Date(form.due_at_str).getTime() / 1000) : null,
        template_id: form.template_id ? parseInt(form.template_id, 10) : null,
        created_by: "admin",
      };
      delete body.due_at_str;
      const r = await fetch(`${API}/api/service/tickets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error);
      onCreated();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(560px, 100%)", maxHeight: "92vh", overflowY: "auto", background: "#0a0f1c", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>karyaOS / KFS · NEW TICKET</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginTop: 4, marginBottom: 14 }}>🎫 Buat Service Ticket</div>

        <Field label="🏪 OUTLET *">
          <select value={form.outlet_code} onChange={e => setForm({...form, outlet_code: e.target.value})} style={inp}>
            <option value="">— Pilih outlet —</option>
            {outlets.map(o => <option key={o.code} value={o.code}>{o.name} ({o.vertical})</option>)}
          </select>
        </Field>
        <Field label="🎯 DEPARTMENT *">
          <select value={form.department} onChange={e => setForm({...form, department: e.target.value, template_id: ""})} style={inp}>
            <option value="">— Pilih dept —</option>
            {departments.map(d => <option key={d.code} value={d.code}>{d.icon} {d.label}</option>)}
          </select>
        </Field>
        <Field label={`📋 TEMPLATE CHECKLIST (${filteredTemplates.length} available)`}>
          <select value={form.template_id} onChange={e => setForm({...form, template_id: e.target.value})} style={inp}>
            <option value="">— Tanpa template (manual) —</option>
            {filteredTemplates.map(t => <option key={t.id} value={t.id}>{t.template_name} ({t.items?.length || 0} items)</option>)}
          </select>
        </Field>
        <Field label="📝 TITLE *"><input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="cth: PC kasir #2 sering hang" style={inp} /></Field>
        <Field label="📄 DESKRIPSI"><textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} style={{...inp, fontFamily: "inherit", resize: "vertical"}} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="⚠ PRIORITY">
            <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})} style={inp}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>
          <Field label="📅 SLA / DUE (klik for buka kalender)">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <input type="date" readOnly={false}
                value={(form.due_at_str || "").split("T")[0] || ""}
                onChange={e => {
                  const time = (form.due_at_str || "").split("T")[1] || "17:00";
                  setForm({ ...form, due_at_str: e.target.value ? `${e.target.value}T${time}` : "" });
                }}
                onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }}
                onKeyDown={e => { if (e.key !== "Tab" && e.key !== "Escape") e.preventDefault(); }}
                style={{ ...inp, colorScheme: "dark", cursor: "pointer" }} />
              <input type="time" readOnly={false}
                value={(form.due_at_str || "").split("T")[1] || ""}
                onChange={e => {
                  const date = (form.due_at_str || "").split("T")[0] || new Date().toISOString().slice(0, 10);
                  setForm({ ...form, due_at_str: `${date}T${e.target.value}` });
                }}
                onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }}
                onKeyDown={e => { if (e.key !== "Tab" && e.key !== "Escape") e.preventDefault(); }}
                disabled={!form.due_at_str}
                style={{ ...inp, colorScheme: "dark", cursor: "pointer", opacity: form.due_at_str ? 1 : 0.5 }} />
            </div>
            {form.due_at_str && (
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 4, fontFamily: "'Geist Mono',monospace" }}>
                → {new Date(form.due_at_str).toLocaleString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                <button onClick={() => setForm({ ...form, due_at_str: "" })} style={{ marginLeft: 8, padding: "1px 6px", background: "transparent", border: "none", color: RED, fontSize: 10, cursor: "pointer" }}>× clear</button>
              </div>
            )}
          </Field>
        </div>
        <Field label="👤 ASSIGNED TO">
          <input list="users-list" value={form.assigned_to_name} onChange={e => setForm({...form, assigned_to_name: e.target.value})} placeholder="Pilih or ketik nama" style={inp} />
          <datalist id="users-list">
            {users.map(u => <option key={u.id} value={u.name}>{u.role}</option>)}
          </datalist>
        </Field>

        {err && <div style={{ padding: 10, background: "rgba(239,68,68,0.1)", border: `1px solid ${RED}55`, borderRadius: 8, color: "#fca5a5", fontSize: 12, marginBottom: 10 }}>⚠ {err}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{ flex: 2, padding: 12, background: `linear-gradient(135deg,${PURPLE},#7c3aed)`, border: "none", borderRadius: 10, color: "#fff", fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>{busy ? "⏳" : "🎫 New Ticket"}</button>
        </div>
      </div>
    </div>
  );
}

function TemplateEditModal({ template, departments, onClose, onSaved, API }) {
  const [form, setForm] = useState({
    id: template.id,
    department: template.department || "",
    template_name: template.template_name || "",
    description: template.description || "",
    items: template.items || [],
  });
  const [newItem, setNewItem] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const addItem = () => {
    if (!newItem.trim()) return;
    setForm(f => ({ ...f, items: [...f.items, { label: newItem.trim(), requires_photo: 1, order: (f.items.length + 1) * 10 }] }));
    setNewItem("");
  };

  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  const togglePhoto = (i) => setForm(f => ({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, requires_photo: it.requires_photo ? 0 : 1 } : it) }));

  const submit = async () => {
    setErr("");
    if (!form.department || !form.template_name || form.items.length === 0) { setErr("Dept, name, and minimal 1 item wajib"); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/service/templates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, created_by: "admin" }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error);
      onSaved();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(640px, 100%)", maxHeight: "92vh", overflowY: "auto", background: "#0a0f1c", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>{form.id ? "EDIT" : "NEW"} TEMPLATE</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginTop: 4, marginBottom: 14 }}>📋 Service Template</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="🎯 DEPT *">
            <select value={form.department} onChange={e => setForm({...form, department: e.target.value})} style={inp}>
              <option value="">— Pilih dept —</option>
              {departments.map(d => <option key={d.code} value={d.code}>{d.icon} {d.label}</option>)}
            </select>
          </Field>
          <Field label="📝 TEMPLATE NAME *">
            <input value={form.template_name} onChange={e => setForm({...form, template_name: e.target.value})} placeholder="cth: PC Repair Standard" style={inp} />
          </Field>
        </div>
        <Field label="📄 DESKRIPSI"><textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} style={{...inp, fontFamily: "inherit", resize: "vertical"}} /></Field>

        <Field label={`📋 CHECKLIST ITEMS (${form.items.length})`}>
          <div style={{ background: "rgba(0,0,0,0.3)", border: BORDER, borderRadius: 8, padding: 10, marginBottom: 8 }}>
            {form.items.map((it, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", borderBottom: i === form.items.length - 1 ? "none" : "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ fontSize: 11, color: "#64748b", width: 24, textAlign: "center", fontFamily: "'Geist Mono',monospace" }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 12, color: "#cbd5e1" }}>{it.label}</span>
                <button onClick={() => togglePhoto(i)} style={{ padding: "2px 6px", background: it.requires_photo ? AMBER + "33" : "transparent", border: `1px solid ${it.requires_photo ? AMBER : "rgba(255,255,255,0.15)"}`, borderRadius: 4, color: it.requires_photo ? AMBER : "#64748b", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>📸 {it.requires_photo ? "ON" : "off"}</button>
                <button onClick={() => removeItem(i)} style={{ padding: "2px 8px", background: "transparent", border: "none", color: RED, fontSize: 14, cursor: "pointer" }}>×</button>
              </div>
            ))}
            {form.items.length === 0 && <div style={{ padding: 10, textAlign: "center", fontSize: 11, color: "#64748b" }}>No item</div>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === "Enter" && addItem()} placeholder="Tambah item baru…" style={inp} />
            <button onClick={addItem} style={{ padding: "8px 14px", background: CYAN, border: "none", borderRadius: 8, color: "#001620", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>+ Add</button>
          </div>
        </Field>

        {err && <div style={{ padding: 10, background: "rgba(239,68,68,0.1)", border: `1px solid ${RED}55`, borderRadius: 8, color: "#fca5a5", fontSize: 12, marginBottom: 10 }}>⚠ {err}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{ flex: 2, padding: 12, background: `linear-gradient(135deg,${PURPLE},#7c3aed)`, border: "none", borderRadius: 10, color: "#fff", fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>{busy ? "⏳" : "💾 Simpan Template"}</button>
        </div>
      </div>
    </div>
  );
}

// ────── helpers ──────
function Kpi({ icon, label, value, color }) {
  return (
    <div style={{ padding: 12, background: CARD_BG, border: BORDER, borderRadius: 10 }}>
      <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 1.3, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{icon} {label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color, marginTop: 4, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}
function KpiBox({ label, value, color }) {
  return (
    <div style={{ padding: 8, background: "rgba(0,0,0,0.25)", borderRadius: 6 }}>
      <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}
function Bar({ label, pct, color }) {
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", marginBottom: 3, fontFamily: "'Geist Mono',monospace" }}>
        <span>{label}</span><span style={{ color, fontWeight: 800 }}>{pct}%</span>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}
function PhotoThumb({ src, label, small }) {
  const sz = small ? 48 : 64;
  return (
    <div style={{ position: "relative" }}>
      <img src={src} alt="" style={{ width: sz, height: sz, objectFit: "cover", borderRadius: 6, border: BORDER, display: "block" }} />
      {label && <div style={{ position: "absolute", bottom: 2, left: 2, padding: "1px 5px", background: "rgba(0,0,0,0.7)", borderRadius: 3, fontSize: 8, color: "#fff", fontWeight: 700 }}>{label}</div>}
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 0.5, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
function chip(color) {
  return { padding: "3px 8px", background: `${color}22`, border: `1px solid ${color}55`, borderRadius: 6, fontSize: 10, color, fontWeight: 700, fontFamily: "'Geist Mono',monospace", letterSpacing: 0.3, display: "inline-block" };
}
function deptColor(deps, code) { return deps.find(d => d.code === code)?.color || "#94a3b8"; }
function deptIcon(deps, code)  { return deps.find(d => d.code === code)?.icon || "·"; }
function fmtMin(m) { if (m == null) return "—"; if (m < 60) return m + "m"; return Math.floor(m/60) + "h " + (m%60) + "m"; }

const inp = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, padding: "10px 12px", color: "#fff",
  fontSize: 13, fontFamily: "inherit", outline: "none",
};
