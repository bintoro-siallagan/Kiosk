// server/aggregator-backend.js
// Delivery Aggregator Integration — GoFood, GrabFood, ShopeeFood, Traveloka Eats.
//
// Capabilities:
//   - Webhook receivers per provider (signed payload verification optional)
//   - Manual entry mode (kasir input order saat API down / belum integrated)
//   - Order normalizer (common shape regardless of source aggregator)
//   - Auto-create KDS ticket pada order incoming (bypass POS customer flow)
//   - Commission tracking (gross / commission / net per provider)
//   - Menu sync log (track push items ke aggregator)
//   - 86 broadcast (sync item out-of-stock ke semua aggregator)
//   - Reconciliation report (daily/weekly per provider)
//
// Endpoints di /api/aggregator/*:
//   POST /webhook/:provider     — incoming order dari aggregator
//   POST /manual                — kasir input order manual
//   POST /simulate              — bikin order tiruan buat test flow
//   POST /:id/accept            — accept order, create KDS ticket
//   POST /:id/reject            — reject order (out-of-stock / closing)
//   POST /:id/ready             — mark ready, notify driver
//   POST /:id/completed         — driver picked up
//   GET  /orders                — list orders dengan filter
//   GET  /reconcile             — summary per provider per period
//   GET  /providers             — list provider dengan commission rate
//   PUT  /providers/:code       — update commission rate, toggle aktif
//   POST /sync-86               — push 86 status ke aggregator (placeholder buat real API)

const express = require('express');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const path = require('path');
const { toCsv } = require('./csv-util');

const DEFAULT_DB = path.join(__dirname, '..', 'data', 'kiosk.db');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS aggregator_providers (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  commission_rate REAL DEFAULT 0.20,
  webhook_secret TEXT,
  api_key TEXT,
  api_endpoint TEXT,
  merchant_id TEXT,
  is_active INTEGER DEFAULT 1,
  prep_buffer_minutes INTEGER DEFAULT 5,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS aggregator_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no TEXT UNIQUE NOT NULL,
  provider_code TEXT NOT NULL,
  external_order_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','preparing','ready','picked_up','completed','rejected','cancelled')),
  customer_name TEXT,
  customer_phone TEXT,
  delivery_address TEXT,
  driver_name TEXT,
  driver_phone TEXT,
  items TEXT NOT NULL,
  gross_amount REAL DEFAULT 0,
  commission_amount REAL DEFAULT 0,
  net_amount REAL DEFAULT 0,
  delivery_fee REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  notes TEXT,
  raw_payload TEXT,
  internal_order_ref TEXT,
  kds_ticket_id INTEGER,
  manual_entry INTEGER DEFAULT 0,
  entered_by TEXT,
  received_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  accepted_at INTEGER,
  ready_at INTEGER,
  picked_up_at INTEGER,
  completed_at INTEGER,
  rejected_at INTEGER,
  rejection_reason TEXT,
  FOREIGN KEY (provider_code) REFERENCES aggregator_providers(code)
);
CREATE INDEX IF NOT EXISTS idx_agg_provider ON aggregator_orders(provider_code);
CREATE INDEX IF NOT EXISTS idx_agg_status ON aggregator_orders(status);
CREATE INDEX IF NOT EXISTS idx_agg_received ON aggregator_orders(received_at);
CREATE INDEX IF NOT EXISTS idx_agg_external ON aggregator_orders(external_order_id);

CREATE TABLE IF NOT EXISTS aggregator_menu_sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_code TEXT NOT NULL,
  action TEXT NOT NULL,
  menu_id TEXT,
  status TEXT,
  payload TEXT,
  response TEXT,
  error_msg TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_sync_provider ON aggregator_menu_sync_log(provider_code);
CREATE INDEX IF NOT EXISTS idx_sync_created ON aggregator_menu_sync_log(created_at);
`;

const DEFAULT_PROVIDERS = [
  { code: 'gofood', name: 'GoFood', commission_rate: 0.20, prep_buffer_minutes: 5 },
  { code: 'grabfood', name: 'GrabFood', commission_rate: 0.20, prep_buffer_minutes: 5 },
  { code: 'shopeefood', name: 'ShopeeFood', commission_rate: 0.18, prep_buffer_minutes: 5 },
  { code: 'traveloka', name: 'Traveloka Eats', commission_rate: 0.15, prep_buffer_minutes: 5 },
];

function nowSec() { return Math.floor(Date.now() / 1000); }
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
function nextDocNo(db) {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const last = db.prepare(`SELECT doc_no FROM aggregator_orders WHERE doc_no LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(`AGG-${ym}-%`);
  let seq = 1;
  if (last) seq = parseInt(last.doc_no.split('-').pop(), 10) + 1;
  return `AGG-${ym}-${String(seq).padStart(5, '0')}`;
}

