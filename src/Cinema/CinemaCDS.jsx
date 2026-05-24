// karyaOS — POS Cinema Customer Display (Second Screen)
// Route: /?cinema-cds[&outlet=XXX]
// Layar yg dihadapkan ke customer — transparent display:
//   - Idle: branding + outlet info + jadwal film tayang hari ini (rotating)
//   - Selected: poster gede + jadwal + studio + seat map dengan kursi pilih kasir
//   - Pay: breakdown harga + QR code QRIS (kalau payment QRIS)
//   - Done: terima kasih + ticket info ringkas
//
// State diterima via WebSocket dari backend (POS Cinema POST /api/cinema/cds/state).
// Auto-reconnect kalau WS drop.

import { useState, useEffect, useRef } from "react";
// HelpButton tidak di-import — CDS adalah TV display non-interactive (customer gak butuh help button)

const API_HOST = import.meta.env.VITE_API_URL || "http://localhost:3001";

const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtTime = (t) => t ? new Date(t).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";
const SEAT_COLOR = { regular: "#10b981", premium: "#fbbf24", couple: "#ec4899", disabled: "#22d3ee", vip: "#a855f7" };
const SEAT_EMOJI = { regular: "💺", premium: "👑", couple: "💑", disabled: "♿", vip: "⭐" };
const PAYMENT_LABEL = { cash: "💵 TUNAI", qris: "📲 QRIS", debit: "💳 KARTU DEBIT/KREDIT", voucher: "🎟️ VOUCHER" };
const PAYMENT_COLOR = { cash: "#10b981", qris: "#22d3ee", debit: "#a855f7", voucher: "#ec4899" };

