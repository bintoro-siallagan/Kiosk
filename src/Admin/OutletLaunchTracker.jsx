// karyaOS — Karya Outlet Launch Readiness (KOLR) Admin Tracker
// Anti-blame-game tool: 9 dept × 6 stage checklist dengan PIN signoff.
// GO LIVE locked sampai semua dept lead tandatangan.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorInline } from "../components/ConnectionError.jsx";

const PURPLE = "#a855f7", GREEN = "#10b981", AMBER = "#f59e0b", RED = "#ef4444", CYAN = "#22d3ee";
const CARD_BG = "rgba(255,255,255,0.04)";
const BORDER  = "1px solid rgba(255,255,255,0.08)";

export default function OutletLaunchTracker({ apiBase = "" }) {
  const API = apiBase || (typeof window !== "undefined" && window.location.origin) || "";
  const [launches, setLaunches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(() => {
    setErr(null); setLoading(true);
    fetch(`${API}/api/launch/launches`)
      .then(r => r.ok ? r.json() : r.json().then(j => { throw new Error(j?.error || `HTTP ${r.status}`); }))
      .then(j => setLaunches(j?.data || []))
      .catch(setErr)
      .finally(() => setLoading(false));
  }, [API]);

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const summary = useMemo(() => {
    const active = launches.filter(l => l.status === "in_progress");
    const live = launches.filter(l => ["live", "waived_live"].includes(l.status));
    const urgent = active.filter(l => {
      const daysToOpen = Math.floor((l.target_open_date - Date.now()/1000) / 86400);
      return daysToOpen <= 7;
    });
    return { active: active.length, live: live.length, urgent: urgent.length, total: launches.length };
  }, [launches]);

  return (
    <div style={{ padding: 20, color: "#e6edf3", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif" }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>karyaOS / KOLR — LAUNCH READINESS</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginTop: 4, letterSpacing: -0.5 }}>🚀 Outlet Launch Tracker</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Anti-blame: 9 departemen × 6 stage × sign-off PIN. GO LIVE diblokir sampai semua dept tandatangan.</div>
      </header>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginBottom: 18 }}>
        <KpiCard icon="🔨" label="ACTIVE PROJECT"   value={summary.active} color={PURPLE} />
        <KpiCard icon="🔥" label="≤ 7 HARI OPEN"    value={summary.urgent} color={summary.urgent ? RED : "#475569"} />
        <KpiCard icon="✅" label="SUDAH LIVE"        value={summary.live} color={GREEN} />
        <KpiCard icon="📊" label="TOTAL TRACKED"    value={summary.total} color={CYAN} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
        <button onClick={() => setShowCreate(true)} style={{ padding: "10px 18px", background: `linear-gradient(135deg,${PURPLE},#7c3aed)`, border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", boxShadow: "0 6px 16px rgba(168,85,247,0.3)" }}>
          + Mulai Project Outlet Baru
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={load} style={ghostBtn}>{loading ? "⏳" : "↻"} Refresh</button>
      </div>

      {err && <ErrorInline error={err} onRetry={load} label="Daftar proyek belum dapat dimuat" />}

      {/* Launch grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(360px,1fr))", gap: 12 }}>
        {launches.map(l => <LaunchCard key={l.id} launch={l} onClick={() => setSelected(l)} />)}
        {launches.length === 0 && !loading && (
          <div style={{ gridColumn: "1/-1", padding: 60, textAlign: "center", color: "#64748b" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🚀</div>
            <div style={{ fontSize: 14, marginBottom: 16 }}>Belum ada outlet launch project tercatat</div>
            <button onClick={() => setShowCreate(true)} style={{ padding: "10px 18px", background: PURPLE, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ Mulai Project Pertama</button>
          </div>
        )}
      </div>

      {selected && <LaunchDetail launch={selected} onClose={() => setSelected(null)} onRefresh={load} API={API} />}
      {showCreate && <CreateLaunchModal onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); load(); setTimeout(() => fetch(`${API}/api/launch/launches`).then(r=>r.json()).then(j=>{ const lst = j?.data || []; setSelected(lst.find(x => x.id === id) || null); }), 500); }} API={API} />}
    </div>
  );
}

function LaunchCard({ launch, onClick }) {
  const r = launch.readiness;
  const daysToOpen = Math.floor((launch.target_open_date - Date.now()/1000) / 86400);
  const daysColor = daysToOpen < 0 ? RED : daysToOpen <= 3 ? RED : daysToOpen <= 7 ? AMBER : GREEN;
  const isLive = ["live", "waived_live"].includes(launch.status);

  return (
    <button onClick={onClick} style={{
      textAlign: "left", padding: 14, background: CARD_BG, border: BORDER, borderRadius: 14,
      color: "#fff", fontFamily: "inherit", cursor: "pointer",
      borderLeft: `4px solid ${isLive ? GREEN : daysColor}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1.3, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{launch.vertical?.toUpperCase()} • {launch.outlet_code}</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: "#fff", marginTop: 2 }}>{launch.outlet_name}</div>
          {launch.area && <div style={{ fontSize: 11, color: "#94a3b8" }}>📍 {launch.area}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          {isLive ? (
            <div>
              <div style={{ fontSize: 11, color: GREEN, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>{launch.status === "waived_live" ? "WAIVED" : "LIVE"}</div>
              <div style={{ fontSize: 24, marginTop: 2 }}>{launch.status === "waived_live" ? "⚠️" : "✅"}</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 24, fontWeight: 900, color: daysColor, lineHeight: 1 }}>{daysToOpen >= 0 ? `T-${daysToOpen}` : `+${Math.abs(daysToOpen)}`}</div>
              <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 2, fontFamily: "'Geist Mono',monospace" }}>{daysToOpen < 0 ? "OVERDUE" : "HARI"}</div>
            </div>
          )}
        </div>
      </div>

      {/* Overall progress */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
          <span>READINESS</span>
          <span style={{ color: scoreColor(r.overall_pct), fontWeight: 800, fontFamily: "'Geist Mono',monospace" }}>{r.overall_pct}% • {r.signed_departments}/{r.total_departments} signed</span>
        </div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${r.overall_pct}%`, height: "100%", background: scoreColor(r.overall_pct) }} />
        </div>
      </div>

      {/* Dept dots */}
      <div style={{ display: "flex", gap: 4, marginTop: 12, flexWrap: "wrap" }}>
        {Object.entries(r.by_department).map(([deptCode, d]) => (
          <div key={deptCode} title={`${deptCode}: ${d.pct}%${d.signed_off ? " ✓ signed" : ""}`} style={{
            width: 28, height: 28, borderRadius: 6,
            background: d.signed_off ? GREEN : d.blocked ? RED : scoreColor(d.pct) + "44",
            border: `1px solid ${d.signed_off ? GREEN : scoreColor(d.pct)}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 800, color: d.signed_off ? "#000" : "#fff",
          }}>{d.signed_off ? "✓" : d.pct}</div>
        ))}
      </div>

      {r.can_go_live && launch.status === "in_progress" && (
        <div style={{ marginTop: 10, padding: "8px 12px", background: GREEN + "22", border: `1px solid ${GREEN}`, borderRadius: 8, fontSize: 12, color: GREEN, fontWeight: 800, textAlign: "center" }}>
          🎉 Siap GO LIVE
        </div>
      )}
    </button>
  );
}

