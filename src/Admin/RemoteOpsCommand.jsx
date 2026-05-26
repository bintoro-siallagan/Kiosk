// karyaOS — Remote Outlet Command Center (KROC)
// Single dashboard: 20 outlet at-a-glance, color-coded health,
// realtime anomaly count, drill-down ke audit photos + CCTV + KPI.
// Goal: substitute OP Head visits with remote eyes.
import { useEffect, useMemo, useState } from "react";

const COLORS = { A: "#10b981", B: "#22d3ee", C: "#f59e0b", D: "#ef4444", muted: "#475569" };
const CARD_BG = "rgba(255,255,255,0.04)";
const BORDER  = "1px solid rgba(255,255,255,0.08)";

export default function RemoteOpsCommand({ apiBase = "" }) {
  const API = apiBase || (typeof window !== "undefined" && window.location.origin) || "";
  const [outlets, setOutlets] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null); // outlet object → drill-down
  const [filter, setFilter] = useState("all"); // all|red|amber|green
  const [verticalFilter, setVerticalFilter] = useState("all");
  const [tick, setTick] = useState(0);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [oR, aR] = await Promise.all([
        fetch(`${API}/api/remote-ops/outlets`).then(r => r.json()),
        fetch(`${API}/api/remote-ops/anomalies?status=open`).then(r => r.json()),
      ]);
      setOutlets(Array.isArray(oR?.data) ? oR.data : []);
      setAnomalies(Array.isArray(aR?.data) ? aR.data : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [tick]);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 60_000); return () => clearInterval(id); }, []);

  const triggerDetect = async () => {
    await fetch(`${API}/api/remote-ops/anomalies/detect`, { method: "POST" });
    await fetch(`${API}/api/remote-ops/health-scores/recompute`, { method: "POST" });
    setTick(t => t + 1);
  };

  const filtered = useMemo(() => {
    return outlets.filter(o => {
      if (verticalFilter !== "all" && o.vertical !== verticalFilter) return false;
      const s = o.health?.score ?? null;
      if (filter === "red")   return s !== null && s < 60;
      if (filter === "amber") return s !== null && s >= 60 && s < 75;
      if (filter === "green") return s !== null && s >= 75;
      return true;
    });
  }, [outlets, filter, verticalFilter]);

  const summary = useMemo(() => {
    const totalOutlets = outlets.length;
    const scored = outlets.filter(o => o.health?.score != null);
    const avgScore = scored.length ? Math.round(scored.reduce((s, o) => s + o.health.score, 0) / scored.length) : 0;
    const red = outlets.filter(o => (o.health?.score ?? 100) < 60).length;
    const auditDone = outlets.filter(o => o.audit_today).length;
    const auditPct = totalOutlets ? Math.round(auditDone / totalOutlets * 100) : 0;
    const criticalAnomalies = anomalies.filter(a => a.severity === "critical").length;
    return { totalOutlets, avgScore, red, auditDone, auditPct, totalAnomalies: anomalies.length, criticalAnomalies };
  }, [outlets, anomalies]);

  return (
    <div style={{ padding: 20, color: "#e6edf3", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif", minHeight: "100vh" }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: "#a855f7", letterSpacing: 2.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>karyaOS / KROC — REMOTE OUTLET COMMAND</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginTop: 4, letterSpacing: -0.5 }}>🛰️ Outlet Command Center</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Mata Owner di setiap outlet — tanpa naik pesawat.</div>
      </header>

      {/* KPI summary strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%, 140px),1fr))", gap: 10, marginBottom: 18 }}>
        <KPICard icon="🏪" label="OUTLETS"           value={summary.totalOutlets} sub="terdaftar" color="#22d3ee" />
        <KPICard icon="💯" label="AVG HEALTH"        value={summary.avgScore} sub="dari 100" color={scoreColor(summary.avgScore)} />
        <KPICard icon="🔴" label="OUTLETS MERAH"     value={summary.red} sub="<60 score" color={summary.red ? COLORS.D : COLORS.muted} />
        <KPICard icon="📋" label="AUDIT HARI INI"    value={`${summary.auditDone}/${summary.totalOutlets}`} sub={`${summary.auditPct}% selesai`} color={summary.auditPct >= 80 ? COLORS.A : COLORS.C} />
        <KPICard icon="🚨" label="ANOMALI AKTIF"     value={summary.totalAnomalies} sub={`${summary.criticalAnomalies} critical`} color={summary.criticalAnomalies ? COLORS.D : COLORS.muted} />
      </div>

      {/* Critical anomaly banner */}
      {anomalies.length > 0 && (
        <div style={{ marginBottom: 18, padding: 14, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12 }}>
          <div style={{ fontSize: 11, color: COLORS.D, fontWeight: 800, letterSpacing: 1.5, marginBottom: 8 }}>🚨 ANOMALI AKTIF ({anomalies.length})</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {anomalies.slice(0, 6).map(a => (
              <div key={a.id} style={{ padding: "6px 10px", background: "rgba(0,0,0,0.3)", border: `1px solid ${a.severity === "critical" ? COLORS.D : COLORS.C}`, borderRadius: 6, fontSize: 11, color: "#fca5a5" }}>
                <b style={{ color: "#fff" }}>{a.outlet_code}</b> — {a.message.slice(0, 60)}{a.message.length > 60 ? "…" : ""}
              </div>
            ))}
            {anomalies.length > 6 && <span style={{ fontSize: 11, color: "#94a3b8", padding: "6px 10px" }}>+{anomalies.length - 6} lagi</span>}
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <Pills value={verticalFilter} onChange={setVerticalFilter} options={[["all","Semua Vertical"],["fnb","F&B"],["cinema","Cinema"]]} />
        <Pills value={filter} onChange={setFilter} options={[["all","Semua"],["red","🔴 Merah"],["amber","🟡 Kuning"],["green","🟢 Hijau"]]} />
        <div style={{ flex: 1 }} />
        <button onClick={triggerDetect} style={btn(false)}>🔍 Run Detect + Health Recompute</button>
        <button onClick={() => setTick(t => t + 1)} style={btn(false)}>{loading ? "⏳" : "↻"} Refresh</button>
      </div>

      {/* Outlet grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%, 260px),1fr))", gap: 12 }}>
        {filtered.map(o => (
          <OutletCard key={o.code} outlet={o} onClick={() => setSelected(o)} />
        ))}
        {filtered.length === 0 && !loading && (
          <div style={{ gridColumn: "1/-1", padding: 40, textAlign: "center", color: "#64748b" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
            <div>Belum ada outlet untuk filter ini</div>
          </div>
        )}
      </div>

      {/* Drill-down drawer */}
      {selected && <OutletDrawer outlet={selected} onClose={() => setSelected(null)} API={API} anomalies={anomalies.filter(a => a.outlet_code === selected.code)} />}
    </div>
  );
}

function OutletCard({ outlet, onClick }) {
  const s = outlet.health?.score;
  const grade = outlet.health?.grade || "—";
  const color = s == null ? COLORS.muted : scoreColor(s);
  return (
    <button onClick={onClick} style={{
      textAlign: "left", padding: 14, background: CARD_BG, border: `1px solid ${color}33`,
      borderRadius: 14, color: "#fff", fontFamily: "inherit", cursor: "pointer",
      transition: "transform 0.15s ease, border-color 0.15s ease",
      borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{outlet.vertical?.toUpperCase()} • {outlet.code}</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: "#fff", marginTop: 2 }}>{outlet.name}</div>
          {outlet.manager && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>👤 {outlet.manager}</div>}
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{s ?? "—"}</div>
          <div style={{ fontSize: 11, color, fontWeight: 800, marginTop: 2 }}>GRADE {grade}</div>
        </div>
      </div>

      {/* Breakdown bar */}
      {outlet.health?.breakdown && (
        <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
          <BarSeg label="SALES"    pct={outlet.health.breakdown.sales_pct} />
          <BarSeg label="RATING"   pct={outlet.health.breakdown.rating_pct} />
          <BarSeg label="INCIDENT" pct={outlet.health.breakdown.incident_pct} />
          <BarSeg label="AUDIT"    pct={outlet.health.breakdown.audit_pct} />
          <BarSeg label="VOID"     pct={outlet.health.breakdown.void_pct} />
        </div>
      )}

      {/* Footer chips */}
      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        <Chip color={outlet.audit_today ? COLORS.A : COLORS.D}>{outlet.audit_today ? `✅ Audit ${outlet.audit_today.overall_score}` : "❌ No Audit"}</Chip>
        {outlet.open_anomalies > 0 && <Chip color={COLORS.D}>🚨 {outlet.open_anomalies} anomali</Chip>}
        {outlet.health?.metrics?.open_incidents > 0 && <Chip color={COLORS.C}>⚠ {outlet.health.metrics.open_incidents} incident</Chip>}
      </div>
    </button>
  );
}

function BarSeg({ label, pct }) {
  const p = Math.max(0, Math.min(100, pct ?? 0));
  const color = scoreColor(p);
  return (
    <div title={`${label}: ${p}`} style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${p}%`, height: "100%", background: color }} />
    </div>
  );
}

function OutletDrawer({ outlet, onClose, API, anomalies }) {
  const [tab, setTab] = useState("audit");
  const [audit, setAudit] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [aR, cR, vR] = await Promise.all([
          fetch(`${API}/api/remote-ops/audit/today?outlet=${encodeURIComponent(outlet.code)}`).then(r => r.json()),
          fetch(`${API}/api/remote-ops/cameras?outlet=${encodeURIComponent(outlet.code)}`).then(r => r.json()),
          fetch(`${API}/api/remote-ops/visits?limit=20`).then(r => r.json()),
        ]);
        setAudit(aR);
        setCameras(Array.isArray(cR?.data) ? cR.data : []);
        setVisits((Array.isArray(vR?.data) ? vR.data : []).filter(v => v.outlet_code === outlet.code));
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [outlet.code]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(900px, 96vw)", height: "100%", background: "#0a0f1c",
        borderLeft: "1px solid rgba(255,255,255,0.1)", padding: 20, overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: "#a855f7", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>{outlet.vertical?.toUpperCase()} / {outlet.code}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>{outlet.name}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
              <span style={{ fontSize: 36, fontWeight: 900, color: scoreColor(outlet.health?.score) }}>{outlet.health?.score ?? "—"}</span>
              <div>
                <div style={{ fontSize: 13, color: "#cbd5e1", fontWeight: 700 }}>Grade {outlet.health?.grade ?? "—"}</div>
                {outlet.manager && <div style={{ fontSize: 11, color: "#94a3b8" }}>Manager: {outlet.manager}</div>}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {/* Anomaly list in drawer */}
        {anomalies.length > 0 && (
          <div style={{ marginBottom: 14, padding: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: COLORS.D, fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>🚨 OUTLET ANOMALIES</div>
            {anomalies.map(a => (
              <div key={a.id} style={{ fontSize: 12, color: "#fca5a5", marginTop: 4 }}>
                <b style={{ color: a.severity === "critical" ? COLORS.D : COLORS.C }}>[{a.severity}]</b> {a.anomaly_type}: {a.message}
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, borderBottom: BORDER, marginBottom: 14 }}>
          {[["audit","📋 Audit Photos"],["cctv",`📹 CCTV (${cameras.length})`],["kpi","📊 KPI Breakdown"],["visits",`📍 Visits (${visits.length})`]].map(([k,lbl]) => (
            <button key={k} onClick={() => setTab(k)} style={tabBtn(tab === k)}>{lbl}</button>
          ))}
        </div>

        {loading ? <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>⏳ Loading…</div> : (
          <>
            {tab === "audit" && <AuditTab audit={audit} API={API} />}
            {tab === "cctv" && <CctvTab cameras={cameras} />}
            {tab === "kpi" && <KpiTab outlet={outlet} />}
            {tab === "visits" && <VisitsTab visits={visits} API={API} />}
          </>
        )}
      </div>
    </div>
  );
}

function AuditTab({ audit, API }) {
  if (!audit?.submitted) return (
    <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
      <div>Belum ada audit submission hari ini</div>
      <div style={{ fontSize: 11, marginTop: 6, color: "#475569" }}>Manager outlet wajib submit sebelum jam 10:00</div>
    </div>
  );
  const a = audit.audit, items = audit.items || [];
  return (
    <div>
      <div style={{ padding: 12, background: CARD_BG, border: BORDER, borderRadius: 10, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "#cbd5e1" }}>
          <div>👤 <b style={{ color: "#fff" }}>{a.manager_name || "—"}</b></div>
          <div>⏱️ {new Date(a.submitted_at * 1000).toLocaleString("id-ID")}</div>
          <div>📊 Score: <b style={{ color: scoreColor(a.overall_score) }}>{a.overall_score}/100</b></div>
          <div>✅ {a.pass_items}/{a.total_items} items passed (≥4★)</div>
          {a.gps_lat && <div>📍 {a.gps_lat.toFixed(4)},{a.gps_lon.toFixed(4)}</div>}
        </div>
        {a.notes && <div style={{ marginTop: 8, fontSize: 12, color: "#cbd5e1", fontStyle: "italic" }}>"{a.notes}"</div>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%, 200px),1fr))", gap: 12 }}>
        {items.map(it => (
          <div key={it.id} style={{ background: CARD_BG, border: BORDER, borderRadius: 10, overflow: "hidden" }}>
            {it.photo_filename ? (
              <img src={`${API}/api/remote-ops/audit/photos/${it.photo_filename}`} alt={it.item_label} style={{ width: "100%", height: 160, objectFit: "cover", display: "block", background: "#000" }} />
            ) : (
              <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.3)", color: "#64748b", fontSize: 32 }}>—</div>
            )}
            <div style={{ padding: 10 }}>
              <div style={{ fontSize: 12, color: "#fff", fontWeight: 700, lineHeight: 1.3 }}>{it.item_label}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <div style={{ fontSize: 14, color: it.rating >= 4 ? COLORS.A : it.rating >= 3 ? COLORS.C : COLORS.D, fontWeight: 800 }}>
                  {"★".repeat(it.rating)}<span style={{ opacity: 0.2 }}>{"★".repeat(5 - it.rating)}</span>
                </div>
              </div>
              {it.note && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, fontStyle: "italic" }}>"{it.note}"</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CctvTab({ cameras }) {
  if (cameras.length === 0) return (
    <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>📹</div>
      <div>Belum ada kamera ter-config untuk outlet ini</div>
      <div style={{ fontSize: 11, marginTop: 6, color: "#475569" }}>Tambah via menu Outlet Pins & Cameras</div>
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%, 280px),1fr))", gap: 12 }}>
      {cameras.map(cam => (
        <div key={cam.id} style={{ background: CARD_BG, border: BORDER, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", background: "rgba(0,0,0,0.4)", fontSize: 11, color: "#22d3ee", fontWeight: 700, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", display: "flex", justifyContent: "space-between" }}>
            <span>📹 {cam.camera_name}</span>
            <span style={{ color: "#64748b" }}>{cam.camera_type.toUpperCase()}</span>
          </div>
          {cam.camera_type === "mjpeg" ? (
            <img src={cam.url} alt={cam.camera_name} style={{ width: "100%", height: 240, objectFit: "cover", display: "block", background: "#000" }} />
          ) : cam.camera_type === "iframe" ? (
            <iframe src={cam.url} title={cam.camera_name} style={{ width: "100%", height: 240, border: "none", background: "#000" }} />
          ) : (
            <div style={{ padding: 20, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
              HLS stream: <code style={{ color: "#22d3ee", fontSize: 10, wordBreak: "break-all" }}>{cam.url}</code>
              <div style={{ marginTop: 6, fontSize: 10, color: "#64748b" }}>(Require hls.js loader — coming soon)</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function KpiTab({ outlet }) {
  const b = outlet.health?.breakdown;
  const m = outlet.health?.metrics;
  if (!b) return <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Belum ada data health score</div>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%, 200px),1fr))", gap: 12 }}>
      <KpiBlock title="💰 SALES (30%)"   pct={b.sales_pct}    detail={`Today: Rp ${(m?.sales_today || 0).toLocaleString("id-ID")} • 7d avg: Rp ${(m?.sales_7d_avg || 0).toLocaleString("id-ID")}`} />
      <KpiBlock title="⭐ RATING (25%)"  pct={b.rating_pct}   detail={`Avg ${(m?.avg_rating || 0).toFixed(2)}★ dari ${m?.rating_count || 0} review`} />
      <KpiBlock title="🚨 INCIDENT (20%)" pct={b.incident_pct} detail={`${m?.open_incidents || 0} insiden terbuka`} />
      <KpiBlock title="📋 AUDIT (15%)"   pct={b.audit_pct}    detail={m?.audit_submitted ? "Submitted hari ini" : "Belum submit"} />
      <KpiBlock title="🚫 VOID (10%)"    pct={b.void_pct}     detail="Lower void rate = higher score" />
    </div>
  );
}

function KpiBlock({ title, pct, detail }) {
  return (
    <div style={{ padding: 14, background: CARD_BG, border: BORDER, borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color: scoreColor(pct), marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{pct}</div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: scoreColor(pct) }} />
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, lineHeight: 1.4 }}>{detail}</div>
    </div>
  );
}

function VisitsTab({ visits, API }) {
  if (visits.length === 0) return <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Belum ada visit log untuk outlet ini</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {visits.map(v => (
        <div key={v.id} style={{ padding: 12, background: CARD_BG, border: BORDER, borderRadius: 10, display: "flex", gap: 12 }}>
          {v.arrival_photo ? (
            <img src={`${API}/api/remote-ops/audit/photos/${v.arrival_photo}`} alt="arrival" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8 }} />
          ) : <div style={{ width: 80, height: 80, background: "rgba(0,0,0,0.3)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>📍</div>}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{v.visitor_name} <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>({v.visitor_role || "—"})</span></div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              {v.checked_in_at ? `✅ Check-in: ${new Date(v.checked_in_at*1000).toLocaleString("id-ID")}` : `📅 Scheduled: ${new Date(v.scheduled_at*1000).toLocaleString("id-ID")}`}
            </div>
            {v.gps_distance_m != null && (
              <div style={{ fontSize: 11, marginTop: 2, color: v.gps_distance_m <= 200 ? COLORS.A : COLORS.D }}>
                📍 {v.gps_distance_m}m dari pin outlet {v.gps_distance_m <= 200 ? "✓ valid" : "✗ jauh dari outlet"}
              </div>
            )}
            {v.notes && <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 4, fontStyle: "italic" }}>"{v.notes}"</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────── helpers ───────
function KPICard({ icon, label, value, sub, color }) {
  return (
    <div style={{ padding: 12, background: CARD_BG, border: BORDER, borderRadius: 10 }}>
      <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 1.3, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{icon} {label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color, marginTop: 4, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function Pills({ value, onChange, options }) {
  return (
    <div style={{ display: "flex", gap: 4, padding: 4, background: CARD_BG, border: BORDER, borderRadius: 10 }}>
      {options.map(([k, lbl]) => (
        <button key={k} onClick={() => onChange(k)} style={pillBtn(value === k)}>{lbl}</button>
      ))}
    </div>
  );
}

function Chip({ color, children }) {
  return <span style={{ padding: "3px 8px", background: `${color}22`, border: `1px solid ${color}55`, borderRadius: 6, fontSize: 10, color, fontWeight: 700, fontFamily: "'Geist Mono',monospace", letterSpacing: 0.3 }}>{children}</span>;
}

function pillBtn(active) {
  return { padding: "6px 12px", background: active ? "#a855f7" : "transparent", border: "none", borderRadius: 7, color: active ? "#fff" : "#94a3b8", fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", letterSpacing: 0.5 };
}
function tabBtn(active) {
  return { padding: "10px 14px", background: "transparent", border: "none", borderBottom: active ? "2px solid #a855f7" : "2px solid transparent", color: active ? "#fff" : "#94a3b8", fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", letterSpacing: 0.3 };
}
function btn(active) {
  return { padding: "8px 14px", background: active ? "#a855f7" : "rgba(255,255,255,0.04)", border: `1px solid ${active ? "#a855f7" : "rgba(255,255,255,0.1)"}`, borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" };
}

function scoreColor(s) {
  if (s == null) return COLORS.muted;
  if (s >= 90) return COLORS.A;
  if (s >= 75) return COLORS.B;
  if (s >= 60) return COLORS.C;
  return COLORS.D;
}
