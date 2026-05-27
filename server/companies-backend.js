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
                                  currency_code, locale
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
    });
  });

  // POST /branding/logo — upload tenant logo (multipart, field "logo").
  // Auto-scopes to current company via req.companyScope; super-admin can pass ?company_id=X.
  router.post('/branding/logo', (req, res) => {
    const upload = opts.uploadMiddleware;
    if (!upload) return res.status(500).json({ error: 'upload middleware not configured' });
    upload.single('logo')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'no logo uploaded (field name: logo)' });
      const sc = req.companyScope || {};
      let companyId = sc.company_id;
      if (sc.is_super_admin && req.query.company_id) companyId = parseInt(req.query.company_id, 10);
      if (!companyId) return res.status(400).json({ error: 'no company scope; pass ?company_id for super-admin' });
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
  router.delete('/branding/logo', (req, res) => {
    const sc = req.companyScope || {};
    let companyId = sc.company_id;
    if (sc.is_super_admin && req.query.company_id) companyId = parseInt(req.query.company_id, 10);
    if (!companyId) return res.status(400).json({ error: 'no company scope' });
    try {
      db.prepare(`UPDATE companies SET logo_url = NULL WHERE id = ?`).run(companyId);
      res.json({ ok: true, company_id: companyId });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // PUT /branding — update brand color / name (no logo here; use /branding/logo for that)
  router.put('/branding', (req, res) => {
    const sc = req.companyScope || {};
    let companyId = sc.company_id;
    if (sc.is_super_admin && req.body.company_id) companyId = parseInt(req.body.company_id, 10);
    if (!companyId) return res.status(400).json({ error: 'no company scope' });
    const b = req.body || {};
    const sets = [], params = [];
    const allowed = ['brand_color', 'name', 'brand_short', 'contact_email', 'contact_phone', 'address', 'receipt_footer', 'wa_signature', 'email_signature', 'currency_code', 'locale'];
    for (const k of allowed) {
      if (b[k] !== undefined) { sets.push(`${k} = ?`); params.push(b[k]); }
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

  router.put('/custom-domain', (req, res) => {
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

  router.post('/custom-domain/verify', async (req, res) => {
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

  return { router, db, resolveScope };
}

module.exports = { setupCompanies };
