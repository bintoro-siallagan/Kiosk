import { useState, useEffect } from "react";

// Cinema Box Office — ticket sales & occupancy reporting.
// karyaOS cinema vertical (admin side). Reads /api/cinema/box-office.
const C = { card: "#0d1117", border: "#1b212c", sub: "#7d8590", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const DS_LABEL = { scheduled: "Terjadwal", running: "Berlangsung", closed: "Close", sold_out: "Sold Out", cancelled: "Cancel" };
const DS_COLOR = { scheduled: "#10b981", running: "#f59e0b", closed: "#6b7280", sold_out: "#ef4444", cancelled: "#dc2626" };

export default function CinemaBoxOffice({ apiBase }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => fetch(`${apiBase}/api/cinema/box-office`).then(r => r.json())
      .then(d => { setData(d && !d.error ? d : null); setLoading(false); }).catch(() => setLoading(false));
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [apiBase]);

  const films = data ? (data.by_film || []) : [];
  const shows = data ? (data.showtimes || []) : [];
  const maxRev = Math.max(1, ...films.map(f => f.revenue || 0));
  const totals = data ? data.totals : { tickets: 0, revenue: 0 };
  const today = data ? data.today : { tickets: 0, revenue: 0 };

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🎬 Cinema Box Office</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>karyaOS — vertikal cinema · penjualan tiket &amp; okupansi</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Stat label="Total tiket" value={totals.tickets} color="#22d3ee" />
          <Stat label="Total revenue" value={rp(totals.revenue)} color="#10b981" />
          <Stat label="Tiket day ini" value={today.tickets} color="#a855f7" />
          <Stat label="Revenue day ini" value={rp(today.revenue)} color="#10b981" />
        </div>
      </div>

      {loading ? <div style={{ color: C.dim, fontSize: 13, padding: "24px 0" }}>Memuat…</div> : !data ? (
        <div style={{ color: C.dim, fontSize: 13, padding: "24px 0" }}>Data box office tidak tersedia.</div>
      ) : (
        <>
          {/* Per film */}
          <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>PENJUALAN PER FILM</div>
          {films.length === 0 ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "22px 18px", textAlign: "center", color: C.sub, fontSize: 13, marginBottom: 22 }}>
              No tickets yet terjual.
            </div>
          ) : (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "6px 14px", marginBottom: 22 }}>
              {films.map((f, i) => (
                <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < films.length - 1 ? `1px solid ${C.border}` : "none", flexWrap: "wrap" }}>
                  <div style={{ width: 22, fontFamily: "'Geist Mono',monospace", fontSize: 12, color: C.dim }}>#{i + 1}</div>
                  <div style={{ width: 150, flexShrink: 0, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.title}</div>
                  <div style={{ flex: 1, minWidth: 80, height: 8, background: "#161b22", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.max(2, (f.revenue || 0) / maxRev * 100)}%`, background: "#a855f7", borderRadius: 4 }} />
                  </div>
                  <div style={{ width: 70, textAlign: "right", fontSize: 12, color: C.sub }}>{f.tickets} tkt</div>
                  <div style={{ width: 110, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 12.5, fontWeight: 700, color: "#10b981" }}>{rp(f.revenue)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Occupancy per showtime */}
          <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>OKUPANSI PER JADWAL</div>
          {shows.length === 0 ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "22px 18px", textAlign: "center", color: C.sub, fontSize: 13 }}>
              No jadwal tayang.
            </div>
          ) : (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "6px 14px" }}>
              {shows.map((s, i) => {
                const occ = s.capacity ? Math.round(s.sold / s.capacity * 100) : 0;
                const col = occ >= 80 ? "#ef4444" : occ >= 50 ? "#eab308" : "#10b981";
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < shows.length - 1 ? `1px solid ${C.border}` : "none", flexWrap: "wrap" }}>
                    <div style={{ width: 168, flexShrink: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.film_title || "—"}</div>
                      <div style={{ fontSize: 11, color: C.sub }}>{s.studio_name || "—"} · {s.show_date} {s.start_time}</div>
                    </div>
                    {(() => { const ds = s.derived_status || "scheduled"; return (
                      <span style={{ fontSize: 10, fontWeight: 800, color: DS_COLOR[ds], background: (DS_COLOR[ds] || "#5b6470") + "22", borderRadius: 6, padding: "3px 8px", letterSpacing: 1, whiteSpace: "nowrap" }}>{DS_LABEL[ds] || ds}</span>
                    ); })()}
                    <div style={{ flex: 1, minWidth: 80, height: 8, background: "#161b22", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.max(2, occ)}%`, background: col, borderRadius: 4 }} />
                    </div>
                    <div style={{ width: 96, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 12 }}>{s.sold}/{s.capacity} · {occ}%</div>
                    <div style={{ width: 104, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 12.5, fontWeight: 700, color: "#10b981" }}>{rp(s.revenue)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #1b212c", borderRadius: 10, padding: "8px 14px", textAlign: "center", minWidth: 96 }}>
      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 16, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 0.5, marginTop: 1 }}>{label}</div>
    </div>
  );
}
