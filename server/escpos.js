// server/escpos.js — Receipt builders (kitchen + customer) for 80mm thermal

const WIDTH = 48;
const ESC = 0x1B, GS = 0x1D, LF = 0x0A;

const fIDR = (a) => "Rp " + Math.round(a||0).toLocaleString("id-ID");

class Receipt {
  constructor() { this.bytes = []; this._cmd(ESC, 0x40); }
  _cmd(...b) { this.bytes.push(...b); return this; }
  text(str) {
    const clean = String(str)
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
      .replace(/[\u{2600}-\u{27BF}]/gu, "")
      .replace(/[—–]/g, "-").replace(/['']/g, "'").replace(/[""]/g, '"')
      .replace(/[^\x00-\x7F]/g, "");
    for (const ch of clean) this.bytes.push(ch.charCodeAt(0));
    return this;
  }
  line(s = "") { return this.text(s).feed(); }
  feed(n = 1) { for (let i=0;i<n;i++) this.bytes.push(LF); return this; }
  align(p) { const m={left:0,center:1,right:2}; return this._cmd(ESC,0x61,m[p]??0); }
  bold(on) { return this._cmd(ESC,0x45,on?1:0); }
  size(s) { const m={normal:0,dbl:0x11,dblH:0x01,dblW:0x10,quad:0x33}; return this._cmd(GS,0x21,m[s]??0); }
  hr(ch = "-") { return this.line(ch.repeat(WIDTH)); }
  row(left, right) {
    const l=String(left), r=String(right);
    const pad=Math.max(1, WIDTH - l.length - r.length);
    return this.text(l + " ".repeat(pad) + r).feed();
  }
  itemRow(name, qty, price) {
    const q=String(qty), p=String(price);
    const maxName = WIDTH - q.length - p.length - 4;
    const n = name.length > maxName ? name.slice(0, maxName-1) : name;
    const pad = Math.max(1, WIDTH - n.length - q.length - p.length - 2);
    return this.text(`${n}  ${q}${" ".repeat(pad)}${p}`).feed();
  }
  qr(data, size = 7, ec = 1) {
    const ecBytes = [0x30, 0x31, 0x32, 0x33];
    this._cmd(GS,0x28,0x6B,0x04,0x00,0x31,0x41,0x32,0x00);
    this._cmd(GS,0x28,0x6B,0x03,0x00,0x31,0x43,size);
    this._cmd(GS,0x28,0x6B,0x03,0x00,0x31,0x45,ecBytes[ec]);
    const d=[]; for (const ch of data) d.push(ch.charCodeAt(0));
    const len=d.length+3;
    this._cmd(GS,0x28,0x6B,len&0xFF,(len>>8)&0xFF,0x31,0x50,0x30,...d);
    this._cmd(GS,0x28,0x6B,0x03,0x00,0x31,0x51,0x30);
    return this;
  }
  cut() { return this.feed(3)._cmd(GS, 0x56, 0); }
  done() { return Buffer.from(this.bytes); }
}

// ─── KITCHEN TICKET ────────────────────────────────────────────────────
function buildKitchenTicket(order) {
  const r = new Receipt();

  r.align("center").bold(true).size("dbl").line("KITCHEN ORDER").feed()
   .size("quad").line(`#${order.id}`)
   .size("normal").bold(false).hr("=");

  r.align("left").size("dblH").bold(true);
  r.line(`TIPE  : ${order.type === "dine"
    ? `DINE IN - MEJA ${order.table || "-"}`
    : "BAWA PULANG"}`);
  r.line(`WAKTU : ${new Date(order.time).toLocaleString("id-ID", {
    day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit"})}`);
  if (order.customerName) r.line(`CUST  : ${order.customerName}`);
  r.size("normal").bold(false).hr("=").feed();

  for (const item of (order.items || [])) {
    r.size("dblH").bold(true).line(`${item.q}x  ${item.n}`);
    if (item.addons?.toppings?.length > 0) {
      r.size("normal").bold(false);
      r.line(`     + ${item.addons.toppings.map(t => t.name).join(", ")}`);
    }
    r.size("normal").bold(false).feed();
  }

  r.hr("=");
  const total = (order.items || []).reduce((s, it) => s + (it.q || 0), 0);
  r.align("center").bold(true).size("dblH").line(`TOTAL: ${total} ITEM${total>1?"S":""}`)
   .size("normal").bold(false).hr("=").feed();

  r.cut();
  return r.done();
}

