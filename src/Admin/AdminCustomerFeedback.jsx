// src/Admin/AdminCustomerFeedback.jsx
//
// Customer feedback browser — semua rating + komentar dari QR struk, kiosk,
// dan POS satisfaction popup. Owner butuh tempat satu pintu buat dengar
// suara customer (cermin jujur karyaOS).
//
// Tampilan:
//   - Hero stats: avg rating + jumlah review + distribusi bintang
//   - Filter: periode (today/week/month/all) + rating filter (semua/bad/good)
//   - List komentar: bintang, nama kasir, channel, waktu, isi komentar
//   - Sidebar: breakdown per channel (POS/Kiosk/QR) + per kasir top/bottom
//   - Export CSV
//
// Filosofi: bad rating bukan dihukum — ditampilkan dengan ❤️ karena itulah
// yg paling penting untuk perbaikan. Owner bisa langsung tap "Hubungi kasir"
// atau "Catat tindak lanjut" (future).

import { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletScope } from "./OutletScopeContext";

const SOURCE_META = {
  pos:    { icon: "💁", label: "POS",         color: "#f97316" },
  kiosk:  { icon: "📱", label: "Kiosk",       color: "#a855f7" },
  "qr-struk": { icon: "📄", label: "QR Struk", color: "#10b981" },
  qr:     { icon: "📄", label: "QR Order",    color: "#22d3ee" },
  customer_portal: { icon: "🌐", label: "Web", color: "#22d3ee" },
};

const PERIODS = [
  { k: "today", label: "Hari ini",   secs: 86400 },
  { k: "week",  label: "7 hari",     secs: 86400 * 7 },
  { k: "month", label: "30 hari",    secs: 86400 * 30 },
  { k: "all",   label: "Semua",      secs: 0 },
];

function ratingColor(r) {
  if (r >= 5) return "#10b981";
  if (r >= 4) return "#22d3ee";
  if (r >= 3) return "#fbbf24";
  if (r >= 2) return "#fb923c";
  return "#ef4444";
}

function ratingMood(r) {
  if (r >= 5) return "Sempurna";
  if (r >= 4) return "Bagus";
  if (r >= 3) return "Cukup";
  if (r >= 2) return "Kurang";
  return "Buruk";
}

