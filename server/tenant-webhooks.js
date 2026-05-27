// server/tenant-webhooks.js
// White-label P4A — outbound webhooks per tenant.
//
// Concept: tenant registers `{ url, events: [...], secret }`. When an event
// fires inside the backend, `emitWebhook(companyId, event, payload)` enqueues
// a delivery. A background worker (interval) drains the queue with retry +
// exponential backoff. Payloads are signed with HMAC-SHA256 in the
// `X-KaryaOS-Signature` header so the recipient can verify authenticity.
//
// Supported events (free-form — caller picks the name; nothing rigid):
//   order.created, order.paid, order.cancelled,
//   payment.completed, payment.failed,
//   customer.created, customer.updated,
//   shift.opened, shift.closed,
//   booking.confirmed (cinema), inventory.low,
//   ...callers can emit anything.

const crypto = require('crypto');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS company_webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  events_json TEXT NOT NULL,
  secret TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  description TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  last_delivery_at INTEGER,
  last_status INTEGER
);
CREATE INDEX IF NOT EXISTS idx_company_webhooks_company ON company_webhooks(company_id);

CREATE TABLE IF NOT EXISTS company_webhook_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_id INTEGER NOT NULL,
  company_id INTEGER NOT NULL,
  event TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending | success | failed | abandoned
  attempts INTEGER DEFAULT 0,
  last_status_code INTEGER,
  last_error TEXT,
  next_attempt_at INTEGER,
  created_at INTEGER,
  delivered_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending
  ON company_webhook_deliveries(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_company
  ON company_webhook_deliveries(company_id, created_at);
`;

const MAX_ATTEMPTS = 6;
// Backoff: 30s, 2m, 8m, 30m, 2h, 8h
const BACKOFF_MS = [30_000, 120_000, 480_000, 1_800_000, 7_200_000, 28_800_000];
const WORKER_INTERVAL_MS = 15_000;

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function setupTenantWebhooks(app, { dbPath }) {
  let _db;
  try {
    const Database = require('better-sqlite3');
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.exec(SCHEMA);
  } catch (e) {
    console.warn('[webhooks] init failed:', e.message);
    return { emit: () => {} };
  }

  function getScope(req) {
    if (!req.companyScope) return null;
    return req.companyScope.is_super_admin ? null : req.companyScope.company_id;
  }
  function requireScope(req, res) {
    const cid = getScope(req);
    if (cid == null) {
      // super-admin must specify company via query
      const q = req.query.company_id ? Number(req.query.company_id) : null;
      if (!q) { res.status(400).json({ error: 'company_id required for super-admin' }); return null; }
      return q;
    }
    return cid;
  }

  // ─── List webhooks ─────────────────────────────────────────────────
  app.get('/api/webhooks', (req, res) => {
    const cid = requireScope(req, res); if (cid == null) return;
    const rows = _db.prepare(`SELECT id, url, events_json, is_active, description,
      created_at, updated_at, last_delivery_at, last_status
      FROM company_webhooks WHERE company_id = ? ORDER BY id DESC`).all(cid);
    res.json(rows.map(r => ({
      ...r, events: safeParse(r.events_json, []), events_json: undefined,
    })));
  });

  // ─── Create webhook ────────────────────────────────────────────────
  app.post('/api/webhooks', (req, res) => {
    const cid = requireScope(req, res); if (cid == null) return;
    const { url, events, description } = req.body || {};
    if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Valid URL required' });
    if (!Array.isArray(events) || events.length === 0) return res.status(400).json({ error: 'At least 1 event required' });
    const secret = crypto.randomBytes(24).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    const r = _db.prepare(`INSERT INTO company_webhooks
      (company_id, url, events_json, secret, is_active, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)`)
      .run(cid, url, JSON.stringify(events), secret, description || null, now, now);
    if (typeof global.logAudit === 'function') {
      try { global.logAudit(req, { action: 'webhook.create', entity: 'webhook', entity_id: r.lastInsertRowid }); } catch {}
    }
    // Secret is returned ONCE on create — tenant must save it
    res.json({ id: r.lastInsertRowid, secret, url, events });
  });

  // ─── Update webhook (events / active / description; not secret) ───
  app.patch('/api/webhooks/:id', (req, res) => {
    const cid = requireScope(req, res); if (cid == null) return;
    const row = _db.prepare(`SELECT * FROM company_webhooks WHERE id = ? AND company_id = ?`).get(req.params.id, cid);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const updates = {}; const allow = ['url', 'events', 'is_active', 'description'];
    for (const k of allow) if (k in req.body) updates[k] = req.body[k];
    const now = Math.floor(Date.now() / 1000);
    _db.prepare(`UPDATE company_webhooks SET
      url = ?, events_json = ?, is_active = ?, description = ?, updated_at = ?
      WHERE id = ?`).run(
      updates.url ?? row.url,
      updates.events ? JSON.stringify(updates.events) : row.events_json,
      updates.is_active != null ? (updates.is_active ? 1 : 0) : row.is_active,
      updates.description ?? row.description,
      now, row.id
    );
    res.json({ ok: true });
  });

  // ─── Delete webhook ────────────────────────────────────────────────
  app.delete('/api/webhooks/:id', (req, res) => {
    const cid = requireScope(req, res); if (cid == null) return;
    _db.prepare(`DELETE FROM company_webhooks WHERE id = ? AND company_id = ?`).run(req.params.id, cid);
    if (typeof global.logAudit === 'function') {
      try { global.logAudit(req, { action: 'webhook.delete', entity: 'webhook', entity_id: req.params.id }); } catch {}
    }
    res.json({ ok: true });
  });

  // ─── Test webhook (manual ping) ────────────────────────────────────
  app.post('/api/webhooks/:id/test', (req, res) => {
    const cid = requireScope(req, res); if (cid == null) return;
    const row = _db.prepare(`SELECT * FROM company_webhooks WHERE id = ? AND company_id = ?`).get(req.params.id, cid);
    if (!row) return res.status(404).json({ error: 'Not found' });
    enqueue(row.company_id, row.id, 'test.ping', { hello: 'world', timestamp: Date.now() });
    res.json({ ok: true, queued: true });
  });

  // ─── Recent deliveries ─────────────────────────────────────────────
  app.get('/api/webhooks/deliveries', (req, res) => {
    const cid = requireScope(req, res); if (cid == null) return;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const rows = _db.prepare(`SELECT id, webhook_id, event, status, attempts,
      last_status_code, last_error, created_at, delivered_at, next_attempt_at
      FROM company_webhook_deliveries WHERE company_id = ?
      ORDER BY id DESC LIMIT ?`).all(cid, limit);
    // _shared bypasses scope filter (we already filtered by company_id in SQL)
    res.json(rows.map(r => ({ ...r, _shared: true })));
  });

  // ─── Retry a failed delivery ───────────────────────────────────────
  app.post('/api/webhooks/deliveries/:id/retry', (req, res) => {
    const cid = requireScope(req, res); if (cid == null) return;
    const row = _db.prepare(`SELECT * FROM company_webhook_deliveries WHERE id = ? AND company_id = ?`).get(req.params.id, cid);
    if (!row) return res.status(404).json({ error: 'Not found' });
    _db.prepare(`UPDATE company_webhook_deliveries SET status = 'pending', next_attempt_at = ? WHERE id = ?`)
       .run(Date.now(), row.id);
    res.json({ ok: true });
  });

  // ─── Enqueue (called by event emit) ────────────────────────────────
  function enqueue(companyId, webhookId, event, payload) {
    const now = Date.now();
    _db.prepare(`INSERT INTO company_webhook_deliveries
      (webhook_id, company_id, event, payload_json, status, attempts, next_attempt_at, created_at)
      VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)`)
      .run(webhookId, companyId, event, JSON.stringify(payload), now, Math.floor(now / 1000));
  }

  // ─── Emit (public API for the rest of the backend) ────────────────
  function emit(companyId, event, payload) {
    if (!companyId || !event) return;
    try {
      const subs = _db.prepare(`SELECT id, events_json FROM company_webhooks WHERE company_id = ? AND is_active = 1`).all(companyId);
      for (const s of subs) {
        const events = safeParse(s.events_json, []);
        // '*' wildcard or exact match — also support 'order.*' prefix wildcard
        if (events.includes('*') || events.includes(event) ||
            events.some(e => e.endsWith('.*') && event.startsWith(e.slice(0, -1)))) {
          enqueue(companyId, s.id, event, payload);
        }
      }
    } catch (e) {
      // Webhook delivery should never break the caller — swallow & log
      console.warn('[webhook.emit]', event, e.message);
    }
  }

  // ─── Background worker: drain pending deliveries ──────────────────
  async function tick() {
    const now = Date.now();
    const due = _db.prepare(`SELECT d.*, w.url, w.secret FROM company_webhook_deliveries d
      JOIN company_webhooks w ON w.id = d.webhook_id
      WHERE d.status = 'pending' AND d.next_attempt_at <= ? AND w.is_active = 1
      LIMIT 25`).all(now);
    for (const d of due) {
      await deliver(d);
    }
  }

  async function deliver(d) {
    const body = JSON.stringify({
      id: d.id, event: d.event, company_id: d.company_id,
      created_at: d.created_at, data: safeParse(d.payload_json, {}),
    });
    const signature = sign(body, d.secret);
    const attempt = d.attempts + 1;
    try {
      const ctrl = new AbortController();
      const tmo = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(d.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'karyaOS-Webhooks/1.0',
          'X-KaryaOS-Event': d.event,
          'X-KaryaOS-Delivery': String(d.id),
          'X-KaryaOS-Signature': `sha256=${signature}`,
        },
        body,
        signal: ctrl.signal,
      });
      clearTimeout(tmo);
      const ok = res.status >= 200 && res.status < 300;
      if (ok) {
        _db.prepare(`UPDATE company_webhook_deliveries SET status = 'success', attempts = ?,
          last_status_code = ?, delivered_at = ? WHERE id = ?`)
          .run(attempt, res.status, Math.floor(Date.now() / 1000), d.id);
        _db.prepare(`UPDATE company_webhooks SET last_delivery_at = ?, last_status = ? WHERE id = ?`)
          .run(Math.floor(Date.now() / 1000), res.status, d.webhook_id);
      } else {
        bumpRetry(d, attempt, res.status, `HTTP ${res.status}`);
      }
    } catch (e) {
      bumpRetry(d, attempt, 0, e.message || 'fetch failed');
    }
  }

  function bumpRetry(d, attempt, statusCode, errMsg) {
    if (attempt >= MAX_ATTEMPTS) {
      _db.prepare(`UPDATE company_webhook_deliveries SET status = 'abandoned', attempts = ?,
        last_status_code = ?, last_error = ? WHERE id = ?`)
        .run(attempt, statusCode || null, errMsg, d.id);
    } else {
      const wait = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
      _db.prepare(`UPDATE company_webhook_deliveries SET status = 'pending', attempts = ?,
        last_status_code = ?, last_error = ?, next_attempt_at = ? WHERE id = ?`)
        .run(attempt, statusCode || null, errMsg, Date.now() + wait, d.id);
    }
    _db.prepare(`UPDATE company_webhooks SET last_delivery_at = ?, last_status = ? WHERE id = ?`)
      .run(Math.floor(Date.now() / 1000), statusCode || 0, d.webhook_id);
  }

  setInterval(() => { tick().catch(e => console.warn('[webhook.tick]', e.message)); }, WORKER_INTERVAL_MS);
  console.log(`[webhooks] mounted /api/webhooks · worker every ${WORKER_INTERVAL_MS / 1000}s`);

  return { emit };
}

function safeParse(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }

module.exports = { setupTenantWebhooks };
