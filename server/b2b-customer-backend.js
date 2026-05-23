// server/b2b-customer-backend.js
// B2B Customer — master pelanggan korporat untuk Sales Order: PT,
// lintas brand, klien korporat. Profil, NPWP, credit limit, termin.
//
//   GET  /api/b2b-customer            — daftar customer + summary
//   POST /api/b2b-customer            — tambah customer
//   POST /api/b2b-customer/:id/toggle — aktif / nonaktif

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS b2b_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, name TEXT, customer_type TEXT,
  contact_person TEXT, phone TEXT, npwp TEXT, credit_limit REAL, payment_terms TEXT,
  status TEXT DEFAULT 'active', created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const TYPES = ['Antar PT', 'Lintas Brand', 'Korporat', 'Franchise'];
const TERMS = ['COD', 'NET 7', 'NET 14', 'NET 30'];

function setupB2bCustomer(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM b2b_customers`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO b2b_customers (code, name, customer_type, contact_person, phone, npwp, credit_limit, payment_terms, status) VALUES (?,?,?,?,?,?,?,?,?)`);
    let i = 1;
    // [name, type, contact, phone, npwp, creditLimit, terms]
    [
      ['PT Sukses Makmur', 'Korporat', 'Andi Wijaya', '021-5512340', '01.234.567.8-012.000', 50000000, 'NET 30'],
      ['Kopi Nusantara (Brand Sister)', 'Lintas Brand', 'Sari Melati', '022-7788120', '02.345.678.9-013.000', 30000000, 'NET 14'],
      ['PT Catering Berkah', 'Antar PT', 'Budi Santoso', '021-6634520', '03.456.789.0-014.000', 40000000, 'NET 30'],
      ['Hotel Santika Bandung', 'Korporat', 'Rina Kartika', '022-4451200', '04.567.890.1-015.000', 60000000, 'NET 7'],
      ['PT Mitra Pangan Sejahtera', 'Antar PT', 'Doni Pratama', '021-7723410', '05.678.901.2-016.000', 35000000, 'NET 14'],
      ['Brand Frappe Co', 'Lintas Brand', 'Lina Wati', '021-8890120', '06.789.012.3-017.000', 25000000, 'NET 14'],
      ['Froyo Corner — Franchise Bintaro', 'Franchise', 'Hendra Gunawan', '021-7345610', '07.890.123.4-018.000', 45000000, 'NET 14'],
      ['Froyo Corner — Franchise Yogyakarta', 'Franchise', 'Maya Sari', '0274-556230', '08.901.234.5-019.000', 40000000, 'NET 14'],
    ].forEach(([nm, ty, cp, ph, npwp, cl, tm]) => ins.run(`BC-${String(i++).padStart(3, '0')}`, nm, ty, cp, ph, npwp, cl, tm, 'active'));
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM b2b_customers ORDER BY code`).all();
    const byType = {};
    for (const r of rows) byType[r.customer_type] = (byType[r.customer_type] || 0) + 1;
    res.json({
      customers: rows, customer_types: TYPES, terms: TERMS,
      summary: {
        total: rows.length,
        active: rows.filter(r => r.status === 'active').length,
        total_credit_limit: rows.reduce((s, r) => s + (r.credit_limit || 0), 0),
        by_type: TYPES.map(t => ({ type: t, count: byType[t] || 0 })),
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'nama customer wajib' });
    const n = db.prepare(`SELECT COUNT(*) c FROM b2b_customers`).get().c;
    db.prepare(`INSERT INTO b2b_customers (code, name, customer_type, contact_person, phone, npwp, credit_limit, payment_terms, status)
      VALUES (?,?,?,?,?,?,?,?, 'active')`).run(`BC-${String(n + 1).padStart(3, '0')}`, String(b.name).trim(),
      TYPES.includes(b.customer_type) ? b.customer_type : 'Korporat', (b.contact_person || '-').trim(),
      (b.phone || '-').trim(), (b.npwp || '-').trim(), Number(b.credit_limit) || 0,
      TERMS.includes(b.payment_terms) ? b.payment_terms : 'NET 14');
    res.json({ ok: true });
  });

  router.post('/:id/toggle', (req, res) => {
    const c = db.prepare(`SELECT * FROM b2b_customers WHERE id = ?`).get(req.params.id);
    if (!c) return res.status(404).json({ error: 'customer tidak ditemukan' });
    db.prepare(`UPDATE b2b_customers SET status = ? WHERE id = ?`).run(c.status === 'active' ? 'inactive' : 'active', c.id);
    res.json({ ok: true });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM b2b_customers WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['code', 'name', 'customer_type', 'contact_person', 'phone', 'npwp', 'credit_limit', 'payment_terms', 'status']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE b2b_customers SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM b2b_customers WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/b2b-customer';
  app.use(mountPath, router);
  console.log(`[b2b-customer] mounted at ${mountPath} — B2B customer master`);

  return { router, db };
}

module.exports = { setupB2bCustomer };
