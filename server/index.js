const express = require("express");

const os = require('os');
function getLanIP() {
  const ifaces = os.networkInterfaces();
  for (const name in ifaces) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}
const cors = require("cors");
const http = require("http");
const { WebSocketServer } = require("ws");

const app = express();

// ═══════════════════════════════════════════════════════════════
// ⚠️  ROUTING ORDER RULE — READ BEFORE ADDING NEW ROUTES
// ═══════════════════════════════════════════════════════════════
// Express matches routes in declaration order. ALWAYS declare
// specific paths BEFORE wildcards on the same method:
//
//   ✅ GOOD:  app.get("/api/X/special")
//             app.get("/api/X/:id")
//
//   ❌ BAD:   app.get("/api/X/:id")
//             app.get("/api/X/special")   // never reached!
//
// Active :id wildcards in this file (place specifics ABOVE these):
//   - GET    /api/orders/:id           (line ~148)
//   - GET    /api/promo/:id            (line ~571)
//   - PATCH  /api/menu/:id             (line ~353)
//   - PATCH  /api/customers/:id        (line ~682)
//   - PATCH  /api/tables/:id           (line ~1379)
//   - PATCH  /api/auth/users/:id       (line ~1342)
//   - GET    /api/payment/status/:orderId   (line ~1143)
//   - GET    /api/payment/check/:internalOrderId  (line ~1047)
//   - GET    /api/receipt/:orderId     (line ~1513)
//   - PATCH  /api/staff-call/:id/resolve  (line ~1556)
//
// Past conflicts fixed:
//   - 2026-05: GET /api/promo/stats was swallowed by /api/promo/:id;
//     moved /stats above /:id. (Symptom: Promo Manager list empty.)
// ═══════════════════════════════════════════════════════════════
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use("/audio", express.static(require("path").join(__dirname, "audio")));
app.use("/screensaver", express.static(require("path").join(__dirname, "screensaver")));


// ─── ADMIN: Email/SMTP config ────────────────────────────────────────
app.get("/api/admin/email-config", (_, res) => res.json(emailModule.getMaskedConfig()));
app.patch("/api/admin/email-config", (req, res) => {
  try {
    const cur = emailModule.getConfig();
    const patch = req.body || {};
    // Don't overwrite password if request contains bullets (masked)
    if (patch.smtpPass && patch.smtpPass.includes("•")) delete patch.smtpPass;
    const saved = emailModule.saveConfig({ ...cur, ...patch });
    console.log(`📧 Email config updated (enabled=${saved.enabled}, host=${saved.smtpHost})`);
    res.json({ ok: true, config: emailModule.getMaskedConfig() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/admin/email-test", async (req, res) => {
  try {
    await emailModule.testConnection();
    // Also send a test email if recipient provided
    if (req.body?.testTo) {
      await emailModule.sendEmail({
        to: req.body.testTo,
        subject: "BINTORO — Test Email",
        html: `<h2>📧 Test Email Berhasil</h2><p>Konfigurasi SMTP BINTORO Kiosk OK. Dikirim pada ${new Date().toLocaleString("id-ID")}.</p>`,
      });
    }
    res.json({ ok: true, message: "SMTP OK" + (req.body?.testTo ? " · test email terkirim" : "") });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Z-Report email (frontend POSTs xlsx as base64) ──────────────────
app.post("/api/reports/z/email", async (req, res) => {
  try {
    const { recipients, subject, attachmentBase64, attachmentFilename, periodLabel } = req.body || {};
    if (!recipients || (Array.isArray(recipients) && !recipients.length)) {
      return res.status(400).json({ error: "Recipients required" });
    }
    const attachments = attachmentBase64 ? [{
      filename: attachmentFilename || `Z-Report-${new Date().toISOString().slice(0,10)}.xlsx`,
      content:  Buffer.from(attachmentBase64.replace(/^data:[^;]+;base64,/, ""), "base64"),
    }] : [];
    const result = await emailModule.sendEmail({
      to: recipients,
      subject: subject || `Z-Report BINTORO — ${periodLabel || new Date().toLocaleDateString("id-ID")}`,
      html: `<div style="font-family:Arial,sans-serif">
        <h2 style="color:#F59E0B">📊 BINTORO Z-Report</h2>
        <p>Halo,<br/>Terlampir laporan Z-Report dari kiosk BINTORO untuk periode <strong>${periodLabel || "—"}</strong>.</p>
        <p>File Excel berisi: Ringkasan, Breakdown Pembayaran, Jenis Order, Top Items, Promo, dan Rekonsiliasi Kas.</p>
        <hr/><p style="font-size:11px;color:#888">Email otomatis dari BINTORO Kiosk · ${new Date().toLocaleString("id-ID")}</p>
      </div>`,
      attachments,
    });
    res.json(result);
  } catch (e) {
    console.error("Email Z-Report fail:", e);
    res.status(500).json({ error: e.message });
  }
});

app.use(express.json({ limit: "5mb", verify: (req, _res, buf) => { req.rawBody = buf; } }));

const db = require('./db');
const wa = require('./whatsapp');
const loyalty = require('./loyalty');
const midtrans = require("./midtrans");
const audioConfig = require("./audio");
const screensaver = require("./screensaver");
const emailModule = require("./email");
// Customers helpers from db: loadAllCustomers, insertCustomer, deleteCustomer
const { buildKitchenTicket, buildCustomerReceipt } = require('./escpos');
const fs = require('fs');
const path = require('path');

// ─── IN-MEMORY DATABASE ────────────────────────────────────────────────────
let orders = db.loadAllOrders();

let menu = [
  // FROZEN YOGURT
  { id: 101, cat: 'froyo', emoji: '🖤', name: 'Black Sakura Regular',        desc: 'Charcoal froyo + 2 topping pilihan',           price: 54000,  freeToppings: 2, popular: true, avail: true },
  { id: 102, cat: 'froyo', emoji: '🖤', name: 'Black Sakura Large',          desc: 'Charcoal froyo + 3 topping pilihan',           price: 69000,  freeToppings: 3, avail: true },
  { id: 103, cat: 'froyo', emoji: '🤍', name: 'White Skim Regular',          desc: 'Susu skim froyo + 2 topping pilihan',          price: 47000,  freeToppings: 2, popular: true, avail: true },
  { id: 104, cat: 'froyo', emoji: '🤍', name: 'White Skim Large',            desc: 'Susu skim froyo + 3 topping pilihan',          price: 64000,  freeToppings: 3, avail: true },
  { id: 105, cat: 'froyo', emoji: '🤍', name: 'Lykone White Skim',           desc: 'White skim cone + 2 topping',                  price: 49000,  freeToppings: 2, avail: true },
  // SMOOTHIES
  { id: 201, cat: 'smoothies', emoji: '🍓', name: 'Yogurt Strawberry Smoothie', desc: 'Strawberry, aloe vera, chia seed',          price: 50000,  freeToppings: 0, popular: true, avail: true },
  { id: 202, cat: 'smoothies', emoji: '🍑', name: 'Yogurt Peach Smoothie',      desc: 'White skim + peach segar',                   price: 50000,  freeToppings: 0, avail: true },
  { id: 203, cat: 'smoothies', emoji: '🥭', name: 'Collagen Mango',             desc: 'Yogurt kolagen + mangga segar',              price: 50000,  freeToppings: 0, avail: true },
  { id: 204, cat: 'smoothies', emoji: '🥥', name: 'Sally x Hydrococo',          desc: 'Coconut water + yogurt + saus pisang',       price: 37000,  freeToppings: 0, avail: true },
  // YOGULATO
  { id: 301, cat: 'yogulato', emoji: '🍓', name: 'Ichi-Go-Mochi Strawberry',  desc: 'Yogurt gelato 100ml',                          price: 49000,  freeToppings: 0, avail: true },
  { id: 302, cat: 'yogulato', emoji: '🍪', name: 'Cookie Dough & Raisin',     desc: 'Yogurt gelato 100ml',                          price: 49000,  freeToppings: 0, avail: true },
  { id: 303, cat: 'yogulato', emoji: '🍵', name: "Bean Missin' U Matcha",     desc: 'Yogurt gelato 100ml',                          price: 49000,  freeToppings: 0, avail: true },
  { id: 304, cat: 'yogulato', emoji: '🍫', name: 'Ciao Cioccolato',           desc: 'Yogurt gelato 100ml',                          price: 49000,  freeToppings: 0, avail: true },
  { id: 305, cat: 'yogulato', emoji: '⚪', name: 'Plain Sally',               desc: 'Yogurt gelato 100ml — original',               price: 49000,  freeToppings: 0, avail: true },
  // TAKE HOME PACK
  { id: 401, cat: 'takehome', emoji: '🖤', name: 'Take Home Black Sakura 250g', desc: '3 topping crunchy/sauce/fruit',              price: 95000,  freeToppings: 3, avail: true },
  { id: 402, cat: 'takehome', emoji: '🤍', name: 'Take Home White Skim 250g',   desc: '3 topping crunchy/sauce/fruit',              price: 85000,  freeToppings: 3, avail: true },
  { id: 403, cat: 'takehome', emoji: '🖤', name: 'Take Home Black Sakura 500g', desc: '6 topping (2 crunchy + 2 sauce + 2 fruit)',  price: 165000, freeToppings: 6, avail: true },
  { id: 404, cat: 'takehome', emoji: '🤍', name: 'Take Home White Skim 500g',   desc: '6 topping (2 crunchy + 2 sauce + 2 fruit)',  price: 145000, freeToppings: 6, avail: true },
  // SPECIAL / COLLAB
  { id: 501, cat: 'collab', emoji: '🎮', name: 'Sour Sally x MLBB',          desc: 'Limited edition collab pack',                   price: 85000,  freeToppings: 2, avail: true },
];

// ─── Apply persisted menu avail overrides ───
const _menuOverrides = db.getMenuOverrides();
menu.forEach(item => {
  if (_menuOverrides.has(item.id)) item.avail = _menuOverrides.get(item.id);
});
if (_menuOverrides.size > 0) console.log(`📋 Applied ${_menuOverrides.size} menu avail overrides`);

const toppings = [
  // Fruits
  { id: 'f01', name: 'Strawberry',    group: 'Fruits',    price: 0 },
  { id: 'f02', name: 'Kiwi',          group: 'Fruits',    price: 0 },
  { id: 'f03', name: 'Peach',         group: 'Fruits',    price: 0 },
  { id: 'f04', name: 'Mangga',        group: 'Fruits',    price: 0 },
  { id: 'f05', name: 'Longan',        group: 'Fruits',    price: 0 },
  { id: 'f06', name: 'Nanas',         group: 'Fruits',    price: 0 },
  { id: 'f07', name: 'Aloe Vera',     group: 'Fruits',    price: 0 },
  // Crunchies
  { id: 'c01', name: 'Mochi Mix',     group: 'Crunchies', price: 0 },
  { id: 'c02', name: 'Oreo Crumble',  group: 'Crunchies', price: 0 },
  { id: 'c03', name: 'Granola',       group: 'Crunchies', price: 0 },
  { id: 'c04', name: 'Rainbow Cubes', group: 'Crunchies', price: 0 },
  { id: 'c05', name: 'Roasted Almond',group: 'Crunchies', price: 0 },
  { id: 'c06', name: 'Honey Granola', group: 'Crunchies', price: 0 },
  { id: 'c07', name: 'Chia Seed',     group: 'Crunchies', price: 0 },
  // Sauces
  { id: 's01', name: 'Blueberry Sauce', group: 'Sauces', price: 0 },
  { id: 's02', name: 'Mango Sauce',     group: 'Sauces', price: 0 },
  { id: 's03', name: 'Taro Latte',      group: 'Sauces', price: 0 },
  { id: 's04', name: 'Chocolate Sauce', group: 'Sauces', price: 0 },
  // Premium
  { id: 'p01', name: 'Cookie Dough',   group: 'Premium', price: 4000 },
  { id: 'p02', name: 'Choco Waferino', group: 'Premium', price: 4000 },
  { id: 'p03', name: 'Goji Berry',     group: 'Premium', price: 4000 },
  { id: 'p04', name: 'Caviar Jelly',   group: 'Premium', price: 4000 },
];

const categories = [
  { id: 'froyo',     name: 'Frozen Yogurt', emoji: '🍦', color: '#8B5CF6' },
  { id: 'smoothies', name: 'Smoothies',     emoji: '🥤', color: '#EC4899' },
  { id: 'yogulato',  name: 'Yogulato',      emoji: '🍨', color: '#06B6D4' },
  { id: 'takehome',  name: 'Take Home',     emoji: '📦', color: '#F59E0B' },
  { id: 'collab',    name: 'Special',       emoji: '✨', color: '#EF4444' },
];

const EXTRA_TOPPING_PRICE = 8000;

let orderCounter = orders.length
  ? Math.max(0, ...orders.map(o => {
      const m = /^A(\d+)$/.exec(o.id || "");
      return m ? parseInt(m[1]) : 0;
    }))
  : 0;
console.log(`📊 Order counter resumed at ${orderCounter} — next ID: A${String(orderCounter+1).padStart(2,"0")}`);

// ─── WEBSOCKET BROADCAST ───────────────────────────────────────────────────
function broadcast(event, data) {
  const msg = JSON.stringify({ event, data, ts: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
  // Audit engine — detect anomalies from WS events
  try { if (typeof auditEngine !== 'undefined') auditEngine.check(event, data, db, broadcast); } catch(e) {}
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  console.log("🔌 Client connected via WebSocket");
  // Send current state on connect
  ws.send(JSON.stringify({ event: "init", data: { orders, menu }, ts: Date.now() }));
  ws.on("pong",  () => { ws.isAlive = true; });
  ws.on("error", (e) => console.warn("⚠️  WS client error:", e.message));
  ws.on("close", () => console.log("🔌 Client disconnected"));
});

// Heartbeat: ping every 30s, terminate non-responsive clients
const wsHeartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30_000);
wss.on("close", () => clearInterval(wsHeartbeat));

// ─── ROUTES ────────────────────────────────────────────────────────────────

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), time: new Date().toISOString() });
});

// ── ORDERS ──────────────────────────────────────────────────────────────────

// GET all orders
app.get("/api/orders", (req, res) => {
  const { status } = req.query;
  const result = status ? orders.filter(o => o.status === status) : orders;
  res.json(result);
});

// GET single order
app.get("/api/orders/:id", (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json(order);
});


// ─── PRINTER HELPERS ────────────────────────────────────────────────────
const PRINTER_DEBUG = process.env.PRINTER_DEBUG !== "false"; // default ON

async function _print(kind, order, bytes, envIpKey, envPortKey, dirName, emoji) {
  try {
    const ip   = process.env[envIpKey];
    const port = parseInt(process.env[envPortKey] || "9100");

    if (PRINTER_DEBUG || !ip) {
      const dir = path.join(__dirname, dirName);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `order-${order.id}-${Date.now()}.bin`);
      fs.writeFileSync(file, bytes);
      console.log(`${emoji} [DEBUG] ${kind} saved: ${file} (${bytes.length} bytes)`);
      return;
    }

    await tcpPrint(ip, port, bytes);
    console.log(`${emoji} ${kind} printed: order #${order.id} → ${ip}:${port}`);
  } catch (e) {
    console.error(`${emoji} ${kind} print FAILED for #${order.id}:`, e.message);
  }
}

async function printKitchenTicket(order) {
  return _print("Kitchen ticket", order, buildKitchenTicket(order),
                "KITCHEN_PRINTER_IP", "KITCHEN_PRINTER_PORT",
                "kitchen-tickets", "🍳");
}

async function printCustomerReceipt(order) {
  return _print("Customer receipt", order, buildCustomerReceipt(order),
                "CUSTOMER_PRINTER_IP", "CUSTOMER_PRINTER_PORT",
                "customer-receipts", "🧾");
}

