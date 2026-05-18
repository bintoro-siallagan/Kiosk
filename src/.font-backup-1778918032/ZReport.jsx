import { useState, useEffect } from "react";
import { api } from "./api.js";

const fmt = n => "Rp " + (Number(n) || 0).toLocaleString("id-ID");
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

const S = {
  overlay: { position:"fixed", inset:0, background:"rgba(5,8,16,0.97)", zIndex:1000, display:"flex", flexDirection:"column", fontFamily:"'DM Sans',sans-serif", color:"#fff", overflow:"auto" },
  header:  { position:"sticky", top:0, background:"#080c10", borderBottom:"1px solid #161b22", padding:"20px 32px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, zIndex:10, flexWrap:"wrap" },
  title:   { fontSize:24, fontWeight:700, letterSpacing:0.5 },
  body:    { padding:"24px 32px", maxWidth:1200, margin:"0 auto", width:"100%" },
  card:    { background:"#0d1117", border:"1px solid #161b22", borderRadius:14, padding:20, marginBottom:18 },
  cardTitle: { fontSize:12, fontWeight:700, color:"#888", letterSpacing:1.5, marginBottom:14, textTransform:"uppercase" },
  grid4:   { display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:12 },
  grid2:   { display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))", gap:18 },
  tile:    { background:"#080c10", borderRadius:10, padding:"14px 16px", border:"1px solid #161b22" },
  tileLabel: { fontSize:10, color:"#666", marginBottom:6, letterSpacing:1.2 },
  tileValue: { fontSize:18, fontWeight:700, fontFamily:"'Space Mono',monospace" },
  table:   { width:"100%", borderCollapse:"collapse" },
  th:      { textAlign:"left", padding:"8px 12px", fontSize:10, color:"#666", borderBottom:"1px solid #161b22", letterSpacing:1.2, textTransform:"uppercase", fontWeight:700 },
  td:      { padding:"10px 12px", fontSize:13, borderBottom:"1px solid #0d1117" },
  btn:     { background:"linear-gradient(90deg,#F59E0B,#F97316)", border:"none", borderRadius:8, padding:"8px 14px", color:"#050810", cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"'DM Sans',sans-serif" },
  closeBtn:{ background:"transparent", border:"1px solid #888", borderRadius:8, padding:"8px 14px", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600 },
  dateInput: { background:"#080c10", border:"1px solid #161b22", borderRadius:8, padding:"8px 12px", color:"#fff", fontFamily:"'DM Sans',sans-serif", fontSize:13, colorScheme:"dark" },
  rowBetween: { display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #0d1117", fontSize:13 },
};

export default function ZReport({ onClose }) {
  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo,   setDateTo]   = useState(todayStr());
  const [activePreset, setActivePreset] = useState("today");

  // Preset helper
  const applyPreset = (key) => {
    const today = new Date();
    const ymd = (d) => d.toISOString().slice(0,10);
    let from = new Date(today), to = new Date(today);
    if (key === "today") { /* same day */ }
    else if (key === "yesterday") { from.setDate(today.getDate()-1); to = new Date(from); }
    else if (key === "7days") { from.setDate(today.getDate()-6); }
    else if (key === "30days") { from.setDate(today.getDate()-29); }
    else if (key === "thisMonth") { from = new Date(today.getFullYear(), today.getMonth(), 1); }
    else if (key === "lastMonth") {
      const lm = new Date(today.getFullYear(), today.getMonth()-1, 1);
      from = lm; to = new Date(today.getFullYear(), today.getMonth(), 0);
    }
    setDateFrom(ymd(from));
    setDateTo(ymd(to));
    setActivePreset(key);
  };
  const [report,  setReport]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState(null);

  const load = async (d) => {
    setLoading(true); setError(null);
    try {
      const r = await api.getZReport(d);
      setReport(r);
    } catch (e) {
      setError(e.message || "Gagal memuat laporan");
      setReport(null);
    }
    setLoading(false);
  };

  useEffect(() => { load({from: dateFrom, to: dateTo}); }, [dateFrom, dateTo]);
  useEffect(() => {
    api.getEmailConfig?.().then(c => { if (c?.recipients?.length) setEmailTo(c.recipients.join(", ")); }).catch(()=>{});
  }, []);

  return (
    <div style={S.overlay}>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }

          /* Reset all body elements but keep the report */
          body { background: white !important; margin: 0 !important; }
          body > *:not(.z-report-overlay) { display: none !important; }

          /* Convert modal to flow layout for print */
          .z-report-overlay {
            position: static !important;
            inset: auto !important;
            background: white !important;
            color: black !important;
            overflow: visible !important;
            height: auto !important;
            width: 100% !important;
            padding: 0 !important;
            display: block !important;
          }

          /* Hide control header (date picker, refresh, print, tutup) */
          .z-report-overlay > header { display: none !important; }

          /* Show print-only elements */
          .print-header, .print-footer { display: block !important; }

          /* Force light theme */
          .z-report-overlay,
          .z-report-overlay main,
          .z-report-overlay div,
          .z-report-overlay span,
          .z-report-overlay table,
          .z-report-overlay td,
          .z-report-overlay th {
            background: white !important;
            color: black !important;
            border-color: #ccc !important;
            box-shadow: none !important;
          }

          /* Preserve accent colors but darker for print */
          .z-report-overlay [style*="#F59E0B"],
          .z-report-overlay [style*="#FB923C"] { color: #b45309 !important; }
          .z-report-overlay [style*="#34D399"] { color: #047857 !important; }
          .z-report-overlay [style*="#A78BFA"] { color: #6d28d9 !important; }
          .z-report-overlay [style*="#F87171"] { color: #b91c1c !important; }

          /* Page breaks */
          .print-section { page-break-inside: avoid; }
          h2, h3 { page-break-after: avoid; }
        }
      `}</style>
      <header style={S.header}>
        <div>
          <div style={S.title}>📊 Z-REPORT</div>
          {report?.period?.label && <div style={{fontSize:13, color:"#888", marginTop:4}}>{report.period.label}</div>}
        </div>
        <div style={{display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            {[
              {k:"today",     l:"Hari Ini"},
              {k:"yesterday", l:"Kemarin"},
              {k:"7days",     l:"7 Hari"},
              {k:"30days",    l:"30 Hari"},
              {k:"thisMonth", l:"Bulan Ini"},
              {k:"lastMonth", l:"Bulan Lalu"},
            ].map(p => (
              <button key={p.k} onClick={()=>applyPreset(p.k)}
                style={{background: activePreset===p.k ? "rgba(245,158,11,0.18)" : "transparent",
                  border:`1px solid ${activePreset===p.k?"#F59E0B":"#21262d"}`,
                  borderRadius:6, padding:"5px 10px",
                  color: activePreset===p.k ? "#F59E0B" : "#888",
                  fontSize:11, fontWeight:600, cursor:"pointer"}}>{p.l}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <input type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setActivePreset("custom");}} style={S.dateInput} />
            <span style={{color:"#666"}}>–</span>
            <input type="date" value={dateTo} onChange={e=>{setDateTo(e.target.value);setActivePreset("custom");}} style={S.dateInput} />
            <button style={S.btn} onClick={() => load({from: dateFrom, to: dateTo})}>🔄 Refresh</button>
          </div>
          <button style={{...S.btn,background:"linear-gradient(90deg,#A78BFA,#7C3AED)",color:"#fff"}} onClick={() => { setShowEmailModal(true); setEmailResult(null); }}>📧 Email</button>
          <button style={{...S.btn,background:"linear-gradient(90deg,#34D399,#10B981)",color:"#050810"}} onClick={async () => {
  if (!report) return;
  // Dynamically load SheetJS from CDN if not already loaded
  if (!window.XLSX) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  const fIDR2 = (a) => Math.round(a||0);
  const s2 = report.summary || {};
  const periodLabel = report?.period?.label || "Hari Ini";
  const adminName = localStorage.getItem("adminName") || "Admin";

  // Sheet 1: Ringkasan
  const ringkasan = [
    ["BINTORO Z-REPORT", ""],
    ["Periode", periodLabel],
    ["Dicetak", new Date().toLocaleString("id-ID")],
    ["Oleh", adminName],
    [],
    ["Metrik", "Nilai"],
    ["Transaksi", s2.transactionCount||0],
    ["Gross Revenue", fIDR2(s2.grossRevenue)],
    ["Net Revenue", fIDR2(s2.netRevenue)],
    ["PPN 11% (extracted)", fIDR2(s2.taxExtracted)],
    ["Rata-rata Tiket", fIDR2(s2.avgTicket)],
    ["Total Diskon Promo", fIDR2(s2.promoDiscount)],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(ringkasan);
  ws1["!cols"] = [{wch:30},{wch:20}];
  XLSX.utils.book_append_sheet(wb, ws1, "Ringkasan");

  // Sheet 2: Breakdown Pembayaran
  const payRows = [["Metode","Transaksi","Total (Rp)"]];
  Object.entries(report.payments||{}).forEach(([k,v]) => payRows.push([k, v.count||0, fIDR2(v.total)]));
  const ws2 = XLSX.utils.aoa_to_sheet(payRows);
  ws2["!cols"] = [{wch:20},{wch:12},{wch:18}];
  XLSX.utils.book_append_sheet(wb, ws2, "Pembayaran");

  // Sheet 3: Jenis Order
  const orderRows = [["Jenis Order","Transaksi","Total (Rp)"]];
  Object.entries(report.orderTypes||{}).forEach(([k,v]) => {
    const lbl = k==="dine"?"Dine-in":k==="takeaway"?"Takeaway":k;
    orderRows.push([lbl, v.count||0, fIDR2(v.total)]);
  });
  const ws3 = XLSX.utils.aoa_to_sheet(orderRows);
  ws3["!cols"] = [{wch:20},{wch:12},{wch:18}];
  XLSX.utils.book_append_sheet(wb, ws3, "Jenis Order");

  // Sheet 4: Top Items
  const itemRows = [["Rank","Item","Qty","Revenue (Rp)"]];
  (report.topItems||[]).forEach((it,i) => itemRows.push([i+1, it.name||"-", it.qty||0, fIDR2(it.revenue)]));
  const ws4 = XLSX.utils.aoa_to_sheet(itemRows);
  ws4["!cols"] = [{wch:6},{wch:40},{wch:8},{wch:18}];
  XLSX.utils.book_append_sheet(wb, ws4, "Top Items");

  // Sheet 5: Promo (if exists)
  if ((report.promos||[]).length || (report.promoUsage)) {
    const promoData = report.promos || report.promoUsage || [];
    const promoArr = Array.isArray(promoData) ? promoData : Object.entries(promoData).map(([k,v])=>({code:k,...v}));
    const promoRows = [["Kode Promo","Dipakai","Total Diskon (Rp)"]];
    promoArr.forEach(p => promoRows.push([p.code||p.name||"-", p.count||p.uses||0, fIDR2(p.discount||p.totalDiscount)]));
    const ws5 = XLSX.utils.aoa_to_sheet(promoRows);
    ws5["!cols"] = [{wch:20},{wch:12},{wch:18}];
    XLSX.utils.book_append_sheet(wb, ws5, "Promo");
  }

  // Sheet 6: Cash Reconciliation (if exists)
  if (report.cashRecon) {
    const cr = report.cashRecon;
    const cashRows = [
      ["Metrik","Nilai"],
      ["Transaksi Cash", cr.cashTx||cr.count||0],
      ["Penjualan Cash (Rp)", fIDR2(cr.cashSales||cr.sales)],
      ["Kas Diterima (Rp)", fIDR2(cr.cashReceived||cr.received)],
      ["Kembalian (Rp)", fIDR2(cr.cashChange||cr.change)],
    ];
    const ws6 = XLSX.utils.aoa_to_sheet(cashRows);
    ws6["!cols"] = [{wch:25},{wch:18}];
    XLSX.utils.book_append_sheet(wb, ws6, "Rekonsiliasi Kas");
  }

  // Filename: Z-Report_2026-05-15_to_2026-05-15.xlsx
  const from = report?.period?.from || new Date().toISOString().slice(0,10);
  const to   = report?.period?.to   || from;
  const filename = `Z-Report_${from}${to!==from?"_to_"+to:""}.xlsx`;
  XLSX.writeFile(wb, filename);
}}>📊 Excel</button>
          <button style={S.btn} onClick={() => {
  // Open dedicated print window with formatted content
  if (!report) return;
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) { alert("Pop-up blocked. Izinkan pop-up untuk print."); return; }
  const fIDR2 = (a) => "Rp " + Math.round(a||0).toLocaleString("id-ID");
  const adminName = localStorage.getItem("adminName") || "Admin";
  const adminRole = localStorage.getItem("adminRole") || "-";
  const printedAt = new Date().toLocaleString("id-ID",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"});
  const s = report.summary || {};
  // Normalize payment + orderType objects → arrays
  const paymentsArr = Object.entries(report.payments || {}).map(([k,v]) => ({method:k, count:v.count||0, total:v.total||0}));
  const orderTypesArr = Object.entries(report.orderTypes || {}).map(([k,v]) => ({label: k==="dine"?"Dine-in":k==="takeaway"?"Takeaway":k, count:v.count||0, total:v.total||0}));
  const orderTypeLabel = (k) => k==="dine"?"🍽 Dine-in":k==="takeaway"?"🛍 Takeaway":k;
  const html = `<!DOCTYPE html><html><head><title>Z-Report ${report?.period?.label||""}</title>
    <style>
      @page { size: A4 portrait; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #000; background: #e5e5e5; line-height: 1.45; font-size: 12px; }
      .paper {
        width: 210mm;
        min-height: 297mm;
        max-width: 100%;
        margin: 20px auto;
        background: #fff;
        padding: 16mm 16mm 14mm 16mm;
        box-shadow: 0 4px 16px rgba(0,0,0,0.12);
        display: flex;
        flex-direction: column;
      }
      .content { flex: 1; }
      @media print {
        body { background: #fff !important; }
        .paper { width: 210mm; height: 297mm; margin: 0; padding: 14mm 15mm 12mm 15mm; box-shadow: none; page-break-after: always; }
      }
      h1, h2, h3 { margin: 0; }
      .brand-row { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 18px; }
      .brand { font-size: 26px; font-weight: 900; letter-spacing: 4px; }
      .brand-sub { font-size: 9px; letter-spacing: 2px; color: #555; margin-top: 2px; }
      .meta { font-size: 10px; color: #444; text-align: right; line-height: 1.6; }
      .title { text-align: center; margin: 14px 0 22px; }
      .title-main { font-size: 20px; font-weight: 800; letter-spacing: 4px; }
      .title-sub { font-size: 12px; color: #444; margin-top: 3px; font-weight: 600; letter-spacing: 2px; }
      .period { font-size: 11px; color: #555; margin-top: 5px; font-style: italic; }
      .section { margin-bottom: 18px; page-break-inside: avoid; }
      .section-title { font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #555; border-bottom: 1px solid #aaa; padding-bottom: 4px; margin-bottom: 10px; text-transform: uppercase; }
      .kv-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 20px; }
      .kv { padding: 6px 0; }
      .kv-label { font-size: 9px; color: #777; letter-spacing: 1px; text-transform: uppercase; }
      .kv-val { font-size: 16px; font-weight: 700; margin-top: 3px; }
      .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
      .green { color: #047857; }
      .orange { color: #b45309; }
      .purple { color: #6d28d9; }
      .red { color: #b91c1c; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #eee; }
      th { font-size: 9px; letter-spacing: 1px; color: #777; text-transform: uppercase; border-bottom: 1.5px solid #888; }
      td.r, th.r { text-align: right; }
      .signoff { margin-top: auto; padding-top: 30px; display: flex; justify-content: space-around; font-size: 10px; }
      .sig { width: 180px; text-align: center; }
      .sig-line { border-top: 1px solid #000; margin-top: 50px; padding-top: 4px; font-size: 9px; color: #666; }
      .footer { margin-top: 14px; padding-top: 10px; border-top: 1px dashed #ccc; font-size: 9px; color: #888; text-align: center; }
    </style></head><body>
    <div class="paper">
    <div class="content">
    <div class="brand-row">
      <div>
        <div class="brand">🍦 BINTORO</div>
        <div class="brand-sub">SELF-ORDER KIOSK · POS</div>
      </div>
      <div class="meta">
        <div>Dicetak: ${printedAt}</div>
        <div>Oleh: ${adminName} (${adminRole})</div>
      </div>
    </div>
    <div class="title">
      <div class="title-main">📊 Z-REPORT</div>
      <div class="title-sub">LAPORAN PENJUALAN</div>
      <div class="period">Periode: ${report?.period?.label || "—"}</div>
    </div>

    <div class="section">
      <div class="section-title">Ringkasan</div>
      <div class="kv-grid">
        <div class="kv"><div class="kv-label">Transaksi</div><div class="kv-val">${s.transactionCount || 0}</div></div>
        <div class="kv"><div class="kv-label">Gross Revenue</div><div class="kv-val green">${fIDR2(s.grossRevenue)}</div></div>
        <div class="kv"><div class="kv-label">Net Revenue</div><div class="kv-val">${fIDR2(s.netRevenue)}</div></div>
        <div class="kv"><div class="kv-label">PPN 11% (extracted)</div><div class="kv-val purple">${fIDR2(s.taxExtracted)}</div></div>
        <div class="kv"><div class="kv-label">Rata-rata Tiket</div><div class="kv-val">${fIDR2(s.avgTicket)}</div></div>
        <div class="kv"><div class="kv-label">Total Diskon Promo</div><div class="kv-val orange">−${fIDR2(s.promoDiscount)}</div></div>
      </div>
    </div>

    <div class="two-col">
      ${paymentsArr.length ? `<div class="section">
        <div class="section-title">Breakdown Pembayaran</div>
        <table><thead><tr><th>Metode</th><th class="r">Trx</th><th class="r">Total</th></tr></thead>
        <tbody>${paymentsArr.map(p=>`<tr><td>${p.method}</td><td class="r">${p.count}</td><td class="r">${fIDR2(p.total)}</td></tr>`).join("")}</tbody></table>
      </div>` : ""}

      ${orderTypesArr.length ? `<div class="section">
        <div class="section-title">Jenis Order</div>
        <table><tbody>${orderTypesArr.map(o=>`<tr><td>${o.label}</td><td class="r">${o.count}×</td><td class="r">${fIDR2(o.total)}</td></tr>`).join("")}</tbody></table>
      </div>` : ""}
    </div>

    ${report.cashRecon ? `<div class="section">
      <div class="section-title">Rekonsiliasi Kas</div>
      <table><tbody>
        <tr><td>Transaksi Cash</td><td class="r">${report.cashRecon.cashTx||report.cashRecon.count||0}</td></tr>
        <tr><td>Penjualan Cash</td><td class="r">${fIDR2(report.cashRecon.cashSales||report.cashRecon.sales)}</td></tr>
        <tr><td>Kas Diterima</td><td class="r">${fIDR2(report.cashRecon.cashReceived||report.cashRecon.received)}</td></tr>
        <tr><td>Kembalian</td><td class="r orange">${fIDR2(report.cashRecon.cashChange||report.cashRecon.change)}</td></tr>
      </tbody></table>
    </div>` : ""}

    ${(report.topItems||[]).length ? `<div class="section">
      <div class="section-title">Top 10 Items</div>
      <table><thead><tr><th>#</th><th>Item</th><th class="r">Qty</th><th class="r">Revenue</th></tr></thead>
      <tbody>${report.topItems.slice(0,10).map((it,i)=>`<tr><td>${i+1}</td><td>${it.name||"—"}</td><td class="r">${it.qty||0}</td><td class="r">${fIDR2(it.revenue)}</td></tr>`).join("")}</tbody></table>
    </div>` : ""}

    ${(report.promos||[]).length ? `<div class="section">
      <div class="section-title">Pemakaian Promo</div>
      <table><thead><tr><th>Kode</th><th class="r">Dipakai</th><th class="r">Diskon</th></tr></thead>
      <tbody>${report.promos.map(p=>`<tr><td>${p.code||p.name}</td><td class="r">${p.count||p.uses||0}</td><td class="r orange">−${fIDR2(p.discount||p.totalDiscount)}</td></tr>`).join("")}</tbody></table>
    </div>` : ""}

    </div>
    <div class="signoff">
      <div class="sig"><div class="sig-line">Kasir / Operator</div></div>
      <div class="sig"><div class="sig-line">Supervisor / Manager</div></div>
    </div>

    <div class="footer">BINTORO Kiosk · Z-Report dicetak otomatis dari sistem POS · ${printedAt}</div>
    </div>

    <script>window.onload = () => setTimeout(() => { window.print(); window.onafterprint = () => window.close(); }, 200);</script>
  </body></html>`;
  w.document.write(html);
  w.document.close();
}}>🖨 Print</button>
          <button style={S.closeBtn} onClick={onClose}>✕ Tutup</button>
        </div>
      </header>

      <main style={S.body}>
        {/* Print-only header — only shows when printing */}
        {report && (
          <div className="print-header" style={{display:"none"}}>
            <div style={{borderBottom:"2px solid #000",paddingBottom:14,marginBottom:20}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
                <div>
                  <div style={{fontSize:32,fontWeight:900,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:4,color:"#000"}}>🍦 BINTORO</div>
                  <div style={{fontSize:11,color:"#000",letterSpacing:2,marginTop:2}}>SELF-ORDER KIOSK · POS</div>
                </div>
                <div style={{textAlign:"right",fontSize:10,color:"#444"}}>
                  <div>Dicetak: {new Date().toLocaleString("id-ID",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
                  <div>Oleh: {localStorage.getItem("adminName") || "Admin"} ({localStorage.getItem("adminRole") || "-"})</div>
                </div>
              </div>
            </div>
            <div style={{textAlign:"center",marginBottom:24}}>
              <div style={{fontSize:22,fontWeight:800,color:"#000",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3}}>📊 Z-REPORT</div>
              <div style={{fontSize:13,color:"#222",marginTop:4,fontWeight:600}}>LAPORAN PENJUALAN</div>
              <div style={{fontSize:12,color:"#444",marginTop:6,fontStyle:"italic"}}>Periode: {report?.period?.label || "—"}</div>
            </div>
          </div>
        )}

        {loading && <div style={{textAlign:"center", padding:40, color:"#888"}}>Memuat laporan…</div>}
        {error && <div style={{...S.card, color:"#F87171"}}>❌ {error}</div>}

        {report && !loading && (
          <>
            <section style={S.card}>
              <div style={S.cardTitle}>📈 Ringkasan Hari</div>
              <div style={S.grid4}>
                <div style={S.tile}><div style={S.tileLabel}>TRANSAKSI</div><div style={S.tileValue}>{report.summary.transactionCount}</div></div>
                <div style={S.tile}><div style={S.tileLabel}>GROSS REVENUE</div><div style={{...S.tileValue, color:"#34D399"}}>{fmt(report.summary.grossRevenue)}</div></div>
                <div style={S.tile}><div style={S.tileLabel}>NET REVENUE</div><div style={S.tileValue}>{fmt(report.summary.netRevenue)}</div></div>
                <div style={S.tile}><div style={S.tileLabel}>PPN 11% (extracted)</div><div style={{...S.tileValue, color:"#A78BFA"}}>{fmt(report.summary.taxExtracted)}</div></div>
                <div style={S.tile}><div style={S.tileLabel}>RATA-RATA TIKET</div><div style={S.tileValue}>{fmt(report.summary.avgTicket)}</div></div>
                <div style={S.tile}><div style={S.tileLabel}>TOTAL DISKON PROMO</div><div style={{...S.tileValue, color:"#FB923C"}}>−{fmt(report.summary.promoDiscount)}</div></div>
              </div>
            </section>

            <section style={S.card}>
              <div style={S.cardTitle}>💳 Breakdown Pembayaran</div>
              <table style={S.table}>
                <thead><tr><th style={S.th}>Metode</th><th style={{...S.th, textAlign:"right"}}>Transaksi</th><th style={{...S.th, textAlign:"right"}}>Total</th></tr></thead>
                <tbody>
                  {Object.keys(report.payments).length === 0
                    ? <tr><td colSpan={3} style={{...S.td, textAlign:"center", color:"#666"}}>Tidak ada transaksi</td></tr>
                    : Object.entries(report.payments).map(([m, info]) => (
                        <tr key={m}>
                          <td style={S.td}>{m === "CASH" ? "💵 Tunai" : m === "QRIS" ? "📱 QRIS / GoPay" : m}</td>
                          <td style={{...S.td, textAlign:"right"}}>{info.count}</td>
                          <td style={{...S.td, textAlign:"right", fontFamily:"'Space Mono',monospace"}}>{fmt(info.total)}</td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
            </section>

            <div style={S.grid2}>
              <section style={S.card}>
                <div style={S.cardTitle}>🍽 Jenis Order</div>
                {Object.keys(report.orderTypes).length === 0
                  ? <div style={{padding:8, color:"#666", fontSize:13}}>Tidak ada data</div>
                  : Object.entries(report.orderTypes).map(([t, info]) => (
                      <div key={t} style={S.rowBetween}>
                        <span>{t === "dine" ? "🍽 Dine-in" : t === "takeaway" ? "🛍 Takeaway" : t}</span>
                        <span style={{fontFamily:"'Space Mono',monospace"}}>{info.count}× · {fmt(info.total)}</span>
                      </div>
                    ))
                }
              </section>

              <section style={S.card}>
                <div style={S.cardTitle}>💵 Rekonsiliasi Kas</div>
                <div style={S.rowBetween}><span style={{color:"#888"}}>Transaksi Cash</span><span>{report.cashReconciliation.transactionCount}</span></div>
                <div style={S.rowBetween}><span style={{color:"#888"}}>Penjualan Cash</span><span style={{fontFamily:"'Space Mono',monospace"}}>{fmt(report.cashReconciliation.cashSales)}</span></div>
                <div style={S.rowBetween}><span style={{color:"#888"}}>Kas Diterima</span><span style={{fontFamily:"'Space Mono',monospace"}}>{fmt(report.cashReconciliation.cashReceived)}</span></div>
                <div style={{...S.rowBetween, borderBottom:"none", paddingTop:10}}><span style={{color:"#888"}}>Kembalian</span><span style={{color:"#FB923C", fontFamily:"'Space Mono',monospace"}}>{fmt(report.cashReconciliation.cashChange)}</span></div>
              </section>
            </div>

            <section style={S.card}>
              <div style={S.cardTitle}>🏆 Top 10 Items</div>
              <table style={S.table}>
                <thead><tr><th style={S.th}>#</th><th style={S.th}>Item</th><th style={{...S.th, textAlign:"right"}}>Qty</th><th style={{...S.th, textAlign:"right"}}>Revenue</th></tr></thead>
                <tbody>
                  {report.topItems.length === 0
                    ? <tr><td colSpan={4} style={{...S.td, textAlign:"center", color:"#666"}}>Tidak ada item terjual</td></tr>
                    : report.topItems.map((it, i) => (
                        <tr key={i}>
                          <td style={{...S.td, color:"#888"}}>{i + 1}</td>
                          <td style={S.td}>{it.name}</td>
                          <td style={{...S.td, textAlign:"right", fontFamily:"'Space Mono',monospace"}}>{it.qty}</td>
                          <td style={{...S.td, textAlign:"right", fontFamily:"'Space Mono',monospace"}}>{fmt(it.revenue)}</td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
            </section>

            {Object.keys(report.promoUsage).length > 0 && (
              <section style={S.card}>
                <div style={S.cardTitle}>🎟️ Pemakaian Promo</div>
                <table style={S.table}>
                  <thead><tr><th style={S.th}>Kode</th><th style={{...S.th, textAlign:"right"}}>Dipakai</th><th style={{...S.th, textAlign:"right"}}>Diskon</th></tr></thead>
                  <tbody>
                    {Object.entries(report.promoUsage).map(([code, info]) => (
                      <tr key={code}>
                        <td style={{...S.td, fontFamily:"'Space Mono',monospace"}}>{code}</td>
                        <td style={{...S.td, textAlign:"right"}}>{info.count}×</td>
                        <td style={{...S.td, textAlign:"right", color:"#FB923C", fontFamily:"'Space Mono',monospace"}}>−{fmt(info.totalDiscount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {report.shift && (
              <section style={S.card}>
                <div style={S.cardTitle}>🕐 Shift Aktif</div>
                <div style={{fontSize:13, color:"#888"}}>
                  Dibuka oleh <strong style={{color:"#fff"}}>{report.shift.openedBy || "—"}</strong>
                  {report.shift.openedAt && ` · ${new Date(report.shift.openedAt).toLocaleString("id-ID")}`}
                </div>
              </section>
            )}

            <div style={{textAlign:"center", fontSize:11, color:"#444", padding:"20px 0"}}>
              Generated {new Date(report.generatedAt).toLocaleString("id-ID")} · BINTORO Kiosk
            </div>
          </>
        )}
      </main>
      {showEmailModal && (
        <div onClick={()=>setShowEmailModal(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(8px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:16,padding:"30px",maxWidth:520,width:"90%"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
              <span style={{fontSize:32}}>📧</span>
              <div>
                <div style={{fontSize:18,fontWeight:700,color:"#fff"}}>Kirim Z-Report via Email</div>
                <div style={{fontSize:12,color:"#888"}}>Periode: {report?.period?.label || "—"}</div>
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,color:"#888",marginBottom:6,fontWeight:600}}>PENERIMA (pisah koma untuk multi)</div>
              <textarea value={emailTo} onChange={e=>setEmailTo(e.target.value)}
                placeholder="owner@bintoro.id, manager@bintoro.id"
                rows={2}
                style={{width:"100%",background:"#0a0e16",border:"1px solid #21262d",borderRadius:8,padding:"10px 12px",color:"#fff",fontSize:13,fontFamily:"'DM Sans',sans-serif",resize:"vertical"}}/>
              <div style={{fontSize:10,color:"#666",marginTop:6}}>📎 Attachment: Z-Report Excel file ({report?.period?.from || "—"}{report?.period?.to && report.period.to !== report.period.from ? "_to_" + report.period.to : ""}.xlsx)</div>
            </div>
            {emailResult && (
              <div style={{padding:"10px 12px",background: emailResult.error ? "rgba(248,113,113,0.1)" : "rgba(52,211,153,0.1)", border:`1px solid ${emailResult.error?"#F87171":"#34D399"}`, borderRadius:8, fontSize:12, color: emailResult.error?"#F87171":"#34D399", marginBottom:12}}>
                {emailResult.error ? `❌ ${emailResult.error}` : `✅ Terkirim ke ${emailResult.recipients?.length||0} penerima`}
              </div>
            )}
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setShowEmailModal(false)} disabled={emailSending}
                style={{background:"transparent",border:"1px solid #21262d",borderRadius:8,padding:"10px 20px",color:"#888",cursor:"pointer",fontSize:12,fontWeight:600}}>
                Tutup
              </button>
              <button disabled={emailSending || !emailTo} onClick={async () => {
                if (!report || !emailTo) return;
                setEmailSending(true); setEmailResult(null);
                try {
                  if (!window.XLSX) {
                    await new Promise((res, rej) => {
                      const s = document.createElement("script");
                      s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
                      s.onload = res; s.onerror = rej;
                      document.head.appendChild(s);
                    });
                  }
                  const XLSX = window.XLSX;
                  const wb = XLSX.utils.book_new();
                  const fI2 = (a) => Math.round(a||0);
                  const s2 = report.summary || {};
                  const ringkasan = [["BINTORO Z-REPORT"],["Periode", report?.period?.label||""],["Dicetak", new Date().toLocaleString("id-ID")],[],["Metrik","Nilai"],["Transaksi", s2.transactionCount||0],["Gross Revenue", fI2(s2.grossRevenue)],["Net Revenue", fI2(s2.netRevenue)],["PPN 11% extracted", fI2(s2.taxExtracted)],["Rata-rata Tiket", fI2(s2.avgTicket)],["Diskon Promo", fI2(s2.promoDiscount)]];
                  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ringkasan), "Ringkasan");
                  const payRows = [["Metode","Trx","Total"]];
                  Object.entries(report.payments||{}).forEach(([k,v])=>payRows.push([k,v.count||0,fI2(v.total)]));
                  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(payRows), "Pembayaran");
                  const orderRows = [["Jenis","Trx","Total"]];
                  Object.entries(report.orderTypes||{}).forEach(([k,v])=>orderRows.push([k==="dine"?"Dine-in":k==="takeaway"?"Takeaway":k,v.count||0,fI2(v.total)]));
                  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(orderRows), "Jenis Order");
                  const itemRows = [["Rank","Item","Qty","Revenue"]];
                  (report.topItems||[]).forEach((it,i)=>itemRows.push([i+1,it.name||"-",it.qty||0,fI2(it.revenue)]));
                  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(itemRows), "Top Items");
                  // To base64
                  const wbout = XLSX.write(wb, {bookType:"xlsx", type:"array"});
                  const b64 = btoa(new Uint8Array(wbout).reduce((s,b)=>s+String.fromCharCode(b),""));
                  const from = report?.period?.from || new Date().toISOString().slice(0,10);
                  const to = report?.period?.to || from;
                  const filename = `Z-Report_${from}${to!==from?"_to_"+to:""}.xlsx`;
                  const result = await api.emailZReport({
                    recipients: emailTo.split(",").map(x=>x.trim()).filter(Boolean),
                    subject: `Z-Report BINTORO — ${report?.period?.label||"Hari Ini"}`,
                    attachmentBase64: b64,
                    attachmentFilename: filename,
                    periodLabel: report?.period?.label||"",
                  });
                  setEmailResult(result);
                } catch(e) {
                  setEmailResult({error: e.message || "Gagal kirim email"});
                } finally { setEmailSending(false); }
              }}
                style={{background:emailSending?"#666":"linear-gradient(90deg,#A78BFA,#7C3AED)",border:"none",borderRadius:8,padding:"10px 22px",color:"#fff",cursor:emailSending?"wait":"pointer",fontSize:13,fontWeight:700}}>
                {emailSending ? "⏳ Mengirim..." : "📧 Kirim Email"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
