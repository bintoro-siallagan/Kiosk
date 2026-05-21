// server/sales-return-backend.js
// Sales Return — retur penjualan B2B (customer balikin barang). Posting
// contra-revenue ke Chart of Accounts: Retur Penjualan + reverse PPN.
//
//   GET  /api/sales-return             — daftar retur + summary
//   POST /api/sales-return             — buat retur
//   POST /api/sales-return/:id/complete — proses retur

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sales_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT, return_no TEXT, so_ref TEXT, customer_name TEXT,
  items TEXT, subtotal REAL, tax REAL, total REAL, reason TEXT, status TEXT DEFAULT 'draft',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), completed_at INTEGER
);
`;
const REASONS = ['Rusak', 'Kualitas Buruk', 'Salah Kirim', 'Tidak Sesuai Pesanan'];
const nowSec = () => Math.floor(Date.now() / 1000);
const J = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };
const sumLines = (its) => its.reduce((s, i) => s + (i.qty || 0) * (i.unit_price || 0), 0);

function setupSalesReturn(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const genNo = () => `SR-202605-${String(db.prepare(`SELECT COUNT(*) c FROM sales_returns`).get().c + 1).padStart(3, '0')}`;

  if (db.prepare(`SELECT COUNT(*) c FROM sales_returns`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO sales_returns
      (return_no, so_ref, customer_name, items, subtotal, tax, total, reason, status, created_at, completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    const N = nowSec();
    // [soRef, customer, items[[name,qty,unit,price]], reason, status, daysAgo]
    [
      ['SO-202605-003', 'PT Catering Berkah', [['Froyo Cup Mix', 50, 'cup', 16000]], 'Rusak', 'completed', 5],
      ['SO-202605-001', 'PT Sukses Makmur', [['Chocolate Froyo', 20, 'cup', 19000]], 'Kualitas Buruk', 'draft', 1],
      ['SO-202605-005', 'PT Mitra Pangan Sejahtera', [['Granola Topping', 5, 'kg', 88000]], 'Salah Kirim', 'completed', 8],
    ].forEach(([so, cn, items, reason, st, d]) => {
      const its = items.map(([name, qty, unit, price]) => ({ name, qty, unit, unit_price: price, line_total: qty * price }));
      const sub = sumLines(its), tax = Math.round(sub * 0.11);
      ins.run(genNo(), so, cn, JSON.stringify(its), sub, tax, sub + tax, reason, st, N - d * 86400,
        st === 'completed' ? N - (d - 1) * 86400 : null);
    });
  }

  // posting contra-revenue → Chart of Accounts
  const shape = (r) => ({
    ...r, items: J(r.items),
    coa_posting: [
      { code: '4-1900', account: 'Retur & Diskon Penjualan', debit: r.subtotal, credit: 0 },
      { code: '2-1200', account: 'Hutang Pajak — PPN (reverse)', debit: r.tax, credit: 0 },
      { code: '1-1300', account: 'Piutang Usaha', debit: 0, credit: r.total },
    ],
  });

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM sales_returns ORDER BY created_at DESC`).all().map(shape);
    res.json({
      returns: rows, reasons: REASONS,
      summary: {
        total: rows.length,
        draft: rows.filter(r => r.status === 'draft').length,
        completed: rows.filter(r => r.status === 'completed').length,
        total_value: rows.reduce((s, r) => s + (r.total || 0), 0),
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    const items = (Array.isArray(b.items) ? b.items : []).filter(i => i.name && Number(i.qty) > 0 && Number(i.unit_price) > 0);
    if (!b.customer_name || !items.length) return res.status(400).json({ error: 'customer & minimal 1 item wajib' });
    const its = items.map(i => ({ name: i.name, qty: Number(i.qty), unit: i.unit || 'pcs', unit_price: Number(i.unit_price), line_total: Number(i.qty) * Number(i.unit_price) }));
    const sub = sumLines(its), tax = Math.round(sub * 0.11);
    db.prepare(`INSERT INTO sales_returns (return_no, so_ref, customer_name, items, subtotal, tax, total, reason, status)
      VALUES (?,?,?,?,?,?,?,?, 'draft')`).run(genNo(), (b.so_ref || '-').trim(), String(b.customer_name).trim(),
      JSON.stringify(its), sub, tax, sub + tax, REASONS.includes(b.reason) ? b.reason : 'Rusak');
    res.json({ ok: true });
  });

  router.post('/:id/complete', (req, res) => {
    const r = db.prepare(`SELECT * FROM sales_returns WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'retur tidak ditemukan' });
    if (r.status === 'completed') return res.status(409).json({ error: 'retur sudah diproses' });
    db.prepare(`UPDATE sales_returns SET status='completed', completed_at=? WHERE id=?`).run(nowSec(), r.id);
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/sales-return';
  app.use(mountPath, router);
  console.log(`[sales-return] mounted at ${mountPath} — B2B sales return + COA posting`);

  return { router, db };
}

module.exports = { setupSalesReturn };
