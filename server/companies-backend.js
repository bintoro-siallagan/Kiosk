// server/companies-backend.js
// Multi-tenant foundation — setiap company punya data terisolasi.
// Cinema owner login → cuma lihat data company cinema. F&B owner → cuma F&B.
// Karys super-admin (company_id=NULL) → akses semua company.
//
// Schema:
//   companies                — daftar tenant (PT/usaha)
//   outlet_master.company_id  — outlet milik company mana
//   admin_users.company_id    — user milik company mana (NULL = karys super-admin)
//   orders.company_id         — denormalized untuk speed (FK ke outlet → company)
//   cinema_tickets.company_id, cinema_films.company_id, dst.
//
// Endpoints under /api/companies/*:
//   GET    /                — list companies (super-admin) atau company own (regular)
//   GET    /:id             — detail company
//   POST   /                — create (super-admin only)
//   PATCH  /:id             — update (super-admin only)

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  primary_vertical TEXT DEFAULT 'fnb' CHECK (primary_vertical IN ('fnb','cinema','hybrid')),
  brand_color TEXT,
  logo_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,
  npwp TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
`;

// Tabel yang butuh company_id — migrate existing rows by inference rules
const COMPANY_COLUMN_MIGRATIONS = [
  // Core
  `ALTER TABLE outlet_master   ADD COLUMN company_id INTEGER`,
  `ALTER TABLE admin_users     ADD COLUMN company_id INTEGER`,
  // F&B transactional
  `ALTER TABLE orders          ADD COLUMN company_id INTEGER`,
  // Cinema transactional
  `ALTER TABLE cinema_tickets    ADD COLUMN company_id INTEGER`,
  `ALTER TABLE cinema_films      ADD COLUMN company_id INTEGER`,
  `ALTER TABLE cinema_showtimes  ADD COLUMN company_id INTEGER`,
  `ALTER TABLE cinema_studios    ADD COLUMN company_id INTEGER`,
  `ALTER TABLE cinema_promotions ADD COLUMN company_id INTEGER`,
  `ALTER TABLE cinema_bundles    ADD COLUMN company_id INTEGER`,
  // Gamification + customer
  `ALTER TABLE spend_leaderboard ADD COLUMN company_id INTEGER`,
  `ALTER TABLE customers         ADD COLUMN company_id INTEGER`,
  // Config (NULL = global, value diset = scoped per company)
  `ALTER TABLE pos_config        ADD COLUMN company_id INTEGER`,
];

const COMPANY_INDEX_MIGRATIONS = [
  `CREATE INDEX IF NOT EXISTS idx_outlet_company ON outlet_master(company_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_company ON admin_users(company_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_company ON orders(company_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ctk_company ON cinema_tickets(company_id)`,
  `CREATE INDEX IF NOT EXISTS idx_lb_company ON spend_leaderboard(company_id)`,
];

function setupCompanies(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  // 1) Add company_id columns ke semua tabel related (idempotent)
  for (const m of COMPANY_COLUMN_MIGRATIONS) { try { db.exec(m); } catch (e) { /* column exists or table missing */ } }
  for (const m of COMPANY_INDEX_MIGRATIONS) { try { db.exec(m); } catch {} }

  // 2) Bootstrap default companies kalau kosong
  const count = db.prepare(`SELECT COUNT(*) c FROM companies`).get().c;
  if (count === 0) {
    const ins = db.prepare(`INSERT INTO companies (code, name, primary_vertical, brand_color, status)
      VALUES (?,?,?,?,?)`);
    ins.run('BTS', 'Karya Bites',  'fnb',    '#f97316', 'active');     // id=1
    ins.run('CMX', 'Karya Cinema', 'cinema', '#a855f7', 'active');     // id=2
    console.log('[companies] bootstrapped 2 default companies: Karya Bites (id=1) + Karya Cinema (id=2)');
  }

  // 3) Auto-assign existing data ke company by inference rules
  //    Idempotent — UPDATE WHERE company_id IS NULL only
  try {
    // 3a. outlet_master: vertical='cinema' → company 2 ('CMX'), else company 1 ('BTS')
    const outletUpd = db.prepare(`
      UPDATE outlet_master
      SET company_id = CASE WHEN vertical = 'cinema' THEN 2 ELSE 1 END
      WHERE company_id IS NULL
    `).run();
    if (outletUpd.changes > 0) console.log(`[companies] migrated ${outletUpd.changes} outlets to default companies`);

    // 3b. admin_users: by outlet assignment kalau ada, else default ke company 1 (F&B)
    //     outlet assignment ada di outlet_assignments / user.outlet_codes (best-effort)
    //     Simple rule untuk MVP: semua user existing → company 1.
    //     Super-admin (role='super_admin' OR username='admin') → company_id = NULL
    // Super-admin detection: role contains 'super' OR name contains 'super' / 'admin'
    // IDEMPOTENT GUARD: hanya assign user yang belum di-tag (company_id IS NULL).
    // Tanpa guard ini, restart akan overwrite manual assignment (mis user yang dipindah ke company 2).
    // First-pass migration: untuk row baru, klasifikasi default. Existing tag tetap dihormati.
    const newUsers = db.prepare(`SELECT COUNT(*) c FROM admin_users WHERE company_id IS NULL AND role IS NOT NULL`).get().c;
    if (newUsers > 0) {
      const userUpd = db.prepare(`
        UPDATE admin_users
        SET company_id = CASE
          WHEN LOWER(COALESCE(role,'')) LIKE '%super%' THEN NULL
          WHEN LOWER(COALESCE(name,'')) LIKE '%super%' THEN NULL
          WHEN LOWER(COALESCE(name,'')) = 'admin' THEN NULL
          ELSE 1
        END
        WHERE role IS NOT NULL AND company_id IS NULL
      `).run();
      if (userUpd.changes > 0) {
        const sa = db.prepare(`SELECT id, name, role FROM admin_users WHERE company_id IS NULL`).all();
        console.log(`[companies] tagged ${userUpd.changes} new users (existing assignment preserved) — ${sa.length} super-admin(s):`, sa.map(u => `${u.name}(${u.role})`).join(', '));
      }
    }

    // 3c. orders (F&B) → company 1
    try {
      const r = db.prepare(`UPDATE orders SET company_id = 1 WHERE company_id IS NULL`).run();
      if (r.changes > 0) console.log(`[companies] migrated ${r.changes} F&B orders to company 1`);
    } catch {}

    // 3d. cinema_* → company 2
    for (const t of ['cinema_tickets', 'cinema_films', 'cinema_showtimes', 'cinema_studios', 'cinema_promotions', 'cinema_bundles']) {
      try {
        const r = db.prepare(`UPDATE ${t} SET company_id = 2 WHERE company_id IS NULL`).run();
        if (r.changes > 0) console.log(`[companies] migrated ${r.changes} rows in ${t} to company 2 (Karya Cinema)`);
      } catch {}
    }

    // 3e. spend_leaderboard — historis, default ke company 1 (mayoritas F&B)
    try {
      const r = db.prepare(`UPDATE spend_leaderboard SET company_id = 1 WHERE company_id IS NULL`).run();
      if (r.changes > 0) console.log(`[companies] migrated ${r.changes} leaderboard rows to company 1`);
    } catch {}

    // 3f. customers (F&B-centric) → company 1
    try {
      const r = db.prepare(`UPDATE customers SET company_id = 1 WHERE company_id IS NULL`).run();
      if (r.changes > 0) console.log(`[companies] migrated ${r.changes} customers to company 1`);
    } catch {}
  } catch (e) {
    console.error('[companies] migration error (continuing):', e.message);
  }

  // ─── ROUTER ───
  const router = express.Router();
  router.use(express.json());

  // List companies
  // - Super-admin (no company_id in header) → see all
  // - Regular user → see their own company only
  router.get('/', (req, res) => {
    const callerCompanyId = parseInt(req.headers['x-company-id'], 10);
    const isSuperAdmin = String(req.headers['x-super-admin'] || '') === 'true' || !callerCompanyId;
    if (isSuperAdmin) {
      const rows = db.prepare(`SELECT * FROM companies ORDER BY status, id`).all();
      return res.json({ companies: rows, scope: 'all' });
    }
    const row = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(callerCompanyId);
    res.json({ companies: row ? [row] : [], scope: 'self' });
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'company not found' });
    res.json(row);
  });

  // Create (super-admin only)
  router.post('/', (req, res) => {
    const isSuperAdmin = String(req.headers['x-super-admin'] || '') === 'true';
    if (!isSuperAdmin) return res.status(403).json({ error: 'super-admin only' });
    const b = req.body || {};
    if (!b.code || !b.name) return res.status(400).json({ error: 'code & name required' });
    try {
      const r = db.prepare(`INSERT INTO companies (code, name, primary_vertical, brand_color, logo_url, contact_email, contact_phone, address, npwp, status)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
          String(b.code).toUpperCase(), b.name, b.primary_vertical || 'fnb',
          b.brand_color || null, b.logo_url || null, b.contact_email || null,
          b.contact_phone || null, b.address || null, b.npwp || null,
          b.status || 'active');
      res.json({ ok: true, id: r.lastInsertRowid });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'code already exists' });
      res.status(500).json({ error: e.message });
    }
  });

  // Platform summary (super-admin only) — KPI agregat per company
  // Dipakai karys super-admin untuk pantau semua tenant side-by-side
  router.get('/platform/summary', (req, res) => {
    const isSuperAdmin = String(req.headers['x-super-admin'] || '') === 'true';
    if (!isSuperAdmin) return res.status(403).json({ error: 'super-admin only' });
    const now = Math.floor(Date.now() / 1000);
    const dayAgo = now - 86400;
    const monthAgo = now - 30 * 86400;
    const today = new Date().toISOString().slice(0, 10);
    const companies = db.prepare(`SELECT * FROM companies ORDER BY id`).all();
    const summaries = companies.map(c => {
      const outletCount = safeGet(db, `SELECT COUNT(*) c FROM outlet_master WHERE company_id = ?`, [c.id])?.c || 0;
      const userCount   = safeGet(db, `SELECT COUNT(*) c FROM admin_users WHERE company_id = ? AND active = 1`, [c.id])?.c || 0;
      // F&B metrics
      const fnbToday = safeGet(db, `SELECT COUNT(*) c, COALESCE(SUM(total),0) r FROM orders WHERE company_id = ? AND time > ?`, [c.id, dayAgo * 1000]);
      const fnbMonth = safeGet(db, `SELECT COUNT(*) c, COALESCE(SUM(total),0) r FROM orders WHERE company_id = ? AND time > ?`, [c.id, monthAgo * 1000]);
      // Cinema metrics
      const cinemaToday = safeGet(db, `SELECT COUNT(*) c, COALESCE(SUM(price),0) r FROM cinema_tickets WHERE company_id = ? AND sold_at > ?`, [c.id, dayAgo]);
      const cinemaMonth = safeGet(db, `SELECT COUNT(*) c, COALESCE(SUM(price),0) r FROM cinema_tickets WHERE company_id = ? AND sold_at > ?`, [c.id, monthAgo]);
      // Total combined
      const revToday = (fnbToday?.r || 0) + (cinemaToday?.r || 0);
      const revMonth = (fnbMonth?.r || 0) + (cinemaMonth?.r || 0);
      const txToday = (fnbToday?.c || 0) + (cinemaToday?.c || 0);
      return {
        id: c.id, code: c.code, name: c.name, primary_vertical: c.primary_vertical,
        brand_color: c.brand_color, logo_url: c.logo_url, status: c.status,
        outlets: outletCount, users: userCount,
        revenue: { today: revToday, month: revMonth },
        transactions: { today: txToday },
        fnb: { today: fnbToday, month: fnbMonth },
        cinema: { today: cinemaToday, month: cinemaMonth },
      };
    });
    // Platform totals
    const platformRevToday = summaries.reduce((s, c) => s + c.revenue.today, 0);
    const platformRevMonth = summaries.reduce((s, c) => s + c.revenue.month, 0);
    const platformTxToday  = summaries.reduce((s, c) => s + c.transactions.today, 0);
    res.json({
      companies: summaries,
      platform: { revenue_today: platformRevToday, revenue_month: platformRevMonth, tx_today: platformTxToday, company_count: companies.length },
      generated_at: Date.now(), today,
    });
  });

  function safeGet(db, sql, args = []) {
    try { return db.prepare(sql).get(...args); } catch { return null; }
  }

  // Patch (super-admin only)
  router.patch('/:id', (req, res) => {
    const isSuperAdmin = String(req.headers['x-super-admin'] || '') === 'true';
    if (!isSuperAdmin) return res.status(403).json({ error: 'super-admin only' });
    const b = req.body || {};
    const fields = []; const args = [];
    for (const k of ['code', 'name', 'primary_vertical', 'brand_color', 'logo_url', 'contact_email', 'contact_phone', 'address', 'npwp', 'status']) {
      if (k in b) { fields.push(`${k} = ?`); args.push(k === 'code' ? String(b[k]).toUpperCase() : b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE companies SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/companies';
  app.use(mountPath, router);
  console.log(`[companies] mounted at ${mountPath} — multi-tenant foundation`);

  // Helper: resolve scope dari request (untuk dipake module lain)
  // Returns { company_id, is_super_admin, scope_filter_sql, scope_filter_params }
  function resolveScope(req) {
    const cid = parseInt(req.headers['x-company-id'], 10);
    const isSuperAdmin = String(req.headers['x-super-admin'] || '') === 'true';
    if (isSuperAdmin || !cid) {
      // No filter — super-admin sees everything
      return { company_id: null, is_super_admin: true, filter_sql: '1=1', filter_params: [] };
    }
    return { company_id: cid, is_super_admin: false, filter_sql: 'company_id = ?', filter_params: [cid] };
  }

  return { router, db, resolveScope };
}

module.exports = { setupCompanies };
