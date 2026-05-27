import { useState, useEffect, useRef, useMemo } from "react";
import DelightPopup from "./components/DelightPopup.jsx";
import MarqueeTicker from "./components/MarqueeTicker.jsx";
import CinemaCelebration from "./CinemaCelebration.jsx";
import { ErrorInline } from "./components/ConnectionError.jsx";
import { useT, LocaleSwitcher } from "./i18n";

// CinemaKiosk — customer-facing cinema ticket flow.
// films → showtimes → seats → F&B bundles → confirmation. Uses /api/cinema/*.
import { fmtMoney as rp } from "./lib/currency.js";
const BG = "#050810";
// Cinematic gradient + radial mesh (amber + purple over deep black)
const BG_GRADIENT = "linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)";
const BG_MESH = "radial-gradient(800px 600px at 20% 10%, rgba(168,85,247,0.06), transparent 70%), radial-gradient(600px 400px at 80% 80%, rgba(245,158,11,0.05), transparent 70%)";
const STATUS_LABEL = { scheduled: "", running: "Berlangsung", closed: "Close", sold_out: "Sold Out", cancelled: "Cancel" };
const STATUS_COLOR = { running: "#f59e0b", closed: "#6b7280", sold_out: "#ef4444", cancelled: "#dc2626" };
// LSF Indonesia age classification
const RATING_COLOR = { "SU": "#10b981", "13+": "#22d3ee", "17+": "#f59e0b", "D21": "#ef4444", "21+": "#ef4444" };
const RATING_LABEL = { "SU": "Semua Umur", "13+": "13 tahun ke atas", "17+": "17 tahun ke atas", "D21": "Dewasa 21+", "21+": "Dewasa 21+" };
const RESTRICTED_RATINGS = ["17+", "21+", "D21"];

