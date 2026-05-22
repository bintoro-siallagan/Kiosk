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

const fmtIDR = (n) => new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR', maximumFractionDigits:0}).format(Math.round(n||0));
const fmtDateTime = (sec) => sec ? new Date(sec*1000).toLocaleString('id-ID', {dateStyle:'medium', timeStyle:'short'}) : '';

const API_HOST = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function POSReceipt({ order, onClose, onPrintDone }) {
  const [taxConfig, setTaxConfig] = useState([]);
  const [kioskName, setKioskName] = useState('KaryaOS');
  const printRef = useRef(null);

  useEffect(() => {
    fetch(`${API_HOST}/api/finance/tax-config`).then(r=>r.json()).then(d => setTaxConfig((d || []).filter(t => t.is_active)));
    fetch(`${API_HOST}/api/pos/config/KIOSK_NAME`).then(r=>r.json()).then(d => { if (d.parsed_value) setKioskName(d.parsed_value); }).catch(()=>{});
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
    out += center + 'Struk Pesanan\n';
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
      out += `Diskon Loyalty: ${('-' + fmtIDR(calc.loyaltyDiscount)).padStart(16)}\n`;
    }
    out += bold + `TOTAL: ${fmtIDR(calc.grandTotal).padStart(20)}\n` + boldOff;
    if (calc.taxes.length > 0) {
      out += 'Harga termasuk pajak:\n';
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
    out += '\n' + center + 'Terima Kasih!\n';
    out += 'Sampai jumpa lagi 🙏\n' + left;
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
    <div style={overlay} onClick={onClose}>
      <div style={modalBox} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex', justifyContent:'space-between', marginBottom:12}}>
          <h2 style={{margin:0}}>Struk Pesanan</h2>
          <button onClick={onClose} style={closeBtn}>×</button>
        </div>

        <div ref={printRef} style={receipt}>
          <h1 className="center" style={{textAlign:'center', fontSize:18, margin:'8px 0'}}>{kioskName}</h1>
          <div className="center" style={{textAlign:'center', fontSize:11, color:'#666'}}>Struk Pesanan</div>
          <hr style={dashLine}/>
          <div className="row" style={row}><span>No:</span><b>{order.ref}</b></div>
          <div className="row" style={row}><span>Tanggal:</span><span>{fmtDateTime(order.paid_at || Math.floor(Date.now()/1000))}</span></div>
          {order.cashier && <div className="row" style={row}><span>Kasir:</span><span>{order.cashier}</span></div>}
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
          {calc.loyaltyDiscount > 0 && (
            <div className="row" style={{...row, color:'#b45309'}}>
              <span>🏅 Diskon Loyalty</span>
              <span>−{fmtIDR(calc.loyaltyDiscount)}</span>
            </div>
          )}
          <div className="row total" style={{...row, ...total}}>
            <b>TOTAL</b>
            <b>{fmtIDR(calc.grandTotal)}</b>
          </div>
          {calc.taxes.length > 0 && (
            <div style={{fontSize:10, color:'#666', marginTop:4}}>
              <div>Harga sudah termasuk pajak:</div>
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
              <div className="row" style={row}>
                <span>{(p.tender_type || '').toUpperCase()}</span>
                <span>{fmtIDR(p.amount)}</span>
              </div>
              {p.ref_no && <div className="indent" style={indent}>Ref: {p.ref_no}</div>}
            </div>
          ))}
          {calc.change > 0 && (
            <div className="row" style={{...row, fontWeight:700, color:'#10b981'}}>
              <b>KEMBALIAN</b>
              <b>{fmtIDR(calc.change)}</b>
            </div>
          )}

          <div className="footer" style={footer}>
            Terima Kasih!<br/>
            Sampai jumpa lagi 🙏
          </div>
        </div>

        <div style={{marginTop:16, display:'flex', gap:8, flexWrap:'wrap'}}>
          <button onClick={browserPrint} style={btnPrimary}>🖨️ Print Browser</button>
          <button onClick={downloadPDF} style={btn}>📄 Save PDF</button>
          <button onClick={sendToThermalPrinter} style={btn}>🧾 Thermal Printer</button>
          <button onClick={onClose} style={{...btn, marginLeft:'auto'}}>Selesai</button>
        </div>

        <div style={{marginTop:12, padding:10, background:'#f9fafb', borderRadius:6, fontSize:11, color:'#6b7280'}}>
          <b>Tips:</b> Browser Print buka dialog cetak biasa (bisa save as PDF). Thermal Printer coba Bluetooth → backend → clipboard fallback. Pastikan kasir punya thermal printer ESC/POS compatible (most cheap 58/80mm bluetooth printers work).
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================
const overlay = { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100 };
const modalBox = { background:'#fff', borderRadius:12, padding:24, maxWidth:500, width:'95vw', maxHeight:'90vh', overflow:'auto' };
const closeBtn = { width:36, height:36, borderRadius:8, background:'#f3f4f6', border:'none', fontSize:22, cursor:'pointer' };
const receipt = { background:'#fff', border:'1px dashed #d1d5db', borderRadius:4, padding:'12px 16px', fontFamily:'Courier New, monospace', fontSize:12, color:'#000' };
const row = { display:'flex', justifyContent:'space-between', gap:8, padding:'1px 0' };
const total = { fontSize:14, fontWeight:700, borderTop:'2px solid #000', paddingTop:4, marginTop:4 };
const indent = { paddingLeft:12, color:'#555', fontSize:11 };
const dashLine = { border:'none', borderTop:'1px dashed #000', margin:'6px 0' };
const footer = { fontSize:10, textAlign:'center', marginTop:10, color:'#555' };
const btnPrimary = { padding:'10px 16px', background:'#3b82f6', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontWeight:600 };
const btn = { padding:'10px 16px', background:'#f3f4f6', border:'1px solid #d1d5db', borderRadius:6, cursor:'pointer', fontSize:13 };
