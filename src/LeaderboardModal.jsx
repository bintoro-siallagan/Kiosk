// src/LeaderboardModal.jsx
// Leaderboard Sultan — VIEW-ONLY (gak nyatet transaksi, cuma lihat).
// Dipanggil dari tombol di halaman QR order tracking — biar customer
// bisa lihat leaderboard kapan aja di HP-nya, gak cuma sekali abis review.

import { useState, useEffect } from "react";
import API_HOST from "./apiBase.js";

const API = API_HOST;
import { fmtMoney as fmtRp } from "./lib/currency.js";
import { LoadingState } from "./components/uiKit.jsx";
const MEDAL = ["🥇", "🥈", "🥉"];

export default function LeaderboardModal({ onClose }) {
  const [d, setD] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/leaderboard`)
      .then(r => r.json())
      .then(setD)
      .catch(() => setD({ window: "", top: [], stats: {} }));
  }, []);

  return (
    <div style={S.root} onClick={onClose}>
      <div style={S.box} onClick={e => e.stopPropagation()}>
        <div style={S.brand}>🍦 KaryaOS</div>
        <div style={S.title}>🏆 LEADERBOARD SULTAN</div>
        <div style={S.sub}>Jam ini {d?.window || ""} · reset tiap jam</div>

        {!d ? (
          <LoadingState label="Memuat…" />
        ) : (
          <>
            <div style={S.statsRow}>
              <div style={S.stat}>
                <div style={S.statLbl}>🏆 Transaksi Terbesar</div>
                <div style={{ ...S.statVal, color: "#fbbf24" }}>{fmtRp(d.stats?.top_transaction)}</div>
              </div>
              <div style={S.stat}>
                <div style={S.statLbl}>📊 Rata-rata Bill</div>
                <div style={{ ...S.statVal, color: "#22d3ee" }}>{fmtRp(d.stats?.avg_bill)}</div>
              </div>
            </div>
            <div style={S.list}>
              {(d.top || []).length === 0 ? (
                <div style={{ color: "#6b7280", textAlign: "center", padding: 18, fontSize: 13 }}>
                  No transactions yet jam ini — jadi Sultan pertama! 🚀
                </div>
              ) : d.top.map(r => (
                <div key={r.rank} style={S.row}>
                  <span style={{ width: 28, textAlign: "center", fontSize: 14, flexShrink: 0 }}>{MEDAL[r.rank - 1] || "#" + r.rank}</span>
                  <span style={{ flex: 1, fontSize: 13, color: "#e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.emoji} {r.name}</span>
                  <span style={{ fontSize: 10, color: r.color || "#888", fontWeight: 700, flexShrink: 0 }}>{r.title}</span>
                  <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#fff", width: 88, textAlign: "right", flexShrink: 0 }}>{fmtRp(r.amount)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={S.hint}>📸 Belanja terbanyak jam ini = Sultan! Screenshot & pamerin ke story 🔥</div>
        <button onClick={onClose} style={S.cta}>Close</button>
      </div>
    </div>
  );
}

const S = {
  root: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, fontFamily: "system-ui,-apple-system,sans-serif", padding: 20, overflowY: "auto" },
  box: { background: "#161616", border: "1px solid #2a2a2a", borderRadius: 20, padding: "24px 26px", width: "min(420px,96vw)", textAlign: "center" },
  brand: { fontSize: 14, fontWeight: 900, color: "#f97316", letterSpacing: 2 },
  title: { fontSize: 22, fontWeight: 900, color: "#fbbf24", marginTop: 6 },
  sub: { fontSize: 12, color: "#9ca3af", marginTop: 2 },
  statsRow: { display: "flex", gap: 10, marginTop: 16 },
  stat: { flex: 1, background: "#0f0f0f", border: "1px solid #2a2a2a", borderRadius: 12, padding: "10px 8px" },
  statLbl: { fontSize: 10, color: "#9ca3af" },
  statVal: { fontSize: 16, fontWeight: 800, fontFamily: "monospace", marginTop: 3 },
  list: { marginTop: 14, background: "#0f0f0f", border: "1px solid #2a2a2a", borderRadius: 12, padding: "8px 14px", textAlign: "left" },
  row: { display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #1c1c1c" },
  hint: { marginTop: 14, fontSize: 11, color: "#9ca3af", lineHeight: 1.5 },
  cta: { width: "100%", marginTop: 14, padding: "14px", background: "#f97316", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
};
