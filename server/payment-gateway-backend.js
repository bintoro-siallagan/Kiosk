// server/payment-gateway-backend.js
// Payment Gateway integration — Midtrans + Xendit (Indonesia leading providers).
//
// Capabilities:
//   - QRIS dynamic per transaksi (amount embedded — gak bisa salah)
//   - E-wallet direct: GoPay, OVO, Dana, ShopeePay, LinkAja
//   - Virtual Account (BCA, BNI, Mandiri, BRI, Permata)
//   - Credit/Debit card
//   - Webhook receivers buat auto-confirm + reconcile
//   - Polling endpoint buat real-time status di POSPaymentGateway UI
//   - Signature verification (HMAC SHA512 for Midtrans, callback token for Xendit)
//   - Auto-complete pos_payments + trigger consumeStockForOrderV2 + createKitchenTickets
//
// Endpoints di /api/payment-gateway/*:
//   POST  /intents                  — bikin payment intent → return QR/URL
//   GET   /intents/:id              — cek status (polling buat UI)
//   GET   /intents/:id/qr-image     — fetch QR image (proxy ke gateway)
//   POST  /intents/:id/cancel       — cancel pending intent
//   POST  /webhook/midtrans         — Midtrans webhook receiver
//   POST  /webhook/xendit           — Xendit webhook receiver
//   GET   /providers                — list provider dengan status connection
//   PUT   /providers/:code          — config API keys + sandbox/production
//   GET   /reconcile                — daily reconcile per provider per method

const express = require('express');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const path = require('path');
const { toCsv } = require('./csv-util');

const DEFAULT_DB = path.join(__dirname, '..', 'data', 'kiosk.db');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS payment_gateway_providers (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  server_key TEXT,
  client_key TEXT,
  callback_token TEXT,
  merchant_id TEXT,
  environment TEXT DEFAULT 'sandbox' CHECK (environment IN ('sandbox','production')),
  is_active INTEGER DEFAULT 0,
  supported_methods TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS payment_intents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no TEXT UNIQUE NOT NULL,
  provider_code TEXT NOT NULL,
  external_id TEXT,
  order_ref TEXT,
  payment_method TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','cancelled','failed')),
  qr_string TEXT,
  qr_image_url TEXT,
  deeplink_url TEXT,
  va_number TEXT,
  va_bank TEXT,
  expires_at INTEGER,
  paid_at INTEGER,
  cancelled_at INTEGER,
  customer_name TEXT,
  customer_phone TEXT,
  items TEXT,
  request_payload TEXT,
  response_payload TEXT,
  webhook_payload TEXT,
  pos_payment_id INTEGER,
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER,
  FOREIGN KEY (provider_code) REFERENCES payment_gateway_providers(code)
);
CREATE INDEX IF NOT EXISTS idx_pi_status ON payment_intents(status);
CREATE INDEX IF NOT EXISTS idx_pi_order ON payment_intents(order_ref);
CREATE INDEX IF NOT EXISTS idx_pi_external ON payment_intents(external_id);
CREATE INDEX IF NOT EXISTS idx_pi_created ON payment_intents(created_at);

CREATE TABLE IF NOT EXISTS payment_webhook_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_code TEXT NOT NULL,
  external_id TEXT,
  intent_id INTEGER,
  signature_valid INTEGER,
  status TEXT,
  payload TEXT,
  response_status INTEGER,
  response_body TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_wh_provider ON payment_webhook_log(provider_code);
CREATE INDEX IF NOT EXISTS idx_wh_created ON payment_webhook_log(created_at);
`;

const DEFAULT_PROVIDERS = [
  { code: 'midtrans', name: 'Midtrans', supported_methods: 'qris,gopay,shopeepay,credit_card,bca_va,bni_va,bri_va,mandiri_va,permata_va' },
  { code: 'xendit', name: 'Xendit', supported_methods: 'qris,ovo,dana,linkaja,shopeepay,credit_card,bca_va,bni_va,bri_va,mandiri_va' },
];

function nowSec() { return Math.floor(Date.now() / 1000); }
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
function nextIntentDocNo(db) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const last = db.prepare(`SELECT doc_no FROM payment_intents WHERE doc_no LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(`PI-${today}-%`);
  let seq = 1;
  if (last) seq = parseInt(last.doc_no.split('-').pop(), 10) + 1;
  return `PI-${today}-${String(seq).padStart(5, '0')}`;
}

