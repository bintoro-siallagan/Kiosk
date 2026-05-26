// karyaOS — Cinema CRM (Customer Intelligence)
// Aggregate per customer dari tiket + bundle: total spend, favorite genre,
// preferred studio, watch frequency, first/last visit. Drill-down ke detail.
import { useState, useEffect, useCallback } from "react";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtDate = (s) => s ? new Date(s * 1000).toLocaleDateString("id-ID") : "—";
const daysSince = (s) => s ? Math.floor((Date.now() / 1000 - s) / 86400) : null;

export default function CinemaCRM({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/cinema";
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState(null);  // detail panel
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch(`${base}/crm/customers`); const d = await r.json(); setRows(d.customers || []); }
    catch { setRows([]); }
    setLoading(false);
  }, [base]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!picked) { setDetail(null); return; }
    fetch(`${base}/crm/customers/${encodeURIComponent(picked)}`).then(r => r.json()).then(setDetail).catch(() => setDetail(null));
  }, [base, picked]);

  const filtered = search
    ? rows.filter(r => (r.buyer_phone || "").includes(search) || (r.buyer_email || "").toLowerCase().includes(search.toLowerCase()) || (r.favorite_genre || "").toLowerCase().includes(search.toLowerCase()))
    : rows;
  const totals = rows.reduce((a, r) => ({ tickets: a.tickets + r.tickets, spend: a.spend + r.total_spend }), { tickets: 0, spend: 0 });

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>👥 Cinema CRM — Customer Intelligence</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Aggregate per customer: favorite genre, preferred studio, watch frequency, spending.</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Stat label="Total customer" value={rows.length} color="#22d3ee" />
          <Stat label="Tiket total" value={totals.tickets} color="#a855f7" />
          <Stat label="Revenue total" value={rp(totals.spend)} color="#10b981" />
        </div>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search phone / email / genre…"
        style={{ width: "100%", padding: "10px 14px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 10, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 12 }} />

      <div style={{ display: "grid", gridTemplateColumns: picked ? "2fr 1fr" : "1fr", gap: 14 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "flex", color: C.dim, fontSize: 11, letterSpacing: 1, padding: "8px 14px", borderBottom: `1px solid ${C.border}`, gap: 10 }}>
            <span style={{ flex: 1.4 }}>KONTAK</span>
            <span style={{ width: 60 }}>TKT</span>
            <span style={{ width: 130 }}>TOTAL SPEND</span>
            <span style={{ width: 130 }}>FAV GENRE</span>
            <span style={{ width: 110 }}>STUDIO</span>
            <span style={{ width: 90 }}>LAST</span>
          </div>
          {loading ? <Empty>Memuat…</Empty> :
            filtered.length === 0 ? <Empty>No customer with kontak.</Empty> :
            filtered.map((r, i) => (
              <button key={i} onClick={() => setPicked(r.buyer_phone || r.buyer_email)}
                style={{ width: "100%", display: "flex", textAlign: "left", padding: "11px 14px", borderBottom: `1px solid ${C.border}`,
                  background: picked === (r.buyer_phone || r.buyer_email) ? "#a855f71a" : "transparent",
                  border: picked === (r.buyer_phone || r.buyer_email) ? "1px solid #a855f766" : "1px solid transparent",
                  borderBottomColor: C.border, cursor: "pointer", color: "#e6edf3", fontFamily: "inherit", gap: 10, alignItems: "center" }}>
                <span style={{ flex: 1.4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{r.buyer_phone || r.buyer_email || "—"}</div>
                  {r.buyer_phone && r.buyer_email && <div style={{ fontSize: 11, color: C.dim }}>{r.buyer_email}</div>}
                </span>
                <span style={{ width: 60, fontFamily: "'Geist Mono',monospace", color: "#22d3ee", fontWeight: 700 }}>{r.tickets}</span>
                <span style={{ width: 130, fontFamily: "'Geist Mono',monospace", color: "#10b981", fontWeight: 700 }}>{rp(r.total_spend)}</span>
                <span style={{ width: 130, fontSize: 12, color: r.favorite_genre ? "#fbbf24" : C.dim }}>{r.favorite_genre || "—"}</span>
                <span style={{ width: 110, fontSize: 11.5, color: C.sub }}>{r.favorite_studio || "—"}</span>
                <span style={{ width: 90, fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>
                  {fmtDate(r.last_visit)}
                  <div style={{ fontSize: 10 }}>{daysSince(r.last_visit) != null ? `${daysSince(r.last_visit)}d ago` : ""}</div>
                </span>
              </button>
            ))
          }
        </div>

        {picked && detail && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, position: "sticky", top: 14, alignSelf: "flex-start", maxHeight: 600, overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, color: "#fbbf24", letterSpacing: 1 }}>{detail.contact}</div>
              <button onClick={() => setPicked(null)} style={{ background: "transparent", border: "1px solid #2a2b30", color: C.sub, padding: "3px 9px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>×</button>
            </div>
            <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>RIWAYAT TIKET ({(detail.tickets || []).length})</div>
            {(detail.tickets || []).slice(0, 10).map(t => (
              <div key={t.id} style={{ padding: "6px 0", borderBottom: `1px solid #1f2937`, fontSize: 12 }}>
                <div style={{ fontWeight: 700 }}>{t.film_title || "—"} <span style={{ color: C.dim, fontWeight: 400, fontSize: 10 }}>· {t.studio_name}</span></div>
                <div style={{ fontSize: 10.5, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>{t.show_date} {t.start_time} · kursi {t.seat} · {rp(t.price)}</div>
              </div>
            ))}
            {(detail.in_studio_orders || []).length > 0 && (
              <>
                <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, margin: "12px 0 6px", fontFamily: "'Geist Mono',monospace" }}>IN-STUDIO ORDER ({detail.in_studio_orders.length})</div>
                {detail.in_studio_orders.slice(0, 5).map(o => (
                  <div key={o.id} style={{ padding: "5px 0", borderBottom: `1px solid #1f2937`, fontSize: 11.5 }}>
                    <span style={{ fontFamily: "'Geist Mono',monospace", color: "#fbbf24" }}>{o.order_code}</span> · kursi {o.seat} · {rp(o.total)}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #1b212c", borderRadius: 10, padding: "8px 14px", textAlign: "center", minWidth: 100 }}>
      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 16, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 0.5, marginTop: 1 }}>{label}</div>
    </div>
  );
}
function Empty({ children }) { return <div style={{ padding: "22px 14px", textAlign: "center", color: C.sub, fontSize: 13 }}>{children}</div>; }
