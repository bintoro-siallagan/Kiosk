// server/departments-backend.js
// karyaOS — Departments Master Data
// Dynamic — admin bisa CRUD departemen via /api/departments.
// Dipakai oleh KOLR launch, Service Visit, User KPI.
//
// Seeded default: 9 dept dari outlet launch (construction, it, hr,
// operations, supply_chain, marketing, finance, compliance, qa) +
// extra service depts (maintenance, supplier, facility).

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS departments (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  description TEXT,
  display_order INTEGER DEFAULT 100,
  active INTEGER DEFAULT 1,
  applies_to TEXT DEFAULT 'all',         -- 'all' | 'launch' | 'service' | 'audit'
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER
);
`;

const SEED = [
  // Launch dept (9)
  { code: 'construction', label: 'Construction & Fit-Out', icon: '🏗️', color: '#f59e0b', order: 10, applies_to: 'launch' },
  { code: 'it',           label: 'IT & Tech',              icon: '💻', color: '#22d3ee', order: 20, applies_to: 'all' },
  { code: 'hr',           label: 'HR & Training',          icon: '👥', color: '#a855f7', order: 30, applies_to: 'all' },
  { code: 'operations',   label: 'Operations & SOP',       icon: '⚙️', color: '#10b981', order: 40, applies_to: 'all' },
  { code: 'supply_chain', label: 'Supply Chain & Stock',   icon: '📦', color: '#3b82f6', order: 50, applies_to: 'all' },
  { code: 'marketing',    label: 'Marketing & Promo',      icon: '📢', color: '#ec4899', order: 60, applies_to: 'all' },
  { code: 'finance',      label: 'Finance & Cash Float',   icon: '💰', color: '#06b6d4', order: 70, applies_to: 'all' },
  { code: 'compliance',   label: 'Compliance & Legal',     icon: '⚖️', color: '#84cc16', order: 80, applies_to: 'all' },
  { code: 'qa',           label: 'Quality Assurance',       icon: '🔍', color: '#f43f5e', order: 90, applies_to: 'all' },
  // Service-specific dept
  { code: 'maintenance',  label: 'Maintenance',             icon: '🔧', color: '#0ea5e9', order: 100, applies_to: 'service' },
  { code: 'supplier',     label: 'Supplier / Vendor',       icon: '🚚', color: '#14b8a6', order: 110, applies_to: 'service' },
  { code: 'facility',     label: 'Facility / Building',     icon: '🏢', color: '#64748b', order: 120, applies_to: 'service' },
  // Outlet roles
  { code: 'cashier',      label: 'Kasir Outlet',            icon: '🧾', color: '#fbbf24', order: 200, applies_to: 'audit' },
  { code: 'crew',         label: 'Kru Outlet',              icon: '🤝', color: '#fb923c', order: 210, applies_to: 'audit' },
  { code: 'manager',      label: 'Manager Outlet',          icon: '👔', color: '#e879f9', order: 220, applies_to: 'all' },
];

function setupDepartments(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  // Seed if empty
  const cnt = db.prepare(`SELECT COUNT(*) c FROM departments`).get().c;
  if (cnt === 0) {
    const ins = db.prepare(`INSERT INTO departments (code, label, icon, color, description, display_order, applies_to) VALUES (?,?,?,?,?,?,?)`);
    for (const d of SEED) ins.run(d.code, d.label, d.icon, d.color, d.description || null, d.order, d.applies_to);
    console.log(`[departments] seeded ${SEED.length} default departments`);
  }

  const router = express.Router();

  router.get('/', (req, res) => {
    const applies = req.query.applies_to;
    const where = applies ? `WHERE active=1 AND (applies_to='all' OR applies_to=?)` : `WHERE active=1`;
    const args = applies ? [applies] : [];
    const rows = db.prepare(`SELECT * FROM departments ${where} ORDER BY display_order, label`).all(...args);
    res.json({ data: rows });
  });

  router.get('/all', (req, res) => {
    const rows = db.prepare(`SELECT * FROM departments ORDER BY display_order, label`).all();
    res.json({ data: rows });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.code || !b.label) return res.status(400).json({ error: 'code + label wajib' });
    const code = String(b.code).toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const existing = db.prepare(`SELECT code FROM departments WHERE code=?`).get(code);
    if (existing) {
      db.prepare(`UPDATE departments SET label=?, icon=?, color=?, description=?, display_order=?, applies_to=?, active=?, updated_at=strftime('%s','now') WHERE code=?`)
        .run(b.label, b.icon || null, b.color || null, b.description || null, b.display_order || 999, b.applies_to || 'all', b.active === false ? 0 : 1, code);
    } else {
      db.prepare(`INSERT INTO departments (code, label, icon, color, description, display_order, applies_to, active) VALUES (?,?,?,?,?,?,?,?)`)
        .run(code, b.label, b.icon || null, b.color || null, b.description || null, b.display_order || 999, b.applies_to || 'all', b.active === false ? 0 : 1);
    }
    res.json({ ok: true, code });
  });

  router.delete('/:code', (req, res) => {
    // Soft-delete (active=0) untuk preserve historical references
    db.prepare(`UPDATE departments SET active=0, updated_at=strftime('%s','now') WHERE code=?`).run(req.params.code);
    res.json({ ok: true });
  });

  router.post('/:code/restore', (req, res) => {
    db.prepare(`UPDATE departments SET active=1, updated_at=strftime('%s','now') WHERE code=?`).run(req.params.code);
    res.json({ ok: true });
  });

  app.use(opts.mountPath || '/api/departments', router);
  console.log(`[departments] mounted at ${opts.mountPath || '/api/departments'}`);
  return { router, db };
}

module.exports = { setupDepartments };