// ============================================================
// MIDTRANS ADAPTER
// ============================================================
const MidtransAdapter = {
  endpoint(env) {
    return env === 'production' ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
  },

  async createCharge(provider, intent) {
    const url = `${this.endpoint(provider.environment)}/v2/charge`;
    const auth = Buffer.from(`${provider.server_key}:`).toString('base64');

    let body;
    if (intent.payment_method === 'qris') {
      body = {
        payment_type: 'qris',
        transaction_details: { order_id: intent.doc_no, gross_amount: Math.round(intent.amount) },
        qris: { acquirer: 'gopay' },
        custom_expiry: { expiry_duration: 15, unit: 'minute' }
      };
    } else if (intent.payment_method === 'gopay') {
      body = {
        payment_type: 'gopay',
        transaction_details: { order_id: intent.doc_no, gross_amount: Math.round(intent.amount) },
        gopay: { enable_callback: true, callback_url: 'kiosk://callback' }
      };
    } else if (intent.payment_method === 'shopeepay') {
      body = {
        payment_type: 'shopeepay',
        transaction_details: { order_id: intent.doc_no, gross_amount: Math.round(intent.amount) }
      };
    } else if (intent.payment_method.endsWith('_va')) {
      const bank = intent.payment_method.replace('_va', '');
      body = {
        payment_type: 'bank_transfer',
        transaction_details: { order_id: intent.doc_no, gross_amount: Math.round(intent.amount) },
        bank_transfer: { bank }
      };
    } else {
      throw new Error(`Unsupported Midtrans method: ${intent.payment_method}`);
    }

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    // Midtrans returns HTTP 200 even for charge-level errors — status_code carries the real result.
    const sc = parseInt(data.status_code, 10);
    if (!r.ok || sc >= 400) throw new Error(data.status_message || data.error_messages?.join(', ') || `HTTP ${r.status}`);

    const qrAction = data.actions?.find(a => a.name === 'generate-qr-code');
    const deeplink = data.actions?.find(a => a.name?.includes('deeplink'));
    const vaInfo = data.va_numbers?.[0];

    return {
      external_id: data.transaction_id,
      qr_string: data.qr_string,
      qr_image_url: qrAction?.url,
      deeplink_url: deeplink?.url,
      va_number: vaInfo?.va_number,
      va_bank: vaInfo?.bank,
      expires_at: data.expiry_time ? Math.floor(new Date(data.expiry_time).getTime() / 1000) : nowSec() + 900,
      raw: data
    };
  },

  verifySignature(provider, payload) {
    const expected = crypto.createHash('sha512')
      .update(`${payload.order_id}${payload.status_code}${payload.gross_amount}${provider.server_key}`)
      .digest('hex');
    return expected === payload.signature_key;
  },

  parseStatus(payload) {
    const ts = payload.transaction_status;
    if (ts === 'settlement' || ts === 'capture') return 'paid';
    if (ts === 'expire') return 'expired';
    if (ts === 'cancel' || ts === 'deny') return 'cancelled';
    if (ts === 'pending') return 'pending';
    return 'failed';
  },

  async fetchStatus(provider, intent) {
    const url = `${this.endpoint(provider.environment)}/v2/${intent.doc_no}/status`;
    const auth = Buffer.from(`${provider.server_key}:`).toString('base64');
    const r = await fetch(url, { headers: { 'Authorization': `Basic ${auth}` } });
    if (!r.ok) return null;
    return r.json();
  }
};

