import { useState, useEffect } from "react";
import DelightPopup from "./components/DelightPopup.jsx";

// CinemaKiosk — customer-facing cinema ticket flow.
// films → showtimes → seats → F&B bundles → confirmation. Uses /api/cinema/*.
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const BG = "#050810";
// Cinematic gradient + radial mesh (amber + purple over deep black)
const BG_GRADIENT = "linear-gradient(160deg, #050810 0%, #0c0f1a 50%, #08090f 100%)";
const BG_MESH = "radial-gradient(800px 600px at 20% 10%, rgba(168,85,247,0.06), transparent 70%), radial-gradient(600px 400px at 80% 80%, rgba(245,158,11,0.05), transparent 70%)";
const STATUS_LABEL = { scheduled: "", running: "Berlangsung", closed: "Tutup", sold_out: "Sold Out", cancelled: "Batal" };
const STATUS_COLOR = { running: "#f59e0b", closed: "#6b7280", sold_out: "#ef4444", cancelled: "#dc2626" };
// LSF Indonesia age classification
const RATING_COLOR = { "SU": "#10b981", "13+": "#22d3ee", "17+": "#f59e0b", "D21": "#ef4444", "21+": "#ef4444" };
const RATING_LABEL = { "SU": "Semua Umur", "13+": "13 tahun ke atas", "17+": "17 tahun ke atas", "D21": "Dewasa 21+", "21+": "Dewasa 21+" };
const RESTRICTED_RATINGS = ["17+", "21+", "D21"];

