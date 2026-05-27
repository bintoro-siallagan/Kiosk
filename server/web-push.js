// server/web-push.js
// Web Push notifications (RFC 8030 / VAPID).
//
// Flow:
//   1. Frontend SW subscribes via PushManager.subscribe({ applicationServerKey })
//      → POST /api/push/subscribe { subscription, company_id, ref_phone, ref_order_id }
//   2. Server stores subscription keyed by (endpoint, company_id) + optional phone/order
//   3. When an event fires (e.g. order.ready), call sendPushToOrder(orderId, payload)
//   4. SW receives push event → showNotification("Pesanan siap diambil!")
//
// VAPID keys are read from env, with one-time fallback generated + persisted to a
// JSON file so the keypair stays stable across restarts in dev.

const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  endpoint TEXT NOT NULL,
  keys_json TEXT NOT NULL,                 -- { p256dh, auth }
  ref_phone TEXT,                          -- customer phone (08…)
  ref_order_id TEXT,                       -- attach to a specific order if known
  user_agent TEXT,
  created_at INTEGER,
  last_used_at INTEGER,
  is_active INTEGER DEFAULT 1,
  UNIQUE(endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_subs_company ON push_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_phone ON push_subscriptions(ref_phone);
CREATE INDEX IF NOT EXISTS idx_push_subs_order ON push_subscriptions(ref_order_id);
`;

function _loadOrInitVAPID() {
  let pub = process.env.VAPID_PUBLIC_KEY;
  let priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) return { publicKey: pub, privateKey: priv };

  // Fallback: persist to .vapid-keys.json beside index.js (gitignored)
  const file = path.join(__dirname, '.vapid-keys.json');
  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  }
  const k = webpush.generateVAPIDKeys();
  try { fs.writeFileSync(file, JSON.stringify(k, null, 2)); } catch {}
  console.log('[web-push] generated VAPID keypair → server/.vapid-keys.json');
  return k;
}

function setupWebPush(app, { dbPath, contactEmail = 'mailto:support@karyaos.com' }) {
  let _db;
  try {
    const Database = require('better-sqlite3');
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.exec(SCHEMA);
  } catch (e) {
    console.warn('[web-push] init failed:', e.message);
    return { sendToOrder: () => {}, sendToPhone: () => {} };
  }

  const vapid = _loadOrInitVAPID();
  webpush.setVapidDetails(contactEmail, vapid.publicKey, vapid.privateKey);

  // ─── Endpoints ─────────────────────────────────────────────────────
  // Public key — frontend fetches once to convert into Uint8Array for subscribe
  app.get('/api/push/vapid-public-key', (_req, res) => {
    res.json({ publicKey: vapid.publicKey });
  });

  // Subscribe / re-subscribe (idempotent on endpoint)
  app.post('/api/push/subscribe', (req, res) => {
    const { subscription, ref_phone, ref_order_id } = req.body || {};
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'invalid subscription' });
    }
    const cid = req.companyScope?.company_id || null;
    const ua = String(req.headers['user-agent'] || '').slice(0, 200);
    const now = Math.floor(Date.now() / 1000);
    _db.prepare(`INSERT INTO push_subscriptions
      (company_id, endpoint, keys_json, ref_phone, ref_order_id, user_agent, created_at, last_used_at, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(endpoint) DO UPDATE SET
        company_id = excluded.company_id,
        keys_json  = excluded.keys_json,
        ref_phone  = COALESCE(excluded.ref_phone, ref_phone),
        ref_order_id = COALESCE(excluded.ref_order_id, ref_order_id),
        user_agent = excluded.user_agent,
        last_used_at = excluded.last_used_at,
        is_active = 1`)
       .run(cid, subscription.endpoint, JSON.stringify(subscription.keys),
            ref_phone || null, ref_order_id || null, ua, now, now);
    res.json({ ok: true });
  });

  app.post('/api/push/unsubscribe', (req, res) => {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
    _db.prepare(`UPDATE push_subscriptions SET is_active = 0 WHERE endpoint = ?`).run(endpoint);
    res.json({ ok: true });
  });

  // Test ping — useful from admin UI to verify a subscription is live
  app.post('/api/push/test', async (req, res) => {
    const cid = req.companyScope?.company_id || null;
    if (!cid) return res.status(401).json({ error: 'company scope required' });
    const rows = _db.prepare(`SELECT * FROM push_subscriptions WHERE company_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 5`).all(cid);
    const results = await Promise.all(rows.map(r => _sendOne(r, {
      title: 'karyaOS push test',
      body: 'Push notifications berfungsi ✓',
      tag: 'test-' + Date.now(),
    })));
    res.json({ sent: results.filter(Boolean).length, total: rows.length });
  });

  // ─── Internal: send to one subscription ────────────────────────────
  async function _sendOne(row, payload) {
    try {
      const sub = { endpoint: row.endpoint, keys: JSON.parse(row.keys_json) };
      await webpush.sendNotification(sub, JSON.stringify(payload));
      _db.prepare(`UPDATE push_subscriptions SET last_used_at = ? WHERE id = ?`)
         .run(Math.floor(Date.now() / 1000), row.id);
      return true;
    } catch (e) {
      // 410 Gone / 404 → subscription expired, mark inactive
      if (e.statusCode === 410 || e.statusCode === 404) {
        _db.prepare(`UPDATE push_subscriptions SET is_active = 0 WHERE id = ?`).run(row.id);
      }
      console.warn('[web-push] send failed:', e.statusCode || e.message);
      return false;
    }
  }

  // ─── Public API for backend hooks ──────────────────────────────────
  async function sendToOrder(orderId, payload) {
    if (!orderId) return 0;
    const rows = _db.prepare(`SELECT * FROM push_subscriptions WHERE ref_order_id = ? AND is_active = 1`).all(String(orderId));
    const results = await Promise.all(rows.map(r => _sendOne(r, payload)));
    return results.filter(Boolean).length;
  }

  async function sendToPhone(phone, companyId, payload) {
    if (!phone) return 0;
    const norm = String(phone).replace(/[^0-9]/g, '');
    const rows = _db.prepare(`SELECT * FROM push_subscriptions WHERE ref_phone = ? AND company_id = ? AND is_active = 1`)
                   .all(norm, companyId);
    const results = await Promise.all(rows.map(r => _sendOne(r, payload)));
    return results.filter(Boolean).length;
  }

  async function sendToCompany(companyId, payload) {
    const rows = _db.prepare(`SELECT * FROM push_subscriptions WHERE company_id = ? AND is_active = 1`).all(companyId);
    const results = await Promise.all(rows.map(r => _sendOne(r, payload)));
    return results.filter(Boolean).length;
  }

  console.log('[web-push] mounted /api/push/* (vapid-public-key, subscribe, unsubscribe, test)');
  return { sendToOrder, sendToPhone, sendToCompany, vapidPublicKey: vapid.publicKey };
}

module.exports = { setupWebPush };