export default function CinemaKiosk({ apiBase }) {
  const t = useT();
  // Outlet context — kiosk di outlet A liat jadwal & harga outlet A
  // URL: ?cinema&outlet=JKT01 (admin set per-kiosk lewat URL config)
  // Persist last selected outlet di localStorage biar refresh gak hilang
  const outletCode = (() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("outlet");
      if (fromUrl) { localStorage.setItem("cinema_kiosk_outlet", fromUrl); return fromUrl; }
      return localStorage.getItem("cinema_kiosk_outlet") || "";
    } catch { return ""; }
  })();
  const [outletInfo, setOutletInfo] = useState(null); // { code, name, area } from /api/outlet-master
  const [autoPromos, setAutoPromos] = useState([]);    // [{id,name,discount_type,discount_value,progress:{unlocked}}]
  // Auto-print state: idle | printing | success | error | unconfigured
  const [printState, setPrintState] = useState("idle");
  const [printMsg, setPrintMsg] = useState("");
  const printTriedRef = useRef(null); // prevent duplicate prints per purchase
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
  // Surface API failures di hero — kiosk customer-facing, blank screen no-no.
  const [loadError, setLoadError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const base = `${apiBase || ""}/api/cinema`;

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    const stUrl = outletCode ? `${base}/showtimes?outlet=${encodeURIComponent(outletCode)}` : `${base}/showtimes`;
    Promise.all([
      fetch(`${base}/films`).then(r => { if (!r.ok) throw new Error(`films ${r.status}`); return r.json(); }),
      fetch(stUrl).then(r => { if (!r.ok) throw new Error(`showtimes ${r.status}`); return r.json(); }),
    ]).then(([f, s]) => {
      if (cancelled) return;
      setFilms(f.films || []);
      setShowtimes(s.showtimes || []);
    }).catch(e => { if (!cancelled) setLoadError(e); });
    // Bundles is enrichment — failure can stay silent (no F&B = OK).
    fetch(`${base}/bundles${outletCode ? `?outlet=${encodeURIComponent(outletCode)}` : ""}`).then(r => r.json()).then(d => setBundleCatalog(d.bundles || [])).catch(() => {});
    return () => { cancelled = true; };
    // Resolve outlet display name dari outlet_master
    if (outletCode) {
      fetch(`${apiBase || ""}/api/outlet-master`)
        .then(r => r.json())
        .then(d => {
          const list = Array.isArray(d) ? d : (d.outlets || d.data || []);
          const found = list.find(o => o.code === outletCode || o.name === outletCode);
          if (found) setOutletInfo({ code: found.code, name: found.name, area: found.area });
          else setOutletInfo({ code: outletCode, name: outletCode, area: "" });
        })
        .catch(() => setOutletInfo({ code: outletCode, name: outletCode, area: "" }));
    }
    // eslint-disable-next-line
  }, [loadAttempt]);

  // ── Auto-trigger promos: poll setiap 30s, unlock kalau omzet/tiket harian capai threshold ──
  useEffect(() => {
    let timer;
    const fetchAuto = () => {
      const u = `${base}/auto-promos${outletCode ? `?outlet=${encodeURIComponent(outletCode)}` : ""}`;
      fetch(u).then(r => r.json()).then(d => setAutoPromos(d.promos || [])).catch(() => {});
    };
    fetchAuto();
    timer = setInterval(fetchAuto, 30000);
    return () => clearInterval(timer);
  }, [base, outletCode]);

  // Best unlocked auto-promo (highest discount among yang sudah ke-unlock)
  const bestAutoPromo = useMemo(() => {
    const unlocked = autoPromos.filter(p => p.progress?.unlocked);
    if (!unlocked.length) return null;
    // Estimate: pick highest discount_value (rough heuristic; final discount dihitung di server)
    return unlocked.slice().sort((a, b) => (b.discount_value || 0) - (a.discount_value || 0))[0];
  }, [autoPromos]);

  // ── AUTO-PRINT thermal ticket saat masuk step 'done' ──
  // Customer tidak perlu pencet tombol — backend langsung kirim ESC/POS ke printer LAN.
  // Anti-duplicate via printTriedRef (per purchase_id).
  useEffect(() => {
    if (step !== "done" || !done?.purchase_id) return;
    if (printTriedRef.current === done.purchase_id) return;
    printTriedRef.current = done.purchase_id;
    setPrintState("printing"); setPrintMsg("Printing ticket…");
    fetch(`${base}/purchases/${encodeURIComponent(done.purchase_id)}/print`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outlet: outletCode || undefined }),
    })
      .then(r => r.json().then(d => ({ status: r.status, d })))
      .then(({ status, d }) => {
        if (d?.ok && d.printed > 0) {
          setPrintState("success");
          setPrintMsg(`Tiket dicetak (${d.printed}/${d.total})`);
        } else if (status === 503) {
          setPrintState("unconfigured");
          setPrintMsg(d?.error || "Printer not configured");
        } else {
          setPrintState("error");
          setPrintMsg(d?.error || "Cetak gagal — minta bantuan staff");
        }
      })
      .catch(e => { setPrintState("error"); setPrintMsg("Cetak gagal — minta bantuan staff"); });
  }, [step, done?.purchase_id, base, outletCode]);

  // ── Customer rating (1-5 stars) on done step ──
  const [showDelight, setShowDelight] = useState(false);
  const [rateValue, setRateValue] = useState(0);
  const [rateComment, setRateComment] = useState("");
  const [rateSent, setRateSent] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false); // Sultan popup after rating
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
      if (d.ok) {
        setRateSent(true);
        // Tampilkan Sultan celebration popup setelah rating dikirim — pakai delay kecil
        // biar customer sempat liat konfirmasi rating dulu
        setTimeout(() => setShowCelebration(true), 600);
      }
    } catch {}
  }

  const reloadSeats = (showtimeId) => {
    return fetch(`${base}/showtimes/${showtimeId}/seats?hold_token=${encodeURIComponent(holdToken)}`)
      .then(r => r.json()).then(d => { if (d && !d.error) setSeatData(d); return d; });
  };
  const [ageGate, setAgeGate] = useState(null);  // film pending age confirm
  const [previewFilm, setPreviewFilm] = useState(null);  // film card click → preview modal with trailer
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

  // Compute discount client-side untuk auto-promo (server-side compute = /promotions/apply,
  // tapi auto-promo gak punya code jadi kita hitung di sini pakai formula yang sama)
  const computeAutoDiscount = (promo, subtotal) => {
    if (!promo || !subtotal) return 0;
    if (promo.min_purchase && subtotal < promo.min_purchase) return 0;
    let d = promo.discount_type === 'percentage'
      ? Math.floor(subtotal * (promo.discount_value || 0) / 100)
      : Math.min(promo.discount_value || 0, subtotal);
    if (promo.max_discount && d > promo.max_discount) d = promo.max_discount;
    return d;
  };

  // Auto-apply best unlocked auto-promo saat masuk step bundles (kalau customer belum entry kode manual)
  useEffect(() => {
    if (step !== "bundles" || !bestAutoPromo || promoApplied) return;
    const subtotal = grandSubtotal();
    if (!subtotal) return;
    if (bestAutoPromo.min_purchase && subtotal < bestAutoPromo.min_purchase) return;
    if (bestAutoPromo.applies_to_film_id && film && bestAutoPromo.applies_to_film_id !== film.id) return;
    const discount = computeAutoDiscount(bestAutoPromo, subtotal);
    if (discount > 0) {
      setPromoApplied({ promo: bestAutoPromo, discount, _auto: true });
      setPromoMsg(`🎉 Discount otomatis aktif — Hemat ${rp(discount)}`);
    }
    // eslint-disable-next-line
  }, [step, bestAutoPromo]);
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
        setMsg("⚠ " + (d.error || "Failed to save seats"));
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
    setPromoCode(""); setPromoApplied(null); setPromoMsg("");
    setPrintState("idle"); setPrintMsg(""); printTriedRef.current = null;
    setShowCelebration(false);
    setAutoResetIn(0);
  };

  // ── Auto-reset countdown setelah transaksi selesai (step='done') ──
  // Kiosk customer-facing: balik ke home buat customer berikutnya
  const AUTO_RESET_SEC = 20;
  const [autoResetIn, setAutoResetIn] = useState(0);
  useEffect(() => {
    if (step !== "done") { setAutoResetIn(0); return; }
    setAutoResetIn(AUTO_RESET_SEC);
    const id = setInterval(() => {
      setAutoResetIn(s => {
        if (s <= 1) { clearInterval(id); reset(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

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
      to = window.prompt("Send ticket to email:", "") || "";
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
          <div><span style="color:#666">Showtime</span> &nbsp;${done.show.show_date} &middot; ${done.show.start_time}</div>
          <div><span style="color:#666">Studio</span> &nbsp;${done.show.studio_name || ''}</div>
          <div><span style="color:#666">Seat</span> &nbsp;<b style="font-size:16px">${t.seat}</b></div>
          <div><span style="color:#666">Price</span> &nbsp;Rp ${(t.price || 0).toLocaleString('id-ID')}</div>
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

  // Kiosk customer view — hanya tampil showtime yang TERSEDIA:
  // - status 'scheduled' (bukan cancelled/ended/closed)
  // - belum lewat waktu mulai (start_time hari ini > now, atau future date)
  // - tidak sold-out (seats_remaining > 0, optional check)
  // Set film_id yang punya minimal 1 showtime available (scheduled, future, ada seat)
  // → dipake buat filter film list: kiosk hanya tampil film yang udah ada jadwalnya
  const filmIdsWithShows = useMemo(() => {
    const now = Date.now();
    const set = new Set();
    for (const sh of showtimes) {
      const status = sh.derived_status || sh.status || "scheduled";
      if (status !== "scheduled") continue;
      try {
        const dt = new Date(`${sh.show_date}T${sh.start_time}`);
        if (dt.getTime() < now - 5 * 60 * 1000) continue;
      } catch {}
      if (sh.seats_remaining != null && sh.seats_remaining <= 0) continue;
      set.add(sh.film_id);
    }
    return set;
  }, [showtimes]);

  const filmShows = showtimes.filter(s => {
    if (!film || s.film_id !== film.id) return false;
    const status = s.derived_status || s.status || "scheduled";
    if (status !== "scheduled") return false;
    // Cek waktu tayang harus future
    try {
      const dt = new Date(`${s.show_date}T${s.start_time}`);
      if (dt.getTime() < Date.now() - 5 * 60 * 1000) return false; // 5 menit grace
    } catch {}
    // Cek seat tersedia (kalau backend kirim)
    if (s.seats_remaining != null && s.seats_remaining <= 0) return false;
    return true;
  });
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
            if (step === "payment") setStep("bundles");
            else if (step === "bundles") setStep("seats");
            else if (step === "seats") { await releaseHolds(); setStep("showtimes"); }
            else setStep("films");
          }}
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#e6edf3", fontSize: 16, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s ease, border-color 0.15s ease" }}>←</button>
        )}
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 20, fontWeight: 800, letterSpacing: -0.4 }}>🎬 karya<span style={{ color: "#a855f7" }}>OS</span> Cinema</div>
        {outletInfo && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px",
            background: "linear-gradient(135deg, rgba(168,85,247,0.15), rgba(168,85,247,0.05))",
            border: "1px solid rgba(168,85,247,0.35)", borderRadius: 999,
            fontSize: 11, fontFamily: "'Geist Mono',monospace", color: "#c084fc",
            fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
            boxShadow: "0 0 16px rgba(168,85,247,0.12)",
          }}>
            📍 {outletInfo.name}{outletInfo.area ? ` · ${outletInfo.area}` : ""}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 10, fontFamily: "'Geist Mono',monospace", letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.45)" }}>
          {["films", "showtimes", "seats", "bundles"].map((s, i) => (
            <span key={s} style={{ color: step === s ? "#a855f7" : "rgba(255,255,255,0.4)", fontWeight: step === s ? 800 : 500 }}>{i > 0 ? " · " : ""}{[t("cinema.choose_film").split(" ").pop(), t("cinema.choose_showtime").split(" ").pop(), t("cinema.choose_seats").split(" ").pop(), "F&B"][i]}</span>
          ))}
        </div>
        <LocaleSwitcher compact style={{ marginLeft: 8 }} />
      </div>

      {/* Text jalan — running ticker (promo/sultan/coming soon/custom message) */}
      <MarqueeTicker surface="kiosk" apiBase={apiBase || ""} variant="dark" speed={55} label="KARYA·LIVE" />

      <div style={{ position: "relative", zIndex: 1, flex: 1, padding: "24px", maxWidth: 1400, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {msg && <div style={{ background: "#ef444415", border: "1px solid #ef444444", borderRadius: 10, padding: "10px 14px", color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>{msg}</div>}

        {/* STEP: films — hanya tampilkan film yang udah ada jadwal aktif */}
        {step === "films" && (
          <>
            {loadError && (
              <ErrorInline
                error={loadError}
                label="Gagal memuat film & jadwal"
                onRetry={() => setLoadAttempt(a => a + 1)}
              />
            )}
            {/* Auto-promo unlocked banner — milestone-based discount */}
            {bestAutoPromo && (
              <AutoPromoBanner promo={bestAutoPromo} />
            )}
            {/* Progress banner untuk auto-promo yang BELUM unlocked — biar customer aware */}
            {!bestAutoPromo && autoPromos.length > 0 && (
              <AutoPromoProgressBanner promos={autoPromos} />
            )}
            <H>{t("cinema.choose_film")}</H>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 }}>
              {films.filter(f => f.status === "now_showing" && filmIdsWithShows.has(f.id)).map(f => (
                <button key={f.id} onClick={() => setPreviewFilm(f)} className="karya-film-card" style={{ ...card(), padding: 0, overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.6), 0 12px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
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
              {films.filter(f => f.status === "now_showing" && filmIdsWithShows.has(f.id)).length === 0 && (
                <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "40px 20px", color: "rgba(255,255,255,0.45)", fontSize: 14, background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 14 }}>
                  <div style={{ fontSize: 38, marginBottom: 8 }}>🎬</div>
                  <div style={{ fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>No showtimes yet</div>
                  <div style={{ fontSize: 12, marginTop: 4, color: "rgba(255,255,255,0.4)" }}>Check back later — admin is preparing the schedule.</div>
                </div>
              )}
            </div>

            {films.filter(f => f.status === "coming_soon").length > 0 && (
              <>
                <div style={{ marginTop: 36, marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginRight: 4 }}>📅 Tayang Segera</div>
                  <span style={{ display: "inline-block", fontSize: 10, color: "#fbbf24", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", padding: "3px 10px", borderRadius: 6, fontWeight: 800, letterSpacing: 1.5 }}>COMING SOON</span>
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
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#a78bfa", background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 5, padding: "3px 8px", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace" }}>{s.format || "2D"}</span>
                        {s.is_subtitled === 1 && (
                          <span title={`Subtitled ${s.subtitle_language || ""}`} style={{ fontSize: 10, fontWeight: 800, color: "#22d3ee", background: "rgba(34,211,238,0.12)", border: "1px solid rgba(34,211,238,0.3)", borderRadius: 5, padding: "3px 6px", letterSpacing: 0.5 }}>📝 SUB</span>
                        )}
                        {s.audio_description === 1 && (
                          <span title="Audio description tersedia" style={{ fontSize: 10, fontWeight: 800, color: "#10b981", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 5, padding: "3px 6px" }}>🔊 AD</span>
                        )}
                      </div>
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
              {filmShows.length === 0 && <div style={{ color: "#5b6470", fontSize: 14 }}>No showtimes for this film yet.</div>}
            </div>
          </>
        )}

        {/* STEP: seats */}
        {step === "seats" && seatData && (
          <>
            <H>{t("cinema.choose_seats")}</H>
            <div style={{ fontSize: 13, color: "#7d8590", marginTop: -8, marginBottom: 16 }}>
              {film.title} · {show.studio_name} · {show.show_date} {show.start_time}
            </div>
            <div style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "22px 16px", overflowX: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
              <div style={{ textAlign: "center", marginBottom: 18 }}>
                <div style={{ height: 5, background: "linear-gradient(90deg,transparent,#a855f7,transparent)", borderRadius: 4, marginBottom: 6, boxShadow: "0 0 24px rgba(168,85,247,0.5)" }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 6, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase", fontWeight: 700 }}>L A Y A R</span>
              </div>
              <SeatGrid
                seatData={seatData}
                seats={seats}
                onToggle={toggleSeat}
              />
              {seatData.seat_type_prices && (
                <div style={{ marginTop: 14, padding: "10px 12px", background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.15)", borderRadius: 10, display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", fontSize: 11, fontFamily: "'Geist Mono',monospace" }}>
                  {Object.entries(seatData.seat_type_prices).map(([type, price]) => (
                    <span key={type} style={{ color: SEAT_COLOR[type] || "#10b981" }}>
                      {SEAT_EMOJI[type] || "💺"} {type.toUpperCase()} <b>Rp {Math.round(price/1000)}rb</b>
                    </span>
                  ))}
                </div>
              )}
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
                    {b.description && <div style={{ fontSize: 12.5, color: "#cbd5e1", lineHeight: 1.55, marginTop: 2 }}>{b.description}</div>}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{qty > 0 ? `Subtotal · ${rp(qty * b.price)}` : "Not selected"}</div>
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

            {/* Promo code (atau auto-promo yang udah ke-apply) */}
            <div style={{ marginTop: 22, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 16, boxShadow: "0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
              <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, color: "#fbbf24", letterSpacing: 2, textTransform: "uppercase", fontWeight: 800, marginBottom: 10 }}>
                {promoApplied?._auto ? "🎉 DISKON OTOMATIS" : "🎁 PUNYA KODE PROMO?"}
              </div>
              {promoApplied ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: promoApplied._auto ? "rgba(245,158,11,0.12)" : "rgba(16,185,129,0.1)", border: `1px solid ${promoApplied._auto ? "rgba(245,158,11,0.4)" : "rgba(16,185,129,0.35)"}`, borderRadius: 12, padding: "12px 14px" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: promoApplied._auto ? "#fbbf24" : "#10b981" }}>
                      {promoApplied._auto ? "🎉 " : "✓ "}{promoApplied.promo.name}
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>Hemat <b style={{ color: promoApplied._auto ? "#fbbf24" : "#10b981", fontFamily: "'Geist Mono',monospace" }}>{rp(promoApplied.discount)}</b></div>
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

        {/* STEP: payment — QRIS self-checkout (no more Bayar di Kasir loophole) */}
        {step === "payment" && (
          <CinemaQRISPayment
            film={film} show={show} seats={seats} cartItems={cartItems}
            total={Math.max(0, grandTotal - (promoApplied?.discount || 0))}
            base={base} buy={buy} msg={msg} setMsg={setMsg}
            onBack={() => setStep("bundles")} />
        )}

        {/* STEP: done */}
        {step === "done" && done && (
          <div style={{ textAlign: "center", paddingTop: 30, animation: "karyaKioskFadeUp 0.5s ease-out" }}>
            <div style={{ fontSize: 60 }}>🎟️</div>
            <div style={{ fontSize: 26, fontWeight: 900, marginTop: 8, letterSpacing: -0.6 }}>Ticket Purchased Successfully!</div>
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
                  <button onClick={() => setShowCelebration(true)}
                    style={{ marginTop: 12, background: "linear-gradient(135deg,#a855f7,#c084fc)", border: "none", borderRadius: 10, padding: "9px 18px", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 12px rgba(168,85,247,0.3), inset 0 1px 0 rgba(255,255,255,0.2)", letterSpacing: 0.4 }}>
                    👑 Lihat Gelar Sultan Lagi
                  </button>
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
                  {/* Skip rating → tetap muncul Sultan popup biar customer yang gak mau rating gak miss popup */}
                  <button onClick={() => setShowCelebration(true)}
                    style={{ marginTop: 8, width: "100%", background: "transparent", border: "1px dashed rgba(255,255,255,0.15)", borderRadius: 10, padding: "9px 18px", color: "rgba(255,255,255,0.55)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.4 }}>
                    Lewati & Lihat Gelar Sultan →
                  </button>
                </>
              )}
            </div>
            {/* Auto-print status indicator (replace tombol Cetak — customer suka pencet berulang) */}
            <PrintStatusBanner state={printState} message={printMsg} />
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
              <button onClick={emailTickets} disabled={sending} style={btnEmail(sending)}>
                {sending ? "Mengirim…" : done.emailSent ? "✅ Email terkirim" : "📧 Kirim Email"}
              </button>
              <button onClick={shareWA} style={btnWA}>
                💬 Kirim via WhatsApp
              </button>
              <button onClick={reset} style={{ background: "linear-gradient(135deg,#a855f7,#c084fc)", border: "none", borderRadius: 12, padding: "14px 26px", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 12px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.2)", letterSpacing: 0.3, transition: "transform 0.15s ease, filter 0.15s ease" }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.filter = "brightness(1.08)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.filter = "none"; }}>
                ← Kembali ke Home
              </button>
            </div>
            {/* Auto-reset countdown banner */}
            {autoResetIn > 0 && (
              <div style={{
                marginTop: 18, display: "inline-flex", alignItems: "center", gap: 10,
                padding: "10px 18px", background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.25)",
                borderRadius: 999, fontSize: 12.5, color: "#c084fc", fontFamily: "'Geist Mono',monospace",
                fontWeight: 700, letterSpacing: 0.8,
              }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: "#c084fc", animation: "kioskAutoPulse 1s ease-in-out infinite" }} />
                BALIK KE HOME DALAM {autoResetIn}s
                <button onClick={reset} style={{ background: "transparent", border: "1px solid rgba(192,132,252,0.35)", borderRadius: 7, color: "#c084fc", padding: "4px 10px", fontSize: 11, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", letterSpacing: 1, marginLeft: 4 }}>SKIP</button>
              </div>
            )}
            <style>{`@keyframes kioskAutoPulse { 0%,100% { opacity:0.4 } 50% { opacity:1 } }`}</style>
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
              style={{
                background: seats.size
                  ? "radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))"
                  : "rgba(255,255,255,0.05)",
                border: seats.size ? "1px solid rgba(255,255,255,0.16)" : "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12, padding: "13px 28px",
                color: seats.size ? "#fff" : "rgba(255,255,255,0.3)",
                textShadow: seats.size ? "0 1px 2px rgba(0,0,0,0.45)" : "none",
                fontSize: 15, fontWeight: 700, cursor: seats.size ? "pointer" : "not-allowed",
                fontFamily: "inherit", letterSpacing: 0.3,
                boxShadow: seats.size
                  ? "inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 25%, transparent)"
                  : "none",
                transition: "transform 0.15s ease, filter 0.15s ease",
              }}
              onMouseEnter={(e) => { if (seats.size) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.filter = "brightness(1.08)"; } }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.filter = "none"; }}>
              {bundleCatalog.length > 0 ? t("cinema.add_snack") + " →" : t("cinema.buy_ticket")}
            </button>
          </div>
        </div>
      )}

      {/* Sultan celebration popup — muncul setelah customer kasih rating (atau skip rating) */}
      {showCelebration && done && (
        <CinemaCelebration
          apiBase={apiBase || ""}
          order={{
            customerName: (done.email || "").split("@")[0] || done.phone || "Tamu Cinema",
            total: done.total,
            filmTitle: done.film?.title,
          }}
          onDone={() => { setShowCelebration(false); }}
        />
      )}

      {/* Age verification gate (LSF Indonesia: 17+ / D21 / 21+) */}
      {/* TRAILER PREVIEW MODAL — klik film card → preview poster + trailer + button Pesan */}
      {previewFilm && (
        <FilmPreviewModal
          film={previewFilm}
          onClose={() => setPreviewFilm(null)}
          onPick={() => { const f = previewFilm; setPreviewFilm(null); pickFilm(f); }}
        />
      )}

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
              <button onClick={cancelAgeGate} style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.65)", padding: "12px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
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
        sub={`${t("cinema.enjoy_movie")} ${done?.film?.title || ""}! ${t("cinema.scan_ticket")}.`}
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
            <button onClick={() => { setCart({}); setStep("payment"); }} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 22px", color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s ease" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}>
              {t("cinema.skip_snack")}
            </button>
            <button onClick={() => setStep("payment")}
              style={{
                background: "radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))",
                border: "1px solid rgba(255,255,255,0.16)", borderRadius: 12, padding: "13px 28px",
                color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.45)",
                fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.3,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 25%, transparent)",
                transition: "transform 0.15s ease, filter 0.15s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.filter = "brightness(1.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.filter = "none"; }}>
              Lanjut ke Pembayaran · {rp(Math.max(0, grandTotal - (promoApplied?.discount || 0)))}
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

// Banner: auto-promo sudah ke-unlock (omzet/tiket harian capai threshold)
function AutoPromoBanner({ promo }) {
  const label = promo.discount_type === "percentage"
    ? `${promo.discount_value}% OFF`
    : `Rp ${(promo.discount_value || 0).toLocaleString("id-ID")} OFF`;
  return (
    <div style={{
      position: "relative", overflow: "hidden",
      background: "linear-gradient(135deg, rgba(245,158,11,0.18), rgba(168,85,247,0.18))",
      border: "1px solid rgba(245,158,11,0.45)", borderRadius: 16, padding: "14px 18px",
      marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
      boxShadow: "0 8px 24px rgba(245,158,11,0.15), inset 0 1px 0 rgba(255,255,255,0.08)",
      animation: "karyaKioskFadeUp 0.4s ease-out",
    }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(400px 200px at 0% 50%, rgba(251,191,36,0.12), transparent 70%)", pointerEvents: "none" }} />
      <div style={{ fontSize: 32, lineHeight: 1, filter: "drop-shadow(0 0 12px rgba(245,158,11,0.5))" }}>🎉</div>
      <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", fontWeight: 800, color: "#fbbf24", marginBottom: 2 }}>DISKON OTOMATIS AKTIF</div>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.3, color: "#fff" }}>{promo.name}</div>
        {promo.description && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>{promo.description}</div>}
      </div>
      <div style={{
        fontFamily: "'Geist Mono',monospace", fontSize: 18, fontWeight: 900, color: "#fbbf24",
        background: "rgba(0,0,0,0.35)", border: "1px solid rgba(245,158,11,0.5)",
        borderRadius: 10, padding: "8px 14px", letterSpacing: -0.3,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      }}>{label}</div>
    </div>
  );
}

// Print status indicator pada step done — replace tombol cetak (anti spam tap)
function PrintStatusBanner({ state, message }) {
  if (state === "idle") return null;
  const palette = {
    printing:      { bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.35)", color: "#fbbf24", icon: "🖨️", label: "MENCETAK" },
    success:       { bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.35)", color: "#10b981", icon: "✅", label: "TIKET DICETAK" },
    error:         { bg: "rgba(239,68,68,0.10)",  border: "rgba(239,68,68,0.35)",  color: "#fca5a5", icon: "⚠️", label: "CETAK GAGAL" },
    unconfigured:  { bg: "rgba(168,85,247,0.08)", border: "rgba(168,85,247,0.30)", color: "#c084fc", icon: "ℹ️", label: "E-TIKET ONLY" },
  };
  const p = palette[state] || palette.printing;
  return (
    <div style={{
      marginTop: 18, display: "inline-flex", alignItems: "center", gap: 12,
      padding: "10px 18px", background: p.bg, border: `1px solid ${p.border}`,
      borderRadius: 999, fontSize: 12.5, color: p.color,
      fontFamily: "'Geist Mono',monospace", fontWeight: 700, letterSpacing: 0.8,
      animation: state === "printing" ? "kioskAutoPulse 1.4s ease-in-out infinite" : "karyaKioskFadeUp 0.3s ease-out",
    }}>
      <span style={{ fontSize: 16 }}>{p.icon}</span>
      <span style={{ letterSpacing: 1.4 }}>{p.label}</span>
      {message && <span style={{ opacity: 0.75, fontWeight: 600, letterSpacing: 0.4, fontFamily: "'Inter',sans-serif" }}>· {message}</span>}
    </div>
  );
}

// Banner: progress menuju unlock — biar customer tahu ada milestone yang nanti aktif
function AutoPromoProgressBanner({ promos }) {
  // Pick yang paling dekat unlock (highest percent progress)
  const closest = promos.slice().sort((a, b) => (b.progress?.percent || 0) - (a.progress?.percent || 0))[0];
  if (!closest) return null;
  const pct = closest.progress?.percent || 0;
  const label = closest.discount_type === "percentage"
    ? `${closest.discount_value}% OFF`
    : `Rp ${(closest.discount_value || 0).toLocaleString("id-ID")} OFF`;
  const metric = closest.trigger_type === "auto_daily_sales" ? "omzet" : "tiket";
  return (
    <div style={{
      background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.18)",
      borderRadius: 14, padding: "12px 16px", marginBottom: 16,
      display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
    }}>
      <div style={{ fontSize: 22, opacity: 0.7 }}>🔓</div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 9.5, letterSpacing: 2, textTransform: "uppercase", fontWeight: 800, color: "#a78bfa", marginBottom: 4 }}>SEGERA UNLOCK · {label}</div>
        <div style={{ position: "relative", height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: "linear-gradient(90deg,#a855f7,#c084fc)", borderRadius: 999, transition: "width 0.4s ease" }} />
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 5 }}>
          {closest.progress?.current?.toLocaleString("id-ID")} / {closest.progress?.target?.toLocaleString("id-ID")} {metric} hari ini ({pct}%)
        </div>
      </div>
    </div>
  );
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

// Extract YouTube video ID dari berbagai bentuk URL
function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// FilmPreviewModal — modal preview film: poster + trailer + info + Pesan Tiket button
// ─── QRIS Self-Checkout (Cinema Kiosk) ───────────────────────────
// Create QRIS via Midtrans → show QR + countdown → poll status →
// on settlement, call buy(cartItems) → done. NO 'Bayar di Kasir'
// loophole — payment harus confirmed sebelum tiket di-print.
function CinemaQRISPayment({ film, show, seats, cartItems, total, base, buy, msg, setMsg, onBack }) {
  const [qrData, setQrData] = useState(null);    // { transactionId, qrUrl, midtransOrderId, expiryTime }
  const [creating, setCreating] = useState(false);
  const [polling, setPolling] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(300); // 5 menit max
  const [paid, setPaid] = useState(false);
  const pollTimerRef = useRef(null);
  const tickTimerRef = useRef(null);

  // Create QRIS transaction on mount
  useEffect(() => {
    let mounted = true;
    setCreating(true);
    setMsg("");
    const items = [
      { n: film?.title || "Tiket Cinema", p: Math.round(total / Math.max(1, seats.size)), q: seats.size },
      ...cartItems.map(it => ({ n: it.name, p: it.price, q: it.qty })),
    ];
    const orderId = `CK-${Date.now().toString(36).slice(-7).toUpperCase()}`;
    fetch(`/api/payment/qris`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, amount: total, items, customerName: "Cinema Customer" }),
    })
      .then(r => r.json())
      .then(d => {
        if (!mounted) return;
        if (d.error || !d.ok) { setMsg("⚠ " + (d.error || "Gagal generate QR")); return; }
        setQrData(d);
        // Calc expiry — cap di 5 menit (300s) walaupun Midtrans return 15 menit
        if (d.expiryTime) {
          const exp = new Date(d.expiryTime).getTime();
          const left = Math.max(0, Math.floor((exp - Date.now()) / 1000));
          setSecondsLeft(Math.min(left, 300));
        }
        setPolling(true);
      })
      .catch(e => setMsg("⚠ " + e.message))
      .finally(() => setCreating(false));
    return () => { mounted = false; };
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!qrData || paid) return;
    tickTimerRef.current = setInterval(() => {
      setSecondsLeft(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(tickTimerRef.current);
  }, [qrData, paid]);

  const [lastCheck, setLastCheck] = useState(null);
  const [checkBusy, setCheckBusy] = useState(false);

  const checkStatus = async () => {
    if (!qrData?.midtransOrderId || paid) return;
    setCheckBusy(true);
    try {
      const r = await fetch(`/api/payment/status/${encodeURIComponent(qrData.midtransOrderId)}`);
      const d = await r.json();
      setLastCheck({ at: Date.now(), status: d.status || "unknown", paid: !!d.paid });
      if (d.paid || ["settlement", "capture"].includes(d.status)) {
        setPaid(true);
        setPolling(false);
        clearInterval(pollTimerRef.current);
        clearInterval(tickTimerRef.current);
        setTimeout(() => buy(cartItems), 800);
        return true;
      }
    } catch (e) { console.error("status check err:", e); }
    setCheckBusy(false);
    return false;
  };

  // Auto-poll every 2s (faster)
  useEffect(() => {
    if (!polling || !qrData?.midtransOrderId || paid) return;
    pollTimerRef.current = setInterval(checkStatus, 2000);
    return () => clearInterval(pollTimerRef.current);
  }, [polling, qrData, paid]);

  // Auto-expire when countdown reach 0
  useEffect(() => {
    if (secondsLeft === 0 && !paid) {
      setPolling(false);
      setMsg("⏰ QR code expired. Klik 'Coba Lagi' untuk generate baru.");
    }
  }, [secondsLeft, paid]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const urgent = secondsLeft < 60;

  if (paid) {
    // Full-screen takeover — no overlap dengan elemen kiosk lain
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(8,9,15,0.96)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 14, padding: 24,
      }}>
        <div style={{ fontSize: 88, lineHeight: 1, filter: "drop-shadow(0 0 32px rgba(16,185,129,0.55))", animation: "karyaPaidPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)" }}>✅</div>
        <div style={{ fontSize: 30, fontWeight: 900, color: "#10b981", letterSpacing: -0.5, textAlign: "center", lineHeight: 1.1 }}>Payment Successful!</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", textAlign: "center", maxWidth: 340 }}>Memproses tiket Anda…</div>
        <style>{`@keyframes karyaPaidPop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(1); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 18, animation: "karyaKioskFadeUp 0.4s ease-out", maxWidth: 520, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: "#a855f7", letterSpacing: 2.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>QRIS PAYMENT</div>
        <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4, letterSpacing: -0.4 }}>Scan untuk Bayar</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>Buka e-wallet (GoPay/OVO/DANA/ShopeePay) → scan QR</div>
      </div>

      {/* QR Code box — generate via api.qrserver.com (Midtrans qrUrl auth-only, gak bisa direct img) */}
      <div style={{ background: "#fff", padding: 18, borderRadius: 16, marginBottom: 14, boxShadow: "0 16px 48px rgba(245,158,11,0.25), 0 0 0 4px rgba(245,158,11,0.15)" }}>
        {creating ? (
          <div style={{ aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", color: "#666", fontSize: 14 }}>
            ⏳ Generating QR Code…
          </div>
        ) : (qrData?.deeplinkUrl || qrData?.qrString) ? (
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=12&data=${encodeURIComponent(qrData.deeplinkUrl || qrData.qrString)}`}
            alt="QRIS Payment"
            style={{ width: "100%", aspectRatio: "1", objectFit: "contain", display: "block", borderRadius: 8 }}
          />
        ) : (
          <div style={{ aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444", fontSize: 13, padding: 20, textAlign: "center" }}>
            {msg || "QR Code tidak tersedia"}
          </div>
        )}
      </div>

      {/* Sandbox helper: kalau di sandbox mode, tampil link manual simulator */}
      {qrData?.deeplinkUrl && qrData.deeplinkUrl.includes("sandbox") && (
        <a href={qrData.deeplinkUrl} target="_blank" rel="noopener noreferrer" style={{
          display: "block", padding: "10px 16px", marginBottom: 14,
          background: "rgba(168,85,247,0.08)", border: "1px dashed rgba(168,85,247,0.4)",
          borderRadius: 10, color: "#c084fc", fontSize: 12, textAlign: "center",
          textDecoration: "none", fontWeight: 700,
        }}>
          🧪 SANDBOX MODE — Klik untuk simulasi bayar (production akan pakai QR e-wallet real)
        </a>
      )}

      {/* Total + countdown */}
      <div style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 16, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>TOTAL BAYAR</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#10b981", fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5, marginTop: 2 }}>{rp(total)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: urgent ? "#ef4444" : "rgba(255,255,255,0.5)", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{urgent ? "⏰ HAMPIR HABIS" : "EXPIRES IN"}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: urgent ? "#ef4444" : "#fbbf24", fontFamily: "'Geist Mono',monospace", letterSpacing: 1, marginTop: 2 }}>{mm}:{ss}</div>
        </div>
      </div>

      {/* Order recap */}
      <div style={{ padding: 12, background: "rgba(168,85,247,0.05)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 10, marginBottom: 14, fontSize: 12, color: "#cbd5e1", lineHeight: 1.55 }}>
        🎬 <b>{film?.title}</b><br/>
        {show && new Date(show.starts_at * 1000).toLocaleString("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}<br/>
        Kursi: <b style={{ color: "#fbbf24" }}>{[...seats].sort().join(", ")}</b> · {seats.size} tiket
        {cartItems.length > 0 && <><br/>F&B: {cartItems.map(it => `${it.name}×${it.qty}`).join(", ")}</>}
      </div>

      {/* Polling indicator + manual check button */}
      {polling && !paid && (
        <>
          <div style={{ padding: 10, background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.25)", borderRadius: 8, marginBottom: 8, fontSize: 11, color: "#67e8f9", textAlign: "center", fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5 }}>
            <span style={{ animation: "karyaPulse 1.4s infinite" }}>●</span> Menunggu pembayaran… (auto-cek 2 detik)
            {lastCheck && (
              <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 4 }}>
                Last check: {new Date(lastCheck.at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · status: {lastCheck.status}
              </div>
            )}
          </div>
          <button onClick={checkStatus} disabled={checkBusy} style={{
            width: "100%", padding: "10px 16px", marginBottom: 14,
            background: checkBusy ? "rgba(34,211,238,0.05)" : "rgba(34,211,238,0.12)",
            border: "1px solid rgba(34,211,238,0.35)",
            borderRadius: 10, color: "#67e8f9", fontSize: 12, fontWeight: 700,
            fontFamily: "inherit", cursor: checkBusy ? "wait" : "pointer", letterSpacing: 0.3,
          }}>
            {checkBusy ? "⏳ Mengecek…" : "🔄 Sudah Bayar? Cek Manual Sekarang"}
          </button>
        </>
      )}

      {msg && <div style={{ padding: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#fca5a5", fontSize: 12, marginBottom: 14 }}>{msg}</div>}

      <button onClick={onBack} style={{
        width: "100%", padding: "12px 20px",
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12, color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: 600,
        fontFamily: "inherit", cursor: "pointer",
      }}>← Kembali / Batal</button>

      <style>{`@keyframes karyaPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  );
}

function FilmPreviewModal({ film, onClose, onPick }) {
  const ytId = extractYouTubeId(film.trailer_url);
  const isUploadedVideo = film.trailer_url && (film.trailer_url.startsWith("/uploads/") || /\.(mp4|webm|mov|m4v)$/i.test(film.trailer_url));
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)", zIndex: 99999,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      animation: "karyaKioskFadeUp 0.3s ease-out",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "radial-gradient(ellipse 60% 50% at 30% 20%, rgba(70,76,98,0.45) 0%, transparent 65%), radial-gradient(ellipse 55% 45% at 75% 80%, rgba(50,55,72,0.35) 0%, transparent 65%), linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)",
        border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20,
        maxWidth: 920, width: "100%", maxHeight: "92vh", overflowY: "auto",
        color: "#e6edf3", boxShadow: "0 32px 96px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}>
        {/* Close button */}
        <button onClick={onClose} style={{
          position: "absolute", top: 30, right: 30, zIndex: 10,
          width: 44, height: 44, borderRadius: 999,
          background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.15)",
          color: "#fff", fontSize: 20, cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(8px)",
        }}>✕</button>

        {/* Trailer player on top — large 16:9 */}
        {ytId ? (
          <div style={{ width: "100%", aspectRatio: "16/9", background: "#000", borderRadius: "20px 20px 0 0", overflow: "hidden" }}>
            <iframe
              src={`https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1`}
              title={film.title} frameBorder="0"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          </div>
        ) : isUploadedVideo ? (
          <video
            src={film.trailer_url}
            autoPlay controls
            style={{ width: "100%", aspectRatio: "16/9", background: "#000", borderRadius: "20px 20px 0 0", display: "block" }}
          />
        ) : film.poster_url ? (
          <div style={{ width: "100%", aspectRatio: "16/9", background: `url(${film.poster_url}) center/cover, #0a0e16`, borderRadius: "20px 20px 0 0", position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.2), rgba(5,8,16,0.85))" }} />
            <div style={{ position: "absolute", bottom: 20, left: 20, fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "'Geist Mono',monospace", letterSpacing: 1.5, fontWeight: 700 }}>🎞️ Trailer belum tersedia</div>
          </div>
        ) : (
          <div style={{ width: "100%", aspectRatio: "16/9", background: "linear-gradient(135deg,#1e1b4b,#0a0e16)", borderRadius: "20px 20px 0 0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 80 }}>🎞️</div>
        )}

        {/* Film info + CTA */}
        <div style={{ padding: 28 }}>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
            {/* Poster sidebar */}
            {film.poster_url && (
              <img src={film.poster_url} alt={film.title}
                style={{ width: 140, aspectRatio: "2/3", objectFit: "cover", borderRadius: 12, flexShrink: 0, boxShadow: "0 12px 32px rgba(0,0,0,0.5)" }} />
            )}
            {/* Info */}
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -0.7, lineHeight: 1.15, marginBottom: 6 }}>{film.title}</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                <span style={{ fontSize: 12, fontWeight: 800, padding: "3px 10px", borderRadius: 6, background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.4)", color: "#c084fc", fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5 }}>{film.rating || "SU"}</span>
                {film.genre && <span>{film.genre}</span>}
                {film.duration_min ? <span>· {film.duration_min} mnt</span> : null}
                {film.avg_rating ? <span style={{ color: "#fbbf24" }}>· ★ {film.avg_rating}</span> : null}
              </div>
              {film.synopsis && (
                <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, marginBottom: 18 }}>{film.synopsis}</div>
              )}
              {/* CTA */}
              <button onClick={onPick} style={{
                width: "100%", padding: "16px 28px",
                background: "linear-gradient(135deg,#f59e0b,#fbbf24)",
                border: "none", borderRadius: 14, color: "#1a1205",
                fontSize: 16, fontWeight: 900, letterSpacing: 0.5, cursor: "pointer",
                fontFamily: "inherit", boxShadow: "0 8px 24px rgba(245,158,11,0.4), inset 0 1px 0 rgba(255,255,255,0.3)",
                transition: "transform 0.15s ease, filter 0.15s ease",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.filter = "brightness(1.06)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.filter = "none"; }}
              >🎟️ Pesan Tiket Sekarang</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Seat type styling — sinkron dengan CinemaStudioLayoutEditor
const SEAT_COLOR = { regular: "#10b981", premium: "#fbbf24", couple: "#ec4899", disabled: "#22d3ee", vip: "#a855f7" };
const SEAT_EMOJI = { regular: "💺", premium: "👑", couple: "💑", disabled: "♿", vip: "⭐" };

// SeatGrid — render dari seat_map (kalau ada) atau fallback ke rows×cols grid.
// Flex column-reverse: Row data[0] di BAWAH (cinema standard: A = back row).
// Auto-size: cells scale via container max-width, horizontal scroll kalau perlu.
function SeatGrid({ seatData, seats, onToggle }) {
  const useMap = Array.isArray(seatData?.seat_map) && seatData.seat_map.length > 0;
  // Build row-based layout
  const rowsData = useMap
    ? seatData.seat_map
    : Array.from({ length: seatData.rows }, (_, r) =>
        Array.from({ length: seatData.cols }, (_, c) => ({
          type: "regular",
          label: `${String.fromCharCode(65 + r)}${c + 1}`,
        }))
      );
  // Row labels — derived dari first non-void cell label OR fallback A-Z
  const rowLabels = rowsData.map((row, r) => {
    const first = row?.find(c => c && c.type !== "void" && c.label);
    const match = first?.label?.match(/^([A-Za-z]+)/);
    return match ? match[1] : String.fromCharCode(65 + r);
  });
  const soldSet = new Set(seatData.sold || []);
  const heldOtherSet = new Set(seatData.held_by_others || []);

  return (
    <div style={{ display: "flex", flexDirection: "column-reverse", gap: 7, alignItems: "center" }}>
      {rowsData.map((row, ri) => (
        <div key={ri} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ width: 28, fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: "'Geist Mono',monospace", fontWeight: 800, textAlign: "center" }}>{rowLabels[ri]}</span>
          {row.map((cell, ci) => {
            const isVoid = !cell || cell.type === "void";
            if (isVoid) return <div key={ci} style={{ width: 30, height: 30 }} aria-hidden />;
            const seat = cell.label || `${rowLabels[ri]}${ci + 1}`;
            const type = cell.type || "regular";
            const sold = soldSet.has(seat);
            const heldOther = heldOtherSet.has(seat);
            const sel = seats.has(seat);
            const unavail = sold || heldOther;
            const baseColor = SEAT_COLOR[type] || "#10b981";
            return (
              <button
                key={ci}
                onClick={() => onToggle(seat)}
                disabled={unavail}
                title={heldOther ? `${seat} · sedang dipilih customer lain` : `${seat} · ${type}`}
                className="karya-seat-btn"
                style={{
                  width: 30, height: 30, borderRadius: 8, fontSize: 10, fontWeight: 800,
                  fontFamily: "'Geist Mono',monospace",
                  background: sold ? "rgba(239,68,68,0.18)"
                            : heldOther ? "rgba(234,179,8,0.18)"
                            : sel ? "linear-gradient(135deg,#f59e0b,#fbbf24)"
                            : `${baseColor}22`,
                  border: `1px solid ${sold ? "rgba(239,68,68,0.3)"
                                     : heldOther ? "rgba(234,179,8,0.35)"
                                     : sel ? "rgba(245,158,11,0.5)"
                                     : `${baseColor}55`}`,
                  color: sold ? "#ef4444" : heldOther ? "#eab308" : sel ? "#111" : baseColor,
                  boxShadow: sel ? "0 0 0 1px rgba(245,158,11,0.4), 0 6px 18px rgba(245,158,11,0.25)" : "none",
                  cursor: unavail ? "not-allowed" : "pointer",
                  position: "relative",
                }}>
                {type === "disabled" ? "♿" : type === "companion" ? "👥" : ci + 1}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
const btnEmail = (busy) => ({ background: busy ? "rgba(255,255,255,0.04)" : "linear-gradient(135deg,#22d3ee,#67e8f9)", border: "none", borderRadius: 12, padding: "14px 22px", color: busy ? "rgba(255,255,255,0.35)" : "#04130c", fontSize: 13, fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: busy ? "none" : "0 4px 12px rgba(34,211,238,0.3), inset 0 1px 0 rgba(255,255,255,0.2)", letterSpacing: 0.3, transition: "transform 0.15s ease, filter 0.15s ease" });
