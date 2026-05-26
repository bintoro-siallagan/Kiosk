import { useState, useEffect, useRef } from "react";
import { api } from "./api.js";
import API_HOST from "./apiBase.js";

const formatIDR = (a) => "Rp " + Math.round(a).toLocaleString("id-ID");
const fmtDate  = (d) => new Date(d).toLocaleDateString("id-ID", { day:"2-digit", month:"short", year:"numeric" });
const fmtTime  = (d) => new Date(d).toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit" });

// ── MOCK DATA (fallback if backend offline) ─────────────────────────────────
const MOCK_ORDERS = [
  { id:"A01", time:Date.now()-3600000*2, type:"dine",     table:"A3", status:"completed", pay:"QRIS",     total:185000, items:[{e:"🍔",n:"Classic Smash Burger",q:2,p:55000},{e:"🍟",n:"Truffle Fries",q:1,p:38000}] },
  { id:"A02", time:Date.now()-3600000*1, type:"takeaway", table:"-",  status:"completed", pay:"Transfer", total:98000,  items:[{e:"🫧",n:"Truffle Funghi",q:1,p:98000}] },
  { id:"A03", time:Date.now()-3600000*3, type:"dine",     table:"B1", status:"completed", pay:"Cash",     total:142000, items:[{e:"🥩",n:"BBQ Bacon Beast",q:1,p:75000},{e:"🥛",n:"Salted Caramel Shake",q:2,p:32000}] },
  { id:"A04", time:Date.now()-3600000*4, type:"dine",     table:"A1", status:"completed", pay:"Kartu",    total:220000, items:[{e:"🔥",n:"Diavola",q:2,p:88000},{e:"🥬",n:"Caesar Royale",q:1,p:52000}] },
  { id:"A05", time:Date.now()-1800000,   type:"dine",     table:"C2", status:"cancelled", pay:"QRIS",     total:75000,  items:[{e:"🥩",n:"BBQ Bacon Beast",q:1,p:75000}] },
  { id:"A06", time:Date.now()-7200000,   type:"takeaway", table:"-",  status:"completed", pay:"QRIS",     total:163000, items:[{e:"🍕",n:"Margherita",q:1,p:78000},{e:"🍋",n:"Craft Lemonade",q:2,p:22000}] },
  { id:"A07", time:Date.now()-9000000,   type:"dine",     table:"D1", status:"completed", pay:"Transfer", total:310000, items:[{e:"🫧",n:"Truffle Funghi",q:2,p:98000},{e:"🍮",n:"Burnt Basque Cheesecake",q:1,p:42000}] },
  { id:"A08", time:Date.now()-10800000,  type:"dine",     table:"B2", status:"completed", pay:"Kartu",    total:127000, items:[{e:"🍔",n:"Classic Smash Burger",q:1,p:55000},{e:"🍵",n:"Matcha Cooler",q:1,p:25000},{e:"🍫",n:"Choco Lava Cake",q:1,p:45000}] },
  { id:"A09", time:Date.now()-12600000,  type:"takeaway", table:"-",  status:"completed", pay:"QRIS",     total:90000,  items:[{e:"🍟",n:"Truffle Fries",q:2,p:38000},{e:"🍋",n:"Craft Lemonade",q:1,p:22000}] },
  { id:"A10", time:Date.now()-14400000,  type:"dine",     table:"A2", status:"completed", pay:"Cash",     total:203000, items:[{e:"🔥",n:"Diavola",q:1,p:88000},{e:"🥩",n:"BBQ Bacon Beast",q:1,p:75000}] },
];

// ── PRINTER CONFIG ──────────────────────────────────────────────────────────
const PRINTER_DEFAULT = { ip: "192.168.1.100", port: 9100 };

// ESC/POS commands builder
function escpos() {
  const buf = [];
  const ESC = 0x1B, GS = 0x1D;

  return {
    init()        { buf.push(ESC,0x40); return this; },
    bold(on)      { buf.push(ESC,0x45, on?1:0); return this; },
    align(a)      { buf.push(ESC,0x61, a==="L"?0:a==="C"?1:2); return this; },
    size(w,h)     { buf.push(GS,0x21, ((w-1)<<4)|(h-1)); return this; },
    text(s)       { for(const c of s) buf.push(c.charCodeAt(0)&0xFF); return this; },
    newline(n=1)  { for(let i=0;i<n;i++) buf.push(0x0A); return this; },
    line(char="-",len=32) { buf.push(...Array.from({length:len},()=>char.charCodeAt(0))); buf.push(0x0A); return this; },
    dline(len=32) { return this.line("=",len); },
    cut()         { buf.push(GS,0x56,0x41,0x03); return this; },
    beep()        { buf.push(ESC,0x42,0x03,0x01); return this; },
    bytes()       { return new Uint8Array(buf); },
  };
}

