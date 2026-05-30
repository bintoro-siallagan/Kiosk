import { useState, useEffect } from "react";
import * as audio from "./audio.js";
import { api } from "./api.js";
import QRCode from "qrcode";
import { subscribeToOrderPush, isPushSupported } from "./lib/push.js";
import { printOrderBothViaLocalBridge } from "./lib/localPrint.js";
import PushPermissionPrompt from "./components/PushPermissionPrompt.jsx";

import { fmtMoney as fIDR } from "./lib/currency.js";

export default function DigitalReceipt({ orderId, onDone }) {
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qrSrc, setQrSrc]     = useState(null);
  // Per-tenant branding for receipt header
  const [brand, setBrand] = useState({ name: "karyaos", logoUrl: "/logo.png", code: null });

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    api.getReceipt(orderId)
      .then((r) => {
        setReceipt(r);
        // Silent subscribe if permission already granted; pre-prompt handles 'default'.
        if (isPushSupported() && Notification.permission === "granted") {
          subscribeToOrderPush({ orderId, phone: r?.customer_phone }).catch(() => {});
        }
        // Trigger local bridge print AFTER receipt confirmed loaded — di sini supaya
        // race condition di Payment success transition gak masalah (rolled back dari Payment.jsx)
        printOrderBothViaLocalBridge(orderId).catch(() => {});
      })
      .catch(() => setReceipt(null))
      .finally(() => setLoading(false));
  }, [orderId]);

  useEffect(() => {
    fetch("/api/companies/branding").then(r => r.json()).then(b => {
      if (b?.name) {
        const PLATFORM = ["BTS", "CMX", "KARYAOS"];
        const isPlatform = !b.company_code || PLATFORM.includes(b.company_code);
        setBrand({
          name: isPlatform ? "karyaos" : b.name,
          logoUrl: b.logo_url || "/logo.png",
          code: b.company_code,
        });
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!orderId) return;
    const base = import.meta.env.VITE_TRACKING_BASE_URL || window.location.origin;
    const url  = `${base}/?trackorder=${orderId}`;
    QRCode.toDataURL(url, { width: 200, margin: 1, color: { dark: "#0F172A", light: "#FFFFFF" } })
      .then(setQrSrc)
      .catch(() => setQrSrc(null));
  }, [orderId]);


  if (loading) return (
    <div style={{textAlign:"center",padding:60,color:"#555",fontFamily:"'Inter',sans-serif"}}>
      <div style={{width:32,height:32,border:"2px solid #333",borderTop:"2px solid #F59E0B",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 12px"}}/>
      Membuat struk...
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!receipt) return (
    <div style={{...R.root,justifyContent:"center",flexDirection:"column",textAlign:"center",gap:16}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@700&family=DM+Sans:wght@400;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}`}</style>
      <div style={{fontSize:72,lineHeight:1,margin:0}}>✅</div>
      <div style={{fontFamily:"'Geist Mono',monospace",fontSize:24,color:"#34D399",lineHeight:1.2,margin:0,letterSpacing:3}}>PEMBAYARAN BERHASIL!</div>
      <div style={{fontSize:13,color:"#555",lineHeight:1.4,margin:0}}>Receipt tidak tersedia saat ini</div>
      <button style={{...R.doneBtn,maxWidth:240,margin:"20px auto 0"}} onClick={onDone}>SELESAI →</button>
    </div>
  );

  return (
    <div style={R.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @media print{
          .no-print{display:none!important}
          body{background:#fff!important;color:#000!important}
          .receipt-paper{box-shadow:none!important;border:none!important;max-width:100%!important}
        }
      `}</style>

      <div style={R.wrap}>
        <div className="no-print">
          <PushPermissionPrompt orderId={orderId} phone={receipt?.customer_phone} />
        </div>

        {/* ── PICKUP HERO — BIG order number + status + ETA (no-print) ── */}
        <div className="no-print" style={{
          marginBottom: 22, padding: "28px 24px",
          borderRadius: 24,
          background: "linear-gradient(135deg, color-mix(in srgb,var(--brand-primary,#FF6B35) 18%,transparent), color-mix(in srgb,var(--brand-primary,#FF6B35) 4%,transparent))",
          border: "1px solid color-mix(in srgb,var(--brand-primary,#FF6B35) 35%,transparent)",
          boxShadow: "0 12px 48px color-mix(in srgb,var(--brand-primary,#FF6B35) 22%,rgba(0,0,0,0.35)), inset 0 1px 0 rgba(255,255,255,0.08)",
          textAlign: "center",
          maxWidth: 520, margin: "0 auto 22px",
          position: "relative", overflow: "hidden",
        }}>
          {/* Eyebrow */}
          <div style={{
            fontSize: 11, color: "color-mix(in srgb,var(--brand-primary,#FF6B35) 85%,#fff)",
            fontFamily: "'Geist Mono',monospace", fontWeight: 700, letterSpacing: 2.5,
            textTransform: "uppercase", marginBottom: 8,
            display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center",
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "var(--brand-primary,#FF6B35)",
              boxShadow: "0 0 10px var(--brand-primary,#FF6B35), 0 0 20px color-mix(in srgb,var(--brand-primary,#FF6B35) 60%,transparent)",
              animation: "drGlowPulse 1.6s ease infinite",
            }} />
            ORDER NUMBER
          </div>
          {/* BIG Order # */}
          <div style={{
            fontSize: "clamp(72px, 14vw, 120px)", fontWeight: 900,
            color: "#fff", fontFamily: "'Geist Mono',monospace",
            letterSpacing: -4, lineHeight: 1,
            textShadow: "0 4px 28px color-mix(in srgb,var(--brand-primary,#FF6B35) 50%,rgba(0,0,0,0.5))",
            margin: "4px 0 14px",
          }}>#{receipt.orderId}</div>
          {/* Status pill */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            padding: "9px 18px",
            background: "rgba(0,0,0,0.35)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 999, backdropFilter: "blur(8px)",
            fontSize: 13, color: "#fff", fontWeight: 700,
            fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#10b981", boxShadow: "0 0 8px #10b981",
              animation: "drGlowPulse 2s ease infinite",
            }} />
            <span>SEDANG DIPROSES</span>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>·</span>
            <span style={{ color: "color-mix(in srgb,var(--brand-primary,#FF6B35) 90%,#fff)" }}>ESTIMASI 4 MENIT</span>
          </div>
          {/* Progress tracker */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 18 }}>
            {["✓ Diterima", "⏳ Disiapkan", "🍽 Siap Diambil"].map((label, i) => {
              const done = i === 0;  // step 1 done, step 2 active, step 3 pending
              const active = i === 1;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    padding: "5px 12px", borderRadius: 999,
                    background: done ? "rgba(16,185,129,0.18)" : active ? "color-mix(in srgb,var(--brand-primary,#FF6B35) 22%,transparent)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${done ? "rgba(16,185,129,0.5)" : active ? "color-mix(in srgb,var(--brand-primary,#FF6B35) 50%,transparent)" : "rgba(255,255,255,0.08)"}`,
                    color: done ? "#34d399" : active ? "#fff" : "rgba(255,255,255,0.4)",
                    fontSize: 11, fontWeight: 700, fontFamily: "'Geist Mono',monospace",
                    letterSpacing: 0.4,
                  }}>{label}</div>
                  {i < 2 && <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}>→</span>}
                </div>
              );
            })}
          </div>
          {/* Pickup hint */}
          <div style={{
            marginTop: 16, fontSize: 12, color: "rgba(255,255,255,0.55)",
            fontFamily: "'Inter',sans-serif",
          }}>
            🔔 Kami akan panggil nomor Anda di counter saat pesanan siap
          </div>
        </div>
        <style>{`
          @keyframes drGlowPulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
        `}</style>

        {/* Receipt paper */}
        <div style={R.paper} className="receipt-paper">
          {/* Header */}
          <div style={R.rHeader}>
            <div style={R.rLogo}><img src={brand.logoUrl} alt={brand.name} style={{ height: 56, objectFit: "contain" }} /></div>
            <div style={R.rBrand}>{brand.name}</div>
            <div style={R.rAddr}>Self-order kiosk</div>
            {/* BIG type badge — dine-in vs takeaway prominent di header */}
            {receipt.type && (
              <div style={{
                display: "inline-block", margin: "10px auto 4px",
                padding: "6px 18px",
                background: receipt.type === "dine"
                  ? "linear-gradient(135deg, rgba(245,158,11,0.18), rgba(251,191,36,0.08))"
                  : "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(192,132,252,0.08))",
                border: receipt.type === "dine"
                  ? "1.5px solid rgba(245,158,11,0.5)"
                  : "1.5px solid rgba(168,85,247,0.5)",
                color: receipt.type === "dine" ? "#fbbf24" : "#c084fc",
                borderRadius: 999,
                fontSize: 13, fontWeight: 800, letterSpacing: 1.2,
                fontFamily: "'Geist Mono', monospace", textTransform: "uppercase",
              }}>
                {receipt.type === "dine" ? `🪑 DINE-IN · MEJA ${receipt.table || "—"}` : "🛍️ TAKE-AWAY"}
              </div>
            )}
            <div style={R.divider}>{'─'.repeat(32)}</div>
          </div>

          {/* Receipt info */}
          <div style={R.infoRow}><span style={R.ik}>No. Receipt</span><span style={R.iv}>{receipt.receiptNo}</span></div>
          <div style={R.infoRow}><span style={R.ik}>No. Order</span><span style={R.iv}>#{receipt.orderId}</span></div>
          <div style={R.infoRow}><span style={R.ik}>Waktu</span><span style={R.iv}>{receipt.timestamp}</span></div>
          <div style={R.infoRow}><span style={R.ik}>Cashier</span><span style={R.iv}>{receipt.kasir}</span></div>
          <div style={R.infoRow}><span style={R.ik}>Tipe</span><span style={R.iv}>{receipt.type==="dine"?`🪑 Meja ${receipt.table}`:"🛍️ Bawa Pulang"}</span></div>
          {receipt.customer?.name && (
            <div style={R.infoRow}><span style={R.ik}>Customer</span><span style={R.iv}>{receipt.customer.name}</span></div>
          )}
          <div style={R.divider}>{'─'.repeat(32)}</div>

          {/* Items */}
          <div style={R.itemsHeader}>
            <span>ITEM</span><span>QTY</span><span>HARGA</span>
          </div>
          {(receipt.items||[]).map((item,i) => (
            <div key={i}>

              <div style={R.itemRow}>
              <span style={R.itemName}>{item.e} {item.n}</span>
              <span style={R.itemQty}>{item.q}x</span>
              <span style={R.itemPrice}>{fIDR(item.p*item.q)}</span>
            </div>

              {item.addons?.toppings?.length>0 && (() => {
                const explicitTotal = item.addons.toppings.reduce((s,t)=>s+(t.price||0),0);
                const extraCharge = Math.max(0, (item.addonTotal||0) - explicitTotal);
                return (
                  <div style={{paddingLeft:14,marginTop:2,marginBottom:6,fontSize:11,color:"#666"}}>
                    {item.addons.toppings.map((t,j) => {
                      const linePrice = (t.price||0) * (item.q||1);
                      return (
                        <div key={j} style={{display:"flex",justifyContent:"space-between",lineHeight:1.5}}>
                          <span>+ {t.name}</span>
                          <span style={{color: linePrice>0 ? "#666" : "#10B981"}}>
                            {linePrice>0 ? fIDR(linePrice) : "gratis"}
                          </span>
                        </div>
                      );
                    })}
                    {extraCharge > 0 && (
                      <div style={{display:"flex",justifyContent:"space-between",lineHeight:1.5}}>
                        <span>+ Topping ekstra</span>
                        <span>{fIDR(extraCharge * (item.q||1))}</span>
                      </div>
                    )}
                  </div>
                );
              })()}

            </div>
          ))}
          {/* BOGO free items */}
          {(receipt.promoFreeItems||[]).map((fi,i) => (
            <div key={`free-${i}`} style={R.itemRow}>
              <span style={{...R.itemName,color:"#10B981",fontWeight:700}}>🎁 {fi.name}</span>
              <span style={R.itemQty}>{fi.qty}x</span>
              <span style={{...R.itemPrice,color:"#10B981",fontWeight:700}}>GRATIS</span>
            </div>
          ))}
          <div style={R.divider}>{'─'.repeat(32)}</div>

          {/* Totals */}
          <div style={R.totalRow}><span>Subtotal</span><span>{fIDR(receipt.subtotal)}</span></div>
          {receipt.promoCode && (
            <div style={{...R.totalRow,color:"#34D399"}}>
              <span>🏷️ {receipt.promoCode}</span>
              <span>-{fIDR(receipt.promoDiscount)}</span>
            </div>
          )}
          {receipt.pointsRedeemed > 0 && (
            <div style={{...R.totalRow,color:"#FB923C"}}>
              <span>🎁 Tukar {receipt.pointsRedeemed} poin</span>
              <span>-{fIDR(receipt.pointsDiscount)}</span>
            </div>
          )}
          {receipt.convenienceFee > 0 && (
            <div style={{...R.totalRow,color:"#FB923C"}}>
              <span>🧾 Biaya Layanan</span>
              <span>+{fIDR(receipt.convenienceFee)}</span>
            </div>
          )}
          {receipt.serviceCharge > 0 && (
            <div style={{...R.totalRow,color:"#FBBF24"}}>
              <span>🍽️ Service Charge</span>
              <span>+{fIDR(receipt.serviceCharge)}</span>
            </div>
          )}
          <div style={{...R.totalRow,fontSize:10,color:"#888"}}><span>PPN 11% (sudah termasuk)</span><span>{fIDR(receipt.tax)}</span></div>
          <div style={{...R.totalRow,...R.grandTotal}}>
            <span>TOTAL</span><span>{fIDR(receipt.total)}</span>
          </div>
          <div style={R.divider}>{'─'.repeat(32)}</div>

          {/* Payment */}
          <div style={R.totalRow}><span>Pembayaran</span><span>{receipt.payment === "TUNAI" ? "💵" : "💳"} {receipt.payment}</span></div>
          <div style={{...R.totalRow,color:"#34D399"}}><span>Status</span><span>✓ LUNAS</span></div>
          {receipt.pointsEarned > 0 && (
            <div style={{marginTop:12,padding:12,background:"rgba(251,146,60,0.1)",border:"1px solid rgba(251,146,60,0.3)",borderRadius:8,textAlign:"center"}}>
              <div style={{fontSize:11,color:"#FB923C",letterSpacing:1,marginBottom:4}}>🎁 SELAMAT</div>
              <div style={{fontSize:16,fontWeight:700,color:"#FB923C"}}>+{receipt.pointsEarned} poin</div>
              <div style={{fontSize:10,color:"#888",marginTop:2}}>Cek balance di halaman tracking</div>
            </div>
          )}
          {receipt.midtransId && (
            <div style={R.infoRow}><span style={R.ik}>Ref. Midtrans</span><span style={{...R.iv,fontSize:10}}>{receipt.midtransId}</span></div>
          )}
          <div style={R.divider}>{'─'.repeat(32)}</div>

          {/* Footer */}
          <div style={R.footer}>
            <div>✨ Terima kasih atas kunjungan Anda ✨</div>
            <div style={{marginTop:6,fontSize:11}}>Simpan struk ini sebagai bukti pembayaran</div>
            <div style={{marginTop:16,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
              <div style={{fontSize:10,color:"#777"}}>📲 Scan untuk cek status pesanan</div>
              {qrSrc && <img src={qrSrc} alt="Tracking QR" style={{width:120,height:120,background:"#fff",padding:6,borderRadius:8}}/>}
              <div style={{fontSize:9,color:"#999",letterSpacing:0.5,marginTop:4}}>Order #{receipt.orderId}</div>
            </div>
          </div>

          {/* Barcode-style decorative line */}
          <div style={{...R.divider,marginTop:12}}>{'▐'.repeat(16)}</div>
        </div>

        <div style={{textAlign:"center",fontSize:11,color:"#999",marginTop:12,letterSpacing:1}} className="no-print">
          🖨️ Struk sedang dicetak otomatis
        </div>
        {/* Action buttons */}
        <div style={{...R.actions, marginTop:14, justifyContent:"center"}} className="no-print">
          <button style={{...R.doneBtn, maxWidth:320, flex:1}} onClick={onDone}>SELESAI →</button>
        </div>
      </div>
    </div>
  );
}

