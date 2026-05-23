// server/master-category-backend.js
// Master Category — kategori & sub-kategori produk (2 level hierarki).
// Tiap kategori dipetakan ke akun COA (Pendapatan & HPP) — penjualan
// produk dalam kategori posting ke akun yang benar.
//
//   GET  /api/master-category            — kategori + sub + COA mapping
//   POST /api/master-category            — tambah kategori / sub-kategori
//   POST /api/master-category/:id/toggle — aktif / nonaktif

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS product_category_master (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, name TEXT, parent_code TEXT,
  sales_account TEXT, cogs_account TEXT, is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;

function setupMasterCategory(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };

  if (db.prepare(`SELECT COUNT(*) c FROM product_category_master`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO product_category_master (code, name, parent_code, sales_account, cogs_account, is_active) VALUES (?,?,?,?,?,1)`);
    let ci = 1, si = 1;
    // [kategori, salesAccount, cogsAccount, [sub-kategori...]]
    [
      ['Frozen Yogurt', '4-1100', '5-1100', ['Original', 'Signature', 'Premium', 'Collab Series']],
      ['Beverage', '4-1100', '5-1100', ['Smoothie', 'Yogurt Drink']],
      ['Topping', '4-1100', '5-1200', ['Buah Segar', 'Crunchy', 'Saus & Selai']],
      ['Take Home', '4-1200', '5-1100', ['Pint', 'Quart', 'Family Pack']],
      ['Add-on', '4-1100', '5-1100', ['Extra Topping', 'Cone Upgrade']],
    ].forEach(([cat, sa, ca, subs]) => {
      const code = `CAT-${String(ci++).padStart(3, '0')}`;
      ins.run(code, cat, null, sa, ca);
      subs.forEach(sub => ins.run(`SUB-${String(si++).padStart(3, '0')}`, sub, code, sa, ca));
    });
  }

  // akun COA untuk mapping (Pendapatan & HPP)
  const coaAccounts = () => {
    const all = many(`SELECT code, name, account_type FROM coa_accounts WHERE is_active = 1 AND account_type IN ('Pendapatan','HPP') ORDER BY code`);
    return { revenue: all.filter(a => a.account_type === 'Pendapatan'), cogs: all.filter(a => a.account_type === 'HPP') };
  };
  const coaName = () => { const m = {}; for (const a of many(`SELECT code, name FROM coa_accounts`)) m[a.code] = a.name; return m; };

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM product_category_master ORDER BY id`).all();
    const nm = coaName();
    const withCoa = (r) => ({ ...r, sales_account_name: nm[r.sales_account] || '', cogs_account_name: nm[r.cogs_account] || '' });
    const cats = rows.filter(r => !r.parent_code).map(c => ({
      ...withCoa(c), subs: rows.filter(r => r.parent_code === c.code).map(withCoa),
    }));
    res.json({
      categories: cats,
      coa_accounts: coaAccounts(),
      summary: {
        total_categories: cats.length,
        total_subcategories: rows.filter(r => r.parent_code).length,
        active: rows.filter(r => r.is_active).length,
        coa_mapped: cats.filter(c => c.sales_account && c.cogs_account).length,
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'nama wajib' });
    const isSub = !!b.parent_code;
    const parent = isSub ? db.prepare(`SELECT * FROM product_category_master WHERE code = ? AND parent_code IS NULL`).get(b.parent_code) : null;
    if (isSub && !parent) return res.status(404).json({ error: 'kategori induk tidak ditemukan' });
    const pre = isSub ? 'SUB' : 'CAT';
    const n = db.prepare(`SELECT COUNT(*) c FROM product_category_master WHERE code LIKE ?`).get(`${pre}-%`).c;
    // sub-kategori ikut akun COA induk; kategori pakai input
    db.prepare(`INSERT INTO product_category_master (code, name, parent_code, sales_account, cogs_account, is_active) VALUES (?,?,?,?,?,1)`)
      .run(`${pre}-${String(n + 1).padStart(3, '0')}`, String(b.name).trim(), isSub ? b.parent_code : null,
        isSub ? parent.sales_account : (b.sales_account || '4-1100'),
        isSub ? parent.cogs_account : (b.cogs_account || '5-1100'));
    res.json({ ok: true });
  });

  router.post('/:id/toggle', (req, res) => {
    const c = db.prepare(`SELECT * FROM product_category_master WHERE id = ?`).get(req.params.id);
    if (!c) return res.status(404).json({ error: 'kategori tidak ditemukan' });
    db.prepare(`UPDATE product_category_master SET is_active = ? WHERE id = ?`).run(c.is_active ? 0 : 1, c.id);
    res.json({ ok: true });
  });

  router.patch('/:id', (req, res) => {
    const c = db.prepare(`SELECT * FROM product_category_master WHERE id = ?`).get(req.params.id);
    if (!c) return res.status(404).json({ error: 'kategori tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['name', 'sales_account', 'cogs_account']) {
      if (b[k] !== undefined && String(b[k]).trim()) { fields.push(`${k} = ?`); args.push(String(b[k]).trim()); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE product_category_master SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    // If parent renamed COA, optionally propagate to subs:
    if ((b.sales_account || b.cogs_account) && c.parent_code === null) {
      const subFields = [], subArgs = [];
      if (b.sales_account) { subFields.push('sales_account = ?'); subArgs.push(String(b.sales_account)); }
      if (b.cogs_account)  { subFields.push('cogs_account = ?');  subArgs.push(String(b.cogs_account)); }
      subArgs.push(c.code);
      db.prepare(`UPDATE product_category_master SET ${subFields.join(', ')} WHERE parent_code = ?`).run(...subArgs);
    }
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const c = db.prepare(`SELECT * FROM product_category_master WHERE id = ?`).get(req.params.id);
    if (!c) return res.status(404).json({ error: 'kategori tidak ditemukan' });
    // Hapus parent juga ikut hapus children
    if (c.parent_code === null) {
      db.prepare(`DELETE FROM product_category_master WHERE parent_code = ?`).run(c.code);
    }
    db.prepare(`DELETE FROM product_category_master WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/master-category';
  app.use(mountPath, router);
  console.log(`[master-category] mounted at ${mountPath} — product category + COA mapping`);

  return { router, db };
}

module.exports = { setupMasterCategory };
