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
import { HelpButton } from "../components/HelpModal.jsx";

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
  const [carouselIdx, setCarouselIdx] = useState(0);
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

  // Initial fetch current state + showtimes (carousel idle)
  useEffect(() => {
    fetch(`${API_HOST}/api/cinema/cds/state`).then(r => r.json()).then(setState).catch(() => {});
    fetch(`${API_HOST}/api/cinema/showtimes`).then(r => r.json()).then(d => setShowtimes(d.showtimes || [])).catch(() => {});
  }, []);

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

  // Carousel rotating showtimes when idle
  useEffect(() => {
    if (state.stage !== "idle") return;
    const id = setInterval(() => setCarouselIdx(i => i + 1), 7000);
    return () => clearInterval(id);
  }, [state.stage]);

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
  // STAGE: IDLE (default — branding + today's showtimes carousel)
  // ═══════════════════════════════════════════════
  const today = new Date().toISOString().slice(0, 10);
  const todayShows = showtimes.filter(s => s.show_date === today).slice(0, 12);
  const currentShow = todayShows[carouselIdx % Math.max(1, todayShows.length)];
  return (
    <Shell now={now} outlet={state.outlet} bgUrl={branding.bgUrl}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center", justifyContent: "center", padding: 30, textAlign: "center", gap: 14 }}>
        <div style={{ fontSize: 96, lineHeight: 1, filter: "drop-shadow(0 0 32px rgba(168,85,247,0.4))" }}>🎬</div>
        <div style={{ fontSize: 14, color: "#a855f7", letterSpacing: 4, fontFamily: "'Geist Mono',monospace", fontWeight: 800, lineHeight: 1, margin: 0 }}>karyaOS CINEMA</div>
        <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: -1.2, color: "#fff", lineHeight: 1.1, margin: 0, textShadow: branding.bgUrl ? "0 2px 16px rgba(0,0,0,0.8)" : "none" }}>Selamat Datang</div>
        <div style={{ fontSize: 16, color: branding.bgUrl ? "#e6edf3" : "#9ca3af", maxWidth: 600, lineHeight: 1.5, margin: 0, textShadow: branding.bgUrl ? "0 1px 6px rgba(0,0,0,0.8)" : "none" }}>{branding.idleText || "Silakan pilih film & jadwal di counter — kasir akan bantu pesanan Anda"}</div>

        {/* Rotating showtime carousel — extra spacing from welcome text */}
        {currentShow && (
          <div style={{ marginTop: 28, maxWidth: 700, width: "100%", padding: 22, background: "linear-gradient(180deg, rgba(168,85,247,0.08), rgba(168,85,247,0.02))", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 18, boxShadow: "0 16px 48px rgba(0,0,0,0.4)" }}>
            <div style={{ fontSize: 11, color: "#c084fc", letterSpacing: 3, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>TAYANG HARI INI</div>
            <div style={{ display: "flex", gap: 18, marginTop: 14, alignItems: "center" }}>
              {currentShow.poster_url ? (
                <img src={currentShow.poster_url} alt="" style={{ width: 100, height: 150, objectFit: "cover", borderRadius: 10 }} />
              ) : (
                <div style={{ width: 100, height: 150, background: "#1a1b1e", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>🎞️</div>
              )}
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>{currentShow.film_title}</div>
                <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>{currentShow.genre || ""} · {currentShow.duration_min} mnt · {currentShow.film_rating}</div>
                <div style={{ fontSize: 18, color: "#fbbf24", marginTop: 8, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>{currentShow.start_time} · {currentShow.studio_name}</div>
                <div style={{ fontSize: 14, color: "#10b981", marginTop: 4, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{rp(currentShow.price)}</div>
              </div>
            </div>
            <div style={{ marginTop: 14, display: "flex", justifyContent: "center", gap: 4 }}>
              {todayShows.map((_, i) => (
                <span key={i} style={{ width: 6, height: 6, borderRadius: 999, background: i === (carouselIdx % todayShows.length) ? "#c084fc" : "rgba(255,255,255,0.2)" }} />
              ))}
            </div>
          </div>
        )}
      </div>
      <HelpButton helpKey="cinema-cds" position="bottom-right" />
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
