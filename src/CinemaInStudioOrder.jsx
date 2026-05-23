// karyaOS — Customer in-studio QR-order (scan QR di kursi → pesan F&B → BAYAR LANGSUNG → diantar)
// Route: ?cinema-snack[&studio_id=X&studio_name=...&seat=A1&showtime_id=N]
// Flow: menu → pay (QRIS) → submit order → done
//       Customer wajib bayar dulu (QRIS) sebelum order masuk antrian staff.
import { useState, useEffect, useRef } from "react";

const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const BG = "#050810";
const BG_GRADIENT = "linear-gradient(160deg, #050810 0%, #0c0f1a 50%, #08090f 100%)";
const BG_MESH = "radial-gradient(800px 600px at 20% 10%, rgba(168,85,247,0.06), transparent 70%), radial-gradient(600px 400px at 80% 80%, rgba(245,158,11,0.05), transparent 70%)";

export default function CinemaInStudioOrder({ apiBase }) {
  const base = `${apiBase || ""}/api/cinema`;
  const root = apiBase || "";
  const params = new URLSearchParams(window.location.search);
  const initialSeat   = params.get("seat") || "";
  const studioId      = params.get("studio_id") || params.get("studio") || "";
  const studioName    = params.get("studio_name") || "";
  const showtimeId    = params.get("showtime_id") || params.get("showtime") || "";

  // STAGE — menu | pay | done
  const [stage, setStage] = useState("menu");

  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState({});  // { id: qty }
  const [seat, setSeat] = useState(initialSeat);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // PAYMENT state
  const [payOrderId, setPayOrderId] = useState(null);   // internal order id used as payment ref
  const [qrData, setQrData] = useState(null);            // { qrString, qrUrl, deeplinkUrl, midtransOrderId, expiryTime }
  const [paid, setPaid] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    fetch(`${base}/in-studio/menu`).then(r => r.json()).then(d => setMenu(d.items || [])).catch(() => {});
  }, [base]);

  const inc = (id) => setCart(c => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const dec = (id) => setCart(c => {
    const n = (c[id] || 0) - 1; const o = { ...c };
    if (n <= 0) delete o[id]; else o[id] = n;
    return o;
  });
  const items = Object.entries(cart).map(([id, qty]) => {
    const m = menu.find(x => x.id === parseInt(id, 10));
    return m ? { bundle_id: m.id, qty, name: m.name, price: m.price } : null;
  }).filter(Boolean);
  const total = items.reduce((a, it) => a + it.qty * it.price, 0);

  // STAGE 1 — Proceed to payment
  async function proceedPay() {
    if (!items.length) { setMsg("Pilih minimal 1 item."); return; }
    if (!seat.trim())  { setMsg("Nomor kursi wajib diisi."); return; }
    setBusy(true); setMsg(""); setPaid(false); setQrData(null);
    try {
      const orderId = `ISO-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      setPayOrderId(orderId);
      const r = await fetch(`${root}/api/payment/qris`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          amount: total,
          items: items.map(it => ({ n: it.name, p: it.price, q: it.qty, id: `bundle-${it.bundle_id}` })),
          customerName: name.trim() || `Seat ${seat}`,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Gagal generate QRIS");
      setQrData(d);
      setStage("pay");
    } catch (e) { setMsg("⚠ " + e.message); }
    setBusy(false);
  }

  // STAGE 2 — Poll payment status while in pay stage
  useEffect(() => {
    if (stage !== "pay" || !payOrderId) return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${root}/api/payment/check/${payOrderId}`);
        const d = await r.json();
        if (d.paid) {
          setPaid(true);
          clearInterval(pollRef.current);
          // Auto-submit order to kitchen now that payment is confirmed
          submitPaidOrder();
        }
      } catch {}
    }, 3000);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, payOrderId]);

  // STAGE 3 — Submit paid order to kitchen
  async function submitPaidOrder() {
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`${base}/in-studio/orders`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          showtime_id: showtimeId || undefined,
          studio_id:   studioId   || undefined,
          studio_name: studioName || undefined,
          seat: seat.trim(),
          buyer_name: name.trim() || undefined,
          buyer_phone: phone.trim() || undefined,
          notes: notes.trim() || undefined,
          payment_ref: payOrderId,
          payment_method: "qris",
          payment_amount: total,
          paid: true,
          items: items.map(it => ({ bundle_id: it.bundle_id, qty: it.qty })),
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Gagal kirim ke dapur");
      setDone({ ...d, seat: seat.trim(), studioName, total, payment_ref: payOrderId });
      setStage("done");
    } catch (e) { setMsg("⚠ Bayar sukses, tapi gagal kirim ke staff: " + e.message); }
    setBusy(false);
  }

  // Manual confirm — kalau backend webhook lagi delay, customer bisa "Saya sudah bayar"
  async function manualConfirm() {
    if (!payOrderId) return;
    setBusy(true);
    try {
      const r = await fetch(`${root}/api/payment/check/${payOrderId}`);
      const d = await r.json();
      if (d.paid) {
        setPaid(true);
        clearInterval(pollRef.current);
        submitPaidOrder();
      } else {
        setMsg("Status pembayaran belum confirmed. Coba lagi beberapa detik.");
      }
    } catch (e) { setMsg("⚠ " + e.message); }
    setBusy(false);
  }

  const cancelPay = () => {
    clearInterval(pollRef.current);
    setStage("menu"); setPayOrderId(null); setQrData(null); setPaid(false); setMsg("");
  };

  const reset = () => {
    clearInterval(pollRef.current);
    setCart({}); setNotes(""); setDone(null); setMsg("");
    setStage("menu"); setPayOrderId(null); setQrData(null); setPaid(false);
  };

  // ═══════════════════════════════════════════════
  // STAGE: DONE
  // ═══════════════════════════════════════════════
  if (stage === "done" && done) {
    return (
      <div style={{ position: "fixed", inset: 0, background: BG_GRADIENT, color: "#e6edf3", fontFamily: "'Inter',sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <div aria-hidden style={{ position: "fixed", inset: 0, background: BG_MESH, pointerEvents: "none" }} />
        <style>{`@keyframes karyaIsoBounce { 0% { opacity: 0; transform: translateY(20px) scale(0.92); } 60% { opacity: 1; transform: translateY(-4px) scale(1.02); } 100% { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
        <div style={{ position: "relative", zIndex: 1, animation: "karyaIsoBounce 0.6s cubic-bezier(.2,.7,.3,1)", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, width: "100%", maxWidth: 420 }}>
          <div style={{ fontSize: 56, lineHeight: 1, filter: "drop-shadow(0 0 24px rgba(16,185,129,0.35))" }}>✅</div>
          <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.2, letterSpacing: -0.6, color: "#10b981", margin: 0 }}>Pembayaran sukses!</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.4, margin: 0 }}>Order <b style={{ color: "#fbbf24", fontFamily: "'Geist Mono',monospace", letterSpacing: 1.5 }}>{done.order_code}</b></div>
          <div style={{ position: "relative", background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 20, minWidth: 280, textAlign: "left", width: "100%", boxSizing: "border-box", overflow: "hidden", boxShadow: "0 16px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
            <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(400px 200px at 50% 0%, rgba(16,185,129,0.08), transparent 70%)", pointerEvents: "none" }} />
            <div style={{ position: "relative" }}>
              <Line k="Kursi" v={<b style={{ fontSize: 18, letterSpacing: -0.3 }}>{done.seat}</b>} />
              {studioName && <Line k="Studio" v={studioName} />}
              <Line k="Bayar via" v={<span style={{ color: "#10b981", fontWeight: 800 }}>QRIS ✓</span>} />
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 10, paddingTop: 10 }}>
                {(done.items || []).map((it, i) => (
                  <Line key={i} k={`${it.qty}× ${it.bundle_name}`} v={rp(it.qty * it.price)} />
                ))}
              </div>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 10, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <b style={{ fontSize: 14, letterSpacing: -0.3 }}>Total Dibayar</b>
                <b style={{ color: "#10b981", fontFamily: "'Geist Mono',monospace", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>{rp(done.total)}</b>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: "#10b981", maxWidth: 380, lineHeight: 1.5, margin: 0 }}>
            ✓ Sudah dibayar via QRIS — staff sedang menyiapkan pesanan. Antar ke kursi <b>{done.seat}</b>.
          </div>
          <button onClick={reset} style={{ marginTop: 6, background: "linear-gradient(135deg,#a855f7,#c084fc)", border: "none", borderRadius: 12, padding: "14px 32px", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 12px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.2)", letterSpacing: 0.3, transition: "transform 0.15s ease, filter 0.15s ease" }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.filter = "brightness(1.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.filter = "none"; }}>
            Pesan Lagi
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // STAGE: PAY (QRIS)
  // ═══════════════════════════════════════════════
  if (stage === "pay") {
    const qrSrc = qrData?.qrUrl || (qrData?.qrString && qrData.qrString.startsWith("http") ? qrData.qrString : null);
    return (
      <div style={{ position: "fixed", inset: 0, background: BG_GRADIENT, color: "#e6edf3", fontFamily: "'Inter',sans-serif", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div aria-hidden style={{ position: "fixed", inset: 0, background: BG_MESH, pointerEvents: "none", zIndex: 0 }} />
        {/* Header */}
        <div style={{ position: "relative", zIndex: 1, padding: "18px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(8,9,15,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", flexShrink: 0 }}>
          <button onClick={cancelPay} disabled={busy || paid} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 6 }}>← Batal</button>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 800, letterSpacing: -0.4 }}>📱 Bayar dengan QRIS</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>
            Scan QR pakai e-wallet (GoPay/OVO/DANA/ShopeePay) atau mobile banking
          </div>
        </div>

        <div style={{ position: "relative", zIndex: 1, flex: 1, padding: "20px", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box", textAlign: "center" }}>
          {msg && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "10px 14px", color: "#fca5a5", fontSize: 13, marginBottom: 14, textAlign: "left" }}>{msg}</div>}

          {/* Amount banner */}
          <div style={{ background: "linear-gradient(180deg, rgba(245,158,11,0.08), rgba(245,158,11,0.02))", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 14, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: "#fbbf24", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 6 }}>JUMLAH BAYAR</div>
            <div style={{ fontSize: 38, fontWeight: 900, color: "#fbbf24", fontFamily: "'Geist Mono',monospace", letterSpacing: -1 }}>{rp(total)}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 6, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>Ref: {payOrderId}</div>
          </div>

          {/* QR Code */}
          {paid ? (
            <div style={{ background: "rgba(16,185,129,0.08)", border: "2px solid #10b981", borderRadius: 18, padding: 32, marginBottom: 16 }}>
              <div style={{ fontSize: 72 }}>✅</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#10b981", marginTop: 10, letterSpacing: -0.5 }}>PEMBAYARAN SUKSES</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>{busy ? "Mengirim pesanan ke staff…" : "Menyiapkan order…"}</div>
            </div>
          ) : qrSrc ? (
            <div style={{ background: "#fff", borderRadius: 18, padding: 20, marginBottom: 16, display: "inline-block" }}>
              <img src={qrSrc} alt="QR Code" style={{ width: 240, height: 240, display: "block" }} />
            </div>
          ) : qrData?.qrString ? (
            <div style={{ background: "#fff", borderRadius: 18, padding: 20, marginBottom: 16, display: "inline-block" }}>
              <div style={{ width: 240, height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontSize: 11, padding: 10, fontFamily: "'Geist Mono',monospace", wordBreak: "break-all", textAlign: "center" }}>{qrData.qrString.slice(0, 200)}…</div>
            </div>
          ) : (
            <div style={{ padding: 80, color: "rgba(255,255,255,0.4)" }}>⏳ Generating QR…</div>
          )}

          {!paid && (
            <>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 16, lineHeight: 1.5 }}>
                1. Buka e-wallet / mobile banking<br />
                2. Scan QR code di atas<br />
                3. Konfirmasi pembayaran <b style={{ color: "#fbbf24" }}>{rp(total)}</b>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 11, color: "#fbbf24", marginBottom: 12 }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: "#fbbf24", animation: "karyaPulse 1.2s ease-in-out infinite" }} />
                Menunggu pembayaran…
              </div>
              <style>{`@keyframes karyaPulse { 0%,100% { opacity:0.4 } 50% { opacity:1 } }`}</style>
              {qrData?.deeplinkUrl && (
                <a href={qrData.deeplinkUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginBottom: 10, padding: "10px 18px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#fbbf24", textDecoration: "none", fontSize: 12, fontWeight: 700 }}>📱 Buka di e-wallet ↗</a>
              )}
              <div>
                <button onClick={manualConfirm} disabled={busy} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "11px 22px", color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, cursor: busy ? "wait" : "pointer", fontFamily: "inherit" }}>
                  {busy ? "Mengecek…" : "Saya sudah bayar — cek status"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // STAGE: MENU (default)
  // ═══════════════════════════════════════════════
  return (
    <div style={{ position: "fixed", inset: 0, background: BG_GRADIENT, color: "#e6edf3", fontFamily: "'Inter',sans-serif", overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, background: BG_MESH, pointerEvents: "none", zIndex: 0 }} />
      <style>{`
        .karya-iso-input { transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease; }
        .karya-iso-input:focus { border-color: rgba(245,158,11,0.5) !important; box-shadow: 0 0 0 3px rgba(245,158,11,0.15) !important; background: rgba(255,255,255,0.04) !important; }
        .karya-iso-menu-card { transition: transform 0.18s ease, border-color 0.2s ease, box-shadow 0.2s ease; }
        .karya-iso-menu-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04); }
        .karya-iso-submit:not(:disabled):hover { transform: translateY(-1px); filter: brightness(1.08); box-shadow: 0 8px 24px rgba(245,158,11,0.4), inset 0 1px 0 rgba(255,255,255,0.25) !important; }
        .karya-iso-submit { transition: transform 0.15s ease, filter 0.15s ease, box-shadow 0.15s ease; }
      `}</style>
      <div style={{ position: "relative", zIndex: 1, padding: "18px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(8,9,15,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", flexShrink: 0 }}>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 800, letterSpacing: -0.4 }}>🍿 karya<span style={{ color: "#f59e0b" }}>OS</span> Cinema — In-Studio Snack</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>
          {studioName ? `${studioName} · ` : ""}Pesan combo · <b style={{ color: "#fbbf24" }}>bayar QRIS</b> · diantar staff
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 1, flex: 1, padding: "20px", maxWidth: 720, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {msg && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "10px 14px", color: "#fca5a5", fontSize: 13, marginBottom: 14, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>{msg}</div>}

        <div style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 16, marginBottom: 16, boxShadow: "0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
          <div style={{ fontSize: 10, color: "#a78bfa", letterSpacing: 2, textTransform: "uppercase", fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 10 }}>📍 KIRIM KE</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input value={seat} onChange={e => setSeat(e.target.value.toUpperCase())} placeholder="Kursi (mis: B5)" className="karya-iso-input" style={inp} />
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nama (opsional)" className="karya-iso-input" style={inp} />
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="WA (opsional)" className="karya-iso-input" style={inp} />
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Catatan (mis: tanpa garam)" className="karya-iso-input" style={inp} />
          </div>
        </div>

        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10, color: "rgba(255,255,255,0.5)" }}>🍿 MENU</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>
          {menu.map(m => {
            const qty = cart[m.id] || 0;
            return (
              <div key={m.id} className="karya-iso-menu-card" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))", border: `1px solid ${qty ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.06)"}`, borderRadius: 14, padding: 14, boxShadow: qty ? "0 8px 24px rgba(245,158,11,0.15), inset 0 1px 0 rgba(255,255,255,0.05)" : "0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, flex: 1, letterSpacing: -0.3 }}>{m.name}</div>
                  <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, color: "#10b981", fontWeight: 800 }}>{rp(m.price)}</div>
                </div>
                {m.description && <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)", marginTop: 4, lineHeight: 1.4 }}>{m.description}</div>}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{qty > 0 ? rp(qty * m.price) : ""}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button onClick={() => dec(m.id)} disabled={!qty} style={stepBtn(qty > 0)}>−</button>
                    <span style={{ fontFamily: "'Geist Mono',monospace", minWidth: 22, textAlign: "center", fontWeight: 800 }}>{qty}</span>
                    <button onClick={() => inc(m.id)} style={stepBtn(true)}>+</button>
                  </div>
                </div>
              </div>
            );
          })}
          {menu.length === 0 && <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Menu belum tersedia.</div>}
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 1, flexShrink: 0, borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(8,9,15,0.78)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
          {items.length} item · <b style={{ fontFamily: "'Geist Mono',monospace", color: "#10b981", fontSize: 18, fontWeight: 800, letterSpacing: -0.4 }}>{rp(total)}</b>
        </div>
        <button onClick={proceedPay} disabled={busy || !items.length || !seat.trim()} className="karya-iso-submit"
          style={{
            background: (busy || !items.length || !seat.trim()) ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg,#f59e0b,#fbbf24)",
            border: "none", borderRadius: 12, padding: "13px 28px",
            color: (busy || !items.length || !seat.trim()) ? "rgba(255,255,255,0.35)" : "#111",
            fontSize: 14, fontWeight: 800, fontFamily: "inherit", letterSpacing: 0.3,
            cursor: (busy || !items.length || !seat.trim()) ? "not-allowed" : "pointer",
            boxShadow: (busy || !items.length || !seat.trim()) ? "none" : "0 4px 12px rgba(245,158,11,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
          }}>
          {busy ? "Loading…" : "📱 Bayar QRIS →"}
        </button>
      </div>
    </div>
  );
}

function Line({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, fontSize: 13, padding: "5px 0" }}>
      <span style={{ color: "rgba(255,255,255,0.55)" }}>{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );
}
const inp = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "11px 13px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };
function stepBtn(active) {
  return {
    width: 32, height: 32, borderRadius: 9, fontSize: 16, fontWeight: 800, fontFamily: "inherit",
    background: active ? "rgba(245,158,11,0.14)" : "rgba(255,255,255,0.04)", border: `1px solid ${active ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.08)"}`,
    color: active ? "#fbbf24" : "rgba(255,255,255,0.35)", cursor: active ? "pointer" : "not-allowed",
    boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,0.05)" : "none",
    transition: "background 0.15s ease, transform 0.12s ease",
  };
}