// POST create new order (from kiosk checkout)
app.post("/api/orders", (req, res) => {
  const _splitPayments = Array.isArray(req.body && req.body.payments) ? req.body.payments : null;
  const isSplit = _splitPayments && _splitPayments.length > 0;
  if (isSplit) {
    const sumPay = _splitPayments.reduce((s, p) => s + (parseInt(p.amount) || 0), 0);
    const reqTotal = parseInt(req.body.total) || 0;
    if (sumPay < reqTotal) {
      return res.status(400).json({ error: `Split payments sum (${sumPay}) below total (${reqTotal})` });
    }
    const methods = [...new Set(_splitPayments.map(p => p.method))];
    req.body.pay = methods.length === 1 ? methods[0] : "SPLIT";
    req.body.status = "completed";
    req.body.payments = _splitPayments;
  }

  const { type, table, items, pay, addons, customerId, customerName, customerPhone, cashReceived, cashChange, status: reqStatus, kasir, source } = req.body;
  if (!type || !items || !items.length) {
    return res.status(400).json({ error: "type and items are required" });
  }

  // Inclusive pricing: menu prices are gross (already include 11% PPN)
  const subtotal = items.reduce((s, i) => s + (i.p * i.q) + (i.addonTotal || 0), 0);
  const promoDisc = req.body.promoDiscount || 0;

  // Loyalty redeem: strict trust frontend (customer's explicit choice), backend caps defensively
  // NOTE: actual customer.points mutation + DB writes happen inside transaction below (rollback-safe)
  let pointsRedeemed = 0, pointsDiscount = 0;
  let _redeemCust = null;
  if (customerId && loyalty.getConfig().enabled) {
    _redeemCust = customers.find(c => c.id === customerId);
    const frontPts = parseInt(req.body.pointsRedeemed) || 0;
    if (_redeemCust && frontPts > 0) {
      const cfg = loyalty.getConfig();
      const maxFromBal = Math.floor((_redeemCust.points || 0) / cfg.redeemRate) * cfg.redeemRate;
      const maxFromPct = Math.floor(Math.max(0, subtotal - promoDisc) * cfg.maxRedeemPercent / 100 / cfg.redeemRate) * cfg.redeemRate;
      pointsRedeemed  = Math.min(maxFromBal, maxFromPct, frontPts);
      pointsDiscount  = Math.floor(pointsRedeemed / cfg.redeemRate) * 1000;
    }
  }

  const subtotalAfterPromo = Math.max(0, subtotal - promoDisc - pointsDiscount);
  const tax = Math.round(subtotalAfterPromo * 11 / 111);  // extract tax portion (inclusive)
  // biaya layanan transaksi digital (QRIS dll) — nutup MDR; tunai & POS kasir bebas
  const convenienceFee = (typeof global.getConvenienceFee === 'function')
    ? global.getConvenienceFee(pay, source) : 0;
  const total = subtotalAfterPromo + convenienceFee;       // gross + biaya layanan

  const order = {
    id:       `A${String(++orderCounter).padStart(2, "0")}`,
    time:     Date.now(),
    type:     type || "dine",
    table:    table || "-",
    status:   reqStatus || "waiting",
    pay:      pay || "QRIS",
    kasir:    kasir || null,
    source:   source || "kiosk",
    items,
    addons:   addons || {},
    subtotal,
    tax,
    convenienceFee,
    total,
    customerId,
    customerName,
    customerPhone,
    promoCode:    req.body.promoCode    || null,
    promoDiscount:req.body.promoDiscount|| 0,
    promoFreeItems: req.body.promoFreeItems || null,
    pointsRedeemed,
    pointsDiscount,
    cashReceived: cashReceived ?? null,
    cashChange:   cashChange ?? null,
  };

  // Update customer visit count & spend
  if (customerId) {
    const cIdx = customers.findIndex(c => c.id === customerId);
    if (cIdx >= 0) {
      customers[cIdx].visits     += 1;
      customers[cIdx].totalSpend += order.total;
      customers[cIdx].lastVisit   = Date.now();
      // Promote to member after 3 visits
      if (customers[cIdx].visits >= 3 && !customers[cIdx].tags?.includes("member")) {
        customers[cIdx].tags = [...(customers[cIdx].tags||[]).filter(t=>t!=="new"), "member"];
      }
      // Promote to VIP after 10 visits
      if (customers[cIdx].visits >= 10 && !customers[cIdx].tags?.includes("vip")) {
        customers[cIdx].tags = [...(customers[cIdx].tags||[]), "vip"];
      }
      db.insertCustomer(customers[cIdx]);
    }
  }

  // Record promo usage
  if (req.body.promoCode) {
    const pi = promoCodes.findIndex(p => p.code === req.body.promoCode);
    if (pi >= 0) promoCodes[pi].usedCount++;
  }

  // Mark table as occupied
  if (order.type === "dine" && order.table) {
    const ti = tables.findIndex(t => t.id === order.table || t.name === order.table);
    if (ti >= 0) { tables[ti].status = "occupied"; broadcast("table:updated", tables[ti]); }
  }

  // Add to active shift
  if (activeShift) {
    activeShift.totalOrders++;
    activeShift.totalRevenue += order.total;
  }

  // ── ATOMIC: persist order + customer (with redeem) + point tx in one transaction ──
  // If any DB write fails, ALL rollback. In-memory state mutated only on success.
  try {
    db.runInTransaction(() => {
      db.insertOrder(order);
    // Persist split payments
    if (isSplit && db && typeof db.updateOrderPayments === 'function') {
      try {
        db.updateOrderPayments(req.body.id || (newOrder && newOrder.id) || null, "completed", req.body.pay, _splitPayments);
      } catch(e) { console.warn("split persist:", e.message); }
    }

      if (_redeemCust && pointsRedeemed > 0) {
        const newBalance = (_redeemCust.points || 0) - pointsRedeemed;
        db.insertCustomer({ ..._redeemCust, points: newBalance });
        db.insertPointTx({ customerId, orderId: order.id, type: "redeem", amount: -pointsRedeemed, balanceAfter: newBalance });
      }
    });
    // Transaction succeeded → safe to mutate in-memory state
    if (_redeemCust && pointsRedeemed > 0) {
      _redeemCust.points = (_redeemCust.points || 0) - pointsRedeemed;
      console.log(`🎁 Redeem: ${pointsRedeemed}pt → Rp ${pointsDiscount} (customer ${customerId})`);
    }
    orders.push(order);
  } catch (e) {
    console.error(`❌ Order tx failed (${order.id}):`, e.message);
    orderCounter--; // rewind counter since order not persisted
    return res.status(500).json({ error: "Failed to create order", details: e.message });
  }
  printKitchenTicket(order).catch(() => {});   // fire-and-forget kitchen print
  printCustomerReceipt(order).catch(() => {}); // fire-and-forget customer struk
  broadcast("order:new", order);

  // Kitchen Display System — auto-create kitchen tickets from this order
  if (typeof global.createKitchenTickets === 'function') {
    try {
      global.createKitchenTickets({
        order_ref: order.id,
        items: (order.items || []).map(it => ({
          ...it,
          menu_id: it.menu_id || it.id,
          display_name: it.display_name || it.name || it.n,
          qty: it.qty || it.q || 1,
        })),
        customer_name: order.customerName,
        table_no: order.table && order.table !== '-' ? order.table : null,
        cashier: order.kasir,
      });
    } catch (e) { console.error('[kds] createKitchenTickets:', e.message); }
  }

  console.log(`✅ New order #${order.id} — ${order.type} — Rp ${order.total.toLocaleString()}`);

  // Push notif ke ESB POS (non-blocking)
  pushOrderToESB(order).then(result => {
    if (result.ok) {
      broadcast("esb:pushed", { orderId: order.id, ok: true });
    } else if (!result.skipped) {
      retryQueue.push(order); // queue for retry
      broadcast("esb:pushed", { orderId: order.id, ok: false, error: result.error });
    }
  }).catch(e => {
    console.error("ESB push error:", e.message);
    retryQueue.push(order);
  });

  res.status(201).json(order);
});

// PATCH update order status
app.patch("/api/orders/:id/settle", (req, res) => {
  const { pay, cashReceived, cashChange } = req.body;
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "order not found" });
  if (order.status !== "tab_open") {
    return res.status(400).json({ error: "order is not an open tab" });
  }

  order.pay = pay || "CASH";
  order.status = "waiting";
  if (cashReceived != null) order.cashReceived = cashReceived;
  if (cashChange != null) order.cashChange = cashChange;
  order.settledAt = Date.now();

  try {
    db.updateOrderStatus(order.id, order.status);
    if (db.updateOrderPay) db.updateOrderPay(order.id, order.pay, cashReceived, cashChange);
    else if (db.insertOrder) db.insertOrder(order); // fallback: re-insert (works if INSERT OR REPLACE)
    broadcast?.("order:settled", order);
    res.json(order);
  } catch (e) {
    console.error("settle failed:", e);
    res.status(500).json({ error: e.message });
  }
});

app.patch("/api/orders/:id/status", (req, res) => {
  const { status } = req.body;
  const valid = ["waiting", "preparing", "ready", "completed", "cancelled"];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${valid.join(", ")}` });
  }

  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Order not found" });

  const prevStatus = orders[idx].status;
  orders[idx] = { ...orders[idx], status, updatedAt: Date.now() };
  db.insertOrder(orders[idx]);
  broadcast("order:updated", orders[idx]);
  console.log(`📦 Order #${orders[idx].id} → ${status}`);

  // Auto-earn points on completed
  if (status === "completed" && orders[idx].customerId && loyalty.getConfig().enabled) {
    const cust = customers.find(c => c.id === orders[idx].customerId);
    if (cust) {
      const earned = loyalty.calculateEarned(orders[idx].total);
      if (earned > 0) {
        cust.points = (cust.points || 0) + earned;
        db.insertCustomer(cust);
        db.insertPointTx({ customerId: cust.id, orderId: orders[idx].id, type: "earn", amount: earned, balanceAfter: cust.points });
        orders[idx].pointsEarned = earned;
        db.insertOrder(orders[idx]);  // re-save so points_earned persists
        console.log(`🎁 Earned: ${earned}pt for ${cust.id} (order ${orders[idx].id}, total Rp ${orders[idx].total.toLocaleString()})`);
      }
    }
  }

  // WhatsApp notification (fire-and-forget)
  wa.notifyOrderStatus(orders[idx], status).catch(e => console.error("WA error:", e.message));

  // Free table when order completed/cancelled
  if (["completed","cancelled"].includes(status) && orders[idx].type === "dine") {
    const ti = tables.findIndex(t => t.id === orders[idx].table || t.name === orders[idx].table);
    if (ti >= 0) {
      const stillOccupied = orders.some(o =>
        o.id !== orders[idx].id &&
        o.type === "dine" &&
        (o.table === tables[ti].id || o.table === tables[ti].name) &&
        !["completed","cancelled"].includes(o.status)
      );
      if (!stillOccupied) {
        tables[ti].status = "available";
        broadcast("table:updated", tables[ti]);
      }
    }
  }

  res.json(orders[idx]);
});

// DELETE cancel order
app.delete("/api/orders/:id", (req, res) => {
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Order not found" });
  orders[idx] = { ...orders[idx], status: "cancelled", updatedAt: Date.now() };
  db.insertOrder(orders[idx]);
  broadcast("order:updated", orders[idx]);
  res.json({ success: true, id: req.params.id });
});

// ── MENU ────────────────────────────────────────────────────────────────────

// GET all menu
app.get("/api/menu/config", (req, res) => {
  res.json({
    items:              menu,
    toppings:           toppings,
    categories:         categories,
    extraToppingPrice:  EXTRA_TOPPING_PRICE,
  });
});

app.get("/api/menu", (req, res) => {
  res.json(menu);
});


app.get('/api/toppings', (req, res) => {
  res.json({ toppings, extraPrice: EXTRA_TOPPING_PRICE });
});

// GET available menu only
app.get("/api/menu/available", (req, res) => {
  res.json(menu.filter(m => m.avail));
});

// PATCH update menu item (price / availability)
app.patch("/api/menu/:id", (req, res) => {
  const id  = parseInt(req.params.id);
  const idx = menu.findIndex(m => m.id === id);
  if (idx === -1) return res.status(404).json({ error: "Menu item not found" });

  const { price, avail } = req.body;
  if (price !== undefined) {
    if (typeof price !== "number" || price <= 0) {
      return res.status(400).json({ error: "price must be a positive number" });
    }
    menu[idx].price = price;
  }
  if (avail !== undefined) menu[idx].avail = Boolean(avail);
      db.setMenuOverride(menu[idx].id, menu[idx].avail);

  broadcast("menu:updated", menu[idx]);
  console.log(`🍔 Menu #${id} "${menu[idx].name}" updated — price:${menu[idx].price} avail:${menu[idx].avail}`);
  res.json(menu[idx]);
});

// ── MASTER ITEM: Create new menu item ──
app.post("/api/menu", (req, res) => {
  const { cat, emoji, name, desc, price, freeToppings, popular } = req.body;
  if (!name || !price || !cat) return res.status(400).json({ error: "name, price, cat required" });

  // Auto-generate next ID based on category
  const catPrefix = { froyo: 100, smoothies: 200, yogulato: 300, takehome: 400, collab: 500 };
  const base = catPrefix[cat] || 600;
  const catItems = menu.filter(m => m.id >= base && m.id < base + 100);
  const nextId = catItems.length > 0 ? Math.max(...catItems.map(m => m.id)) + 1 : base + 1;

  const newItem = {
    id: nextId,
    cat: cat,
    emoji: emoji || "🍽️",
    name: name,
    desc: desc || "",
    price: Number(price),
    freeToppings: Number(freeToppings) || 0,
    popular: Boolean(popular),
    avail: true,
  };

  menu.push(newItem);
  db.setMenuOverride(newItem.id, true);
  broadcast("menu:updated", newItem);
  console.log("[Master] New item:", newItem.name, "id:", newItem.id, "cat:", newItem.cat);
  res.json(newItem);
});

// ── MASTER ITEM: Delete menu item ──
app.delete("/api/menu/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const idx = menu.findIndex(m => m.id === id);
  if (idx === -1) return res.status(404).json({ error: "Item not found" });

  const removed = menu.splice(idx, 1)[0];
  broadcast("menu:updated", { id, deleted: true });
  console.log("[Master] Deleted:", removed.name, "id:", id);
  res.json({ ok: true, deleted: removed });
});

// ── MASTER ITEM: Full edit (all fields) ──
app.put("/api/menu/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const idx = menu.findIndex(m => m.id === id);
  if (idx === -1) return res.status(404).json({ error: "Item not found" });

  const { cat, emoji, name, desc, price, freeToppings, popular, avail } = req.body;
  if (cat !== undefined) menu[idx].cat = cat;
  if (emoji !== undefined) menu[idx].emoji = emoji;
  if (name !== undefined) menu[idx].name = name;
  if (desc !== undefined) menu[idx].desc = desc;
  if (price !== undefined) menu[idx].price = Number(price);
  if (freeToppings !== undefined) menu[idx].freeToppings = Number(freeToppings);
  if (popular !== undefined) menu[idx].popular = Boolean(popular);
  if (avail !== undefined) {
    menu[idx].avail = Boolean(avail);
    db.setMenuOverride(menu[idx].id, menu[idx].avail);
  }

  broadcast("menu:updated", menu[idx]);
  console.log("[Master] Updated:", menu[idx].name, "id:", id);
  res.json(menu[idx]);
});

// ── MASTER TOPPINGS: CRUD ──
app.get("/api/toppings", (req, res) => res.json({ items: toppings, extraPrice: EXTRA_TOPPING_PRICE }));

app.post("/api/toppings", (req, res) => {
  const { id, name, group, price } = req.body;
  if (!name || !group) return res.status(400).json({ error: "name, group required" });
  const newId = id || (group[0].toLowerCase() + String(toppings.filter(t => t.group === group).length + 1).padStart(2, "0"));
  const topping = { id: newId, name, group, price: Number(price) || 0 };
  toppings.push(topping);
  res.json(topping);
});

app.delete("/api/toppings/:id", (req, res) => {
  const idx = toppings.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Topping not found" });
  const removed = toppings.splice(idx, 1)[0];
  res.json({ ok: true, deleted: removed });
});

// ── MASTER CATEGORIES ──
app.get("/api/categories", (req, res) => res.json(categories));

app.post("/api/categories", (req, res) => {
  const { id, name, emoji, color } = req.body;
  if (!id || !name) return res.status(400).json({ error: "id, name required" });
  if (categories.find(c => c.id === id)) return res.status(409).json({ error: "Category already exists" });
  const cat = { id, name, emoji: emoji || "📋", color: color || "#888" };
  categories.push(cat);
  res.json(cat);
});

// ── FINANCE: Expense tracking ──
const expenses = [];
let expenseCounter = 0;

app.post("/api/finance/expenses", (req, res) => {
  const { category, description, amount, date, notes } = req.body;
  if (!category || !amount) return res.status(400).json({ error: "category, amount required" });
  expenseCounter++;
  const expense = {
    id: "EXP" + String(expenseCounter).padStart(4, "0"),
    category,
    description: description || "",
    amount: Number(amount),
    date: date || new Date().toISOString().split("T")[0],
    notes: notes || "",
    createdAt: Date.now(),
    createdBy: req.headers["x-admin-name"] || "admin",
  };
  expenses.push(expense);
  console.log("[Finance] Expense:", expense.category, fIDR(expense.amount));
  res.json(expense);
});

app.get("/api/finance/expenses", (req, res) => {
  const { from, to } = req.query;
  let filtered = expenses;
  if (from) filtered = filtered.filter(e => e.date >= from);
  if (to) filtered = filtered.filter(e => e.date <= to);
  const total = filtered.reduce((s, e) => s + e.amount, 0);
  res.json({ items: filtered, total, count: filtered.length });
});

// ── FINANCE: P&L Summary ──
app.get("/api/finance/pnl", (req, res) => {
  // Revenue from orders
  const today = new Date().toISOString().split("T")[0];
  const todayStart = new Date(today).getTime();
  const todayOrders = orders.filter(o => o.time >= todayStart && o.status !== "cancelled");
  const grossRevenue = todayOrders.reduce((s, o) => s + (o.total || 0), 0);
  const taxRate = 0.11;
  const netRevenue = Math.round(grossRevenue / (1 + taxRate));
  const tax = grossRevenue - netRevenue;

  // Expenses today
  const todayExpenses = expenses.filter(e => e.date === today);
  const totalExpenses = todayExpenses.reduce((s, e) => s + e.amount, 0);

  // Expense breakdown by category
  const expByCategory = {};
  todayExpenses.forEach(e => {
    if (!expByCategory[e.category]) expByCategory[e.category] = 0;
    expByCategory[e.category] += e.amount;
  });

  const netProfit = netRevenue - totalExpenses;

  res.json({
    date: today,
    revenue: { gross: grossRevenue, net: netRevenue, tax, orders: todayOrders.length },
    expenses: { total: totalExpenses, count: todayExpenses.length, byCategory: expByCategory },
    profit: { net: netProfit, margin: netRevenue > 0 ? Math.round(netProfit / netRevenue * 100) : 0 },
  });
});

const fIDR = n => "Rp " + Math.round(n).toLocaleString("id-ID");

