/**
 * AdminHRIS.jsx — HRIS & Workforce buat admin / HRD.
 * Recap absensi per rentang tanggal + integrasi Talenta (Mekari HRIS).
 *
 * Props: apiBase — HOST backend.
 */
import { useState, useEffect, useCallback } from "react";

const MONO = "'Space Mono',monospace";
const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtH = (m) => m >= 60 ? (m / 60).toFixed(1) + " jam" : (m || 0) + " mnt";
const prodCol = (n) => n >= 85 ? "#34D399" : n >= 70 ? "#F59E0B" : "#F87171";
const rateCol = (n) => n >= 95 ? "#34D399" : n >= 80 ? "#F59E0B" : "#F87171";

const S = {
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 14, padding: 18, marginBottom: 16 },
  label: { fontSize: 11, color: "#555", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10, fontFamily: MONO },
  kpi: (c) => ({ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 12, padding: "12px 14px" }),
  th: { fontSize: 10, color: "#555", fontFamily: MONO, textTransform: "uppercase", textAlign: "left", padding: "7px 8px" },
  td: { fontSize: 13, color: "#c9d1d9", padding: "9px 8px", borderTop: "1px solid #161b22" },
  date: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 8, padding: "7px 10px", color: "#fff", fontSize: 13, fontFamily: "inherit", colorScheme: "dark" },
  btn: (active) => ({ background: active ? "#A78BFA22" : "transparent", border: `1px solid ${active ? "#A78BFA66" : "#21262d"}`, borderRadius: 8, padding: "7px 13px", color: active ? "#A78BFA" : "#8b949e", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }),
};

const TALENTA_STATE = {
  belum_dikonfigurasi: { c: "#F87171", dot: "🔴", l: "Belum dikonfigurasi" },
  terhubung:           { c: "#34D399", dot: "🟢", l: "Terhubung" },
  kredensial_ditolak:  { c: "#F59E0B", dot: "🟡", l: "Kredensial ditolak" },
  gagal:               { c: "#F59E0B", dot: "🟡", l: "Gagal konek" },
};

