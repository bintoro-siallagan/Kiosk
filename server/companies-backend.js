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

// Slugify company name → 3-letter code (e.g. "Kopi Kenangan" → "KPK")
function generateCompanyCode(name) {
  const words = String(name || '').trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'CO' + Math.floor(Math.random() * 1000);
  if (words.length === 1) return words[0].replace(/[^A-Z]/g, '').slice(0, 3) || 'CO' + Math.floor(Math.random() * 1000);
  // First letter of each word, max 4
  return words.map(w => w[0]).join('').replace(/[^A-Z]/g, '').slice(0, 4) || 'CO' + Math.floor(Math.random() * 1000);
}

// Darken hex color by factor (0..1). Returns hex string.
function darkenHex(hex, factor) {
  try {
    const h = String(hex || '').replace('#', '');
    if (h.length !== 6) return hex;
    const r = Math.max(0, Math.round(parseInt(h.slice(0,2), 16) * (1 - factor)));
    const g = Math.max(0, Math.round(parseInt(h.slice(2,4), 16) * (1 - factor)));
    const b = Math.max(0, Math.round(parseInt(h.slice(4,6), 16) * (1 - factor)));
    return '#' + [r,g,b].map(n => n.toString(16).padStart(2, '0')).join('');
  } catch { return hex; }
}