function LaunchDetail({ launch, onClose, onRefresh, API }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [activeDept, setActiveDept] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setErr(null); setLoading(true);
    fetch(`${API}/api/launch/launches/${launch.id}`)
      .then(r => r.ok ? r.json() : r.json().then(j => { throw new Error(j?.error || `HTTP ${r.status}`); }))
      .then(j => { setDetail(j); if (!activeDept && j.departments?.[0]) setActiveDept(j.departments[0].code); })
      .catch(setErr).finally(() => setLoading(false));
  }, [API, launch.id, activeDept]);

  useEffect(() => { load(); }, [load]);

  const updateTask = async (taskId, patch) => {
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/launch/tasks/${taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      load();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  const doSignoff = async (deptCode) => {
    const name = prompt(`Nama dept lead untuk sign-off ${deptCode}:`);
    if (!name) return;
    const pin = prompt(`PIN dept lead "${name}":`);
    if (!pin) return;
    const comment = prompt(`Komentar (opsional):`) || "";
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/launch/launches/${launch.id}/signoff`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department: deptCode, signed_by_name: name, pin, comment }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      alert(`✓ ${deptCode} signed off`);
      load(); onRefresh?.();
    } catch (e) { alert("⚠ " + e.message); }
    setBusy(false);
  };

  const revokeSignoff = async (deptCode) => {
    if (!confirm(`Revoke sign-off ${deptCode}? Task bisa di-edit lagi setelahnya.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/launch/launches/${launch.id}/signoff/${deptCode}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ by: "admin" }) });
      if (!r.ok) { const j = await r.json(); throw new Error(j?.error); }
      load(); onRefresh?.();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  const goLive = async () => {
    if (!confirm(`KONFIRMASI: GO LIVE outlet "${launch.outlet_name}"?\n\nIni akan menandai outlet sudah operasional. Tidak bisa di-undo dari sini.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/launch/launches/${launch.id}/go-live`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ went_live_by: "admin" }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      alert(j.message || "GO LIVE!");
      load(); onRefresh?.();
    } catch (e) { alert("⚠ " + e.message); }
    setBusy(false);
  };

  const waiver = async () => {
    const reason = prompt(`Alasan GM waiver (override GO LIVE meskipun belum semua sign-off):`);
    if (!reason) return;
    const gm = prompt(`Nama GM/Owner yang waiver:`);
    if (!gm) return;
    const pin = prompt(`PIN GM:`);
    if (!pin) return;
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/launch/launches/${launch.id}/waiver`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, gm_name: gm, gm_pin: pin }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      alert(`⚠ Waived. Dept yang di-waived: ${(j.waived_departments || []).join(", ")}`);
      load(); onRefresh?.();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(1000px, 96vw)", height: "100%", background: "#0a0f1c", borderLeft: "1px solid rgba(255,255,255,0.1)", padding: 20, overflowY: "auto" }}>
        {loading ? <div style={{ padding: 80, textAlign: "center", color: "#64748b" }}>⏳ Loading…</div> :
         err ? <ErrorInline error={err} onRetry={load} /> :
         detail && (
          <>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>{launch.vertical?.toUpperCase()} / {launch.outlet_code}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>{launch.outlet_name}</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                  Target buka: <b style={{ color: "#fff" }}>{new Date(launch.target_open_date * 1000).toLocaleDateString("id-ID", { dateStyle: "full" })}</b>
                  {launch.project_manager && <> • PM: <b>{launch.project_manager}</b></>}
                </div>
              </div>
              <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>×</button>
            </div>

            {/* Overall readiness banner */}
            <div style={{ padding: 14, background: detail.readiness.can_go_live ? "rgba(16,185,129,0.08)" : "rgba(168,85,247,0.05)", border: `1px solid ${detail.readiness.can_go_live ? GREEN : "rgba(168,85,247,0.25)"}`, borderRadius: 12, marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: detail.readiness.can_go_live ? GREEN : PURPLE, letterSpacing: 1.5, fontWeight: 800, fontFamily: "'Geist Mono',monospace" }}>OVERALL READINESS</div>
                  <div style={{ fontSize: 30, fontWeight: 900, color: scoreColor(detail.readiness.overall_pct), marginTop: 2, lineHeight: 1 }}>{detail.readiness.overall_pct}<span style={{ fontSize: 16, color: "#94a3b8" }}>%</span></div>
                  <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 4 }}>{detail.readiness.signed_departments}/{detail.readiness.total_departments} departemen sign-off</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
                  {launch.status === "in_progress" ? (
                    <>
                      <button onClick={goLive} disabled={!detail.readiness.can_go_live || busy} style={{
                        padding: "12px 22px",
                        background: detail.readiness.can_go_live ? `linear-gradient(135deg,${GREEN},#059669)` : "rgba(255,255,255,0.06)",
                        border: "none", borderRadius: 10,
                        color: detail.readiness.can_go_live ? "#fff" : "rgba(255,255,255,0.3)",
                        fontSize: 14, fontWeight: 900, fontFamily: "inherit", letterSpacing: 0.5,
                        cursor: detail.readiness.can_go_live && !busy ? "pointer" : "not-allowed",
                        boxShadow: detail.readiness.can_go_live ? "0 6px 18px rgba(16,185,129,0.3)" : "none",
                      }}>🚀 GO LIVE</button>
                      {!detail.readiness.can_go_live && (
                        <button onClick={waiver} disabled={busy} style={{ padding: "8px 16px", background: "rgba(239,68,68,0.15)", border: `1px solid ${RED}`, borderRadius: 8, color: RED, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>⚠ GM Waiver Override</button>
                      )}
                    </>
                  ) : (
                    <div style={{ padding: "10px 16px", background: launch.status === "waived_live" ? "rgba(245,158,11,0.15)" : "rgba(16,185,129,0.15)", border: `1px solid ${launch.status === "waived_live" ? AMBER : GREEN}`, borderRadius: 10, fontSize: 12, color: launch.status === "waived_live" ? AMBER : GREEN, fontWeight: 800 }}>
                      {launch.status === "waived_live" ? "⚠️ WAIVED LIVE" : "✅ LIVE"} • {launch.went_live_by}
                      {launch.go_live_at && <div style={{ fontSize: 10, opacity: 0.8 }}>{new Date(launch.go_live_at * 1000).toLocaleDateString("id-ID")}</div>}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Dept tabs */}
            <div style={{ display: "flex", gap: 6, borderBottom: BORDER, marginBottom: 14, overflowX: "auto", paddingBottom: 2 }}>
              {detail.departments.map(d => {
                const dr = detail.readiness.by_department[d.code];
                return (
                  <button key={d.code} onClick={() => setActiveDept(d.code)} style={{
                    padding: "10px 12px", border: "none", background: "transparent",
                    borderBottom: activeDept === d.code ? `2px solid ${d.color}` : "2px solid transparent",
                    color: activeDept === d.code ? "#fff" : "#94a3b8",
                    fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
                    whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6,
                  }}>
                    {d.label.replace(/^[\u{1F300}-\u{1FFFF}]\s/u, "")}
                    <span style={{ padding: "2px 6px", background: dr?.signed_off ? GREEN : `${d.color}33`, color: dr?.signed_off ? "#000" : d.color, borderRadius: 4, fontSize: 10, fontFamily: "'Geist Mono',monospace" }}>
                      {dr?.signed_off ? "✓" : `${dr?.pct || 0}%`}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Dept content */}
            {activeDept && (
              <DeptPanel
                dept={detail.departments.find(d => d.code === activeDept)}
                tasks={detail.tasks.filter(t => t.department === activeDept)}
                signoff={detail.signoffs.find(s => s.department === activeDept)}
                readiness={detail.readiness.by_department[activeDept]}
                stages={detail.stages}
                onUpdateTask={updateTask}
                onSignoff={() => doSignoff(activeDept)}
                onRevoke={() => revokeSignoff(activeDept)}
                onRefresh={load}
                API={API}
                busy={busy}
                launchStatus={launch.status}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DeptPanel({ dept, tasks, signoff, readiness, stages, onUpdateTask, onSignoff, onRevoke, onRefresh, API, busy, launchStatus }) {
  // Group tasks by stage
  const byStage = stages.map(s => ({ stage: s, tasks: tasks.filter(t => t.stage === s.code) })).filter(g => g.tasks.length > 0);

  return (
    <div>
      {signoff ? (
        <div style={{ padding: 12, background: "rgba(16,185,129,0.08)", border: `1px solid ${GREEN}`, borderRadius: 10, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: GREEN, fontWeight: 800, letterSpacing: 1 }}>✓ SIGNED OFF</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 2 }}>{signoff.signed_by_name}</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(signoff.signed_at * 1000).toLocaleString("id-ID")} • {signoff.done_tasks}/{signoff.total_tasks} done, {signoff.na_tasks} N/A</div>
            {signoff.comment && <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 4, fontStyle: "italic" }}>"{signoff.comment}"</div>}
          </div>
          {launchStatus === "in_progress" && (
            <button onClick={onRevoke} disabled={busy} style={{ padding: "6px 12px", background: "rgba(239,68,68,0.15)", border: `1px solid ${RED}`, borderRadius: 6, color: RED, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Revoke</button>
          )}
        </div>
      ) : (
        <div style={{ padding: 12, background: readiness?.can_signoff ? "rgba(168,85,247,0.08)" : "rgba(245,158,11,0.06)", border: `1px solid ${readiness?.can_signoff ? PURPLE : AMBER}`, borderRadius: 10, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: readiness?.can_signoff ? PURPLE : AMBER, fontWeight: 800, letterSpacing: 1 }}>{readiness?.can_signoff ? "SIAP SIGN-OFF" : "BELUM SIAP"}</div>
            <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 4 }}>
              {readiness?.can_signoff ? "Semua task done/N/A, no blocked. Dept lead bisa tandatangan." :
                readiness?.blocked > 0 ? `${readiness.blocked} task BLOCKED — resolve dulu` :
                `${readiness?.total - readiness?.done - readiness?.na} task belum done/N/A`}
            </div>
          </div>
          {launchStatus === "in_progress" && (
            <button onClick={onSignoff} disabled={!readiness?.can_signoff || busy} style={{
              padding: "10px 16px",
              background: readiness?.can_signoff ? PURPLE : "rgba(255,255,255,0.06)",
              border: "none", borderRadius: 8,
              color: readiness?.can_signoff ? "#fff" : "rgba(255,255,255,0.3)",
              fontSize: 12, fontWeight: 800, fontFamily: "inherit",
              cursor: readiness?.can_signoff && !busy ? "pointer" : "not-allowed",
            }}>🔏 Sign-off PIN</button>
          )}
        </div>
      )}

      {/* Tasks per stage */}
      {byStage.map(({ stage, tasks }) => (
        <div key={stage.code} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: stage.color, letterSpacing: 1.5, fontWeight: 800, fontFamily: "'Geist Mono',monospace", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: stage.color }} />
            {stage.label} ({tasks.filter(t => t.status === "done").length}/{tasks.length})
          </div>
          {tasks.map(t => (
            <TaskRow key={t.id} task={t} onUpdate={onUpdateTask} disabled={!!signoff || busy} API={API} onRefresh={onRefresh} />
          ))}
        </div>
      ))}
    </div>
  );
}

