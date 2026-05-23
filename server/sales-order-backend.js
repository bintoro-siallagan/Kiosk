// server/sales-order-backend.js
// Sales Order — penjualan B2B: antar PT, lintas brand, klien korporat.
// Beda dari POS retail — ada termin pembayaran & alur SO → fulfill →
// invoice.
//
//   GET  /api/sales-order             — daftar SO + summary
//   POST /api/sales-order             — buat SO
//   POST /api/sales-order/:id/advance — naikkan status

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sales_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, so_number TEXT, customer_type TEXT, customer_name TEXT,
  items TEXT, subtotal REAL, tax REAL, total REAL, payment_terms TEXT,
  status TEXT DEFAULT 'draft', notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), fulfilled_at INTEGER, invoiced_at INTEGER
);
`;
const CUST_TYPES = ['Antar PT', 'Lintas Brand', 'Korporat', 'Franchise'];
const TERMS = ['COD', 'NET 7', 'NET 14', 'NET 30'];
const FLOW = ['draft', 'confirmed', 'fulfilled', 'invoiced'];
const nowSec = () => Math.floor(Date.now() / 1000);
const J = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };
const lineTotal = (its) => its.reduce((s, i) => s + (i.qty || 0) * (i.unit_price || 0), 0);

function setupSalesOrder(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const genNo = () => `SO-202605-${String(db.prepare(`SELECT COUNT(*) c FROM sales_orders`).get().c + 1).padStart(3, '0')}`;

  if (db.prepare(`SELECT COUNT(*) c FROM sales_orders`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO sales_orders
      (so_number, customer_type, customer_name, items, subtotal, tax, total, payment_terms, status, created_at, fulfilled_at, invoiced_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    const N = nowSec(); let i = 1;
    // [custType, custName, items[[name,qty,unit,price]], terms, status, daysAgo]
    [
      ['Korporat', 'PT Sukses Makmur', [['Original Froyo', 200, 'cup', 18000], ['Chocolate Froyo', 150, 'cup', 19000]], 'NET 30', 'fulfilled', 8],
      ['Lintas Brand', 'Kopi Nusantara (Brand Sister)', [['Yogurt Base Plain', 80, 'kg', 58000]], 'NET 14', 'confirmed', 3],
      ['Antar PT', 'PT Catering Berkah', [['Froyo Cup Mix', 500, 'cup', 16000]], 'NET 30', 'invoiced', 14],
      ['Korporat', 'Hotel Santika Bandung', [['Dessert Platter', 60, 'pax', 45000]], 'NET 7', 'draft', 1],
      ['Antar PT', 'PT Mitra Pangan Sejahtera', [['Granola Topping', 40, 'kg', 88000], ['Mochi Topping', 25, 'kg', 95000]], 'NET 14', 'fulfilled', 6],
    ].forEach(([ct, cn, items, terms, st, d]) => {
      const its = items.map(([name, qty, unit, price]) => ({ name, qty, unit, unit_price: price, line_total: qty * price }));
      const sub = lineTotal(its), tax = Math.round(sub * 0.11);
      ins.run(genNo(), ct, cn, JSON.stringify(its), sub, tax, sub + tax, terms, st, N - d * 86400,
        ['fulfilled', 'invoiced'].includes(st) ? N - (d - 2) * 86400 : null, st === 'invoiced' ? N - (d - 4) * 86400 : null);
    });
  }

  // posting akuntansi B2B sale → Chart of Accounts
  const shape = (r) => ({
    ...r, items: J(r.items),
    coa_posting: [
      { code: '1-1300', account: 'Piutang Usaha', debit: r.total, credit: 0 },
      { code: '4-1100', account: 'Penjualan', debit: 0, credit: r.subtotal },
      { code: '2-1200', account: 'Hutang Pajak — PPN', debit: 0, credit: r.tax },
    ],
  });

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM sales_orders ORDER BY created_at DESC`).all().map(shape);
    res.json({
      orders: rows, customer_types: CUST_TYPES, terms: TERMS,
      summary: {
        total: rows.length,
        open: rows.filter(r => r.status !== 'invoiced').length,
        fulfilled: rows.filter(r => ['fulfilled', 'invoiced'].includes(r.status)).length,
        total_value: rows.reduce((s, r) => s + (r.total || 0), 0),
        outstanding: rows.filter(r => r.status !== 'invoiced').reduce((s, r) => s + (r.total || 0), 0),
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    const items = (Array.isArray(b.items) ? b.items : []).filter(i => i.name && Number(i.qty) > 0 && Number(i.unit_price) > 0);
    if (!b.customer_name || !items.length) return res.status(400).json({ error: 'customer & minimal 1 item wajib' });
    const its = items.map(i => ({ name: i.name, qty: Number(i.qty), unit: i.unit || 'pcs', unit_price: Number(i.unit_price), line_total: Number(i.qty) * Number(i.unit_price) }));
    const sub = lineTotal(its), tax = Math.round(sub * 0.11);
    db.prepare(`INSERT INTO sales_orders (so_number, customer_type, customer_name, items, subtotal, tax, total, payment_terms, status, notes)
      VALUES (?,?,?,?,?,?,?,?, 'draft', ?)`).run(genNo(),
      CUST_TYPES.includes(b.customer_type) ? b.customer_type : 'Korporat', String(b.customer_name).trim(),
      JSON.stringify(its), sub, tax, sub + tax, TERMS.includes(b.payment_terms) ? b.payment_terms : 'NET 14', (b.notes || '').trim());
    res.json({ ok: true });
  });

  router.post('/:id/advance', (req, res) => {
    const o = db.prepare(`SELECT * FROM sales_orders WHERE id = ?`).get(req.params.id);
    if (!o) return res.status(404).json({ error: 'sales order tidak ditemukan' });
    const idx = FLOW.indexOf(o.status);
    if (idx < 0 || idx >= FLOW.length - 1) return res.status(409).json({ error: 'status sudah final' });
    const next = FLOW[idx + 1];
    db.prepare(`UPDATE sales_orders SET status=?, fulfilled_at=?, invoiced_at=? WHERE id=?`).run(
      next, next === 'fulfilled' ? nowSec() : o.fulfilled_at, next === 'invoiced' ? nowSec() : o.invoiced_at, o.id);
    res.json({ ok: true, status: next });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM sales_orders WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['so_number', 'customer_type', 'customer_name', 'items', 'subtotal', 'tax', 'total', 'payment_terms', 'status', 'notes', 'fulfilled_at', 'invoiced_at']) {
      if (b[k] !== undefined) {
        fields.push(`${k} = ?`);
        args.push(k === 'items' && typeof b[k] !== 'string' ? JSON.stringify(b[k]) : b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE sales_orders SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM sales_orders WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/sales-order';
  app.use(mountPath, router);
  console.log(`[sales-order] mounted at ${mountPath} — B2B sales order`);

  return { router, db };
}

module.exports = { setupSalesOrder };
