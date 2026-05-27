// server/announcements.js
// White-label P4D — in-product announcements + changelog.
//
// Super-admin posts items. Tenants see them in their admin shell.
// Three types:
//   - banner: top-of-app bar, dismissible per user
//   - changelog: persistent feature/changes log
//   - maintenance: scheduled downtime notice
//
// Targeting:
//   - audience='all' | 'plan:starter,growth' | 'company:1,2'
//   - active_from / active_until window
// Read receipts tracked per user.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'banner',     -- banner | changelog | maintenance
  severity TEXT DEFAULT 'info',            -- info | success | warning | critical
  title TEXT NOT NULL,
  body TEXT,
  link_url TEXT,
  link_label TEXT,
  audience TEXT DEFAULT 'all',             -- 'all' | 'plan:...' | 'company:...'
  active_from INTEGER,
  active_until INTEGER,
  is_published INTEGER DEFAULT 1,
  created_at INTEGER,
  updated_at INTEGER,
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_published, active_from, active_until);

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  read_at INTEGER,
  PRIMARY KEY (announcement_id, user_id)
);
`;

function setupAnnouncements(app, { dbPath, adminSessions }) {
  let _db;
  try {
    const Database = require('better-sqlite3');
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.exec(SCHEMA);
  } catch (e) {
    console.warn('[announcements] init failed:', e.message);
    return;
  }

  function getSession(req) {
    const tok = req.headers.authorization?.replace('Bearer ', '');
    return tok && adminSessions ? adminSessions.get(tok) : null;
  }

  function getCompanyForSession(session) {
    if (!session) return null;
    return session.company_id;
  }

  // Match audience filter against (companyId, plan)
  function matchesAudience(audience, companyId, planCode) {
    if (!audience || audience === 'all') return true;
    if (audience.startsWith('company:')) {
      const ids = audience.slice('company:'.length).split(',').map(s => Number(s.trim())).filter(Boolean);
      return ids.includes(companyId);
    }
    if (audience.startsWith('plan:')) {
      const plans = audience.slice('plan:'.length).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      return plans.includes(String(planCode || '').toLowerCase());
    }
    return false;
  }

  function getTenantPlan(companyId) {
    if (!companyId) return null;
    try {
      const r = _db.prepare(`SELECT plan_code FROM company_subscriptions WHERE company_id = ? AND status = 'active' LIMIT 1`).get(companyId);
      return r?.plan_code || null;
    } catch { return null; }
  }

  // ─── Read endpoints (tenant-facing) ────────────────────────────────
  // Active announcements for current user (filtered by audience + read state)
  app.get('/api/announcements/active', (req, res) => {
    const session = getSession(req);
    if (!session) return res.status(401).json({ error: 'auth required' });
    const now = Math.floor(Date.now() / 1000);
    const rows = _db.prepare(`SELECT * FROM announcements
      WHERE is_published = 1
        AND (active_from IS NULL OR active_from <= ?)
        AND (active_until IS NULL OR active_until >= ?)
      ORDER BY created_at DESC`).all(now, now);
    const plan = getTenantPlan(session.company_id);
    const reads = new Set(_db.prepare(`SELECT announcement_id FROM announcement_reads WHERE user_id = ?`)
      .all(String(session.userId)).map(r => r.announcement_id));
    const filtered = rows
      .filter(r => matchesAudience(r.audience, session.company_id, plan))
      .map(r => ({ ...r, read: reads.has(r.id) }));
    res.json({ data: filtered });
  });

  // Full changelog (all changelog-kind items, ignore is_published=false unless super-admin)
  app.get('/api/announcements/changelog', (req, res) => {
    const session = getSession(req);
    const rows = _db.prepare(`SELECT id, kind, severity, title, body, link_url, link_label, active_from, created_at
      FROM announcements WHERE kind = 'changelog' AND is_published = 1
      ORDER BY COALESCE(active_from, created_at) DESC LIMIT 200`).all();
    res.json({ data: rows });
  });

  app.post('/api/announcements/:id/read', (req, res) => {
    const session = getSession(req);
    if (!session) return res.status(401).json({ error: 'auth required' });
    _db.prepare(`INSERT OR REPLACE INTO announcement_reads (announcement_id, user_id, read_at) VALUES (?, ?, ?)`)
       .run(req.params.id, String(session.userId), Math.floor(Date.now() / 1000));
    res.json({ ok: true });
  });

  // ─── Admin endpoints (super-admin only) ────────────────────────────
  function requireSuperAdmin(req, res) {
    const session = getSession(req);
    if (!session || !session.is_super_admin) {
      res.status(403).json({ error: 'super-admin only' });
      return null;
    }
    return session;
  }

  app.get('/api/admin/announcements', (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    const rows = _db.prepare(`SELECT * FROM announcements ORDER BY id DESC LIMIT 200`).all();
    res.json({ data: rows });
  });

  app.post('/api/admin/announcements', (req, res) => {
    const session = requireSuperAdmin(req, res); if (!session) return;
    const b = req.body || {};
    const now = Math.floor(Date.now() / 1000);
    if (!b.title) return res.status(400).json({ error: 'title required' });
    const r = _db.prepare(`INSERT INTO announcements
      (kind, severity, title, body, link_url, link_label, audience, active_from, active_until,
       is_published, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      b.kind || 'banner',
      b.severity || 'info',
      b.title,
      b.body || null,
      b.link_url || null,
      b.link_label || null,
      b.audience || 'all',
      b.active_from || null,
      b.active_until || null,
      b.is_published === false ? 0 : 1,
      now, now, session.name || String(session.userId),
    );
    res.json({ id: r.lastInsertRowid });
  });

  app.patch('/api/admin/announcements/:id', (req, res) => {
    const session = requireSuperAdmin(req, res); if (!session) return;
    const row = _db.prepare(`SELECT * FROM announcements WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    const b = req.body || {};
    const now = Math.floor(Date.now() / 1000);
    _db.prepare(`UPDATE announcements SET
      kind = ?, severity = ?, title = ?, body = ?, link_url = ?, link_label = ?,
      audience = ?, active_from = ?, active_until = ?, is_published = ?, updated_at = ?
      WHERE id = ?`).run(
      b.kind ?? row.kind, b.severity ?? row.severity, b.title ?? row.title,
      b.body ?? row.body, b.link_url ?? row.link_url, b.link_label ?? row.link_label,
      b.audience ?? row.audience, b.active_from ?? row.active_from, b.active_until ?? row.active_until,
      b.is_published != null ? (b.is_published ? 1 : 0) : row.is_published,
      now, row.id
    );
    res.json({ ok: true });
  });

  app.delete('/api/admin/announcements/:id', (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    _db.prepare(`DELETE FROM announcements WHERE id = ?`).run(req.params.id);
    _db.prepare(`DELETE FROM announcement_reads WHERE announcement_id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  console.log('[announcements] mounted /api/announcements (tenant) + /api/admin/announcements (super)');
}

module.exports = { setupAnnouncements };