// ============================================================
// PROVIDER ADAPTERS — normalize incoming payload ke common shape
// Per real-world API, each provider beda struktur. Adapter ini abstract-nya.
// ============================================================
const ADAPTERS = {
  gofood: (payload) => ({
    external_order_id: payload.order_id || payload.id,
    customer_name: payload.customer?.name || payload.customer_name,
    customer_phone: payload.customer?.phone || payload.customer_phone,
    delivery_address: payload.delivery?.address || payload.address,
    driver_name: payload.driver?.name,
    driver_phone: payload.driver?.phone,
    items: (payload.items || []).map(i => ({
      menu_id: i.menu_id || i.item_id, qty: i.quantity || i.qty,
      display_name: i.name, display_price: i.price,
      line_total: (i.price || 0) * (i.quantity || 1),
      notes: i.notes
    })),
    gross_amount: payload.total_amount || payload.gross,
    delivery_fee: payload.delivery_fee || 0,
    discount_amount: payload.discount || 0,
    notes: payload.notes || payload.order_notes
  }),
  grabfood: (payload) => ({
    external_order_id: payload.orderID || payload.order_id,
    customer_name: payload.recipient?.name || payload.customer_name,
    customer_phone: payload.recipient?.phone || payload.customer_phone,
    delivery_address: payload.recipient?.address,
    driver_name: payload.driver?.name,
    driver_phone: payload.driver?.mobileNumber,
    items: (payload.items || []).map(i => ({
      menu_id: i.itemCode || i.sku, qty: i.quantity,
      display_name: i.name, display_price: i.unitPrice,
      line_total: i.unitPrice * i.quantity,
      notes: i.comment
    })),
    gross_amount: payload.totalAmount,
    delivery_fee: payload.deliveryFee || 0,
    discount_amount: payload.totalDiscount || 0,
    notes: payload.orderComment
  }),
  shopeefood: (payload) => ({
    external_order_id: payload.order_sn,
    customer_name: payload.buyer_user_name,
    customer_phone: payload.buyer_phone,
    delivery_address: payload.delivery_address,
    driver_name: payload.shipper_name,
    driver_phone: payload.shipper_phone,
    items: (payload.order_items || []).map(i => ({
      menu_id: i.item_id, qty: i.amount,
      display_name: i.item_name, display_price: i.original_price,
      line_total: i.subtotal,
      notes: i.note
    })),
    gross_amount: payload.total_amount,
    delivery_fee: payload.shipping_fee || 0,
    discount_amount: payload.discount || 0,
    notes: payload.note
  }),
  traveloka: (payload) => ({
    external_order_id: payload.bookingId,
    customer_name: payload.contact?.name,
    customer_phone: payload.contact?.phone,
    delivery_address: payload.deliveryDetail?.address,
    items: (payload.orderDetails?.items || []).map(i => ({
      menu_id: i.menuId, qty: i.quantity,
      display_name: i.menuName, display_price: i.unitPrice,
      line_total: i.unitPrice * i.quantity
    })),
    gross_amount: payload.totalPrice,
    delivery_fee: payload.deliveryFee || 0,
    notes: payload.remarks
  }),
};

function verifyWebhookSignature(provider, rawBody, signature, secret) {
  if (!secret) return true; // skip if no secret configured
  if (!signature) return false;
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
}

