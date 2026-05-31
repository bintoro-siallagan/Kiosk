// client/src/POS/POSReceipt.jsx
// Receipt rendering:
//   - Visual preview (HTML, print-friendly via CSS)
//   - Browser print (window.print)
//   - ESC/POS commands (for thermal printer via Bluetooth/USB/network)
//   - PDF download (browser-side via print-to-PDF)
//
// Tax breakdown integrated dengan /api/finance/tax-config (PPN, PB1)
//
// Props:
//   order: { ref, items, customer?, cashier, paid_at, payments:[...] }
//   onClose
//   onPrintDone(method) — callback after print attempt
import React, { useState, useEffect, useMemo, useRef } from 'react';
import API_HOST from "../apiBase.js";

const fmtIDR = (n) => new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR', maximumFractionDigits:0}).format(Math.round(n||0));
const fmtDateTime = (sec) => sec ? new Date(sec*1000).toLocaleString('id-ID', {dateStyle:'medium', timeStyle:'short'}) : '';


export default function POSReceipt({ order, onClose, onPrintDone }) {
  const [taxConfig, setTaxConfig] = useState([]);
  const [kioskName, setKioskName] = useState('karyaos');
  const [brandLogo, setBrandLogo] = useState('/logo.png');
  const printRef = useRef(null);

  useEffect(() => {
    fetch(`${API_HOST}/api/finance/tax-config`).then(r=>r.json()).then(d => setTaxConfig((d || []).filter(t => t.is_active)));
    // Per-tenant branding overrides KIOSK_NAME config — tenant name wins if non-default
    fetch(`${API_HOST}/api/companies/branding`).then(r => r.json()).then(b => {
      const PLATFORM = ["BTS", "CMX", "KARYAOS"];
      const isPlatform = !b?.company_code || PLATFORM.includes(b.company_code);
      if (b?.name && !isPlatform) setKioskName(b.name);
      if (b?.logo_url) setBrandLogo(b.logo_url);
    }).catch(() => {
      fetch(`${API_HOST}/api/pos/config/KIOSK_NAME`).then(r=>r.json()).then(d => { if (d.parsed_value) setKioskName(d.parsed_value); }).catch(()=>{});
    });
  }, []);

  // Calculate totals
  const calc = useMemo(() => {
    const items = order.items || [];
    const subtotal = items.reduce((s, it) => s + (it.line_total || 0), 0);
    const loyaltyDiscount = order.loyalty_discount || 0;
    // Harga menu sudah termasuk pajak (tax-inclusive). TOTAL = subtotal − diskon.
    // Pajak di-extract dari TOTAL hanya buat rincian di struk, bukan ditambah.
    const grandTotal = Math.max(0, subtotal - loyaltyDiscount);
    const totalRate = taxConfig.reduce((s, t) => s + (t.rate || 0), 0);
    const taxBase = totalRate > 0 ? grandTotal / (1 + totalRate) : grandTotal;
    const taxes = taxConfig.map(t => ({ id: t.id, name: t.name, rate: t.rate, amount: taxBase * t.rate }));
    const taxTotal = taxes.reduce((s, t) => s + t.amount, 0);
    const paid = (order.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
    const change = (order.payments || []).reduce((s, p) => s + (p.change_given || 0), 0);
    return { subtotal, taxes, taxTotal, taxBase, loyaltyDiscount, grandTotal, paid, change };
  }, [order, taxConfig]);

  const browserPrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open('', '', 'width=400,height=600');
    printWindow.document.write(`
      <html><head><title>Struk ${order.ref}</title>
      <style>
        @page { margin: 0; size: 80mm auto; }
        body { font-family: 'Courier New', monospace; font-size: 11px; width: 72mm; margin: 4mm; padding: 0; }
        h1 { font-size: 14px; margin: 4px 0; text-align: center; }
        .center { text-align: center; }
        .right { text-align: right; }
        .row { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; }
        .item-name { flex: 1; }
        hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
        .bold { font-weight: bold; }
        .total { font-size: 14px; font-weight: bold; border-top: 2px solid #000; padding-top: 4px; margin-top: 4px; }
        .footer { font-size: 9px; text-align: center; margin-top: 8px; color: #555; }
        .indent { padding-left: 12px; color: #555; font-size: 10px; }
      </style></head>
      <body>${printRef.current.innerHTML}</body></html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); onPrintDone?.('browser'); }, 250);
  };

  const downloadPDF = () => {
    // Browser print-to-PDF (user selects "Save as PDF" in print dialog)
    browserPrint();
  };

  // ESC/POS thermal printer command generation
  const generateEscPos = () => {
    const ESC = '\x1B', GS = '\x1D';
    const initPrinter = ESC + '@';
    const center = ESC + 'a' + '\x01';
    const left = ESC + 'a' + '\x00';
    const bold = ESC + 'E' + '\x01';
    const boldOff = ESC + 'E' + '\x00';
    const doubleSize = GS + '!' + '\x11';
    const normalSize = GS + '!' + '\x00';
    const cut = GS + 'V' + '\x00';
    const feed3 = '\n\n\n';

    let out = initPrinter;
    out += center + bold + doubleSize + kioskName + '\n' + normalSize + boldOff;
    out += center + 'Receipt Pesanan\n';
    out += '--------------------------------\n';
    out += left + `No: ${order.ref}\n`;
    out += `Tanggal: ${fmtDateTime(order.paid_at)}\n`;
    if (order.cashier) out += `Kasir: ${order.cashier}\n`;
    if (order.customer?.name) out += `Customer: ${order.customer.name}\n`;
    out += '--------------------------------\n';

    for (const it of (order.items || [])) {
      out += `${it.display_name}\n`;
      if (it.size_name) out += `  Size: ${it.size_name}\n`;
      for (const e of (it.extras || [])) {
        out += `  + ${e.name || e.extra_id}${e.qty > 1 ? ' x'+e.qty : ''}\n`;
      }
      const line = `  ${it.qty} x ${fmtIDR(it.display_price)} = ${fmtIDR(it.line_total)}`;
      out += line + '\n';
    }
    out += '--------------------------------\n';
    out += `Subtotal: ${fmtIDR(calc.subtotal).padStart(20)}\n`;
    if (calc.loyaltyDiscount > 0) {
      out += `Discount Loyalty: ${('-' + fmtIDR(calc.loyaltyDiscount)).padStart(16)}\n`;
    }
    out += bold + `TOTAL: ${fmtIDR(calc.grandTotal).padStart(20)}\n` + boldOff;
    if (calc.taxes.length > 0) {
      out += 'Price termasuk pajak:\n';
      for (const t of calc.taxes) {
        out += `  ${t.name} ${(t.rate*100).toFixed(0)}%: ${fmtIDR(t.amount).padStart(12)}\n`;
      }
    }
    out += '--------------------------------\n';

    for (const p of (order.payments || [])) {
      out += `${p.tender_type.toUpperCase()}: ${fmtIDR(p.amount).padStart(20)}\n`;
      if (p.ref_no) out += `  Ref: ${p.ref_no}\n`;
    }
    if (calc.change > 0) {
      out += bold + `KEMBALIAN: ${fmtIDR(calc.change).padStart(20)}\n` + boldOff;
    }
    out += '\n' + center + '*** Terima Kasih ***\n';
    out += 'Sampai jumpa kembali\n' + left;
    out += feed3 + cut;
    return out;
  };

  const sendToThermalPrinter = async () => {
    const cmds = generateEscPos();
    // Try Bluetooth printer first (Chrome Web Bluetooth API)
    try {
      if (navigator.bluetooth) {
        const device = await navigator.bluetooth.requestDevice({
          filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
          optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
        });
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
        const char = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
        const enc = new TextEncoder();
        const data = enc.encode(cmds);
        // Send in chunks (BLE max 512 bytes typical)
        const chunkSize = 256;
        for (let i = 0; i < data.length; i += chunkSize) {
          await char.writeValue(data.slice(i, i + chunkSize));
        }
        onPrintDone?.('bluetooth');
        alert('Print sukses via Bluetooth printer');
        return;
      }
    } catch (e) {
      console.warn('Bluetooth print failed:', e.message);
    }

    // Fallback: POST to backend printer endpoint (if you have one)
    try {
      const res = await fetch('/api/pos/print-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_ref: order.ref, escpos: cmds })
      });
      if (res.ok) { onPrintDone?.('network'); alert('Print sukses via printer network'); return; }
    } catch (e) {}

    // Last resort: copy to clipboard for manual paste / download
    try {
      await navigator.clipboard.writeText(cmds);
      alert('ESC/POS commands di-copy ke clipboard. Paste ke utility printer.');
    } catch {
      // Fallback: trigger download
      const blob = new Blob([cmds], { type: 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `receipt-${order.ref}.bin`;
      a.click();
    }
  };

  return (
    <div style={fullScreenRoot}>
      <div style={successCard}>
        {/* Big success icon — wrapped supaya animation scale/rotate gak overlap title */}
        <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <div style={successIcon}>✅</div>
        </div>

        {/* Title + Order ID kicker */}
        <h1 style={successTitle}>Pembayaran Berhasil ✨</h1>
        <div style={successOrderId}>Pesanan · #{order.ref}</div>

        {order.queueNumber && (
          <div style={queueBlock}>
            <div style={queueLabel}>Nomor Antrian</div>
            <div style={queueNumberStyle}>{order.queueNumber}</div>
            <div style={queueHint}>Tunjukkan ke staf kami ya</div>
          </div>
        )}

        {/* Compact details card — match POSSuccess details */}
        <div style={detailsCard}>
          <div style={detailRow}>
            <span style={detailLabel}>Tanggal</span>
            <span style={detailValue}>{fmtDateTime(order.paid_at || Math.floor(Date.now()/1000))}</span>
          </div>
          {order.cashier && (
            <div style={detailRow}>
              <span style={detailLabel}>Kasir</span>
              <span style={detailValue}>{order.cashier}</span>
            </div>
          )}
          {order.customer?.name && (
            <div style={detailRow}>
              <span style={detailLabel}>Pelanggan</span>
              <span style={detailValue}>{order.customer.name}</span>
            </div>
          )}
          <div style={detailRow}>
            <span style={detailLabel}>Jumlah Item</span>
            <span style={detailValue}>{(order.items || []).length} item</span>
          </div>
          {(order.payments || []).map((p, i) => (
            <div key={i} style={detailRow}>
              <span style={detailLabel}>{(p.tender_type || '').toUpperCase()}</span>
              <span style={detailValue}>{fmtIDR(p.amount)}</span>
            </div>
          ))}
          {calc.loyaltyDiscount > 0 && (
            <div style={detailRow}>
              <span style={detailLabel}>🏅 Diskon Loyalty</span>
              <span style={{...detailValue, color: '#34d399'}}>−{fmtIDR(calc.loyaltyDiscount)}</span>
            </div>
          )}
          {calc.change > 0 && (
            <div style={detailRow}>
              <span style={detailLabel}>💰 Kembalian</span>
              <span style={{...detailValue, color: '#34d399', fontWeight: 800}}>{fmtIDR(calc.change)}</span>
            </div>
          )}
          <div style={{...detailRow, borderBottom: 'none', paddingTop: 14, marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.08)'}}>
            <span style={detailLabel}>Total</span>
            <span style={detailTotal}>{fmtIDR(calc.grandTotal)}</span>
          </div>
        </div>

        {/* Hidden printable receipt — for actual print/PDF (not shown) */}
        <div ref={printRef} style={{...receipt, position: 'absolute', left: '-9999px', top: 0}}>
          <h1 className="center" style={{textAlign:'center', fontSize:18, margin:'8px 0'}}>{kioskName}</h1>
          <div className="center" style={{textAlign:'center', fontSize:11, color:'#666'}}>Receipt Pesanan</div>
          <hr style={dashLine}/>
          {order.queueNumber && (
            <div style={{textAlign:'center', fontSize:24, fontWeight:800, padding:'8px 0', letterSpacing:1}}>
              QUEUE #{order.queueNumber}
            </div>
          )}
          {order.queueNumber && <hr style={dashLine}/>}
          <div className="row" style={row}><span>No:</span><b>{order.ref}</b></div>
          <div className="row" style={row}><span>Date:</span><span>{fmtDateTime(order.paid_at || Math.floor(Date.now()/1000))}</span></div>
          {order.cashier && <div className="row" style={row}><span>Cashier:</span><span>{order.cashier}</span></div>}
          {order.customer?.name && <div className="row" style={row}><span>Customer:</span><span>{order.customer.name}</span></div>}
          <hr style={dashLine}/>
          {(order.items || []).map((it, i) => (
            <div key={i} style={{marginBottom:6}}>
              <div style={{fontWeight:600}}>{it.display_name}</div>
              {it.size_name && <div className="indent" style={indent}>Size: {it.size_name}</div>}
              {(it.extras || []).filter(e => e.qty > 0).map((e, j) => (
                <div key={j} className="indent" style={indent}>+ {e.name}{e.qty > 1 ? ` × ${e.qty}` : ''}</div>
              ))}
              <div className="row" style={row}>
                <span className="indent" style={{...indent, padding:0}}>{it.qty} × {fmtIDR(it.display_price)}</span>
                <b>{fmtIDR(it.line_total)}</b>
              </div>
            </div>
          ))}
          <hr style={dashLine}/>
          <div className="row" style={row}><span>Subtotal</span><b>{fmtIDR(calc.subtotal)}</b></div>
          {calc.loyaltyDiscount > 0 && <div className="row" style={row}><span>🏅 Discount Loyalty</span><span>−{fmtIDR(calc.loyaltyDiscount)}</span></div>}
          <div className="row total" style={{...row, ...total}}><b>TOTAL</b><b>{fmtIDR(calc.grandTotal)}</b></div>
          {calc.taxes.length > 0 && (
            <div style={{fontSize:10, color:'#666', marginTop:4}}>
              <div>Price sudah termasuk pajak:</div>
              {calc.taxes.map(t => (
                <div key={t.id} className="row" style={{...row, paddingLeft:12}}>
                  <span>{t.name} ({(t.rate*100).toFixed(0)}%)</span>
                  <span>{fmtIDR(t.amount)}</span>
                </div>
              ))}
            </div>
          )}
          <hr style={dashLine}/>
          {(order.payments || []).map((p, i) => (
            <div key={i}>
              <div className="row" style={row}><span>{(p.tender_type || '').toUpperCase()}</span><span>{fmtIDR(p.amount)}</span></div>
              {p.ref_no && <div className="indent" style={indent}>Ref: {p.ref_no}</div>}
            </div>
          ))}
          {calc.change > 0 && <div className="row" style={{...row, fontWeight:700, color:'#10b981'}}><b>KEMBALIAN</b><b>{fmtIDR(calc.change)}</b></div>}
          <div className="footer" style={footer}>✨ Terima Kasih ✨<br/>Sampai jumpa kembali</div>
        </div>

        {/* Action buttons row — Print/PDF/Thermal (secondary) + Selesai (primary) */}
        <div style={successActions}>
          <button onClick={browserPrint} style={ghostBtn}>🖨️ Print</button>
          <button onClick={downloadPDF} style={ghostBtn}>📄 PDF</button>
          <button onClick={sendToThermalPrinter} style={ghostBtn}>🧾 Thermal</button>
        </div>
        <button onClick={onClose} style={doneBtn}>✓ Selesai · Transaksi Baru</button>

        <div style={successHint}>
          ✨ Terima Kasih · Sampai jumpa kembali ✨
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STYLES — Full-screen success page (match POSSuccess Order Baru)
// Receipt body kept untuk print/PDF dialog (hidden offscreen).
// ============================================================
const fullScreenRoot = {
  minHeight: '100vh',
  background: 'linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)',
  color: '#fff',
  fontFamily: "'Inter','SF Pro Display',system-ui,-apple-system,sans-serif",
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 24, position: 'relative',
};
const successCard = {
  maxWidth: 560, width: '100%', textAlign: 'center',
  position: 'relative',
};
const successIcon = {
  fontSize: 80, lineHeight: 1,
  filter: 'drop-shadow(0 0 40px rgba(16,185,129,0.5))',
  animation: 'pos-receipt-pop 0.7s cubic-bezier(0.18,1.05,0.4,1) both',
  display: 'inline-block',
  transformOrigin: 'center center',
};
const successTitle = {
  fontSize: 32, fontWeight: 800, letterSpacing: -0.6,
  background: 'linear-gradient(135deg,#F59E0B 0%,#fbbf24 50%,#F59E0B 100%)',
  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
  margin: '0 0 12px', lineHeight: 1.2,
  filter: 'drop-shadow(0 0 24px rgba(251,191,36,0.25))',
};
const successOrderId = {
  fontSize: 11, color: 'rgba(255,255,255,0.45)',
  letterSpacing: 2, marginBottom: 18, marginTop: 0, fontWeight: 500,
  fontFamily: "'Inter',sans-serif", textTransform: 'uppercase',
};
const queueBlock = {
  margin: '8px auto 28px',
  padding: '20px 28px 22px',
  borderRadius: 22,
  background: 'radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 55%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))',
  border: '1px solid rgba(255,255,255,0.16)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 25%, transparent), 0 24px 60px color-mix(in srgb, var(--brand-primary,#FF6B35) 14%, transparent)',
  display: 'inline-block',
  minWidth: 220,
};
const queueLabel = {
  fontSize: 10, fontWeight: 500, letterSpacing: 2.5,
  color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase',
  textShadow: '0 1px 2px rgba(0,0,0,0.45)', marginBottom: 6,
};
const queueNumberStyle = {
  fontSize: 64, fontWeight: 700, letterSpacing: '-2px',
  color: '#fff', fontFamily: "'Inter',sans-serif",
  fontVariantNumeric: 'tabular-nums', lineHeight: 1,
  textShadow: '0 4px 16px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.55)',
};
const queueHint = {
  fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 8, letterSpacing: 0.2,
  textShadow: '0 1px 2px rgba(0,0,0,0.4)',
};
const detailsCard = {
  background: 'linear-gradient(180deg,#15171c 0%,#0d0f14 100%)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16, padding: '20px 24px', marginBottom: 20,
  textAlign: 'left',
  boxShadow: '0 1px 2px rgba(0,0,0,0.3),0 12px 32px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.04)',
};
const detailRow = {
  display: 'flex', justifyContent: 'space-between',
  padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
  fontSize: 13.5,
};
const detailLabel = {
  color: 'rgba(255,255,255,0.55)',
  fontFamily: "'Geist Mono',monospace", fontSize: 11.5, letterSpacing: 0.5,
  fontWeight: 600,
};
const detailValue = {
  color: '#fff', fontWeight: 600,
  fontFamily: "'Geist Mono',monospace",
};
const detailTotal = {
  fontSize: 26, fontWeight: 800, color: '#F59E0B',
  letterSpacing: -0.4, fontFamily: "'Geist Mono',monospace",
};
const successActions = {
  display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8,
  marginBottom: 12,
};
const ghostBtn = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#fff',
  borderRadius: 10, padding: '12px',
  fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', transition: 'all 0.15s',
};
const doneBtn = {
  width: '100%',
  background: 'linear-gradient(135deg, #F59E0B, #fbbf24)',
  color: '#1a1205', border: 'none',
  borderRadius: 12, padding: '15px',
  fontFamily: 'inherit', fontSize: 15, fontWeight: 800,
  cursor: 'pointer', letterSpacing: 0.3,
  boxShadow: '0 8px 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 40%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)',
  transition: 'all 0.2s',
};
const successHint = {
  fontSize: 12, color: 'rgba(255,255,255,0.4)',
  marginTop: 14, letterSpacing: 0.5,
  fontFamily: "'Geist Mono',monospace",
};
// Receipt body — keep light/paper style (kasir expect ini seperti kertas struk)
const receipt = { background:'#fff', border:'1px dashed #d1d5db', borderRadius:6, padding:'14px 18px', fontFamily:'Courier New, monospace', fontSize:12, color:'#000' };
const row = { display:'flex', justifyContent:'space-between', gap:8, padding:'1px 0' };
const total = { fontSize:14, fontWeight:700, borderTop:'2px solid #000', paddingTop:4, marginTop:4 };
const indent = { paddingLeft:12, color:'#555', fontSize:11 };
const dashLine = { border:'none', borderTop:'1px dashed #000', margin:'6px 0' };
const footer = { fontSize:10, textAlign:'center', marginTop:10, color:'#555' };
// Inject pop animation keyframe globally (idempotent)
if (typeof document !== 'undefined' && !document.getElementById('pos-receipt-pop-css')) {
  const s = document.createElement('style');
  s.id = 'pos-receipt-pop-css';
  s.textContent = `@keyframes pos-receipt-pop{0%{opacity:0;transform:scale(0.5) rotate(-12deg)}60%{transform:scale(1.15) rotate(8deg)}100%{opacity:1;transform:scale(1) rotate(0)}}`;
  document.head.appendChild(s);
}