// ============================================================
// XENDIT ADAPTER
// ============================================================
const XenditAdapter = {
  endpoint() { return 'https://api.xendit.co'; },

  async createCharge(provider, intent) {
    const auth = Buffer.from(`${provider.server_key}:`).toString('base64');

    if (intent.payment_method === 'qris') {
      // Xendit QR Codes API
      const body = {
        reference_id: intent.doc_no,
        type: 'DYNAMIC',
        currency: 'IDR',
        amount: Math.round(intent.amount),
        expires_at: new Date(Date.now() + 15*60*1000).toISOString()
      };
      const r = await fetch(`${this.endpoint()}/qr_codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}`, 'api-version': '2022-07-31' },
        body: JSON.stringify(body)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
      return {
        external_id: data.id,
        qr_string: data.qr_string,
        qr_image_url: null,
        expires_at: data.expires_at ? Math.floor(new Date(data.expires_at).getTime() / 1000) : nowSec() + 900,
        raw: data
      };
    } else if (['ovo', 'dana', 'linkaja', 'shopeepay'].includes(intent.payment_method)) {
      // Xendit eWallet Charges
      const channelMap = { ovo: 'ID_OVO', dana: 'ID_DANA', linkaja: 'ID_LINKAJA', shopeepay: 'ID_SHOPEEPAY' };
      const body = {
        reference_id: intent.doc_no,
        currency: 'IDR',
        amount: Math.round(intent.amount),
        checkout_method: 'ONE_TIME_PAYMENT',
        channel_code: channelMap[intent.payment_method],
        channel_properties: intent.payment_method === 'ovo'
          ? { mobile_number: intent.customer_phone || '+6281234567890' }
          : { success_redirect_url: 'kiosk://success' }
      };
      const r = await fetch(`${this.endpoint()}/ewallets/charges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
        body: JSON.stringify(body)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
      return {
        external_id: data.id,
        deeplink_url: data.actions?.desktop_web_checkout_url || data.actions?.mobile_web_checkout_url,
        expires_at: nowSec() + 600,
        raw: data
      };
    } else if (intent.payment_method.endsWith('_va')) {
      const bank = intent.payment_method.replace('_va', '').toUpperCase();
      const body = {
        external_id: intent.doc_no, bank_code: bank,
        name: intent.customer_name || 'Customer',
        expected_amount: Math.round(intent.amount), is_closed: true,
        expiration_date: new Date(Date.now() + 60*60*1000).toISOString()
      };
      const r = await fetch(`${this.endpoint()}/callback_virtual_accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
        body: JSON.stringify(body)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
      return {
        external_id: data.id, va_number: data.account_number, va_bank: bank,
        expires_at: nowSec() + 3600,
        raw: data
      };
    }
    throw new Error(`Unsupported Xendit method: ${intent.payment_method}`);
  },

  verifySignature(provider, headers) {
    // Xendit uses callback_token in 'x-callback-token' header
    return headers['x-callback-token'] === provider.callback_token;
  },

  parseStatus(payload) {
    const s = payload.status || payload.event;
    if (s === 'PAID' || s === 'SUCCEEDED' || s === 'qr.payment') return 'paid';
    if (s === 'EXPIRED') return 'expired';
    if (s === 'FAILED' || s === 'VOIDED') return 'failed';
    return 'pending';
  }
};

const ADAPTERS = { midtrans: MidtransAdapter, xendit: XenditAdapter };

// ============================================================
// SETUP
// ============================================================
function setupPaymentGateway(app, opts = {}) {
  const db = new Database(opts.dbPath || DEFAULT_DB);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);
  const requireAdmin = opts.requireAdmin || ((req, res, next) => next());
  // Migration for existing DBs: items column (stock deduction + kitchen tickets on paid intents)
  try { db.exec(`ALTER TABLE payment_intents ADD COLUMN items TEXT`); } catch {}

  const cnt = db.prepare(`SELECT COUNT(*) c FROM payment_gateway_providers`).get().c;
  if (cnt === 0) {
    const s = db.prepare(`INSERT INTO payment_gateway_providers (code, name, supported_methods, environment, is_active) VALUES (?,?,?,?,0)`);
    for (const p of DEFAULT_PROVIDERS) s.run(p.code, p.name, p.supported_methods, 'sandbox');
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
  // CORE: handle paid intent — complete pos_payment + trigger downstream
  // ============================================================
  async function completePaidIntent(intent, webhookPayload) {
    if (intent.status === 'paid') return; // already processed (idempotent)

    db.prepare(`UPDATE payment_intents SET status='paid', paid_at=?, webhook_payload=?, updated_at=? WHERE id=?`)
      .run(nowSec(), webhookPayload ? JSON.stringify(webhookPayload) : null, nowSec(), intent.id);

    // Create pos_payments row (if pos_payments module loaded)
    let posPaymentId = null;
    try {
      const info = db.prepare(`
        INSERT INTO pos_payments (order_ref, tender_type, amount, amount_applied, change_given, ref_no, actor, status, created_at)
        VALUES (?,?,?,?,?,?,?, 'completed', ?)
      `).run(intent.order_ref, intent.payment_method, intent.amount, intent.amount, 0,
        intent.external_id, intent.created_by || 'gateway', nowSec());
      posPaymentId = info.lastInsertRowid;
      db.prepare(`UPDATE payment_intents SET pos_payment_id=? WHERE id=?`).run(posPaymentId, intent.id);
    } catch (e) {
      console.warn('[payment-gateway] could not insert pos_payments:', e.message);
    }

    // Stock deduction + kitchen tickets — items captured at intent creation (QuickOrder gateway flow)
    const orderItems = safeJson(intent.items);
    if (Array.isArray(orderItems) && orderItems.length) {
      try {
        if (typeof global.consumeStockForOrder === 'function') {
          global.consumeStockForOrder(orderItems, {
            order_ref: intent.order_ref, actor: intent.created_by || 'gateway', allow_negative: true,
          });
        }
      } catch (e) { console.warn('[payment-gateway] consumeStockForOrder:', e.message); }
      try {
        if (typeof global.createKitchenTickets === 'function') {
          global.createKitchenTickets({
            order_ref: intent.order_ref, items: orderItems,
            customer_name: intent.customer_name, cashier: intent.created_by || 'gateway',
          });
        }
      } catch (e) { console.warn('[payment-gateway] createKitchenTickets:', e.message); }
    }

    broadcast('payment-gateway:paid', { intent_id: intent.id, order_ref: intent.order_ref, amount: intent.amount, method: intent.payment_method });
    logEvent({
      event_type: 'payment_completed',
      event_subtype: 'gateway',
      payload: { intent_id: intent.id, doc_no: intent.doc_no, method: intent.payment_method, provider: intent.provider_code, amount: intent.amount, pos_payment_id: posPaymentId },
      order_ref: intent.order_ref,
      actor: intent.created_by || 'gateway',
      severity: 'info'
    });

    // Optional dispatch confirmation
    if (intent.amount > 100000) {
      dispatchNotif({
        event_type: 'large_payment',
        severity: 'info',
        title: `💰 Bayar masuk ${intent.payment_method} Rp ${Math.round(intent.amount).toLocaleString('id-ID')}`,
        body: `Order: ${intent.order_ref}\nMethod: ${intent.payment_method}\nProvider: ${intent.provider_code}`,
        payload: { intent_id: intent.id }
      }).catch(() => {});
    }
  }

  // ============================================================
  // ROUTER
  // ============================================================
  const router = express.Router();

  // Webhook receivers (need raw body for signature verification) — register BEFORE json parser
  router.post('/webhook/midtrans', express.json({ limit: '1mb' }), async (req, res) => {
    const provider = db.prepare(`SELECT * FROM payment_gateway_providers WHERE code='midtrans' AND is_active=1`).get();
    if (!provider) return res.status(404).json({ error: 'midtrans not active' });

    const payload = req.body || {};
    const sigValid = MidtransAdapter.verifySignature(provider, payload);

    const logResult = db.prepare(`
      INSERT INTO payment_webhook_log (provider_code, external_id, signature_valid, status, payload)
      VALUES ('midtrans',?,?,?,?)
    `).run(payload.transaction_id || null, sigValid ? 1 : 0,
      payload.transaction_status || 'unknown', JSON.stringify(payload));

    if (!sigValid) {
      logEvent({ event_type: 'payment_webhook_invalid_sig', event_subtype: 'midtrans', severity: 'critical', payload });
      return res.status(401).json({ error: 'invalid signature' });
    }

    const intent = db.prepare(`SELECT * FROM payment_intents WHERE doc_no = ?`).get(payload.order_id);
    if (!intent) return res.status(404).json({ error: 'intent not found' });

    db.prepare(`UPDATE payment_webhook_log SET intent_id=? WHERE id=?`).run(intent.id, logResult.lastInsertRowid);

    const newStatus = MidtransAdapter.parseStatus(payload);
    if (newStatus === 'paid') {
      await completePaidIntent(intent, payload);
    } else if (newStatus !== 'pending') {
      db.prepare(`UPDATE payment_intents SET status=?, updated_at=?, webhook_payload=? WHERE id=?`)
        .run(newStatus, nowSec(), JSON.stringify(payload), intent.id);
      broadcast('payment-gateway:status', { intent_id: intent.id, status: newStatus });
    }

    res.json({ ok: true });
  });

  router.post('/webhook/xendit', express.json({ limit: '1mb' }), async (req, res) => {
    const provider = db.prepare(`SELECT * FROM payment_gateway_providers WHERE code='xendit' AND is_active=1`).get();
    if (!provider) return res.status(404).json({ error: 'xendit not active' });

    const sigValid = XenditAdapter.verifySignature(provider, req.headers);
    const payload = req.body || {};

    const logResult = db.prepare(`
      INSERT INTO payment_webhook_log (provider_code, external_id, signature_valid, status, payload)
      VALUES ('xendit',?,?,?,?)
    `).run(payload.id || payload.external_id, sigValid ? 1 : 0,
      payload.status || payload.event || 'unknown', JSON.stringify(payload));

    if (!sigValid) {
      logEvent({ event_type: 'payment_webhook_invalid_sig', event_subtype: 'xendit', severity: 'critical', payload });
      return res.status(401).json({ error: 'invalid callback token' });
    }

    // Xendit reference_id = our doc_no
    const refId = payload.reference_id || payload.external_id;
    const intent = db.prepare(`SELECT * FROM payment_intents WHERE doc_no = ? OR external_id = ?`).get(refId, payload.id);
    if (!intent) return res.status(404).json({ error: 'intent not found' });

    db.prepare(`UPDATE payment_webhook_log SET intent_id=? WHERE id=?`).run(intent.id, logResult.lastInsertRowid);

    const newStatus = XenditAdapter.parseStatus(payload);
    if (newStatus === 'paid') {
      await completePaidIntent(intent, payload);
    } else if (newStatus !== 'pending') {
      db.prepare(`UPDATE payment_intents SET status=?, updated_at=?, webhook_payload=? WHERE id=?`)
        .run(newStatus, nowSec(), JSON.stringify(payload), intent.id);
      broadcast('payment-gateway:status', { intent_id: intent.id, status: newStatus });
    }

    res.json({ ok: true });
  });

  router.use(express.json());

  // Create payment intent
  router.post('/intents', async (req, res) => {
    const { provider_code, payment_method, amount, order_ref, customer_name, customer_phone, created_by, items } = req.body || {};
    if (!provider_code || !payment_method || !amount) {
      return res.status(400).json({ error: 'provider_code + payment_method + amount required' });
    }

    const provider = db.prepare(`SELECT * FROM payment_gateway_providers WHERE code = ? AND is_active = 1`).get(provider_code);
    if (!provider) return res.status(404).json({ error: `provider ${provider_code} not active` });
    if (!provider.server_key) return res.status(400).json({ error: `${provider_code} server_key not configured` });

    const adapter = ADAPTERS[provider_code];
    if (!adapter) return res.status(400).json({ error: `no adapter for ${provider_code}` });

    const docNo = nextIntentDocNo(db);

    try {
      const intent = { doc_no: docNo, amount: Number(amount), payment_method, order_ref, customer_name, customer_phone };
      const result = await adapter.createCharge(provider, intent);

      const info = db.prepare(`
        INSERT INTO payment_intents (doc_no, provider_code, external_id, order_ref, payment_method, amount, status,
          qr_string, qr_image_url, deeplink_url, va_number, va_bank, expires_at,
          customer_name, customer_phone, items, request_payload, response_payload, created_by)
        VALUES (?,?,?,?,?,?,'pending',?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(docNo, provider_code, result.external_id, order_ref || null, payment_method, Number(amount),
        result.qr_string || null, result.qr_image_url || null, result.deeplink_url || null,
        result.va_number || null, result.va_bank || null, result.expires_at,
        customer_name || null, customer_phone || null,
        Array.isArray(items) && items.length ? JSON.stringify(items) : null,
        JSON.stringify(intent), JSON.stringify(result.raw), created_by || null);

      const id = info.lastInsertRowid;
      const saved = db.prepare(`SELECT * FROM payment_intents WHERE id = ?`).get(id);

      logEvent({
        event_type: 'payment_intent_created',
        event_subtype: payment_method,
        payload: { doc_no: docNo, provider: provider_code, amount, method: payment_method, order_ref },
        order_ref, actor: created_by, severity: 'info'
      });

      res.json({ ok: true, intent: saved });
    } catch (e) {
      logEvent({
        event_type: 'payment_intent_failed', event_subtype: provider_code,
        payload: { error: e.message, doc_no: docNo, method: payment_method, amount },
        order_ref, actor: created_by, severity: 'error'
      });
      res.status(500).json({ error: e.message });
    }
  });

  // Get intent status (for polling)
  router.get('/intents/:id', (req, res) => {
    const r = db.prepare(`SELECT * FROM payment_intents WHERE id = ? OR doc_no = ?`).get(req.params.id, req.params.id);
    if (!r) return res.status(404).json({ error: 'not found' });
    res.json(r);
  });

  // Cancel intent
  router.post('/intents/:id/cancel', (req, res) => {
    const { reason, actor } = req.body || {};
    const r = db.prepare(`SELECT * FROM payment_intents WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'not found' });
    if (r.status === 'paid') return res.status(409).json({ error: 'already paid' });

    db.prepare(`UPDATE payment_intents SET status='cancelled', cancelled_at=?, updated_at=? WHERE id=?`)
      .run(nowSec(), nowSec(), req.params.id);
    logEvent({
      event_type: 'payment_intent_cancelled', payload: { doc_no: r.doc_no, reason },
      order_ref: r.order_ref, actor, severity: 'warning'
    });
    res.json({ ok: true });
  });

  // Manual sync — query gateway, useful kalau webhook missed
  router.post('/intents/:id/sync', async (req, res) => {
    const r = db.prepare(`SELECT * FROM payment_intents WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'not found' });
    if (r.status === 'paid') return res.json({ ok: true, already_paid: true });

    const provider = db.prepare(`SELECT * FROM payment_gateway_providers WHERE code = ?`).get(r.provider_code);
    const adapter = ADAPTERS[r.provider_code];
    if (!adapter?.fetchStatus) return res.json({ ok: true, no_status_endpoint: true });

    try {
      const fresh = await adapter.fetchStatus(provider, r);
      if (!fresh) return res.json({ ok: true, status: 'no_change' });
      const newStatus = adapter.parseStatus(fresh);
      if (newStatus === 'paid') {
        await completePaidIntent(r, fresh);
        return res.json({ ok: true, status: 'paid' });
      }
      res.json({ ok: true, status: newStatus, raw: fresh });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Providers CRUD
  router.get('/providers', (req, res) => {
    const rows = db.prepare(`SELECT code, name, environment, is_active, supported_methods,
      CASE WHEN server_key IS NOT NULL THEN 1 ELSE 0 END as has_server_key,
      CASE WHEN callback_token IS NOT NULL THEN 1 ELSE 0 END as has_callback_token,
      merchant_id, created_at, updated_at FROM payment_gateway_providers ORDER BY code`).all();
    res.json(rows);
  });

  router.post('/providers', requireAdmin, (req, res) => {
    const b = req.body || {};
    const code = String(b.code || '').trim().toLowerCase();
    const name = String(b.name || '').trim();
    if (!code || !name) return res.status(400).json({ error: 'code + name wajib diisi' });
    const exists = db.prepare(`SELECT code FROM payment_gateway_providers WHERE code = ?`).get(code);
    if (exists) return res.status(409).json({ error: `provider '${code}' sudah ada` });
    try {
      db.prepare(`INSERT INTO payment_gateway_providers
        (code, name, server_key, client_key, callback_token, merchant_id, environment, is_active, supported_methods, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
        code, name,
        b.server_key || null, b.client_key || null, b.callback_token || null, b.merchant_id || null,
        b.environment === 'production' ? 'production' : 'sandbox',
        b.is_active ? 1 : 0,
        b.supported_methods || '',
        nowSec()
      );
      res.json({ ok: true, code });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/providers/:code', requireAdmin, (req, res) => {
    const b = req.body || {};
    const allowed = ['server_key', 'client_key', 'callback_token', 'merchant_id', 'environment', 'is_active', 'supported_methods'];
    const sets = [], params = [];
    for (const k of allowed) if (b[k] !== undefined) {
      sets.push(`${k} = ?`);
      params.push(typeof b[k] === 'boolean' ? (b[k] ? 1 : 0) : b[k]);
    }
    if (!sets.length) return res.status(400).json({ error: 'no fields' });
    sets.push('updated_at = ?'); params.push(nowSec());
    params.push(req.params.code);
    db.prepare(`UPDATE payment_gateway_providers SET ${sets.join(', ')} WHERE code = ?`).run(...params);
    res.json({ ok: true });
  });

  router.delete('/providers/:code', requireAdmin, (req, res) => {
    const used = db.prepare(`SELECT COUNT(*) c FROM payment_intents WHERE provider_code = ?`).get(req.params.code);
    if (used && used.c > 0) {
      return res.status(409).json({ error: `Provider masih dipakai ${used.c} intent — nonaktifkan saja` });
    }
    const info = db.prepare(`DELETE FROM payment_gateway_providers WHERE code = ?`).run(req.params.code);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  // Reconciliation
  router.get('/reconcile', (req, res) => {
    const from = Number(req.query.from || Math.floor(new Date().setHours(0,0,0,0)/1000));
    const to = Number(req.query.to || nowSec());

    const byProvider = db.prepare(`
      SELECT provider_code, payment_method,
        COUNT(*) total_intents,
        SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) paid_count,
        SUM(CASE WHEN status='expired' THEN 1 ELSE 0 END) expired_count,
        SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) cancelled_count,
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed_count,
        COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END), 0) total_paid_amount
      FROM payment_intents
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY provider_code, payment_method
      ORDER BY total_paid_amount DESC
    `).all(from, to);

    const totals = byProvider.reduce((acc, r) => {
      acc.intents += r.total_intents; acc.paid += r.paid_count;
      acc.expired += r.expired_count; acc.amount += r.total_paid_amount;
      return acc;
    }, { intents: 0, paid: 0, expired: 0, amount: 0 });

    res.json({ from, to, by_provider_method: byProvider, totals });
  });

  // Recent intents
  router.get('/intents', (req, res) => {
    const { status, provider_code, limit = 50 } = req.query;
    let sql = `SELECT id, doc_no, provider_code, payment_method, amount, status, order_ref, customer_name, paid_at, created_at FROM payment_intents WHERE 1=1`;
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (provider_code) { sql += ' AND provider_code = ?'; params.push(provider_code); }
    sql += ' ORDER BY created_at DESC LIMIT ?'; params.push(Number(limit));
    res.json(db.prepare(sql).all(...params));
  });

  // Webhook log (for debugging)
  router.get('/webhook-log', (req, res) => {
    const rows = db.prepare(`SELECT id, provider_code, external_id, intent_id, signature_valid, status, response_status, created_at
      FROM payment_webhook_log ORDER BY created_at DESC LIMIT 50`).all();
    res.json(rows);
  });

  // Export CSV — semua payment intent
  router.get('/export/intents.csv', (req, res) => {
    const rows = db.prepare(`SELECT * FROM payment_intents ORDER BY created_at DESC LIMIT 5000`).all();
    const header = ['Doc No', 'Tanggal', 'Provider', 'Metode', 'Amount (Rp)', 'Status', 'Order Ref', 'Customer', 'External ID'];
    const body = rows.map(r => [
      r.doc_no, new Date((r.created_at || 0) * 1000).toLocaleString('id-ID'),
      r.provider_code, r.payment_method, Math.round(r.amount), r.status,
      r.order_ref || '', r.customer_name || '', r.external_id || '',
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=payment-gateway-intents.csv');
    res.send(toCsv(header, body));
  });

  const mountPath = opts.mountPath || '/api/payment-gateway';
  app.use(mountPath, router);
  console.log(`[payment-gateway] mounted at ${mountPath} — Midtrans + Xendit`);

  return { router, db, completePaidIntent };
}

module.exports = { setupPaymentGateway };