export default function CinemaCDS() {
  const [state, setState] = useState({ stage: "idle" });
  const [showtimes, setShowtimes] = useState([]); // today rotating
  const [promos, setPromos] = useState([]); // active promotions untuk display
  const [promoIdx, setPromoIdx] = useState(0); // carousel index untuk multi-promo
  const [now, setNow] = useState(new Date());
  const [branding, setBranding] = useState({ bgUrl: "", idleText: "" }); // custom CDS branding
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  // Determine outlet from URL
  const outletCode = (() => {
    try { return new URLSearchParams(window.location.search).get("outlet") || ""; } catch { return ""; }
  })();

  // Fetch branding config — per outlet (CINEMA_CDS_BG:OUTLET) fallback ke default
  useEffect(() => {
    const load = async () => {
      const bgKeys = outletCode ? [`CINEMA_CDS_BG:${outletCode}`, "CINEMA_CDS_BG_DEFAULT"] : ["CINEMA_CDS_BG_DEFAULT"];
      const textKeys = outletCode ? [`CINEMA_CDS_IDLE_TEXT:${outletCode}`, "CINEMA_CDS_IDLE_TEXT_DEFAULT"] : ["CINEMA_CDS_IDLE_TEXT_DEFAULT"];
      let bgUrl = "", idleText = "";
      for (const k of bgKeys) {
        try {
          const r = await fetch(`${API_HOST}/api/pos/config/${encodeURIComponent(k)}`);
          if (!r.ok) continue;
          const d = await r.json();
          let v = d.value;
          try { v = typeof v === "string" ? JSON.parse(v) : v; } catch {}
          if (v && typeof v === "string") { bgUrl = v.startsWith("http") || v.startsWith("/") ? v : ""; if (bgUrl) break; }
        } catch {}
      }
      for (const k of textKeys) {
        try {
          const r = await fetch(`${API_HOST}/api/pos/config/${encodeURIComponent(k)}`);
          if (!r.ok) continue;
          const d = await r.json();
          let v = d.value;
          try { v = typeof v === "string" ? JSON.parse(v) : v; } catch {}
          if (v && typeof v === "string") { idleText = v; break; }
        } catch {}
      }
      // Prefix dengan API_HOST kalau relative /uploads/...
      if (bgUrl && bgUrl.startsWith("/")) bgUrl = API_HOST + bgUrl;
      setBranding({ bgUrl, idleText });
    };
    load();
  }, [outletCode]);

  // Full-screen takeover
  useEffect(() => {
    const root = document.getElementById("root");
    if (root) { root.style.maxWidth = "none"; root.style.width = "100%"; root.style.padding = "0"; }
    document.documentElement.style.zoom = "1";
    return () => { if (root) { root.style.maxWidth = ""; root.style.width = ""; root.style.padding = ""; } };
  }, []);

  // Clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Initial fetch current state + showtimes
  useEffect(() => {
    fetch(`${API_HOST}/api/cinema/cds/state`).then(r => r.json()).then(setState).catch(() => {});
  }, []);

  // Fetch active promotions + carousel (rotate tiap 8 detik kalau multi)
  useEffect(() => {
    const load = () => fetch(`${API_HOST}/api/cinema/promotions/active`).then(r => r.json())
      .then(d => setPromos(d.promotions || [])).catch(() => {});
    load();
    const refresh = setInterval(load, 5 * 60 * 1000); // 5 menit refresh
    return () => clearInterval(refresh);
  }, []);

  useEffect(() => {
    if (promos.length <= 1) return;
    const id = setInterval(() => setPromoIdx(i => (i + 1) % promos.length), 8000);
    return () => clearInterval(id);
  }, [promos.length]);

  // Auto-refresh showtimes tiap 30 detik (untuk update sold/availability di idle stage)
  useEffect(() => {
    const fetchST = () => {
      const stUrl = outletCode
        ? `${API_HOST}/api/cinema/showtimes?date=${new Date().toISOString().slice(0, 10)}&outlet=${encodeURIComponent(outletCode)}`
        : `${API_HOST}/api/cinema/showtimes?date=${new Date().toISOString().slice(0, 10)}`;
      fetch(stUrl).then(r => r.json()).then(d => setShowtimes(d.showtimes || [])).catch(() => {});
    };
    fetchST();
    const id = setInterval(fetchST, 30000);
    return () => clearInterval(id);
  }, [outletCode]);

  // WebSocket connection — receive cinema_cds:state events
  useEffect(() => {
    const connect = () => {
      const wsUrl = window.location.protocol === "https:" ? `wss://${window.location.host}/ws` : `ws://${window.location.hostname}:3011`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          if (m.event === "cinema_cds:state") setState(m.data || {});
        } catch {}
      };
      ws.onclose = () => {
        if (reconnectRef.current) return;
        reconnectRef.current = setTimeout(() => { reconnectRef.current = null; connect(); }, 2000);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { if (wsRef.current) wsRef.current.close(); if (reconnectRef.current) clearTimeout(reconnectRef.current); };
  }, []);


  const stage = state.stage || "idle";

  // ═══════════════════════════════════════════════
  // STAGE: PAY (QRIS QR display gede OR payment method confirm screen)
  // ═══════════════════════════════════════════════
  if (stage === "pay") {
    const method = state.paymentMethod || "qris";
    // QRIS dengan QR ready → tampil QR gede
    if (state.qrUrl) {
      return (
        <Shell now={now} outlet={state.outlet} bgUrl={branding.bgUrl}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "#fbbf24", letterSpacing: 3, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 18 }}>📱 SCAN QRIS UNTUK BAYAR</div>
            <div style={{ background: "#fff", padding: 24, borderRadius: 24, boxShadow: "0 24px 80px rgba(245,158,11,0.3), 0 0 0 4px rgba(245,158,11,0.2)" }}>
              <img src={state.qrUrl} alt="QRIS" style={{ width: 360, height: 360, display: "block" }} />
            </div>
            <div style={{ marginTop: 26, fontSize: 64, fontWeight: 900, color: "#fbbf24", fontFamily: "'Geist Mono',monospace", letterSpacing: -2 }}>{rp(state.total)}</div>
            <div style={{ fontSize: 14, color: "#9ca3af", marginTop: 6 }}>{state.film_title} · {state.seats?.join(", ")}</div>
            <div style={{ marginTop: 18, padding: "10px 22px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12, fontSize: 13, color: "#fbbf24" }}>
              Buka e-wallet (GoPay/OVO/DANA/ShopeePay) → scan kode QR
            </div>
          </div>
        </Shell>
      );
    }
    // Belum QRIS / belum generate / method lain → tampil card sesuai method
    return (
      <Shell now={now} outlet={state.outlet} bgUrl={branding.bgUrl}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: 40, textAlign: "center", gap: 14 }}>
          <div style={{ fontSize: 14, color: PAYMENT_COLOR[method] || "#fbbf24", letterSpacing: 3, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>{(PAYMENT_LABEL[method] || method).toUpperCase()}</div>
          <div style={{ fontSize: 56, fontWeight: 900, color: "#fff", letterSpacing: -1.2, lineHeight: 1.1 }}>
            {method === "cash" ? "💵 Bayar Tunai"
              : method === "qris" ? "📲 Menyiapkan QRIS..."
              : method === "debit" ? "💳 Tap / Swipe Kartu"
              : method === "voucher" ? "🎟️ Voucher" : "Pembayaran"}
          </div>
          <div style={{ fontSize: 64, fontWeight: 900, color: "#fbbf24", fontFamily: "'Geist Mono',monospace", letterSpacing: -2, lineHeight: 1 }}>{rp(state.total)}</div>
          <div style={{ fontSize: 16, color: "#cbd5e1" }}>{state.film_title} · {state.seats?.join(", ")}</div>
          {method === "qris" && (
            <div style={{ marginTop: 14, fontSize: 13, color: "#22d3ee" }}>● Tunggu kasir generate QR code...</div>
          )}
          {method === "cash" && (
            <div style={{ marginTop: 14, padding: "10px 22px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 12, fontSize: 14, color: "#10b981" }}>
              Bayar tunai di kasir. Kembalian akan diberikan kasir.
            </div>
          )}
          {method === "debit" && (
            <div style={{ marginTop: 14, padding: "10px 22px", background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 12, fontSize: 14, color: "#c084fc" }}>
              Tap / swipe kartu di mesin EDC. Tunggu konfirmasi kasir.
            </div>
          )}
        </div>
      </Shell>
    );
  }

  // ═══════════════════════════════════════════════
  // STAGE: DONE (success — show ticket QRs)
  // ═══════════════════════════════════════════════
  if (stage === "done") {
    return (
      <Shell now={now} outlet={state.outlet} bgUrl={branding.bgUrl}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: 30, textAlign: "center", gap: 10, overflowY: "auto" }}>
          <div style={{ fontSize: 64, lineHeight: 1, filter: "drop-shadow(0 0 32px rgba(16,185,129,0.5))" }}>🎬</div>
          <div style={{ fontSize: 14, color: "#10b981", letterSpacing: 3, fontFamily: "'Geist Mono',monospace", fontWeight: 800, lineHeight: 1 }}>TIKET BERHASIL DIBELI</div>
          <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: -1, lineHeight: 1.15, margin: 0 }}>{state.film_title || "Selamat menonton!"}</div>
          <div style={{ fontSize: 16, color: "#9ca3af", lineHeight: 1.4, margin: 0 }}>
            {state.studio_name} · {state.show_date} · {state.start_time}
            {state.paymentMethod && <span> · {PAYMENT_LABEL[state.paymentMethod] || state.paymentMethod}</span>}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            {(state.seats || []).map(s => (
              <span key={s} style={{ fontSize: 22, fontWeight: 900, padding: "8px 18px", borderRadius: 12, background: "linear-gradient(135deg,#f59e0b,#fbbf24)", color: "#1a1205", fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5, lineHeight: 1 }}>{s}</span>
            ))}
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#10b981", fontFamily: "'Geist Mono',monospace", letterSpacing: -1, lineHeight: 1, marginTop: 4 }}>{rp(state.total)} <span style={{ fontSize: 12, color: "#7d8590" }}>dibayar</span></div>

          {/* CUSTOMER FEEDBACK QR — scan pakai HP → mobile feedback page */}
          <CdsFeedbackQR filmId={state.film_id} filmTitle={state.film_title} purchaseId={state.purchase_id} />
        </div>
      </Shell>
    );
  }

  // ═══════════════════════════════════════════════
  // STAGE: SELLING (kasir lagi pilih film/seats)
  // ═══════════════════════════════════════════════
  if ((stage === "selling" || stage === "selected") && (state.film_title || state.poster_url)) {
    return (
      <Shell now={now} outlet={state.outlet} bgUrl={branding.bgUrl}>
        <div style={{ display: "flex", flex: 1, padding: 30, gap: 30, alignItems: "center" }}>
          {/* Left: Poster */}
          <div style={{ flexShrink: 0 }}>
            {state.poster_url ? (
              <img src={state.poster_url} alt={state.film_title} style={{ width: 320, height: 480, objectFit: "cover", borderRadius: 16, boxShadow: "0 16px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)" }} />
            ) : (
              <div style={{ width: 320, height: 480, background: "linear-gradient(135deg,#1e1b4b,#0a0e16)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 96 }}>🎞️</div>
            )}
          </div>
          {/* Right: Info + breakdown */}
          <div style={{ flex: 1, color: "#e6edf3" }}>
            <div style={{ fontSize: 14, color: "#a855f7", letterSpacing: 3, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>FILM YANG DIPILIH</div>
            <div style={{ fontSize: 48, fontWeight: 900, marginTop: 6, letterSpacing: -1.2, lineHeight: 1.1 }}>{state.film_title}</div>
            <div style={{ fontSize: 18, color: "#9ca3af", marginTop: 10 }}>
              {state.genre && <span>{state.genre} · </span>}
              {state.duration_min ? `${state.duration_min} mnt` : ""}
              {state.rating ? ` · ${state.rating}` : ""}
            </div>
            <div style={{ marginTop: 18, padding: "14px 20px", background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 12, display: "flex", gap: 24, flexWrap: "wrap" }}>
              <Info label="STUDIO" value={state.studio_name || "—"} color="#c084fc" />
              <Info label="TANGGAL" value={state.show_date || "—"} color="#c084fc" />
              <Info label="JAM" value={state.start_time || "—"} color="#c084fc" />
              <Info label="FORMAT" value={state.format || "2D"} color="#c084fc" />
            </div>

            {/* Seat map preview — biar customer lihat posisi kursi di studio */}
            {state.seat_data && (
              <div style={{ marginTop: 22 }}>
                <div style={{ fontSize: 12, color: "#7d8590", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 10 }}>POSISI KURSI DI STUDIO</div>
                <CdsSeatMap seatData={state.seat_data} selectedSeats={state.seats || []} />
              </div>
            )}

            {/* Seats list pills */}
            {state.seats && state.seats.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, color: "#7d8590", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 8 }}>KURSI DIPILIH</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {state.seats.map(s => (
                    <span key={s} style={{ fontSize: 18, fontWeight: 900, padding: "6px 14px", borderRadius: 10, background: "linear-gradient(135deg,#f59e0b,#fbbf24)", color: "#1a1205", fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5 }}>{s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Price breakdown — full detail */}
            <div style={{ marginTop: 24, padding: 18, background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 14 }}>
              {/* Tiket line per-seat (kalau ada per-type pricing dari seat_data) */}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#9ca3af", fontWeight: 600 }}>
                <span>🎟️ Tiket × {state.seats?.length || 0} kursi</span>
                <span style={{ fontFamily: "'Geist Mono',monospace" }}>{rp(state.seats_total || 0)}</span>
              </div>
              {/* F&B bundles detail — per item */}
              {state.bundles && state.bundles.length > 0 && (
                <>
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed rgba(255,255,255,0.08)", fontSize: 11, color: "#fbbf24", fontFamily: "'Geist Mono',monospace", letterSpacing: 1.5, fontWeight: 800 }}>🍿 F&B BUNDLE</div>
                  {state.bundles.map((b, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#cbd5e1", marginTop: 5, gap: 12 }}>
                      <span><b style={{ color: "#fbbf24", marginRight: 6 }}>{b.qty}×</b>{b.name}</span>
                      <span style={{ fontFamily: "'Geist Mono',monospace" }}>{rp((b.qty || 1) * (b.price || 0))}</span>
                    </div>
                  ))}
                </>
              )}
              {/* Payment method indicator */}
              {state.paymentMethod && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", fontSize: 13, color: "#9ca3af" }}>
                  <span>Metode Pembayaran</span>
                  <span style={{ fontWeight: 800, color: PAYMENT_COLOR[state.paymentMethod] || "#fbbf24" }}>{PAYMENT_LABEL[state.paymentMethod] || state.paymentMethod.toUpperCase()}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, fontWeight: 900, color: "#10b981", marginTop: 12, borderTop: "1px solid rgba(16,185,129,0.2)", paddingTop: 12 }}>
                <span>TOTAL</span>
                <span style={{ fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5 }}>{rp(state.total || 0)}</span>
              </div>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  // ═══════════════════════════════════════════════
  // STAGE: IDLE (default — branding + today's schedule grid + seat availability)
  // ═══════════════════════════════════════════════
  const today = new Date().toISOString().slice(0, 10);
  const nowDate = new Date();
  // Filter showtimes: today + outlet match (kalau outlet di URL) + belum lewat dari sekarang
  const todayShows = showtimes
    .filter(s => s.show_date === today)
    .filter(s => !outletCode || s.outlet === outletCode || !s.outlet)
    .filter(s => {
      // Show only upcoming + currently running
      const [h, m] = String(s.start_time).split(":").map(Number);
      const startSec = new Date(today + "T" + s.start_time).getTime() / 1000;
      const dur = (s.duration_min || 120) * 60;
      const nowSec = nowDate.getTime() / 1000;
      return nowSec < startSec + dur;
    })
    .slice(0, 16);

  return (
    <Shell now={now} outlet={state.outlet} bgUrl={branding.bgUrl}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "20px 30px 24px", overflowY: "auto", gap: 16 }}>
        {/* Welcome hero — compact */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 8, paddingTop: 6 }}>
          <div style={{ fontSize: 48, lineHeight: 1, filter: "drop-shadow(0 0 24px rgba(168,85,247,0.4))" }}>🎬</div>
          <div style={{ fontSize: 12, color: "#a855f7", letterSpacing: 4, fontFamily: "'Geist Mono',monospace", fontWeight: 800, lineHeight: 1 }}>karyaOS CINEMA</div>
          <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: -1, color: "#fff", lineHeight: 1.1, margin: 0, textShadow: branding.bgUrl ? "0 2px 16px rgba(0,0,0,0.8)" : "none" }}>Selamat Datang</div>
          <div style={{ fontSize: 14, color: branding.bgUrl ? "#e6edf3" : "#9ca3af", maxWidth: 640, lineHeight: 1.5, margin: 0, textShadow: branding.bgUrl ? "0 1px 6px rgba(0,0,0,0.8)" : "none" }}>{branding.idleText || "Silakan pilih film & jadwal di counter — kasir akan bantu pesanan Anda"}</div>
        </div>

        {/* PROMO BANNER — carousel kalau ada beberapa promo */}
        {promos.length > 0 && <PromoBanner promo={promos[promoIdx]} count={promos.length} idx={promoIdx} />}

        {/* TODAY'S SCHEDULE GRID */}
        <div style={{ background: "linear-gradient(180deg, rgba(168,85,247,0.06), rgba(168,85,247,0.02))", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 16, padding: 20, boxShadow: "0 16px 48px rgba(0,0,0,0.3)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: "#c084fc", letterSpacing: 3, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>📅 JADWAL TAYANG HARI INI</div>
              <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 2 }}>Cek film + sisa kursi sebelum pesan ke kasir</div>
            </div>
            <div style={{ fontSize: 11, color: "#7d8590", fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{todayShows.length} JADWAL</div>
          </div>

          {todayShows.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#7d8590", fontSize: 14 }}>
              🎞️ Belum ada jadwal tersisa hari ini.
              <br /><span style={{ fontSize: 12, marginTop: 8, display: "inline-block" }}>Cek jadwal besok di counter atau tanya kasir.</span>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
              {todayShows.map(s => {
                const cap = s.capacity || (s.rows && s.cols ? s.rows * s.cols : 0);
                const sold = s.sold_count || 0;
                const remaining = Math.max(0, cap - sold);
                const remainPct = cap > 0 ? Math.round((remaining / cap) * 100) : 0;
                const status = s.derived_status || "scheduled";
                // Color by availability + status
                const isSoldOut = status === "sold_out" || remaining === 0;
                const isClosed = status === "closed" || status === "cancelled";
                const isRunning = status === "running";
                const c = isClosed ? "#6b7280"
                        : isSoldOut ? "#ef4444"
                        : remainPct >= 50 ? "#10b981"
                        : remainPct >= 20 ? "#fbbf24"
                        : "#f97316";
                const statusLabel = isSoldOut ? "SOLD OUT"
                                  : isClosed ? "TUTUP"
                                  : isRunning ? "TAYANG"
                                  : "TERSEDIA";
                return (
                  <div key={s.id} style={{ display: "flex", gap: 10, padding: 12, background: "rgba(255,255,255,0.025)", border: `1px solid ${c}33`, borderRadius: 12, opacity: isClosed ? 0.55 : 1 }}>
                    {s.poster_url ? (
                      <img src={s.poster_url} alt="" style={{ width: 64, height: 96, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 64, height: 96, background: "#1a1b1e", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0 }}>🎞️</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: "#fff", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.film_title}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 18, fontWeight: 900, color: "#fbbf24", fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5, lineHeight: 1 }}>{s.start_time}</span>
                        <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>{s.studio_name}</span>
                        {s.format && <span style={{ fontSize: 9, color: "#c084fc", background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 4, padding: "1px 6px", fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>{s.format}</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: "#10b981", fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{rp(s.price)}</div>
                      {/* Seat availability bar */}
                      <div style={{ marginTop: "auto" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "'Geist Mono',monospace", marginBottom: 2 }}>
                          <span style={{ color: c, fontWeight: 800, letterSpacing: 0.5 }}>{statusLabel}</span>
                          <span style={{ color: "#9ca3af" }}>{isSoldOut ? `${cap}/${cap}` : `${remaining} dari ${cap}`}</span>
                        </div>
                        <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ background: c, height: "100%", width: `${isSoldOut ? 100 : 100 - remainPct}%`, transition: "width 0.3s" }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: 14, padding: "8px 12px", background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 8, fontSize: 11, color: "#9ca3af", textAlign: "center", lineHeight: 1.5 }}>
            🟢 Tersedia · 🟡 Hampir habis · 🟠 Sisa sedikit · 🔴 Sold out · ⚪ Tutup
          </div>
        </div>
      </div>
    </Shell>
  );
}

// ═══════════════════════════════════════════════════════════════════
function Shell({ children, now, outlet, bgUrl }) {
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: bgUrl ? `url(${bgUrl}) center/cover fixed` : "linear-gradient(160deg,#050810 0%,#0c0f1a 50%,#08090f 100%)",
      color: "#e6edf3", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
      display: "flex", flexDirection: "column",
    }}>
      {/* Dark overlay biar text tetap readable di custom background */}
      {bgUrl && <div aria-hidden style={{ position: "fixed", inset: 0, background: "linear-gradient(180deg, rgba(5,8,16,0.45), rgba(5,8,16,0.7))", pointerEvents: "none" }} />}
      {/* Mesh overlay */}
      <div aria-hidden style={{ position: "fixed", inset: 0, background: "radial-gradient(900px 700px at 20% 5%, rgba(168,85,247,0.08), transparent 60%), radial-gradient(700px 500px at 85% 80%, rgba(245,158,11,0.06), transparent 60%)", pointerEvents: "none" }} />
      {/* Topbar */}
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 26px", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(8,9,15,0.5)", backdropFilter: "blur(12px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: "linear-gradient(135deg,#f59e0b,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, filter: "drop-shadow(0 0 16px rgba(245,158,11,0.4))" }}>🎬</div>
          <div>
            <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>karya<span style={{ color: "#a855f7" }}>OS</span> Cinema</div>
            {outlet && <div style={{ fontSize: 10, color: "#7d8590", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 700, textTransform: "uppercase" }}>📍 {outlet}</div>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5 }}>{now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</div>
          <div style={{ fontSize: 12, color: "#7d8590" }}>{now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" })}</div>
        </div>
      </div>
      <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>{children}</div>
    </div>
  );
}

// PromoBanner — display active promo di CDS idle stage (carousel kalau multi)
function PromoBanner({ promo, count, idx }) {
  if (!promo) return null;
  const isPercent = promo.discount_type === "percentage";
  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(245,158,11,0.18), rgba(251,191,36,0.05))",
      border: "1px solid rgba(245,158,11,0.45)",
      borderRadius: 16, padding: "16px 22px",
      boxShadow: "0 8px 32px rgba(245,158,11,0.15)",
      display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap",
    }}>
      <div style={{ fontSize: 44, lineHeight: 1, filter: "drop-shadow(0 0 16px rgba(245,158,11,0.5))" }}>🎁</div>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 11, color: "#fbbf24", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>PROMO BERLAKU HARI INI</div>
          {count > 1 && <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: "'Geist Mono',monospace" }}>{idx + 1}/{count}</span>}
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginTop: 4, letterSpacing: -0.5, lineHeight: 1.2 }}>{promo.name}</div>
        {promo.description && <div style={{ fontSize: 13, color: "#cbd5e1", marginTop: 4, lineHeight: 1.4 }}>{promo.description}</div>}
        {promo.code && <div style={{ display: "inline-block", marginTop: 8, padding: "4px 12px", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 6, color: "#fbbf24", fontFamily: "'Geist Mono',monospace", fontSize: 13, fontWeight: 800, letterSpacing: 1.5 }}>KODE: {promo.code}</div>}
      </div>
      <div style={{ textAlign: "center", padding: "10px 18px", background: "linear-gradient(135deg,#f59e0b,#fbbf24)", borderRadius: 12, color: "#1a1205", minWidth: 120, boxShadow: "0 4px 16px rgba(245,158,11,0.3)" }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace" }}>DISCOUNT</div>
        <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5, lineHeight: 1, marginTop: 2 }}>
          {isPercent ? `${promo.discount_value}%` : `Rp ${Math.round(promo.discount_value / 1000)}rb`}
        </div>
        {promo.min_purchase > 0 && <div style={{ fontSize: 9, marginTop: 2, opacity: 0.8 }}>min Rp {Math.round(promo.min_purchase / 1000)}rb</div>}
      </div>
      {count > 1 && (
        <div style={{ width: "100%", display: "flex", gap: 4, justifyContent: "center", marginTop: 4 }}>
          {Array.from({ length: count }).map((_, i) => (
            <span key={i} style={{ width: 6, height: 6, borderRadius: 999, background: i === idx ? "#fbbf24" : "rgba(255,255,255,0.2)" }} />
          ))}
        </div>
      )}
    </div>
  );
}