export default function AdminHRIS({ apiBase = "" }) {
  const [recap, setRecap] = useState(null);
  const [talenta, setTalenta] = useState(null);
  const [fromDate, setFromDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 6); return fmtDate(d); });
  const [toDate, setToDate] = useState(() => fmtDate(new Date()));
  const [preset, setPreset] = useState("7d");
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    setErr("");
    fetch(`${apiBase}/api/hris/recap?from=${fromDate}&to=${toDate}`)
      .then(r => r.json()).then(setRecap).catch(e => setErr(String(e)));
  }, [apiBase, fromDate, toDate]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch(`${apiBase}/api/talenta/status`).then(r => r.json()).then(setTalenta).catch(() => {});
  }, [apiBase]);

  const applyPreset = (key) => {
    const today = new Date(), f = new Date(today);
    if (key === "7d") f.setDate(f.getDate() - 6);
    else if (key === "30d") f.setDate(f.getDate() - 29);
    setFromDate(fmtDate(f)); setToDate(fmtDate(today)); setPreset(key);
  };
  const exportCsv = () => {
    const a = document.createElement("a");
    a.href = `${apiBase}/api/hris/export.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  if (err) return <div style={{ padding: 30, color: "#888" }}>Gagal memuat HRIS: {err}</div>;
  if (!recap) return <div style={{ padding: 30, color: "#888" }}>Memuat HRIS…</div>;

  const t = recap.totals;
  const st = talenta ? (TALENTA_STATE[talenta.state] || TALENTA_STATE.gagal) : null;

  return (
    <div>
      <div style={{ ...S.card, background: "#0a1422", border: "1px solid #15324d" }}>
        <div style={{ ...S.label, color: "#5fa8d3", marginBottom: 4 }}>👥 HRIS & Workforce</div>
        <div style={{ fontSize: 13, color: "#8b949e", marginBottom: 12 }}>
          Recap absensi, keterlambatan, lembur & produktivitas staff per periode. Kasir auto check-in saat login POS.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {[["today", "Hari Ini"], ["7d", "7 Hari"], ["30d", "30 Hari"]].map(([k, l]) => (
            <button key={k} onClick={() => applyPreset(k)} style={S.btn(preset === k)}>{l}</button>
          ))}
          <span style={{ color: "#555", fontSize: 12, marginLeft: 4 }}>Dari</span>
          <input type="date" value={fromDate} max={toDate} onChange={e => { setFromDate(e.target.value); setPreset(""); }} style={S.date} />
          <span style={{ color: "#555", fontSize: 12 }}>s/d</span>
          <input type="date" value={toDate} min={fromDate} max={fmtDate(new Date())} onChange={e => { setToDate(e.target.value); setPreset(""); }} style={S.date} />
          <button onClick={exportCsv}
            style={{ marginLeft: "auto", background: "#34D39922", border: "1px solid #34D39966", borderRadius: 8, padding: "8px 14px", color: "#34D399", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            ⬇️ Export CSV
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        <Kpi c={rateCol(t.avg_attendance)} label="Rata-rata Kehadiran" value={t.avg_attendance + "%"} sub={`${t.staff_count} staff`} />
        <Kpi c={t.total_late_incidents > 0 ? "#F59E0B" : "#34D399"} label="Total Telat" value={String(t.total_late_incidents)} sub="kejadian di periode ini" />
        <Kpi c="#A78BFA" label="Total Lembur" value={fmtH(t.total_overtime_min)} sub="akumulasi periode" />
        <Kpi c="#3B82F6" label="Periode" value={`${recap.staff.reduce((s, x) => s + x.work_days, 0) || 0}`} sub={`${recap.from} → ${recap.to}`} />
      </div>

      <div style={S.card}>
        <div style={S.label}>Recap Absensi per Staff</div>
        {recap.staff.length === 0 ? (
          <div style={{ color: "#555", fontSize: 13, padding: 8 }}>Belum ada data absensi di rentang ini</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {["Staff", "Role", "Hari Kerja", "Hadir", "Telat", "Total Telat", "Lembur", "Produktivitas", "Kehadiran"].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {recap.staff.map(s => (
                <tr key={s.staff_name}>
                  <td style={{ ...S.td, fontWeight: 600, color: "#fff" }}>{s.staff_name}</td>
                  <td style={S.td}>{s.role || "—"}</td>
                  <td style={{ ...S.td, fontFamily: MONO }}>{s.work_days}</td>
                  <td style={{ ...S.td, fontFamily: MONO, color: "#34D399" }}>{s.present_days}</td>
                  <td style={{ ...S.td, fontFamily: MONO, color: s.late_days > 0 ? "#F59E0B" : "#555" }}>{s.late_days}</td>
                  <td style={{ ...S.td, fontFamily: MONO, color: s.total_late > 0 ? "#F59E0B" : "#555" }}>{s.total_late > 0 ? s.total_late + "m" : "—"}</td>
                  <td style={{ ...S.td, fontFamily: MONO, color: s.total_ot > 0 ? "#A78BFA" : "#555" }}>{s.total_ot > 0 ? fmtH(s.total_ot) : "—"}</td>
                  <td style={{ ...S.td, fontFamily: MONO, color: prodCol(s.avg_prod || 0), fontWeight: 700 }}>{s.avg_prod ?? "—"}</td>
                  <td style={{ ...S.td, fontFamily: MONO, color: rateCol(s.attendance_rate), fontWeight: 700 }}>{s.attendance_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={S.card}>
        <div style={S.label}>🔗 Integrasi Talenta (Mekari HRIS)</div>
        {!talenta ? (
          <div style={{ color: "#555", fontSize: 13 }}>Cek status…</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 16 }}>{st.dot}</span>
              <b style={{ color: st.c, fontSize: 14 }}>{st.l}</b>
            </div>
            <div style={{ fontSize: 12, color: "#8b949e", lineHeight: 1.6 }}>{talenta.message}</div>
            {!talenta.configured && (
              <div style={{ fontSize: 12, color: "#666", marginTop: 10, lineHeight: 1.8 }}>
                <b style={{ color: "#8b949e" }}>Cara aktifin:</b><br />
                1. Email <span style={{ color: "#5fa8d3" }}>talenta-integration@mekari.com</span> (email + nama perusahaan + company_id)<br />
                2. Daftar Mekari Developer → Create Application → centang scope <b>employee</b><br />
                3. Isi <span style={{ color: "#5fa8d3" }}>TALENTA_CLIENT_ID</span> &amp; <span style={{ color: "#5fa8d3" }}>TALENTA_CLIENT_SECRET</span> di .env server → restart<br />
                4. Status jadi 🟢 → data karyawan dipakai buat verifikasi <b>diskon karyawan</b>.
              </div>
            )}
          </>
        )}
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
