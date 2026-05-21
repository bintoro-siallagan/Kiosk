// src/CommandOperation.jsx
// Command Center — Operation Health section (pembeda karyaOS).
// Opening/closing checklist, SOP compliance, outlet issues, cashier focus.

import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
const MONO = "var(--m)";

const MOOD = { 1: "😟 Lelah", 2: "😐 Biasa", 3: "🙂 Oke", 4: "😄 Senang", 5: "🤩 Semangat" };
const fmtTime = (ts) => ts ? new Date(ts * 1000).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—";

export default function CommandOperation() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    fetch(`${API}/api/section/operation`).then(r => r.json()).then(j => j && !j.error ? setD(j) : setErr((j && j.error) || "data tidak tersedia")).catch(e => setErr(String(e)));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  if (err) return <div style={S.msg}>Gagal memuat Operation Health: {err}</div>;
  if (!d) return <div style={S.msg}>Memuat Operation Health…</div>;

  const sopCol = d.sop_compliance >= 100 ? "#10b981" : d.sop_compliance >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div style={S.wrap}>
      {/* Opening / Closing status */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <StatusCard title="🌅 Opening Toko" done={d.opening.done}
          lines={d.opening.done
            ? [`Oleh ${d.opening.by || "—"} · ${fmtTime(d.opening.at)}`,
               d.opening.target ? `Target: Rp ${Number(d.opening.target).toLocaleString("id-ID")}` : "Target belum diset",
               d.opening.mood ? `Mood kasir: ${MOOD[d.opening.mood] || "—"}` : ""]
            : ["Checklist buka toko belum dikerjakan", "Kasir belum bisa mulai transaksi"]} />
        <StatusCard title="🌙 Closing Toko" done={d.closing.done}
          lines={d.closing.done
            ? [`Oleh ${d.closing.by || "—"} · ${fmtTime(d.closing.at)}`, "Shift sudah ditutup"]
            : ["Checklist tutup toko belum dikerjakan", "Normal kalau toko masih buka"]} />
      </div>

      {/* KPI row */}
      <div style={S.kpiRow}>
        <Kpi label="SOP Compliance" value={d.sop_compliance + "%"} accent={sopCol}
          sub="opening + closing checklist" />
        <Kpi label="Outlet Issues" value={String(d.outlet_issues.open)}
          accent={d.outlet_issues.critical > 0 ? "#ef4444" : d.outlet_issues.open > 0 ? "#f59e0b" : "#10b981"}
          sub={d.outlet_issues.critical > 0 ? `${d.outlet_issues.critical} critical 🔴` : "anomali open"} />
        <Kpi label="Item Checklist" value={`${d.checklist_items.opening}+${d.checklist_items.closing}`} accent="#3b82f6"
          sub={`${d.checklist_items.opening} buka · ${d.checklist_items.closing} tutup`} />
        <Kpi label="Kasir Tidak Fokus" value={String(d.cashier_focus.flagged)}
          accent={d.cashier_focus.flagged > 0 ? "#f59e0b" : "#10b981"}
          sub={d.cashier_focus.flagged > 0 ? "kebanyakan hapus item" : "semua fokus"} />
      </div>

      {/* Recent checklist activity */}
      <div style={S.card}>
        <div style={S.kicker}>📋 AKTIVITAS CHECKLIST TERBARU</div>
        {d.recent.length === 0 ? (
          <div style={{ color: "#555", fontSize: 13, padding: 8 }}>Belum ada checklist disubmit</div>
        ) : d.recent.map((r, i) => (
          <div key={i} style={S.row}>
            <span style={{ fontSize: 14 }}>{r.type === "opening" ? "🌅" : "🌙"}</span>
            <span style={{ flex: 1, fontSize: 13, color: "#ddd" }}>
              {r.type === "opening" ? "Opening" : "Closing"} checklist — {r.staff_name || "—"}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: "#777" }}>
              {new Date((r.created_at || 0) * 1000).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
      </div>

      {/* Device monitoring — honest placeholder */}
      <div style={{ ...S.card, borderStyle: "dashed", opacity: 0.7 }}>
        <div style={S.kicker}>🖨️ DEVICE & PRINTER MONITORING</div>
        <div style={{ fontSize: 13, color: "#777", lineHeight: 1.6 }}>
          Deteksi printer offline & POS device offline — <b style={{ color: "#f59e0b" }}>modul belum aktif</b>.
          Butuh agent device di tiap outlet (heartbeat ping). Roadmap setelah presentasi.
        </div>
      </div>
    </div>
  );
}

function StatusCard({ title, done, lines }) {
  const col = done ? "#10b981" : "#ef4444";
  return (
    <div style={{ ...S.card, borderColor: col + "55" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 22 }}>{done ? "🟢" : "🔴"}</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#eee" }}>{title}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: col, fontFamily: MONO }}>{done ? "COMPLETED" : "BELUM"}</div>
        </div>
      </div>
      {lines.filter(Boolean).map((l, i) => (
        <div key={i} style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{l}</div>
      ))}
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
  row: { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #161b22" },
};