// CdsFeedbackQR — display QR code di CDS, customer scan pakai HP → rate di /?cinema-feedback
// CDS = TV display non-touch, customer gak bisa interact langsung
function CdsFeedbackQR({ filmId, filmTitle, purchaseId }) {
  const [qrSrc, setQrSrc] = useState(null);
  useEffect(() => {
    if (!filmId) { setQrSrc(null); return; }
    const params = new URLSearchParams({ film: String(filmId), title: filmTitle || "" });
    if (purchaseId) params.set("p", purchaseId);
    const url = `${window.location.origin}/?cinema-feedback&${params.toString()}`;
    // Use external QR API biar gak butuh deps tambahan di CDS bundle
    setQrSrc(`https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&data=${encodeURIComponent(url)}`);
  }, [filmId, filmTitle, purchaseId]);

  if (!qrSrc) return null;
  return (
    <div style={{ marginTop: 14, padding: "16px 22px", background: "linear-gradient(180deg, rgba(251,191,36,0.06), rgba(251,191,36,0.02))", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 14, display: "flex", gap: 18, alignItems: "center", maxWidth: 520 }}>
      <img src={qrSrc} alt="QR rating" style={{ width: 120, height: 120, background: "#fff", borderRadius: 10, padding: 4, boxSizing: "content-box" }} />
      <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "#fbbf24", letterSpacing: 1.8, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>📱 RATE FILM INI</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", marginTop: 4, letterSpacing: -0.3, lineHeight: 1.2 }}>Scan QR dengan HP</div>
        <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 4, lineHeight: 1.45 }}>
          Beri rating + komentar setelah nonton. Insight Anda bantu kami pilih film terbaik 🎬
        </div>
      </div>
    </div>
  );
}