function setupCompanies(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  // requireAdmin di-inject dari index.js. Fallback pass-through kalau gak di-set
  // (safer than crash, but check that opts.requireAdmin disuplai for production).
  const requireAdmin = opts.requireAdmin || ((req, res, next) => next());

  // 1) Add company_id columns ke semua tabel related (idempotent)
  for (const m of COMPANY_COLUMN_MIGRATIONS) { try { db.exec(m); } catch (e) { /* column exists or table missing */ } }
  for (const m of COMPANY_INDEX_MIGRATIONS) { try { db.exec(m); } catch {} }

  // 1b) Per-tenant branding extras (white-label P2A) — idempotent ALTERs
  for (const col of [
    'ALTER TABLE companies ADD COLUMN receipt_footer TEXT',     // custom footer text on receipt
    'ALTER TABLE companies ADD COLUMN wa_signature TEXT',       // signature appended to WA notifications
    'ALTER TABLE companies ADD COLUMN email_signature TEXT',    // signature for email
    'ALTER TABLE companies ADD COLUMN brand_short TEXT',        // short display name (POS header)
    "ALTER TABLE companies ADD COLUMN currency_code TEXT DEFAULT 'IDR'", // P3B multi-currency
    "ALTER TABLE companies ADD COLUMN locale TEXT DEFAULT 'id-ID'",       // P3B locale for number formatting
    'ALTER TABLE companies ADD COLUMN custom_domain TEXT',                // P4C — tenant CNAME (e.g. order.brand.com)
    'ALTER TABLE companies ADD COLUMN custom_domain_verified INTEGER DEFAULT 0',
    'ALTER TABLE companies ADD COLUMN custom_domain_token TEXT',          // DNS-TXT verification token
    // P5 — Theme Studio (font + background per tenant)
    'ALTER TABLE companies ADD COLUMN font_family TEXT',                  // Google Font name (e.g. "Playfair Display")
    'ALTER TABLE companies ADD COLUMN bg_config TEXT',                    // JSON {mode, value, value2, direction}
  ]) { try { db.exec(col); } catch {} }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_companies_custom_domain ON companies(custom_domain) WHERE custom_domain IS NOT NULL`); } catch {}

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

    // 3b-extra: SAFEGUARD — pastikan user 'admin' atau role 'super-admin' selalu NULL company_id
    // (kalau ada code lain (mis. login flow) reset ke 1, ini jaga setiap restart)
    try {
      const fix = db.prepare(`
        UPDATE admin_users
        SET company_id = NULL
        WHERE (LOWER(COALESCE(username,'')) = 'admin' OR LOWER(COALESCE(role,'')) LIKE '%super%')
          AND company_id IS NOT NULL
      `).run();
      if (fix.changes > 0) {
        console.log(`[companies] safeguard: re-promoted ${fix.changes} super-admin user(s) (company_id NULL)`);
      }
    } catch (e) { console.error('[companies] safeguard error:', e.message); }

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

  // GET /branding — MUST come before /:id (else "branding" matches as id param)
  // Customer-facing endpoint — no auth required, public access.
  router.get('/branding', (req, res) => {
    const sc = req.companyScope || {};
    let companyId = sc.company_id;
    if (!companyId) {
      const row = db.prepare(`SELECT id FROM companies WHERE status='active' ORDER BY id LIMIT 1`).get();
      companyId = row?.id || 1;
    }
    const c = db.prepare(`SELECT id, code, name, primary_vertical, brand_color, logo_url,
                                  contact_email, contact_phone, address,
                                  receipt_footer, wa_signature, email_signature, brand_short,
                                  currency_code, locale, font_family, bg_config
                          FROM companies WHERE id = ?`).get(companyId);
    if (!c) return res.json({
      company_id: null, name: 'karyaOS',
      brand_color: '#FF6B35', brand_secondary: '#E55A2B',
      logo_url: '/logo.png', vertical: 'fnb',
    });
    const brand = c.brand_color || '#FF6B35';
    res.json({
      company_id: c.id, company_code: c.code, name: c.name,
      brand_short: c.brand_short || c.name,
      brand_color: brand,
      brand_secondary: darkenHex(brand, 0.2),
      logo_url: c.logo_url || '/logo.png',
      vertical: c.primary_vertical,
      contact_email: c.contact_email || null,
      contact_phone: c.contact_phone || null,
      address: c.address || null,
      receipt_footer: c.receipt_footer || null,
      wa_signature: c.wa_signature || null,
      email_signature: c.email_signature || null,
      currency_code: c.currency_code || 'IDR',
      locale: c.locale || 'id-ID',
      // P5 — Theme Studio
      font_family: c.font_family || null,
      bg_config: c.bg_config ? (() => { try { return JSON.parse(c.bg_config); } catch { return null; } })() : null,
    });
  });

  // POST /branding/logo — upload tenant logo (multipart, field "logo").
  // Auto-scopes to current company via req.companyScope; super-admin can pass ?company_id=X.
  router.post('/branding/logo', requireAdmin, (req, res) => {
    const upload = opts.uploadMiddleware;
    if (!upload) return res.status(500).json({ error: 'upload middleware not configured' });
    upload.single('logo')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'no logo uploaded (field name: logo)' });
      const sc = req.companyScope || {};
      let companyId = sc.company_id;
      const reqCid = parseInt(req.query.company_id || req.body?.company_id, 10);
      if (reqCid && (sc.is_super_admin || !companyId)) companyId = reqCid;
      if (!companyId) {
        const row = db.prepare(`SELECT id FROM companies WHERE status='active' ORDER BY id LIMIT 1`).get();
        companyId = row?.id;
      }
      if (!companyId) return res.status(400).json({ error: 'no company scope and no active company' });
      const url = `/uploads/${req.file.filename}`;
      try {
        const r = db.prepare(`UPDATE companies SET logo_url = ? WHERE id = ?`).run(url, companyId);
        if (!r.changes) return res.status(404).json({ error: 'company not found' });
        if (typeof global.logAudit === 'function') global.logAudit(req, { action: 'branding.logo_upload', entity: 'company', entity_id: companyId, payload: { url } });
        res.json({ ok: true, company_id: companyId, logo_url: url });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
  });

  // DELETE /branding/logo — remove tenant logo (fallback to platform default)
  router.delete('/branding/logo', requireAdmin, (req, res) => {
    const sc = req.companyScope || {};
    let companyId = sc.company_id;
    const reqCid = parseInt(req.query.company_id, 10);
    if (reqCid && (sc.is_super_admin || !companyId)) companyId = reqCid;
    if (!companyId) {
      const row = db.prepare(`SELECT id FROM companies WHERE status='active' ORDER BY id LIMIT 1`).get();
      companyId = row?.id;
    }
    if (!companyId) return res.status(400).json({ error: 'no company scope and no active company' });
    try {
      db.prepare(`UPDATE companies SET logo_url = NULL WHERE id = ?`).run(companyId);
      res.json({ ok: true, company_id: companyId });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // PUT /branding — update brand color / name (no logo here; use /branding/logo for that)
  router.put('/branding', requireAdmin, (req, res) => {
    const sc = req.companyScope || {};
    let companyId = sc.company_id;
    // Super-admin bisa override via body. Also: kalau no scope, accept body.company_id
    // (sinkron dgn GET behavior yg ada fallback)
    if (req.body && req.body.company_id) {
      const bid = parseInt(req.body.company_id, 10);
      if (sc.is_super_admin || !companyId) companyId = bid;
    }
    if (!companyId) {
      // Fallback ke first active company (sama dgn GET behavior)
      const row = db.prepare(`SELECT id FROM companies WHERE status='active' ORDER BY id LIMIT 1`).get();
      companyId = row?.id;
    }
    if (!companyId) return res.status(400).json({ error: 'no company scope and no active company' });
    const b = req.body || {};
    const sets = [], params = [];
    const allowed = ['brand_color', 'name', 'brand_short', 'contact_email', 'contact_phone', 'address', 'receipt_footer', 'wa_signature', 'email_signature', 'currency_code', 'locale', 'font_family'];
    for (const k of allowed) {
      if (b[k] !== undefined) { sets.push(`${k} = ?`); params.push(b[k]); }
    }
    // bg_config — serialize JSON kalau ada
    if (b.bg_config !== undefined) {
      sets.push('bg_config = ?');
      params.push(b.bg_config ? JSON.stringify(b.bg_config) : null);
    }
    if (!sets.length) return res.json({ ok: true, noop: true });
    params.push(companyId);
    db.prepare(`UPDATE companies SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    if (typeof global.logAudit === 'function') global.logAudit(req, { action: 'branding.update', entity: 'company', entity_id: companyId, payload: b });
    res.json({ ok: true, company_id: companyId });
  });

  // ─── P4C — Custom domain management (MUST come BEFORE /:id) ────────
  router.get('/custom-domain', (req, res) => {
    const cid = parseInt(req.headers['x-company-id'], 10);
    if (!cid) return res.status(401).json({ error: 'company scope required' });
    const row = db.prepare(`SELECT custom_domain, custom_domain_verified, custom_domain_token
      FROM companies WHERE id = ?`).get(cid);
    res.json({
      domain: row?.custom_domain || null,
      verified: !!row?.custom_domain_verified,
      verification_token: row?.custom_domain_token || null,
      dns_target: 'karyaos-app.com',
      txt_record_name: row?.custom_domain ? `_karyaos.${row.custom_domain}` : null,
      txt_record_value: row?.custom_domain_token ? `karyaos-verify=${row.custom_domain_token}` : null,
    });
  });

  router.put('/custom-domain', requireAdmin, (req, res) => {
    const cid = parseInt(req.headers['x-company-id'], 10);
    if (!cid) return res.status(401).json({ error: 'company scope required' });
    const raw = String(req.body?.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!raw) {
      db.prepare(`UPDATE companies SET custom_domain = NULL, custom_domain_verified = 0, custom_domain_token = NULL WHERE id = ?`).run(cid);
      return res.json({ ok: true, cleared: true });
    }
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(raw)) {
      return res.status(400).json({ error: 'Invalid domain format' });
    }
    const taken = db.prepare(`SELECT id FROM companies WHERE LOWER(custom_domain) = ? AND id <> ?`).get(raw, cid);
    if (taken) return res.status(409).json({ error: 'Domain already in use by another tenant' });

    const token = require('crypto').randomBytes(12).toString('hex');
    db.prepare(`UPDATE companies SET custom_domain = ?, custom_domain_verified = 0, custom_domain_token = ? WHERE id = ?`)
      .run(raw, token, cid);
    if (typeof global.logAudit === 'function') {
      try { global.logAudit(req, { action: 'custom_domain.set', entity: 'company', entity_id: cid, payload: { domain: raw } }); } catch {}
    }
    res.json({ ok: true, domain: raw, verification_token: token });
  });

  router.post('/custom-domain/verify', requireAdmin, async (req, res) => {
    const cid = parseInt(req.headers['x-company-id'], 10);
    if (!cid) return res.status(401).json({ error: 'company scope required' });
    const row = db.prepare(`SELECT custom_domain, custom_domain_token FROM companies WHERE id = ?`).get(cid);
    if (!row?.custom_domain || !row?.custom_domain_token) return res.status(400).json({ error: 'No pending domain' });
    try {
      const dns = require('dns').promises;
      const records = await dns.resolveTxt(`_karyaos.${row.custom_domain}`).catch(() => []);
      const flat = records.flat().map(s => String(s));
      const expected = `karyaos-verify=${row.custom_domain_token}`;
      const found = flat.some(v => v === expected);
      if (!found) {
        return res.status(400).json({ verified: false, error: 'TXT record not found yet (DNS propagation up to 24h)', expected, found_records: flat });
      }
      db.prepare(`UPDATE companies SET custom_domain_verified = 1 WHERE id = ?`).run(cid);
      if (typeof global.logAudit === 'function') {
        try { global.logAudit(req, { action: 'custom_domain.verify', entity: 'company', entity_id: cid }); } catch {}
      }
      res.json({ verified: true, domain: row.custom_domain });
    } catch (e) {
      res.status(500).json({ error: 'DNS lookup failed: ' + e.message });
    }
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'company not found' });
    res.json(row);
  });

  // Create (super-admin only)
  router.post('/', requireAdmin, (req, res) => {
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

  // PUT /:id — update company fields (super-admin only)
  router.put('/:id', requireAdmin, (req, res) => {
    const isSuperAdmin = String(req.headers['x-super-admin'] || '') === 'true';
    if (!isSuperAdmin) return res.status(403).json({ error: 'super-admin only' });
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    const b = req.body || {};
    const sets = [], params = [];
    const allowed = ['code', 'name', 'primary_vertical', 'brand_color', 'contact_email', 'contact_phone', 'address', 'npwp', 'status'];
    for (const k of allowed) {
      if (b[k] !== undefined) { sets.push(`${k} = ?`); params.push(k === 'code' ? String(b[k]).toUpperCase() : b[k]); }
    }
    if (!sets.length) return res.json({ ok: true, noop: true });
    params.push(id);
    try {
      db.prepare(`UPDATE companies SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      if (typeof global.logAudit === 'function') global.logAudit(req, { action: 'company.update', entity: 'company', entity_id: id, payload: b });
      res.json({ ok: true, id });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'code already exists' });
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /:id — soft delete (set status='inactive'). Hard delete dgn ?hard=1
  // Super-admin only. Tidak bisa delete diri sendiri / company id 1 (root tenant)
  router.delete('/:id', requireAdmin, (req, res) => {
    const isSuperAdmin = String(req.headers['x-super-admin'] || '') === 'true';
    if (!isSuperAdmin) return res.status(403).json({ error: 'super-admin only' });
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    if (id === 1) return res.status(403).json({ error: 'cannot delete root tenant (id=1)' });
    const company = db.prepare(`SELECT id, name FROM companies WHERE id = ?`).get(id);
    if (!company) return res.status(404).json({ error: 'company not found' });
    const hard = req.query.hard === '1';
    try {
      if (hard) {
        // Cek dependency basic — kasih warning kalau ada data terkait
        const ticketCount = db.prepare(`SELECT COUNT(*) AS c FROM cinema_tickets WHERE company_id = ?`).get(id)?.c || 0;
        if (ticketCount > 0 && req.query.confirm !== 'destroy') {
          return res.status(409).json({ error: `company has ${ticketCount} tickets. Pass ?hard=1&confirm=destroy to force delete.`, ticket_count: ticketCount });
        }
        db.prepare(`DELETE FROM companies WHERE id = ?`).run(id);
      } else {
        // Soft delete: pakai 'closed' (sesuai CHECK constraint active|suspended|closed)
        db.prepare(`UPDATE companies SET status = 'closed' WHERE id = ?`).run(id);
      }
      if (typeof global.logAudit === 'function') global.logAudit(req, { action: hard ? 'company.delete_hard' : 'company.deactivate', entity: 'company', entity_id: id });
      res.json({ ok: true, id, mode: hard ? 'hard' : 'soft' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── PUBLIC SIGNUP — no auth required ───
  // POST /api/companies/signup
  // Body: { company_name, vertical, owner_name, owner_phone, owner_email, owner_pin }
  // Effect: create company + admin_user + TRIAL billing + default outlet
  // Returns: { ok, company_id, login_pin, signup_token }
  router.post('/signup', (req, res) => {
    const b = req.body || {};
    const required = ['company_name', 'owner_name', 'owner_phone'];
    for (const k of required) {
      if (!b[k] || !String(b[k]).trim()) return res.status(400).json({ error: `${k} wajib diisi` });
    }
    const vertical = ['fnb', 'cinema', 'hybrid'].includes(b.vertical) ? b.vertical : 'fnb';
    // PIN 6-digit (sesuai login admin); auto-gen kalau gak provide
    const pin = (b.owner_pin && /^\d{6}$/.test(b.owner_pin))
      ? b.owner_pin
      : String(Math.floor(100000 + Math.random() * 900000));
    const code = (b.code || generateCompanyCode(b.company_name)).toUpperCase().slice(0, 10);

    // Check duplicate phone (1 phone = 1 owner = 1 company)
    const dupPhone = db.prepare(`SELECT u.id, c.name as company_name FROM admin_users u JOIN companies c ON c.id=u.company_id WHERE u.name LIKE ? AND u.role='owner'`).get('%' + b.owner_phone + '%');
    if (dupPhone) return res.status(409).json({ error: `Nomor sudah terdaftar di ${dupPhone.company_name}` });

    try {
      const now = Math.floor(Date.now() / 1000);
      // 1. Create company
      const companyR = db.prepare(`INSERT INTO companies (code, name, primary_vertical, brand_color, contact_phone, contact_email, status)
        VALUES (?,?,?,?,?,?,?)`).run(
          code, String(b.company_name).trim(), vertical,
          vertical === 'cinema' ? '#a855f7' : vertical === 'hybrid' ? '#22d3ee' : '#f97316',
          b.owner_phone, b.owner_email || null, 'active');
      const companyId = companyR.lastInsertRowid;

      // 2. Create owner admin_user
      const userId = `usr_${companyId}_${now}_${Math.floor(Math.random() * 1000)}`;
      const userName = `${b.owner_name} (${b.owner_phone})`;
      db.prepare(`INSERT INTO admin_users (id, name, pin, role, active, created_at, company_id) VALUES (?,?,?,?,?,?,?)`)
        .run(userId, userName, pin, 'owner', 1, now, companyId);

      // 3. Create default outlet (sample data — biar tenant langsung bisa explore)
      const outletCode = `${code}-001`;
      try {
        db.prepare(`INSERT INTO outlet_master (code, name, area, address, phone, manager, outlet_type, status, seat_capacity, opening_date, vertical, company_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          outletCode, `${b.company_name} - Outlet 1`, '-', '-', b.owner_phone, b.owner_name,
          'Dine-in', 'onboarding', 20, now, vertical, companyId);
      } catch (e) { console.warn('[signup] outlet seed warn:', e.message); }

      // 4. Auto-assign TRIAL billing (14 hari)
      const trialEnd = now + 14 * 86400;
      try {
        db.prepare(`INSERT INTO tenant_billing (company_id, plan_code, billing_cycle, amount_idr, next_due_at, trial_until, status)
          VALUES (?,?,?,?,?,?,?)`).run(companyId, 'TRIAL', 'monthly', 0, trialEnd, trialEnd, 'active');
      } catch (e) { console.warn('[signup] trial billing warn:', e.message); }

      const signupToken = `signup_${companyId}_${now}_${Math.random().toString(36).slice(2, 10)}`;

      console.log(`[signup] new tenant — company_id=${companyId} code=${code} vertical=${vertical} owner=${b.owner_phone}`);
      res.json({
        ok: true,
        company_id: companyId,
        company_code: code,
        company_name: b.company_name,
        vertical,
        owner_name: b.owner_name,
        owner_phone: b.owner_phone,
        login_pin: pin,
        outlet_code: outletCode,
        trial_until: trialEnd,
        trial_days: 14,
        signup_token: signupToken,
        next_steps: [
          'Login ke admin pakai PIN ' + pin,
          'Set lokasi outlet di Outlet Master → Maps picker',
          'Upload menu / item master',
          'Invite team via Admin Users',
        ],
      });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Code/PIN sudah terpakai, coba lagi' });
      console.error('[signup] error', e);
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
  // P4C — also resolve by Host header (custom_domain CNAME) when no header set
  function resolveScope(req) {
    const cid = parseInt(req.headers['x-company-id'], 10);
    const isSuperAdmin = String(req.headers['x-super-admin'] || '') === 'true';
    if (cid) {
      return { company_id: cid, is_super_admin: false, filter_sql: 'company_id = ?', filter_params: [cid] };
    }
    if (isSuperAdmin) {
      return { company_id: null, is_super_admin: true, filter_sql: '1=1', filter_params: [] };
    }
    // No header — try host-based lookup (custom_domain CNAME)
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0].toLowerCase();
    if (host) {
      try {
        const row = db.prepare(`SELECT id FROM companies WHERE LOWER(custom_domain) = ? AND custom_domain_verified = 1 LIMIT 1`).get(host);
        if (row) return { company_id: row.id, is_super_admin: false, filter_sql: 'company_id = ?', filter_params: [row.id] };
      } catch {}
    }
    // Fallback — treat as super-admin (no scope) for backward compat
    return { company_id: null, is_super_admin: true, filter_sql: '1=1', filter_params: [] };
  }

  // ─── PLATFORM CONFIG STATUS — Phase 4 ───────────────────────────────
  // GET /platform/config-status
  // Per-tenant: web config customization status + completion %
  // Aggregate: totals per status/vertical + avg completion
  router.get('/platform/config-status', (req, res) => {
    const isSuperAdmin = String(req.headers['x-super-admin'] || '') === 'true';
    if (!isSuperAdmin) return res.status(403).json({ error: 'super-admin only' });

    // Fields yg ada di cinema_web_config + bobot completion
    const CONFIG_FIELDS = ['nav_items', 'footer_config', 'faq_groups', 'section_toggles', 'page_heros', 'custom_sections', 'custom_pages'];
    // Field branding di companies
    const BRAND_FIELDS = ['name', 'brand_short', 'brand_color', 'logo_url', 'contact_email', 'contact_phone', 'address', 'receipt_footer', 'wa_signature', 'email_signature'];
    const TOTAL_FIELDS = CONFIG_FIELDS.length + BRAND_FIELDS.length;

    const rows = db.prepare(`
      SELECT c.id, c.code, c.name, c.primary_vertical, c.status, c.brand_color, c.logo_url,
             c.name AS b_name, c.brand_short, c.contact_email, c.contact_phone, c.address,
             c.receipt_footer, c.wa_signature, c.email_signature, c.created_at AS company_created,
             wc.nav_items, wc.footer_config, wc.faq_groups, wc.section_toggles,
             wc.page_heros, wc.custom_sections, wc.custom_pages,
             wc.updated_at AS config_updated_at, wc.updated_by AS config_updated_by
      FROM companies c
      LEFT JOIN cinema_web_config wc ON wc.company_id = c.id
      ORDER BY c.id
    `).all();

    const tenants = rows.map(r => {
      const hasField = (raw) => {
        if (!raw) return false;
        try {
          const v = JSON.parse(raw);
          if (Array.isArray(v)) return v.length > 0;
          if (typeof v === 'object') return Object.keys(v).length > 0;
          return !!v;
        } catch { return false; }
      };
      const branding = {
        name:            !!r.b_name,
        brand_short:     !!r.brand_short,
        brand_color:     !!r.brand_color && r.brand_color !== '#FF6B35',
        logo_url:        !!r.logo_url && r.logo_url !== '/logo.png',
        contact_email:   !!r.contact_email,
        contact_phone:   !!r.contact_phone,
        address:         !!r.address,
        receipt_footer:  !!r.receipt_footer,
        wa_signature:    !!r.wa_signature,
        email_signature: !!r.email_signature,
      };
      const config = {
        nav_items:       hasField(r.nav_items),
        footer_config:   hasField(r.footer_config),
        faq_groups:      hasField(r.faq_groups),
        section_toggles: hasField(r.section_toggles),
        page_heros:      hasField(r.page_heros),
        custom_sections: hasField(r.custom_sections),
        custom_pages:    hasField(r.custom_pages),
      };
      const brandCount = Object.values(branding).filter(Boolean).length;
      const configCount = Object.values(config).filter(Boolean).length;
      const completion = Math.round(((brandCount + configCount) / TOTAL_FIELDS) * 100);
      // Count custom sections/pages items
      let customSectionCount = 0, customPageCount = 0;
      try { customSectionCount = (JSON.parse(r.custom_sections || '[]') || []).length; } catch {}
      try { customPageCount = (JSON.parse(r.custom_pages || '[]') || []).length; } catch {}
      return {
        id: r.id, code: r.code, name: r.name,
        vertical: r.primary_vertical, status: r.status,
        brand_color: r.brand_color, logo_url: r.logo_url,
        branding, config,
        custom_section_count: customSectionCount,
        custom_page_count: customPageCount,
        completion_pct: completion,
        completion_label:
          completion >= 80 ? 'excellent' :
          completion >= 50 ? 'good' :
          completion >= 20 ? 'partial' : 'minimal',
        config_updated_at: r.config_updated_at || null,
        config_updated_by: r.config_updated_by || null,
        is_default: brandCount === 0 && configCount === 0,
      };
    });

    // Aggregates
    const totalTenants = tenants.length;
    const byStatus = {};
    const byVertical = {};
    const byCompletionBand = { excellent: 0, good: 0, partial: 0, minimal: 0 };
    let sumCompletion = 0;
    let configuredCount = 0;  // tenants yg punya minimal 1 customization
    let recentlyEdited = 0;   // edited dalam 7 hari terakhir
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
    tenants.forEach(t => {
      byStatus[t.status || 'active'] = (byStatus[t.status || 'active'] || 0) + 1;
      byVertical[t.vertical || 'unknown'] = (byVertical[t.vertical || 'unknown'] || 0) + 1;
      byCompletionBand[t.completion_label]++;
      sumCompletion += t.completion_pct;
      if (!t.is_default) configuredCount++;
      if (t.config_updated_at && t.config_updated_at >= sevenDaysAgo) recentlyEdited++;
    });
    const avgCompletion = totalTenants ? Math.round(sumCompletion / totalTenants) : 0;

    res.json({
      ok: true,
      tenants,
      aggregate: {
        total: totalTenants,
        by_status: byStatus,
        by_vertical: byVertical,
        by_completion: byCompletionBand,
        avg_completion_pct: avgCompletion,
        configured_count: configuredCount,
        default_only_count: totalTenants - configuredCount,
        recently_edited_7d: recentlyEdited,
      },
    });
  });

  // ─── CUSTOM REPORT BUILDER — Phase 6 ──────────────────────────────
  // POST /platform/custom-report
  // Body: { metrics[], tenants[]|"all", date_from, date_to, group_by }
  // metric keys: revenue, tickets_sold, orders_count, avg_ticket_price, fnb_attach_rate, loyalty_points
  // group_by: tenant | outlet | day | week | month
  router.post('/platform/custom-report', (req, res) => {
    const isSuperAdmin = String(req.headers['x-super-admin'] || '') === 'true';
    if (!isSuperAdmin) return res.status(403).json({ error: 'super-admin only' });
    const b = req.body || {};
    const metrics = Array.isArray(b.metrics) && b.metrics.length ? b.metrics : ['revenue', 'tickets_sold', 'orders_count'];
    const tenantsFilter = b.tenants === 'all' ? null : (Array.isArray(b.tenants) ? b.tenants.map(Number).filter(Boolean) : null);
    const dateFrom = b.date_from ? Math.floor(new Date(b.date_from).getTime() / 1000) : (Math.floor(Date.now() / 1000) - 30 * 86400);
    const dateTo   = b.date_to   ? Math.floor(new Date(b.date_to).getTime() / 1000)   : Math.floor(Date.now() / 1000);
    const groupBy  = ['tenant', 'outlet', 'day', 'week', 'month'].includes(b.group_by) ? b.group_by : 'tenant';

    // Companies scope filter
    const companyFilter = tenantsFilter
      ? `AND c.id IN (${tenantsFilter.join(',')})`
      : '';
    const companies = db.prepare(`SELECT id, code, name, primary_vertical FROM companies WHERE 1=1 ${companyFilter} ORDER BY id`).all();

    // Aggregate per tenant
    const rows = companies.map(c => {
      const row = { tenant_id: c.id, tenant_code: c.code, tenant_name: c.name, vertical: c.primary_vertical };

      if (metrics.includes('revenue')) {
        // F&B revenue (orders.total, ms ts)
        const fnb = safeGet(db, `SELECT COALESCE(SUM(total),0) AS r FROM orders WHERE company_id = ? AND time BETWEEN ? AND ?`, [c.id, dateFrom * 1000, dateTo * 1000])?.r || 0;
        // Cinema revenue (cinema_tickets.price, sold_at sec)
        const cinema = safeGet(db, `SELECT COALESCE(SUM(price),0) AS r FROM cinema_tickets WHERE company_id = ? AND sold_at BETWEEN ? AND ? AND (payment_status IS NULL OR payment_status IN ('paid','settlement','capture'))`, [c.id, dateFrom, dateTo])?.r || 0;
        row.revenue_fnb = fnb;
        row.revenue_cinema = cinema;
        row.revenue_total = fnb + cinema;
      }

      if (metrics.includes('tickets_sold')) {
        const cnt = safeGet(db, `SELECT COUNT(*) AS c FROM cinema_tickets WHERE company_id = ? AND sold_at BETWEEN ? AND ? AND (payment_status IS NULL OR payment_status IN ('paid','settlement','capture'))`, [c.id, dateFrom, dateTo])?.c || 0;
        row.tickets_sold = cnt;
      }

      if (metrics.includes('orders_count')) {
        const cnt = safeGet(db, `SELECT COUNT(*) AS c FROM orders WHERE company_id = ? AND time BETWEEN ? AND ?`, [c.id, dateFrom * 1000, dateTo * 1000])?.c || 0;
        row.orders_count = cnt;
      }

      if (metrics.includes('avg_ticket_price')) {
        const avg = safeGet(db, `SELECT COALESCE(AVG(price),0) AS a FROM cinema_tickets WHERE company_id = ? AND sold_at BETWEEN ? AND ? AND (payment_status IS NULL OR payment_status IN ('paid','settlement','capture'))`, [c.id, dateFrom, dateTo])?.a || 0;
        row.avg_ticket_price = Math.round(avg);
      }

      if (metrics.includes('fnb_attach_rate')) {
        // % cinema purchases (unique purchase_id) yg ada F&B bundle
        const totalPurchases = safeGet(db, `SELECT COUNT(DISTINCT purchase_id) AS c FROM cinema_tickets WHERE company_id = ? AND sold_at BETWEEN ? AND ? AND purchase_id IS NOT NULL`, [c.id, dateFrom, dateTo])?.c || 0;
        const withFnb = safeGet(db, `SELECT COUNT(DISTINCT purchase_id) AS c FROM cinema_purchase_bundles WHERE purchase_id IN (SELECT DISTINCT purchase_id FROM cinema_tickets WHERE company_id = ? AND sold_at BETWEEN ? AND ?)`, [c.id, dateFrom, dateTo])?.c || 0;
        row.fnb_attach_pct = totalPurchases > 0 ? Math.round((withFnb / totalPurchases) * 100) : 0;
        row.fnb_attach_count = withFnb;
        row.total_purchases = totalPurchases;
      }

      if (metrics.includes('loyalty_points')) {
        // Try both F&B (point_transactions) and Cinema (cinema_loyalty_transactions)
        let earned = 0;
        try { earned += safeGet(db, `SELECT COALESCE(SUM(amount),0) AS s FROM point_transactions WHERE company_id = ? AND amount > 0 AND created_at BETWEEN ? AND ?`, [c.id, dateFrom, dateTo])?.s || 0; } catch {}
        try { earned += safeGet(db, `SELECT COALESCE(SUM(amount),0) AS s FROM cinema_loyalty_transactions WHERE company_id = ? AND amount > 0 AND created_at BETWEEN ? AND ?`, [c.id, dateFrom, dateTo])?.s || 0; } catch {}
        row.loyalty_points_earned = earned;
      }

      return row;
    });

    // Totals (sum across tenants)
    const totals = {};
    metrics.forEach(m => {
      if (m === 'revenue') {
        totals.revenue_fnb    = rows.reduce((s, r) => s + (r.revenue_fnb || 0), 0);
        totals.revenue_cinema = rows.reduce((s, r) => s + (r.revenue_cinema || 0), 0);
        totals.revenue_total  = rows.reduce((s, r) => s + (r.revenue_total || 0), 0);
      } else if (m === 'tickets_sold')       totals.tickets_sold = rows.reduce((s, r) => s + (r.tickets_sold || 0), 0);
      else if (m === 'orders_count')         totals.orders_count = rows.reduce((s, r) => s + (r.orders_count || 0), 0);
      else if (m === 'avg_ticket_price') {
        // Weighted avg
        const cnt = rows.reduce((s, r) => s + (r.tickets_sold || 0), 0);
        const sum = rows.reduce((s, r) => s + (r.avg_ticket_price || 0) * (r.tickets_sold || 0), 0);
        totals.avg_ticket_price = cnt > 0 ? Math.round(sum / cnt) : 0;
      }
      else if (m === 'fnb_attach_rate') {
        const t = rows.reduce((s, r) => s + (r.total_purchases || 0), 0);
        const w = rows.reduce((s, r) => s + (r.fnb_attach_count || 0), 0);
        totals.fnb_attach_pct = t > 0 ? Math.round((w / t) * 100) : 0;
        totals.fnb_attach_count = w;
        totals.total_purchases = t;
      }
      else if (m === 'loyalty_points') totals.loyalty_points_earned = rows.reduce((s, r) => s + (r.loyalty_points_earned || 0), 0);
    });

    res.json({
      ok: true,
      meta: {
        metrics, group_by: groupBy,
        date_from: new Date(dateFrom * 1000).toISOString(),
        date_to: new Date(dateTo * 1000).toISOString(),
        tenant_count: rows.length,
      },
      rows,
      totals,
    });
  });

  return { router, db, resolveScope };
}

module.exports = { setupCompanies };
