// server/tenant-integrations.js
// White-label P2B — per-tenant API keys (encrypted at rest).
// Storage: company_integrations(company_id, provider, key, value, is_active)
// Encryption: AES-256-CBC via SERVER_SECRET env (fallback to fixed default for dev).
//
// Providers supported:
//   midtrans  — server_key, client_key, merchant_id, is_production
//   xendit    — secret_key, webhook_token
//   esb       — api_key, outlet_id, client_id, base_url
//   tmdb      — api_key
//   fonnte    — token   (WhatsApp)
//   twilio    — account_sid, auth_token, from_number
//
// API:
//   getKey(db, companyId, provider, key)
//   getAllKeys(db, companyId, provider) → { key1, key2, ... }
//   setKey(db, companyId, provider, key, value)
//   deleteKey(db, companyId, provider, key)
//
// Routes (mounted at /api/integrations):
//   GET    /api/integrations?provider=midtrans      → masked list (no secrets)
//   PUT    /api/integrations/:provider              → upsert { key1, key2, ... }
//   DELETE /api/integrations/:provider              → wipe all keys for that provider

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS company_integrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  key TEXT NOT NULL,
  value_encrypted BLOB,
  iv BLOB,
  is_active INTEGER DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(company_id, provider, key)
);
CREATE INDEX IF NOT EXISTS idx_company_integ_lookup ON company_integrations(company_id, provider, is_active);
`;

// Get encryption key from env (or fixed dev fallback — DO change in prod)
function _getCipherKey() {
  const secret = process.env.SERVER_SECRET || 'karyaos-default-dev-secret-change-in-prod-please-32b';
  return crypto.createHash('sha256').update(secret).digest(); // 32-byte key
}

function _encrypt(plaintext) {
  if (!plaintext) return { value: null, iv: null };
  const iv = crypto.randomBytes(16);
  const key = _getCipherKey();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return { value: encrypted, iv };
}

function _decrypt(encrypted, iv) {
  if (!encrypted || !iv) return null;
  try {
    const key = _getCipherKey();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch { return null; }
}

// Mask helper — show first 4 + last 4 chars, asterisk middle
function _mask(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.length <= 12) return '••••••••';
  return value.slice(0, 4) + '•'.repeat(Math.min(value.length - 8, 20)) + value.slice(-4);
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────
function getKey(db, companyId, provider, key) {
  if (!companyId || !provider || !key) return null;
  const row = db.prepare(`SELECT value_encrypted, iv FROM company_integrations
    WHERE company_id = ? AND provider = ? AND key = ? AND is_active = 1`).get(companyId, provider, key);
  if (!row) return null;
  return _decrypt(row.value_encrypted, row.iv);
}

function getAllKeys(db, companyId, provider) {
  if (!companyId || !provider) return {};
  const rows = db.prepare(`SELECT key, value_encrypted, iv FROM company_integrations
    WHERE company_id = ? AND provider = ? AND is_active = 1`).all(companyId, provider);
  const result = {};
  for (const r of rows) {
    result[r.key] = _decrypt(r.value_encrypted, r.iv);
  }
  return result;
}

function setKey(db, companyId, provider, key, value) {
  const { value: encrypted, iv } = _encrypt(value);
  const now = Math.floor(Date.now() / 1000);
  // UPSERT
  db.prepare(`INSERT INTO company_integrations (company_id, provider, key, value_encrypted, iv, is_active, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(company_id, provider, key) DO UPDATE SET
      value_encrypted = excluded.value_encrypted,
      iv = excluded.iv,
      is_active = 1,
      updated_at = excluded.updated_at`)
    .run(companyId, provider, key, encrypted, iv, now);
}

function deleteKey(db, companyId, provider, key) {
  db.prepare(`DELETE FROM company_integrations WHERE company_id = ? AND provider = ? AND key = ?`)
    .run(companyId, provider, key);
}

function deleteProvider(db, companyId, provider) {
  db.prepare(`DELETE FROM company_integrations WHERE company_id = ? AND provider = ?`)
    .run(companyId, provider);
}

// Listing — returns masked values only (for admin UI)
function listMasked(db, companyId, provider) {
  if (!companyId) return {};
  const where = provider
    ? `WHERE company_id = ? AND provider = ? AND is_active = 1`
    : `WHERE company_id = ? AND is_active = 1`;
  const params = provider ? [companyId, provider] : [companyId];
  const rows = db.prepare(`SELECT provider, key, value_encrypted, iv, updated_at FROM company_integrations ${where}`).all(...params);
  const result = {};
  for (const r of rows) {
    if (!result[r.provider]) result[r.provider] = {};
    const decrypted = _decrypt(r.value_encrypted, r.iv);
    result[r.provider][r.key] = {
      masked: _mask(decrypted),
      updated_at: r.updated_at,
      length: decrypted ? decrypted.length : 0,
    };
  }
  return result;
}

// ─── EXPRESS SETUP ────────────────────────────────────────────────────────────
function setupTenantIntegrations(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  const router = express.Router();
  router.use(express.json());

  // GET /api/integrations?provider=X → masked list scoped to tenant
  router.get('/', (req, res) => {
    const sc = req.companyScope || {};
    const companyId = sc.company_id;
    if (!companyId) return res.json({ message: 'super-admin: pass ?company_id', integrations: {} });
    const integrations = listMasked(db, companyId, req.query.provider);
    res.json({ company_id: companyId, integrations });
  });

  // PUT /api/integrations/:provider → upsert keys (body: { key1: val1, key2: val2 })
  router.put('/:provider', (req, res) => {
    const sc = req.companyScope || {};
    const companyId = sc.company_id;
    if (!companyId) return res.status(400).json({ error: 'no company scope' });
    const provider = req.params.provider;
    const keys = req.body || {};
    let count = 0;
    for (const [key, value] of Object.entries(keys)) {
      if (value === null || value === undefined || value === '') {
        deleteKey(db, companyId, provider, key);
      } else {
        setKey(db, companyId, provider, key, value);
        count++;
      }
    }
    // Audit log (do NOT include plaintext values — only key names)
    if (typeof global.logAudit === 'function') {
      global.logAudit(req, {
        action: 'integration.update', entity: 'integration', entity_id: provider,
        payload: { provider, keys: Object.keys(keys), count },
      });
    }
    res.json({ ok: true, provider, updated: count });
  });

  // DELETE /api/integrations/:provider → wipe all keys for that provider
  router.delete('/:provider', (req, res) => {
    const sc = req.companyScope || {};
    const companyId = sc.company_id;
    if (!companyId) return res.status(400).json({ error: 'no company scope' });
    deleteProvider(db, companyId, req.params.provider);
    if (typeof global.logAudit === 'function') {
      global.logAudit(req, { action: 'integration.wipe', entity: 'integration', entity_id: req.params.provider });
    }
    res.json({ ok: true });
  });

  // POST /api/integrations/:provider/test — health check (uses real decrypted creds)
  router.post('/:provider/test', (req, res) => {
    const sc = req.companyScope || {};
    const companyId = sc.company_id;
    if (!companyId) return res.status(400).json({ error: 'no company scope' });
    const creds = getAllKeys(db, companyId, req.params.provider);
    const presentKeys = Object.entries(creds).filter(([_, v]) => v).map(([k]) => k);
    res.json({
      ok: presentKeys.length > 0,
      provider: req.params.provider,
      configured_keys: presentKeys,
      note: 'Real provider test not implemented yet — only checks presence.',
    });
  });

  const mountPath = opts.mountPath || '/api/integrations';
  app.use(mountPath, router);
  console.log(`[tenant-integrations] mounted at ${mountPath} — encrypted per-tenant API keys`);

  return { db, getKey, getAllKeys, setKey, deleteKey };
}

module.exports = {
  setupTenantIntegrations,
  // Helper exports (use directly with db handle)
  getKey, getAllKeys, setKey, deleteKey, deleteProvider, listMasked,
};
