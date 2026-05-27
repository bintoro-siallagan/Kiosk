// karyaOS — Unified User KPI Dashboard
// Semua user (kasir, kru, manager, dept) di-track dengan composite score 0-100.
// Aggregate dari: cashier ratings, service tickets, audits, launch signoffs, POS orders.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorInline } from "../components/ConnectionError.jsx";
import { fmtMoney } from "../lib/currency.js";

const PURPLE = "#a855f7", GREEN = "#10b981", AMBER = "#f59e0b", RED = "#ef4444", CYAN = "#22d3ee";
const CARD_BG = "rgba(255,255,255,0.04)";
const BORDER  = "1px solid rgba(255,255,255,0.08)";

export default function UserKpiDashboard({ apiBase = "" }) {
  const API = apiBase || (typeof window !== "undefined" && window.location.origin) || "";
  const [users, setUsers] = useState([]);
  const [leaderboard, setLeaderboard] = useState(null);
  const [byRole, setByRole] = useState([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filterRole, setFilterRole] = useState("");

  const load = useCallback(() => {
    setLoading(true); setErr(null);
    Promise.all([
      fetch(`${API}/api/user-kpi/users?days=${days}`).then(r => r.json()),
      fetch(`${API}/api/user-kpi/leaderboard?days=${days}`).then(r => r.json()),
      fetch(`${API}/api/user-kpi/by-role?days=${days}`).then(r => r.json()),
    ])
    .then(([u, lb, br]) => { setUsers(u?.data || []); setLeaderboard(lb); setByRole(br?.data || []); })
    .catch(setErr).finally(() => setLoading(false));
  }, [API, days]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return users.filter(u => !filterRole || u.role === filterRole);
  }, [users, filterRole]);

  const roles = useMemo(() => Array.from(new Set(users.map(u => u.role))), [users]);

  return (
    <div style={{ padding: 20, color: "#e6edf3", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif" }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>karyaOS / UNIFIED KPI</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginTop: 4, letterSpacing: -0.5 }}>📊 User KPI Dashboard</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Composite score per user from 5 source: customer rating, service ticket, daily audit, launch signoff, POS orders.</div>
      </header>

      {/* Period selector */}
      <div style={{ display: "flex", gap: 4, padding: 4, background: CARD_BG, border: BORDER, borderRadius: 10, marginBottom: 14, width: "fit-content" }}>
        {[7, 30, 90].map(d => (
          <button key={d} onClick={() => setDays(d)} style={{
            padding: "6px 14px", background: days === d ? PURPLE : "transparent",
            border: "none", borderRadius: 7, color: days === d ? "#fff" : "#94a3b8",
            fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
          }}>{d} hari</button>
        ))}
      </div>

      {leaderboard && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%, 160px),1fr))", gap: 10, marginBottom: 18 }}>
          <Kpi icon="👥" label="USER AKTIF"   value={`${leaderboard.stats.active_users}/${leaderboard.stats.total_users}`} color={CYAN} />
          <Kpi icon="📊" label="AVG SCORE"    value={leaderboard.stats.avg_score} color={scoreColor(leaderboard.stats.avg_score)} />
          <Kpi icon="🚨" label="LOW PERFORMER" value={leaderboard.stats.low_performers} color={leaderboard.stats.low_performers ? RED : "#475569"} />
          <Kpi icon="🏆" label="TOP SCORE"    value={leaderboard.top?.[0]?.score ?? "—"} color={GREEN} />
        </div>
      )}

      {err && <ErrorInline error={err} onRetry={load} />}

      {/* By Role */}
      {byRole.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1.5, fontWeight: 700, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>🎭 BY ROLE</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%, 180px),1fr))", gap: 8 }}>
            {byRole.map(r => (
              <button key={r.role} onClick={() => setFilterRole(filterRole === r.role ? "" : r.role)} style={{
                padding: 12, background: filterRole === r.role ? PURPLE + "22" : CARD_BG,
                border: `1px solid ${filterRole === r.role ? PURPLE : "rgba(255,255,255,0.08)"}`,
                borderRadius: 10, color: "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              }}>
                <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase", fontWeight: 700 }}>{r.role}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: scoreColor(r.avg_score) }}>{r.avg_score}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{r.active}/{r.count} aktif</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* User leaderboard */}
      <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1.5, fontWeight: 700, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>
        🏆 LEADERBOARD ({filtered.length} user{filterRole ? ` · role=${filterRole}` : ""})
      </div>
      <div style={{ background: CARD_BG, border: BORDER, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: BORDER, fontSize: 11, color: "#94a3b8", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", fontWeight: 700, display: "grid", gridTemplateColumns: "40px 1fr 90px 70px 70px 70px 80px", gap: 10, alignItems: "center" }}>
          <div>#</div><div>USER</div><div style={{ textAlign: "right" }}>SCORE</div><div style={{ textAlign: "right" }}>RATING</div><div style={{ textAlign: "right" }}>TIKET</div><div style={{ textAlign: "right" }}>AUDIT</div><div style={{ textAlign: "right" }}>DETAIL</div>
        </div>
        {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>No user</div>}
        {filtered.map((u, i) => (
          <div key={u.user_id} style={{
            padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)",
            display: "grid", gridTemplateColumns: "40px 1fr 90px 70px 70px 70px 80px", gap: 10, alignItems: "center",
            background: i === 0 ? "linear-gradient(90deg, rgba(16,185,129,0.06), transparent)" : "transparent",
          }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: i === 0 ? GREEN : i === 1 ? "#cbd5e1" : i === 2 ? "#d97706" : "#64748b" }}>
              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{u.name}</div>
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 2, fontFamily: "'Geist Mono',monospace" }}>{u.role}{u.active ? "" : " · inactive"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: scoreColor(u.score), lineHeight: 1 }}>{u.score}</div>
              <div style={{ fontSize: 10, color: scoreColor(u.score), fontWeight: 700, marginTop: 2 }}>{u.grade}</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 12, color: u.cashier?.total_ratings > 0 ? "#fbbf24" : "#475569", fontVariantNumeric: "tabular-nums" }}>
              {u.cashier?.total_ratings > 0 ? `${u.cashier.avg_rating?.toFixed(1)}★ × ${u.cashier.total_ratings}` : "—"}
            </div>
            <div style={{ textAlign: "right", fontSize: 12, color: u.service?.total > 0 ? CYAN : "#475569", fontVariantNumeric: "tabular-nums" }}>
              {u.service?.total > 0 ? `${u.service.completed}/${u.service.total}` : "—"}
            </div>
            <div style={{ textAlign: "right", fontSize: 12, color: u.audit?.submissions > 0 ? GREEN : "#475569", fontVariantNumeric: "tabular-nums" }}>
              {u.audit?.submissions || "—"}
            </div>
            <div style={{ textAlign: "right" }}>
              <button onClick={() => setSelected(u)} style={{ padding: "5px 10px", background: PURPLE + "22", border: `1px solid ${PURPLE}55`, borderRadius: 6, color: PURPLE, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>View</button>
            </div>
          </div>
        ))}
      </div>

      {selected && <UserDetailDrawer user={selected} days={days} onClose={() => setSelected(null)} />}
    </div>
  );
}