// ── STATS ────────────────────────────────────────────────────────────────────
app.get("/api/stats", (req, res) => {
  const completed  = orders.filter(o => o.status === "completed");
  const active     = orders.filter(o => !["completed","cancelled"].includes(o.status));
  const revenue    = orders.filter(o => o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  const cancelled  = orders.filter(o => o.status === "cancelled").length;

  const byStatus = {};
  ["waiting","preparing","ready","completed","cancelled"].forEach(s => {
    byStatus[s] = orders.filter(o => o.status === s).length;
  });

  const topItems = {};
  orders.filter(o => o.status !== "cancelled").forEach(o => {
    o.items.forEach(i => {
      topItems[i.n] = (topItems[i.n] || 0) + i.q;
    });
  });
  const topSorted = Object.entries(topItems)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  res.json({
    totalOrders:   orders.length,
    activeOrders:  active.length,
    completedOrders: completed.length,
    cancelledOrders: cancelled,
    revenue,
    tax: Math.round(revenue * 0.11 / 1.11),
    netRevenue: Math.round(revenue / 1.11),
    avgOrder: completed.length ? Math.round(revenue / completed.length) : 0,
    byStatus,
    topItems: topSorted,
    menuAvailable: menu.filter(m => m.avail).length,
    menuTotal: menu.length,
  });
});



// ═══════════════════════════════════════════════════════════════
// PRINTER CONFIG (runtime-configurable, persisted to JSON)
// ═══════════════════════════════════════════════════════════════
const PRINTER_CONFIG_FILE = path.join(__dirname, "printer-config.json");

function loadPrinterConfig() {
  const defaults = {
    debug: process.env.PRINTER_DEBUG !== "false",
    kitchen:  { ip: process.env.KITCHEN_PRINTER_IP  || "", port: parseInt(process.env.KITCHEN_PRINTER_PORT)  || 9100 },
    customer: { ip: process.env.CUSTOMER_PRINTER_IP || "", port: parseInt(process.env.CUSTOMER_PRINTER_PORT) || 9100 },
  };
  try {
    if (fs.existsSync(PRINTER_CONFIG_FILE)) {
      const p = JSON.parse(fs.readFileSync(PRINTER_CONFIG_FILE, "utf-8"));
      return { ...defaults, ...p, kitchen: { ...defaults.kitchen, ...(p.kitchen||{}) }, customer: { ...defaults.customer, ...(p.customer||{}) } };
    }
  } catch (e) { console.warn("printer-config.json corrupt:", e.message); }
  return defaults;
}

let printerConfig = loadPrinterConfig();

function savePrinterConfig() {
  fs.writeFileSync(PRINTER_CONFIG_FILE, JSON.stringify(printerConfig, null, 2));
}

console.log(`🖨  Printer mode: ${printerConfig.debug ? "DEBUG (file)" : "LIVE TCP"} · Kitchen: ${printerConfig.kitchen.ip||"unset"} · Customer: ${printerConfig.customer.ip||"unset"}`);

app.get("/api/printer/config", (req, res) => res.json(printerConfig));

app.patch("/api/printer/config", (req, res) => {
  const { debug, kitchen, customer } = req.body || {};
  if (debug !== undefined) printerConfig.debug = Boolean(debug);
  if (kitchen) {
    if (kitchen.ip   !== undefined) printerConfig.kitchen.ip   = String(kitchen.ip || "").trim();
    if (kitchen.port !== undefined) printerConfig.kitchen.port = parseInt(kitchen.port) || 9100;
  }
  if (customer) {
    if (customer.ip   !== undefined) printerConfig.customer.ip   = String(customer.ip || "").trim();
    if (customer.port !== undefined) printerConfig.customer.port = parseInt(customer.port) || 9100;
  }
  savePrinterConfig();
  broadcast("printer:config", printerConfig);
  console.log(`🖨  Printer config updated → debug:${printerConfig.debug} k:${printerConfig.kitchen.ip}:${printerConfig.kitchen.port} c:${printerConfig.customer.ip}:${printerConfig.customer.port}`);
  res.json({ ok: true, config: printerConfig });
});




// ─── LOYALTY POINTS ─────────────────────────────────────
// Customer-facing loyalty info (balance + recent history)
app.get("/api/customers/:id/loyalty", (req, res) => {
  const cust = customers.find(c => c.id === req.params.id);
  if (!cust) return res.status(404).json({ error: "Customer not found" });
  const cfg = loyalty.getConfig();
  res.json({
    id: cust.id,
    name: cust.name,
    points: cust.points || 0,
    history: db.getPointHistory(cust.id, 10),
    earnRate: cfg.earnRate,
    redeemRate: cfg.redeemRate,
    minRedeemPoints: cfg.minRedeemPoints,
  });
});

app.get("/api/loyalty/config", (req, res) => res.json(loyalty.getConfig()));

app.patch("/api/loyalty/config", (req, res) => {
  const updated = loyalty.setConfig(req.body || {});
  broadcast("loyalty:config", updated);
  console.log(`🎁 Loyalty config updated: ${JSON.stringify(updated)}`);
  res.json({ ok: true, config: updated });
});

app.get("/api/loyalty/history/:customerId", (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(db.getPointHistory(req.params.customerId, limit));
});

// Manual adjust (admin) — add/subtract points
app.post("/api/loyalty/adjust", (req, res) => {
  const { customerId, amount, reason } = req.body || {};
  if (!customerId || typeof amount !== "number") return res.status(400).json({ error: "customerId & amount required" });
  const cust = customers.find(c => c.id === customerId);
  if (!cust) return res.status(404).json({ error: "Customer not found" });
  cust.points = Math.max(0, (cust.points || 0) + amount);
  db.insertCustomer(cust);
  db.insertPointTx({ customerId, type: "adjust", amount, balanceAfter: cust.points });
  console.log(`🎁 Adjust ${customerId}: ${amount > 0 ? "+" : ""}${amount}pt → balance ${cust.points}`);
  res.json({ ok: true, customer: cust });
});

// ─── WhatsApp Notification ──────────────────────────────────────
app.get("/api/wa/config", (req, res) => {
  const cfg = wa.loadConfig();
  // Mask sensitive tokens in response
  const safe = JSON.parse(JSON.stringify(cfg));
  if (safe.fonnte.token) safe.fonnte.tokenMasked = safe.fonnte.token.slice(0,4) + "•".repeat(8);
  if (safe.twilio.token) safe.twilio.tokenMasked = safe.twilio.token.slice(0,4) + "•".repeat(8);
  res.json({ ...safe, provider: wa.detectProvider() });
});

app.patch("/api/wa/config", (req, res) => {
  const updated = wa.setConfig(req.body || {});
  console.log(`📱 WA config updated → provider=${wa.detectProvider()||"none"} enabled=${JSON.stringify(updated.enabled)}`);
  res.json({ ok: true, config: updated, provider: wa.detectProvider() });
});

app.post("/api/wa/test", async (req, res) => {
  const { phone, message } = req.body || {};
  if (!phone) return res.status(400).json({ error: "phone required" });
  const result = await wa.sendMessage(phone, message || "Test message from BINTORO Kiosk 🍦");
  res.json(result);
});

// ═══════════════════════════════════════════════════════════════
// DATABASE BACKUP — Auto-backup data.db every hour
// ═══════════════════════════════════════════════════════════════
const BACKUP_DIR        = path.join(__dirname, "backups");
const BACKUP_INTERVAL_MS = parseInt(process.env.BACKUP_INTERVAL_MS) || 3600000; // 1 hour default
const BACKUP_RETENTION   = parseInt(process.env.BACKUP_RETENTION)   || 24;       // keep last 24

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function backupNow(reason = "scheduled") {
  ensureBackupDir();
  const dbFile = path.join(__dirname, "data.db");
  if (!fs.existsSync(dbFile)) return { ok: false, error: "data.db not found" };
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}_${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}`;
  const target = path.join(BACKUP_DIR, `data-${stamp}.db`);
  try {
    // Use SQLite Online Backup API for consistency (avoids partial writes during WAL)
    db.db.backup(target).then(() => {
      const sizeKB = Math.round(fs.statSync(target).size / 1024);
      console.log(`💾 Backup ${reason}: ${path.basename(target)} (${sizeKB} KB)`);
      pruneOldBackups();
    }).catch(err => console.error("Backup failed:", err.message));
    return { ok: true, file: path.basename(target) };
  } catch (e) {
    // Fallback: simple file copy (less safe but works)
    fs.copyFileSync(dbFile, target);
    pruneOldBackups();
    return { ok: true, file: path.basename(target), method: "copy" };
  }
}

function pruneOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith("data-") && f.endsWith(".db"))
      .map(f => ({ name: f, path: path.join(BACKUP_DIR, f), mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    const toDelete = files.slice(BACKUP_RETENTION);
    toDelete.forEach(f => {
      fs.unlinkSync(f.path);
      console.log(`🗑️  Pruned old backup: ${f.name}`);
    });
  } catch (e) {
    console.warn("Backup prune failed:", e.message);
  }
}

function listBackups() {
  ensureBackupDir();
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith("data-") && f.endsWith(".db"))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { file: f, sizeKB: Math.round(stat.size/1024), createdAt: stat.mtimeMs };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

// Schedule auto-backup
setInterval(() => backupNow("hourly"), BACKUP_INTERVAL_MS);
// Initial backup 30s after boot (gives time for any startup writes)
setTimeout(() => backupNow("startup"), 30000);
console.log(`🎁 Loyalty: ${loyalty.getConfig().enabled ? 'ON (1pt/Rp'+loyalty.getConfig().earnRate+', redeem '+loyalty.getConfig().redeemRate+'pt=Rp1k)' : 'OFF'}`); console.log(`📱 WhatsApp: ${wa.detectProvider() || 'none (log-only)'}`); console.log(`💾 Auto-backup scheduled every ${Math.round(BACKUP_INTERVAL_MS/60000)} min, retention ${BACKUP_RETENTION}`);

// API endpoints
app.get("/api/backup", (req, res) => res.json({ backups: listBackups(), retention: BACKUP_RETENTION, intervalMin: Math.round(BACKUP_INTERVAL_MS/60000) }));
app.post("/api/backup", (req, res) => res.json(backupNow("manual")));


// ═══════════════════════════════════════════════════════════════
// REPORTS — Z-report (end-of-day summary)
// ═══════════════════════════════════════════════════════════════

function generateZReport(startMs, endMs, label) {
  // Fetch orders within range (exclude cancelled)
  const allOrders = db.loadAllOrders();
  const orders = allOrders.filter(o =>
    o.time >= startMs && o.time <= endMs && o.status !== "cancelled"
  );

  // Summary
  const grossRevenue   = orders.reduce((s, o) => s + (o.total || 0), 0);
  const taxExtracted   = orders.reduce((s, o) => s + (o.tax || 0), 0);
  const netRevenue     = grossRevenue - taxExtracted;
  const promoDiscount  = orders.reduce((s, o) => s + (o.promoDiscount || 0), 0);
  const summary = {
    transactionCount: orders.length,
    grossRevenue, taxExtracted, netRevenue, promoDiscount,
    avgTicket: orders.length ? Math.round(grossRevenue / orders.length) : 0,
  };

  // Payment breakdown
  const payments = {};
  orders.forEach(o => {
    const m = (o.pay || "UNKNOWN").toUpperCase();
    if (!payments[m]) payments[m] = { count: 0, total: 0 };
    payments[m].count++;
    payments[m].total += o.total || 0;
  });

  // Order type breakdown
  const orderTypes = {};
  orders.forEach(o => {
    const t = o.type || "unknown";
    if (!orderTypes[t]) orderTypes[t] = { count: 0, total: 0 };
    orderTypes[t].count++;
    orderTypes[t].total += o.total || 0;
  });

  // Top items (parse JSON if needed)
  const itemTally = {};
  orders.forEach(o => {
    const items = Array.isArray(o.items) ? o.items : (o.items ? JSON.parse(o.items) : []);
    items.forEach(it => {
      // Support both shapes: {n,q,p} (compact) and {name,qty,price} (verbose)
      const name  = it.name  || it.n || `Item ${it.id || "?"}`;
      const qty   = Number(it.qty   ?? it.q) || 1;
      const price = Number(it.price ?? it.p) || 0;
      if (!itemTally[name]) itemTally[name] = { name, qty: 0, revenue: 0 };
      itemTally[name].qty     += qty;
      itemTally[name].revenue += price * qty;
    });
  });
  const topItems = Object.values(itemTally).sort((a, b) => b.qty - a.qty).slice(0, 10);

  // Promo usage
  const promoUsage = {};
  orders.forEach(o => {
    if (o.promoCode) {
      if (!promoUsage[o.promoCode]) promoUsage[o.promoCode] = { count: 0, totalDiscount: 0 };
      promoUsage[o.promoCode].count++;
      promoUsage[o.promoCode].totalDiscount += (o.promoDiscount || 0);
    }
  });

  // Cash reconciliation
  const cashOrders = orders.filter(o => (o.pay || "").toUpperCase() === "CASH");
  const cashReconciliation = {
    transactionCount: cashOrders.length,
    cashSales:        cashOrders.reduce((s, o) => s + (o.total || 0), 0),
    cashReceived:     cashOrders.reduce((s, o) => s + (o.cashReceived || 0), 0),
    cashChange:       cashOrders.reduce((s, o) => s + (o.cashChange || 0), 0),
  };

  // Active shift (if any)
  let shift = null;
  try { shift = db.loadActiveShift(); } catch(e) {}

  return {
    period: { start: startMs, end: endMs, label },
    summary, payments, orderTypes, topItems, promoUsage, cashReconciliation, shift,
    generatedAt: Date.now(),
  };
}

// Z-report endpoint — supports ?date=YYYY-MM-DD (single day) or ?from=&to= (date range)
app.get("/api/reports/z", (req, res) => {
  const parseISO = (s) => { const d = new Date(s + "T00:00:00"); return isNaN(d.getTime()) ? null : d; };
  let fromDate, toDate, label;
  if (req.query.from || req.query.to) {
    fromDate = req.query.from ? parseISO(req.query.from) : new Date();
    toDate   = req.query.to   ? parseISO(req.query.to)   : new Date();
    if (!fromDate || !toDate) return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    if (toDate < fromDate) [fromDate, toDate] = [toDate, fromDate]; // auto-swap
    const sameDay = fromDate.toDateString() === toDate.toDateString();
    label = sameDay
      ? fromDate.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : `${fromDate.toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"})} – ${toDate.toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"})}`;
  } else if (req.query.date) {
    fromDate = parseISO(req.query.date);
    if (!fromDate) return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    toDate = fromDate;
    label = fromDate.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } else {
    fromDate = toDate = new Date();
    label = fromDate.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()).getTime();
  const end   = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate()).getTime() + 86400000 - 1;
  const r = generateZReport(start, end, label);
  res.json({ ...r, period: { ...(r.period||{}), label, from: fromDate.toISOString().slice(0,10), to: toDate.toISOString().slice(0,10) } });
});





// ─── PROMO CODE SYSTEM ────────────────────────────────────────────────────────
let promoCodes = db.loadAllPromos();
if (promoCodes.length === 0) {
  const seed = [
  {
    id: "P001", code: "BINTORO10", type: "percent", value: 10,
    desc: "Diskon 10% untuk semua menu",
    minOrder: 50000, maxDiscount: 50000,
    usageLimit: 100, usedCount: 12,
    validFrom: Date.now() - 86400000*7,
    validUntil: Date.now() + 86400000*30,
    active: true, forMember: false,
  },
  {
    id: "P002", code: "MEMBER20", type: "percent", value: 20,
    desc: "Diskon 20% khusus member",
    minOrder: 75000, maxDiscount: 75000,
    usageLimit: 500, usedCount: 44,
    validFrom: Date.now() - 86400000*30,
    validUntil: Date.now() + 86400000*60,
    active: true, forMember: true,
  },
  {
    id: "P003", code: "GRATISFRIES", type: "fixed", value: 38000,
    desc: "Gratis Truffle Fries",
    minOrder: 100000, maxDiscount: 38000,
    usageLimit: 50, usedCount: 8,
    validFrom: Date.now() - 86400000*3,
    validUntil: Date.now() + 86400000*7,
    active: true, forMember: false,
  },
  {
    id: "P004", code: "VIP25", type: "percent", value: 25,
    desc: "Diskon 25% khusus member VIP",
    minOrder: 100000, maxDiscount: 100000,
    usageLimit: 200, usedCount: 5,
    validFrom: Date.now() - 86400000*1,
    validUntil: Date.now() + 86400000*90,
    active: true, forMember: true,
  },
  {
    id: "P005", code: "NEWMEMBER", type: "fixed", value: 25000,
    desc: "Potongan Rp 25.000 untuk member baru",
    minOrder: 60000, maxDiscount: 25000,
    usageLimit: 1000, usedCount: 130,
    validFrom: Date.now() - 86400000*60,
    validUntil: Date.now() + 86400000*365,
    active: true, forMember: true,
  },
  // ─── BOGO PROMOS ───────────────────────────────────────────
  {
    id: "P006", code: "BUY1GET1", type: "bogo", value: 0,
    desc: "🎁 Beli 2 menu, gratis 1 termurah (max 3 free)",
    minOrder: 0, maxDiscount: 150000,
    usageLimit: 999, usedCount: 0,
    validFrom: Date.now() - 86400000*7,
    validUntil: Date.now() + 86400000*60,
    active: true, forMember: false,
    bogoConfig: { mode: "universal", buyQty: 1, getQty: 1, maxFreeQty: 3 },
  },
  {
    id: "P007", code: "B2G1", type: "bogo", value: 0,
    desc: "🎁 Beli 2 menu, gratis 1 termurah (Buy 2 Get 1)",
    minOrder: 0, maxDiscount: 100000,
    usageLimit: 500, usedCount: 0,
    validFrom: Date.now() - 86400000*3,
    validUntil: Date.now() + 86400000*30,
    active: true, forMember: false,
    bogoConfig: { mode: "universal", buyQty: 2, getQty: 1, maxFreeQty: 2 },
  },
];
  seed.forEach(p => db.insertPromo(p));
  promoCodes = seed;
  console.log(`🎟️  Seeded ${seed.length} demo promos`);
}
let promoCounter = promoCodes.length
  ? Math.max(0, ...promoCodes.map(o => {
      const m = /^P(\d+)$/.exec(o.id || "");
      return m ? parseInt(m[1]) : 0;
    }))
  : 0;
console.log(`📊 Promo counter: ${promoCounter}`);

// Calculate discount amount
function calcDiscount(promo, subtotal, cart) {
  if (promo.type === "percent") {
    const raw = subtotal * (promo.value / 100);
    return Math.min(raw, promo.maxDiscount || Infinity);
  }
  if (promo.type === "fixed") {
    return Math.min(promo.value, promo.maxDiscount || Infinity);
  }
  if (promo.type === "bogo") {
    return calcBogoDiscount(promo, cart || []);
  }
  return 0;
}

// BOGO logic — supports 4 modes: universal, same, cross, category
function calcBogoDiscount(promo, cart) {
  return calcBogoDetails(promo, cart).discount;
}

// Returns {discount, freeItems[{name, qty, unitPrice, totalPrice}]}
function calcBogoDetails(promo, cart) {
  const cfg = promo.bogoConfig || {};
  const mode = cfg.mode || "universal";
  const buyQty = cfg.buyQty || 1;
  const getQty = cfg.getQty || 1;
  const maxFree = cfg.maxFreeQty || Infinity;
  const groupSize = buyQty + getQty;
  const empty = { discount: 0, freeItems: [] };
  if (!Array.isArray(cart)) return empty;

  const flatUnits = (filterFn) => {
    const units = [];
    cart.forEach(line => {
      if (filterFn && !filterFn(line)) return;
      const basePrice = (line.item?.price ?? line.price ?? 0);
      const addons = line.addonTotal || 0;
      const unitPrice = basePrice + addons;
      const name = line.item?.name || line.name || "Item";
      for (let i = 0; i < (line.qty || 0); i++) units.push({ name, unitPrice });
    });
    return units;
  };

  const consolidate = (units) => {
    const map = new Map();
    units.forEach(u => {
      const key = u.name + "|" + u.unitPrice;
      if (!map.has(key)) map.set(key, { name: u.name, qty: 0, unitPrice: u.unitPrice, totalPrice: 0 });
      const entry = map.get(key);
      entry.qty += 1;
      entry.totalPrice += u.unitPrice;
    });
    return [...map.values()];
  };

  const cap = (raw) => Math.min(raw, promo.maxDiscount || Infinity);

  if (mode === "universal") {
    const units = flatUnits().sort((a,b) => a.unitPrice - b.unitPrice);
    if (units.length < groupSize) return empty;
    const freeCount = Math.min(Math.floor(units.length / groupSize) * getQty, maxFree);
    if (freeCount <= 0) return empty;
    const free = units.slice(0, freeCount);
    return { discount: cap(free.reduce((s,u) => s + u.unitPrice, 0)), freeItems: consolidate(free) };
  }
  if (mode === "same") {
    const itemId = cfg.triggerItemId;
    if (!itemId) return empty;
    const units = flatUnits(line => line.item?.id === itemId).sort((a,b) => a.unitPrice - b.unitPrice);
    if (units.length < groupSize) return empty;
    const freeCount = Math.min(Math.floor(units.length / groupSize) * getQty, maxFree);
    const free = units.slice(0, freeCount);
    return { discount: cap(free.reduce((s,u) => s + u.unitPrice, 0)), freeItems: consolidate(free) };
  }
  if (mode === "cross") {
    const triggerId = cfg.triggerItemId, freeId = cfg.freeItemId;
    if (!triggerId || !freeId) return empty;
    const triggerUnits = flatUnits(line => line.item?.id === triggerId);
    const freeUnits = flatUnits(line => line.item?.id === freeId).sort((a,b) => a.unitPrice - b.unitPrice);
    if (triggerUnits.length < buyQty || freeUnits.length < 1) return empty;
    const maxEligible = Math.floor(triggerUnits.length / buyQty) * getQty;
    const actualFree = Math.min(maxEligible, freeUnits.length, maxFree);
    if (actualFree <= 0) return empty;
    const sel = freeUnits.slice(0, actualFree);
    return { discount: cap(sel.reduce((s,u) => s + u.unitPrice, 0)), freeItems: consolidate(sel) };
  }
  if (mode === "category") {
    const cat = cfg.categoryId;
    if (!cat) return empty;
    const units = flatUnits(line => (line.item?.cat ?? line.item?.category) === cat).sort((a,b) => a.unitPrice - b.unitPrice);
    if (units.length < groupSize) return empty;
    const freeCount = Math.min(Math.floor(units.length / groupSize) * getQty, maxFree);
    const sel = units.slice(0, freeCount);
    return { discount: cap(sel.reduce((s,u) => s + u.unitPrice, 0)), freeItems: consolidate(sel) };
  }
  return empty;
}

// POST /api/promo/validate — validate promo code
app.post("/api/promo/validate", (req, res) => {
  const { code, subtotal, customerId, customerTags, cart } = req.body;
  if (!code) return res.status(400).json({ ok: false, error: "Kode promo harus diisi" });

  const promo = promoCodes.find(p => p.code.toUpperCase() === code.trim().toUpperCase());

  if (!promo)          return res.json({ ok: false, error: "Kode promo tidak ditemukan" });
  if (!promo.active)   return res.json({ ok: false, error: "Kode promo sudah tidak aktif" });
  if (Date.now() < promo.validFrom)  return res.json({ ok: false, error: "Kode promo belum berlaku" });
  if (Date.now() > promo.validUntil) return res.json({ ok: false, error: "Kode promo sudah kadaluarsa" });
  if (promo.usedCount >= promo.usageLimit) return res.json({ ok: false, error: "Kode promo sudah habis digunakan" });
  if (subtotal < promo.minOrder) {
    return res.json({ ok: false, error: `Minimum order ${new Intl.NumberFormat("id-ID", {style:"currency",currency:"IDR",maximumFractionDigits:0}).format(promo.minOrder)}` });
  }
  if (promo.forMember && !customerId) {
    return res.json({ ok: false, error: "Kode ini khusus untuk member. Daftar dulu yuk!" });
  }
  if (promo.code === "VIP25" && !customerTags?.includes("vip")) {
    return res.json({ ok: false, error: "Kode ini khusus untuk member VIP ⭐" });
  }

  let discount, freeItems = null;
  if (promo.type === "bogo") {
    const d = calcBogoDetails(promo, cart || []);
    discount = d.discount; freeItems = d.freeItems;
    if (discount === 0) {
      const cfg = promo.bogoConfig || {};
      const hint = ({
        same:      "Tambahkan minimal 2 item yang sama sesuai promo",
        cross:     "Tambahkan item trigger + item gratis ke cart",
        category:  "Tambahkan minimal 2 item dari kategori promo",
        universal: "Tambahkan minimal 2 item ke cart",
      })[cfg.mode || "universal"];
      return res.json({ ok: false, error: "Cart belum memenuhi syarat BOGO: " + hint });
    }
  } else {
    discount = calcDiscount(promo, subtotal, cart);
  }
  res.json({
    ok: true,
    promoId:   promo.id,
    code:      promo.code,
    desc:      promo.desc,
    type:      promo.type,
    value:     promo.value,
    discount,
    freeItems,
    forMember: promo.forMember,
    bogoConfig: promo.bogoConfig || null,
    paymentHint: promo.requiredPaymentHint || null,
  });
});

// GET /api/promo — list all promo (admin)
app.get("/api/promo", (req, res) => {
  res.json(promoCodes);
});

// GET /api/promos — alias plural untuk backward-compat
app.get("/api/promos", (req, res) => {
  res.json([...promoCodes].sort((a, b) => (b.active - a.active) || (b.usedCount - a.usedCount)));
});


// POST /api/promo — create new promo (admin)
app.post("/api/promo", (req, res) => {
  const { code, type, value, desc, minOrder, maxDiscount, usageLimit, validUntil, active, forMember, bogoConfig, requiredPaymentHint } = req.body;
  if (!code || !type) return res.status(400).json({ error: "code & type required" });
  if (type !== "bogo" && !value) return res.status(400).json({ error: "value required" });
  if (promoCodes.find(p => p.code.toUpperCase() === code.toUpperCase())) {
    return res.status(409).json({ error: "Kode sudah digunakan" });
  }
  const promo = {
    id:         `P${String(++promoCounter).padStart(3,"0")}`,
    code:       code.trim().toUpperCase(),
    type, value: Number(value), desc: desc||"",
    minOrder:   Number(minOrder)||0,
    maxDiscount:Number(maxDiscount)||value,
    usageLimit: Number(usageLimit)||999,
    usedCount:  0,
    validFrom:  Date.now(),
    validUntil: validUntil ? new Date(validUntil).getTime() : Date.now()+86400000*30,
    active:     active !== false,
    forMember:  Boolean(forMember),
    bogoConfig: bogoConfig || null,
    requiredPaymentHint: requiredPaymentHint || null,
  };
  promoCodes.push(promo);
  db.insertPromo(promo);
  broadcast("promo:created", promo);
  res.status(201).json(promo);
});

// GET /api/promo/stats — promo usage stats
app.get("/api/promo/stats", (req, res) => {
  const totalSaved = promoCodes.reduce((s,p) => s + p.usedCount * (p.type==="fixed" ? p.value : 0), 0);
  res.json({
    total:    promoCodes.length,
    active:   promoCodes.filter(p=>p.active).length,
    expired:  promoCodes.filter(p=>Date.now()>p.validUntil).length,
    totalUsage: promoCodes.reduce((s,p)=>s+p.usedCount,0),
    totalSaved,
  });
});

// GET /api/promo/:id — single promo
app.get("/api/promo/:id", (req, res) => {
  const promo = promoCodes.find(p => p.id === req.params.id);
  if (!promo) return res.status(404).json({ error: "Promo not found" });
  res.json(promo);
});

// PATCH /api/promo/:id — update promo
app.patch("/api/promo/:id", (req, res) => {
  const idx = promoCodes.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Promo not found" });
  // Guard duplicate code (parity with POST handler)
  const updates = { ...req.body };
  if (updates.code) {
    updates.code = updates.code.trim().toUpperCase();
    const conflict = promoCodes.find(p => p.id !== req.params.id && p.code.toUpperCase() === updates.code);
    if (conflict) return res.status(409).json({ error: `Kode "${updates.code}" sudah dipakai promo ${conflict.id}` });
  }
  promoCodes[idx] = { ...promoCodes[idx], ...updates, id: promoCodes[idx].id };
  db.insertPromo(promoCodes[idx]);
  res.json(promoCodes[idx]);
});

// DELETE /api/promo/:id — delete promo
app.delete("/api/promo/:id", (req, res) => {
  promoCodes = promoCodes.filter(p => p.id !== req.params.id);
  db.deletePromo(req.params.id);
  res.json({ ok: true });
});


// ─── CUSTOMER DATABASE ────────────────────────────────────────────────────
// In-memory store (replace with real DB like SQLite/PostgreSQL in production)
// Load customers from SQLite. Seed only on first boot (empty DB)
let customers = db.loadAllCustomers();
if (customers.length === 0) {
  const seed = [
  { id:"C001", name:"Budi Santoso",  phone:"08123456789", visits:5, totalSpend:485000, createdAt:Date.now()-86400000*30, lastVisit:Date.now()-3600000, tags:["member"] },
  { id:"C002", name:"Sari Dewi",     phone:"08234567890", visits:2, totalSpend:198000, createdAt:Date.now()-86400000*7,  lastVisit:Date.now()-7200000, tags:["new"] },
  { id:"C003", name:"Andi Pratama",  phone:"08345678901", visits:8, totalSpend:920000, createdAt:Date.now()-86400000*60, lastVisit:Date.now()-1800000, tags:["member","vip"] },
];
  seed.forEach(c => db.insertCustomer(c));
  customers = seed;
  console.log(`👤 Seeded ${seed.length} demo customers (first boot)`);
}
let customerCounter = customers.length
  ? Math.max(0, ...customers.map(o => {
      const m = /^C(\d+)$/.exec(o.id || "");
      return m ? parseInt(m[1]) : 0;
    }))
  : 0;
console.log(`📊 Customer counter: ${customerCounter}`);

// Whatsapp tracking base URL — set via env
const WA_TRACKING_BASE = process.env.WA_TRACKING_BASE || "http://localhost:5173";

// ── Customer CRUD ──────────────────────────────────────────────────────────

// GET all customers (with search + filter)
app.get("/api/customers", (req, res) => {
  const { q, tag, limit = 100, offset = 0 } = req.query;
  let result = [...customers];
  if (q) {
    const ql = q.toLowerCase();
    result = result.filter(c => c.name.toLowerCase().includes(ql) || c.phone.includes(q));
  }
  if (tag) result = result.filter(c => c.tags?.includes(tag));
  res.json({
    total: result.length,
    data:  result.slice(Number(offset), Number(offset) + Number(limit)),
  });
});

// GET single customer by phone (for lookup at kiosk)
app.get("/api/customers/lookup", (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: "phone required" });
  // Normalize to handle 08xx vs 628xx vs +628xx variants
  const norm = (p) => {
    const d = (p || "").replace(/\D/g, "");
    if (d.startsWith("62")) return d;
    if (d.startsWith("0"))  return "62" + d.slice(1);
    return d;
  };
  const target = norm(phone);
  const found  = customers.find(c => norm(c.phone) === target);
  // Always 200 — null body means "not found, but no error" (avoids console noise)
  res.json(found || null);
});

// POST create or update customer (upsert by phone)
app.post("/api/customers", (req, res) => {
  const { name, phone, tags } = req.body;
  if (!name || !phone) return res.status(400).json({ error: "name and phone required" });
  const clean = phone.replace(/\D/g,"");
  const existing = customers.find(c => c.phone.replace(/\D/g,"") === clean);
  if (existing) {
    // Update name if changed
    if (name && name !== existing.name) existing.name = name;
    if (tags) existing.tags = [...new Set([...(existing.tags||[]), ...tags])];
    return res.json({ ...existing, isNew: false });
  }
  const customer = {
    id:        `C${String(++customerCounter).padStart(3,"0")}`,
    name:      name.trim(),
    phone:     clean,
    visits:    0,
    totalSpend:0,
    createdAt: Date.now(),
    lastVisit: null,
    tags:      tags || ["new"],
  };
  customers.push(customer);
  db.insertCustomer(customer);
  console.log(`👤 New customer: ${customer.name} (${customer.phone})`);
  res.status(201).json({ ...customer, isNew: true });
});

// PATCH update customer
app.patch("/api/customers/:id", (req, res) => {
  const idx = customers.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Customer not found" });
  customers[idx] = { ...customers[idx], ...req.body, id: customers[idx].id };
  res.json(customers[idx]);
});

// DELETE customer
app.delete("/api/customers/:id", (req, res) => {
  customers = customers.filter(c => c.id !== req.params.id);
  res.json({ ok: true });
});

// GET customer stats (for marketing)
app.get("/api/customers/stats", (req, res) => {
  const total     = customers.length;
  const members   = customers.filter(c => c.tags?.includes("member")).length;
  const vip       = customers.filter(c => c.tags?.includes("vip")).length;
  const newToday  = customers.filter(c => Date.now()-c.createdAt < 86400000).length;
  const totalRev  = customers.reduce((s,c) => s+c.totalSpend, 0);
  const avgVisits = total ? (customers.reduce((s,c)=>s+c.visits,0)/total).toFixed(1) : 0;
  res.json({ total, members, vip, newToday, totalRev, avgVisits });
});

// POST send WhatsApp tracking link
app.post("/api/customers/send-wa", async (req, res) => {
  const { phone, orderId, customerName } = req.body;
  if (!phone || !orderId) return res.status(400).json({ error: "phone and orderId required" });

  const trackUrl = `${WA_TRACKING_BASE}/track?order=${orderId}`;
  const message  = encodeURIComponent(
    `Halo ${customerName||"Kak"}! 👋\n\nTerima kasih sudah memesan di *BINTORO* 🍽️\n\nPesanan *#${orderId}* Anda sedang kami proses.\n\nCek status pesanan real-time di sini:\n👉 ${trackUrl}\n\nEstimasi siap: *12–18 menit*\n\nTerima kasih! 🙏`
  );

  // WhatsApp API (wa.me deep link — works without Business API)
  const cleanPhone = phone.replace(/\D/g,"");
  const waPhone    = cleanPhone.startsWith("0") ? "62" + cleanPhone.slice(1) : cleanPhone;
  const waUrl      = `https://wa.me/${waPhone}?text=${message}`;

  console.log(`📱 WA link generated for ${waPhone} — Order #${orderId}`);
  res.json({ ok: true, waUrl, trackUrl });
});

