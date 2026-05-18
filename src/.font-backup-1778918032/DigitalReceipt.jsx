import { useState, useEffect } from "react";
import * as audio from "./audio.js";
import { api } from "./api.js";
import QRCode from "qrcode";

const fIDR = (a) => "Rp " + Math.round(a||0).toLocaleString("id-ID");

export default function DigitalReceipt({ orderId, onDone }) {
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qrSrc, setQrSrc]     = useState(null);

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    // Voice already played at payment confirm; just fetch receipt
    api.getReceipt(orderId)
      .then(setReceipt)
      .catch(() => setReceipt(null))
      .finally(() => setLoading(false));
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return;
    const base = import.meta.env.VITE_TRACKING_BASE_URL || window.location.origin;
    const url  = `${base}/?trackorder=${orderId}`;
    QRCode.toDataURL(url, { width: 200, margin: 1, color: { dark: "#0F172A", light: "#FFFFFF" } })
      .then(setQrSrc)
      .catch(() => setQrSrc(null));
  }, [orderId]);


  if (loading) return (
    <div style={{textAlign:"center",padding:60,color:"#555",fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{width:32,height:32,border:"2px solid #333",borderTop:"2px solid #F59E0B",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 12px"}}/>
      Membuat struk...
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!receipt) return (
    <div style={{...R.root,justifyContent:"center",flexDirection:"column",textAlign:"center",gap:16}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@700&family=DM+Sans:wght@400;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}`}</style>
      <div style={{fontSize:72}}>✅</div>
      <div style={{fontFamily:"'Space Mono',monospace",fontSize:24,color:"#34D399",letterSpacing:3}}>PEMBAYARAN BERHASIL!</div>
      <div style={{fontSize:13,color:"#555"}}>Struk tidak tersedia saat ini</div>
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
        {/* Receipt paper */}
        <div style={R.paper} className="receipt-paper">
          {/* Header */}
          <div style={R.rHeader}>
            <div style={R.rLogo}>🍽️</div>
            <div style={R.rBrand}>BINTORO</div>
            <div style={R.rAddr}>Self Order Kiosk</div>
            <div style={R.rAddr}>Jakarta, Indonesia</div>
            <div style={R.divider}>{'─'.repeat(32)}</div>
          </div>

          {/* Receipt info */}
          <div style={R.infoRow}><span style={R.ik}>No. Struk</span><span style={R.iv}>{receipt.receiptNo}</span></div>
          <div style={R.infoRow}><span style={R.ik}>No. Order</span><span style={R.iv}>#{receipt.orderId}</span></div>
          <div style={R.infoRow}><span style={R.ik}>Waktu</span><span style={R.iv}>{receipt.timestamp}</span></div>
          <div style={R.infoRow}><span style={R.ik}>Kasir</span><span style={R.iv}>{receipt.kasir}</span></div>
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
            <div>Terima kasih atas kunjungan Anda! 🙏</div>
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
  root:      {fontFamily:"'DM Sans',sans-serif",background:"#050810",color:"#fff",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"},
  wrap:      {width:"100%",maxWidth:420,animation:"fadeUp 0.3s ease"},
  paper:     {background:"#fff",color:"#111",borderRadius:12,padding:"24px 20px",boxShadow:"0 20px 60px rgba(0,0,0,0.5)",fontFamily:"'Space Mono',monospace",fontSize:12},
  rHeader:   {textAlign:"center",marginBottom:12},
  rLogo:     {fontSize:32,marginBottom:4},
  rBrand:    {fontSize:22,fontWeight:700,letterSpacing:4},
  rAddr:     {fontSize:11,color:"#666",marginTop:2},
  divider:   {color:"#ccc",fontSize:10,margin:"10px 0",letterSpacing:0},
  infoRow:   {display:"flex",justifyContent:"space-between",marginBottom:4,gap:8},
  ik:        {fontSize:11,color:"#888"},
  iv:        {fontSize:11,fontWeight:700,textAlign:"right"},
  itemsHeader:{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:10,color:"#aaa",borderBottom:"1px dashed #ddd",paddingBottom:4},
  itemRow:   {display:"flex",marginBottom:5,gap:4},
  itemName:  {flex:1,fontSize:11},
  itemQty:   {width:28,textAlign:"center",fontSize:11,color:"#666"},
  itemPrice: {width:80,textAlign:"right",fontSize:11,fontWeight:700},
  totalRow:  {display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:12},
  grandTotal:{fontSize:15,fontWeight:700,marginTop:4,paddingTop:4,borderTop:"2px solid #111"},
  footer:    {textAlign:"center",fontSize:12,color:"#555",marginTop:4,lineHeight:1.6},
  actions:   {display:"flex",gap:10},
  printBtn:  {flex:1,background:"#0d1117",border:"1px solid #1a1a2e",borderRadius:12,padding:"14px",color:"#aaa",fontSize:13,fontWeight:600},
  doneBtn:   {flex:2,background:"linear-gradient(90deg,#F59E0B,#F97316)",border:"none",borderRadius:12,padding:"14px",color:"#050810",fontSize:15,fontWeight:700,letterSpacing:1,fontFamily:"'Space Mono',monospace"},
};