const R = {
  root: {
    fontFamily: "'Inter',sans-serif",
    background: "radial-gradient(ellipse 60% 50% at 30% 20%, rgba(70,76,98,0.45) 0%, transparent 65%), radial-gradient(ellipse 55% 45% at 75% 80%, rgba(50,55,72,0.35) 0%, transparent 65%), linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)",
    backgroundAttachment: "fixed",
    color: "#fff", minHeight: "100vh",
    display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
  },
  wrap: { width: "100%", maxWidth: 420, animation: "fadeUp 0.3s ease" },
  // Thermal receipt paper — kept white for realism (print preview vibe)
  paper: {
    background: "#fff", color: "#111", borderRadius: 16, padding: "24px 20px",
    boxShadow: "0 24px 60px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.32)",
    fontFamily: "'Inter',sans-serif", fontSize: 12,
  },
  rHeader: { textAlign: "center", marginBottom: 12 },
  rLogo: { fontSize: 32, marginBottom: 4 },
  rBrand: { fontSize: 20, fontWeight: 600, letterSpacing: "-0.4px" },
  rAddr: { fontSize: 11, color: "#666", marginTop: 4 },
  divider: { color: "#ccc", fontSize: 10, margin: "10px 0", letterSpacing: 0 },
  infoRow: { display: "flex", justifyContent: "space-between", marginBottom: 4, gap: 8 },
  ik: { fontSize: 11, color: "#888" },
  iv: { fontSize: 11, fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" },
  itemsHeader: { display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 10, color: "#aaa", borderBottom: "1px dashed #ddd", paddingBottom: 4, textTransform: "uppercase", letterSpacing: 1 },
  itemRow: { display: "flex", marginBottom: 5, gap: 4 },
  itemName: { flex: 1, fontSize: 12, fontWeight: 500 },
  itemQty: { width: 28, textAlign: "center", fontSize: 11, color: "#666", fontVariantNumeric: "tabular-nums" },
  itemPrice: { width: 80, textAlign: "right", fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums" },
  totalRow: { display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 },
  grandTotal: { fontSize: 16, fontWeight: 600, marginTop: 6, paddingTop: 6, borderTop: "2px solid #111", letterSpacing: "-0.3px", fontVariantNumeric: "tabular-nums" },
  footer: { textAlign: "center", fontSize: 12, color: "#555", marginTop: 4, lineHeight: 1.6 },
  actions: { display: "flex", gap: 10, marginTop: 14 },
  // Print button — subtle glass
  printBtn: {
    flex: 1,
    background: "linear-gradient(180deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.008) 100%)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14, padding: "14px",
    color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 500, fontFamily: "'Inter',sans-serif",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 14px rgba(0,0,0,0.22)",
    cursor: "pointer",
  },
  // Done CTA — tinted brand glass
  doneBtn: {
    flex: 2,
    background: "radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))",
    border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: 14, padding: "14px",
    color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.45)",
    fontSize: 15, fontWeight: 600, letterSpacing: "-0.2px",
    fontFamily: "'Inter',sans-serif",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)",
    cursor: "pointer",
  },
};
