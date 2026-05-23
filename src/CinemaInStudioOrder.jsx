// karyaOS — Customer in-studio QR-order (scan QR di kursi → pesan F&B)
// Route: ?cinema-snack[&studio_id=X&studio_name=...&seat=A1&showtime_id=N]
// Customer pesan combo F&B mid-movie → masuk antrian admin → diantar ke kursi.
import { useState, useEffect } from "react";
import DelightPopup from "./components/DelightPopup.jsx";

const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const BG = "#050810";

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
      <div style={{ position: "fixed", inset: 0, background: BG, color: "#e6edf3", fontFamily: "'Inter',sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <DelightPopup
          show={showDelight}
          emoji="🍿"
          title="Pesanan diterima!"
          sub={`Snack akan diantar ke kursi ${done.seat} dalam 5-10 menit. Order ${done.order_code}.`}
          accent="#f59e0b"
          onClose={() => setShowDelight(false)}
        />
        <div style={{ fontSize: 64 }}>🎬🍿</div>
        <div style={{ fontSize: 26, fontWeight: 800, marginTop: 10 }}>Pesanan masuk!</div>
        <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 6 }}>Order <b style={{ color: "#fbbf24", fontFamily: "'Geist Mono',monospace", letterSpacing: 1.5 }}>{done.order_code}</b></div>
        <div style={{ background: "#0d1117", border: "1px solid #1b212c", borderRadius: 14, padding: 18, marginTop: 18, minWidth: 280, textAlign: "left", maxWidth: 380 }}>
          <Line k="Kursi" v={<b style={{ fontSize: 17 }}>{done.seat}</b>} />
          {studioName && <Line k="Studio" v={studioName} />}
          <div style={{ borderTop: "1px solid #1b212c", marginTop: 8, paddingTop: 8 }}>
            {done.items.map((it, i) => (
              <Line key={i} k={`${it.qty}× ${it.bundle_name}`} v={rp(it.qty * it.price)} />
            ))}
          </div>
          <div style={{ borderTop: "1px solid #1b212c", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
            <b>Total</b><b style={{ color: "#10b981", fontFamily: "'Geist Mono',monospace" }}>{rp(done.total)}</b>
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: "#fbbf24", marginTop: 14, maxWidth: 380, lineHeight: 1.5 }}>
          🍿 Staff akan antar ke kursi <b>{done.seat}</b>. Bayar saat barang sampai.
        </div>
        <button onClick={reset} style={{ marginTop: 22, background: "#a855f7", border: "none", borderRadius: 12, padding: "14px 32px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          Pesan Lagi
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, color: "#e6edf3", fontFamily: "'Inter',sans-serif", overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "18px 20px", borderBottom: "1px solid #161b22", flexShrink: 0 }}>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>🍿 karya<span style={{ color: "#f59e0b" }}>OS</span> Cinema — In-Studio Snack</div>
        <div style={{ fontSize: 12, color: "#7d8590", marginTop: 3 }}>
          {studioName ? `${studioName} · ` : ""}Pesan combo langsung dari kursi · diantar staff
        </div>
      </div>

      <div style={{ flex: 1, padding: "20px", maxWidth: 720, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {msg && <div style={{ background: "#ef444415", border: "1px solid #ef444444", borderRadius: 10, padding: "10px 14px", color: "#fca5a5", fontSize: 13, marginBottom: 14 }}>{msg}</div>}

        <div style={{ background: "#0d1117", border: "1px solid #1b212c", borderRadius: 14, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#a78bfa", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 10 }}>📍 KIRIM KE</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input value={seat} onChange={e => setSeat(e.target.value.toUpperCase())} placeholder="Kursi (mis: B5)" style={inp} />
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nama (opsional)" style={inp} />
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="WA (opsional)" style={inp} />
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Catatan (mis: tanpa garam)" style={inp} />
          </div>
        </div>

        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 14, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>🍿 MENU</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>
          {menu.map(m => {
            const qty = cart[m.id] || 0;
            return (
              <div key={m.id} style={{ background: "#0d1117", border: `1px solid ${qty ? "#f59e0baa" : "#1b212c"}`, borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{m.name}</div>
                  <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, color: "#10b981", fontWeight: 700 }}>{rp(m.price)}</div>
                </div>
                {m.description && <div style={{ fontSize: 11.5, color: "#7d8590", marginTop: 4, lineHeight: 1.4 }}>{m.description}</div>}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: "#5b6470" }}>{qty > 0 ? rp(qty * m.price) : ""}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button onClick={() => dec(m.id)} disabled={!qty} style={stepBtn(qty > 0)}>−</button>
                    <span style={{ fontFamily: "'Geist Mono',monospace", minWidth: 22, textAlign: "center", fontWeight: 700 }}>{qty}</span>
                    <button onClick={() => inc(m.id)} style={stepBtn(true)}>+</button>
                  </div>
                </div>
              </div>
            );
          })}
          {menu.length === 0 && <div style={{ color: "#5b6470", fontSize: 13 }}>Menu belum tersedia.</div>}
        </div>
      </div>

      <div style={{ flexShrink: 0, borderTop: "1px solid #161b22", background: "#0a0e16", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "#7d8590" }}>
          {items.length} item · <b style={{ fontFamily: "'Geist Mono',monospace", color: "#10b981", fontSize: 16 }}>{rp(total)}</b>
        </div>
        <button onClick={submit} disabled={busy || !items.length || !seat.trim()}
          style={{
            background: (busy || !items.length || !seat.trim()) ? "#1b212c" : "#f59e0b",
            border: "none", borderRadius: 12, padding: "13px 28px",
            color: (busy || !items.length || !seat.trim()) ? "#5b6470" : "#111",
            fontSize: 14, fontWeight: 800, fontFamily: "inherit",
            cursor: (busy || !items.length || !seat.trim()) ? "not-allowed" : "pointer",
          }}>
          {busy ? "Mengirim…" : "🍿 Kirim Pesanan"}
        </button>
      </div>
    </div>
  );
}

function Line({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, fontSize: 13, padding: "4px 0" }}>
      <span style={{ color: "#7d8590" }}>{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );
}
const inp = { background: "#0a0e16", border: "1px solid #2a2b30", borderRadius: 9, padding: "10px 12px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };
function stepBtn(active) {
  return {
    width: 30, height: 30, borderRadius: 8, fontSize: 16, fontWeight: 800, fontFamily: "inherit",
    background: active ? "#f59e0b22" : "#1b212c", border: `1px solid ${active ? "#f59e0b88" : "#2a2b30"}`,
    color: active ? "#fbbf24" : "#5b6470", cursor: active ? "pointer" : "not-allowed",
  };
}
