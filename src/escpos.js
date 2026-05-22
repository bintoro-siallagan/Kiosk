// ESC/POS receipt builder for 80mm thermal printer (48 chars/line)
// Outputs an array of byte numbers — POST as JSON to /api/print

const WIDTH = 48;
const ESC = 0x1B, GS = 0x1D, LF = 0x0A;

const fIDR = (a) => "Rp " + Math.round(a||0).toLocaleString("id-ID");

class Receipt {
  constructor() { this.bytes = []; this._cmd(ESC, 0x40); }  // INIT
  _cmd(...b)   { this.bytes.push(...b); return this; }
  
  // Text writer — strips emojis/non-ASCII (thermal printers can't render them)
  text(str) {
    const clean = String(str)
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
      .replace(/[\u{2600}-\u{27BF}]/gu, "")
      .replace(/[—–]/g, "-")
      .replace(/['']/g, "'").replace(/[""]/g, '"')
      .replace(/[^\x00-\x7F]/g, "");
    for (const ch of clean) this.bytes.push(ch.charCodeAt(0));
    return this;
  }
  line(str = "")  { return this.text(str).feed(); }
  feed(n = 1)     { for (let i=0;i<n;i++) this.bytes.push(LF); return this; }
  align(pos)      { const m={left:0,center:1,right:2}; return this._cmd(ESC,0x61,m[pos]??0); }
  bold(on)        { return this._cmd(ESC,0x45,on?1:0); }
  size(s)         { const m={normal:0,dbl:0x11,dblH:0x01,dblW:0x10}; return this._cmd(GS,0x21,m[s]??0); }
  hr(ch="-")      { return this.line(ch.repeat(WIDTH)); }
  
  // Two-col: left-aligned key + right-aligned value, padded to full width
  row(left, right) {
    const l = String(left), r = String(right);
    const pad = Math.max(1, WIDTH - l.length - r.length);
    return this.text(l + " ".repeat(pad) + r).feed();
  }
  
  // Item row: name + qty + price
  itemRow(name, qty, price) {
    const q = String(qty), p = String(price);
    const maxName = WIDTH - q.length - p.length - 4;
    const n = name.length > maxName ? name.slice(0, maxName-1) : name;
    const pad = Math.max(1, WIDTH - n.length - q.length - p.length - 2);
    return this.text(`${n}  ${q}${" ".repeat(pad)}${p}`).feed();
  }
  
  // Native ESC/POS QR code
  qr(data, size = 7, ec = 1) {
    const ecBytes = [0x30, 0x31, 0x32, 0x33];  // L, M, Q, H
    // Model 2
    this._cmd(GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    // Module size (1-16, 7 = good for 80mm)
    this._cmd(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, size);
    // Error correction
    this._cmd(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, ecBytes[ec]);
    // Store data
    const d = [];
    for (const ch of data) d.push(ch.charCodeAt(0));
    const len = d.length + 3;
    this._cmd(GS, 0x28, 0x6B, len & 0xFF, (len >> 8) & 0xFF, 0x31, 0x50, 0x30, ...d);
    // Print
    this._cmd(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
    return this;
  }
  
  cut() { return this.feed(3)._cmd(GS, 0x56, 0); }
  done() { return this.bytes; }
}

export function buildReceipt(receipt) {
  const r = new Receipt();
  
  // Header
  r.align("center").bold(true).size("dbl").line("KaryaOS")
   .size("normal").line("Self Order Kiosk").bold(false)
   .line("Jakarta, Indonesia").feed();
  r.align("left").hr("=");
  
  // Info
  r.row("No. Struk",  receipt.receiptNo || "-");
  r.row("No. Order",  "#" + receipt.orderId);
  r.row("Waktu",      receipt.timestamp || "-");
  r.row("Kasir",      receipt.kasir || "-");
  r.row("Tipe",       receipt.type === "dine"
    ? `Dine In - Meja ${receipt.table || "-"}`
    : "Bawa Pulang");
  if (receipt.customer?.name) r.row("Customer", receipt.customer.name);
  r.hr("=");
  
  // Items
  r.bold(true).line("ITEM                          QTY         HARGA").bold(false);
  r.hr("-");
  for (const item of (receipt.items || [])) {
    r.itemRow(item.n, `${item.q}x`, fIDR(item.p * item.q));
    if (item.addons?.toppings?.length > 0) {
      const names = item.addons.toppings.map(t => t.name).join(", ");
      const txt = "  + " + names;
      r.line(txt.length > WIDTH ? txt.slice(0, WIDTH-3) + "..." : txt);
    }
  }
  r.hr("=");
  
  // Totals
  r.row("Subtotal", fIDR(receipt.subtotal));
  if (receipt.promoCode) {
    r.row(`Promo ${receipt.promoCode}`, "-" + fIDR(receipt.promoDiscount));
  }
  r.row("PPN 11%", fIDR(receipt.tax));
  r.size("dblH").bold(true).row("TOTAL", fIDR(receipt.total)).size("normal").bold(false);
  r.hr("=");
  
  // Payment
  r.row("Pembayaran", receipt.payment || "-");
  r.row("Status", "LUNAS").feed();
  
  // QR + footer
  r.align("center")
   .line("Terima kasih atas kunjungan Anda!")
   .line("Simpan struk ini sebagai bukti pembayaran").feed()
   .line("Scan untuk cek status pesanan:").feed();
  
  const base = import.meta.env.VITE_TRACKING_BASE_URL || window.location.origin;
  r.qr(`${base}/?trackorder=${receipt.orderId}`, 7, 1).feed();
  r.line(`Order #${receipt.orderId}`).feed(2);
  
  r.cut();
  return r.done();
}

// Printer config — defaults + localStorage override
export function getPrinterConfig() {
  try {
    const s = JSON.parse(localStorage.getItem("printerConfig") || "{}");
    return { ip: s.ip || "192.168.1.100", port: s.port || 9100 };
  } catch {
    return { ip: "192.168.1.100", port: 9100 };
  }
}
