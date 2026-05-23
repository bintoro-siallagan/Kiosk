// karyaOS — F&B Counter redemption scanner
// Scan ticket QR → resolve purchase_id → list F&B bundles → tap to redeem.
// Works with any keyboard-wedge USB QR scanner.
import { useState, useEffect, useRef } from "react";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtTs = (s) => s ? new Date(s * 1000).toLocaleString("id-ID", { hour12: false }) : "—";

export default function CinemaBundleRedeem({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/cinema";
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [ctx, setCtx] = useState(null);   // { ticket?, bundles, code }
  const [err, setErr] = useState("");
  const [staff, setStaff] = useState(localStorage.getItem("fnb_staff_name") || "");
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);

  async function resolve(input) {
    const c = (input || "").trim().toUpperCase();
    if (!c || busy) return;
    setBusy(true); setErr(""); setCtx(null);
    try {
      let purchaseId = null, ticket = null;
      if (c.startsWith("CT-")) {
        // Look up by ticket code — find purchase_id (use /tickets and filter, since validate would side-effect)
        const r = await fetch(`${base}/tickets`);
        const d = await r.json();
        ticket = (d.tickets || []).find(t => (t.code || "").toUpperCase() === c);
        if (!ticket) throw new Error(`Tiket ${c} tidak ditemukan`);
        purchaseId = ticket.purchase_id;
      } else if (c.startsWith("CP-")) {
        purchaseId = c;
      } else {
        throw new Error("Format kode tidak dikenal (gunakan CT-xxxx atau CP-xxxx)");
      }
      if (!purchaseId) throw new Error("Tiket ini tidak punya pembelian F&B");
      const r2 = await fetch(`${base}/purchase/${encodeURIComponent(purchaseId)}/bundles`);
      const d2 = await r2.json();
      const bundles = d2.bundles || [];
      if (!bundles.length) throw new Error("Tiket ini tidak ada combo F&B");
      setCtx({ code: c, ticket, purchase_id: purchaseId, bundles });
    } catch (e) {
      setErr(e.message || "Gagal lookup");
    }
    setBusy(false);
    setCode("");
    setTimeout(() => ref.current?.focus(), 60);
  }

  async function redeem(b) {
    if (b.redeemed_at) return;
    if (!staff?.trim() && !window.confirm("Belum mengisi nama staff F&B. Tetap redeem?")) return;
    if (staff?.trim()) localStorage.setItem("fnb_staff_name", staff.trim());
    const r = await fetch(`${base}/purchase-bundles/${b.id}/redeem`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redeemed_by: staff || "F&B counter" }),
    });
    const d = await r.json();
    if (!d.ok) { alert(d.error || "Gagal redeem"); return; }
    setCtx(cur => cur && ({
      ...cur,
      bundles: cur.bundles.map(x => x.id === b.id ? { ...x, redeemed_at: d.redeemed_at, redeemed_by: d.redeemed_by } : x),
    }));
  }

  const onKey = (e) => { if (e.key === "Enter") resolve(code); };
  const allDone = ctx?.bundles?.every(b => b.redeemed_at);
  const totalRedeemed = ctx?.bundles?.filter(b => b.redeemed_at).reduce((a, b) => a + b.qty * b.price, 0) || 0;
  const totalAll = ctx?.bundles?.reduce((a, b) => a + b.qty * b.price, 0) || 0;

  return (
    <div style={S.root}>
      <h2 style={S.title}>🍿 F&amp;B Redemption Counter</h2>
      <p style={S.sub}>Scan QR tiket cinema customer untuk menukar combo. Bisa juga ketik kode tiket (CT-…) atau kode pembelian (CP-…).</p>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 14 }}>
        <input ref={ref} value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={onKey}
          placeholder="Scan / ketik kode tiket — Enter" style={S.input} disabled={busy} autoFocus />
        <input value={staff} onChange={(e) => setStaff(e.target.value)} placeholder="Nama staff F&B (audit)" style={S.staffInput} />
      </div>

      {err && <div style={S.err}>❌ {err}</div>}

      {ctx && (
        <div style={{ background: C.card, border: `1px solid #f59e0b66`, borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: "#fbbf24", letterSpacing: 2, fontFamily: "'Geist Mono',monospace" }}>PURCHASE</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace" }}>{ctx.purchase_id}</div>
              {ctx.ticket && (
                <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>{ctx.ticket.film_title || ""} · {ctx.ticket.studio_name || ""} · {ctx.ticket.show_date} {ctx.ticket.start_time}</div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {allDone ? <span style={S.pill("#10b981")}>SEMUA SUDAH DI-REDEEM</span> : <span style={S.pill("#f59e0b")}>{ctx.bundles.filter(b => !b.redeemed_at).length} BELUM</span>}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ctx.bundles.map(b => {
              const done = !!b.redeemed_at;
              return (
                <div key={b.id} style={{
                  background: done ? "#0a1a10" : "#0a0e16",
                  border: `1px solid ${done ? "#10b98166" : "#2a2b30"}`,
                  borderRadius: 10, padding: "12px 14px",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap",
                }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>
                      <span style={{ fontFamily: "'Geist Mono',monospace", color: "#fbbf24", marginRight: 6 }}>{b.qty}×</span>
                      {b.bundle_name}
                    </div>
                    <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                      {rp(b.qty * b.price)} {done ? `· redeemed ${fmtTs(b.redeemed_at)} oleh ${b.redeemed_by || "—"}` : ""}
                    </div>
                  </div>
                  <button onClick={() => redeem(b)} disabled={done}
                    style={{
                      background: done ? "#10b98122" : "#f59e0b",
                      border: `1px solid ${done ? "#10b98166" : "transparent"}`,
                      color: done ? "#10b981" : "#111",
                      padding: "8px 18px", borderRadius: 9, fontSize: 13, fontWeight: 700,
                      cursor: done ? "default" : "pointer", fontFamily: "inherit",
                    }}>
                    {done ? "✓ DONE" : "Redeem"}
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.sub }}>
            <span>Total combo: <b style={{ color: "#fff" }}>{rp(totalAll)}</b></span>
            <span>Sudah redeem: <b style={{ color: "#10b981" }}>{rp(totalRedeemed)}</b></span>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  root:       { padding: 24, color: "#fafafa", maxWidth: 880, margin: "0 auto" },
  title:      { margin: "0 0 4px", fontSize: 24, fontWeight: 800 },
  sub:        { margin: "0 0 22px", color: "#9ca3af", fontSize: 13, lineHeight: 1.5 },
  input:      { padding: "14px 16px", fontSize: 16, fontFamily: "'Geist Mono',monospace", letterSpacing: 3, background: "#0d1117", border: "1px solid #2a2a2a", borderRadius: 12, color: "#fff", outline: "none", boxSizing: "border-box" },
  staffInput: { padding: "14px 16px", fontSize: 13, background: "#0d1117", border: "1px solid #2a2a2a", borderRadius: 12, color: "#fff", outline: "none", boxSizing: "border-box", fontFamily: "inherit" },
  err:        { background: "#ef444415", border: "1px solid #ef444466", color: "#fca5a5", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 14 },
  pill:       (color) => ({ background: color + "22", color, padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, letterSpacing: 1, fontFamily: "'Geist Mono',monospace" }),
};