// ─── CUSTOMER RECEIPT ──────────────────────────────────────────────────
function buildCustomerReceipt(order) {
  const r = new Receipt();

  r.align("center").bold(true).size("dbl").line("KaryaOS")
   .size("normal").line("Self Order Kiosk").bold(false)
   .line("Jakarta, Indonesia").feed();
  r.align("left").hr("=");

  const receiptNo = `RCP-${order.id}-${(order.midtransId || Math.random().toString(36).slice(2,10)).slice(-8).toUpperCase()}`;
  const timestamp = new Date(order.time).toLocaleString("id-ID", {
    day:"numeric", month:"numeric", year:"numeric",
    hour:"2-digit", minute:"2-digit"
  });
  r.row("No. Struk", receiptNo);
  r.row("No. Order", "#" + order.id);
  r.row("Waktu", timestamp);
  r.row("Kasir", "Kiosk Self Order");
  r.row("Tipe", order.type === "dine"
    ? `Dine In - Meja ${order.table || "-"}`
    : "Bawa Pulang");
  if (order.customerName) r.row("Customer", order.customerName);
  r.hr("=");

  r.bold(true).line("ITEM                          QTY         HARGA").bold(false).hr("-");
  for (const item of (order.items || [])) {
    r.itemRow(item.n, `${item.q}x`, fIDR(item.p * item.q));
    if (item.addons?.toppings?.length > 0) {
      const explicitTotal = item.addons.toppings.reduce((s,t) => s + (t.price||0), 0);
      for (const t of item.addons.toppings) {
        const linePrice = (t.price || 0) * (item.q || 1);
        r.row(`  + ${t.name}`, linePrice > 0 ? fIDR(linePrice) : "gratis");
      }
      const extraCharge = Math.max(0, (item.addonTotal || 0) - explicitTotal);
      if (extraCharge > 0) {
        r.row("  + Topping ekstra", fIDR(extraCharge * (item.q || 1)));
      }
    }
  }
  r.hr("=");

  const subtotal = order.subtotal ?? (order.items || []).reduce((s,i) => s + (i.p * i.q) + (i.addonTotal||0), 0);
  const tax = order.tax ?? Math.round(subtotal * 0.11 / 1.11);
  const total = order.total ?? subtotal;

  r.row("Subtotal", fIDR(subtotal));
  if (order.promoCode) {
    r.row(`Promo ${order.promoCode}`, "-" + fIDR(order.promoDiscount || 0));
    // BOGO free items breakdown
    if (Array.isArray(order.promoFreeItems) && order.promoFreeItems.length > 0) {
      order.promoFreeItems.forEach(fi => {
        r.row(`  + GRATIS ${fi.qty}x ${fi.name}`, "");
      });
    }
  }
  r.row("PPN 11% (incl.)", fIDR(tax));
    // Points discount line (if any)
  if (order.pointsRedeemed > 0) {
    r.row(`Tukar ${order.pointsRedeemed} poin`, `-${fIDR(order.pointsDiscount)}`);
  }
  r.size("dblH").bold(true).row("TOTAL", fIDR(total)).size("normal").bold(false);
  // Points earned footer
  if (order.pointsEarned > 0) {
    r.newline().align("center").bold(true).text(`+${order.pointsEarned} POIN DIDAPAT`).newline().bold(false).align("left");
  }
  r.hr("=");

  const payLabel = order.pay === "CASH" ? "TUNAI" : (order.pay || "QRIS");
  r.row("Pembayaran", payLabel);
  r.row("Status", "LUNAS").feed();

  r.align("center")
   .line("Terima kasih atas kunjungan Anda!")
   .line("Simpan struk ini sebagai bukti pembayaran").feed()
   .line("Scan untuk cek status pesanan:").feed();

  const base = process.env.TRACKING_BASE_URL || "http://localhost:5173";
  r.qr(`${base}/?trackorder=${order.id}`, 7, 1).feed();
  r.line(`Order #${order.id}`).feed(2);

  r.cut();
  return r.done();
}

// ─── CINEMA TICKET ─────────────────────────────────────────────────────
// Print 1 struk per tiket (Epson TM-T82 / 80mm). QR di tengah biar mudah scan.
// payload = { purchase_id, film, show, ticket:{code,seat,price}, bundles?, total, paid_at }
function buildCinemaTicket(payload) {
  const r = new Receipt();
  const film = payload.film || {};
  const show = payload.show || {};
  const ticket = payload.ticket || {};

  r.align("center").bold(true).size("dbl").line("KaryaOS Cinema")
   .size("normal").bold(false).line("E-Ticket").feed();
  r.hr("=");

  r.align("center").bold(true).size("dblH").line(String(film.title || "-").slice(0, 28))
   .size("normal").bold(false).feed();

  r.align("left");
  r.row("Jadwal", `${show.show_date || "-"} ${show.start_time || ""}`);
  r.row("Studio", `${show.studio_name || "-"}${show.studio_type ? " · " + show.studio_type : ""}`);
  r.row("Rating", String(film.rating || "-"));
  r.row("Durasi", `${film.duration_min || 0} mnt`);
  r.hr("-");

  r.align("center").bold(true).size("dbl").line(`KURSI ${ticket.seat || "-"}`)
   .size("normal").bold(false).feed();

  if (ticket.code) {
    r.align("center").qr(String(ticket.code), 8, 1).feed();
    r.align("center").size("normal").bold(true).line(String(ticket.code)).bold(false).feed();
  }

  r.align("left").hr("-");
  r.row("Harga tiket", fIDR(ticket.price || 0));
  if (Array.isArray(payload.bundles) && payload.bundles.length > 0) {
    r.line("F&B Combo:");
    for (const b of payload.bundles) {
      r.row(`  ${b.qty || 1}x ${b.bundle_name || b.name || "-"}`, fIDR((b.qty || 1) * (b.price || 0)));
    }
  }
  if (payload.total != null) {
    r.size("dblH").bold(true).row("TOTAL", fIDR(payload.total)).size("normal").bold(false);
  }
  r.hr("=");

  r.align("center")
   .line("Tunjukkan QR di pintu studio")
   .line("E-ticket berlaku 1x masuk").feed();

  if (payload.purchase_id) {
    r.line(`Purchase #${payload.purchase_id}`);
  }
  r.line(new Date().toLocaleString("id-ID", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }))
   .feed(2);

  r.cut();
  return r.done();
}

module.exports = { buildKitchenTicket, buildCustomerReceipt, buildCinemaTicket, Receipt };
