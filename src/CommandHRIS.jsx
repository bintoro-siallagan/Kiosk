// src/CommandHRIS.jsx
// Command Center — HRIS & Workforce section (Core Indicator #6).
// Attendance, late check-in, staffing level, overtime, productivity, payroll.

import { useState, useEffect, useCallback } from "react";
import { ErrorInline } from "./components/ConnectionError.jsx";
import API_HOST from "./apiBase.js";

const API = API_HOST;
const MONO = "var(--m)";

const STATUS = {
  present: { label: "Hadir", col: "#10b981" },
  late:    { label: "Telat", col: "#f59e0b" },
  absent:  { label: "Absen", col: "#ef4444" },
};
const fmtTime = (ts) => ts ? new Date(ts * 1000).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—";
const fmtH = (min) => min >= 60 ? (min / 60).toFixed(1) + " jam" : (min || 0) + " mnt";
const prodCol = (n) => (n >= 85 ? "#10b981" : n >= 70 ? "#f59e0b" : "#ef4444");
const GRID = "1.4fr 0.9fr 0.8fr 0.7fr 0.8fr 1.3fr";

export default function CommandHRIS() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    fetch(`${API}/api/hris/summary`).then(r => r.json()).then(j => j && !j.error ? setD(j) : setErr((j && j.error) || "data tidak tersedia")).catch(e => setErr(String(e)));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  if (err) return <div style={{ padding: 20 }}><ErrorInline error={err} onRetry={load} /></div>;
  if (!d) return <div style={S.msg}>Memuat HRIS & Workforce…</div>;

  const staffCol = d.staffing.level >= 100 ? "#10b981" : d.staffing.level >= 80 ? "#f59e0b" : "#ef4444";
  const avgProd = d.productivity.avg_score;

  return (
    <div style={S.wrap}>
      <div style={S.kpiRow}>
        <Kpi label="Kehadiran" value={`${d.attendance.on_duty}/${d.attendance.total}`} accent="#10b981"
          sub={`${d.attendance.present} hadir · ${d.attendance.late} telat`} />
        <Kpi label="Telat Check-in" value={String(d.attendance.late)}
          accent={d.attendance.late > 0 ? "#f59e0b" : "#10b981"}
          sub={d.attendance.late > 0 ? "perlu perhatian" : "tepat waktu semua"} />
        <Kpi label="Staffing Level" value={d.staffing.level + "%"} accent={staffCol}
          sub={`${d.staffing.on_duty} on-duty / ${d.staffing.needed} dibutuhkan`} />
        <Kpi label="Lembur Hari Ini" value={fmtH(d.overtime.total_minutes)} accent="#a78bfa"
          sub={`${d.overtime.staff_count} staff lembur`} />
      </div>

      <div style={S.card}>
        <div style={S.kicker}>👥 ROSTER & ABSENSI — {d.date}</div>
        <div style={{ ...S.gridRow, padding: "4px 0", borderBottom: "1px solid #21262d", fontSize: 10, color: "#666", fontFamily: MONO, textTransform: "uppercase" }}>
          <span>Staff</span><span>Role</span><span>Masuk</span><span>Telat</span><span>Lembur</span><span>Produktivitas</span>
        </div>
        {d.roster.map(r => {
          const st = STATUS[r.status] || STATUS.absent;
          return (
            <div key={r.id} style={{ ...S.gridRow, padding: "10px 0", borderBottom: "1px solid #161b22", alignItems: "center" }}>
              <span style={{ fontSize: 14, color: "#eee", fontWeight: 600, display: "flex", gap: 7, alignItems: "center" }}>
                <span style={{ width: 8, height: 8, borderRadius: 8, background: st.col, flexShrink: 0 }} />
                {r.staff_name}
              </span>
              <span style={{ fontSize: 12, color: "#999" }}>{r.role || "—"}</span>
              <span style={{ fontSize: 12, fontFamily: MONO, color: "#ccc" }}>{fmtTime(r.check_in_at)}</span>
              <span style={{ fontSize: 12, fontFamily: MONO, color: r.late_minutes > 0 ? "#f59e0b" : "#555" }}>
                {r.late_minutes > 0 ? r.late_minutes + "m" : "—"}
              </span>
              <span style={{ fontSize: 12, fontFamily: MONO, color: r.overtime_minutes > 0 ? "#a78bfa" : "#555" }}>
                {r.overtime_minutes > 0 ? r.overtime_minutes + "m" : "—"}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, height: 6, background: "#21262d", borderRadius: 3, overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: (r.productivity_score || 0) + "%", background: prodCol(r.productivity_score || 0) }} />
                </span>
                <b style={{ fontFamily: MONO, fontSize: 12, color: "#ccc", width: 24, textAlign: "right" }}>{r.productivity_score ?? "—"}</b>
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ ...S.card, textAlign: "center" }}>
          <div style={S.kicker}>📊 PRODUCTIVITY SCORE TIM</div>
          <div style={{ fontSize: 46, fontWeight: 800, color: prodCol(avgProd || 0), fontFamily: MONO, lineHeight: 1.1 }}>
            {avgProd ?? "—"}
          </div>
          <div style={{ fontSize: 12, color: "#777" }}>rata-rata produktivitas staff hari ini</div>
        </div>
        <div style={S.card}>
          <div style={S.kicker}>💰 PAYROLL STATUS</div>
          <Row k="Periode" v={d.payroll.period} />
          <Row k="Status" v={d.payroll.status} vc="#f59e0b" />
          <Row k="Penggajian berikutnya" v={d.payroll.next_run} />
          <div style={{ fontSize: 11, color: "#666", marginTop: 8 }}>
            Lembur & absensi otomatis masuk perhitungan payroll.
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, vc }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #161b22", fontSize: 13 }}>
      <span style={{ color: "#888" }}>{k}</span>
      <b style={{ color: vc || "#ddd", textTransform: "capitalize" }}>{v}</b>
    </div>
  );
}

function Kpi({ label, value, accent, sub }) {
  return (
    <div style={{ ...S.kpi, borderTop: `2px solid ${accent}` }}>
      <div style={{ fontSize: 10, color: "#666", letterSpacing: 1, textTransform: "uppercase", fontFamily: MONO }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent, fontFamily: MONO, margin: "5px 0 2px" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#777" }}>{sub}</div>
    </div>
  );
}

const S = {
  wrap: { display: "flex", flexDirection: "column", gap: 14 },
  msg: { padding: 40, textAlign: "center", color: "#666", fontSize: 14 },
  card: { background: "#0d1117", border: "1px solid #21262d", borderRadius: 14, padding: 18 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#888", fontFamily: MONO, marginBottom: 12 },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  kpi: { background: "#0d1117", border: "1px solid #21262d", borderRadius: 12, padding: "12px 14px" },
  gridRow: { display: "grid", gridTemplateColumns: GRID, gap: 8 },
};
