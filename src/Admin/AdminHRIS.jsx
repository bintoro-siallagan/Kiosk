/**
 * AdminHRIS.jsx — HRIS & Workforce dashboard buat admin / HRD.
 * Tab di AdminTools. Endpoint: /api/hris
 *
 * Props: apiBase — HOST backend.
 */
import { useState, useEffect, useCallback } from "react";

const MONO = "'Space Mono',monospace";
const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtTime = (ts) => ts ? new Date(ts * 1000).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—";
const fmtH = (m) => m >= 60 ? (m / 60).toFixed(1) + " jam" : (m || 0) + " mnt";
const STATUS = { present: { l: "Hadir", c: "#34D399" }, late: { l: "Telat", c: "#F59E0B" }, absent: { l: "Absen", c: "#F87171" } };
const prodCol = (n) => n >= 85 ? "#34D399" : n >= 70 ? "#F59E0B" : "#F87171";

const S = {
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 14, padding: 18, marginBottom: 16 },
  label: { fontSize: 11, color: "#555", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10, fontFamily: MONO },
  kpi: (c) => ({ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 12, padding: "12px 14px" }),
  th: { fontSize: 10, color: "#555", fontFamily: MONO, textTransform: "uppercase", textAlign: "left", padding: "6px 8px" },
  td: { fontSize: 13, color: "#c9d1d9", padding: "9px 8px", borderTop: "1px solid #161b22" },
};

export default function AdminHRIS({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [date, setDate] = useState(() => fmtDate(new Date()));
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    setErr("");
    fetch(`${apiBase}/api/hris/summary?date=${date}`)
      .then(r => r.json()).then(setD).catch(e => setErr(String(e)));
  }, [apiBase, date]);
  useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    const a = document.createElement("a");
    a.href = `${apiBase}/api/hris/export.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  if (err) return <div style={{ padding: 30, color: "#888" }}>Gagal memuat HRIS: {err}</div>;
  if (!d) return <div style={{ padding: 30, color: "#888" }}>Memuat HRIS…</div>;

  const staffCol = d.staffing.level >= 100 ? "#34D399" : d.staffing.level >= 80 ? "#F59E0B" : "#F87171";

  return (
    <div>
      <div style={{ ...S.card, background: "#0a1422", border: "1px solid #15324d", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ ...S.label, color: "#5fa8d3", marginBottom: 4 }}>👥 HRIS & Workforce</div>
          <div style={{ fontSize: 13, color: "#8b949e" }}>Absensi, keterlambatan, lembur, produktivitas & payroll staff. Kasir auto check-in saat login POS.</div>
        </div>
        <input type="date" value={date} max={fmtDate(new Date())} onChange={e => setDate(e.target.value)}
          style={{ background: "#0a0e16", border: "1px solid #21262d", borderRadius: 8, padding: "8px 11px", color: "#fff", fontSize: 13, fontFamily: "inherit", colorScheme: "dark" }} />
        <button onClick={exportCsv}
          style={{ background: "#34D39922", border: "1px solid #34D39966", borderRadius: 8, padding: "9px 15px", color: "#34D399", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          ⬇️ Export CSV
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        <Kpi c="#34D399" label="Kehadiran" value={`${d.attendance.on_duty}/${d.attendance.total}`}
          sub={`${d.attendance.present} hadir · ${d.attendance.late} telat`} />
        <Kpi c={d.attendance.late > 0 ? "#F59E0B" : "#34D399"} label="Telat Check-in" value={String(d.attendance.late)}
          sub={d.attendance.late > 0 ? "perlu perhatian" : "tepat waktu semua"} />
        <Kpi c={staffCol} label="Staffing Level" value={d.staffing.level + "%"}
          sub={`${d.staffing.on_duty}/${d.staffing.needed} dibutuhkan`} />
        <Kpi c="#A78BFA" label="Lembur" value={fmtH(d.overtime.total_minutes)}
          sub={`${d.overtime.staff_count} staff lembur`} />
      </div>

      <div style={S.card}>
        <div style={S.label}>Roster & Absensi — {d.date}</div>
        {d.roster.length === 0 ? (
          <div style={{ color: "#555", fontSize: 13, padding: 8 }}>Belum ada absensi tanggal ini</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {["Staff", "Role", "Jadwal", "Masuk", "Keluar", "Status", "Telat", "Lembur", "Produktivitas"].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {d.roster.map(r => {
                const st = STATUS[r.status] || STATUS.absent;
                return (
                  <tr key={r.id}>
                    <td style={{ ...S.td, fontWeight: 600, color: "#fff" }}>{r.staff_name}</td>
                    <td style={S.td}>{r.role || "—"}</td>
                    <td style={{ ...S.td, fontFamily: MONO }}>{r.scheduled_in || "—"}</td>
                    <td style={{ ...S.td, fontFamily: MONO }}>{fmtTime(r.check_in_at)}</td>
                    <td style={{ ...S.td, fontFamily: MONO }}>{fmtTime(r.check_out_at)}</td>
                    <td style={S.td}><span style={{ color: st.c, fontWeight: 600 }}>● {st.l}</span></td>
                    <td style={{ ...S.td, fontFamily: MONO, color: r.late_minutes > 0 ? "#F59E0B" : "#555" }}>
                      {r.late_minutes > 0 ? r.late_minutes + "m" : "—"}
                    </td>
                    <td style={{ ...S.td, fontFamily: MONO, color: r.overtime_minutes > 0 ? "#A78BFA" : "#555" }}>
                      {r.overtime_minutes > 0 ? r.overtime_minutes + "m" : "—"}
                    </td>
                    <td style={{ ...S.td, fontFamily: MONO, color: prodCol(r.productivity_score || 0), fontWeight: 700 }}>
                      {r.productivity_score ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={S.card}>
        <div style={S.label}>💰 Payroll Status</div>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", fontSize: 13 }}>
          <div><span style={{ color: "#555" }}>Periode: </span><b style={{ color: "#c9d1d9" }}>{d.payroll.period}</b></div>
          <div><span style={{ color: "#555" }}>Status: </span><b style={{ color: "#F59E0B", textTransform: "capitalize" }}>{d.payroll.status}</b></div>
          <div><span style={{ color: "#555" }}>Penggajian berikutnya: </span><b style={{ color: "#c9d1d9" }}>{d.payroll.next_run}</b></div>
          <div><span style={{ color: "#555" }}>Produktivitas tim: </span><b style={{ color: prodCol(d.productivity.avg_score || 0) }}>{d.productivity.avg_score ?? "—"}</b></div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ c, label, value, sub }) {
  return (
    <div style={S.kpi(c)}>
      <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, textTransform: "uppercase", fontFamily: MONO }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: c, fontFamily: MONO, margin: "4px 0 2px" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#666" }}>{sub}</div>
    </div>
  );
}