export default function CinemaKiosk({ apiBase }) {
  const [step, setStep] = useState("films");
  const [films, setFilms] = useState([]);
  const [showtimes, setShowtimes] = useState([]);
  const [film, setFilm] = useState(null);
  const [show, setShow] = useState(null);
  const [seatData, setSeatData] = useState(null);
  const [seats, setSeats] = useState(new Set());
  const [bundleCatalog, setBundleCatalog] = useState([]);
  const [suggestedCombos, setSuggestedCombos] = useState([]);  // genre-based recommendation
  const [cart, setCart] = useState({});  // { [bundle_id]: qty }
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(null);  // {promo, discount, ...}
  const [promoMsg, setPromoMsg] = useState("");
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
  const [ageGate, setAgeGate] = useState(null);  // film pending age confirm
  const pickFilm = (f) => {
    setMsg("");
    // Lazy-fetch suggested combos based on film genre
    fetch(`${base}/films/${f.id}/suggested-combos`).then(r => r.json()).then(d => setSuggestedCombos(d.combos || [])).catch(() => setSuggestedCombos([]));
    if (RESTRICTED_RATINGS.includes(f.rating)) {
      setAgeGate(f); return;
    }
    setFilm(f); setStep("showtimes");
  };
  const confirmAgeGate = () => {
    const f = ageGate; setAgeGate(null);
    if (f) { setFilm(f); setStep("showtimes"); }
  };

  // Promo code apply (validates at backend, returns discount)
  const grandSubtotal = () => seats.size * (show?.price || 0) + Object.entries(cart).reduce((a, [id, qty]) => {
    const b = bundleCatalog.find(x => x.id === parseInt(id, 10));
    return a + (b ? b.price * qty : 0);
  }, 0);
  async function applyPromo() {
    const code = promoCode.trim();
    if (!code) return;
    setPromoMsg(""); setPromoApplied(null);
    try {
      const r = await fetch(`${base}/promotions/apply`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, subtotal: grandSubtotal(), film_id: show?.film_id }),
      });
      const d = await r.json();
      if (!d.ok) { setPromoMsg("⚠ " + (d.error || "Promo tidak valid")); return; }
      setPromoApplied(d);
      setPromoMsg(`✅ Hemat ${rp(d.discount)} dengan kode ${code.toUpperCase()}`);
    } catch (e) { setPromoMsg("⚠ Koneksi gagal"); }
  }
  function clearPromo() { setPromoApplied(null); setPromoCode(""); setPromoMsg(""); }
  const cancelAgeGate = () => setAgeGate(null);
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
    <div style={{ position: "fixed", inset: 0, background: BG_GRADIENT, color: "#e6edf3", fontFamily: "'Inter',sans-serif", overflowY: "auto", display: "flex", flexDirection: "column" }}>
      {/* Radial mesh overlay (cinematic depth) */}
      <div aria-hidden style={{ position: "fixed", inset: 0, background: BG_MESH, pointerEvents: "none", zIndex: 0 }} />
      <style>{`
        @keyframes karyaKioskFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .karya-film-card { transition: transform 0.22s cubic-bezier(.2,.7,.3,1), box-shadow 0.22s ease, border-color 0.2s ease; }
        .karya-film-card:hover { transform: translateY(-4px) scale(1.015); box-shadow: 0 4px 12px rgba(0,0,0,0.6), 0 20px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(168,85,247,0.25), inset 0 1px 0 rgba(255,255,255,0.06) !important; border-color: rgba(255,255,255,0.12) !important; }
        .karya-show-pill { transition: transform 0.18s ease, border-color 0.2s ease, box-shadow 0.2s ease; }
        .karya-show-pill:hover:not(:disabled) { transform: translateY(-2px); border-color: rgba(245,158,11,0.35) !important; box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(245,158,11,0.2) !important; }
        .karya-bundle-card { transition: transform 0.18s ease, border-color 0.2s ease, box-shadow 0.2s ease; }
        .karya-bundle-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04); }
        .karya-seat-btn { transition: transform 0.12s ease, background 0.15s ease, border-color 0.15s ease; }
        .karya-seat-btn:not(:disabled):hover { transform: scale(1.08); }
        .karya-cta-amber { transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease; }
        .karya-cta-amber:not(:disabled):hover { transform: translateY(-1px); filter: brightness(1.05); box-shadow: 0 8px 24px rgba(245,158,11,0.35), 0 0 0 1px rgba(245,158,11,0.4) !important; }
        .karya-input:focus { border-color: rgba(245,158,11,0.5) !important; box-shadow: 0 0 0 3px rgba(245,158,11,0.15) !important; }
      `}</style>
      {/* Header — glass top bar */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 12, padding: "18px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(8,9,15,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", flexShrink: 0 }}>
        {step !== "films" && step !== "done" && (
          <button onClick={async () => {
            if (step === "bundles") setStep("seats");
            else if (step === "seats") { await releaseHolds(); setStep("showtimes"); }
            else setStep("films");
          }}
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#e6edf3", fontSize: 16, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s ease, border-color 0.15s ease" }}>←</button>
        )}
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 20, fontWeight: 800, letterSpacing: -0.4 }}>🎬 karya<span style={{ color: "#a855f7" }}>OS</span> Cinema</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 10, fontFamily: "'Geist Mono',monospace", letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.45)" }}>
          {["films", "showtimes", "seats", "bundles"].map((s, i) => (
            <span key={s} style={{ color: step === s ? "#a855f7" : "rgba(255,255,255,0.4)", fontWeight: step === s ? 800 : 500 }}>{i > 0 ? " · " : ""}{["Film", "Jadwal", "Kursi", "F&B"][i]}</span>
          ))}
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 1, flex: 1, padding: "24px", maxWidth: 980, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {msg && <div style={{ background: "#ef444415", border: "1px solid #ef444444", borderRadius: 10, padding: "10px 14px", color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>{msg}</div>}

        {/* STEP: films */}
        {step === "films" && (
          <>
            <H>Pilih Film</H>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 }}>
              {films.filter(f => f.status === "now_showing").map(f => (
                <button key={f.id} onClick={() => pickFilm(f)} className="karya-film-card" style={{ ...card(), padding: 0, overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.6), 0 12px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
                  {f.poster_url ? (
                    <img src={f.poster_url} alt={f.title} loading="lazy"
                      style={{ width: "100%", aspectRatio: "2/3", objectFit: "cover", display: "block", background: "#0a0e16" }} />
                  ) : (
                    <div style={{ width: "100%", aspectRatio: "2/3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60, background: "linear-gradient(135deg,#1e1b4b,#0a0e16)" }}>🎞️</div>
                  )}
                  <div style={{ padding: 14 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4, lineHeight: 1.3, letterSpacing: -0.3 }}>{f.title}</div>
                    <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)" }}>{f.genre || "—"} · {f.duration_min || 0} mnt</div>
                    {(f.language || f.subtitle) && (
                      <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)", marginTop: 3, fontFamily: "'Geist Mono',monospace" }}>
                        {f.language && `🗣 ${f.language}`}{f.subtitle && ` · 💬 ${f.subtitle}`}
                      </div>
                    )}
                    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: RATING_COLOR[f.rating] || "#a78bfa", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", border: `1px solid ${(RATING_COLOR[f.rating] || "#a78bfa")}55`, borderRadius: 6, padding: "3px 10px", letterSpacing: 0.5 }}>{f.rating}</span>
                      {f.avg_rating ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24" }}>★ {f.avg_rating} <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>({f.ratings_count})</span></span>
                      ) : null}
                      {f.trailer_url && (
                        <a href={f.trailer_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                           style={{ fontSize: 10, color: "#ef4444", textDecoration: "none", fontWeight: 800, marginLeft: "auto", letterSpacing: 0.5 }}>▶ Trailer</a>
                      )}
                    </div>
                  </div>
                </button>
              ))}
              {films.filter(f => f.status === "now_showing").length === 0 && <div style={{ color: "#5b6470", fontSize: 14 }}>Belum ada film tayang.</div>}
            </div>

            {films.filter(f => f.status === "coming_soon").length > 0 && (
              <>
                <div style={{ marginTop: 36, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>📅 Tayang Segera</div>
                  <span style={{ fontSize: 10, color: "#fbbf24", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", padding: "3px 10px", borderRadius: 6, fontWeight: 800, letterSpacing: 1.5 }}>COMING SOON</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 }}>
                  {films.filter(f => f.status === "coming_soon").map(f => (
                    <div key={f.id} style={{ ...card(), cursor: "default", opacity: 0.85, position: "relative", overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
                      <div style={{ position: "absolute", top: 10, right: 10, fontSize: 9, color: "#fbbf24", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 5, padding: "3px 8px", fontWeight: 800, letterSpacing: 1.5 }}>SEGERA</div>
                      <div style={{ fontSize: 38, marginBottom: 8, filter: "grayscale(0.3)" }}>🎞️</div>
                      <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.3 }}>{f.title}</div>
                      <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{f.genre || "—"} · {f.duration_min || 0} mnt · {f.rating}</div>
                      {f.synopsis && <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)", marginTop: 8, lineHeight: 1.45, maxHeight: 56, overflow: "hidden" }}>{f.synopsis}</div>}
                      {f.license_start && <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 8, fontWeight: 700 }}>📅 Mulai {f.license_start}</div>}
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
                  <button key={s.id} onClick={() => !locked && pickShow(s)} disabled={locked} className={locked ? undefined : "karya-show-pill"}
                    style={{ ...card(), opacity: locked ? 0.55 : 1, cursor: locked ? "not-allowed" : "pointer", position: "relative", boxShadow: locked ? "none" : "0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>{s.start_time}</div>
                      <span style={{ fontSize: 10, fontWeight: 800, color: "#a78bfa", background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 5, padding: "3px 8px", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace" }}>{s.format || "2D"}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>{s.show_date}</div>
                    <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)" }}>{s.studio_name} · {s.studio_type}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#10b981", fontFamily: "'Geist Mono',monospace", letterSpacing: -0.3 }}>{rp(s.price)}</div>
                      {locked && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: STATUS_COLOR[ds] || "#9ca3af", background: (STATUS_COLOR[ds] || "#9ca3af") + "22", border: `1px solid ${(STATUS_COLOR[ds] || "#9ca3af")}55`, borderRadius: 6, padding: "3px 8px", letterSpacing: 1 }}>
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
            <div style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "22px 16px", overflowX: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
              <div style={{ textAlign: "center", marginBottom: 18 }}>
                <div style={{ height: 5, background: "linear-gradient(90deg,transparent,#a855f7,transparent)", borderRadius: 4, marginBottom: 6, boxShadow: "0 0 24px rgba(168,85,247,0.5)" }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 6, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase", fontWeight: 700 }}>L A Y A R</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, alignItems: "center" }}>
                {Array.from({ length: seatData.rows }).map((_, ri) => {
                  const letter = String.fromCharCode(65 + ri);
                  return (
                    <div key={ri} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ width: 18, fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{letter}</span>
                      {Array.from({ length: seatData.cols }).map((_, ci) => {
                        const seat = `${letter}${ci + 1}`;
                        const sold = seatData.sold.includes(seat);
                        const heldOther = (seatData.held_by_others || []).includes(seat);
                        const sel = seats.has(seat);
                        const unavail = sold || heldOther;
                        return (
                          <button key={ci} onClick={() => toggleSeat(seat)} disabled={unavail} title={heldOther ? `${seat} · sedang disimpan customer lain` : seat}
                            className="karya-seat-btn"
                            style={{ width: 30, height: 30, borderRadius: 8, fontSize: 10, fontWeight: 800, fontFamily: "'Geist Mono',monospace",
                              background: sold ? "rgba(239,68,68,0.18)" : heldOther ? "rgba(234,179,8,0.18)" : sel ? "linear-gradient(135deg,#f59e0b,#fbbf24)" : "rgba(255,255,255,0.04)",
                              border: `1px solid ${sold ? "rgba(239,68,68,0.3)" : heldOther ? "rgba(234,179,8,0.35)" : sel ? "rgba(245,158,11,0.5)" : "rgba(255,255,255,0.08)"}`,
                              color: sold ? "#ef4444" : heldOther ? "#eab308" : sel ? "#111" : "rgba(255,255,255,0.55)",
                              boxShadow: sel ? "0 0 0 1px rgba(245,158,11,0.4), 0 6px 18px rgba(245,158,11,0.25)" : "none",
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
            <div style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 18, marginBottom: 18, boxShadow: "0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
              <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, color: "#a78bfa", letterSpacing: 2, textTransform: "uppercase", fontWeight: 800, marginBottom: 4 }}>📧 KIRIM E-TIKET (opsional)</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 12 }}>
                Isi email / nomor WA untuk menerima tiket digital + QR. Boleh dikosongkan kalau cukup cetak.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="email@contoh.com" className="karya-input" style={contactInp} />
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="08xx-xxxx-xxxx (WA)" className="karya-input" style={contactInp} />
              </div>
            </div>

            {/* Genre-based combo suggestion */}
            {suggestedCombos.length > 0 && (
              <div style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(236,72,153,0.08) 100%)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 16, padding: 16, marginBottom: 18, boxShadow: "0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
                <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, color: "#fbbf24", letterSpacing: 2, textTransform: "uppercase", fontWeight: 800, marginBottom: 10 }}>
                  ✨ DIREKOMENDASIKAN UNTUK {film?.genre?.toUpperCase() || "FILM INI"}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {suggestedCombos.map(b => {
                    const inCart = cart[b.id] > 0;
                    return (
                      <button key={b.id} onClick={() => incBundle(b.id)} className="karya-show-pill"
                        style={{ background: inCart ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.03)", border: `1px solid ${inCart ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 12, fontFamily: "inherit", cursor: "pointer", textAlign: "left" }}>
                        <div style={{ fontWeight: 800, letterSpacing: -0.2 }}>{inCart ? "✓ " : "+ "}{b.name}</div>
                        <div style={{ fontSize: 11, color: "#10b981", fontFamily: "'Geist Mono',monospace", marginTop: 2, fontWeight: 700 }}>{rp(b.price)}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <H>Tambah Combo F&B?</H>
            <div style={{ fontSize: 13, color: "#7d8590", marginTop: -8, marginBottom: 16 }}>
              Pilih combo popcorn / minuman. Bisa ditukar di F&amp;B counter dengan QR tiket. Opsional — boleh dilewati.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
              {bundleCatalog.map(b => {
                const qty = cart[b.id] || 0;
                return (
                  <div key={b.id} className="karya-bundle-card" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))", border: `1px solid ${qty ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.06)"}`, borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 8, boxShadow: qty ? "0 8px 24px rgba(245,158,11,0.15), inset 0 1px 0 rgba(255,255,255,0.05)" : "0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, flex: 1, letterSpacing: -0.3 }}>{b.name}</div>
                      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, fontWeight: 800, color: "#10b981" }}>{rp(b.price)}</div>
                    </div>
                    {b.description && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>{b.description}</div>}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{qty > 0 ? `Subtotal · ${rp(qty * b.price)}` : "Belum dipilih"}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button onClick={() => decBundle(b.id)} disabled={!qty} style={stepBtn(qty > 0)}>−</button>
                        <span style={{ fontFamily: "'Geist Mono',monospace", minWidth: 22, textAlign: "center", fontWeight: 800 }}>{qty}</span>
                        <button onClick={() => incBundle(b.id)} style={stepBtn(true)}>+</button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {bundleCatalog.length === 0 && <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>Tidak ada combo tersedia.</div>}
            </div>

            {/* Promo code */}
            <div style={{ marginTop: 22, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 16, boxShadow: "0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
              <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, color: "#fbbf24", letterSpacing: 2, textTransform: "uppercase", fontWeight: 800, marginBottom: 10 }}>🎁 PUNYA KODE PROMO?</div>
              {promoApplied ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.35)", borderRadius: 12, padding: "12px 14px" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#10b981" }}>✓ {promoApplied.promo.name}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>Hemat <b style={{ color: "#10b981", fontFamily: "'Geist Mono',monospace" }}>{rp(promoApplied.discount)}</b></div>
                  </div>
                  <button onClick={clearPromo} style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.4)", color: "#fca5a5", padding: "6px 12px", borderRadius: 8, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>× Lepas</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())} placeholder="Mis: BCA20" className="karya-input"
                    style={{ flex: 1, padding: "11px 13px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#fff", fontSize: 13, fontFamily: "'Geist Mono',monospace", letterSpacing: 2, outline: "none", boxSizing: "border-box", transition: "border-color 0.15s ease, box-shadow 0.15s ease" }} />
                  <button onClick={applyPromo} disabled={!promoCode.trim()} className={promoCode.trim() ? "karya-cta-amber" : undefined}
                    style={{ background: promoCode.trim() ? "linear-gradient(135deg,#f59e0b,#fbbf24)" : "rgba(255,255,255,0.05)", border: "none", borderRadius: 10, padding: "10px 22px", color: promoCode.trim() ? "#111" : "rgba(255,255,255,0.35)", fontSize: 13, fontWeight: 800, cursor: promoCode.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", boxShadow: promoCode.trim() ? "0 4px 12px rgba(245,158,11,0.3), inset 0 1px 0 rgba(255,255,255,0.2)" : "none", letterSpacing: 0.3 }}>
                    Apply
                  </button>
                </div>
              )}
              {promoMsg && <div style={{ marginTop: 8, fontSize: 12, color: promoApplied ? "#10b981" : "#fca5a5" }}>{promoMsg}</div>}
            </div>
          </>
        )}

        {/* STEP: done */}
        {step === "done" && done && (
          <div style={{ textAlign: "center", paddingTop: 30, animation: "karyaKioskFadeUp 0.5s ease-out" }}>
            <div style={{ fontSize: 60 }}>🎟️</div>
            <div style={{ fontSize: 26, fontWeight: 900, marginTop: 8, letterSpacing: -0.6 }}>Tiket Berhasil Dibeli!</div>
            <div style={{ position: "relative", background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 24, margin: "20px auto 0", maxWidth: 460, textAlign: "left", overflow: "hidden", boxShadow: "0 16px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
              <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(400px 200px at 50% 0%, rgba(245,158,11,0.08), transparent 70%)", pointerEvents: "none" }} />
              <div style={{ position: "relative" }}>
                <Line k="Film" v={done.film.title} />
                <Line k="Studio" v={`${done.show.studio_name} · ${done.show.studio_type || ""}`} />
                <Line k="Jadwal" v={`${done.show.show_date} ${done.show.start_time}`} />
                <Line k="Kursi" v={done.seats.join(", ")} />
                <Line k="Tiket" v={rp(done.seats_total ?? done.total)} />
                {done.bundles?.length > 0 && (
                  <>
                    <div style={{ borderTop: "1px dashed rgba(255,255,255,0.08)", marginTop: 12, paddingTop: 10, fontSize: 10, color: "#f59e0b", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase", fontWeight: 800 }}>🍿 F&B COMBO</div>
                    {done.bundles.map(b => (
                      <Line key={b.id} k={`${b.qty}× ${b.bundle_name}`} v={rp((b.qty || 1) * (b.price || 0))} />
                    ))}
                    <Line k="Subtotal F&B" v={rp(done.bundles_total || 0)} />
                  </>
                )}
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 12, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <b style={{ fontSize: 14, letterSpacing: -0.3 }}>Total</b><b style={{ color: "#10b981", fontFamily: "'Geist Mono',monospace", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>{rp(done.total)}</b>
                </div>
              </div>
            </div>
            {done.tickets && done.tickets.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, maxWidth: 480, margin: "18px auto 0" }}>
                {done.tickets.map(t => (
                  <div key={t.id} style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.005))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 14, textAlign: "center", boxShadow: "0 8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=6&data=${encodeURIComponent(t.code)}`} alt={t.code} style={{ width: 120, height: 120, background: "#fff", borderRadius: 8 }} />
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", letterSpacing: 2, marginTop: 6, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{t.code}</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Kursi <b style={{ letterSpacing: -0.3 }}>{t.seat}</b></div>
                  </div>
                ))}
              </div>
            )}
            {done.bundles?.length > 0 && (
              <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12, padding: "10px 16px", marginTop: 16, fontSize: 12.5, color: "#fbbf24", maxWidth: 480, margin: "16px auto 0", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
                🍿 Tunjukkan QR tiket di F&B counter untuk menukar combo.
              </div>
            )}
            {/* Rating block (post-purchase: ask customer to rate the film) */}
            <div style={{ marginTop: 22, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 18, maxWidth: 440, margin: "22px auto 0", boxShadow: "0 8px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
              {rateSent ? (
                <div style={{ textAlign: "center", padding: "10px 0" }}>
                  <div style={{ fontSize: 32, marginBottom: 6, filter: "drop-shadow(0 0 16px rgba(251,191,36,0.45))" }}>✨</div>
                  <div style={{ fontSize: 13, color: "#fbbf24", fontWeight: 700, letterSpacing: 0.3 }}>Terima kasih atas rating Anda</div>
                </div>
              ) : (
                <>
                  <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, color: "#fbbf24", letterSpacing: 2, textTransform: "uppercase", fontWeight: 800, marginBottom: 10, textAlign: "center" }}>★ BERI RATING FILM</div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 10 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setRateValue(n)}
                        style={{ background: "transparent", border: "none", fontSize: 32, cursor: "pointer", color: n <= rateValue ? "#fbbf24" : "rgba(255,255,255,0.15)", padding: 4, fontFamily: "inherit", transition: "transform 0.15s ease, color 0.15s ease", textShadow: n <= rateValue ? "0 0 16px rgba(251,191,36,0.5)" : "none" }}>★</button>
                    ))}
                  </div>
                  <textarea value={rateComment} onChange={e => setRateComment(e.target.value)}
                    placeholder="Komentar (opsional)…" className="karya-input"
                    style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#fff", fontSize: 12.5, fontFamily: "inherit", resize: "vertical", minHeight: 60, outline: "none", transition: "border-color 0.15s ease, box-shadow 0.15s ease" }} />
                  <button onClick={submitRating} disabled={!rateValue} className={rateValue ? "karya-cta-amber" : undefined}
                    style={{ marginTop: 10, width: "100%", background: rateValue ? "linear-gradient(135deg,#f59e0b,#fbbf24)" : "rgba(255,255,255,0.04)", border: "none", borderRadius: 10, padding: "11px 18px", color: rateValue ? "#111" : "rgba(255,255,255,0.35)", fontSize: 12.5, fontWeight: 800, cursor: rateValue ? "pointer" : "not-allowed", fontFamily: "inherit", boxShadow: rateValue ? "0 4px 12px rgba(245,158,11,0.3), inset 0 1px 0 rgba(255,255,255,0.2)" : "none", letterSpacing: 0.3 }}>
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
              <button onClick={reset} style={{ background: "linear-gradient(135deg,#a855f7,#c084fc)", border: "none", borderRadius: 12, padding: "14px 26px", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 12px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.2)", letterSpacing: 0.3, transition: "transform 0.15s ease, filter 0.15s ease" }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.filter = "brightness(1.08)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.filter = "none"; }}>
                Pesan Lagi
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer — seats step */}
      {step === "seats" && seatData && (
        <div style={{ position: "relative", zIndex: 1, flexShrink: 0, borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(8,9,15,0.78)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
            <b style={{ color: "#fff", fontSize: 18, fontFamily: "'Geist Mono',monospace", letterSpacing: -0.3 }}>{seats.size}</b> kursi
            {seats.size > 0 && <span> · {[...seats].sort().join(", ")}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 20, fontWeight: 800, color: "#10b981", letterSpacing: -0.5 }}>{rp(seats.size * price)}</div>
            <button onClick={goBundles} disabled={!seats.size}
              style={{ background: seats.size ? "linear-gradient(135deg,#10b981,#34d399)" : "rgba(255,255,255,0.05)", border: "none", borderRadius: 12, padding: "13px 28px",
                color: seats.size ? "#04130c" : "rgba(255,255,255,0.3)", fontSize: 15, fontWeight: 800, cursor: seats.size ? "pointer" : "not-allowed", fontFamily: "inherit", boxShadow: seats.size ? "0 4px 12px rgba(16,185,129,0.3), inset 0 1px 0 rgba(255,255,255,0.2)" : "none", letterSpacing: 0.3, transition: "transform 0.15s ease, filter 0.15s ease" }}
              onMouseEnter={(e) => { if (seats.size) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.filter = "brightness(1.08)"; } }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.filter = "none"; }}>
              {bundleCatalog.length > 0 ? "Lanjut → F&B" : "Beli Tiket"}
            </button>
          </div>
        </div>
      )}

      {/* Age verification gate (LSF Indonesia: 17+ / D21 / 21+) */}
      {ageGate && (
        <div onClick={cancelAgeGate} style={{
          position: "fixed", inset: 0, background: "rgba(5,8,16,0.78)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", zIndex: 99998,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "karyaKioskFadeUp 0.25s ease-out",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "linear-gradient(180deg, rgba(20,22,30,0.95), rgba(13,15,22,0.95))",
            border: `1px solid ${(RATING_COLOR[ageGate.rating] || "#ef4444")}55`, borderRadius: 20,
            padding: "28px 30px", maxWidth: 440, textAlign: "center", color: "#fff",
            boxShadow: `0 24px 64px rgba(0,0,0,0.6), 0 0 64px ${(RATING_COLOR[ageGate.rating] || "#ef4444")}33, inset 0 1px 0 rgba(255,255,255,0.06)`,
            backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          }}>
            {/* Amber accent banner */}
            <div style={{ height: 3, background: `linear-gradient(90deg, transparent, ${RATING_COLOR[ageGate.rating] || "#ef4444"}, transparent)`, marginBottom: 14, borderRadius: 2, boxShadow: `0 0 16px ${(RATING_COLOR[ageGate.rating] || "#ef4444")}66` }} />
            <div style={{ fontSize: 70, marginBottom: 6 }}>🔞</div>
            <div style={{
              display: "inline-block", fontSize: 22, fontWeight: 900, letterSpacing: -0.4,
              color: RATING_COLOR[ageGate.rating] || "#ef4444",
              background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
              border: `1px solid ${(RATING_COLOR[ageGate.rating] || "#ef4444")}55`,
              borderRadius: 12, padding: "8px 22px", marginBottom: 14,
            }}>{ageGate.rating}</div>
            <div style={{ fontSize: 19, fontWeight: 900, marginBottom: 6, letterSpacing: -0.5 }}>Konfirmasi Usia</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.55, marginBottom: 20 }}>
              Film <b style={{ color: "#fff" }}>{ageGate.title}</b> klasifikasi <b style={{ color: RATING_COLOR[ageGate.rating] }}>{RATING_LABEL[ageGate.rating]}</b> menurut LSF (Lembaga Sensor Film).
              Pastikan usia Anda sesuai sebelum melanjutkan pembelian.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={cancelAgeGate} style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.65)", padding: "12px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Batal</button>
              <button onClick={confirmAgeGate} style={{ flex: 2, background: RATING_COLOR[ageGate.rating] || "#ef4444", border: "none", color: "#fff", padding: "12px 18px", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", boxShadow: `0 4px 12px ${(RATING_COLOR[ageGate.rating] || "#ef4444")}55, inset 0 1px 0 rgba(255,255,255,0.2)`, letterSpacing: 0.3 }}>
                ✓ Usia saya cukup
              </button>
            </div>
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
        <div style={{ position: "relative", zIndex: 1, flexShrink: 0, borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(8,9,15,0.78)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
            <div>Tiket <b style={{ color: "#fff" }}>{rp(seatsTotal)}</b> · F&amp;B <b style={{ color: "#fff" }}>{rp(bundlesTotal)}</b>{promoApplied ? <> · <span style={{ color: "#fbbf24" }}>Promo −{rp(promoApplied.discount)}</span></> : null}</div>
            <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 20, fontWeight: 800, color: "#10b981", marginTop: 2, letterSpacing: -0.5 }}>Total {rp(Math.max(0, grandTotal - (promoApplied?.discount || 0)))}</div>
            {holdRemaining > 0 && (
              <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: holdRemaining < 60 ? "#ef4444" : "#fbbf24", marginTop: 4, letterSpacing: 1, fontWeight: 700 }}>
                ⏱ Kursi disimpan {String(Math.floor(holdRemaining / 60)).padStart(2, "0")}:{String(holdRemaining % 60).padStart(2, "0")}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => buy([])} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 22px", color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s ease" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}>
              Lewati F&amp;B
            </button>
            <button onClick={() => buy(cartItems)}
              style={{ background: "linear-gradient(135deg,#10b981,#34d399)", border: "none", borderRadius: 12, padding: "13px 28px", color: "#04130c", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 12px rgba(16,185,129,0.3), inset 0 1px 0 rgba(255,255,255,0.2)", letterSpacing: 0.3, transition: "transform 0.15s ease, filter 0.15s ease" }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.filter = "brightness(1.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.filter = "none"; }}>
              Bayar {rp(Math.max(0, grandTotal - (promoApplied?.discount || 0)))}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function H({ children }) {
  return <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 800, letterSpacing: -0.4, marginBottom: 14, color: "#fff" }}>{children}</div>;
}
function Line({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13, padding: "5px 0" }}>
      <span style={{ color: "rgba(255,255,255,0.55)" }}>{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );
}
function card() {
  return {
    background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))",
    border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 18,
    cursor: "pointer", textAlign: "left", color: "#e6edf3", fontFamily: "inherit", width: "100%",
  };
}
function stepBtn(active) {
  return {
    width: 32, height: 32, borderRadius: 9, fontSize: 16, fontWeight: 800, fontFamily: "inherit",
    background: active ? "rgba(245,158,11,0.14)" : "rgba(255,255,255,0.04)", border: `1px solid ${active ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.08)"}`,
    color: active ? "#fbbf24" : "rgba(255,255,255,0.35)", cursor: active ? "pointer" : "not-allowed",
    boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,0.05)" : "none",
    transition: "background 0.15s ease, transform 0.12s ease",
  };
}
const contactInp = {
  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
  padding: "11px 13px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%",
  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
};
const btnGold  = { background: "linear-gradient(135deg,#f59e0b,#fbbf24)", border: "none", borderRadius: 12, padding: "14px 22px", color: "#111", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 12px rgba(245,158,11,0.3), inset 0 1px 0 rgba(255,255,255,0.2)", letterSpacing: 0.3, transition: "transform 0.15s ease, filter 0.15s ease" };
const btnWA    = { background: "linear-gradient(135deg,#25D366,#34de7a)", border: "none", borderRadius: 12, padding: "14px 22px", color: "#04130c", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 12px rgba(37,211,102,0.3), inset 0 1px 0 rgba(255,255,255,0.2)", letterSpacing: 0.3, transition: "transform 0.15s ease, filter 0.15s ease" };
const btnEmail = (busy) => ({ background: busy ? "rgba(255,255,255,0.04)" : "linear-gradient(135deg,#22d3ee,#67e8f9)", border: "none", borderRadius: 12, padding: "14px 22px", color: busy ? "rgba(255,255,255,0.35)" : "#04130c", fontSize: 13, fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: busy ? "none" : "0 4px 12px rgba(34,211,238,0.3), inset 0 1px 0 rgba(255,255,255,0.2)", letterSpacing: 0.3, transition: "transform 0.15s ease, filter 0.15s ease" });
