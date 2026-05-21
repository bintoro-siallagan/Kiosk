// src/CommandCustomer.jsx
// Command Center — Customer Experience section (HERO feature karyaOS).
// Satisfaction, komplain, repeat customer, loyalty, feedback trend, leaderboard.

import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
const MONO = "var(--m)";

const SRC = {
  pos:   { label: "POS — Kasir", icon: "🧾" },
  kiosk: { label: "Kiosk",       icon: "🖥️" },
  qr:    { label: "QR Order",    icon: "📱" },
};
const starCol = (n) => (n >= 4.5 ? "#10b981" : n >= 3.5 ? "#f59e0b" : n > 0 ? "#ef4444" : "#555");

export default function CommandCustomer() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    fetch(`${API}/api/section/customer`).then(r => r.json()).then(setD).catch(e => setErr(String(e)));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  if (err) return <div style={S.msg}>Gagal memuat Customer Experience: {err}</div>;
  if (!d) return <div style={S.msg}>Memuat Customer Experience…</div>;

  return (
    <div style={S.wrap}>
      <div style={S.kpiRow}>
        <Kpi label="Satisfaction Score" value={(d.satisfaction.avg || 0) + " ★"} accent={starCol(d.satisfaction.avg)}
          sub={`${d.satisfaction.total} review · ${d.satisfaction.good} positif`} />
        <Kpi label="Komplain" value={String(d.complaints)} accent={d.complaints > 0 ? "#ef4444" : "#10b981"}
          sub={d.complaints > 0 ? "rating ≤ 2 ★" : "aman"} />
        <Kpi label="Repeat Customer" value={d.repeat_customer.pct + "%"} accent="#a78bfa"
          sub={`${d.repeat_customer.count} dari ${d.repeat_customer.total} member`} />
        <Kpi label="Loyalty Member" value={String(d.loyalty.members)} accent="#3b82f6"
          sub={`${d.loyalty.redemptions} redeem · ${Math.round((d.loyalty.points_outstanding || 0) / 1000)}rb poin aktif`} />
      </div>

      <div style={S.card}>
        <div style={S.kicker}>📡 RATING PER SALES CHANNEL</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {["pos", "kiosk", "qr"].map(k => {
            const s = d.by_source.find(x => x.source === k) || { count: 0, avg: 0, bad: 0 };
            const m = SRC[k];
            return (
              <div key={k} style={S.chCard}>
                <div style={{ fontSize: 13, color: "#aaa", marginBottom: 4 }}>{m.icon} {m.label}</div>
                <div style={{ fontSize: 30, fontWeight: 800, color: starCol(s.avg), fontFamily: MONO }}>
                  {s.avg || "—"} <span style={{ fontSize: 15 }}>★</span>
                </div>
                <div style={{ fontSize: 11, color: "#777" }}>{s.count} review{s.bad > 0 ? ` · ${s.bad} jelek` : ""}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={S.card}>
          <div style={S.kicker}>📈 FEEDBACK TREND — 7 HARI</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, marginTop: 8 }}>
            {d.feedback_trend.map((t, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#888", fontFamily: MONO }}>{t.avg || ""}</div>
                <div style={{ height: Math.max(2, (t.avg / 5) * 88), background: starCol(t.avg), borderRadius: 4, marginTop: 3 }} />
                <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>{t.day}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={S.card}>
          <div style={S.kicker}>🏆 LEADERBOARD — RATING KASIR</div>
          {d.leaderboard.length === 0 ? (
            <div style={{ color: "#555", fontSize: 13, padding: 8 }}>Belum ada data</div>
          ) : d.leaderboard.map((c, i) => (
            <div key={c.cashier} style={S.lbRow}>
              <span style={{ fontFamily: MONO, color: "#666", width: 24 }}>#{i + 1}</span>
              <span style={{ flex: 1, fontSize: 14, color: "#ddd" }}>{c.cashier}</span>
              {c.bad > 0 && <span style={{ fontSize: 11, color: "#ef4444" }}>👎 {c.bad}</span>}
              <b style={{ fontFamily: MONO, color: starCol(c.avg), width: 56, textAlign: "right" }}>{c.avg} ★</b>
            </div>
          ))}
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
  chCard: { background: "#08080b", border: "1px solid #1c1c25", borderRadius: 10, padding: "12px 14px" },
  lbRow: { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #15151e" },
};
