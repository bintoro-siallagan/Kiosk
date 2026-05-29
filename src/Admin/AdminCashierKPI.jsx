/**
 * AdminCashierKPI.jsx — KPI Kasir: performa transaksi + rating customer.
 * Tab di AdminTools. Endpoint: /api/cashier-kpi
 *
 * Props: apiBase — HOST backend.
 */
import { useState, useEffect, useCallback } from "react";

import { fmtMoney as fR } from "../lib/currency.js";
const DAY = 86400;
const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const tsStart = (s) => Math.floor(new Date(s + "T00:00:00").getTime() / 1000);
const tsEnd = (s) => Math.floor(new Date(s + "T23:59:59").getTime() / 1000);

const S = {
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 14, padding: 18, marginBottom: 14 },
  label: { fontSize: 11, color: "#555", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, fontFamily: "'Geist Mono',monospace" },
  btn: (active, color = "#34D399") => ({
    background: active ? color + "22" : "transparent",
    border: `1px solid ${active ? color + "66" : "#21262d"}`,
    borderRadius: 8, padding: "8px 16px", color: active ? color : "#888",
    fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  }),
  grid4: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 },
};

const scoreColor = (s) => s == null ? "#6b7280" : s >= 80 ? "#34D399" : s >= 60 ? "#FBBF24" : "#F87171";

// ── Auto-badges berdasarkan data nyata ──
// Filosofi: badge bukan dekorasi, badge adalah PENGAKUAN. Tidak boleh
// di-set manual oleh atasan. Lahir murni dari fakta operasional.
function computeBadges(c, all) {
  const badges = [];
  if (!c) return badges;

  // Top sales — kasir #1 berdasarkan total_sales (min 1 transaksi)
  const sorted = [...all].filter(x => x.transactions > 0).sort((a, b) => b.total_sales - a.total_sales);
  if (sorted[0] && sorted[0].cashier === c.cashier && c.total_sales > 0) {
    badges.push({ id: 'top-sales', icon: '🏆', label: 'Top Sales', color: '#F59E0B' });
  }

  // Top upsell — rate tertinggi (min 5 orders untuk valid)
  const upsellPool = all.filter(x => x.upsell_rate != null && x.upsell_total >= 5);
  const topUpsell = upsellPool.sort((a, b) => b.upsell_rate - a.upsell_rate)[0];
  if (topUpsell && topUpsell.cashier === c.cashier && c.upsell_rate >= 50) {
    badges.push({ id: 'top-upsell', icon: '📈', label: 'Top Upsell', color: '#10B981' });
  }

  // Perfect rating — avg ≥ 4.8 dgn min 3 review
  if (c.feedback_count >= 3 && c.avg_rating >= 4.8) {
    badges.push({ id: 'perfect-rating', icon: '⭐', label: 'Perfect Rating', color: '#EC4899' });
  }

  // Zero complaint — gak ada review jelek + min 5 review
  if (c.feedback_count >= 5 && c.bad_count === 0) {
    badges.push({ id: 'zero-complaint', icon: '💎', label: 'Zero Complaint', color: '#22D3EE' });
  }

  // Sales champion — sales tertinggi DAN KPI ≥ 85
  if (sorted[0]?.cashier === c.cashier && c.kpi_score != null && c.kpi_score >= 85) {
    badges.push({ id: 'champion', icon: '👑', label: 'Champion', color: '#A78BFA' });
  }

  return badges;
}

