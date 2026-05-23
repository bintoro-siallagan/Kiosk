import { useState, useEffect } from "react";
import DelightPopup from "./components/DelightPopup.jsx";

// CinemaKiosk — customer-facing cinema ticket flow.
// films → showtimes → seats → F&B bundles → confirmation. Uses /api/cinema/*.
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const BG = "#050810";
const STATUS_LABEL = { scheduled: "", running: "Berlangsung", closed: "Tutup", sold_out: "Sold Out", cancelled: "Batal" };
const STATUS_COLOR = { running: "#f59e0b", closed: "#6b7280", sold_out: "#ef4444", cancelled: "#dc2626" };

export default function CinemaKiosk({ apiBase }) {
  const [step, setStep] = useState("films");
  const [films, setFilms] = useState([]);
  const [showtimes, setShowtimes] = useState([]);
  const [film, setFilm] = useState(null);
  const [show, setShow] = useState(null);
  const [seatData, setSeatData] = useState(null);
  const [seats, setSeats] = useState(new Set());
  const [bundleCatalog, setBundleCatalog] = useState([]);
  const [cart, setCart] = useState({});  // { [bundle_id]: qty }
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [done, setDone] = useState(null);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  // ── Anti double-sell: each browser gets a stable hold_token (persisted in
  // localStorage so refresh doesn't drop reservations). Backend locks the
  // seats while customer is in F&B + payment so nobody else can grab them.
  const [holdToken] = useState(() => {
    try {
      let t = localStorage.getItem("cinema_hold_token");
      if (!t) {
        const rnd = (window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36));
        t = "CH-" + String(rnd).replace(/-/g, "").slice(0, 16).toUpperCase();
        localStorage.setItem("cinema_hold_token", t);
      }
      return t;
    } catch { return "CH-" + Math.random().toString(36).slice(2, 18).toUpperCase(); }
  });
  const [holdExpiresAt, setHoldExpiresAt] = useState(null); // unix sec
  const [holdRemaining, setHoldRemaining] = useState(0);    // sec
  const base = `${apiBase || ""}/api/cinema`;

  useEffect(() => {
    fetch(`${base}/films`).then(r => r.json()).then(d => setFilms(d.films || [])).catch(() => {});
    fetch(`${base}/showtimes`).then(r => r.json()).then(d => setShowtimes(d.showtimes || [])).catch(() => {});
    fetch(`${base}/bundles`).then(r => r.json()).then(d => setBundleCatalog(d.bundles || [])).catch(() => {});
    // eslint-disable-next-line
  }, []);
  // ── Customer rating (1-5 stars) on done step ──
  const [showDelight, setShowDelight] = useState(false);
  const [rateValue, setRateValue] = useState(0);
  const [rateComment, setRateComment] = useState("");
  const [rateSent, setRateSent] = useState(false);
  async function submitRating() {
    if (!rateValue || !done?.film?.id || rateSent) return;
    try {
      const r = await fetch(`${base}/films/${done.film.id}/rate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: rateValue, comment: rateComment,
          customer_name: done.email || "", customer_phone: done.phone || "",
          ticket_code: done.tickets?.[0]?.code || "",
        }),
      });
      const d = await r.json();
      if (d.ok) setRateSent(true);
    } catch {}
  }

  const reloadSeats = (showtimeId) => {
    return fetch(`${base}/showtimes/${showtimeId}/seats?hold_token=${encodeURIComponent(holdToken)}`)
      .then(r => r.json()).then(d => { if (d && !d.error) setSeatData(d); return d; });
  };
  const pickFilm = (f) => { setFilm(f); setMsg(""); setStep("showtimes"); };
  const pickShow = (s) => {
    setMsg("");
    fetch(`${base}/showtimes/${s.id}/seats?hold_token=${encodeURIComponent(holdToken)}`).then(r => r.json())
      .then(d => { setShow(s); setSeatData(d && !d.error ? d : null); setSeats(new Set()); setStep("seats"); }).catch(() => {});
  };
  const toggleSeat = (seat) => {
    if (!seatData) return;
    if (seatData.sold.includes(seat)) return;
    if ((seatData.held_by_others || []).includes(seat)) return;
    setSeats(p => { const n = new Set(p); n.has(seat) ? n.delete(seat) : n.add(seat); return n; });
  };

  // Reserve seats on backend (atomic) before advancing to F&B / payment.
  async function holdSeats() {
    if (!seats.size || !show) return { ok: false };
    setMsg("");
    try {
      const r = await fetch(`${base}/seats/hold`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showtime_id: show.id, seats: [...seats], hold_token: holdToken, ttl_seconds: 300 }),
      });
      const d = await r.json();
      if (!d.ok) {
        setMsg("⚠ " + (d.error || "Gagal menyimpan kursi"));
        if (d.conflict_seats) {
          setSeats(p => { const n = new Set(p); d.conflict_seats.forEach(s => n.delete(s)); return n; });
        }
        if (show) await reloadSeats(show.id);
        return { ok: false };
      }
      setHoldExpiresAt(d.expires_at);
      return { ok: true };
    } catch (e) {
      setMsg("⚠ Koneksi gagal");
      return { ok: false };
    }
  }

  async function releaseHolds() {
    try {
      await fetch(`${base}/seats/release`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hold_token: holdToken }),
      });
    } catch {}
    setHoldExpiresAt(null);
  }

  // Cart helpers for bundles
  const incBundle = (id) => setCart(c => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const decBundle = (id) => setCart(c => {
    const n = (c[id] || 0) - 1;
    const out = { ...c };
    if (n <= 0) delete out[id]; else out[id] = n;
    return out;
  });

  // Money math
  const seatsTotal = seats.size * (show?.price || 0);
  const cartItems = Object.entries(cart)
    .map(([id, qty]) => { const b = bundleCatalog.find(x => x.id === parseInt(id, 10)); return b ? { bundle_id: b.id, qty, name: b.name, price: b.price } : null; })
    .filter(Boolean);
  const bundlesTotal = cartItems.reduce((a, it) => a + it.qty * it.price, 0);
  const grandTotal = seatsTotal + bundlesTotal;

  const goBundles = async () => {
    if (!seats.size || !show) return;
    const h = await holdSeats();
    if (!h.ok) return;
    if (bundleCatalog.length === 0) { buy([]); return; }
    setStep("bundles");
  };

  const buy = (bundleItems) => {
    if (!seats.size || !show) return;
    setMsg("");
    const body = {
      showtime_id: show.id,
      seats: [...seats],
      hold_token: holdToken,
      bundles: (bundleItems || cartItems).map(it => ({ bundle_id: it.bundle_id, qty: it.qty })),
      buyer_email: email.trim() || undefined,
      buyer_phone: phone.trim() || undefined,
    };
    fetch(`${base}/tickets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(r => r.json()).then(d => {
        if (d && d.error) setMsg("⚠ " + d.error);
        else {
          setDone({
            film, show, seats: [...seats].sort(),
            total: d.total,
            seats_total: d.seats_total,
            bundles_total: d.bundles_total,
            tickets: d.tickets || [],
            bundles: d.bundles || [],
            purchase_id: d.purchase_id,
            email: email.trim(),
            phone: phone.trim(),
          });
          setHoldExpiresAt(null); // holds auto-consumed by backend
          setRateValue(0); setRateComment(""); setRateSent(false);
          setStep("done");
          setShowDelight(true);
        }
      }).catch(() => setMsg("⚠ Gagal memproses tiket"));
  };

  const reset = () => {
    releaseHolds();
    setStep("films"); setFilm(null); setShow(null); setSeatData(null);
    setSeats(new Set()); setCart({}); setEmail(""); setPhone(""); setDone(null); setMsg("");
  };

  // ── Countdown timer for the active hold ──
  useEffect(() => {
    if (!holdExpiresAt) { setHoldRemaining(0); return; }
    const tick = () => {
      const r = holdExpiresAt - Math.floor(Date.now() / 1000);
      setHoldRemaining(Math.max(0, r));
      if (r <= 0) {
        setMsg("⚠ Waktu menyimpan kursi habis (5 menit). Pilih ulang.");
        releaseHolds();
        setSeats(new Set());
        setStep("seats");
        if (show) reloadSeats(show.id);
      }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line
  }, [holdExpiresAt]);

  // ── Heartbeat: refresh hold every 60s while in bundles/payment step ──
  useEffect(() => {
    if (step !== "bundles" || !holdExpiresAt) return;
    const iv = setInterval(() => {
      fetch(`${base}/seats/refresh`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hold_token: holdToken, ttl_seconds: 300 }),
      }).then(r => r.json()).then(d => { if (d.ok) setHoldExpiresAt(d.expires_at); }).catch(() => {});
    }, 60000);
    return () => clearInterval(iv);
    // eslint-disable-next-line
  }, [step]);

  // Auto-poll seat map (other customers' buys) while customer is selecting
  useEffect(() => {
    if (step !== "seats" || !show) return;
    const iv = setInterval(() => reloadSeats(show.id), 8000);
    return () => clearInterval(iv);
    // eslint-disable-next-line
  }, [step, show?.id]);

  // Email — POST to backend (uses configured SMTP)
  async function emailTickets() {
    if (!done?.purchase_id) return;
    let to = done.email || "";
    if (!to) {
      to = window.prompt("Kirim tiket ke email:", "") || "";
      to = to.trim();
      if (!to) return;
    }
    setSending(true);
    try {
      const r = await fetch(`${base}/tickets/send-email`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchase_id: done.purchase_id, email: to }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Gagal kirim");
      setMsg(`✅ Tiket terkirim ke ${to}`);
      setDone(cur => cur && ({ ...cur, email: to, emailSent: true }));
    } catch (e) { setMsg("⚠ " + e.message); }
    setSending(false);
  }

  // WhatsApp — client-side wa.me link, no backend needed
  function shareWA() {
    if (!done) return;
    const lines = [
      "🎬 *KaryaOS Cinema — Tiket Anda*", "",
      `*${done.film.title}*`,
      `📅 ${done.show.show_date} · ${done.show.start_time}`,
      `🏛️ ${done.show.studio_name}${done.show.studio_type ? " · " + done.show.studio_type : ""}`,
      `💺 Kursi: ${done.seats.join(", ")}`, "",
      "*Kode tiket:*",
      ...done.tickets.map(t => `• ${t.seat} — ${t.code}`),
    ];
    if (done.bundles?.length) {
      lines.push("", "*🍿 F&B Combo:*");
      done.bundles.forEach(b => lines.push(`• ${b.qty}× ${b.bundle_name} — ${rp((b.qty || 1) * (b.price || 0))}`));
    }
    lines.push("", `*Total:* ${rp(done.total)}`, "", "Tunjukkan QR di pintu studio.");
    const text = encodeURIComponent(lines.join("\n"));
    // Normalize Indonesian phone — 08xxxxx → 628xxxxx, +62... → 62...
    const raw = (done.phone || "").replace(/[^\d+]/g, "");
    const norm = raw.startsWith("+") ? raw.slice(1) : raw.startsWith("0") ? "62" + raw.slice(1) : raw;
    const url = norm ? `https://wa.me/${norm}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function printTickets() {
    if (!done || !done.tickets || !done.tickets.length) return;
    const ticketsHtml = done.tickets.map(t => `
      <div style="border:2px dashed #999;border-radius:14px;padding:16px;margin:0 0 12px;display:flex;gap:18px;align-items:center;background:#fff;color:#111;font-family:'Inter',Arial,sans-serif;max-width:520px;page-break-inside:avoid">
        <div style="text-align:center">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=170x170&margin=6&data=${encodeURIComponent(t.code)}" style="width:170px;height:170px;display:block"/>
          <div style="font-family:'Geist Mono',monospace;font-size:12px;margin-top:6px;letter-spacing:2px"><b>${t.code}</b></div>
        </div>
        <div style="flex:1;font-size:13px;line-height:1.55">
          <div style="font-size:10px;color:#888;letter-spacing:3px;font-weight:800;margin-bottom:4px">🎬 KARYAOS CINEMA</div>
          <div style="font-size:17px;font-weight:800;margin:0 0 6px">${done.film.title}</div>
          <div><span style="color:#666">Jadwal</span> &nbsp;${done.show.show_date} &middot; ${done.show.start_time}</div>
          <div><span style="color:#666">Studio</span> &nbsp;${done.show.studio_name || ''}</div>
          <div><span style="color:#666">Kursi</span> &nbsp;<b style="font-size:16px">${t.seat}</b></div>
          <div><span style="color:#666">Harga</span> &nbsp;Rp ${(t.price || 0).toLocaleString('id-ID')}</div>
          <div style="margin-top:8px;font-size:10px;color:#888">Tunjukkan QR ini saat masuk studio</div>
        </div>
      </div>`).join('');
    let voucherHtml = '';
    if (done.bundles && done.bundles.length) {
      const items = done.bundles.map(b => `<li style="margin:3px 0"><b>${b.qty}×</b> ${b.bundle_name}${b.price ? ` <span style="color:#888">— Rp ${(b.price * b.qty).toLocaleString('id-ID')}</span>` : ''}</li>`).join('');
      const firstCode = done.tickets[0]?.code || done.purchase_id || '';
      voucherHtml = `
      <div style="border:2px solid #f59e0b;border-radius:14px;padding:16px;margin:0 0 12px;display:flex;gap:18px;align-items:center;background:#fff7ed;color:#111;font-family:'Inter',Arial,sans-serif;max-width:520px;page-break-inside:avoid">
        <div style="text-align:center">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=170x170&margin=6&data=${encodeURIComponent(firstCode)}" style="width:170px;height:170px;display:block"/>
          <div style="font-family:'Geist Mono',monospace;font-size:11px;margin-top:6px;letter-spacing:2px"><b>${firstCode}</b></div>
        </div>
        <div style="flex:1;font-size:13px;line-height:1.5">
          <div style="font-size:10px;color:#a16207;letter-spacing:3px;font-weight:800;margin-bottom:4px">🍿 F&amp;B VOUCHER</div>
          <div style="font-size:15px;font-weight:800;margin:0 0 6px">Tukar di F&amp;B Counter</div>
          <ul style="margin:6px 0;padding-left:18px;font-size:13px">${items}</ul>
          <div style="margin-top:6px;font-size:10px;color:#888">Tunjukkan QR ini ke staff F&amp;B saat menukar combo</div>
        </div>
      </div>`;
    }
    const w = window.open('', '_blank', 'width=640,height=820');
    if (w) {
      w.document.write(`<html><head><title>Tiket — KaryaOS Cinema</title></head><body style="margin:24px;background:#f5f5f5" onload="setTimeout(function(){window.print()},300)">${voucherHtml}${ticketsHtml}</body></html>`);
      w.document.close();
    }
  }

  const filmShows = showtimes.filter(s => film && s.film_id === film.id);
  const price = show ? (show.price || 0) : 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, color: "#e6edf3", fontFamily: "'Inter',sans-serif", overflowY: "auto", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 24px", borderBottom: "1px solid #161b22", flexShrink: 0 }}>
        {step !== "films" && step !== "done" && (
          <button onClick={async () => {
            if (step === "bundles") setStep("seats");
            else if (step === "seats") { await releaseHolds(); setStep("showtimes"); }
            else setStep("films");
          }}
            style={{ background: "#161b22", border: "1px solid #2a2b30", borderRadius: 10, color: "#e6edf3", fontSize: 16, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit" }}>←</button>
        )}
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>🎬 karya<span style={{ color: "#a855f7" }}>OS</span> Cinema</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: "#5b6470" }}>
          {["films", "showtimes", "seats", "bundles"].map((s, i) => (
            <span key={s} style={{ color: step === s ? "#a855f7" : "#5b6470", fontWeight: step === s ? 700 : 400 }}>{i > 0 ? " · " : ""}{["Film", "Jadwal", "Kursi", "F&B"][i]}</span>
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
              {films.filter(f => f.status === "now_showing").map(f => (
                <button key={f.id} onClick={() => pickFilm(f)} style={card()}>
                  <div style={{ fontSize: 38, marginBottom: 8 }}>🎞️</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{f.title}</div>
                  <div style={{ fontSize: 12.5, color: "#7d8590", marginTop: 4 }}>{f.genre || "—"} · {f.duration_min || 0} mnt</div>
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", background: "#a855f722", borderRadius: 6, padding: "3px 10px" }}>{f.rating}</span>
                    {f.avg_rating ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24" }}>★ {f.avg_rating} <span style={{ color: "#5b6470", fontWeight: 400 }}>({f.ratings_count})</span></span>
                    ) : null}
                  </div>
                </button>
              ))}
              {films.filter(f => f.status === "now_showing").length === 0 && <div style={{ color: "#5b6470", fontSize: 14 }}>Belum ada film tayang.</div>}
            </div>

            {films.filter(f => f.status === "coming_soon").length > 0 && (
              <>
                <div style={{ marginTop: 30, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 17, fontWeight: 700, letterSpacing: 1 }}>📅 Tayang Segera</div>
                  <span style={{ fontSize: 11, color: "#fbbf24", background: "#f59e0b22", padding: "3px 10px", borderRadius: 6, fontWeight: 700, letterSpacing: 1 }}>COMING SOON</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 }}>
                  {films.filter(f => f.status === "coming_soon").map(f => (
                    <div key={f.id} style={{ ...card(), cursor: "default", opacity: 0.75, position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", top: 8, right: 8, fontSize: 9, color: "#fbbf24", background: "#f59e0b22", border: "1px solid #f59e0b55", borderRadius: 5, padding: "2px 7px", fontWeight: 700, letterSpacing: 1 }}>SEGERA</div>
                      <div style={{ fontSize: 38, marginBottom: 8, filter: "grayscale(0.3)" }}>🎞️</div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{f.title}</div>
                      <div style={{ fontSize: 12.5, color: "#7d8590", marginTop: 4 }}>{f.genre || "—"} · {f.duration_min || 0} mnt · {f.rating}</div>
                      {f.synopsis && <div style={{ fontSize: 11.5, color: "#9ca3af", marginTop: 8, lineHeight: 1.45, maxHeight: 56, overflow: "hidden" }}>{f.synopsis}</div>}
                      {f.license_start && <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 8 }}>📅 Mulai {f.license_start}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* STEP: showtimes */}
        {step === "showtimes" && film && (
          <>
            <H>{film.title}</H>
            <div style={{ fontSize: 13, color: "#7d8590", marginTop: -8, marginBottom: 16 }}>{film.genre} · {film.duration_min} mnt · {film.rating}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
              {filmShows.map(s => {
                const ds = s.derived_status || "scheduled";
                const locked = ds !== "scheduled";
                return (
                  <button key={s.id} onClick={() => !locked && pickShow(s)} disabled={locked}
                    style={{ ...card(), opacity: locked ? 0.6 : 1, cursor: locked ? "not-allowed" : "pointer", position: "relative" }}>
                    <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 22, fontWeight: 700 }}>{s.start_time}</div>
                    <div style={{ fontSize: 12.5, color: "#7d8590", marginTop: 4 }}>{s.show_date}</div>
                    <div style={{ fontSize: 12.5, color: "#7d8590" }}>{s.studio_name} · {s.studio_type}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#10b981" }}>{rp(s.price)}</div>
                      {locked && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: STATUS_COLOR[ds] || "#9ca3af", background: (STATUS_COLOR[ds] || "#9ca3af") + "22", borderRadius: 6, padding: "3px 8px", letterSpacing: 1 }}>
                          {STATUS_LABEL[ds] || ds}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
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
                        const heldOther = (seatData.held_by_others || []).includes(seat);
                        const sel = seats.has(seat);
                        const unavail = sold || heldOther;
                        return (
                          <button key={ci} onClick={() => toggleSeat(seat)} disabled={unavail} title={heldOther ? `${seat} · sedang disimpan customer lain` : seat}
                            style={{ width: 30, height: 30, borderRadius: 6, fontSize: 10, fontWeight: 700, fontFamily: "'Geist Mono',monospace",
                              background: sold ? "#ef444433" : heldOther ? "#eab30833" : sel ? "#10b981" : "#1b212c",
                              border: `1px solid ${sold ? "#ef444455" : heldOther ? "#eab30855" : sel ? "#10b981" : "#2a2b30"}`,
                              color: sold ? "#ef4444" : heldOther ? "#eab308" : sel ? "#04130c" : "#7d8590",
                              cursor: unavail ? "not-allowed" : "pointer" }}>{ci + 1}</button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* STEP: bundles (F&B combo picker + contact info) */}
        {step === "bundles" && (
          <>
            <div style={{ background: "#0d1117", border: "1px solid #1b212c", borderRadius: 14, padding: 16, marginBottom: 18 }}>
              <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, color: "#a78bfa", letterSpacing: 1.5, fontWeight: 700, marginBottom: 4 }}>📧 KIRIM E-TIKET (opsional)</div>
              <div style={{ fontSize: 12, color: "#7d8590", marginBottom: 12 }}>
                Isi email / nomor WA untuk menerima tiket digital + QR. Boleh dikosongkan kalau cukup cetak.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="email@contoh.com" style={contactInp} />
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="08xx-xxxx-xxxx (WA)" style={contactInp} />
              </div>
            </div>

            <H>Tambah Combo F&B?</H>
            <div style={{ fontSize: 13, color: "#7d8590", marginTop: -8, marginBottom: 16 }}>
              Pilih combo popcorn / minuman. Bisa ditukar di F&amp;B counter dengan QR tiket. Opsional — boleh dilewati.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
              {bundleCatalog.map(b => {
                const qty = cart[b.id] || 0;
                return (
                  <div key={b.id} style={{ background: "#0d1117", border: `1px solid ${qty ? "#f59e0baa" : "#1b212c"}`, borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>{b.name}</div>
                      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, fontWeight: 700, color: "#10b981" }}>{rp(b.price)}</div>
                    </div>
                    {b.description && <div style={{ fontSize: 12, color: "#7d8590", lineHeight: 1.5 }}>{b.description}</div>}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                      <div style={{ fontSize: 11, color: "#5b6470" }}>{qty > 0 ? `Subtotal · ${rp(qty * b.price)}` : "Belum dipilih"}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button onClick={() => decBundle(b.id)} disabled={!qty} style={stepBtn(qty > 0)}>−</button>
                        <span style={{ fontFamily: "'Geist Mono',monospace", minWidth: 22, textAlign: "center", fontWeight: 700 }}>{qty}</span>
                        <button onClick={() => incBundle(b.id)} style={stepBtn(true)}>+</button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {bundleCatalog.length === 0 && <div style={{ color: "#5b6470", fontSize: 14 }}>Tidak ada combo tersedia.</div>}
            </div>
          </>
        )}

        {/* STEP: done */}
        {step === "done" && done && (
          <div style={{ textAlign: "center", paddingTop: 30 }}>
            <div style={{ fontSize: 60 }}>🎟️</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>Tiket Berhasil Dibeli!</div>
            <div style={{ background: "#0d1117", border: "1px solid #1b212c", borderRadius: 14, padding: 22, margin: "20px auto 0", maxWidth: 440, textAlign: "left" }}>
              <Line k="Film" v={done.film.title} />
              <Line k="Studio" v={`${done.show.studio_name} · ${done.show.studio_type || ""}`} />
              <Line k="Jadwal" v={`${done.show.show_date} ${done.show.start_time}`} />
              <Line k="Kursi" v={done.seats.join(", ")} />
              <Line k="Tiket" v={rp(done.seats_total ?? done.total)} />
              {done.bundles?.length > 0 && (
                <>
                  <div style={{ borderTop: "1px dashed #1b212c", marginTop: 10, paddingTop: 8, fontSize: 11, color: "#f59e0b", letterSpacing: 1, fontFamily: "'Geist Mono',monospace" }}>🍿 F&B COMBO</div>
                  {done.bundles.map(b => (
                    <Line key={b.id} k={`${b.qty}× ${b.bundle_name}`} v={rp((b.qty || 1) * (b.price || 0))} />
                  ))}
                  <Line k="Subtotal F&B" v={rp(done.bundles_total || 0)} />
                </>
              )}
              <div style={{ borderTop: "1px solid #1b212c", marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
                <b>Total</b><b style={{ color: "#10b981", fontFamily: "'Geist Mono',monospace" }}>{rp(done.total)}</b>
              </div>
            </div>
            {done.tickets && done.tickets.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, maxWidth: 480, margin: "18px auto 0" }}>
                {done.tickets.map(t => (
                  <div key={t.id} style={{ background: "#0d1117", border: "1px solid #1b212c", borderRadius: 12, padding: 12, textAlign: "center" }}>
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=6&data=${encodeURIComponent(t.code)}`} alt={t.code} style={{ width: 120, height: 120, background: "#fff", borderRadius: 8 }} />
                    <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 2, marginTop: 6, fontFamily: "'Geist Mono',monospace" }}>{t.code}</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Kursi <b>{t.seat}</b></div>
                  </div>
                ))}
              </div>
            )}
            {done.bundles?.length > 0 && (
              <div style={{ background: "#f59e0b15", border: "1px solid #f59e0b44", borderRadius: 12, padding: "10px 16px", marginTop: 16, fontSize: 12.5, color: "#fbbf24", maxWidth: 480, margin: "16px auto 0" }}>
                🍿 Tunjukkan QR tiket di F&B counter untuk menukar combo.
              </div>
            )}
            {/* Rating block (post-purchase: ask customer to rate the film) */}
            <div style={{ marginTop: 22, background: "#0d1117", border: "1px solid #1b212c", borderRadius: 14, padding: 16, maxWidth: 440, margin: "22px auto 0" }}>
              {rateSent ? (
                <div style={{ textAlign: "center", padding: "10px 0" }}>
                  <div style={{ fontSize: 28, marginBottom: 4 }}>🙏</div>
                  <div style={{ fontSize: 13, color: "#10b981", fontWeight: 700 }}>Terima kasih atas rating-nya!</div>
                </div>
              ) : (
                <>
                  <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: "#fbbf24", letterSpacing: 1.5, fontWeight: 700, marginBottom: 8, textAlign: "center" }}>★ BERI RATING FILM</div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 10 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setRateValue(n)}
                        style={{ background: "transparent", border: "none", fontSize: 30, cursor: "pointer", color: n <= rateValue ? "#fbbf24" : "#3a3a3a", padding: 4, fontFamily: "inherit" }}>★</button>
                    ))}
                  </div>
                  <textarea value={rateComment} onChange={e => setRateComment(e.target.value)}
                    placeholder="Komentar (opsional)…"
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", background: "#0a0e16", border: "1px solid #2a2b30", borderRadius: 8, color: "#fff", fontSize: 12.5, fontFamily: "inherit", resize: "vertical", minHeight: 50, outline: "none" }} />
                  <button onClick={submitRating} disabled={!rateValue}
                    style={{ marginTop: 8, width: "100%", background: rateValue ? "#fbbf24" : "#1b212c", border: "none", borderRadius: 9, padding: "9px 18px", color: rateValue ? "#111" : "#5b6470", fontSize: 12.5, fontWeight: 700, cursor: rateValue ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                    Kirim Rating
                  </button>
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
              <button onClick={printTickets} style={btnGold}>
                🖨️ Cetak {done.bundles?.length > 0 ? "+ Voucher F&B" : "Tiket"}
              </button>
              <button onClick={emailTickets} disabled={sending} style={btnEmail(sending)}>
                {sending ? "Mengirim…" : done.emailSent ? "✅ Email terkirim" : "📧 Kirim Email"}
              </button>
              <button onClick={shareWA} style={btnWA}>
                💬 Kirim via WhatsApp
              </button>
              <button onClick={reset} style={{ background: "#a855f7", border: "none", borderRadius: 12, padding: "14px 26px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Pesan Lagi
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer — seats step */}
      {step === "seats" && seatData && (
        <div style={{ flexShrink: 0, borderTop: "1px solid #161b22", background: "#0a0e16", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, color: "#7d8590" }}>
            <b style={{ color: "#fff", fontSize: 17, fontFamily: "'Geist Mono',monospace" }}>{seats.size}</b> kursi
            {seats.size > 0 && <span> · {[...seats].sort().join(", ")}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 18, fontWeight: 700, color: "#10b981" }}>{rp(seats.size * price)}</div>
            <button onClick={goBundles} disabled={!seats.size}
              style={{ background: seats.size ? "#10b981" : "#1b212c", border: "none", borderRadius: 12, padding: "13px 28px",
                color: seats.size ? "#04130c" : "#5b6470", fontSize: 15, fontWeight: 700, cursor: seats.size ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
              {bundleCatalog.length > 0 ? "Lanjut → F&B" : "Beli Tiket"}
            </button>
          </div>
        </div>
      )}

      <DelightPopup
        show={showDelight && step === "done"}
        emoji="🎉"
        title="Tiket Siap!"
        sub={`Selamat menonton ${done?.film?.title || ""}! Tunjukkan QR di pintu studio.`}
        accent="#10b981"
        onClose={() => setShowDelight(false)}
      />

      {/* Footer — bundles step */}
      {step === "bundles" && (
        <div style={{ flexShrink: 0, borderTop: "1px solid #161b22", background: "#0a0e16", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: "#7d8590" }}>
            <div>Tiket <b style={{ color: "#fff" }}>{rp(seatsTotal)}</b> · F&amp;B <b style={{ color: "#fff" }}>{rp(bundlesTotal)}</b></div>
            <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 17, fontWeight: 700, color: "#10b981", marginTop: 2 }}>Total {rp(grandTotal)}</div>
            {holdRemaining > 0 && (
              <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: holdRemaining < 60 ? "#ef4444" : "#fbbf24", marginTop: 4, letterSpacing: 1 }}>
                ⏱ Kursi disimpan {String(Math.floor(holdRemaining / 60)).padStart(2, "0")}:{String(holdRemaining % 60).padStart(2, "0")}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => buy([])} style={{ background: "#1b212c", border: "1px solid #2a2b30", borderRadius: 12, padding: "12px 22px", color: "#9ca3af", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Lewati F&amp;B
            </button>
            <button onClick={() => buy(cartItems)}
              style={{ background: "#10b981", border: "none", borderRadius: 12, padding: "13px 28px", color: "#04130c", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Bayar {rp(grandTotal)}
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
function stepBtn(active) {
  return {
    width: 30, height: 30, borderRadius: 8, fontSize: 16, fontWeight: 800, fontFamily: "inherit",
    background: active ? "#f59e0b22" : "#1b212c", border: `1px solid ${active ? "#f59e0b88" : "#2a2b30"}`,
    color: active ? "#fbbf24" : "#5b6470", cursor: active ? "pointer" : "not-allowed",
  };
}
const contactInp = {
  background: "#0a0e16", border: "1px solid #2a2b30", borderRadius: 9,
  padding: "11px 13px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%",
};
const btnGold  = { background: "#f59e0b", border: "none", borderRadius: 12, padding: "14px 22px", color: "#111", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };
const btnWA    = { background: "#25D366", border: "none", borderRadius: 12, padding: "14px 22px", color: "#04130c", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };
const btnEmail = (busy) => ({ background: busy ? "#1b212c" : "#22d3ee", border: "none", borderRadius: 12, padding: "14px 22px", color: busy ? "#9ca3af" : "#04130c", fontSize: 13, fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" });