// Send to Epson TM-T82 via LAN (uses fetch to a local proxy or direct TCP)
async function printToEpson(data, printerIp, printerPort) {
  // Try via WebSocket proxy on backend
  try {
    const res = await fetch(`${API_HOST}/api/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ip:   printerIp,
        port: printerPort,
        data: Array.from(data),
      }),
    });
    if (res.ok) return { ok: true };
  } catch {}

  // Fallback: browser print dialog (formatted receipt)
  return { ok: false, fallback: true };
}

// Build ESC/POS receipt bytes
function buildReceipt(orders, reportType, dateRange, printerWidth=32) {
  const W = printerWidth;
  const completed = orders.filter(o => o.status !== "cancelled");
  const revenue   = completed.reduce((s,o) => s+o.total, 0);
  const tax       = Math.round(revenue * 0.11 / 1.11);
  const now       = new Date();

  const p = escpos().init()
    .align("C").bold(true).size(2,2).text("KaryaOS").newline()
    .size(1,1).text("Self Order Kiosk").newline()
    .bold(false).text("Jl. Contoh No.1, Jakarta").newline()
    .text("Telp: 021-12345678").newline()
    .dline(W)
    .align("L")
    .bold(true).text(`LAPORAN ${reportType.toUpperCase()}`).newline().bold(false)
    .text(`Cetak : ${fmtDate(now)} ${fmtTime(now)}`).newline()
    .text(`Periode: ${dateRange}`).newline()
    .dline(W);

  if (reportType === "sales") {
    p.bold(true).text("RINGKASAN PENJUALAN").newline().bold(false)
     .text(`Total Transaksi : ${completed.length}`).newline()
     .text(`Dibatalkan      : ${orders.filter(o=>o.status==="cancelled").length}`).newline()
     .line("-",W)
     .bold(true).text("PENDAPATAN").newline().bold(false);

    const sub = Math.round(revenue / 1.11);
    p.text(`Subtotal        : ${formatIDR(sub)}`).newline()
     .text(`PPN 11%         : ${formatIDR(tax)}`).newline()
     .line("-",W)
     .bold(true).text(`TOTAL           : ${formatIDR(revenue)}`).newline().bold(false)
     .line("-",W);

    p.bold(true).text("DETAIL TRANSAKSI").newline().bold(false);
    completed.forEach(o => {
      p.text(`#${o.id} ${fmtTime(o.time)} ${o.type==="dine"?`Meja ${o.table}`:"Bawa"} ${formatIDR(o.total)}`).newline();
    });
  }

  if (reportType === "menu") {
    // Count item sales
    const itemMap = {};
    completed.forEach(o => o.items.forEach(i => {
      if (!itemMap[i.n]) itemMap[i.n] = { qty:0, rev:0 };
      itemMap[i.n].qty += i.q;
      itemMap[i.n].rev += i.p * i.q;
    }));
    const sorted = Object.entries(itemMap).sort((a,b)=>b[1].qty-a[1].qty);

    p.bold(true).text("PENJUALAN PER MENU").newline().bold(false)
     .text(("Item").padEnd(18) + "Qty".padStart(4) + "Total".padStart(10)).newline()
     .line("-",W);
    sorted.forEach(([name, d]) => {
      const n = name.length > 16 ? name.slice(0,16)+"." : name;
      p.text(n.padEnd(18) + String(d.qty).padStart(4) + formatIDR(d.rev).padStart(10)).newline();
    });
    p.line("-",W)
     .bold(true).text(`TOTAL ITEM TERJUAL: ${sorted.reduce((s,[,d])=>s+d.qty,0)}`).newline().bold(false);
  }

  if (reportType === "payment") {
    const payMap = {};
    completed.forEach(o => {
      payMap[o.pay] = (payMap[o.pay]||0) + o.total;
    });
    const countMap = {};
    completed.forEach(o => { countMap[o.pay] = (countMap[o.pay]||0)+1; });

    p.bold(true).text("LAPORAN PEMBAYARAN").newline().bold(false)
     .text(("Metode").padEnd(12) + "Trx".padStart(4) + "Total".padStart(16)).newline()
     .line("-",W);
    Object.entries(payMap).forEach(([pay, total]) => {
      p.text(pay.padEnd(12) + String(countMap[pay]).padStart(4) + formatIDR(total).padStart(16)).newline();
    });
    p.line("-",W)
     .bold(true).text(`TOTAL: ${formatIDR(revenue)}`).newline().bold(false);
  }

  if (reportType === "visit") {
    const dine     = completed.filter(o=>o.type==="dine").length;
    const takeaway = completed.filter(o=>o.type==="takeaway").length;
    const total    = dine + takeaway;

    p.bold(true).text("LAPORAN KUNJUNGAN").newline().bold(false)
     .line("-",W)
     .text(`Makan di Sini   : ${dine} (${total?Math.round(dine/total*100):0}%)`).newline()
     .text(`Bawa Pulang     : ${takeaway} (${total?Math.round(takeaway/total*100):0}%)`).newline()
     .line("-",W)
     .bold(true).text(`TOTAL KUNJUNGAN : ${total}`).newline().bold(false)
     .line("-",W)
     .text("JAM TERSIBUK").newline();

    // Group by hour
    const byHour = {};
    completed.forEach(o => {
      const h = new Date(o.time).getHours();
      byHour[h] = (byHour[h]||0)+1;
    });
    Object.entries(byHour).sort((a,b)=>b[1]-a[1]).slice(0,5).forEach(([h,c]) => {
      p.text(`  ${String(h).padStart(2,"0")}:00 - ${String(+h+1).padStart(2,"0")}:00  : ${c} kunjungan`).newline();
    });
  }

  p.dline(W)
   .align("C")
   .text("Terima kasih!").newline()
   .text("www.karys.tech").newline()
   .newline(3)
   .cut().beep();

  return p.bytes();
}