function TaskRow({ task, onUpdate, disabled, API, onRefresh }) {
  const [uploading, setUploading] = useState(false);

  const statusColor = (s) => s === "done" ? GREEN : s === "blocked" ? RED : s === "in_progress" ? AMBER : s === "na" ? "#64748b" : "#475569";

  const uploadEvidence = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const r = await fetch(`${API}/api/launch/tasks/${task.id}/evidence`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_b64: dataUrl, uploaded_by: "admin" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error);
      onRefresh?.();
    } catch (err) { alert(err.message); }
    setUploading(false);
  };

  return (
    <div style={{ background: CARD_BG, border: BORDER, borderRadius: 10, padding: 12, marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>
            {task.item_label}
            {task.requires_photo === 1 && <span style={{ color: AMBER, marginLeft: 6, fontSize: 10 }}>📸</span>}
          </div>
          {task.note && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, fontStyle: "italic" }}>"{task.note}"</div>}
          {task.evidence?.length > 0 && (
            <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
              {task.evidence.map(fn => (
                <img key={fn} src={`${API}/api/launch/evidence/${fn}`} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4, border: BORDER }} />
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          <select value={task.status} onChange={e => onUpdate(task.id, { status: e.target.value })} disabled={disabled}
            style={{
              padding: "4px 8px", fontSize: 11, fontWeight: 700, fontFamily: "'Geist Mono',monospace",
              background: `${statusColor(task.status)}22`, color: statusColor(task.status),
              border: `1px solid ${statusColor(task.status)}`, borderRadius: 6,
              cursor: disabled ? "not-allowed" : "pointer", letterSpacing: 0.3,
            }}>
            <option value="pending">PENDING</option>
            <option value="in_progress">IN PROGRESS</option>
            <option value="done">DONE</option>
            <option value="blocked">BLOCKED</option>
            <option value="na">N/A</option>
          </select>
          {task.requires_photo === 1 && !disabled && (
            <label style={{ padding: "3px 8px", background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.35)", borderRadius: 6, color: PURPLE, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              <input type="file" accept="image/*" onChange={uploadEvidence} style={{ display: "none" }} />
              {uploading ? "⏳" : "📸 Upload"}
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateLaunchModal({ onClose, onCreated, API }) {
  const [form, setForm] = useState({
    outlet_code: "", outlet_name: "", vertical: "fnb", area: "",
    target_open_date_str: "", project_manager: "", gm_name: "", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    if (!form.outlet_code || !form.outlet_name || !form.target_open_date_str) {
      setErr("Outlet code, name, target open date wajib"); return;
    }
    const dateSec = Math.floor(new Date(form.target_open_date_str).getTime() / 1000);
    if (!dateSec) { setErr("Format tanggal tidak valid"); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/launch/launches`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, target_open_date: dateSec, created_by: "admin" }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      onCreated(j.id);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(520px, 100%)", background: "#0a0f1c", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 22, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>karyaOS / KOLR · NEW PROJECT</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginTop: 4, marginBottom: 14 }}>🚀 Mulai Project Outlet Baru</div>

        <Field label="Outlet Code *"><input value={form.outlet_code} onChange={e => setForm({...form, outlet_code: e.target.value.toUpperCase()})} placeholder="cth: KEMANG_02" style={inp} /></Field>
        <Field label="Outlet Name *"><input value={form.outlet_name} onChange={e => setForm({...form, outlet_name: e.target.value})} placeholder="cth: Kemang Plaza 2" style={inp} /></Field>
        <Field label="Vertical">
          <select value={form.vertical} onChange={e => setForm({...form, vertical: e.target.value})} style={inp}>
            <option value="fnb">F&B</option>
            <option value="cinema">Cinema</option>
          </select>
        </Field>
        <Field label="Area / Region"><input value={form.area} onChange={e => setForm({...form, area: e.target.value})} placeholder="cth: Jakarta Selatan" style={inp} /></Field>
        <Field label="Target Open Date *"><input type="date" value={form.target_open_date_str} onChange={e => setForm({...form, target_open_date_str: e.target.value})} style={inp} /></Field>
        <Field label="Project Manager"><input value={form.project_manager} onChange={e => setForm({...form, project_manager: e.target.value})} placeholder="Nama PM" style={inp} /></Field>
        <Field label="GM / Owner"><input value={form.gm_name} onChange={e => setForm({...form, gm_name: e.target.value})} placeholder="Nama GM" style={inp} /></Field>
        <Field label="Catatan"><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} style={{...inp, fontFamily: "inherit", resize: "vertical"}} /></Field>

        {err && <div style={{ padding: 10, background: "rgba(239,68,68,0.1)", border: `1px solid ${RED}55`, borderRadius: 8, color: "#fca5a5", fontSize: 12, marginBottom: 10 }}>⚠ {err}</div>}

        <div style={{ padding: 12, background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 8, fontSize: 11, color: "#cbd5e1", marginBottom: 14, lineHeight: 1.5 }}>
          💡 Setelah dibuat, sistem otomatis generate <b>80 task</b> dari template default (9 dept × 6 stage). Deadline per task otomatis dihitung dari target open date.
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Batal</button>
          <button onClick={submit} disabled={busy} style={{ flex: 2, padding: 12, background: `linear-gradient(135deg,${PURPLE},#7c3aed)`, border: "none", borderRadius: 10, color: "#fff", fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>{busy ? "⏳ Membuat…" : "🚀 Buat Project"}</button>
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

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 0.5, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

const inp = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, padding: "10px 12px", color: "#fff",
  fontSize: 13, fontFamily: "inherit", outline: "none",
};

const ghostBtn = { padding: "8px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" };

function scoreColor(s) {
  if (s == null) return "#475569";
  if (s >= 90) return GREEN;
  if (s >= 75) return CYAN;
  if (s >= 60) return AMBER;
  return RED;
}