// ============================================================
// SETUP
// ============================================================
function setupAggregator(app, opts = {}) {
  const db = new Database(opts.dbPath || DEFAULT_DB);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);

  // Seed default providers
  const cnt = db.prepare(`SELECT COUNT(*) c FROM aggregator_providers`).get().c;
  if (cnt === 0) {
    const s = db.prepare(`INSERT INTO aggregator_providers (code, name, commission_rate, prep_buffer_minutes) VALUES (?,?,?,?)`);
    for (const p of DEFAULT_PROVIDERS) s.run(p.code, p.name, p.commission_rate, p.prep_buffer_minutes);
  }

  const broadcast = (event, payload) => {
    try { if (typeof global.broadcastPosEvent === 'function') global.broadcastPosEvent(event, payload); } catch {}
  };
  const logEvent = (e) => {
    try { if (typeof global.logPosEvent === 'function') global.logPosEvent(e); } catch {}
  };
  const dispatchNotif = async (n) => {
    try { if (typeof global.dispatchNotification === 'function') await global.dispatchNotification(n); } catch {}
  };

  // ============================================================
  // CORE: persist incoming order + create KDS ticket
  // ============================================================
  function persistOrder(providerCode, normalized, opts = {}) {
    const provider = db.prepare(`SELECT * FROM aggregator_providers WHERE code = ?`).get(providerCode);
    if (!provider) throw new Error(`unknown provider: ${providerCode}`);

    const gross = Number(normalized.gross_amount) || 0;
    const commission = gross * (provider.commission_rate || 0);
    const net = gross - commission;
    const docNo = nextDocNo(db);

    const info = db.prepare(`
      INSERT INTO aggregator_orders (doc_no, provider_code, external_order_id, status,
        customer_name, customer_phone, delivery_address, driver_name, driver_phone,
        items, gross_amount, commission_amount, net_amount, delivery_fee, discount_amount,
        notes, raw_payload, manual_entry, entered_by)
      VALUES (?,?,?,'pending',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(docNo, providerCode, normalized.external_order_id || `manual-${Date.now()}`,
      normalized.customer_name, normalized.customer_phone, normalized.delivery_address,
      normalized.driver_name, normalized.driver_phone,
      JSON.stringify(normalized.items || []),
      gross, commission, net,
      Number(normalized.delivery_fee) || 0, Number(normalized.discount_amount) || 0,
      normalized.notes || null,
      opts.raw_payload ? JSON.stringify(opts.raw_payload) : null,
      opts.manual ? 1 : 0, opts.entered_by || null);

    const orderId = info.lastInsertRowid;

    broadcast('aggregator:order-received', { id: orderId, doc_no: docNo, provider: providerCode, provider_name: provider.name });

    logEvent({
      event_type: 'aggregator_order_received',
      event_subtype: providerCode,
      payload: { doc_no: docNo, provider: providerCode, gross, commission, net, items_count: (normalized.items || []).length, manual: !!opts.manual },
      severity: 'info',
      actor: opts.entered_by || 'aggregator-webhook'
    });

    // Notify owner — incoming order needs accept
    dispatchNotif({
      event_type: 'aggregator_new_order',
      severity: 'info',
      title: `🛵 Order baru ${provider.name} — Rp ${Math.round(gross).toLocaleString('id-ID')}`,
      body: `Doc: ${docNo}\nCustomer: ${normalized.customer_name || '-'}\nItems: ${(normalized.items || []).length}\nGross: Rp ${Math.round(gross).toLocaleString('id-ID')}\nNet (after ${(provider.commission_rate*100).toFixed(0)}% commission): Rp ${Math.round(net).toLocaleString('id-ID')}`,
      payload: { order_id: orderId, doc_no: docNo, provider: providerCode }
    }).catch(() => {});

    return { id: orderId, doc_no: docNo, status: 'pending', gross, commission, net };
  }

  // ============================================================
  // ROUTER
  // ============================================================
  const router = express.Router();

  // Webhook receiver — raw body needed buat signature verify
  router.post('/webhook/:provider', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
    const providerCode = req.params.provider;
    const adapter = ADAPTERS[providerCode];
    if (!adapter) return res.status(400).json({ error: `unsupported provider: ${providerCode}` });

    const provider = db.prepare(`SELECT * FROM aggregator_providers WHERE code = ? AND is_active = 1`).get(providerCode);
    if (!provider) return res.status(404).json({ error: 'provider not active' });

    // Global express.json() parses the body; req.rawBody (verify callback) keeps original bytes for HMAC
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
    const signature = req.headers['x-signature'] || req.headers['x-webhook-signature'] || req.headers['x-gofood-signature'];
    if (!verifyWebhookSignature(providerCode, rawBody, signature, provider.webhook_secret)) {
      logEvent({ event_type: 'aggregator_webhook_invalid_sig', event_subtype: providerCode, severity: 'critical', payload: { signature } });
      return res.status(401).json({ error: 'invalid signature' });
    }

    const payload = Buffer.isBuffer(req.body) ? null : req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'empty or invalid JSON body' });
    }

    let normalized;
    try { normalized = adapter(payload); }
    catch (e) { return res.status(400).json({ error: `adapter error: ${e.message}` }); }

    try {
      const result = persistOrder(providerCode, normalized, { raw_payload: payload });
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Use JSON parser for remaining routes
  router.use(express.json());

  // Manual entry — kasir input order yang diterima via SMS/WA/aggregator app
  router.post('/manual', (req, res) => {
    const { provider, customer_name, customer_phone, items, gross_amount, delivery_fee, notes, entered_by } = req.body || {};
    if (!provider || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'provider + items[] required' });
    }
    const adapter = ADAPTERS[provider];
    if (!adapter) return res.status(400).json({ error: `unsupported provider: ${provider}` });

    try {
      const result = persistOrder(provider, {
        external_order_id: `manual-${nowSec()}`,
        customer_name, customer_phone, items,
        gross_amount: gross_amount || items.reduce((s, i) => s + (i.line_total || (i.display_price * i.qty)), 0),
        delivery_fee, notes
      }, { manual: true, entered_by });
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Simulator — bikin order tiruan buat test flow
  router.post('/simulate', (req, res) => {
    const provider = req.body?.provider || 'gofood';
    const adapter = ADAPTERS[provider];
    if (!adapter) return res.status(400).json({ error: `unsupported provider: ${provider}` });

    const fakeItems = [
      { menu_id: 'froyo-strawberry', qty: 1, display_name: 'Strawberry Froyo', display_price: 28000, line_total: 28000 },
      { menu_id: 'smoothie-mango', qty: 2, display_name: 'Mango Smoothie', display_price: 32000, line_total: 64000 },
    ];
    const gross = fakeItems.reduce((s, i) => s + i.line_total, 0);
    const normalized = {
      external_order_id: `SIM-${nowSec()}`,
      customer_name: `Test Customer ${Math.floor(Math.random()*1000)}`,
      customer_phone: '081234567890',
      delivery_address: 'Jl. Test No. 1, Jakarta',
      items: fakeItems,
      gross_amount: gross,
      delivery_fee: 10000,
      notes: '[SIMULATED] testing order flow'
    };
    const result = persistOrder(provider, normalized, { raw_payload: { simulated: true }, entered_by: 'simulator' });
    res.json({ ok: true, simulated: true, ...result });
  });

  // List orders with filter
  router.get('/orders', (req, res) => {
    const { provider, status, from, to, limit = 50, offset = 0 } = req.query;
    let sql = `SELECT * FROM aggregator_orders WHERE 1=1`;
    const params = [];
    if (provider) { sql += ' AND provider_code = ?'; params.push(provider); }
    if (status) {
      const statuses = status.split(',');
      sql += ` AND status IN (${statuses.map(() => '?').join(',')})`;
      params.push(...statuses);
    }
    if (from) { sql += ' AND received_at >= ?'; params.push(Number(from)); }
    if (to) { sql += ' AND received_at <= ?'; params.push(Number(to)); }
    sql += ' ORDER BY received_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    const rows = db.prepare(sql).all(...params);
    res.json(rows.map(r => ({ ...r, items: safeJson(r.items) || [] })));
  });

  // Get single order
  router.get('/orders/:id', (req, res) => {
    const r = db.prepare(`SELECT * FROM aggregator_orders WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'not found' });
    res.json({ ...r, items: safeJson(r.items) || [], raw_payload: safeJson(r.raw_payload) });
  });

  // Accept order → create KDS ticket
  router.post('/orders/:id/accept', (req, res) => {
    const { actor } = req.body || {};
    const o = db.prepare(`SELECT * FROM aggregator_orders WHERE id = ?`).get(req.params.id);
    if (!o) return res.status(404).json({ error: 'not found' });
    if (o.status !== 'pending') return res.status(409).json({ error: `cannot accept from: ${o.status}` });

    const items = safeJson(o.items) || [];
    let ticketIds = [];

    // Auto-create KDS ticket via global hook (Wave 4)
    if (typeof global.createKitchenTickets === 'function') {
      try {
        const r = global.createKitchenTickets({
          order_ref: o.doc_no,
          items,
          customer_name: `${o.provider_code.toUpperCase()}: ${o.customer_name || 'Customer'}`,
          notes: `[${o.provider_code.toUpperCase()}] ${o.delivery_address || ''} ${o.notes ? ' · ' + o.notes : ''}`.trim(),
          cashier: actor || 'aggregator'
        });
        ticketIds = (r.tickets || []).map(t => t.id);
      } catch (e) { console.warn('[aggregator] failed to create KDS tickets:', e.message); }
    }

    db.prepare(`UPDATE aggregator_orders SET status='accepted', accepted_at=?, kds_ticket_id=? WHERE id=?`)
      .run(nowSec(), ticketIds[0] || null, req.params.id);

    broadcast('aggregator:order-accepted', { id: o.id, doc_no: o.doc_no, ticket_ids: ticketIds });
    logEvent({ event_type: 'aggregator_order_accepted', payload: { doc_no: o.doc_no, ticket_ids: ticketIds }, order_ref: o.doc_no, actor });
    res.json({ ok: true, ticket_ids: ticketIds });
  });

  // Reject order
  router.post('/orders/:id/reject', (req, res) => {
    const { actor, reason } = req.body || {};
    if (!reason) return res.status(400).json({ error: 'reason required' });
    const o = db.prepare(`SELECT * FROM aggregator_orders WHERE id = ?`).get(req.params.id);
    if (!o) return res.status(404).json({ error: 'not found' });
    if (o.status !== 'pending') return res.status(409).json({ error: `cannot reject from: ${o.status}` });

    db.prepare(`UPDATE aggregator_orders SET status='rejected', rejected_at=?, rejection_reason=? WHERE id=?`)
      .run(nowSec(), reason, req.params.id);

    broadcast('aggregator:order-rejected', { id: o.id, doc_no: o.doc_no, reason });
    logEvent({ event_type: 'aggregator_order_rejected', payload: { doc_no: o.doc_no, reason }, order_ref: o.doc_no, actor, severity: 'warning' });

    // TODO: Push reject to aggregator API once integrated
    res.json({ ok: true });
  });

  router.post('/orders/:id/ready', (req, res) => {
    const { actor } = req.body || {};
    const o = db.prepare(`SELECT * FROM aggregator_orders WHERE id = ?`).get(req.params.id);
    if (!o) return res.status(404).json({ error: 'not found' });
    if (!['accepted', 'preparing'].includes(o.status)) return res.status(409).json({ error: `cannot mark ready from: ${o.status}` });

    db.prepare(`UPDATE aggregator_orders SET status='ready', ready_at=? WHERE id=?`).run(nowSec(), req.params.id);
    broadcast('aggregator:order-ready', { id: o.id, doc_no: o.doc_no, provider: o.provider_code });
    logEvent({ event_type: 'aggregator_order_ready', payload: { doc_no: o.doc_no }, order_ref: o.doc_no, actor });
    // TODO: Notify driver via aggregator API
    res.json({ ok: true });
  });

  router.post('/orders/:id/picked-up', (req, res) => {
    const { actor } = req.body || {};
    db.prepare(`UPDATE aggregator_orders SET status='picked_up', picked_up_at=? WHERE id=?`)
      .run(nowSec(), req.params.id);
    res.json({ ok: true });
  });

  router.post('/orders/:id/completed', (req, res) => {
    db.prepare(`UPDATE aggregator_orders SET status='completed', completed_at=? WHERE id=?`)
      .run(nowSec(), req.params.id);
    res.json({ ok: true });
  });

  // ============================================================
  // PROVIDERS CRUD
  // ============================================================
  router.get('/providers', (req, res) => {
    res.json(db.prepare(`SELECT * FROM aggregator_providers ORDER BY code`).all());
  });

  router.put('/providers/:code', (req, res) => {
    const b = req.body || {};
    const allowed = ['name', 'commission_rate', 'webhook_secret', 'api_key', 'api_endpoint', 'merchant_id', 'is_active', 'prep_buffer_minutes'];
    const sets = [], params = [];
    for (const k of allowed) if (b[k] !== undefined) {
      sets.push(`${k} = ?`);
      params.push(typeof b[k] === 'boolean' ? (b[k] ? 1 : 0) : b[k]);
    }
    if (!sets.length) return res.status(400).json({ error: 'no fields' });
    sets.push('updated_at = ?'); params.push(nowSec());
    params.push(req.params.code);
    db.prepare(`UPDATE aggregator_providers SET ${sets.join(', ')} WHERE code = ?`).run(...params);
    res.json({ ok: true });
  });

  // ============================================================
  // RECONCILIATION REPORT
  // ============================================================
  router.get('/reconcile', (req, res) => {
    const from = Number(req.query.from || Math.floor(new Date().setHours(0,0,0,0)/1000));
    const to = Number(req.query.to || nowSec());

    const rows = db.prepare(`
      SELECT provider_code,
        COUNT(*) total_orders,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed,
        SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) rejected,
        SUM(CASE WHEN status NOT IN ('completed','rejected','cancelled') THEN 1 ELSE 0 END) in_progress,
        COALESCE(SUM(CASE WHEN status='completed' THEN gross_amount ELSE 0 END), 0) gross_revenue,
        COALESCE(SUM(CASE WHEN status='completed' THEN commission_amount ELSE 0 END), 0) total_commission,
        COALESCE(SUM(CASE WHEN status='completed' THEN net_amount ELSE 0 END), 0) net_revenue,
        COALESCE(AVG(CASE WHEN status='completed' AND completed_at IS NOT NULL AND accepted_at IS NOT NULL
          THEN (completed_at - accepted_at) ELSE NULL END), 0) avg_fulfill_seconds
      FROM aggregator_orders
      WHERE received_at >= ? AND received_at <= ?
      GROUP BY provider_code
    `).all(from, to);

    const grand = rows.reduce((acc, r) => {
      acc.total_orders += r.total_orders;
      acc.completed += r.completed;
      acc.gross_revenue += r.gross_revenue;
      acc.total_commission += r.total_commission;
      acc.net_revenue += r.net_revenue;
      return acc;
    }, { total_orders: 0, completed: 0, gross_revenue: 0, total_commission: 0, net_revenue: 0 });

    res.json({ from, to, by_provider: rows, total: grand });
  });

  // ============================================================
  // 86 SYNC — broadcast item out-of-stock ke aggregators
  // ============================================================
  router.post('/sync-86', async (req, res) => {
    const { menu_id, is_out_of_stock, actor } = req.body || {};
    if (!menu_id) return res.status(400).json({ error: 'menu_id required' });

    const providers = db.prepare(`SELECT * FROM aggregator_providers WHERE is_active = 1`).all();
    const results = [];

    for (const p of providers) {
      // PLACEHOLDER: real API call to each aggregator akan beda. Log dulu.
      const log = db.prepare(`
        INSERT INTO aggregator_menu_sync_log (provider_code, action, menu_id, status, payload)
        VALUES (?,?,?,?,?)
      `).run(p.code, is_out_of_stock ? 'set_86' : 'unset_86', menu_id,
        p.api_key ? 'pending' : 'skipped_no_api_key',
        JSON.stringify({ menu_id, out_of_stock: !!is_out_of_stock, actor }));

      results.push({ provider: p.code, status: p.api_key ? 'queued' : 'skipped' });
    }

    res.json({ ok: true, providers: results });
  });

  // Menu sync log (audit trail)
  router.get('/sync-log', (req, res) => {
    const { provider, limit = 50 } = req.query;
    let sql = `SELECT * FROM aggregator_menu_sync_log WHERE 1=1`;
    const params = [];
    if (provider) { sql += ' AND provider_code = ?'; params.push(provider); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(Number(limit));
    res.json(db.prepare(sql).all(...params));
  });

  // Export CSV — semua order dari aggregator
  router.get('/export/orders.csv', (req, res) => {
    const rows = db.prepare(`SELECT * FROM aggregator_orders ORDER BY received_at DESC LIMIT 5000`).all();
    const header = ['Doc No', 'Tanggal', 'Provider', 'Customer', 'Status', 'Gross (Rp)', 'Komisi (Rp)', 'Net (Rp)'];
    const body = rows.map(r => [
      r.doc_no, new Date((r.received_at || 0) * 1000).toLocaleString('id-ID'),
      r.provider_code, r.customer_name || '', r.status,
      Math.round(r.gross_amount), Math.round(r.commission_amount), Math.round(r.net_amount),
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=aggregator-orders.csv');
    res.send(toCsv(header, body));
  });

  router.delete('/orders/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM aggregator_orders WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/aggregator';
  app.use(mountPath, router);

  console.log(`[aggregator] mounted at ${mountPath} — providers: ${DEFAULT_PROVIDERS.map(p => p.code).join(', ')}`);

  return { router, db, persistOrder };
}

module.exports = { setupAggregator, SCHEMA_SQL };
