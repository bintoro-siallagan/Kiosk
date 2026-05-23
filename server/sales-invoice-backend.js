// server/sales-invoice-backend.js
// Sales Invoice — faktur penjualan B2B. Posting ke COA, pencatatan
// pembayaran (B2B Payment) → lunasin Piutang Usaha (AR).
//
//   GET  /api/sales-invoice          — daftar invoice + summary
//   POST /api/sales-invoice          — buat invoice
//   POST /api/sales-invoice/:id/pay  — catat pembayaran { amount, method }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sales_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_no TEXT, so_ref TEXT, customer_name TEXT,
  customer_type TEXT, items TEXT, subtotal REAL, tax REAL, total REAL, paid_amount REAL DEFAULT 0,
  status TEXT DEFAULT 'unpaid', payment_terms TEXT, due_date INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), paid_at INTEGER
);
`;
const DAY = 86400;
const nowSec = () => Math.floor(Date.now() / 1000);
const J = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };
const sumLines = (its) => its.reduce((s, i) => s + (i.qty || 0) * (i.unit_price || 0), 0);
const statusOf = (paid, total) => paid <= 0 ? 'unpaid' : paid >= total ? 'paid' : 'partial';

function setupSalesInvoice(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const genNo = () => `INV-S-202605-${String(db.prepare(`SELECT COUNT(*) c FROM sales_invoices`).get().c + 1).padStart(3, '0')}`;

  if (db.prepare(`SELECT COUNT(*) c FROM sales_invoices`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO sales_invoices
      (invoice_no, so_ref, customer_name, customer_type, items, subtotal, tax, total, paid_amount, status, payment_terms, due_date, created_at, paid_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const N = nowSec();
    // [so, cust, type, items[[name,qty,unit,price]], terms, paidRatio, daysAgo, dueDays]
    [
      ['SO-202605-003', 'PT Catering Berkah', 'Antar PT', [['Froyo Cup Mix', 500, 'cup', 16000]], 'NET 30', 1, 14, 30],
      ['SO-202605-001', 'PT Sukses Makmur', 'Korporat', [['Original Froyo', 200, 'cup', 18000], ['Chocolate Froyo', 150, 'cup', 19000]], 'NET 30', 0.5, 8, 30],
      ['SO-202605-005', 'PT Mitra Pangan Sejahtera', 'Antar PT', [['Granola Topping', 40, 'kg', 88000]], 'NET 14', 0, 4, 14],
      ['SO-202605-002', 'Kopi Nusantara (Brand Sister)', 'Lintas Brand', [['Yogurt Base Plain', 80, 'kg', 58000]], 'NET 14', 0, 2, 14],
    ].forEach(([so, cn, ct, items, terms, ratio, d, due]) => {
      const its = items.map(([name, qty, unit, price]) => ({ name, qty, unit, unit_price: price, line_total: qty * price }));
      const sub = sumLines(its), tax = Math.round(sub * 0.11), total = sub + tax;
      const paid = Math.round(total * ratio);
      ins.run(genNo(), so, cn, ct, JSON.stringify(its), sub, tax, total, paid, statusOf(paid, total),
        terms, N + (due - d) * DAY, N - d * DAY, ratio >= 1 ? N - (d - 2) * DAY : null);
    });
  }

  const shape = (r) => ({
    ...r, items: J(r.items), outstanding: Math.max(0, r.total - r.paid_amount),
    overdue: r.status !== 'paid' && r.due_date < nowSec(),
    coa_posting: [
      { code: '1-1300', account: 'Piutang Usaha', debit: r.total, credit: 0 },
      { code: '4-1100', account: 'Penjualan', debit: 0, credit: r.subtotal },
      { code: '2-1200', account: 'Hutang Pajak — PPN', debit: 0, credit: r.tax },
    ],
  });

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM sales_invoices ORDER BY created_at DESC`).all().map(shape);
    res.json({
      invoices: rows,
      summary: {
        total: rows.length,
        unpaid: rows.filter(r => r.status !== 'paid').length,
        ar_outstanding: rows.reduce((s, r) => s + r.outstanding, 0),
        overdue: rows.filter(r => r.overdue).length,
        total_invoiced: rows.reduce((s, r) => s + r.total, 0),
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    const items = (Array.isArray(b.items) ? b.items : []).filter(i => i.name && Number(i.qty) > 0 && Number(i.unit_price) > 0);
    if (!b.customer_name || !items.length) return res.status(400).json({ error: 'customer & minimal 1 item wajib' });
    const its = items.map(i => ({ name: i.name, qty: Number(i.qty), unit: i.unit || 'pcs', unit_price: Number(i.unit_price), line_total: Number(i.qty) * Number(i.unit_price) }));
    const sub = sumLines(its), tax = Math.round(sub * 0.11);
    db.prepare(`INSERT INTO sales_invoices (invoice_no, so_ref, customer_name, customer_type, items, subtotal, tax, total, payment_terms, due_date)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(genNo(), (b.so_ref || '-').trim(), String(b.customer_name).trim(),
      b.customer_type || 'Korporat', JSON.stringify(its), sub, tax, sub + tax, b.payment_terms || 'NET 14', nowSec() + 14 * DAY);
    res.json({ ok: true });
  });

  // catat pembayaran B2B → lunasin Piutang Usaha
  router.post('/:id/pay', (req, res) => {
    const inv = db.prepare(`SELECT * FROM sales_invoices WHERE id = ?`).get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'invoice tidak ditemukan' });
    if (inv.status === 'paid') return res.status(409).json({ error: 'invoice sudah lunas' });
    const amt = Math.round(Number((req.body || {}).amount) || 0);
    if (!(amt > 0)) return res.status(400).json({ error: 'jumlah pembayaran wajib > 0' });
    const paid = Math.min(inv.total, inv.paid_amount + amt);
    const st = statusOf(paid, inv.total);
    db.prepare(`UPDATE sales_invoices SET paid_amount=?, status=?, paid_at=? WHERE id=?`)
      .run(paid, st, st === 'paid' ? nowSec() : inv.paid_at, inv.id);
    res.json({ ok: true, status: st, paid_amount: paid, outstanding: Math.max(0, inv.total - paid) });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM sales_invoices WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['invoice_no', 'so_ref', 'customer_name', 'customer_type', 'items', 'subtotal', 'tax', 'total', 'paid_amount', 'status', 'payment_terms', 'due_date', 'paid_at']) {
      if (b[k] !== undefined) {
        fields.push(`${k} = ?`);
        args.push(k === 'items' && typeof b[k] !== 'string' ? JSON.stringify(b[k]) : b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE sales_invoices SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM sales_invoices WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/sales-invoice';
  app.use(mountPath, router);
  console.log(`[sales-invoice] mounted at ${mountPath} — B2B sales invoice + payment`);

  return { router, db };
}

module.exports = { setupSalesInvoice };
