import { useState, useEffect } from "react";

// CinemaKiosk — customer-facing cinema ticket flow.
// films → showtimes → seat map → buy → confirmation. Uses /api/cinema/*.
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const BG = "#050810";

export default function CinemaKiosk({ apiBase }) {
  const [step, setStep] = useState("films");
  const [films, setFilms] = useState([]);
  const [showtimes, setShowtimes] = useState([]);
  const [film, setFilm] = useState(null);
  const [show, setShow] = useState(null);
  const [seatData, setSeatData] = useState(null);
  const [seats, setSeats] = useState(new Set());
  const [done, setDone] = useState(null);
  const [msg, setMsg] = useState("");
  const base = `${apiBase || ""}/api/cinema`;

  useEffect(() => {
    fetch(`${base}/films`).then(r => r.json()).then(d => setFilms((d.films || []).filter(f => f.status === "now_showing"))).catch(() => {});
    fetch(`${base}/showtimes`).then(r => r.json()).then(d => setShowtimes(d.showtimes || [])).catch(() => {});
    // eslint-disable-next-line
  }, []);

  const pickFilm = (f) => { setFilm(f); setMsg(""); setStep("showtimes"); };
  const pickShow = (s) => {
    setMsg("");
    fetch(`${base}/showtimes/${s.id}/seats`).then(r => r.json())
      .then(d => { setShow(s); setSeatData(d && !d.error ? d : null); setSeats(new Set()); setStep("seats"); }).catch(() => {});
  };
  const toggleSeat = (seat) => {
    if (!seatData || seatData.sold.includes(seat)) return;
    setSeats(p => { const n = new Set(p); n.has(seat) ? n.delete(seat) : n.add(seat); return n; });
  };
  const buy = () => {
    if (!seats.size || !show) return;
    setMsg("");
    fetch(`${base}/tickets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ showtime_id: show.id, seats: [...seats] }) })
      .then(r => r.json()).then(d => {
        if (d && d.error) setMsg("⚠ " + d.error);
        else { setDone({ film, show, seats: [...seats].sort(), total: d.total }); setStep("done"); }
      }).catch(() => setMsg("⚠ Gagal memproses tiket"));
  };
  const reset = () => { setStep("films"); setFilm(null); setShow(null); setSeatData(null); setSeats(new Set()); setDone(null); setMsg(""); };

  const filmShows = showtimes.filter(s => film && s.film_id === film.id);
  const price = show ? (show.price || 0) : 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, color: "#e6edf3", fontFamily: "'Inter',sans-serif", overflowY: "auto", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 24px", borderBottom: "1px solid #161b22", flexShrink: 0 }}>
        {step !== "films" && step !== "done" && (
          <button onClick={() => setStep(step === "seats" ? "showtimes" : "films")}
            style={{ background: "#161b22", border: "1px solid #2a2b30", borderRadius: 10, color: "#e6edf3", fontSize: 16, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit" }}>←</button>
        )}
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>🎬 karya<span style={{ color: "#a855f7" }}>OS</span> Cinema</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: "#5b6470" }}>
          {["films", "showtimes", "seats"].map((s, i) => (
            <span key={s} style={{ color: step === s ? "#a855f7" : "#5b6470", fontWeight: step === s ? 700 : 400 }}>{i > 0 ? " · " : ""}{["Film", "Jadwal", "Kursi"][i]}</span>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, padding: "24px", maxWidth: 980, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {msg && <div style={{ background: "#ef444415", border: "1px solid #ef444444", borderRadius: 10, padding: "10px 14px", color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>{msg}</div>}

        {/* STEP: films */}
        {step === "films" && (
          <>
            <H>Pilih Film</H>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 }}>
              {films.map(f => (
                <button key={f.id} onClick={() => pickFilm(f)} style={card()}>
                  <div style={{ fontSize: 38, marginBottom: 8 }}>🎞️</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{f.title}</div>
                  <div style={{ fontSize: 12.5, color: "#7d8590", marginTop: 4 }}>{f.genre || "—"} · {f.duration_min || 0} mnt</div>
                  <div style={{ marginTop: 8, display: "inline-block", fontSize: 11, fontWeight: 700, color: "#a78bfa", background: "#a855f722", borderRadius: 6, padding: "3px 10px" }}>{f.rating}</div>
                </button>
              ))}
              {films.length === 0 && <div style={{ color: "#5b6470", fontSize: 14 }}>Belum ada film tayang.</div>}
            </div>
          </>
        )}

        {/* STEP: showtimes */}
        {step === "showtimes" && film && (
          <>
            <H>{film.title}</H>
            <div style={{ fontSize: 13, color: "#7d8590", marginTop: -8, marginBottom: 16 }}>{film.genre} · {film.duration_min} mnt · {film.rating}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
              {filmShows.map(s => (
                <button key={s.id} onClick={() => pickShow(s)} style={card()}>
                  <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 22, fontWeight: 700 }}>{s.start_time}</div>
                  <div style={{ fontSize: 12.5, color: "#7d8590", marginTop: 4 }}>{s.show_date}</div>
                  <div style={{ fontSize: 12.5, color: "#7d8590" }}>{s.studio_name} · {s.studio_type}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#10b981", marginTop: 8 }}>{rp(s.price)}</div>
                </button>
              ))}
              {filmShows.length === 0 && <div style={{ color: "#5b6470", fontSize: 14 }}>Belum ada jadwal untuk film ini.</div>}
            </div>
          </>
        )}

        {/* STEP: seats */}
        {step === "seats" && seatData && (
          <>
            <H>Pilih Kursi</H>
            <div style={{ fontSize: 13, color: "#7d8590", marginTop: -8, marginBottom: 16 }}>
              {film.title} · {show.studio_name} · {show.show_date} {show.start_time}
            </div>
            <div style={{ background: "#0d1117", border: "1px solid #1b212c", borderRadius: 14, padding: "18px 14px", overflowX: "auto" }}>
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ height: 5, background: "linear-gradient(90deg,transparent,#a855f7,transparent)", borderRadius: 4, marginBottom: 5 }} />
                <span style={{ fontSize: 11, color: "#5b6470", letterSpacing: 4, fontFamily: "'Geist Mono',monospace" }}>L A Y A R</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, alignItems: "center" }}>
                {Array.from({ length: seatData.rows }).map((_, ri) => {
                  const letter = String.fromCharCode(65 + ri);
                  return (
                    <div key={ri} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ width: 18, fontSize: 12, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{letter}</span>
                      {Array.from({ length: seatData.cols }).map((_, ci) => {
                        const seat = `${letter}${ci + 1}`;
                        const sold = seatData.sold.includes(seat);
                        const sel = seats.has(seat);
                        return (
                          <button key={ci} onClick={() => toggleSeat(seat)} disabled={sold} title={seat}
                            style={{ width: 30, height: 30, borderRadius: 6, fontSize: 10, fontWeight: 700, fontFamily: "'Geist Mono',monospace",
                              background: sold ? "#ef444433" : sel ? "#10b981" : "#1b212c",
                              border: `1px solid ${sold ? "#ef444455" : sel ? "#10b981" : "#2a2b30"}`,
                              color: sold ? "#ef4444" : sel ? "#04130c" : "#7d8590",
                              cursor: sold ? "not-allowed" : "pointer" }}>{ci + 1}</button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* STEP: done */}
        {step === "done" && done && (
          <div style={{ textAlign: "center", paddingTop: 30 }}>
            <div style={{ fontSize: 60 }}>🎟️</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>Tiket Berhasil Dibeli!</div>
            <div style={{ background: "#0d1117", border: "1px solid #1b212c", borderRadius: 14, padding: 22, margin: "20px auto 0", maxWidth: 400, textAlign: "left" }}>
              <Line k="Film" v={done.film.title} />
              <Line k="Studio" v={`${done.show.studio_name} · ${done.show.studio_type || ""}`} />
              <Line k="Jadwal" v={`${done.show.show_date} ${done.show.start_time}`} />
              <Line k="Kursi" v={done.seats.join(", ")} />
              <div style={{ borderTop: "1px solid #1b212c", marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
                <b>Total</b><b style={{ color: "#10b981", fontFamily: "'Geist Mono',monospace" }}>{rp(done.total)}</b>
              </div>
            </div>
            <button onClick={reset} style={{ marginTop: 22, background: "#a855f7", border: "none", borderRadius: 12, padding: "14px 30px", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Pesan Tiket Lagi
            </button>
          </div>
        )}
      </div>

      {/* Seat footer */}
      {step === "seats" && seatData && (
        <div style={{ flexShrink: 0, borderTop: "1px solid #161b22", background: "#0a0e16", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, color: "#7d8590" }}>
            <b style={{ color: "#fff", fontSize: 17, fontFamily: "'Geist Mono',monospace" }}>{seats.size}</b> kursi
            {seats.size > 0 && <span> · {[...seats].sort().join(", ")}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 18, fontWeight: 700, color: "#10b981" }}>{rp(seats.size * price)}</div>
            <button onClick={buy} disabled={!seats.size}
              style={{ background: seats.size ? "#10b981" : "#1b212c", border: "none", borderRadius: 12, padding: "13px 28px",
                color: seats.size ? "#04130c" : "#5b6470", fontSize: 15, fontWeight: 700, cursor: seats.size ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
              Beli Tiket
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function H({ children }) {
  return <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 17, fontWeight: 700, letterSpacing: 1, marginBottom: 14 }}>{children}</div>;
}
function Line({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13, padding: "4px 0" }}>
      <span style={{ color: "#7d8590" }}>{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );
}
function card() {
  return {
    background: "#0d1117", border: "1px solid #1b212c", borderRadius: 14, padding: 18,
    cursor: "pointer", textAlign: "left", color: "#e6edf3", fontFamily: "inherit", width: "100%",
  };
}