// ─── PRINTER (Epson TM-T82 via TCP/LAN) ──────────────────────────────────
const net = require("net");

function tcpPrint(ip, port, data) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => { client.destroy(); reject(new Error("Timeout")); }, 5000);
    client.connect(port, ip, () => {
      client.write(Buffer.from(data));
      clearTimeout(timeout);
      client.end();
      resolve(true);
    });
    client.on("error", (e) => { clearTimeout(timeout); reject(e); });
  });
}

// POST /api/print — send ESC/POS bytes to printer
app.post("/api/print", async (req, res) => {
  const { ip, port, data } = req.body;
  if (!ip || !port || !data) return res.status(400).json({ error: "ip, port, data required" });
  try {
    await tcpPrint(ip, parseInt(port), data);
    console.log(`🖨️  Printed to ${ip}:${port} (${data.length} bytes)`);
    res.json({ ok: true });
  } catch (e) {
    console.error(`🖨️  Print failed: ${e.message}`);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/print/test — test printer connection
app.post("/api/print/test", async (req, res) => {
  const { ip, port } = req.body;
  if (!ip || !port) return res.status(400).json({ error: "ip and port required" });
  try {
    // Send init + beep + cut
    const testBytes = [0x1B,0x40, 0x1B,0x42,0x02,0x01, 0x0A,0x0A, 0x1D,0x56,0x41,0x03];
    await tcpPrint(ip, parseInt(port), testBytes);
    res.json({ ok: true, message: `Printer ${ip}:${port} connected` });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ─── ESB POS PUSH NOTIFICATION ───────────────────────────────────────────
// Config diambil dari environment variables atau di-set via /api/esb/config
let esbConfig = {
  baseUrl:  process.env.ESB_BASE_URL  || "https://api.esb.co.id/eso-qs/v1",
  apiKey:   process.env.ESB_API_KEY   || "",
  outletId: process.env.ESB_OUTLET_ID || "",
  enabled:  process.env.ESB_ENABLED   === "true" || false,
};

// Format order ke payload ESB Order QS
function buildESBOrderPayload(order) {
  return {
    outlet_id:    esbConfig.outletId,
    order_id:     order.id,
    order_source: "KIOSK",
    order_type:   order.type === "dine" ? "DINE_IN" : "TAKEAWAY",
    table_number: order.table || null,
    payment_method: order.pay || "QRIS",
    status:       "NEW",
    items: (order.items || []).map(i => ({
      item_code:  String(i.id || i.n),
      item_name:  i.n,
      quantity:   i.q,
      unit_price: i.p,
      subtotal:   i.p * i.q,
      notes:      i.note || "",
    })),
    subtotal:     order.subtotal || order.total,
    tax:          order.tax || 0,
    total:        order.total,
    created_at:   new Date(order.time || Date.now()).toISOString(),
  };
}

// Push order ke ESB POS
async function pushOrderToESB(order) {
  if (!esbConfig.enabled || !esbConfig.apiKey || !esbConfig.outletId) {
    console.log("⚡ ESB push skipped (disabled or no config)");
    return { ok: false, skipped: true };
  }

  const payload = buildESBOrderPayload(order);
  const endpoints = [
    `/outlets/${esbConfig.outletId}/orders`,
    `/order`,
    `/orders`,
  ];

  for (const ep of endpoints) {
    try {
      const fetch = (await import("node-fetch")).default;
      const res = await fetch(`${esbConfig.baseUrl}${ep}`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Accept":        "application/json",
          "Authorization": `Bearer ${esbConfig.apiKey}`,
          "X-Outlet-Id":   esbConfig.outletId,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        console.log(`🔔 ESB POS notif OK — Order #${order.id} → ${esbConfig.baseUrl}${ep}`);
        return { ok: true, endpoint: ep, response: data };
      }
    } catch (e) {
      console.warn(`⚠️  ESB push attempt ${ep} failed: ${e.message}`);
    }
  }

  console.error(`❌ ESB POS push failed — Order #${order.id}`);
  return { ok: false, error: "All endpoints failed" };
}

// Retry queue untuk order yang gagal push
const retryQueue = [];
setInterval(async () => {
  if (!esbConfig.enabled || retryQueue.length === 0) return;
  const order = retryQueue.shift();
  console.log(`🔁 Retry ESB push Order #${order.id}...`);
  const result = await pushOrderToESB(order);
  if (!result.ok && !result.skipped) retryQueue.push(order); // put back if still fails
}, 30000); // retry every 30s

// GET /api/esb/config — get current ESB config (mask api key)
app.get("/api/esb/config", (req, res) => {
  res.json({
    baseUrl:  esbConfig.baseUrl,
    outletId: esbConfig.outletId,
    enabled:  esbConfig.enabled,
    hasApiKey: !!esbConfig.apiKey,
    apiKeyHint: esbConfig.apiKey ? esbConfig.apiKey.slice(0,8) + "..." : "",
  });
});

// POST /api/esb/config — update ESB config at runtime
app.post("/api/esb/config", (req, res) => {
  const { baseUrl, apiKey, outletId, enabled } = req.body;
  if (baseUrl)  esbConfig.baseUrl  = baseUrl;
  if (apiKey)   esbConfig.apiKey   = apiKey;
  if (outletId) esbConfig.outletId = outletId;
  if (enabled !== undefined) esbConfig.enabled = Boolean(enabled);
  console.log(`⚙️  ESB config updated — enabled:${esbConfig.enabled} outlet:${esbConfig.outletId}`);
  res.json({ ok: true, enabled: esbConfig.enabled, outletId: esbConfig.outletId });
});

// POST /api/esb/test — test push a dummy order
app.post("/api/esb/test", async (req, res) => {
  const dummy = {
    id: "TEST-01", time: Date.now(), type: "dine", table: "T1",
    pay: "QRIS", total: 55000, subtotal: 49550, tax: 5450,
    items: [{ n: "Test Item", q: 1, p: 55000 }],
  };
  const result = await pushOrderToESB(dummy);
  res.json(result);
});

// POST /api/esb/retry — manual retry semua failed orders
app.post("/api/esb/retry", (req, res) => {
  const count = retryQueue.length;
  res.json({ ok: true, queued: count });
});



// ─── ADMIN: Audio upload (TTS replacement files) ────────────────────────
const AUDIO_DIR = require("path").join(__dirname, "audio");
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

app.get("/api/admin/audio", (_, res) => {
  try {
    const files = fs.readdirSync(AUDIO_DIR).filter(f => /\.(mp3|wav|ogg)$/i.test(f));
    const items = files.map(f => {
      const stat = fs.statSync(require("path").join(AUDIO_DIR, f));
      return { name: f, size: stat.size, modified: stat.mtimeMs };
    });
    res.json({ files: items });
  } catch (e) {
    res.json({ files: [], error: e.message });
  }
});

app.post("/api/admin/audio/:name", (req, res) => {
  try {
    const name = req.params.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { dataBase64, mimeType } = req.body || {};
    if (!dataBase64) return res.status(400).json({ error: "dataBase64 required" });
    // Decode base64 → buffer (strip data URL prefix if present)
    const b64 = dataBase64.replace(/^data:[^;]+;base64,/, "");
    const buf = Buffer.from(b64, "base64");
    if (buf.length > 5 * 1024 * 1024) return res.status(413).json({ error: "File too large (max 5MB)" });
    fs.writeFileSync(require("path").join(AUDIO_DIR, name), buf);
    console.log(`🔊 Audio uploaded: ${name} (${(buf.length/1024).toFixed(1)}KB)`);
    res.json({ ok: true, name, size: buf.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/audio-config", (_, res) => {
  res.json(audioConfig.getConfig());
});

app.patch("/api/admin/audio-config", (req, res) => {
  try {
    const cur = audioConfig.getConfig();
    const patch = req.body || {};
    // Allow nested profile updates: { profiles: { newOrder: false } } merges
    const next = { ...cur, ...patch };
    if (patch.profiles) next.profiles = { ...cur.profiles, ...patch.profiles };
    const saved = audioConfig.saveConfig(next);
    console.log(`🔊 Audio config updated (enabled=${saved.enabled}, vol=${saved.volume})`);
    res.json({ ok: true, config: saved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/admin/audio/:name", (req, res) => {
  try {
    const name = req.params.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fp = require("path").join(AUDIO_DIR, name);
    if (fs.existsSync(fp)) {
      fs.unlinkSync(fp);
      console.log(`🔊 Audio deleted: ${name}`);
      res.json({ ok: true });
    } else {
      res.status(404).json({ error: "Not found" });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MIDTRANS QRIS PAYMENT ────────────────────────────────────────────────
// Midtrans config now loaded from midtrans.js module (persisted to midtrans-config.json)
// Backward compat: getter that reads from module each time (no stale cache)
const midtransConfig = new Proxy({}, {
  get: (_, prop) => midtrans.getConfig()[prop]
});

// Midtrans Core API base URL
const mtBaseUrl = () => midtransConfig.isProduction
  ? "https://api.midtrans.com"
  : "https://api.sandbox.midtrans.com";

// Auth header: Base64(serverKey:)
const mtAuth = () => "Basic " + Buffer.from(midtransConfig.serverKey + ":").toString("base64");

async function midtransRequest(method, path, body) {
  const fetch = (await import("node-fetch")).default;
  const res = await fetch(`${mtBaseUrl()}${path}`, {
    method,
    headers: {
      "Content-Type":  "application/json",
      "Accept":        "application/json",
      "Authorization": mtAuth(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_messages?.[0] || data?.status_message || `HTTP ${res.status}`);
  return data;
}



// ─── ADMIN: Screensaver config + images CRUD ────────────────────────
app.get("/api/admin/screensaver-config", (_, res) => {
  res.json({ config: screensaver.getConfig(), images: screensaver.listImages() });
});

app.patch("/api/admin/screensaver-config", (req, res) => {
  try {
    const saved = screensaver.saveConfig({ ...screensaver.getConfig(), ...req.body });
    res.json({ ok: true, config: saved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/screensaver-image/:name", (req, res) => {
  try {
    const name = req.params.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { dataBase64 } = req.body || {};
    if (!dataBase64) return res.status(400).json({ error: "dataBase64 required" });
    const b64 = dataBase64.replace(/^data:[^;]+;base64,/, "");
    const buf = Buffer.from(b64, "base64");
    if (buf.length > 5 * 1024 * 1024) return res.status(413).json({ error: "Image too large (max 5MB)" });
    require("fs").writeFileSync(require("path").join(screensaver.IMAGES_DIR, name), buf);
    console.log(`🖼 Screensaver image uploaded: ${name}`);
    res.json({ ok: true, name, size: buf.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/admin/screensaver-image/:name", (req, res) => {
  try {
    const name = req.params.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fp = require("path").join(screensaver.IMAGES_DIR, name);
    if (require("fs").existsSync(fp)) {
      require("fs").unlinkSync(fp);
      res.json({ ok: true });
    } else res.status(404).json({ error: "Not found" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ADMIN: Midtrans config CRUD ───────────────────────────────────────
app.get("/api/admin/midtrans-config", (_, res) => {
  const cfg = midtrans.getConfig();
  // Hide sensitive parts of server key in response (show last 4 chars only)
  const masked = {
    ...cfg,
    serverKey: cfg.serverKey ? "•••••" + cfg.serverKey.slice(-4) : "",
    serverKeyFull: cfg.serverKey,  // separate field — frontend can choose to reveal
  };
  res.json(masked);
});

app.patch("/api/admin/midtrans-config", (req, res) => {
  try {
    const allowed = ["serverKey","clientKey","isProduction","enabledMethods","merchantId","notificationUrl"];
    const patch = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    const cfg = midtrans.getConfig();
    const updated = midtrans.saveConfig({ ...cfg, ...patch });
    console.log(`💳 Midtrans config updated (${updated.isProduction ? "production" : "sandbox"})`);
    res.json({ ok: true, config: { ...updated, serverKey: "•••••" + (updated.serverKey||"").slice(-4) } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/midtrans-test", async (_, res) => {
  const result = await midtrans.testConnection();
  res.json(result);
});

// POST /api/payment/qris — create QRIS transaction
app.post("/api/payment/qris", async (req, res) => {
  const { orderId, amount, items, customerName } = req.body;
  if (!orderId || !amount) return res.status(400).json({ error: "orderId and amount required" });
  if (!midtransConfig.serverKey) return res.status(503).json({ error: "Midtrans server key not configured" });

  try {
    // Build item details — strip emoji/special chars, ensure valid for Midtrans
    const mappedItems = (items || []).map((i, idx) => {
      const rawName = String(i.n || i.name || "Item");
      // Remove emoji and non-ASCII, keep alphanumeric + basic punctuation
      const cleanName = rawName
        .replace(/[\u{1F600}-\u{1F9FF}]/gu, "")
        .replace(/[^\w\s.,()\-]/g, "")
        .trim()
        .slice(0, 50) || `Item ${idx + 1}`;
      const rawId = String(i.id || i.n || `item-${idx}`);
      const cleanId = rawId.replace(/[^a-zA-Z0-9_\-]/g, "").slice(0, 50) || `item-${idx}`;
      const price = Math.max(1, Math.round((Number(i.p) || 0) + (Number(i.addonTotal) || 0)));
      const qty   = Math.max(1, Math.round(Number(i.q) || 1));
      return { id: cleanId, price, quantity: qty, name: cleanName };
    });

    // Remove items with zero price
    const validItems = mappedItems.filter(i => i.price > 0);
    if (validItems.length === 0) {
      validItems.push({ id: "order", price: Math.round(amount), quantity: 1, name: "Order" });
    }

    // Recalculate gross_amount from items to ensure match
    const itemsTotal = validItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const grossAmount = Math.round(amount) || itemsTotal;

    // If mismatch, add adjustment item
    if (itemsTotal !== grossAmount && mappedItems.length > 0) {
      const diff = grossAmount - itemsTotal;
      if (diff !== 0) {
        validItems.push({
          id: "tax-fee",
          price: Math.abs(diff),
          quantity: 1,
          name: diff > 0 ? "Pajak & Biaya" : "Diskon",
        });
      }
    }

    // Use GoPay in sandbox (QRIS requires production merchant setup)
    // In production, change payment_type to "qris" and add qris: { acquirer: "gopay" }
    const isProduction = midtransConfig.isProduction;
    const payload = {
      payment_type: isProduction ? "qris" : "gopay",
      transaction_details: {
        order_id:     `BINTORO-${orderId}-${Date.now()}`,
        gross_amount: grossAmount,
      },
      ...(isProduction
        ? { qris: { acquirer: "gopay" } }
        : { gopay: { enable_callback: false } }
      ),
      item_details: validItems,
      customer_details: {
        first_name: (customerName || "Customer").slice(0, 50),
        email:      "customer@bintoro.id",
      },
    };

    const result = await midtransRequest("POST", "/v2/charge", payload);
    console.log(`💳 QRIS created — Order: ${payload.transaction_details.order_id} — Rp ${amount.toLocaleString()}`);
    console.log(`💳 Midtrans response:`, JSON.stringify(result).slice(0, 300));

    // Get QR string — GoPay uses deeplink actions, QRIS uses qr_string
    let finalQrString = result.qr_string || "";

    // For GoPay sandbox: get QR from actions
    if (!finalQrString && result.actions) {
      const qrAction = result.actions.find(a =>
        a.name === "generate-qr-code" || a.name === "deeplink-redirect"
      );
      if (qrAction?.url) {
        finalQrString = qrAction.url;
      }
    }

    // For GoPay: also get deeplink URL for mobile
    const deeplinkUrl = result.actions?.find(a => a.name === "deeplink-redirect")?.url || "";
    const qrImageUrl  = result.actions?.find(a => a.name === "generate-qr-code")?.url || "";

    console.log("💳 QR actions:", JSON.stringify(result.actions));

    const txEntry = {
      internalOrderId: orderId,
      midtransOrderId: payload.transaction_details.order_id,
      transactionId:   result.transaction_id,
      status:          result.transaction_status,
      qrString:        finalQrString,
      qrUrl:           result.actions?.find(a => a.name === "generate-qr-code")?.url || "",
      amount,
      createdAt:       Date.now(),
    };
    transactions.set(txEntry.midtransOrderId, txEntry);

    res.json({
      ok:              true,
      midtransOrderId: txEntry.midtransOrderId,
      transactionId:   result.transaction_id,
      qrString:        finalQrString,
      qrUrl:           qrImageUrl || txEntry.qrUrl,
      deeplinkUrl:     deeplinkUrl,
      status:          result.transaction_status,
      expiryTime:      result.expiry_time,
      paymentType:     isProduction ? "qris" : "gopay",
    });
  } catch (e) {
    console.error("Midtrans QRIS error:", e.message);
    res.status(500).json({ error: e.message });
  }
});


// GET /api/payment/check/:internalOrderId — check by internal order ID (for kiosk polling)
app.get("/api/payment/check/:internalOrderId", async (req, res) => {
  const { internalOrderId } = req.params;

  // Search transactions map by internalOrderId
  for (const [mtId, tx] of transactions.entries()) {
    if (tx.internalOrderId === internalOrderId) {
      const paid = tx.paid || ["capture","settlement"].includes(tx.status);
      if (paid) return res.json({ ok: true, paid: true, status: tx.status, midtransOrderId: mtId });

      // Not paid yet — check Midtrans directly
      try {
        const mtStatus = await midtransRequest("GET", `/v2/${mtId}/status`);
        const isPaid = ["capture","settlement"].includes(mtStatus.transaction_status);
        if (isPaid) {
          // Auto-update local state
          tx.paid = true;
          tx.status = mtStatus.transaction_status;
          transactions.set(mtId, tx);
          const orderIdx = orders.findIndex(o => o.id === internalOrderId);
          if (orderIdx >= 0) {
            orders[orderIdx].paymentStatus = "paid";
            orders[orderIdx].paymentMethod = mtStatus.payment_type || "gopay";
          }
          broadcast("payment:confirmed", { orderId: internalOrderId, paid: true });
          console.log(`✅ Auto-confirmed payment for order ${internalOrderId}`);
          return res.json({ ok: true, paid: true, status: mtStatus.transaction_status, midtransOrderId: mtId });
        }
      } catch(e) { /* Midtrans check failed - use local state */ }

      return res.json({ ok: true, paid: false, status: tx.status, midtransOrderId: mtId });
    }
  }

  // Not found in transactions yet — check orders for paymentStatus
  const order = orders.find(o => o.id === internalOrderId);
  if (order?.paymentStatus === "paid") {
    return res.json({ ok: true, paid: true, status: "settlement" });
  }
  res.json({ ok: true, paid: false, status: "pending" });
});
// POST /api/payment/gopay — create GoPay transaction (returns QR + deeplink)
app.post("/api/payment/gopay", async (req, res) => {
  const { orderId, amount, items, customerName } = req.body;
  if (!orderId || !amount) return res.status(400).json({ error: "orderId and amount required" });
  if (!midtransConfig.serverKey) return res.status(503).json({ error: "Midtrans server key not configured" });

  try {
    const midtransOrderId = `BINTORO-${orderId}-${Date.now()}`;
    const payload = {
      payment_type: "gopay",
      transaction_details: {
        order_id:     midtransOrderId,
        gross_amount: Math.round(amount),
      },
      gopay: {
        enable_callback: false,
      },
      customer_details: {
        first_name: customerName || "Customer",
        email:      "customer@bintoro.id",
      },
    };

    const result = await midtransRequest("POST", "/v2/charge", payload);
    console.log(`💳 GoPay charge — ${midtransOrderId} — Rp ${amount.toLocaleString()}`);

    const qrUrl       = result.actions?.find(a => a.name === "generate-qr-code")?.url || "";
    const deeplinkUrl = result.actions?.find(a => a.name === "deeplink-redirect")?.url || "";

    const txEntry = {
      internalOrderId: orderId,
      midtransOrderId,
      transactionId:   result.transaction_id,
      status:          result.transaction_status,
      qrUrl,
      deeplinkUrl,
      amount,
      createdAt:       Date.now(),
    };
    transactions.set(midtransOrderId, txEntry);

    res.json({
      ok:              true,
      midtransOrderId,
      transactionId:   result.transaction_id,
      qrUrl,
      deeplinkUrl,
      status:          result.transaction_status,
      expiryTime:      result.expiry_time,
    });
  } catch (e) {
    console.error("GoPay charge error:", e.message);
    res.status(500).json({ error: e.message });
  }
});
// GET /api/payment/status/:orderId — poll transaction status
app.get("/api/payment/status/:orderId", async (req, res) => {
  const { orderId } = req.params;
  // Find midtrans order id from our mapping
  let mtOrderId = orderId;
  for (const [k, v] of transactions.entries()) {
    if (v.internalOrderId === orderId) { mtOrderId = k; break; }
  }
  try {
    const result = await midtransRequest("GET", `/v2/${mtOrderId}/status`);
    const tx = transactions.get(mtOrderId);
    if (tx) {
      tx.status = result.transaction_status;
      transactions.set(mtOrderId, tx);
    }
    const paid = ["capture","settlement"].includes(result.transaction_status);
    res.json({
      ok:     true,
      status: result.transaction_status,
      paid,
      paymentType: result.payment_type,
      transactionTime: result.transaction_time,
      grossAmount: result.gross_amount,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/payment/webhook — Midtrans notification handler
app.post("/api/payment/webhook", async (req, res) => {
  const notif = req.body;
  console.log(`🔔 Midtrans webhook: ${notif.order_id} → ${notif.transaction_status}`);

  const tx = transactions.get(notif.order_id);
  const paid = ["capture","settlement"].includes(notif.transaction_status);

  if (tx) {
    tx.status = notif.transaction_status;
    tx.paid = paid;
    transactions.set(notif.order_id, tx);

    // Update order status
    const orderIdx = orders.findIndex(o => o.id === tx.internalOrderId);
    if (orderIdx >= 0 && paid) {
      orders[orderIdx].paymentStatus = "paid";
      orders[orderIdx].paymentMethod = notif.payment_type || "qris";
      broadcast("payment:confirmed", {
        orderId:    tx.internalOrderId,
        midtransId: notif.order_id,
        status:     notif.transaction_status,
        paid,
      });
    }
  }
  res.json({ status: "ok" });
});

// GET /api/payment/config — get Midtrans client key (safe to expose)

// ─── PAYMENT METHODS CONFIG ────────────────────────────────────────────────
// Defaults from ENV, persisted to disk so admin can toggle without restart
const PAYMENT_METHODS_FILE = path.join(__dirname, 'payment-methods.json');

function loadPaymentMethods() {
  // Default from env (or both true)
  const defaults = {
    cash: process.env.PAYMENT_CASH_ENABLED !== "false",
    qris: process.env.PAYMENT_QRIS_ENABLED !== "false",
  };
  try {
    if (fs.existsSync(PAYMENT_METHODS_FILE)) {
      const persisted = JSON.parse(fs.readFileSync(PAYMENT_METHODS_FILE, 'utf-8'));
      return { ...defaults, ...persisted };
    }
  } catch (e) {
    console.warn("⚠️  payment-methods.json corrupt, using env defaults:", e.message);
  }
  return defaults;
}

function savePaymentMethods(methods) {
  fs.writeFileSync(PAYMENT_METHODS_FILE, JSON.stringify(methods, null, 2));
}

let paymentMethods = loadPaymentMethods();
console.log(`💳 Payment methods enabled:`, Object.entries(paymentMethods).filter(([,v])=>v).map(([k])=>k).join(", ") || "NONE");

// GET current state
app.get("/api/payment/methods", (req, res) => {
  res.json(paymentMethods);
});

// PATCH toggle (admin only - requireAdmin should be applied but for now open)
app.patch("/api/payment/methods", (req, res) => {
  const updates = req.body || {};
  const validKeys = ["cash", "qris"];
  for (const key of Object.keys(updates)) {
    if (!validKeys.includes(key)) {
      return res.status(400).json({ error: `Invalid payment method: ${key}` });
    }
    paymentMethods[key] = Boolean(updates[key]);
  }
  savePaymentMethods(paymentMethods);
  broadcast("payment:methods", paymentMethods);
  console.log(`💳 Payment methods updated:`, paymentMethods);
  res.json({ ok: true, methods: paymentMethods });
});


app.get("/api/payment/config", (req, res) => {
  res.json({
    clientKey:    midtransConfig.clientKey,
    isProduction: midtransConfig.isProduction,
    configured:   !!midtransConfig.serverKey,
    snapUrl:      midtransConfig.isProduction
      ? "https://app.midtrans.com/snap/snap.js"
      : "https://app.sandbox.midtrans.com/snap/snap.js",
  });
});

// POST /api/payment/midtrans-config — update keys at runtime
app.post("/api/payment/midtrans-config", (req, res) => {
  const { serverKey, clientKey, isProduction } = req.body;
  if (serverKey)    midtransConfig.serverKey    = serverKey;
  if (clientKey)    midtransConfig.clientKey    = clientKey;
  if (isProduction !== undefined) midtransConfig.isProduction = Boolean(isProduction);
  console.log(`⚙️  Midtrans config updated — production:${midtransConfig.isProduction}`);
  res.json({ ok: true, isProduction: midtransConfig.isProduction, configured: !!midtransConfig.serverKey });
});

// In-memory transaction store
const transactions = new Map();



// ─── ADMIN AUTH MIDDLEWARE ────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  const session = adminSessions.get(token);
  if (!session) return res.status(401).json({ error: "Invalid or expired session" });
  req.admin = session;
  next();
}

// Optional: apply to sensitive admin routes only
// app.use("/api/menu", requireAdmin);
// app.use("/api/promo", requireAdmin);
// app.use("/api/customers", requireAdmin);
// (Uncomment above when ready for production auth enforcement)

// ─── ADMIN AUTH (PIN-based) ───────────────────────────────────────────────────
let adminUsers = db.loadAllAdminUsers();
if (adminUsers.length === 0) {
  const seed = [
  { id:"U001", name:"Manager",   pin:"123456", role:"manager", active:true },
  { id:"U002", name:"Kasir 1",   pin:"111111", role:"kasir",   active:true },
  { id:"U003", name:"Kasir 2",   pin:"222222", role:"kasir",   active:true },
];
  seed.forEach(u => db.insertAdminUser(u));
  adminUsers = seed;
  console.log(`🔐 Seeded ${seed.length} default admin users (PINs: 123456/111111/222222)`);
}
const adminSessions = new Map(); // token → { userId, role, loginAt }

function genToken() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

app.post("/api/auth/login", (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: "PIN required" });
  const user = adminUsers.find(u => u.pin === pin && u.active);
  if (!user) return res.status(401).json({ error: "PIN salah" });
  const token = genToken();
  adminSessions.set(token, { userId: user.id, name: user.name, role: user.role, loginAt: Date.now() });
  console.log(`🔐 Login: ${user.name} (${user.role})`);
  res.json({ ok: true, token, name: user.name, role: user.role });
});

app.post("/api/auth/logout", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ","");
  if (token) adminSessions.delete(token);
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ","");
  const session = token && adminSessions.get(token);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  const user = adminUsers.find(u => u.id === session.userId);
  res.json({ ...session, pin: undefined });
});

app.get("/api/auth/users", (req, res) => {
  res.json(adminUsers.map(u => ({ ...u, pin: "••••••" })));
});

app.post("/api/auth/users", (req, res) => {
  const { name, pin, role } = req.body;
  if (!name || !pin || !role) return res.status(400).json({ error: "name, pin, role required" });
  if (pin.length !== 6) return res.status(400).json({ error: "PIN harus 6 digit" });
  const user = { id: `U${String(adminUsers.length+1).padStart(3,"0")}`, name, pin, role, active: true };
  adminUsers.push(user);
  db.insertAdminUser(user);
  res.status(201).json({ ...user, pin: "••••••" });
});

app.patch("/api/auth/users/:id", (req, res) => {
  const idx = adminUsers.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "User not found" });
  const { name, pin, role, active } = req.body;
  if (name) adminUsers[idx].name = name;
  if (pin && pin.length === 6) adminUsers[idx].pin = pin;
  if (role) adminUsers[idx].role = role;
  if (active !== undefined) adminUsers[idx].active = Boolean(active);
  res.json({ ...adminUsers[idx], pin: "••••••" });
});

// ─── TABLE / MEJA MANAGEMENT ─────────────────────────────────────────────────
let tables = db.loadAllTables();
if (tables.length === 0) {
  const seed = [
  { id:"T01", name:"Meja A1", zone:"A", capacity:4, status:"available", qrCode:"T01" },
  { id:"T02", name:"Meja A2", zone:"A", capacity:4, status:"available", qrCode:"T02" },
  { id:"T03", name:"Meja A3", zone:"A", capacity:2, status:"occupied",  qrCode:"T03" },
  { id:"T04", name:"Meja B1", zone:"B", capacity:6, status:"available", qrCode:"T04" },
  { id:"T05", name:"Meja B2", zone:"B", capacity:6, status:"available", qrCode:"T05" },
  { id:"T06", name:"Meja C1", zone:"C", capacity:2, status:"available", qrCode:"T06" },
  { id:"T07", name:"Meja C2", zone:"C", capacity:2, status:"occupied",  qrCode:"T07" },
  { id:"T08", name:"Meja D1", zone:"D", capacity:8, status:"available", qrCode:"T08" },
];
  seed.forEach(t => db.insertTable(t));
  tables = seed;
  console.log(`🪑 Seeded ${seed.length} demo tables`);
}

app.get("/api/tables", (req, res) => res.json(tables));

app.get("/api/tables/:id", (req, res) => {
  const table = tables.find(t => t.id === req.params.id || t.qrCode === req.params.id);
  if (!table) return res.status(404).json({ error: "Table not found" });
  res.json(table);
});

app.patch("/api/tables/:id", (req, res) => {
  const idx = tables.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Table not found" });
  tables[idx] = { ...tables[idx], ...req.body, id: tables[idx].id };
  db.insertTable(tables[idx]);
  broadcast("table:updated", tables[idx]);
  res.json(tables[idx]);
});

app.post("/api/tables", (req, res) => {
  const { name, zone, capacity } = req.body;
  const id = `T${String(tables.length+1).padStart(2,"0")}`;
  const table = { id, name: name||id, zone: zone||"A", capacity: Number(capacity)||4, status:"available", qrCode:id };
  tables.push(table);
  res.status(201).json(table);
});

app.delete("/api/tables/:id", (req, res) => {
  tables = tables.filter(t => t.id !== req.params.id);
  db.deleteTable(req.params.id);
  res.json({ ok: true });
});

// ─── SHIFT / KASIR MANAGEMENT ─────────────────────────────────────────────────
let shifts = db.loadAllShifts();
let activeShift = db.loadActiveShift();
if (activeShift) console.log(`🕐 Resumed active shift: ${activeShift.id} (opened by ${activeShift.openedBy})`);

// Normalize SQLite field names (openedAt/closedAt) to API names (openAt/closeAt)
function normalizeShift(s) {
  if (!s) return s;
  return {
    ...s,
    openAt:       s.openAt       ?? s.openedAt    ?? null,
    closeAt:      s.closeAt      ?? s.closedAt    ?? null,
    openingCash:  s.openingCash  ?? 0,
    closingCash:  s.closingCash  ?? null,
    kasirName:    s.kasirName    ?? s.openedBy    ?? "Kasir",
    totalOrders:  s.totalOrders  ?? 0,
    totalRevenue: s.totalRevenue ?? (typeof s.sales === 'number' ? s.sales : 0),
    byPayment:    s.byPayment    ?? {},
    active:       !s.closeAt && !s.closedAt,
  };
}

app.get("/api/shifts", (req, res) => res.json(shifts.map(normalizeShift)));
app.get("/api/shifts/active", (req, res) => {
  if (!activeShift) return res.json({ active: false });
  // Live aggregate stats from orders in shift window
  // Defensive: handle both camelCase (API-opened) and snake_case (DB-hydrated)
  const openTs = activeShift.openAt || activeShift.openedAt || activeShift.opened_at || 0;
  const shiftOrders = orders.filter(o => o.time >= openTs && o.status !== "cancelled");
  const totalRevenue = shiftOrders.reduce((s,o) => s + (o.total||0), 0);
  const byPayment = shiftOrders.reduce((acc,o) => {
    const k = o.pay || "UNKNOWN";
    acc[k] = (acc[k]||0) + (o.total||0);
    return acc;
  }, {});
  const expectedCash = (activeShift.openingCash||0) + (byPayment.CASH||0);
  res.json({
    ...normalizeShift(activeShift),
    active: true,
    totalOrders: shiftOrders.length,
    totalRevenue,
    byPayment,
    expectedCash,
  });
});

// 🔧 Emergency force-close (clears active shift state without strict validation)
app.post("/api/shifts/force-close", (req, res) => {
  if (!activeShift) return res.status(404).json({ error: "Tidak ada shift aktif" });
  const closed = {
    ...normalizeShift(activeShift),
    closeAt: Date.now(),
    closingCash: 0,
    note: "FORCE CLOSE — " + (req.body?.reason || "Manual reset by admin"),
    active: false,
  };
  // Persist if db has updater
  try { db.updateShift?.(closed.id, { closedAt: closed.closeAt, closingCash: 0, sales: 0 }); } catch {}
  shifts = shifts.map(s => s.id === closed.id ? closed : s);
  if (!shifts.find(s => s.id === closed.id)) shifts.push(closed);
  activeShift = null;
  console.log(`⚠️  Shift ${closed.id} force-closed`);
  res.json({ ok: true, shift: closed });
});

app.post("/api/shifts/open", (req, res) => {
  if (activeShift) return res.status(409).json({ error: "Shift sudah terbuka" });
  const { kasirName, openingCash } = req.body;
  const openedAtTs = Date.now();
  activeShift = {
    id:          `SH${String(shifts.length+1).padStart(3,"0")}`,
    kasirName:   kasirName || "Kasir",
    openedBy:    kasirName || "Kasir",
    openAt:      openedAtTs,
    openedAt:    openedAtTs,
    closeAt:     null,
    openingCash: Number(openingCash)||0,
    closingCash: null,
    orders:      [],
    totalOrders: 0,
    totalRevenue:0,
    active:      true,
  };
  db.insertShift(activeShift);
  console.log(`🟢 Shift dibuka: ${activeShift.kasirName}`);
  res.json(activeShift);
});

app.post("/api/shifts/close", (req, res) => {
  if (!activeShift) return res.status(404).json({ error: "Tidak ada shift aktif" });
  const { closingCash, note } = req.body;
  // Collect orders in this shift
  const openTs = activeShift.openAt || activeShift.openedAt || activeShift.opened_at || 0;
  const shiftOrders = orders.filter(o => o.time >= openTs && o.status !== "cancelled");
  const totalRevenue = shiftOrders.reduce((s,o) => s+o.total, 0);
  activeShift = {
    ...activeShift,
    closeAt:      Date.now(),
    closingCash:  Number(closingCash)||0,
    note:         note||"",
    orders:       shiftOrders.map(o => o.id),
    totalOrders:  shiftOrders.length,
    totalRevenue,
    active:       false,
  };
  shifts.push({ ...activeShift });
  const closed = { ...activeShift };
  if (activeShift) db.insertShift(activeShift);
  activeShift = null;
  console.log(`🔴 Shift ditutup: ${closed.kasirName} — ${shiftOrders.length} order, Rp ${totalRevenue.toLocaleString()}`);

  // ── AUTO-REPORT: Send shift summary via WhatsApp ──
  (async () => {
    try {
      const { getDb } = require("./command-center-backend");
      const auditDb = getDb();

      // Get config
      const configRows = auditDb.prepare("SELECT key, value FROM audit_config").all();
      const cfg = {};
      configRows.forEach(r => { cfg[r.key] = r.value; });

      if (cfg.AUTO_REPORT_ENABLED !== "true") return;

      const managerWA = cfg.MANAGER_WA || cfg.OWNER_WA;
      if (!managerWA) {
        console.log("[Auto-Report] No MANAGER_WA configured — skipped");
        return;
      }

      // Get anomalies
      const anomCount = auditDb.prepare("SELECT COUNT(*) as c FROM audit_anomalies WHERE resolved = 0").get().c;

      // Get waste today
      const wasteItems = auditDb.prepare("SELECT item_name, SUM(quantity) as total_qty, unit FROM audit_waste WHERE created_at >= date('now') GROUP BY item_name").all();

      // Get stock alerts
      const stockAlerts = auditDb.prepare("SELECT name, stock, unit FROM audit_warehouse WHERE stock <= min_stock").all();

      // Build message
      const fR = n => "Rp " + Math.round(n).toLocaleString("id-ID");
      const openTime = new Date(closed.openAt || closed.openedAt || 0).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
      const closeTime = new Date(closed.closeAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

      let msg = "📊 *SHIFT REPORT — BINTORO*\n";
      msg += "━━━━━━━━━━━━━━━━━━━━\n";
      msg += "👤 Kasir: " + (closed.kasirName || "?") + "\n";
      msg += "⏰ " + openTime + " — " + closeTime + "\n\n";
      msg += "💰 Revenue: " + fR(totalRevenue) + "\n";
      msg += "🧾 Orders: " + shiftOrders.length + "\n";
      msg += "💵 Cash Closing: " + fR(Number(closingCash) || 0) + "\n";
      if (note) msg += "📝 Note: " + note + "\n";
      msg += "\n";

      // Payment breakdown
      const cashOrders = shiftOrders.filter(o => (o.pay || "").toUpperCase() === "CASH");
      const qrisOrders = shiftOrders.filter(o => (o.pay || "").toUpperCase() === "QRIS");
      msg += "📱 QRIS: " + qrisOrders.length + "× (" + fR(qrisOrders.reduce((s,o) => s + o.total, 0)) + ")\n";
      msg += "💵 Cash: " + cashOrders.length + "× (" + fR(cashOrders.reduce((s,o) => s + o.total, 0)) + ")\n";
      msg += "\n";

      // Anomalies
      if (anomCount > 0) {
        msg += "🚨 *ANOMALI OPEN: " + anomCount + "*\n";
        msg += "Cek Command Center untuk detail.\n\n";
      }

      // Stock alerts
      if (stockAlerts.length > 0) {
        msg += "⚠ *STOK KRITIS:*\n";
        stockAlerts.forEach(s => {
          msg += "  • " + s.name + ": " + s.stock + " " + s.unit + "\n";
        });
        msg += "\n";
      }

      // Waste
      if (wasteItems.length > 0) {
        msg += "🗑️ *WASTE HARI INI:*\n";
        wasteItems.forEach(w => {
          msg += "  • " + w.item_name + ": " + w.total_qty + " " + w.unit + "\n";
        });
        msg += "\n";
      }

      msg += "━━━━━━━━━━━━━━━━━━━━\n";
      msg += "Bites & Co. Command Center";

      await wa.sendMessage(managerWA, msg);
      console.log("📱 Auto-report sent to " + managerWA);
    } catch (e) {
      console.warn("[Auto-Report] Failed:", e.message);
    }
  })();

  res.json(closed);
});

// ─── STOCK / AVAILABILITY REAL-TIME ──────────────────────────────────────────
// Broadcast menu update to all kiosks
app.post("/api/menu/:id/stock", (req, res) => {
  const id  = parseInt(req.params.id);
  const idx = menu.findIndex(m => m.id === id);
  if (idx === -1) return res.status(404).json({ error: "Item not found" });
  const { avail, reason } = req.body;
  menu[idx].avail = Boolean(avail);
      db.setMenuOverride(menu[idx].id, menu[idx].avail);
  menu[idx].stockNote = reason || "";
  // Broadcast to ALL connected clients (kiosk + admin)
  broadcast("menu:stockUpdate", { id, avail: menu[idx].avail, name: menu[idx].name, reason });
  console.log(`📦 Stock update: ${menu[idx].name} → ${avail?"available":"sold out"}`);
  res.json(menu[idx]);
});

// Bulk stock update
app.post("/api/menu/stock/bulk", (req, res) => {
  const { updates } = req.body; // [{ id, avail }]
  const changed = [];
  (updates||[]).forEach(u => {
    const idx = menu.findIndex(m => m.id === u.id);
    if (idx >= 0) { menu[idx].avail = Boolean(u.avail);
      db.setMenuOverride(menu[idx].id, menu[idx].avail); changed.push(menu[idx]); }
  });
  broadcast("menu:bulkStockUpdate", { items: changed });
  res.json({ ok: true, updated: changed.length });
});

// ─── WA NOTIFICATION "PESANAN SIAP" ──────────────────────────────────────────
app.post("/api/notify/ready", async (req, res) => {
  const { orderId } = req.body;
  const order = orders.find(o => o.id === orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!order.customerPhone) return res.json({ ok: false, reason: "No phone" });

  const trackUrl = `${process.env.WA_TRACKING_BASE || "http://localhost:5173"}/?track&order=${orderId}`;
  const message = encodeURIComponent(
    `Halo ${order.customerName||"Kak"}! 🎉

Pesanan *#${orderId}* Anda sudah *SIAP DIAMBIL!* ✅

` +
    `${order.type==="dine"?`Silakan ke meja *${order.table}* ya 🪑`:"Silakan ambil di konter kami 🛍️"}

` +
    `Cek detail pesanan: ${trackUrl}

Terima kasih sudah memesan di *BINTORO* 🍽️`
  );
  const cleanPhone = order.customerPhone.replace(/\D/g,"");
  const waPhone    = cleanPhone.startsWith("0") ? "62" + cleanPhone.slice(1) : cleanPhone;
  const waUrl      = `https://wa.me/${waPhone}?text=${message}`;

  console.log(`📱 WA Ready notification → ${waPhone} (Order #${orderId})`);
  res.json({ ok: true, waUrl, phone: waPhone });
});

// ─── DIGITAL RECEIPT ─────────────────────────────────────────────────────────
app.get("/api/receipt/:orderId", (req, res) => {
  const order = orders.find(o => o.id === req.params.orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const convenienceFee = order.convenienceFee || 0;
  const tax = Math.round((order.total - convenienceFee) * 11 / 111);  // PPN goods only — biaya layanan non-taxable
  res.json({
    receiptNo:    `RCP-${order.id}-${Date.now().toString(36).toUpperCase()}`,
    orderId:      order.id,
    timestamp:    new Date(order.time).toLocaleString("id-ID"),
    kasir:        order.kasirName || "Kiosk Self Order",
    type:         order.type,
    table:        order.table,
    items:        order.items,
    subtotal:     order.subtotal || order.total,
    promoCode:    order.promoCode || null,
    promoDiscount:order.promoDiscount || 0,
    promoFreeItems: order.promoFreeItems || null,
    tax,
    convenienceFee,
    total:        order.total,
    payment: order.pay === "CASH" ? "TUNAI" : "QRIS",
    midtransId:   order.midtransId || null,
    customer:     { name: order.customerName, phone: order.customerPhone },
    status:       order.status,
    pointsRedeemed: order.pointsRedeemed || 0,
    pointsDiscount: order.pointsDiscount || 0,
    pointsEarned:   order.pointsEarned   || 0,
  });
});

// ─── STAFF CALL ───────────────────────────────────────────────────────────────
const staffCalls = [];
app.post("/api/staff-call", (req, res) => {
  const { tableId, reason, orderId } = req.body;
  const call = {
    id:      Date.now(),
    tableId: tableId || "-",
    reason:  reason || "Butuh bantuan",
    orderId: orderId || null,
    time:    Date.now(),
    resolved:false,
  };
  staffCalls.push(call);
  broadcast("staffCall", call);
  console.log(`🔔 Staff call: Meja ${tableId} — ${reason}`);
  res.json({ ok: true, callId: call.id });
});

app.get("/api/staff-call", (req, res) => res.json(staffCalls.filter(c=>!c.resolved)));
app.patch("/api/staff-call/:id/resolve", (req, res) => {
  const call = staffCalls.find(c=>c.id===Number(req.params.id));
  if (call) { call.resolved = true; broadcast("staffCallResolved", { id: call.id }); }
  res.json({ ok: true });
});

// ─── START SERVER ─────────────────────────────────────────────────────────

// ── Public config (CDS tracking URL etc) ──────────────────────────────
app.get("/api/config/public", (_, res) => {
  let auditConfig = {};
  try {
    const { getDb } = require("./command-center-backend");
    const rows = getDb().prepare("SELECT key, value FROM audit_config").all();
    rows.forEach(r => { auditConfig[r.key] = r.value; });
    if (auditConfig.POINT_VALUE) auditConfig.POINT_VALUE = parseInt(auditConfig.POINT_VALUE) || 100;
  } catch(e) {}
  res.json({
    trackingBaseUrl: process.env.TRACKING_BASE_URL || process.env.VITE_TRACKING_BASE_URL || null,
    lanHost: process.env.LAN_HOST || null,
    ...auditConfig,
  });
});


// ── POS → CDS broadcast (Step 7B) ─────────────────────────────────────
app.post("/api/pos/broadcast", (req, res) => {
  const { event, data } = req.body || {};
  if (!event || typeof event !== "string" || !event.startsWith("pos:")) {
    return res.status(400).json({ error: "Invalid event name (must start with 'pos:')" });
  }
  try {
    broadcast(event, data || {});
    res.json({ ok: true, event });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;

// ═══════════════════════════════════════════════════════════
// SHIFT REPORT ENDPOINTS (v2 — in-memory arrays)
// ═══════════════════════════════════════════════════════════

// Field accessor (handles snake_case OR camelCase)
function _get(obj, key) {
  if (!obj) return undefined;
  const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return obj[key] !== undefined ? obj[key] : obj[camel];
}

function buildShiftReportV2(shift) {
  const start = _get(shift, 'opened_at');
  const closedAt = _get(shift, 'closed_at');
  const end = closedAt || Date.now();
  const openingCash = _get(shift, 'opening_cash') || 0;
  const closingCash = _get(shift, 'closing_cash');

  const inRange = orders.filter(o => {
    const t = _get(o, 'time');
    return t >= start && t <= end;
  });

  const valid = inRange.filter(o => {
    const s = _get(o, 'status');
    return s !== 'cancelled' && s !== 'void';
  });
  const cancelled = inRange.filter(o => {
    const s = _get(o, 'status');
    return s === 'cancelled' || s === 'void';
  });

  const totalOrders = valid.length;
  const totalRevenue = valid.reduce((s, o) => s + (_get(o, 'total') || 0), 0);
  const totalDiscount = valid.reduce((s, o) => s + (_get(o, 'promo_discount') || 0), 0);
  const totalTax = valid.reduce((s, o) => s + (_get(o, 'tax') || 0), 0);
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  // By payment
  const byPayment = {};
  valid.forEach(o => {
    const pay = (_get(o, 'pay') || 'UNKNOWN').toUpperCase();
    if (!byPayment[pay]) byPayment[pay] = { count: 0, total: 0 };
    byPayment[pay].count += 1;
    byPayment[pay].total += (_get(o, 'total') || 0);
  });

  // By kasir
  const byKasir = {};
  valid.forEach(o => {
    const k = _get(o, 'kasir') || 'Unknown';
    if (!byKasir[k]) byKasir[k] = { count: 0, total: 0 };
    byKasir[k].count += 1;
    byKasir[k].total += (_get(o, 'total') || 0);
  });

  // By type
  const byType = {};
  valid.forEach(o => {
    const t = _get(o, 'type') || 'unknown';
    if (!byType[t]) byType[t] = { count: 0, total: 0 };
    byType[t].count += 1;
    byType[t].total += (_get(o, 'total') || 0);
  });

  // Top items (items may be array OR JSON string)
  const itemStats = {};
  valid.forEach(o => {
    let items = _get(o, 'items');
    try {
      if (typeof items === 'string') items = JSON.parse(items);
    } catch (e) { items = []; }
    if (!Array.isArray(items)) return;
    items.forEach(it => {
      const id = it.id || it.menuId;
      const name = it.n || it.name || 'Unknown';
      const qty = it.q || it.qty || 1;
      const price = it.p || it.price || 0;
      const key = `${id}_${name}`;
      if (!itemStats[key]) {
        itemStats[key] = { id, name, qty: 0, revenue: 0 };
      }
      itemStats[key].qty += qty;
      itemStats[key].revenue += price * qty;
    });
  });
  const topItems = Object.values(itemStats)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  // Orders by hour
  const hourMap = {};
  valid.forEach(o => {
    const d = new Date(_get(o, 'time'));
    const hour = d.getHours();
    hourMap[hour] = (hourMap[hour] || 0) + 1;
  });
  const ordersByHour = Object.keys(hourMap)
    .map(h => ({ hour: parseInt(h), count: hourMap[h] }))
    .sort((a, b) => a.hour - b.hour);

  // Promos
  const promoMap = {};
  valid.forEach(o => {
    const code = _get(o, 'promo_code');
    if (!code) return;
    if (!promoMap[code]) promoMap[code] = { code, count: 0, totalDiscount: 0 };
    promoMap[code].count += 1;
    promoMap[code].totalDiscount += (_get(o, 'promo_discount') || 0);
  });
  const promosUsed = Object.values(promoMap).sort((a, b) => b.count - a.count);

  // Member vs guest
  const memberOrders = valid.filter(o => _get(o, 'customer_id')).length;
  const guestOrders = valid.filter(o => !_get(o, 'customer_id')).length;

  // Loyalty (1 pt per 1000)
  const loyaltyEarned = valid
    .filter(o => _get(o, 'customer_id'))
    .reduce((s, o) => s + Math.floor((_get(o, 'total') || 0) / 1000), 0);

  // Cash drawer
  const cashSales = (byPayment.CASH?.total || 0);
  const expectedCash = openingCash + cashSales;
  const variance = (closingCash !== null && closingCash !== undefined)
    ? closingCash - expectedCash : null;

  return {
    shift: {
      id: _get(shift, 'id'),
      openedAt: start,
      openedBy: _get(shift, 'opened_by'),
      closedAt,
      status: closedAt ? 'closed' : 'active',
      durationMinutes: Math.round((end - start) / 60000)
    },
    summary: {
      totalOrders,
      cancelledOrders: cancelled.length,
      totalRevenue,
      totalDiscount,
      totalTax,
      netRevenue: totalRevenue - totalDiscount,
      avgOrderValue
    },
    byPayment,
    byKasir,
    byType,
    topItems,
    ordersByHour,
    promosUsed,
    memberOrders,
    guestOrders,
    loyaltyEarned,
    cashDrawer: {
      startingCash: openingCash,
      cashSales,
      expectedCash,
      actualCash: closingCash || null,
      variance
    },
    generatedAt: Date.now()
  };
}

// GET active shift report
app.get("/api/shifts/active/report", (req, res) => {
  try {
    const shift = shifts.find(s => !_get(s, 'closed_at'));
    if (!shift) return res.status(404).json({ error: "No active shift" });
    res.json(buildShiftReportV2(shift));
  } catch (e) {
    console.error("Active shift report error:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET specific shift report
app.get("/api/shifts/:id/report", (req, res) => {
  try {
    const shift = shifts.find(s => _get(s, 'id') === req.params.id);
    if (!shift) return res.status(404).json({ error: "Shift not found" });
    res.json(buildShiftReportV2(shift));
  } catch (e) {
    console.error("Shift report error:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET shift history with mini summary
app.get("/api/shifts/history", (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const sorted = [...shifts]
      .sort((a, b) => (_get(b, 'opened_at') || 0) - (_get(a, 'opened_at') || 0))
      .slice(0, limit);

    const list = sorted.map(s => {
      const start = _get(s, 'opened_at');
      const closedAt = _get(s, 'closed_at');
      const end = closedAt || Date.now();
      const inRange = orders.filter(o => {
        const t = _get(o, 'time');
        return t >= start && t <= end;
      });
      const valid = inRange.filter(o => {
        const st = _get(o, 'status');
        return st !== 'cancelled' && st !== 'void';
      });
      return {
        id: _get(s, 'id'),
        openedAt: start,
        openedBy: _get(s, 'opened_by'),
        closedAt,
        status: closedAt ? 'closed' : 'active',
        openingCash: _get(s, 'opening_cash') || 0,
        closingCash: _get(s, 'closing_cash'),
        totalOrders: valid.length,
        totalRevenue: valid.reduce((sum, o) => sum + (_get(o, 'total') || 0), 0),
        durationMinutes: Math.round((end - start) / 60000)
      };
    });

    res.json(list);
  } catch (e) {
    console.error("Shift history error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST close shift with closing cash
app.post("/api/shifts/:id/close-with-report", (req, res) => {
  try {
    const { closingCash } = req.body;
    if (closingCash === undefined || closingCash === null) {
      return res.status(400).json({ error: "closingCash required" });
    }

    const shift = shifts.find(s => _get(s, 'id') === req.params.id);
    if (!shift) return res.status(404).json({ error: "Shift not found" });
    if (_get(shift, 'closed_at')) return res.status(400).json({ error: "Shift already closed" });

    const closedAt = Date.now();
    // Update in-memory
    shift.closed_at = closedAt;
    shift.closing_cash = closingCash;

    const report = buildShiftReportV2(shift);
    shift.sales = JSON.stringify(report.summary);

    // Persist via db wrapper if available
    try {
      if (db && typeof db.saveShift === 'function') {
        db.saveShift(shift);
      } else if (db && typeof db.updateShift === 'function') {
        db.updateShift(shift);
      }
    } catch (saveErr) {
      console.warn("Persistence warning:", saveErr.message);
    }

    res.json({ ok: true, closedAt, report });
  } catch (e) {
    console.error("Close shift error:", e);
    res.status(500).json({ error: e.message });
  }
});


// ═══════════════════════════════════════════════════════════
// CANCEL/REFUND ENDPOINTS
// ═══════════════════════════════════════════════════════════

// Broadcast helper (reuse existing WS infrastructure)
function _broadcast(event, data) {
  try {
    if (typeof wss !== 'undefined' && wss && wss.clients) {
      const msg = JSON.stringify({ event, data });
      wss.clients.forEach(c => {
        try { if (c.readyState === 1) c.send(msg); } catch (e) {}
      });
    }
  } catch (e) {
    console.warn("Broadcast warning:", e.message);
  }
}

// Persist using specific db.js methods
function _persistCancel(order) {
  try {
    if (db && typeof db.updateOrderCancel === 'function') {
      db.updateOrderCancel(order.id, order.cancelledAt, order.cancelReason, order.cancelledBy);
    } else {
      console.warn("db.updateOrderCancel not available");
    }
  } catch (e) {
    console.warn("Persist cancel warning:", e.message);
  }
}

function _persistRefund(order) {
  try {
    if (db && typeof db.updateOrderRefund === 'function') {
      db.updateOrderRefund(order.id, order.status, order.refundedAmount, order.refundedAt, order.refundedBy, order.refundReason);
    } else {
      console.warn("db.updateOrderRefund not available");
    }
  } catch (e) {
    console.warn("Persist refund warning:", e.message);
  }
}

// POST cancel order
// body: { reason, cancelledBy }
app.post("/api/orders/:id/cancel", (req, res) => {
  try {
    const { reason, cancelledBy, managerPin } = req.body || {};

    // ── AUDIT: Reason wajib ──
    if (!reason || reason.trim().length < 3) {
      return res.status(400).json({ error: "Alasan cancel wajib diisi (min 3 karakter)" });
    }

    // ── AUDIT: Manager PIN wajib ──
    let managerName = "Unknown";
    try {
      const { getDb } = require("./command-center-backend");
      const mgr = getDb().prepare("SELECT id, name FROM admin_users WHERE pin = ? AND role = 'manager'").get(managerPin);
      if (!mgr) return res.status(403).json({ error: "PIN Manager wajib & harus valid untuk cancel order" });
      managerName = mgr.name;
    } catch(e) {
      // Fallback if audit module not loaded — still require reason
      console.warn("[Audit] PIN verify fallback:", e.message);
    }

    const order = orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (order.status === "cancelled" || order.status === "void") {
      return res.status(400).json({ error: "Order already cancelled" });
    }
    if (order.status === "refunded") {
      return res.status(400).json({ error: "Order already refunded — cannot cancel" });
    }

    const now = Date.now();
    order._prevStatus = order.status; // preserve for audit
    order.status = "cancelled";
    order.cancelledAt = now;
    order.cancelReason = reason.trim();
    order.cancelledBy = cancelledBy || "Unknown";
    order.cancelApprovedBy = managerName;

    _persistCancel(order);

    // Broadcast with previousStatus for PHANTOM_CUP + CANCEL_PROD detection
    const previousStatus = order._prevStatus || "unknown";
    broadcast("pos:void", {
      orderId: order.id,
      cancelledAt: now,
      reason: order.cancelReason,
      by: order.cancelledBy,
      approvedBy: managerName,
      previousStatus: previousStatus,
      amount: order.total || 0,
      cashierId: order.kasir,
      cashierName: cancelledBy,
      items: order.items,
    });
    // Also keep legacy event
    _broadcast("order:cancelled", {
      orderId: order.id,
      cancelledAt: now,
      reason: order.cancelReason,
      by: order.cancelledBy
    });

    // Refund/Cancel anomaly tracking → pos_events + audit_anomalies
    Promise.resolve(global.processRefundCancel?.({
      type: 'cancel',
      order_ref: order.id,
      amount: order.total,
      kasir: order.cancelledBy,
      manager_id: order.cancelApprovedBy,
      reason: order.cancelReason,
      items: order.items,
      original_sale_at: order.time ? Math.floor(order.time / 1000) : null,
    })).catch(() => {});

    res.json({ ok: true, order });
  } catch (e) {
    console.error("Cancel error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST refund order
// body: { amount, reason, refundedBy, fullRefund? }
app.post("/api/orders/:id/refund", (req, res) => {
  try {
    const { amount, reason, refundedBy, fullRefund, managerPin } = req.body || {};

    // ── AUDIT: Reason wajib ──
    if (!reason || reason.trim().length < 3) {
      return res.status(400).json({ error: "Alasan refund wajib diisi (min 3 karakter)" });
    }

    // ── AUDIT: Manager PIN wajib ──
    let refundManagerName = "Unknown";
    try {
      const { getDb } = require("./command-center-backend");
      const mgr = getDb().prepare("SELECT id, name FROM admin_users WHERE pin = ? AND role = 'manager'").get(managerPin);
      if (!mgr) return res.status(403).json({ error: "PIN Manager wajib & harus valid untuk refund" });
      refundManagerName = mgr.name;
    } catch(e) {
      console.warn("[Audit] PIN verify fallback:", e.message);
    }

    const order = orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (order.status === "cancelled" || order.status === "void") {
      return res.status(400).json({ error: "Order is cancelled — cannot refund" });
    }
    if (order.status === "refunded" && !fullRefund) {
      return res.status(400).json({ error: "Order already fully refunded" });
    }

    const orderTotal = order.total || 0;
    const alreadyRefunded = order.refundedAmount || 0;
    const maxRefundable = orderTotal - alreadyRefunded;

    let refundAmount;
    if (fullRefund) {
      refundAmount = maxRefundable;
    } else {
      refundAmount = parseInt(amount);
      if (isNaN(refundAmount) || refundAmount <= 0) {
        return res.status(400).json({ error: "Invalid refund amount" });
      }
      if (refundAmount > maxRefundable) {
        return res.status(400).json({
          error: `Refund amount exceeds refundable (max: ${maxRefundable})`,
          maxRefundable
        });
      }
    }

    const now = Date.now();
    order.refundedAmount = alreadyRefunded + refundAmount;
    order.refundedAt = now;
    order.refundedBy = refundedBy || "Unknown";
    order.refundReason = reason || "No reason provided";

    // Mark fully refunded
    if (order.refundedAmount >= orderTotal) {
      order.status = "refunded";
    } else {
      order.status = "partial_refund";
    }

    _persistRefund(order);

    _broadcast("order:refunded", {
      orderId: order.id,
      refundedAmount: refundAmount,
      totalRefunded: order.refundedAmount,
      status: order.status,
      reason: order.refundReason,
      by: order.refundedBy
    });

    // Refund/Cancel anomaly tracking → pos_events + audit_anomalies
    Promise.resolve(global.processRefundCancel?.({
      type: 'refund',
      order_ref: order.id,
      amount: refundAmount,
      kasir: order.refundedBy,
      manager_id: refundManagerName,
      reason: order.refundReason,
      items: order.items,
      original_sale_at: order.time ? Math.floor(order.time / 1000) : null,
    })).catch(() => {});

    res.json({
      ok: true,
      order,
      refundAmount,
      totalRefunded: order.refundedAmount,
      remaining: orderTotal - order.refundedAmount
    });
  } catch (e) {
    console.error("Refund error:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET orders with refund/cancel filter
app.get("/api/order-audit", (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const filtered = orders
      .filter(o => o.status === "cancelled" || o.status === "refunded" || o.status === "partial_refund")
      .sort((a, b) => (b.cancelledAt || b.refundedAt || 0) - (a.cancelledAt || a.refundedAt || 0))
      .slice(0, limit)
      .map(o => ({
        id: o.id,
        time: o.time,
        status: o.status,
        total: o.total,
        kasir: o.kasir,
        customer_name: o.customer_name,
        cancelledAt: o.cancelledAt,
        cancelledBy: o.cancelledBy,
        cancelReason: o.cancelReason,
        refundedAt: o.refundedAt,
        refundedBy: o.refundedBy,
        refundReason: o.refundReason,
        refundedAmount: o.refundedAmount || 0
      }));
    res.json(filtered);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ═══════════════════════════════════════════════════════════
// PATCH ORDER ITEMS (for adding/updating items in tab_open order)
// ═══════════════════════════════════════════════════════════
app.patch("/api/orders/:id/items", (req, res) => {
  try {
    const order = orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status !== "tab_open") {
      return res.status(400).json({ error: "Only tab_open orders can be updated (current: " + order.status + ")" });
    }

    const { items, subtotal, tax, total } = req.body || {};
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "items array required" });
    }

    // Update in-memory
    order.items = items;
    if (subtotal !== undefined) order.subtotal = subtotal;
    if (tax !== undefined) order.tax = tax;
    if (total !== undefined) order.total = total;

    // Persist
    try {
      if (db && typeof db.updateOrderItems === 'function') {
        db.updateOrderItems(order.id, items, subtotal, tax, total);
      } else {
        console.warn("db.updateOrderItems not available");
      }
    } catch (e) {
      console.warn("Persist items warning:", e.message);
    }

    // Broadcast
    try {
      if (typeof wss !== 'undefined' && wss && wss.clients) {
        const msg = JSON.stringify({
          event: "order:items_updated",
          data: { orderId: order.id, items, subtotal, tax, total }
        });
        wss.clients.forEach(c => {
          try { if (c.readyState === 1) c.send(msg); } catch (e) {}
        });
      }
    } catch (e) {}

    res.json({ ok: true, order });
  } catch (e) {
    console.error("PATCH items error:", e);
    res.status(500).json({ error: e.message });
  }
});


// ═══════════════════════════════════════════════════════════
// MERGE TABS ENDPOINT
// Combines multiple tab_open orders into one target tab
// ═══════════════════════════════════════════════════════════
app.post("/api/orders/merge", (req, res) => {
  try {
    const { sourceIds, targetId, mergedBy } = req.body || {};

    if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
      return res.status(400).json({ error: "sourceIds array required" });
    }
    if (!targetId) {
      return res.status(400).json({ error: "targetId required" });
    }
    if (sourceIds.includes(targetId)) {
      return res.status(400).json({ error: "Target cannot be in sources" });
    }

    // Find target
    const target = orders.find(o => o.id === targetId);
    if (!target) return res.status(404).json({ error: "Target order not found" });
    if (target.status !== "tab_open") {
      return res.status(400).json({ error: "Target must be tab_open (current: " + target.status + ")" });
    }

    // Find all sources
    const sources = [];
    for (const sid of sourceIds) {
      const s = orders.find(o => o.id === sid);
      if (!s) return res.status(404).json({ error: "Source not found: " + sid });
      if (s.status !== "tab_open") {
        return res.status(400).json({ error: `Source ${sid} must be tab_open (current: ${s.status})` });
      }
      sources.push(s);
    }

    // Merge: combine items, recompute totals
    const mergedItems = [...(target.items || [])];
    let mergedSubtotal = target.subtotal || 0;

    for (const s of sources) {
      mergedItems.push(...(s.items || []));
      mergedSubtotal += (s.subtotal || s.total || 0);
    }

    // Update target in memory
    target.items = mergedItems;
    target.subtotal = mergedSubtotal;
    target.total = mergedSubtotal;
    target.tax = Math.round(mergedSubtotal * 0.1 / 1.1);

    // Persist target
    try {
      if (db && typeof db.updateOrderItems === 'function') {
        db.updateOrderItems(target.id, target.items, target.subtotal, target.tax, target.total);
      }
    } catch (e) {
      console.warn("Persist merge target:", e.message);
    }

    // Cancel each source with audit
    const now = Date.now();
    const cancelledSources = [];
    for (const s of sources) {
      s.status = "cancelled";
      s.cancelledAt = now;
      s.cancelReason = `Merged into ${targetId}`;
      s.cancelledBy = mergedBy || "Unknown";

      try {
        if (db && typeof db.updateOrderCancel === 'function') {
          db.updateOrderCancel(s.id, now, s.cancelReason, s.cancelledBy);
        }
      } catch (e) {
        console.warn("Persist merge cancel:", e.message);
      }

      cancelledSources.push(s.id);
    }

    // Broadcast
    try {
      if (typeof wss !== 'undefined' && wss && wss.clients) {
        const msg = JSON.stringify({
          event: "tabs:merged",
          data: { sourceIds: cancelledSources, targetId, mergedItems: mergedItems.length, total: mergedSubtotal }
        });
        wss.clients.forEach(c => {
          try { if (c.readyState === 1) c.send(msg); } catch (e) {}
        });
      }
    } catch (e) {}

    res.json({
      ok: true,
      target: target,
      mergedSources: cancelledSources,
      itemCount: mergedItems.length,
      total: mergedSubtotal
    });
  } catch (e) {
    console.error("Merge error:", e);
    res.status(500).json({ error: e.message });
  }
});


// ═══════════════════════════════════════════════════════════
// SPLIT SETTLE - close tab_open with multiple payments
// ═══════════════════════════════════════════════════════════
app.post("/api/orders/:id/split-settle", (req, res) => {
  try {
    const { payments } = req.body || {};

    if (!Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({ error: "payments array required" });
    }

    const order = orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status !== "tab_open" && order.status !== "waiting") {
      return res.status(400).json({ error: "Order must be tab_open or waiting (current: " + order.status + ")" });
    }

    // Validate total
    const total = order.total || 0;
    const sumPayments = payments.reduce((s, p) => s + (parseInt(p.amount) || 0), 0);
    if (sumPayments < total) {
      return res.status(400).json({
        error: `Payments sum (${sumPayments}) below order total (${total})`,
        shortfall: total - sumPayments
      });
    }

    // Build pay string for backward compat (CASH or QRIS or SPLIT)
    const methods = [...new Set(payments.map(p => p.method))];
    const payField = methods.length === 1 ? methods[0] : "SPLIT";

    // Stamp time on each payment
    const now = Date.now();
    const stamped = payments.map(p => ({
      ...p,
      at: p.at || now,
    }));

    // Update in-memory
    order.status = "completed";
    order.pay = payField;
    order.payments = stamped;

    // Persist
    try {
      if (db && typeof db.updateOrderPayments === 'function') {
        db.updateOrderPayments(order.id, "completed", payField, stamped);
      }
    } catch (e) {
      console.warn("Persist split-settle:", e.message);
    }

    // Free up table if dine-in
    if (order.type === "dine" && order.table && order.table !== "-") {
      fetch(`http://localhost:${PORT || 3011}/api/tables/${order.table}`, {
        method: "PATCH",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({status: "available"})
      }).catch(() => {});
    }

    // Broadcast
    try {
      if (typeof wss !== 'undefined' && wss && wss.clients) {
        const msg = JSON.stringify({
          event: "order:split_settled",
          data: { orderId: order.id, payments: stamped, pay: payField }
        });
        wss.clients.forEach(c => {
          try { if (c.readyState === 1) c.send(msg); } catch (e) {}
        });
      }
    } catch (e) {}

    res.json({ ok: true, order, total, paid: sumPayments });
  } catch (e) {
    console.error("Split settle error:", e);
    res.status(500).json({ error: e.message });
  }
});


// ─── AUDIT AUTH MIDDLEWARE ───────────────────────────────
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ error: "Unauthorized — admin login required" });
  }
  req.adminUser = adminSessions.get(token);
  next();
}

function requireManager(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ error: "Unauthorized — admin login required" });
  }
  const session = adminSessions.get(token);
  if (session.role !== "manager") {
    return res.status(403).json({ error: "Forbidden — manager role required" });
  }
  req.adminUser = session;
  next();
}

// Apply auth to all /api/audit/* routes
app.use("/api/audit", requireAdmin);

// ─── COMMAND CENTER AUDIT MODULE ───────────────────────
const { initAuditModule, registerAuditEndpoints, auditEngine } = require("./command-center-backend");
initAuditModule(db);
registerAuditEndpoints(app, db);
console.log("📊 Command Center audit module loaded");

// ════════════════════════════════════════════════════════════
// BITES-KIOSK WAVE 1+2+3 INTEGRATION  (installed 2026-05-20)
// `path`/`app`/`db` already declared above. DB_PATH points at the
// shared server/data.db so bridge + finance see existing data.
// ════════════════════════════════════════════════════════════
const { setupMasterItems }      = require('./master-items-backend');
const { setupPhase4B }          = require('./pos-phase4b-backend');
const { setupMenuBuilder }      = require('./master-menu-builder-backend');
const { setupProcurementGaps }  = require('./procurement-gaps-backend');
const { setupFinance }          = require('./finance-backend');
const { setupBridge }           = require('./procurement-finance-bridge');
const { setupNotifications }    = require('./notifications-backend');
const { setupProcurement }      = require('./procurement-backend');
const { setupShiftStaff }       = require('./shift-staff-backend');
const { setupKDS }              = require('./kds-backend');
const { setupRefundCancel }     = require('./refund-cancel-backend');
const { setupAggregator }       = require('./aggregator-backend');
const { setupPaymentGateway }   = require('./payment-gateway-backend');
const { setupLoyalty }          = require('./loyalty-backend');
const { setupFeedback }         = require('./feedback-backend');
const { setupCashierKpi }       = require('./cashier-kpi-backend');
const { setupChecklist }        = require('./checklist-backend');
const { setupPosBehavior }      = require('./pos-behavior-backend');
const { setupExecutive }        = require('./executive-backend');
const { setupSections }         = require('./sections-backend');
const { setupHris }             = require('./hris-backend');
const { setupTalenta }          = require('./talenta-backend');
const { setupPromoInsight }     = require('./promo-insight-backend');
const { setupLeaderboard }      = require('./leaderboard-backend');
const { setupBroadcast }        = require('./broadcast-backend');
const { setupOutlets }          = require('./outlets-backend');
const { setupEngagement }       = require('./engagement-backend');
const { setupAnalytics }        = require('./analytics-backend');
const { setupPriceList }        = require('./price-list-backend');
const { setupGoodsDelivery }    = require('./goods-delivery-backend');
const { setupPurchaseInvoice }  = require('./purchase-invoice-backend');
const { setupSettlement }       = require('./settlement-backend');
const { setupJournal }          = require('./journal-backend');
const { setupFinancialStatements } = require('./financial-statements-backend');
const { setupFinanceCenter }    = require('./finance-center-backend');
const { setupFinanceAlerts }    = require('./finance-alert-backend');
const { setupAR }               = require('./ar-backend');
const { setupBudget }           = require('./budget-backend');
const { setupPayroll }          = require('./payroll-backend');
const { setupFranchise }        = require('./franchise-backend');
const { setupFoodCost }         = require('./food-cost-backend');
const { setupConvenienceFee }   = require('./convenience-fee-backend');
const { setupRewards }          = require('./reward-backend');
const { setupRewardBenefits }   = require('./reward-benefit-backend');
const { setupMotivation }       = require('./motivation-backend');
const { setupHRCommand }        = require('./hr-command-backend');
const { setupAntiFraud }        = require('./anti-fraud-backend');
const { setupCustomerIntel }    = require('./customer-intel-backend');
const { setupMarketingBehavior } = require('./marketing-behavior-backend');
const { setupLoyaltyPromo }     = require('./loyalty-promo-backend');
const { setupFeedbackSegment }  = require('./feedback-segment-backend');
const { setupClvChurn }         = require('./clv-churn-backend');
const { setupGeoEngagement }    = require('./geo-engagement-backend');
const { setupCampaignImpact }   = require('./campaign-impact-backend');

const DB_PATH = require('path').join(__dirname, 'data.db');   // shared with db.js

const procurement     = setupProcurement(app,     { dbPath: DB_PATH, mountPath: '/api/procurement' });
const masterItems     = setupMasterItems(app,     { dbPath: DB_PATH, mountPath: '/api/master' });
const phase4b         = setupPhase4B(app,         { dbPath: DB_PATH, mountPath: '/api/pos' });
const menuBuilder     = setupMenuBuilder(app,     { dbPath: DB_PATH, mountPath: '/api/master' });
const procurementGaps = setupProcurementGaps(app, { dbPath: DB_PATH, mountPath: '/api/procurement' });
const finance         = setupFinance(app,         { dbPath: DB_PATH, mountPath: '/api/finance' });
const bridge          = setupBridge(app,          { dbPath: DB_PATH, mountPath: '/api/bridge' });
const notifications   = setupNotifications(app, {
  dbPath: DB_PATH,
  mountPath: '/api/notifications',
  scheduler: {
    low_stock_interval_ms: 5 * 60 * 1000,
    anomaly_interval_ms: 60 * 1000,
    aging_hour: 9,
    summary_hour: 21
  }
});

const shiftStaff = setupShiftStaff(app, { dbPath: DB_PATH });
const kds = setupKDS(app, { dbPath: DB_PATH });
const refundCancel = setupRefundCancel(app, { dbPath: DB_PATH });
const aggregator = setupAggregator(app, { dbPath: DB_PATH });
const paymentGateway = setupPaymentGateway(app, { dbPath: DB_PATH });
const loyaltyMod = setupLoyalty(app, { dbPath: DB_PATH });
const feedback = setupFeedback(app, { dbPath: DB_PATH });
const cashierKpi = setupCashierKpi(app, { dbPath: DB_PATH });
const checklist = setupChecklist(app, { dbPath: DB_PATH });
const posBehavior = setupPosBehavior(app, { dbPath: DB_PATH });
const executive = setupExecutive(app, { dbPath: DB_PATH });
const sections = setupSections(app, { dbPath: DB_PATH });
const hris = setupHris(app, { dbPath: DB_PATH });
const talenta = setupTalenta(app, { dbPath: DB_PATH });
const promoInsight = setupPromoInsight(app, { dbPath: DB_PATH });
const leaderboard = setupLeaderboard(app, { dbPath: DB_PATH });
const promoBroadcast = setupBroadcast(app, { dbPath: DB_PATH });
const outletsMod = setupOutlets(app, { dbPath: DB_PATH });
const engagement = setupEngagement(app, { dbPath: DB_PATH });
const analytics = setupAnalytics(app, { dbPath: DB_PATH });
const priceList = setupPriceList(app, { dbPath: DB_PATH });
const goodsDelivery = setupGoodsDelivery(app, { dbPath: DB_PATH });
const purchaseInvoice = setupPurchaseInvoice(app, { dbPath: DB_PATH });
const settlement = setupSettlement(app, { dbPath: DB_PATH });
const journal = setupJournal(app, { dbPath: DB_PATH });
const finStatements = setupFinancialStatements(app, { dbPath: DB_PATH });
const financeCenter = setupFinanceCenter(app, { dbPath: DB_PATH });
const financeAlerts = setupFinanceAlerts(app, { dbPath: DB_PATH });
const ar = setupAR(app, { dbPath: DB_PATH });
const budget = setupBudget(app, { dbPath: DB_PATH });
const payroll = setupPayroll(app, { dbPath: DB_PATH });
const franchise = setupFranchise(app, { dbPath: DB_PATH });
const foodCost = setupFoodCost(app, { dbPath: DB_PATH });
const convenienceFee = setupConvenienceFee(app, { dbPath: DB_PATH });
const rewards = setupRewards(app, { dbPath: DB_PATH });
const rewardBenefits = setupRewardBenefits(app, { dbPath: DB_PATH });
const motivation = setupMotivation(app, { dbPath: DB_PATH });
const hrCommand = setupHRCommand(app, { dbPath: DB_PATH });
const antiFraud = setupAntiFraud(app, { dbPath: DB_PATH });
const customerIntel = setupCustomerIntel(app, { dbPath: DB_PATH });
const marketingBehavior = setupMarketingBehavior(app, { dbPath: DB_PATH });
const loyaltyPromo = setupLoyaltyPromo(app, { dbPath: DB_PATH });
const feedbackSegment = setupFeedbackSegment(app, { dbPath: DB_PATH });
const clvChurn = setupClvChurn(app, { dbPath: DB_PATH });
const geoEngagement = setupGeoEngagement(app, { dbPath: DB_PATH });
const campaignImpact = setupCampaignImpact(app, { dbPath: DB_PATH });

global.consumeStockForOrder  = menuBuilder.consumeStockForOrderV2;
global.logPosEvent           = phase4b.logPosEvent;
global.getConfig             = phase4b.getConfig;
global.onGoodsReceived       = bridge.onGoodsReceived;
global.onPaymentRecorded     = bridge.onPaymentRecorded;
global.dispatchNotification  = notifications.dispatch;
global.createExpense         = finance.createExpense;
global.createKitchenTickets  = kds.createTicketsForOrder;
// Sinkron status order pas KDS majuin ticket → customer tracking (kiosk/QR) live
global.updateOrderStatusFromKds = (orderRef, status) => {
  const idx = orders.findIndex(o => o.id === orderRef);
  if (idx === -1) return;
  orders[idx] = { ...orders[idx], status, updatedAt: Date.now() };
  try { db.updateOrderStatus(orderRef, status); } catch (e) {}
};
global.processRefundCancel   = refundCancel.processEvent;
global.persistAggregatorOrder = aggregator.persistOrder;
global.loyaltyEarn           = loyaltyMod.earn;
global.loyaltyRedeem         = loyaltyMod.redeem;

console.log('━━━ Bites-Kiosk Wave 1+2+3 — semua module loaded ━━━');
// ════════════════════════════════════════════════════════════

server.listen(PORT, () => {
  console.log("");
  console.log("🍽️  BINTORO BACKEND");
  console.log("─────────────────────────────");
  console.log(`🚀 REST API  : http://localhost:${PORT}/api`);
  console.log(`🔌 WebSocket : ws://localhost:${PORT}`);
  console.log(`❤️  Health   : http://localhost:${PORT}/api/health`);
  console.log("─────────────────────────────");
  console.log("");
});