// CdsSeatMap — read-only seat layout untuk display di CDS. Row A di bawah (cinema standard).
function CdsSeatMap({ seatData, selectedSeats }) {
  const sel = new Set(selectedSeats || []);
  const sold = new Set(seatData.sold || []);
  const held = new Set(seatData.held_by_others || []);

  // Use seat_map kalau ada, else fallback grid
  const rows = Array.isArray(seatData.seat_map) && seatData.seat_map.length > 0
    ? seatData.seat_map
    : Array.from({ length: seatData.rows || 0 }, (_, r) =>
        Array.from({ length: seatData.cols || 0 }, (_, c) => ({
          type: "regular",
          label: `${String.fromCharCode(65 + r)}${c + 1}`,
        }))
      );
  const rowLabels = rows.map((row, r) => {
    const first = row?.find(c => c && c.type !== "void" && c.label);
    const m = first?.label?.match(/^([A-Za-z]+)/);
    return m ? m[1] : String.fromCharCode(65 + r);
  });

  return (
    <div style={{ padding: 12, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflowX: "auto" }}>
      {/* SCREEN */}
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <div style={{ height: 4, background: "linear-gradient(90deg,transparent,#a855f7,transparent)", borderRadius: 3, marginBottom: 4, boxShadow: "0 0 20px rgba(168,85,247,0.5)" }} />
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: 5, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>L A Y A R</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column-reverse", gap: 4, alignItems: "center" }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ width: 22, fontSize: 10, color: "#7d8590", fontFamily: "'Geist Mono',monospace", fontWeight: 800, textAlign: "center" }}>{rowLabels[ri]}</span>
            {row.map((cell, ci) => {
              const isVoid = !cell || cell.type === "void";
              if (isVoid) return <div key={ci} style={{ width: 22, height: 22 }} />;
              const seat = cell.label || `${rowLabels[ri]}${ci + 1}`;
              const type = cell.type || "regular";
              const isSel = sel.has(seat);
              const isSold = sold.has(seat);
              const isHeld = held.has(seat);
              const baseColor = SEAT_COLOR[type] || "#10b981";
              return (
                <div key={ci} title={`${seat} · ${type}`} style={{
                  width: 22, height: 22, borderRadius: 5,
                  background: isSold ? "rgba(239,68,68,0.25)"
                            : isHeld ? "rgba(234,179,8,0.2)"
                            : isSel ? "linear-gradient(135deg,#f59e0b,#fbbf24)"
                            : `${baseColor}22`,
                  border: `1px solid ${isSold ? "rgba(239,68,68,0.4)" : isHeld ? "rgba(234,179,8,0.4)" : isSel ? "rgba(245,158,11,0.7)" : `${baseColor}66`}`,
                  fontSize: 8, color: isSel ? "#111" : isSold ? "#ef4444" : isHeld ? "#eab308" : baseColor,
                  fontFamily: "'Geist Mono',monospace", fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: isSel ? "0 0 0 1px rgba(245,158,11,0.5), 0 2px 8px rgba(245,158,11,0.3)" : "none",
                  animation: isSel ? "kdsCellPulse 1s ease-in-out infinite" : "none",
                }}>
                  {ci + 1}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <style>{`@keyframes kdsCellPulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.1) } }`}</style>
      {/* Legend */}
      <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginTop: 10, fontSize: 10, color: "#9ca3af", fontFamily: "'Geist Mono',monospace" }}>
        <span>🟨 PILIHAN KAMU</span>
        <span style={{ color: "#10b981" }}>● TERSEDIA</span>
        <span style={{ color: "#ef4444" }}>● TERJUAL</span>
      </div>
    </div>
  );
}

function Info({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#7d8590", fontFamily: "'Geist Mono',monospace", letterSpacing: 1.5, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color, marginTop: 3 }}>{value}</div>
    </div>
  );
}