function UserDetailDrawer({ user, days, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(560px, 96vw)", height: "100%", background: "#0a0f1c", borderLeft: "1px solid rgba(255,255,255,0.1)", padding: 20, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>USER KPI · {days}D</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{user.name}</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>{user.role} · {user.user_id}</div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: 18, background: `${scoreColor(user.score)}11`, border: `1px solid ${scoreColor(user.score)}33`, borderRadius: 12, marginBottom: 14, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: scoreColor(user.score), letterSpacing: 1.5, fontWeight: 800, fontFamily: "'Geist Mono',monospace" }}>OVERALL SCORE</div>
          <div style={{ fontSize: 56, fontWeight: 900, color: scoreColor(user.score), marginTop: 2, lineHeight: 1 }}>{user.score}</div>
          <div style={{ fontSize: 14, color: scoreColor(user.score), fontWeight: 800, marginTop: 4 }}>GRADE {user.grade}</div>
        </div>

        <Section icon="⭐" label="CUSTOMER RATING" color="#fbbf24">
          <Stat label="Avg Rating" value={user.cashier?.avg_rating ? user.cashier.avg_rating.toFixed(2) + "★" : "—"} />
          <Stat label="Total Reviews" value={user.cashier?.total_ratings || 0} />
          <Stat label="5★ Count" value={user.cashier?.five_star || 0} color={GREEN} />
          <Stat label="≤2★ Count" value={user.cashier?.low_star || 0} color={user.cashier?.low_star > 0 ? RED : "#94a3b8"} />
        </Section>

        <Section icon="🔧" label="SERVICE TICKETS" color={CYAN}>
          <Stat label="Total Assigned" value={user.service?.total || 0} />
          <Stat label="Completed" value={user.service?.completed || 0} color={GREEN} />
          <Stat label="In Progress" value={user.service?.in_progress || 0} color={CYAN} />
          <Stat label="Completion %" value={user.service?.completion_pct != null ? user.service.completion_pct + "%" : "—"} />
          <Stat label="On-Time %" value={user.service?.on_time_pct != null ? user.service.on_time_pct + "%" : "—"} color={user.service?.on_time_pct >= 80 ? GREEN : user.service?.on_time_pct >= 60 ? AMBER : RED} />
          <Stat label="Avg Duration" value={user.service?.avg_duration_min ? fmtMin(user.service.avg_duration_min) : "—"} />
        </Section>

        <Section icon="📋" label="DAILY AUDIT" color={GREEN}>
          <Stat label="Submissions" value={user.audit?.submissions || 0} />
          <Stat label="Avg Score" value={user.audit?.avg_score ? Math.round(user.audit.avg_score) : "—"} />
          <Stat label="Violations" value={user.audit?.violations || 0} color={user.audit?.violations > 0 ? RED : "#94a3b8"} />
        </Section>

        <Section icon="🚀" label="LAUNCH SIGNOFFS" color={PURPLE}>
          <Stat label="Signed Dept" value={user.launch?.signoffs || 0} />
        </Section>

        <Section icon="🧾" label="POS / SALES" color="#fbbf24">
          <Stat label="Orders" value={user.pos?.orders || 0} />
          <Stat label="Revenue" value={fmtMoney(user.pos?.total_revenue)} />
        </Section>
      </div>
    </div>
  );
}

function Section({ icon, label, color, children }) {
  return (
    <div style={{ padding: 14, background: CARD_BG, border: BORDER, borderRadius: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 11, color, letterSpacing: 1.5, fontWeight: 800, fontFamily: "'Geist Mono',monospace", marginBottom: 10 }}>{icon} {label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{children}</div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ padding: 8, background: "rgba(0,0,0,0.25)", borderRadius: 6 }}>
      <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: color || "#fff", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function Kpi({ icon, label, value, color }) {
  return (
    <div style={{ padding: 12, background: CARD_BG, border: BORDER, borderRadius: 10 }}>
      <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 1.3, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{icon} {label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color, marginTop: 4, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

function scoreColor(s) {
  if (s == null) return "#475569";
  if (s >= 90) return GREEN;
  if (s >= 75) return CYAN;
  if (s >= 60) return AMBER;
  return RED;
}
function fmtMin(m) { if (m == null) return "—"; if (m < 60) return m + "m"; return Math.floor(m/60) + "h " + (m%60) + "m"; }
