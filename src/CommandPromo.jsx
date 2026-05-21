// src/CommandPromo.jsx
// Command Center — Promotion Effectiveness section.
// Promo mana yang efektif vs idle (gak kepake) + biaya diskon.

import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
const MONO = "var(--m)";

const STATUS = {
  effective: { col: "#10b981", label: "Efektif" },
  low:       { col: "#f59e0b", label: "Rendah" },
  idle:      { col: "#ef4444", label: "Idle" },
};
const fmtK = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "jt"
  : n >= 1e3 ? Math.round(n / 1e3) + "rb" : String(n || 0));

export default function CommandPromo() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    fetch(`${API}/api/promo-insight`).then(r => r.json()).then(setD).catch(e => setErr(String(e)));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  if (err) return <div style={S.msg}>Gagal memuat Promotion Effectiveness: {err}</div>;
  if (!d) return <div style={S.msg}>Memuat Promotion Effectiveness…</div>;
  const s = d.summary;

  return (
    <div style={S.wrap}>
      <div style={S.kpiRow}>
        <Kpi label="Promo Aktif" value={String(s.active)} accent="#10b981" sub={`dari ${s.total} total promo`} />
        <Kpi label="Total Redemption" value={fmtK(s.total_redemptions)} accent="#3b82f6" sub="kali promo dipakai" />
        <Kpi label="Est. Diskon Diberikan" value={"Rp " + fmtK(s.est_discount)} accent="#a78bfa" sub="biaya promo (estimasi)" />
        <Kpi label="Promo Idle" value={String(s.idle)} accent={s.idle > 0 ? "#ef4444" : "#10b981"}
          sub={s.idle > 0 ? "gak kepake — perlu dievaluasi" : "semua promo kepake"} />
      </div>

      {s.top && (
        <div style={{ ...S.card, borderColor: "#10b98155", display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 30 }}>🏆</span>
          <div>
            <div style={{ fontSize: 11, color: "#888", fontFamily: MONO, letterSpacing: 1 }}>PROMO PALING EFEKTIF</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#10b981" }}>{s.top.code} — {s.top.used_count}× dipakai</div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>{s.top.desc}</div>
          </div>
        </div>
      )}

      <div style={S.card}>
        <div style={S.kicker}>🎯 EFEKTIVITAS SEMUA PROMO</div>
        {d.promos.map(p => {
          const st = STATUS[p.status] || STATUS.idle;
          const barW = p.used_count === 0 ? 0 : Math.max(8, p.usage_rate);
          return (
            <div key={p.code} style={S.row}>
              <span style={{ width: 9, height: 9, borderRadius: 9, background: st.col, flexShrink: 0 }} />
              <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: "#e4e4e7", width: 116, flexShrink: 0 }}>{p.code}</span>
              <span style={{ fontSize: 10, fontFamily: MONO, color: "#8b8b95", border: "1px solid #1c1c25", borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>
                {p.type === "percent" ? p.value + "%" : p.type === "fixed" ? "Rp" + fmtK(p.value) : "BOGO"}
              </span>
              <span style={{ flex: 1, fontSize: 12, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.desc}</span>
              <div style={{ width: 84, flexShrink: 0, height: 6, background: "#15151e", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: barW + "%", background: st.col }} />
              </div>
              <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: st.col, width: 46, textAlign: "right", flexShrink: 0 }}>{p.used_count}×</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: "#8b8b95", width: 64, textAlign: "right", flexShrink: 0 }}>{p.est_discount > 0 ? "−" + fmtK(p.est_discount) : "—"}</span>
              <span style={{ fontSize: 10, fontFamily: MONO, color: st.col, width: 52, textAlign: "right", flexShrink: 0, textTransform: "uppercase" }}>{st.label}</span>
            </div>
          );
        })}
        <div style={{ fontSize: 11, color: "#3a3a44", marginTop: 8, fontFamily: MONO }}>
          🟢 Efektif (≥10×) · 🟡 Rendah (1-9×) · 🔴 Idle (0× — pertimbangkan stop/ganti)
        </div>
      </div>
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
  card: { background: "#0e0e13", border: "1px solid #1c1c25", borderRadius: 14, padding: 18 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#888", fontFamily: MONO, marginBottom: 12 },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  kpi: { background: "#0e0e13", border: "1px solid #1c1c25", borderRadius: 12, padding: "12px 14px" },
  row: { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #15151e" },
};
