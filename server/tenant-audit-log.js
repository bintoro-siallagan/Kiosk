// server/tenant-audit-log.js
// White-label P2D — per-tenant audit log.
// Tracks: who changed what, when. Compliance + investigation.
//
// Routes (mounted at /api/audit):
//   GET  /api/audit?action=X&since=ISO&limit=N   — list scoped events
//   POST /api/audit                              — manual log entry (rare; mostly auto-logged)
//
// Helper exports:
//   logAudit(req, { action, entity, entity_id, payload })
//     Auto-extracts: company_id from req.companyScope, actor from req.headers['x-user'] or session, ip

const Database = require('better-sqlite3');
const path = require('path');
const express = require('express');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tenant_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  actor TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  payload TEXT,
  ip TEXT,
  ts INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_company_ts ON tenant_audit_log(company_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON tenant_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON tenant_audit_log(entity, entity_id);
`;

let _db = null;
let _writeStmt = null;

function _getActor(req) {
  return req?.headers?.['x-user']
    || req?.headers?.['x-actor']
    || req?.adminSession?.username
    || req?.body?._actor
    || 'unknown';
}

function _getIp(req) {
  return req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
    || req?.connection?.remoteAddress
    || req?.socket?.remoteAddress
    || '';
}

// PUBLIC HELPER — call from anywhere with access to req
function logAudit(req, { action, entity, entity_id, payload } = {}) {
  if (!_db || !_writeStmt) return null;
  try {
    const sc = req?.companyScope || {};
    const companyId = sc.company_id || null;
    const actor = _getActor(req);
    const ip = _getIp(req);
    const payloadStr = payload ? (typeof payload === 'string' ? payload : JSON.stringify(payload).slice(0, 4000)) : null;
    _writeStmt.run(companyId, actor, action, entity || null, entity_id ? String(entity_id) : null, payloadStr, ip);
  } catch (e) { console.warn('[audit-log] failed:', e.message); }
}

function setupTenantAuditLog(app, opts = {}) {
  _db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  _db.pragma('journal_mode = WAL');
  _db.exec(SCHEMA);
  _writeStmt = _db.prepare(`INSERT INTO tenant_audit_log
    (company_id, actor, action, entity, entity_id, payload, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);

  const router = express.Router();
  router.use(express.json());

  // GET /api/audit?action=...&since=ISO&entity=...&limit=N
  router.get('/', (req, res) => {
    const sc = req.companyScope || {};
    const cid = sc.company_id;
    if (!cid && !sc.is_super_admin) return res.status(400).json({ error: 'no company scope' });

    const conditions = [];
    const params = [];
    if (cid) { conditions.push('company_id = ?'); params.push(cid); }
    if (req.query.action) { conditions.push('action = ?'); params.push(req.query.action); }
    if (req.query.entity) { conditions.push('entity = ?'); params.push(req.query.entity); }
    if (req.query.since) {
      const ts = Math.floor(new Date(req.query.since).getTime() / 1000);
      if (!isNaN(ts)) { conditions.push('ts >= ?'); params.push(ts); }
    }
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 1000);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = _db.prepare(`SELECT id, company_id, actor, action, entity, entity_id, payload, ip, ts
                              FROM tenant_audit_log ${where} ORDER BY ts DESC LIMIT ?`).all(...params, limit);
    res.json({
      company_id: cid,
      count: rows.length,
      events: rows.map(r => ({
        ...r,
        ts_iso: new Date(r.ts * 1000).toISOString(),
        payload: r.payload ? (() => { try { return JSON.parse(r.payload); } catch { return r.payload; } })() : null,
      })),
    });
  });

  // POST /api/audit — manual log entry (rare; use logAudit() helper inside route handlers)
  router.post('/', (req, res) => {
    logAudit(req, req.body || {});
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/audit';
  app.use(mountPath, router);
  console.log(`[tenant-audit-log] mounted at ${mountPath} — per-tenant audit trail`);

  return { logAudit, db: _db };
}

module.exports = { setupTenantAuditLog, logAudit };
