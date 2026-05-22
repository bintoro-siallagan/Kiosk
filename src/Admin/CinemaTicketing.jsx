import { useState, useEffect } from "react";

// Cinema Ticketing — pick a showtime, sell seats off a live seat map.
// karyaOS cinema vertical (admin side). Talks to /api/cinema/*.
const C = { card: "#0d1117", border: "#1b212c", sub: "#7d8590", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const inp = { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 10px", color: "#fff", fontSize: 12.5, fontFamily: "inherit", boxSizing: "border-box", outline: "none" };

export default function CinemaTicketing({ apiBase }) {
  const [showtimes, setShowtimes] = useState([]);
  const [showId, setShowId] = useState("");
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [msg, setMsg] = useState("");
  const base = `${apiBase}/api/cinema`;

  useEffect(() => {
    fetch(`${base}/showtimes`).then(r => r.json()).then(d => setShowtimes(d.showtimes || [])).catch(() => {});
  }, [apiBase]);

  const loadSeats = (id) => {
    if (!id) { setData(null); setSelected(new Set()); return; }
    fetch(`${base}/showtimes/${id}/seats`).then(r => r.json())
      .then(d => { setData(d && !d.error ? d : null); setSelected(new Set()); }).catch(() => {});
  };
  const pick = (id) => { setShowId(id); setMsg(""); loadSeats(id); };

  const toggle = (seat) => {
    if (data && data.sold.includes(seat)) return;
    setSelected(p => { const n = new Set(p); n.has(seat) ? n.delete(seat) : n.add(seat); return n; });
  };

  const sell = () => {
    if (!selected.size || !showId) return;
    setMsg("");
    fetch(`${base}/tickets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ showtime_id: showId, seats: [...selected] }) })
      .then(r => r.json()).then(d => {
        if (d && d.error) setMsg("⚠ " + d.error);
        else { setMsg(`✅ ${d.count} tiket terjual — ${rp(d.total)}`); loadSeats(showId); }
      }).catch(() => setMsg("⚠ Gagal menjual tiket"));
  };

  const price = data && data.showtime ? (data.showtime.price || 0) : 0;
  const occupancy = data && data.capacity ? Math.round(data.sold_count / data.capacity * 100) : 0;
  const stLabel = (s) => `${s.film_title || "—"} · ${s.studio_name || "—"} · ${s.show_date} ${s.start_time}`;

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", color: "#e6edf3" }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🎟️ Cinema Ticketing</div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>karyaOS — vertikal cinema · pilih jadwal &amp; jual kursi</div>
      </div>

      {/* Showtime picker */}
      <select value={showId} onChange={e => pick(e.target.value)} style={{ ...inp, width: "100%", marginBottom: 14, cursor: "pointer" }}>
        <option value="">— Pilih jadwal tayang —</option>
        {showtimes.map(s => <option key={s.id} value={s.id}>{stLabel(s)}</option>)}
      </select>

      {msg && <div style={{ background: msg[0] === "✅" ? "#10b98115" : "#ef444415", border: `1px solid ${msg[0] === "✅" ? "#10b98144" : "#ef444444"}`, borderRadius: 8, padding: "8px 12px", color: msg[0] === "✅" ? "#86efac" : "#fca5a5", fontSize: 12, marginBottom: 12 }}>{msg}</div>}

      {!data ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "30px 18px", textAlign: "center", color: C.sub, fontSize: 13 }}>
          Pilih jadwal tayang untuk menampilkan peta kursi.
        </div>
      ) : (
        <>
          {/* Occupancy */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: C.sub }}>Okupansi</span>
            <div style={{ flex: 1, minWidth: 120, height: 8, background: "#161b22", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${occupancy}%`, background: occupancy >= 80 ? "#ef4444" : occupancy >= 50 ? "#eab308" : "#10b981", borderRadius: 4 }} />
            </div>
            <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 12.5, fontWeight: 700 }}>{data.sold_count}/{data.capacity} · {occupancy}%</span>
          </div>

          {/* Seat map */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 14px", overflowX: "auto" }}>
            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div style={{ height: 4, background: "linear-gradient(90deg,transparent,#a855f7,transparent)", borderRadius: 4, marginBottom: 4 }} />
              <span style={{ fontSize: 10, color: C.dim, letterSpacing: 3, fontFamily: "'Space Mono',monospace" }}>L A Y A R</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
              {Array.from({ length: data.rows }).map((_, ri) => {
                const letter = String.fromCharCode(65 + ri);
                return (
                  <div key={ri} style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <span style={{ width: 16, fontSize: 11, color: C.dim, fontFamily: "'Space Mono',monospace" }}>{letter}</span>
                    {Array.from({ length: data.cols }).map((_, ci) => {
                      const seat = `${letter}${ci + 1}`;
                      const sold = data.sold.includes(seat);
                      const sel = selected.has(seat);
                      const bg = sold ? "#ef444433" : sel ? "#10b981" : "#1b212c";
                      const bd = sold ? "#ef444455" : sel ? "#10b981" : "#2a2b30";
                      return (
                        <button key={ci} onClick={() => toggle(seat)} disabled={sold} title={seat}
                          style={{ width: 26, height: 26, borderRadius: 5, background: bg, border: `1px solid ${bd}`,
                            color: sold ? "#ef4444" : sel ? "#062a1a" : C.sub, fontSize: 9.5, fontWeight: 700,
                            cursor: sold ? "not-allowed" : "pointer", fontFamily: "'Space Mono',monospace" }}>
                          {ci + 1}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 14, fontSize: 11, color: C.sub, flexWrap: "wrap" }}>
              <Legend color="#1b212c" border="#2a2b30" label="Tersedia" />
              <Legend color="#10b981" border="#10b981" label="Dipilih" />
              <Legend color="#ef444433" border="#ef444455" label="Terjual" />
            </div>
          </div>

          {/* Sell footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginTop: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px" }}>
            <div style={{ fontSize: 12.5, color: C.sub }}>
              <b style={{ color: "#fff", fontSize: 15, fontFamily: "'Space Mono',monospace" }}>{selected.size}</b> kursi dipilih
              {selected.size > 0 && <span> · {[...selected].sort().join(", ")}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 16, fontWeight: 700, color: "#10b981" }}>{rp(selected.size * price)}</div>
              <button onClick={sell} disabled={!selected.size}
                style={{ background: selected.size ? "#10b981" : "#1b212c", border: "none", borderRadius: 8, padding: "9px 20px",
                  color: selected.size ? "#04130c" : C.dim, fontSize: 13, fontWeight: 700, cursor: selected.size ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                Jual Tiket
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Legend({ color, border, label }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 14, height: 14, borderRadius: 4, background: color, border: `1px solid ${border}`, display: "inline-block" }} />
      {label}
    </span>
  );
}