function timeAgo(sec) {
  const diff = Math.floor(Date.now() / 1000) - sec;
  if (diff < 60) return "baru saja";
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} hari lalu`;
  return new Date(sec * 1000).toLocaleDateString("id-ID");
}

export default function AdminCustomerFeedback({ apiBase = "" }) {
  const { outletCodes, selectedOutlets } = useOutletScope();
  const [period, setPeriod] = useState("week");
  const [ratingFilter, setRatingFilter] = useState("all"); // all | bad (1-2) | mid (3) | good (4-5)
  const [feedback, setFeedback] = useState([]);
  const [stats, setStats] = useState(null);
  const [bySource, setBySource] = useState([]);
  const [byCashier, setByCashier] = useState([]);
  const [byOutlet, setByOutlet] = useState([]);
  const [loading, setLoading] = useState(true);

  const fromSec = useMemo(() => {
    const p = PERIODS.find(x => x.k === period);
    return p?.secs ? Math.floor(Date.now() / 1000) - p.secs : 0;
  }, [period]);

  // Outlet query string — single: ?outlet=X, multi: ?outlets=X,Y
  const outletQs = useMemo(() => {
    if (!outletCodes?.length) return "";
    if (outletCodes.length === 1) return `&outlet=${encodeURIComponent(outletCodes[0])}`;
    return `&outlets=${outletCodes.map(encodeURIComponent).join(',')}`;
  }, [outletCodes]);

  const load = useCallback(() => {
    setLoading(true);
    const headers = (() => {
      const t = (() => { try { return localStorage.getItem("adminToken") || ""; } catch { return ""; } })();
      return t ? { Authorization: `Bearer ${t}` } : {};
    })();
    Promise.all([
      fetch(`${apiBase}/api/feedback?limit=200${outletQs}`, { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${apiBase}/api/feedback/stats?from=${fromSec}${outletQs}`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${apiBase}/api/feedback/by-source?from=${fromSec}${outletQs}`, { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${apiBase}/api/feedback/by-cashier?from=${fromSec}${outletQs}`, { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${apiBase}/api/feedback/by-outlet?from=${fromSec}`, { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([list, st, src, csh, out]) => {
      setFeedback(Array.isArray(list) ? list : []);
      setStats(st);
      setBySource(Array.isArray(src) ? src : []);
      setByCashier(Array.isArray(csh) ? csh : []);
      setByOutlet(Array.isArray(out) ? out : []);
      setLoading(false);
    });
  }, [apiBase, fromSec, outletQs]);

  useEffect(() => { load(); }, [load]);

  const filteredFeedback = useMemo(() => {
    let list = feedback.filter(f => f.created_at >= fromSec);
    if (ratingFilter === "bad")  list = list.filter(f => f.rating <= 2);
    if (ratingFilter === "mid")  list = list.filter(f => f.rating === 3);
    if (ratingFilter === "good") list = list.filter(f => f.rating >= 4);
    return list;
  }, [feedback, fromSec, ratingFilter]);

  const exportCsv = () => {
    const url = `${apiBase}/api/feedback/export.csv?from=${fromSec}&to=${Math.floor(Date.now() / 1000)}${outletQs}`;
    window.open(url, "_blank");
  };

  return (
    <div>
      <div style={S.intro}>
        💛 <b style={{ color: "#fbbf24" }}>SUARA CUSTOMER</b> — rating + komentar dari QR struk, kiosk, dan POS.
        Setiap suara penting, terutama yang kurang puas — di situ ada peluang tumbuh.
        {outletCodes?.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 12, color: "#fbbf24" }}>
            📍 Filter outlet aktif:&nbsp;
            <b>{outletCodes.length === 1
              ? (selectedOutlets[0]?.area || selectedOutlets[0]?.name || outletCodes[0])
              : `${outletCodes.length} outlet`}</b> · ganti scope di pill 📍 di topbar
          </div>
        )}
      </div>

      {/* Period + Rating filter */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div style={S.filterGroup}>
          {PERIODS.map(p => (
            <button key={p.k} onClick={() => setPeriod(p.k)} style={S.chip(period === p.k, "#a855f7")}>
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={S.filterGroup}>
          <button onClick={() => setRatingFilter("all")}  style={S.chip(ratingFilter === "all",  "#94a3b8")}>Semua</button>
          <button onClick={() => setRatingFilter("good")} style={S.chip(ratingFilter === "good", "#10b981")}>⭐ Bagus (4-5)</button>
          <button onClick={() => setRatingFilter("mid")}  style={S.chip(ratingFilter === "mid",  "#fbbf24")}>⭐ Cukup (3)</button>
          <button onClick={() => setRatingFilter("bad")}  style={S.chip(ratingFilter === "bad",  "#ef4444")}>⭐ Kurang (1-2)</button>
        </div>
        <button onClick={exportCsv} style={S.exportBtn}>📥 Export CSV</button>
      </div>

      {/* Hero stats */}
      <StatsHero stats={stats} loading={loading} period={period} />

      {/* Main grid: comments list + side breakdowns */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)", gap: 14, marginTop: 14 }}>
        <CommentsList feedback={filteredFeedback} loading={loading} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <ByOutletCard data={byOutlet} activeCode={outletCodes?.[0]} />
          <BySourceCard data={bySource} />
          <ByCashierCard data={byCashier} />
        </div>
      </div>
    </div>
  );
}

function StatsHero({ stats, loading, period }) {
  const periodLabel = PERIODS.find(p => p.k === period)?.label || "";
  const count = stats?.count || 0;
  const avg = stats?.avg_rating || 0;
  const distribution = stats?.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const maxBar = Math.max(...Object.values(distribution), 1);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) 2fr", gap: 14 }}>
      {/* Avg rating big */}
      <div style={{ ...S.card, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "28px 18px" }}>
        <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 6 }}>
          RATING RATA-RATA · {periodLabel.toUpperCase()}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontSize: 72, fontWeight: 900, color: ratingColor(avg), lineHeight: 1, fontFamily: "'Geist Mono',monospace" }}>
            {loading ? "—" : avg.toFixed(1)}
          </div>
          <div style={{ fontSize: 28, color: "#5b6470", fontWeight: 700 }}>/ 5</div>
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
          {[1, 2, 3, 4, 5].map(i => (
            <span key={i} style={{ fontSize: 22, opacity: avg >= i ? 1 : 0.18, color: ratingColor(avg) }}>
              {avg >= i ? "★" : avg >= i - 0.5 ? "★" : "★"}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 13, color: "#9da7b3", marginTop: 10 }}>
          {loading ? "Memuat..." : count > 0 ? `${count} ulasan · ${ratingMood(avg)}` : "Belum ada ulasan periode ini"}
        </div>
      </div>

      {/* Distribution bars */}
      <div style={S.card}>
        <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 14 }}>
          DISTRIBUSI BINTANG
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[5, 4, 3, 2, 1].map(star => {
            const c = distribution[star] || 0;
            const pct = count > 0 ? (c / maxBar) * 100 : 0;
            const color = ratingColor(star);
            return (
              <div key={star} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <div style={{ width: 40, display: "flex", alignItems: "center", gap: 4, color: "#cbd5e1" }}>
                  <span style={{ color, fontWeight: 700 }}>{star}</span>
                  <span style={{ color, fontSize: 14 }}>★</span>
                </div>
                <div style={{ flex: 1, height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 999, transition: "width 0.4s ease" }} />
                </div>
                <div style={{ width: 60, textAlign: "right", color: "#94a3b8", fontFamily: "'Geist Mono',monospace", fontSize: 12 }}>
                  {c} ({count > 0 ? Math.round((c / count) * 100) : 0}%)
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CommentsList({ feedback, loading }) {
  if (loading) {
    return <div style={{ ...S.card, textAlign: "center", padding: 60, color: "#94a3b8" }}>⏳ Memuat ulasan…</div>;
  }
  if (!feedback.length) {
    return (
      <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
        <div style={{ fontSize: 56, marginBottom: 14 }}>💛</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#cbd5e1", marginBottom: 6 }}>Belum ada ulasan</div>
        <div style={{ fontSize: 13, color: "#94a3b8" }}>Customer akan kasih rating + komentar lewat QR di struk.</div>
      </div>
    );
  }

  return (
    <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #161b22", fontSize: 11, color: "#94a3b8", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>
        💬 ULASAN — {feedback.length} item
      </div>
      <div style={{ maxHeight: "65vh", overflowY: "auto" }}>
        {feedback.map((f, i) => {
          const src = SOURCE_META[f.source] || { icon: "📝", label: f.source || "—", color: "#94a3b8" };
          const color = ratingColor(f.rating);
          return (
            <div key={f.id || i} style={{ padding: "16px 18px", borderTop: i > 0 ? "1px solid #161b22" : "none", display: "flex", gap: 14, alignItems: "flex-start" }}>
              {/* Rating badge */}
              <div style={{ flexShrink: 0, width: 56, textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1, fontFamily: "'Geist Mono',monospace" }}>
                  {f.rating}
                </div>
                <div style={{ color, fontSize: 12, lineHeight: 1, marginTop: 2 }}>{"★".repeat(f.rating)}</div>
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: `${src.color}1a`, color: src.color, border: `1px solid ${src.color}33`, fontWeight: 700 }}>
                    {src.icon} {src.label}
                  </span>
                  {f.cashier && (
                    <span style={{ fontSize: 11, color: "#9da7b3" }}>
                      Kasir: <b style={{ color: "#cbd5e1" }}>{f.cashier}</b>
                    </span>
                  )}
                  {f.outlet_code && (
                    <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(251,191,36,0.10)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)", fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>
                      📍 {f.outlet_code}
                    </span>
                  )}
                  {f.order_ref && (
                    <span style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>
                      #{f.order_ref}
                    </span>
                  )}
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 10, color: "#5b6470", fontStyle: "italic" }}>
                    {timeAgo(f.created_at)}
                  </span>
                </div>
                {f.comment ? (
                  <div style={{ fontSize: 13, color: "#e6edf3", lineHeight: 1.6, padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, borderLeft: `3px solid ${color}` }}>
                    "{f.comment}"
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#5b6470", fontStyle: "italic" }}>
                    Tanpa komentar tertulis
                  </div>
                )}
                {f.rating <= 2 && (
                  <div style={{ fontSize: 11, color: "#fb923c", marginTop: 6, fontStyle: "italic" }}>
                    💡 Rating rendah — pertimbangkan follow-up dengan kasir / customer.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ByOutletCard({ data, activeCode }) {
  const sorted = data.slice(0, 8);
  return (
    <div style={S.card}>
      <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 12 }}>
        📍 PER OUTLET
      </div>
      {!sorted.length ? (
        <div style={{ fontSize: 12, color: "#5b6470", fontStyle: "italic" }}>
          Belum ada data per-outlet. Pastikan kasir punya outlet_code (Admin → User Management).
        </div>
      ) : sorted.map((d, i) => {
        const isActive = activeCode === d.outlet_code;
        return (
          <div key={i} style={{ padding: "10px 0", borderTop: i > 0 ? "1px solid #161b22" : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? "#fbbf24" : "#e6edf3", fontFamily: "'Geist Mono',monospace" }}>
                {isActive ? "→ " : ""}{d.outlet_code}
              </span>
              <span style={{ fontSize: 14, fontWeight: 800, color: ratingColor(d.avg_rating), fontFamily: "'Geist Mono',monospace" }}>
                {d.avg_rating.toFixed(1)} ★
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", gap: 12 }}>
              <span>{d.count} ulasan</span>
              {d.good_count > 0 && <span style={{ color: "#10b981" }}>👍 {d.good_count}</span>}
              {d.bad_count > 0 && <span style={{ color: "#ef4444" }}>👎 {d.bad_count}</span>}
            </div>
          </div>
        );
      })}
      {data.length > 8 && (
        <div style={{ fontSize: 10, color: "#5b6470", textAlign: "center", marginTop: 10, fontStyle: "italic" }}>
          + {data.length - 8} outlet lainnya
        </div>
      )}
    </div>
  );
}

function BySourceCard({ data }) {
  return (
    <div style={S.card}>
      <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 12 }}>
        📡 PER CHANNEL
      </div>
      {!data.length ? (
        <div style={{ fontSize: 12, color: "#5b6470", fontStyle: "italic" }}>Belum ada data.</div>
      ) : data.map((d, i) => {
        const src = SOURCE_META[d.source] || { icon: "📝", label: d.source || "—", color: "#94a3b8" };
        return (
          <div key={i} style={{ padding: "10px 0", borderTop: i > 0 ? "1px solid #161b22" : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>
                {src.icon} {src.label}
              </span>
              <span style={{ fontSize: 14, fontWeight: 800, color: ratingColor(d.avg_rating), fontFamily: "'Geist Mono',monospace" }}>
                {d.avg_rating.toFixed(1)} ★
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", gap: 12 }}>
              <span>{d.count} ulasan</span>
              {d.good_count > 0 && <span style={{ color: "#10b981" }}>👍 {d.good_count}</span>}
              {d.bad_count > 0 && <span style={{ color: "#ef4444" }}>👎 {d.bad_count}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ByCashierCard({ data }) {
  const top = data.slice(0, 5); // Backend already sorted by avg ASC — lowest first
  return (
    <div style={S.card}>
      <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 12 }}>
        👥 PER KASIR
      </div>
      {!top.length ? (
        <div style={{ fontSize: 12, color: "#5b6470", fontStyle: "italic" }}>Belum ada data per-kasir.</div>
      ) : top.map((d, i) => (
        <div key={i} style={{ padding: "10px 0", borderTop: i > 0 ? "1px solid #161b22" : "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{d.cashier}</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: ratingColor(d.avg_rating), fontFamily: "'Geist Mono',monospace" }}>
              {d.avg_rating.toFixed(1)} ★
            </span>
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", gap: 12 }}>
            <span>{d.count} ulasan</span>
            {d.good_count > 0 && <span style={{ color: "#10b981" }}>👍 {d.good_count}</span>}
            {d.bad_count > 0 && <span style={{ color: "#ef4444" }}>👎 {d.bad_count}</span>}
          </div>
        </div>
      ))}
      {data.length > 5 && (
        <div style={{ fontSize: 10, color: "#5b6470", textAlign: "center", marginTop: 10, fontStyle: "italic" }}>
          + {data.length - 5} kasir lainnya
        </div>
      )}
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  filterGroup: { display: "flex", gap: 6, flexWrap: "wrap" },
  chip: (active, color) => ({
    background: active ? `${color}22` : "rgba(255,255,255,0.03)",
    border: `1px solid ${active ? color + '66' : '#21262d'}`,
    borderRadius: 999, padding: "6px 12px",
    color: active ? color : "#94a3b8",
    fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  }),
  exportBtn: {
    background: "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(251,191,36,0.18))",
    border: "1px solid rgba(168,85,247,0.45)", borderRadius: 8,
    padding: "7px 14px", color: "#fff", fontSize: 12, fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit",
  },
};
