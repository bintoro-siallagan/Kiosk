// karyaOS — Customer in-studio QR-order (scan QR di kursi → pesan F&B)
// Route: ?cinema-snack[&studio_id=X&studio_name=...&seat=A1&showtime_id=N]
// Customer pesan combo F&B mid-movie → masuk antrian admin → diantar ke kursi.
import { useState, useEffect } from "react";
import DelightPopup from "./components/DelightPopup.jsx";

const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const BG = "#050810";
const BG_GRADIENT = "linear-gradient(160deg, #050810 0%, #0c0f1a 50%, #08090f 100%)";
const BG_MESH = "radial-gradient(800px 600px at 20% 10%, rgba(168,85,247,0.06), transparent 70%), radial-gradient(600px 400px at 80% 80%, rgba(245,158,11,0.05), transparent 70%)";

export default function CinemaInStudioOrder({ apiBase }) {
  const base = `${apiBase || ""}/api/cinema`;
  const params = new URLSearchParams(window.location.search);
  const initialSeat   = params.get("seat") || "";
  const studioId      = params.get("studio_id") || params.get("studio") || "";
  const studioName    = params.get("studio_name") || "";
  const showtimeId    = params.get("showtime_id") || params.get("showtime") || "";

  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState({});  // { id: qty }
  const [seat, setSeat] = useState(initialSeat);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [showDelight, setShowDelight] = useState(false);

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

  async function submit() {
    if (!items.length) { setMsg("Pilih minimal 1 item."); return; }
    if (!seat.trim())  { setMsg("Nomor kursi wajib diisi."); return; }
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
          items: items.map(it => ({ bundle_id: it.bundle_id, qty: it.qty })),
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Gagal kirim");
      setDone({ ...d, seat: seat.trim(), studioName });
      setShowDelight(true);
    } catch (e) { setMsg("⚠ " + e.message); }
    setBusy(false);
  }

  const reset = () => { setCart({}); setNotes(""); setDone(null); setMsg(""); };

  if (done) {
    return (
      <div style={{ position: "fixed", inset: 0, background: BG_GRADIENT, color: "#e6edf3", fontFamily: "'Inter',sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <div aria-hidden style={{ position: "fixed", inset: 0, background: BG_MESH, pointerEvents: "none" }} />
        <style>{`@keyframes karyaIsoBounce { 0% { opacity: 0; transform: translateY(20px) scale(0.92); } 60% { opacity: 1; transform: translateY(-4px) scale(1.02); } 100% { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
        <DelightPopup
          show={showDelight}
          emoji="🍿"
          title="Pesanan diterima!"
          sub={`Snack akan diantar ke kursi ${done.seat} dalam 5-10 menit. Order ${done.order_code}.`}
          accent="#f59e0b"
          onClose={() => setShowDelight(false)}
        />
        <div style={{ position: "relative", zIndex: 1, animation: "karyaIsoBounce 0.6s cubic-bezier(.2,.7,.3,1)" }}>
          <div style={{ fontSize: 64 }}>🎬🍿</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 10, letterSpacing: -0.6 }}>Pesanan masuk!</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>Order <b style={{ color: "#fbbf24", fontFamily: "'Geist Mono',monospace", letterSpacing: 1.5 }}>{done.order_code}</b></div>
          <div style={{ position: "relative", background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 20, marginTop: 18, minWidth: 280, textAlign: "left", maxWidth: 380, overflow: "hidden", boxShadow: "0 16px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
            <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(400px 200px at 50% 0%, rgba(245,158,11,0.08), transparent 70%)", pointerEvents: "none" }} />
            <div style={{ position: "relative" }}>
              <Line k="Kursi" v={<b style={{ fontSize: 18, letterSpacing: -0.3 }}>{done.seat}</b>} />
              {studioName && <Line k="Studio" v={studioName} />}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 10, paddingTop: 10 }}>
                {done.items.map((it, i) => (
                  <Line key={i} k={`${it.qty}× ${it.bundle_name}`} v={rp(it.qty * it.price)} />
                ))}
              </div>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 10, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <b style={{ fontSize: 14, letterSpacing: -0.3 }}>Total</b><b style={{ color: "#10b981", fontFamily: "'Geist Mono',monospace", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>{rp(done.total)}</b>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: "#fbbf24", marginTop: 14, maxWidth: 380, lineHeight: 1.5 }}>
            🍿 Staff akan antar ke kursi <b>{done.seat}</b>. Bayar saat barang sampai.
          </div>
          <button onClick={reset} style={{ marginTop: 22, background: "linear-gradient(135deg,#a855f7,#c084fc)", border: "none", borderRadius: 12, padding: "14px 32px", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 12px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.2)", letterSpacing: 0.3, transition: "transform 0.15s ease, filter 0.15s ease" }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.filter = "brightness(1.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.filter = "none"; }}>
            Pesan Lagi
          </button>
        </div>
      </div>
    );
  }

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
          {studioName ? `${studioName} · ` : ""}Pesan combo langsung dari kursi · diantar staff
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
        <button onClick={submit} disabled={busy || !items.length || !seat.trim()} className="karya-iso-submit"
          style={{
            background: (busy || !items.length || !seat.trim()) ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg,#f59e0b,#fbbf24)",
            border: "none", borderRadius: 12, padding: "13px 28px",
            color: (busy || !items.length || !seat.trim()) ? "rgba(255,255,255,0.35)" : "#111",
            fontSize: 14, fontWeight: 800, fontFamily: "inherit", letterSpacing: 0.3,
            cursor: (busy || !items.length || !seat.trim()) ? "not-allowed" : "pointer",
            boxShadow: (busy || !items.length || !seat.trim()) ? "none" : "0 4px 12px rgba(245,158,11,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
          }}>
          {busy ? "Mengirim…" : "🍿 Kirim Pesanan"}
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