// ── REPORT COMPONENT ────────────────────────────────────────────────────────
export default function Report({ onBack }) {
  const [orders, setOrders]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState("sales");
  const [printer, setPrinter]       = useState(PRINTER_DEFAULT);
  const [showPrinter, setShowPrinter] = useState(false);
  const [printing, setPrinting]     = useState(false);
  const [printMsg, setPrintMsg]     = useState(null);
  const [dateFilter, setDateFilter] = useState("today");
  const printRef = useRef();

  useEffect(() => {
    api.getOrders()
      .then(setOrders)
      .catch(() => setOrders(MOCK_ORDERS))
      .finally(() => setLoading(false));
  }, []);

  const completed = orders.filter(o => o.status !== "cancelled");
  const revenue   = completed.reduce((s,o) => s+o.total, 0);
  const tax       = Math.round(revenue * 0.11 / 1.11);
  const net       = Math.round(revenue / 1.11);

  // ── Sales data
  const salesRows = [
    { label:"Total Transaksi",    val: completed.length + " pesanan",  color:"#5AC8FA" },
    { label:"Pendapatan Kotor",   val: formatIDR(revenue),              color:"#FF6B35" },
    { label:"PPN 11%",            val: formatIDR(tax),                  color:"#FFB800" },
    { label:"Pendapatan Bersih",  val: formatIDR(net),                  color:"#00C896" },
    { label:"Rata-rata/Pesanan",  val: formatIDR(completed.length ? Math.round(revenue/completed.length) : 0), color:"#fff" },
    { label:"Dibatalkan",         val: orders.filter(o=>o.status==="cancelled").length + " pesanan", color:"#FF3B30" },
  ];

  // ── Menu data
  const itemMap = {};
  completed.forEach(o => o.items.forEach(i => {
    if (!itemMap[i.n]) itemMap[i.n] = { e:i.e, qty:0, rev:0 };
    itemMap[i.n].qty += i.q;
    itemMap[i.n].rev += i.p * i.q;
  }));
  const menuRows = Object.entries(itemMap).sort((a,b)=>b[1].qty-a[1].qty);

  // ── Payment data
  const payMap = {}, payCount = {};
  completed.forEach(o => {
    payMap[o.pay]   = (payMap[o.pay]||0) + o.total;
    payCount[o.pay] = (payCount[o.pay]||0) + 1;
  });
  const payRows = Object.entries(payMap).sort((a,b)=>b[1]-a[1]);
  const payIcons = { QRIS:"📱", Transfer:"🏦", Cash:"💵", Kartu:"💳" };

  // ── Visit data
  const dine     = completed.filter(o=>o.type==="dine").length;
  const takeaway = completed.filter(o=>o.type==="takeaway").length;
  const totalVisit = dine + takeaway;
  const byHour   = {};
  completed.forEach(o => {
    const h = new Date(o.time).getHours();
    byHour[h] = (byHour[h]||0)+1;
  });
  const hourRows = Object.entries(byHour).sort((a,b)=>b[1]-a[1]).slice(0,6);

  const dateRangeLabel = dateFilter === "today" ? `Hari ini, ${fmtDate(Date.now())}` : dateFilter === "week" ? "7 Hari Terakhir" : "30 Hari Terakhir";

  // ── PRINT ────────────────────────────────────────────────────────────────
  async function handlePrint() {
    setPrinting(true);
    setPrintMsg(null);
    try {
      const bytes = buildReceipt(orders, activeTab, dateRangeLabel);
      const result = await printToEpson(bytes, printer.ip, printer.port);
      if (result.ok) {
        setPrintMsg({ ok:true, text:`✅ Tercetak di ${printer.ip}:${printer.port}` });
      } else {
        // Fallback: browser print
        browserPrint();
        setPrintMsg({ ok:true, text:"🖨️ Dikirim ke dialog print browser" });
      }
    } catch (e) {
      setPrintMsg({ ok:false, text:`❌ Gagal: ${e.message}` });
    } finally {
      setPrinting(false);
      setTimeout(() => setPrintMsg(null), 4000);
    }
  }

  function browserPrint() {
    const w = window.open("","_blank","width=400,height=700");
    const now = new Date();
    const rows58 = (label, val) => `<tr><td>${label}</td><td style="text-align:right"><b>${val}</b></td></tr>`;

    let body = "";

    if (activeTab === "sales") {
      body = `
        <tr><td colspan="2"><b>RINGKASAN PENJUALAN</b></td></tr>
        ${salesRows.map(r=>rows58(r.label, r.val)).join("")}
        <tr><td colspan="2"><hr/></td></tr>
        <tr><td colspan="2"><b>DETAIL TRANSAKSI</b></td></tr>
        ${completed.map(o=>`<tr><td>#${o.id} ${fmtTime(o.time)}<br/>${o.type==="dine"?`Meja ${o.table}`:"Bawa Pulang"}</td><td style="text-align:right">${formatIDR(o.total)}</td></tr>`).join("")}
      `;
    } else if (activeTab === "menu") {
      body = `
        <tr><td colspan="2"><b>PENJUALAN PER MENU</b></td></tr>
        ${menuRows.map(([n,d])=>`<tr><td>${d.e} ${n}</td><td style="text-align:right">${d.qty}x<br/>${formatIDR(d.rev)}</td></tr>`).join("")}
      `;
    } else if (activeTab === "payment") {
      body = `
        <tr><td colspan="2"><b>METODE PEMBAYARAN</b></td></tr>
        ${payRows.map(([pay,total])=>`<tr><td>${payIcons[pay]||"💰"} ${pay}<br/>${payCount[pay]} transaksi</td><td style="text-align:right">${formatIDR(total)}</td></tr>`).join("")}
        <tr><td><b>TOTAL</b></td><td style="text-align:right"><b>${formatIDR(revenue)}</b></td></tr>
      `;
    } else if (activeTab === "visit") {
      body = `
        <tr><td colspan="2"><b>TIPE KUNJUNGAN</b></td></tr>
        <tr><td>🪑 Makan di Sini</td><td style="text-align:right">${dine} (${totalVisit?Math.round(dine/totalVisit*100):0}%)</td></tr>
        <tr><td>🛍️ Bawa Pulang</td><td style="text-align:right">${takeaway} (${totalVisit?Math.round(takeaway/totalVisit*100):0}%)</td></tr>
        <tr><td><b>TOTAL</b></td><td style="text-align:right"><b>${totalVisit}</b></td></tr>
        <tr><td colspan="2"><hr/><b>JAM TERSIBUK</b></td></tr>
        ${hourRows.map(([h,c])=>`<tr><td>${String(h).padStart(2,"0")}:00–${String(+h+1).padStart(2,"0")}:00</td><td style="text-align:right">${c} kunjungan</td></tr>`).join("")}
      `;
    }

    w.document.write(`
      <html><head><title>KaryaOS - Laporan</title>
      <style>
        @page { size: 58mm auto; margin: 2mm; }
        body { font-family: monospace; font-size: 11px; width: 54mm; margin:0; padding:4px; }
        h2,h3 { text-align:center; margin:4px 0; }
        hr { border-top:1px dashed #000; margin:4px 0; }
        table { width:100%; border-collapse:collapse; }
        td { padding:2px 1px; vertical-align:top; font-size:11px; }
        .center { text-align:center; }
        .foot { text-align:center; margin-top:8px; font-size:10px; }
      </style></head>
      <body>
        <h2>KaryaOS</h2>
        <p class="center">Self Order Kiosk<br/>Jl. Contoh No.1, Jakarta</p>
        <hr/>
        <p class="center"><b>LAPORAN ${activeTab.toUpperCase()}</b><br/>
        ${fmtDate(now)} ${fmtTime(now)}<br/>
        Periode: ${dateRangeLabel}</p>
        <hr/>
        <table>${body}</table>
        <hr/>
        <p class="foot">Terima kasih!<br/>www.karys.tech</p>
      </body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  }

  const TABS = [
    { id:"sales",   icon:"💰", label:"Penjualan" },
    { id:"menu",    icon:"🍔", label:"Menu" },
    { id:"payment", icon:"💳", label:"Pembayaran" },
    { id:"visit",   icon:"👥", label:"Kunjungan" },
  ];

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#080c10", fontFamily:"'Inter',sans-serif", flexDirection:"column", gap:12 }}>
      <div style={{ fontSize:40 }}>📊</div>
      <div style={{ color:"#FF6B35", fontFamily:"'Inter',sans-serif", fontSize:24, letterSpacing:3 }}>MEMUAT LAPORAN...</div>
    </div>
  );

  return (
    <div style={R.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#FF6B35;border-radius:2px}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes notif{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        input:focus{outline:none}
      `}</style>

      {/* PRINT MSG TOAST */}
      {printMsg && (
        <div style={{ ...R.toast, background: printMsg.ok ? "#1a2a1a" : "#2a1a1a", borderColor: printMsg.ok ? "#00C896" : "#FF3B30", color: printMsg.ok ? "#00C896" : "#FF3B30" }}>
          {printMsg.text}
        </div>
      )}

      {/* HEADER */}
      <div style={R.header}>
        <div style={R.headerLeft}>
          <div>
            <div style={R.headerTitle}>📊 LAPORAN</div>
            <div style={R.headerSub}>KaryaOS Self Order Kiosk</div>
          </div>
        </div>
        <div style={R.headerRight}>
          {/* Date filter */}
          <div style={R.dateFilter}>
            {["today","week","month"].map(d => (
              <button key={d} style={{ ...R.dateBtn, ...(dateFilter===d ? R.dateBtnActive : {}) }} onClick={() => setDateFilter(d)}>
                {d==="today"?"Hari Ini":d==="week"?"7 Hari":"30 Hari"}
              </button>
            ))}
          </div>

          {/* Printer config */}
          <button style={R.printerBtn} onClick={() => setShowPrinter(v=>!v)}>
            🖨️ {printer.ip}
          </button>

          {/* Print button */}
          <button style={{ ...R.printBtn, opacity: printing ? 0.6 : 1 }} onClick={handlePrint} disabled={printing}>
            {printing ? "⏳ Mencetak..." : "🖨️ CETAK STRUK"}
          </button>
        </div>
      </div>

      {/* PRINTER CONFIG PANEL */}
      {showPrinter && (
        <div style={R.printerPanel}>
          <div style={R.printerPanelTitle}>⚙️ Konfigurasi Printer Epson TM-T82</div>
          <div style={R.printerRow}>
            <div style={R.printerField}>
              <label style={R.printerLabel}>IP Address Printer</label>
              <input style={R.printerInput} value={printer.ip}
                onChange={e => setPrinter(p => ({ ...p, ip: e.target.value }))}
                placeholder="192.168.1.100" />
            </div>
            <div style={R.printerField}>
              <label style={R.printerLabel}>Port</label>
              <input style={R.printerInput} value={printer.port}
                onChange={e => setPrinter(p => ({ ...p, port: parseInt(e.target.value)||9100 }))}
                placeholder="9100" />
            </div>
            <button style={R.printerTestBtn} onClick={async () => {
              try {
                const res = await fetch(`${API_HOST}/api/print/test`, {
                  method:"POST", headers:{"Content-Type":"application/json"},
                  body: JSON.stringify({ ip: printer.ip, port: printer.port })
                });
                setPrintMsg(res.ok ? {ok:true,text:"✅ Printer terhubung!"} : {ok:false,text:"❌ Printer tidak merespons"});
              } catch { setPrintMsg({ok:false,text:"❌ Backend offline"}); }
              setShowPrinter(false);
            }}>Test Koneksi</button>
          </div>
          <div style={{ fontSize:11, color:"#555", marginTop:8 }}>
            💡 Pastikan printer dan komputer dalam satu jaringan LAN. Port default Epson TM-T82: <b style={{color:"#FF6B35"}}>9100</b>
          </div>
        </div>
      )}

      {/* TABS */}
      <div style={R.tabBar}>
        {TABS.map(t => (
          <button key={t.id} style={{ ...R.tab, ...(activeTab===t.id ? R.tabActive : {}) }} onClick={() => setActiveTab(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div style={R.content} ref={printRef}>

        {/* ── SALES ── */}
        {activeTab === "sales" && (
          <div style={{ animation:"fadeUp 0.25s ease" }}>
            <div style={R.grid2}>
              {salesRows.map((r,i) => (
                <div key={i} style={R.statCard}>
                  <div style={R.statLabel}>{r.label}</div>
                  <div style={{ ...R.statVal, color: r.color }}>{r.val}</div>
                </div>
              ))}
            </div>

            <div style={R.tableCard}>
              <div style={R.tableTitle}>📋 Detail Transaksi</div>
              <div style={R.tableHead}>
                <span style={{width:60}}>No</span>
                <span style={{width:70}}>Waktu</span>
                <span style={{flex:1}}>Item</span>
                <span style={{width:80}}>Tipe</span>
                <span style={{width:80}}>Bayar</span>
                <span style={{width:100,textAlign:"right"}}>Total</span>
                <span style={{width:80,textAlign:"center"}}>Status</span>
              </div>
              {orders.sort((a,b)=>b.time-a.time).map(o => (
                <div key={o.id} style={R.tableRow}>
                  <span style={{width:60,color:"#FF6B35",fontWeight:700}}>#{o.id}</span>
                  <span style={{width:70,color:"#888",fontSize:12}}>{fmtTime(o.time)}</span>
                  <span style={{flex:1,fontSize:12,color:"#ccc"}}>{o.items.map(i=>`${i.e}${i.n} ×${i.q}`).join(", ")}</span>
                  <span style={{width:80,fontSize:12}}>{o.type==="dine"?`🪑 ${o.table}`:"🛍️ Bawa"}</span>
                  <span style={{width:80,fontSize:12,color:"#888"}}>{o.pay}</span>
                  <span style={{width:100,textAlign:"right",fontWeight:700}}>{formatIDR(o.total)}</span>
                  <span style={{width:80,textAlign:"center"}}>
                    <span style={{
                      fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20,
                      background: o.status==="completed"?"rgba(0,200,150,0.12)":o.status==="cancelled"?"rgba(255,59,48,0.12)":"rgba(255,184,0,0.12)",
                      color:      o.status==="completed"?"#00C896":o.status==="cancelled"?"#FF3B30":"#FFB800",
                    }}>{o.status==="completed"?"Selesai":o.status==="cancelled"?"Batal":"Proses"}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── MENU ── */}
        {activeTab === "menu" && (
          <div style={{ animation:"fadeUp 0.25s ease" }}>
            <div style={R.tableCard}>
              <div style={R.tableTitle}>🍔 Penjualan per Menu</div>
              <div style={R.tableHead}>
                <span style={{width:40}}>#</span>
                <span style={{flex:1}}>Nama Menu</span>
                <span style={{width:80,textAlign:"center"}}>Terjual</span>
                <span style={{width:120,textAlign:"right"}}>Pendapatan</span>
                <span style={{width:160}}>Grafik</span>
              </div>
              {menuRows.map(([name, d], i) => {
                const maxQty = menuRows[0]?.[1]?.qty || 1;
                return (
                  <div key={name} style={R.tableRow}>
                    <span style={{width:40,color:"#555",fontWeight:700}}>#{i+1}</span>
                    <span style={{flex:1}}><span style={{marginRight:8}}>{d.e}</span>{name}</span>
                    <span style={{width:80,textAlign:"center",fontWeight:700,color:"#FF6B35"}}>{d.qty}x</span>
                    <span style={{width:120,textAlign:"right",fontWeight:700}}>{formatIDR(d.rev)}</span>
                    <span style={{width:160}}>
                      <div style={{height:8,background:"#1e1e1e",borderRadius:4,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${(d.qty/maxQty)*100}%`,background:"#FF6B35",borderRadius:4,transition:"width 0.5s"}}/>
                      </div>
                    </span>
                  </div>
                );
              })}
              <div style={{...R.tableRow,borderTop:"2px solid #333",marginTop:4}}>
                <span style={{width:40}}/>
                <span style={{flex:1,fontWeight:700,color:"#FF6B35"}}>TOTAL</span>
                <span style={{width:80,textAlign:"center",fontWeight:700,color:"#FF6B35"}}>{menuRows.reduce((s,[,d])=>s+d.qty,0)}x</span>
                <span style={{width:120,textAlign:"right",fontWeight:700,color:"#FF6B35"}}>{formatIDR(menuRows.reduce((s,[,d])=>s+d.rev,0))}</span>
                <span style={{width:160}}/>
              </div>
            </div>
          </div>
        )}

        {/* ── PAYMENT ── */}
        {activeTab === "payment" && (
          <div style={{ animation:"fadeUp 0.25s ease" }}>
            <div style={R.grid2}>
              {payRows.map(([pay, total]) => (
                <div key={pay} style={R.statCard}>
                  <div style={R.statLabel}>{payIcons[pay]||"💰"} {pay}</div>
                  <div style={{...R.statVal,color:"#FF6B35"}}>{formatIDR(total)}</div>
                  <div style={{fontSize:12,color:"#555",marginTop:4}}>{payCount[pay]} transaksi</div>
                  <div style={{height:4,background:"#1e1e1e",borderRadius:2,marginTop:8,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${(total/revenue)*100}%`,background:"#FF6B35",borderRadius:2}}/>
                  </div>
                  <div style={{fontSize:11,color:"#888",marginTop:4}}>{Math.round((total/revenue)*100)}% dari total</div>
                </div>
              ))}
            </div>

            <div style={R.tableCard}>
              <div style={R.tableTitle}>💳 Detail per Transaksi</div>
              <div style={R.tableHead}>
                <span style={{width:60}}>No</span>
                <span style={{width:70}}>Waktu</span>
                <span style={{flex:1}}>Metode</span>
                <span style={{width:100,textAlign:"right"}}>Jumlah</span>
              </div>
              {completed.map(o => (
                <div key={o.id} style={R.tableRow}>
                  <span style={{width:60,color:"#FF6B35",fontWeight:700}}>#{o.id}</span>
                  <span style={{width:70,color:"#888",fontSize:12}}>{fmtTime(o.time)}</span>
                  <span style={{flex:1}}>{payIcons[o.pay]||"💰"} {o.pay}</span>
                  <span style={{width:100,textAlign:"right",fontWeight:700}}>{formatIDR(o.total)}</span>
                </div>
              ))}
              <div style={{...R.tableRow,borderTop:"2px solid #333",marginTop:4}}>
                <span style={{flex:1,fontWeight:700,color:"#FF6B35"}}>TOTAL</span>
                <span style={{width:100,textAlign:"right",fontWeight:700,color:"#FF6B35"}}>{formatIDR(revenue)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── VISIT ── */}
        {activeTab === "visit" && (
          <div style={{ animation:"fadeUp 0.25s ease" }}>
            <div style={R.grid2}>
              <div style={{...R.statCard,gridColumn:"span 1"}}>
                <div style={R.statLabel}>🪑 Makan di Sini</div>
                <div style={{...R.statVal,color:"#5AC8FA"}}>{dine}</div>
                <div style={{fontSize:13,color:"#888",marginTop:4}}>{totalVisit?Math.round(dine/totalVisit*100):0}% dari total</div>
                <div style={{height:8,background:"#1e1e1e",borderRadius:4,marginTop:10,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${totalVisit?Math.round(dine/totalVisit*100):0}%`,background:"#5AC8FA",borderRadius:4}}/>
                </div>
              </div>
              <div style={{...R.statCard,gridColumn:"span 1"}}>
                <div style={R.statLabel}>🛍️ Bawa Pulang</div>
                <div style={{...R.statVal,color:"#FF6B35"}}>{takeaway}</div>
                <div style={{fontSize:13,color:"#888",marginTop:4}}>{totalVisit?Math.round(takeaway/totalVisit*100):0}% dari total</div>
                <div style={{height:8,background:"#1e1e1e",borderRadius:4,marginTop:10,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${totalVisit?Math.round(takeaway/totalVisit*100):0}%`,background:"#FF6B35",borderRadius:4}}/>
                </div>
              </div>
              <div style={{...R.statCard,gridColumn:"span 2",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={R.statLabel}>👥 Total Kunjungan</div>
                  <div style={{...R.statVal,color:"#00C896"}}>{totalVisit}</div>
                </div>
                <div style={{fontFamily:"'Inter',sans-serif",fontSize:64,color:"#1e1e1e",letterSpacing:4}}>{totalVisit}</div>
              </div>
            </div>

            <div style={R.tableCard}>
              <div style={R.tableTitle}>⏰ Distribusi per Jam</div>
              <div style={{ display:"flex", alignItems:"flex-end", gap:8, height:120, padding:"0 8px 0" }}>
                {Array.from({length:13},(_,i)=>i+9).map(h => {
                  const count = byHour[h] || 0;
                  const max   = Math.max(...Object.values(byHour), 1);
                  return (
                    <div key={h} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                      <div style={{fontSize:10,color:"#FF6B35",fontWeight:700}}>{count||""}</div>
                      <div style={{width:"100%",height:`${(count/max)*90}px`,minHeight:count?4:0,background:count?"#FF6B35":"#1e1e1e",borderRadius:"3px 3px 0 0",transition:"height 0.4s"}}/>
                      <div style={{fontSize:10,color:"#555"}}>{h}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={R.tableCard}>
              <div style={R.tableTitle}>📋 Detail Kunjungan</div>
              <div style={R.tableHead}>
                <span style={{width:60}}>No</span>
                <span style={{width:70}}>Waktu</span>
                <span style={{width:100}}>Tipe</span>
                <span style={{flex:1}}>Item</span>
                <span style={{width:100,textAlign:"right"}}>Total</span>
              </div>
              {completed.sort((a,b)=>b.time-a.time).map(o=>(
                <div key={o.id} style={R.tableRow}>
                  <span style={{width:60,color:"#FF6B35",fontWeight:700}}>#{o.id}</span>
                  <span style={{width:70,color:"#888",fontSize:12}}>{fmtTime(o.time)}</span>
                  <span style={{width:100}}>{o.type==="dine"?`🪑 Meja ${o.table}`:"🛍️ Bawa Pulang"}</span>
                  <span style={{flex:1,fontSize:12,color:"#ccc"}}>{o.items.map(i=>`${i.e}${i.n}`).join(", ")}</span>
                  <span style={{width:100,textAlign:"right",fontWeight:700}}>{formatIDR(o.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const R = {
  root:   { fontFamily:"'Inter',sans-serif", background:"#080c10", color:"#fff", minHeight:"100%", display:"flex", flexDirection:"column", position:"fixed", top:0, left:0, right:0, bottom:0, overflowY:"auto", zIndex:9999 },
  toast:  { position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", border:"1px solid", borderRadius:12, padding:"12px 20px", fontSize:13, fontWeight:600, zIndex:999, animation:"notif 0.3s ease", whiteSpace:"nowrap" },
  header: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 24px", background:"#0d1117", borderBottom:"1px solid #161b22", flexWrap:"wrap", gap:12 },
  headerLeft:  { display:"flex", alignItems:"center", gap:16 },
  headerRight: { display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" },
  headerTitle: { fontFamily:"'Inter',sans-serif", fontSize:24, letterSpacing:3, color:"#FF6B35" },
  headerSub:   { fontSize:11, color:"#555" },
  backBtn:     { background:"transparent", border:"1px solid #333", borderRadius:10, padding:"8px 14px", color:"#888", cursor:"pointer", fontSize:12, letterSpacing:1 },
  dateFilter:  { display:"flex", background:"#0d1117", border:"1px solid #21262d", borderRadius:10, overflow:"hidden" },
  dateBtn:     { background:"transparent", border:"none", padding:"7px 14px", color:"#666", cursor:"pointer", fontSize:12, fontFamily:"'Inter',sans-serif" },
  dateBtnActive: { background:"#FF6B35", color:"#fff" },
  printerBtn:  { background:"#0d1117", border:"1px solid #21262d", borderRadius:10, padding:"7px 14px", color:"#888", cursor:"pointer", fontSize:12, display:"flex", alignItems:"center", gap:6 },
  printBtn:    { background:"linear-gradient(90deg,#FF6B35,#FF3B30)", border:"none", borderRadius:10, padding:"8px 20px", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700, letterSpacing:1, fontFamily:"'Inter',sans-serif" },
  printerPanel: { background:"#0d1117", border:"1px solid #21262d", borderBottom:"1px solid #21262d", padding:"16px 24px" },
  printerPanelTitle: { fontSize:13, fontWeight:700, color:"#888", letterSpacing:2, textTransform:"uppercase", marginBottom:12 },
  printerRow:   { display:"flex", alignItems:"flex-end", gap:12, flexWrap:"wrap" },
  printerField: { display:"flex", flexDirection:"column", gap:4 },
  printerLabel: { fontSize:11, color:"#555", letterSpacing:1 },
  printerInput: { background:"#080c10", border:"1px solid #21262d", borderRadius:8, padding:"8px 12px", color:"#fff", fontSize:13, width:180, fontFamily:"'Inter',sans-serif" },
  printerTestBtn: { background:"#1e1e1e", border:"1px solid #333", borderRadius:8, padding:"8px 16px", color:"#aaa", cursor:"pointer", fontSize:12, fontWeight:600 },
  tabBar: { display:"flex", gap:4, padding:"12px 24px", background:"#0d1117", borderBottom:"1px solid #161b22" },
  tab:    { background:"transparent", border:"1px solid #21262d", borderRadius:10, padding:"8px 20px", color:"#666", cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:"'Inter',sans-serif", transition:"all 0.15s" },
  tabActive: { background:"#FF6B35", border:"1px solid #FF6B35", color:"#fff" },
  content:   { flex:1, padding:"20px 24px", overflowY:"auto" },
  grid2:     { display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:20 },
  statCard:  { background:"#0d1117", border:"1px solid #161b22", borderRadius:14, padding:"18px 20px" },
  statLabel: { fontSize:11, color:"#666", letterSpacing:1, textTransform:"uppercase", marginBottom:8 },
  statVal:   { fontFamily:"'Inter',sans-serif", fontSize:28, letterSpacing:1 },
  tableCard: { background:"#0d1117", border:"1px solid #161b22", borderRadius:14, overflow:"hidden", marginBottom:16 },
  tableTitle: { padding:"14px 20px", fontSize:13, fontWeight:700, letterSpacing:2, color:"#888", textTransform:"uppercase", borderBottom:"1px solid #161b22" },
  tableHead:  { display:"flex", padding:"10px 20px", background:"#080c10", fontSize:11, color:"#555", letterSpacing:1, textTransform:"uppercase", gap:8 },
  tableRow:   { display:"flex", alignItems:"center", padding:"10px 20px", borderBottom:"1px solid #0d1117", fontSize:13, gap:8, transition:"background 0.15s" },
};
