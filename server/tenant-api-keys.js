// server/tenant-api-keys.js
// White-label P4B — public API access keys per tenant.
//
// Lets tenants generate API keys (scoped to their company_id) to build their
// own integrations against the public /api/public/* surface. Keys carry
// granular scopes (read:orders, read:menu, …) and per-key rate limits.
//
// Auth header: Authorization: Bearer ks_live_<64-hex>
// Or:          X-API-Key: ks_live_<64-hex>
//
// On each request the middleware looks up the key, attaches
// `req.publicApi = { company_id, key_id, scopes }`, increments usage, and
// rejects if scope/rate-limit not satisfied.

const crypto = require('crypto');

const KEY_PREFIX = 'ks_live_';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS company_api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,                  -- first 8 chars after ks_live_ for display
  name TEXT,                              -- human label
  scopes_json TEXT NOT NULL DEFAULT '["read:orders"]',
  rate_per_min INTEGER DEFAULT 120,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER,
  last_used_at INTEGER,
  last_ip TEXT,
  expires_at INTEGER,
  usage_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_company_api_keys_company ON company_api_keys(company_id);

CREATE TABLE IF NOT EXISTS company_api_usage (
  key_id INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER DEFAULT 0,
  PRIMARY KEY (key_id, window_start)
);
`;

const ALL_SCOPES = [
  { id: 'read:orders',    label: 'Read orders & receipts' },
  { id: 'read:menu',      label: 'Read menu & catalog' },
  { id: 'read:customers', label: 'Read customer master' },
  { id: 'read:reports',   label: 'Read sales reports' },
  { id: 'read:inventory', label: 'Read stock & inventory' },
  { id: 'write:orders',   label: 'Create orders (use with caution)' },
];

function hashKey(plain) {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

function setupTenantApiKeys(app, { dbPath }) {
  let _db;
  try {
    const Database = require('better-sqlite3');
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.exec(SCHEMA);
  } catch (e) {
    console.warn('[api-keys] init failed:', e.message);
    return { middleware: (_q, _r, n) => n() };
  }

  // ─── Helpers ───────────────────────────────────────────────────────
  function getScope(req) {
    if (!req.companyScope) return null;
    return req.companyScope.is_super_admin ? null : req.companyScope.company_id;
  }
  function requireScope(req, res) {
    const cid = getScope(req);
    if (cid == null) {
      const q = req.query.company_id ? Number(req.query.company_id) : null;
      if (!q) { res.status(400).json({ error: 'company_id required for super-admin' }); return null; }
      return q;
    }
    return cid;
  }
  function safeParse(s, fb) { try { return JSON.parse(s); } catch { return fb; } }

  // ─── Admin endpoints — manage keys ────────────────────────────────
  app.get('/api/api-keys', (req, res) => {
    const cid = requireScope(req, res); if (cid == null) return;
    const rows = _db.prepare(`SELECT id, prefix, name, scopes_json, rate_per_min, is_active,
      created_at, last_used_at, last_ip, expires_at, usage_count
      FROM company_api_keys WHERE company_id = ? ORDER BY id DESC`).all(cid);
    res.json(rows.map(r => ({
      ...r,
      scopes: safeParse(r.scopes_json, []),
      scopes_json: undefined,
      display: `${KEY_PREFIX}${r.prefix}…`,
      _shared: true,   // bypass scopeFilterMiddleware (already filtered by SQL)
    })));
  });

  app.get('/api/api-keys/scopes', (_req, res) => res.json(ALL_SCOPES));

  app.post('/api/api-keys', (req, res) => {
    const cid = requireScope(req, res); if (cid == null) return;
    const { name, scopes, rate_per_min, expires_in_days } = req.body || {};
    if (!Array.isArray(scopes) || scopes.length === 0)
      return res.status(400).json({ error: 'At least 1 scope required' });
    const invalid = scopes.find(s => !ALL_SCOPES.find(x => x.id === s));
    if (invalid) return res.status(400).json({ error: `Unknown scope: ${invalid}` });

    const raw = crypto.randomBytes(32).toString('hex'); // 64-char
    const plain = KEY_PREFIX + raw;
    const prefix = raw.slice(0, 8);
    const hash = hashKey(plain);
    const now = Math.floor(Date.now() / 1000);
    const expires = expires_in_days ? now + (Number(expires_in_days) * 86400) : null;

    const r = _db.prepare(`INSERT INTO company_api_keys
      (company_id, key_hash, prefix, name, scopes_json, rate_per_min, is_active, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`)
      .run(cid, hash, prefix, name || null, JSON.stringify(scopes), Number(rate_per_min) || 120, now, expires);
    if (typeof global.logAudit === 'function') {
      try { global.logAudit(req, { action: 'api_key.create', entity: 'api_key', entity_id: r.lastInsertRowid, payload: { name, scopes } }); } catch {}
    }
    // Plain key returned ONCE
    res.json({ id: r.lastInsertRowid, key: plain, prefix, expires_at: expires });
  });

  app.patch('/api/api-keys/:id', (req, res) => {
    const cid = requireScope(req, res); if (cid == null) return;
    const row = _db.prepare(`SELECT * FROM company_api_keys WHERE id = ? AND company_id = ?`).get(req.params.id, cid);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const { is_active, name, scopes, rate_per_min } = req.body || {};
    _db.prepare(`UPDATE company_api_keys SET
      is_active = ?, name = ?, scopes_json = ?, rate_per_min = ?
      WHERE id = ?`).run(
      is_active != null ? (is_active ? 1 : 0) : row.is_active,
      name ?? row.name,
      scopes ? JSON.stringify(scopes) : row.scopes_json,
      Number(rate_per_min) || row.rate_per_min,
      row.id
    );
    res.json({ ok: true });
  });

  app.delete('/api/api-keys/:id', (req, res) => {
    const cid = requireScope(req, res); if (cid == null) return;
    _db.prepare(`DELETE FROM company_api_keys WHERE id = ? AND company_id = ?`).run(req.params.id, cid);
    if (typeof global.logAudit === 'function') {
      try { global.logAudit(req, { action: 'api_key.revoke', entity: 'api_key', entity_id: req.params.id }); } catch {}
    }
    res.json({ ok: true });
  });

  // ─── Middleware — authenticate /api/public/* by API key ──────────
  function middleware(req, res, next) {
    const auth = req.headers.authorization || '';
    const headerKey = req.headers['x-api-key'] || '';
    const plain = auth.startsWith('Bearer ') ? auth.slice(7) : headerKey;
    if (!plain || !plain.startsWith(KEY_PREFIX)) {
      return res.status(401).json({ error: 'API key required' });
    }
    const row = _db.prepare(`SELECT * FROM company_api_keys WHERE key_hash = ?`).get(hashKey(plain));
    if (!row || !row.is_active) return res.status(401).json({ error: 'Invalid or revoked API key' });
    if (row.expires_at && row.expires_at < Math.floor(Date.now() / 1000)) {
      return res.status(401).json({ error: 'API key expired' });
    }
    // Rate limit — sliding 60s window
    const windowStart = Math.floor(Date.now() / 60000) * 60000;
    const used = _db.prepare(`SELECT count FROM company_api_usage WHERE key_id = ? AND window_start = ?`)
                   .get(row.id, windowStart);
    if ((used?.count || 0) >= row.rate_per_min) {
      res.set('X-RateLimit-Limit', String(row.rate_per_min));
      res.set('X-RateLimit-Remaining', '0');
      return res.status(429).json({ error: 'Rate limit exceeded', limit: row.rate_per_min });
    }
    _db.prepare(`INSERT INTO company_api_usage (key_id, window_start, count) VALUES (?, ?, 1)
                 ON CONFLICT(key_id, window_start) DO UPDATE SET count = count + 1`)
       .run(row.id, windowStart);
    _db.prepare(`UPDATE company_api_keys SET last_used_at = ?, last_ip = ?, usage_count = usage_count + 1 WHERE id = ?`)
       .run(Math.floor(Date.now() / 1000), req.ip || req.headers['x-forwarded-for'] || '', row.id);

    req.publicApi = {
      company_id: row.company_id,
      key_id: row.id,
      scopes: safeParse(row.scopes_json, []),
    };
    // Force company scope from key (security: tenant key can't cross-tenant)
    req.companyScope = { is_super_admin: false, company_id: row.company_id };
    res.set('X-RateLimit-Limit', String(row.rate_per_min));
    res.set('X-RateLimit-Remaining', String(Math.max(0, row.rate_per_min - (used?.count || 0) - 1)));
    next();
  }

  function requireScope_(scope) {
    return (req, res, next) => {
      if (!req.publicApi) return res.status(401).json({ error: 'API key required' });
      if (!req.publicApi.scopes.includes(scope) && !req.publicApi.scopes.includes('*')) {
        return res.status(403).json({ error: `Missing scope: ${scope}` });
      }
      next();
    };
  }

  // ─── Public read endpoints ─────────────────────────────────────────
  // All require API-key middleware + scope check, all scoped to caller's company.
  function _q(sql, params, scope) {
    // helper to scope queries to company_id
    return _db.prepare(sql).all(...params, scope);
  }

  app.get('/api/public/orders', middleware, requireScope_('read:orders'), (req, res) => {
    const cid = req.publicApi.company_id;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const rows = _db.prepare(`SELECT id, type, total, subtotal, tax, status, pay,
      time, customer_name, customer_phone, "table" as table_no
      FROM orders WHERE company_id = ? ORDER BY rowid DESC LIMIT ?`).all(cid, limit);
    res.json({ data: rows, limit });
  });

  app.get('/api/public/orders/:id', middleware, requireScope_('read:orders'), (req, res) => {
    const cid = req.publicApi.company_id;
    const row = _db.prepare(`SELECT * FROM orders WHERE id = ? AND company_id = ?`).get(req.params.id, cid);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });

  app.get('/api/public/menu', middleware, requireScope_('read:menu'), (req, res) => {
    const cid = req.publicApi.company_id;
    try {
      const rows = _db.prepare(`SELECT m.id, m.name, m.price, m.image_url,
        m.is_available, m.is_popular, c.name AS category
        FROM pos_menus m LEFT JOIN pos_menu_categories c ON c.id = m.category_id
        WHERE m.company_id = ?`).all(cid);
      res.json({ data: rows });
    } catch (e) {
      res.json({ data: [], error: e.message });
    }
  });

  app.get('/api/public/customers', middleware, requireScope_('read:customers'), (req, res) => {
    const cid = req.publicApi.company_id;
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    try {
      const rows = _db.prepare(`SELECT id, name, phone, points, visits AS total_visits,
        total_spend AS total_spent, created_at
        FROM customers WHERE company_id = ? ORDER BY rowid DESC LIMIT ?`).all(cid, limit);
      res.json({ data: rows, limit });
    } catch (e) {
      res.json({ data: [], error: e.message });
    }
  });

  app.get('/api/public/reports/sales-summary', middleware, requireScope_('read:reports'), (req, res) => {
    const cid = req.publicApi.company_id;
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const sinceMs = Date.now() - days * 86400000;
    try {
      // orders.time is ms-timestamp (string or number); compare directly
      const rows = _db.prepare(`SELECT
        date(CAST(time AS INTEGER) / 1000, 'unixepoch', 'localtime') AS day,
        COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue
        FROM orders WHERE company_id = ? AND CAST(time AS INTEGER) >= ?
        GROUP BY day ORDER BY day DESC`).all(cid, sinceMs);
      res.json({ data: rows, days });
    } catch (e) {
      res.json({ data: [], error: e.message });
    }
  });

  app.get('/api/public/me', middleware, (req, res) => {
    res.json({
      company_id: req.publicApi.company_id,
      scopes: req.publicApi.scopes,
      key_id: req.publicApi.key_id,
    });
  });

  console.log('[api-keys] mounted /api/api-keys (admin) + /api/public/* (key-auth)');
  return { middleware };
}

module.exports = { setupTenantApiKeys };