// ── Podium top 3 — cinematic award treatment ──
function Podium({ cashiers, allBadges }) {
  const top3 = cashiers.filter(c => c.kpi_score != null).slice(0, 3);
  if (top3.length === 0) return null;

  const tiers = [
    { rank: 2, color: '#C0C0C0', glow: '#94a3b8', label: '🥈 Silver', height: 110 }, // kiri
    { rank: 1, color: '#FFD700', glow: '#F59E0B', label: '🥇 Gold',   height: 140 }, // tengah
    { rank: 3, color: '#CD7F32', glow: '#92400e', label: '🥉 Bronze', height: 90 },  // kanan
  ];

  return (
    <div style={{
      background: 'linear-gradient(180deg, #0d1117 0%, #161b22 100%)',
      border: '1px solid #21262d',
      borderRadius: 16, padding: '24px 20px', marginBottom: 14, position: 'relative', overflow: 'hidden',
    }}>
      {/* Cinematic spotlight */}
      <div aria-hidden style={{
        position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)',
        width: 400, height: 200, background: 'radial-gradient(ellipse at center, rgba(255,215,0,0.18) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ ...S.label, textAlign: 'center', marginBottom: 18, position: 'relative' }}>
        ✨ Peringkat Tertinggi — Yang Berbuat Sungguh-Sungguh ✨
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 16, position: 'relative' }}>
        {tiers.map(t => {
          const c = top3[t.rank - 1];
          if (!c) return <div key={t.rank} style={{ width: 140 }} />;
          const badges = allBadges[c.cashier] || [];
          return (
            <div key={t.rank} style={{ width: 140, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                marginBottom: 8, fontSize: 13, fontWeight: 700, color: t.color,
                textShadow: `0 0 16px ${t.glow}66`,
              }}>{t.label}</div>

              <div style={{
                width: 60, height: 60, borderRadius: '50%',
                background: `conic-gradient(${t.color} ${(c.kpi_score || 0) * 3.6}deg, rgba(255,255,255,0.06) 0deg)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8,
                boxShadow: `0 0 24px ${t.glow}44`,
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%', background: '#0d1117',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 17, fontWeight: 800, color: t.color, fontFamily: "'Geist Mono',monospace",
                }}>{c.kpi_score}</div>
              </div>

              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', textAlign: 'center', marginBottom: 4, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.cashier}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>{fR(c.total_sales)}</div>

              {badges.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 10 }}>
                  {badges.slice(0, 3).map(b => (
                    <span key={b.id} title={b.label} style={{
                      fontSize: 16, padding: '2px 6px', borderRadius: 6,
                      background: `${b.color}22`, border: `1px solid ${b.color}44`,
                    }}>{b.icon}</span>
                  ))}
                </div>
              )}

              <div style={{
                width: '100%', height: t.height, borderRadius: '8px 8px 0 0',
                background: `linear-gradient(180deg, ${t.color} 0%, ${t.glow} 100%)`,
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 8,
                fontSize: 28, fontWeight: 900, color: '#0d1117', fontFamily: "'Geist Mono',monospace",
                boxShadow: `inset 0 -8px 16px rgba(0,0,0,0.2)`,
              }}>#{t.rank}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stars({ value }) {
  return (
    <span style={{ letterSpacing: 1 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} style={{ color: n <= Math.round(value || 0) ? "#F59E0B" : "#30363d" }}>★</span>
      ))}
    </span>
  );
}

export default function AdminCashierKPI({ apiBase = "" }) {
  const [data, setData] = useState(null);
  const [bySource, setBySource] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(() => fmtDate(new Date()));
  const [toDate, setToDate] = useState(() => fmtDate(new Date()));
  const [preset, setPreset] = useState("today");

  const load = useCallback(async () => {
    setLoading(true);
    const from = tsStart(fromDate), to = tsEnd(toDate);
    try {
      const [kpiR, srcR] = await Promise.all([
        fetch(`${apiBase}/api/cashier-kpi?from=${from}&to=${to}`).then(r => r.json()),
        fetch(`${apiBase}/api/feedback/by-source?from=${from}&to=${to}`).then(r => r.json()).catch(() => []),
      ]);
      setData(kpiR);
      setBySource(Array.isArray(srcR) ? srcR : []);
    } catch { setData(null); }
    setLoading(false);
  }, [apiBase, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const applyPreset = (key) => {
    const today = new Date();
    const fromD = new Date(today);
    if (key === "7d") fromD.setDate(fromD.getDate() - 6);
    else if (key === "30d") fromD.setDate(fromD.getDate() - 29);
    setFromDate(fmtDate(fromD));
    setToDate(fmtDate(today));
    setPreset(key);
  };

  // Download CSV (buat HRD — review performa + reward) sesuai rentang aktif
  const exportCsv = (path) => {
    const a = document.createElement("a");
    a.href = `${apiBase}${path}?from=${tsStart(fromDate)}&to=${tsEnd(toDate)}`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  // Laporan KPI print-friendly (kertas putih) buat rapat review HRD
  const printReport = () => {
    if (!data) return;
    const rangeLabel = fromDate === toDate ? fromDate : `${fromDate} s/d ${toDate}`;
    const rows = (data.cashiers || []).map((c, i) => `<tr>
      <td>${i + 1}</td><td>${c.cashier}</td>
      <td class="c">${c.kpi_score == null ? "-" : c.kpi_score}</td>
      <td class="c">${c.feedback_count > 0 ? c.avg_rating + " ★" : "-"}</td>
      <td class="c">${c.feedback_count}</td>
      <td class="c">${c.good_count}</td>
      <td class="c">${c.bad_count}</td>
      <td class="r">${c.transactions}</td>
      <td class="r">Rp ${Math.round(c.total_sales).toLocaleString("id-ID")}</td></tr>`).join("");
    const html = `<html><head><title>Laporan KPI Kasir</title><style>
      body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#111}
      h1{font-size:18px;margin:0 0 2px} .sub{color:#666;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #bbb;padding:6px 9px} th{background:#eee;text-align:left}
      td.c{text-align:center} td.r{text-align:right}
      .foot{margin-top:14px;font-size:11px;color:#555;line-height:1.5}
    </style></head><body>
      <h1>Laporan KPI Kasir</h1>
      <div class="sub">Periode: ${rangeLabel} &nbsp;·&nbsp; Dicetak: ${new Date().toLocaleString("id-ID")}</div>
      <table><thead><tr>
        <th>#</th><th>Kasir</th><th>KPI</th><th>Rating</th><th>Review</th>
        <th>Bagus</th><th>Jelek</th><th>Transaction</th><th>Total Sales</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <div class="foot">Avg KPI: <b>${data.summary?.avg_kpi ?? "-"}</b> &nbsp;·&nbsp;
        Total review jelek: <b>${data.summary?.total_bad_reviews ?? 0}</b><br/>
        Dokumen penilaian performa kasir — bahan review HRD &amp; keputusan reward.</div>
    </body></html>`;
    const w = window.open("", "", "width=900,height=650");
    if (!w) return;
    w.document.write(html); w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const cashiers = data?.cashiers || [];
  const sum = data?.summary || {};

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        {[["today", "Today"], ["7d", "7 Days"], ["30d", "30 Days"]].map(([k, l]) => (
          <button key={k} onClick={() => applyPreset(k)} style={S.btn(preset === k)}>{l}</button>
        ))}
        <span style={{ color: "#666", fontSize: 12, marginLeft: 4 }}>Dari</span>
        <input type="date" value={fromDate} max={toDate}
          onChange={e => { setFromDate(e.target.value); setPreset(""); }}
          style={{ background: "#0a0e16", border: "1px solid #21262d", borderRadius: 8, padding: "7px 10px", color: "#fff", fontSize: 13, fontFamily: "inherit", colorScheme: "dark" }} />
        <span style={{ color: "#666", fontSize: 12 }}>s/d</span>
        <input type="date" value={toDate} min={fromDate} max={fmtDate(new Date())}
          onChange={e => { setToDate(e.target.value); setPreset(""); }}
          style={{ background: "#0a0e16", border: "1px solid #21262d", borderRadius: 8, padding: "7px 10px", color: "#fff", fontSize: 13, fontFamily: "inherit", colorScheme: "dark" }} />
        <button onClick={() => exportCsv("/api/cashier-kpi/export.csv")}
          style={{ marginLeft: "auto", background: "#34D39922", border: "1px solid #34D39966", borderRadius: 8, padding: "8px 14px", color: "#34D399", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          ⬇️ Export KPI (CSV)
        </button>
        <button onClick={() => exportCsv("/api/feedback/export.csv")}
          style={{ background: "#22D3EE22", border: "1px solid #22D3EE66", borderRadius: 8, padding: "8px 14px", color: "#22D3EE", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          ⬇️ Export Review (CSV)
        </button>
        <button onClick={printReport}
          style={{ background: "#A78BFA22", border: "1px solid #A78BFA66", borderRadius: 8, padding: "8px 14px", color: "#A78BFA", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          🖨️ Print
        </button>
        <button onClick={load} style={S.btn(false)}>🔄 Refresh</button>
      </div>

      {/* Target hari ini (dari opening checklist) */}
      {data?.daily_target && (() => {
        const dt = data.daily_target;
        const pct = dt.achievement_pct || 0;
        const col = !dt.target ? "#6b7280" : pct >= 100 ? "#34D399" : pct >= 70 ? "#FBBF24" : "#F87171";
        return (
          <div style={{ ...S.card, borderLeft: `4px solid ${col}` }}>
            <div style={S.label}>🎯 Target Sales Today — KPI Tim</div>
            {dt.target ? (
              <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 11, color: "#555" }}>Target</div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Geist Mono',monospace" }}>{fR(dt.target)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#555" }}>Actual</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#34D399", fontFamily: "'Geist Mono',monospace" }}>{fR(dt.actual)}</div>
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: "#888" }}>Pencapaian</span>
                    <span style={{ fontWeight: 700, color: col, fontFamily: "'Geist Mono',monospace" }}>{pct}%</span>
                  </div>
                  <div style={{ height: 12, background: "#161b22", borderRadius: 6, overflow: "hidden" }}>
                    <div style={{ width: Math.min(100, pct) + "%", height: "100%", background: col }} />
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: "#6b7280", fontSize: 13 }}>
                Target belum diset hari ini — kasir isi pas opening checklist (buka toko).
              </div>
            )}
          </div>
        );
      })()}

      {/* Summary */}
      <div style={S.grid4}>
        <div style={{ ...S.card, marginBottom: 0, borderLeft: "4px solid #3B82F6" }}>
          <div style={S.label}>Kasir Active</div>
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Geist Mono',monospace" }}>{sum.total_cashiers || 0}</div>
        </div>
        <div style={{ ...S.card, marginBottom: 0, borderLeft: "4px solid #34D399" }}>
          <div style={S.label}>Avg KPI</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: scoreColor(sum.avg_kpi), fontFamily: "'Geist Mono',monospace" }}>
            {sum.avg_kpi != null ? sum.avg_kpi : "—"}
          </div>
        </div>
        <div style={{ ...S.card, marginBottom: 0, borderLeft: "4px solid #FBBF24" }}>
          <div style={S.label}>Sudah Dinilai</div>
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Geist Mono',monospace" }}>{sum.rated_cashiers || 0}</div>
        </div>
        <div style={{ ...S.card, marginBottom: 0, borderLeft: "4px solid #F87171" }}>
          <div style={S.label}>Review Jelek</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: sum.total_bad_reviews > 0 ? "#F87171" : "#fff", fontFamily: "'Geist Mono',monospace" }}>
            {sum.total_bad_reviews || 0}
          </div>
        </div>
      </div>

      {/* Rating per sales channel */}
      <div style={S.card}>
        <div style={S.label}>📡 Rating per Sales Channel</div>
        {bySource.length === 0 ? (
          <div style={{ color: "#555", padding: 8, fontSize: 13 }}>No feedback di periode ini</div>
        ) : (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {bySource.map(s => {
              const col = s.avg_rating >= 4 ? "#34D399" : s.avg_rating >= 3 ? "#FBBF24" : "#F87171";
              const name = { pos: "🧾 POS — Kasir/Manager", kiosk: "🖥️ Kiosk", qr: "📱 QR Order" }[s.source] || s.source;
              return (
                <div key={s.source} style={{ flex: "1 1 190px", background: "#0a0e16", border: `1px solid ${col}33`, borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 13, color: "#aaa", marginBottom: 6 }}>{name}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: col, fontFamily: "'Geist Mono',monospace" }}>
                    {s.avg_rating} <span style={{ fontSize: 13, color: "#f59e0b" }}>★</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                    {s.count} review · {s.bad_count > 0
                      ? <span style={{ color: "#F87171" }}>{s.bad_count} jelek</span>
                      : "0 jelek"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ✨ Podium top 3 — cinematic */}
      {!loading && cashiers.length > 0 && (() => {
        const allBadges = {};
        cashiers.forEach(c => { allBadges[c.cashier] = computeBadges(c, cashiers); });
        return <Podium cashiers={cashiers} allBadges={allBadges} />;
      })()}

      {/* Leaderboard lengkap */}
      <div style={S.card}>
        <div style={S.label}>🏆 Peringkat Kasir — yang baik makin baik, yang kurang baik akan jadi baik</div>
        {loading ? <div style={{ color: "#555", padding: 12 }}>Loading...</div> :
          cashiers.length === 0 ? <div style={{ color: "#555", padding: 12 }}>No data yet kasir di periode ini</div> :
            cashiers.map((c, i) => {
              const badges = computeBadges(c, cashiers);
              return (
              <div key={c.cashier} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: "1px solid #0f1629" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: i < 3 ? "#F59E0B" : "#555", width: 30, fontFamily: "'Geist Mono',monospace" }}>#{i + 1}</div>
                <div style={{
                  width: 58, height: 58, borderRadius: "50%", flexShrink: 0,
                  border: `3px solid ${scoreColor(c.kpi_score)}`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{ fontSize: 19, fontWeight: 800, color: scoreColor(c.kpi_score), fontFamily: "'Geist Mono',monospace", lineHeight: 1 }}>
                    {c.kpi_score != null ? c.kpi_score : "—"}
                  </div>
                  <div style={{ fontSize: 7, color: "#555", letterSpacing: 1.5 }}>KPI</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{c.cashier}</span>
                    {badges.map(b => (
                      <span key={b.id} title={b.label} style={{
                        fontSize: 11, padding: "2px 7px", borderRadius: 6,
                        background: `${b.color}22`, border: `1px solid ${b.color}44`, color: b.color, fontWeight: 600,
                      }}>{b.icon} {b.label}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    <Stars value={c.avg_rating} />
                    <span style={{ color: "#888", marginLeft: 6 }}>
                      {c.feedback_count > 0 ? `${c.avg_rating} · ${c.feedback_count} review` : "belum dinilai"}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right", minWidth: 110 }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2, letterSpacing: 0.6 }}>UPSELL</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: c.upsell_rate == null ? "#475569" : c.upsell_rate >= 50 ? "#10B981" : c.upsell_rate >= 25 ? "#F59E0B" : "#94a3b8", fontFamily: "'Geist Mono',monospace" }}>
                    {c.upsell_rate == null ? "—" : `${c.upsell_rate}%`}
                  </div>
                  <div style={{ fontSize: 10, color: "#666" }}>
                    {c.upsell_total > 0 ? `${c.upsell_orders}/${c.upsell_total}` : "—"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#34D399", fontFamily: "'Geist Mono',monospace" }}>{fR(c.total_sales)}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>{c.transactions} transaksi</div>
                </div>
                <div style={{ textAlign: "right", minWidth: 78 }}>
                  {c.bad_count > 0 && <div style={{ fontSize: 11, color: "#F87171" }}>👎 {c.bad_count} jelek</div>}
                  {c.good_count > 0 && <div style={{ fontSize: 11, color: "#34D399" }}>👍 {c.good_count} bagus</div>}
                  {c.voided > 0 && <div style={{ fontSize: 11, color: "#FBBF24" }}>✖ {c.voided} void</div>}
                </div>
              </div>
              );
            })
        }
      </div>
    </div>
  );
}
