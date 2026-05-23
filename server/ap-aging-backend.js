// server/ap-aging-backend.js
// AP Aging — Hutang Usaha (Accounts Payable) aging report. Counterpart
// dari AR, penting buat cash management.
//
//   GET  /api/ap-aging          — hutang vendor per bucket aging
//   POST /api/ap-aging/:id/pay  — catat pembayaran { amount }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ap_payables (
  id INTEGER PRIMARY KEY AUTOINCREMENT, vendor TEXT, invoice_no TEXT,
  invoice_date INTEGER, due_date INTEGER, amount REAL, paid_amount REAL DEFAULT 0,
  status TEXT DEFAULT 'unpaid', created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const nowSec = () => Math.floor(Date.now() / 1000);
const DAY = 86400;

function setupApAging(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM ap_payables`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO ap_payables (vendor, invoice_no, invoice_date, due_date, amount, paid_amount, status) VALUES (?,?,?,?,?,?,?)`);
    const N = nowSec();
    // [vendor, invoiceNo, invoiceDaysAgo, dueInDays(+ akan datang / - lewat), amount, paid, status]
    [
      ['PT Dairy Nusantara', 'INV-DN-0451', 20, 10, 28500000, 0, 'unpaid'],
      ['CV Kemasan Prima', 'INV-KP-0188', 35, -5, 12400000, 0, 'unpaid'],
      ['UD Buah Segar Jaya', 'INV-BS-0712', 50, -20, 9800000, 4000000, 'partial'],
      ['PT Mesin Pangan Tek', 'INV-MP-0033', 75, -45, 45000000, 0, 'unpaid'],
      ['CV Logistik Cepat', 'INV-LC-0290', 12, 18, 6700000, 0, 'unpaid'],
      ['Toko Granola Sehat', 'INV-GS-0144', 8, 22, 5200000, 0, 'unpaid'],
    ].forEach(([v, no, iAgo, due, amt, paid, st]) =>
      ins.run(v, no, N - iAgo * DAY, N + due * DAY, amt, paid, st));
  }

  const bucketOf = (days) => days >= 0 ? 'Belum Jatuh Tempo' : days >= -30 ? '1-30 Hari' : days >= -60 ? '31-60 Hari' : '>60 Hari';
  const BUCKETS = ['Belum Jatuh Tempo', '1-30 Hari', '31-60 Hari', '>60 Hari'];

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const N = nowSec();
    const rows = db.prepare(`SELECT * FROM ap_payables WHERE status != 'paid' ORDER BY due_date`).all().map(r => {
      const days = Math.floor((r.due_date - N) / DAY);
      return { ...r, outstanding: r.amount - r.paid_amount, days_to_due: days, bucket: bucketOf(days), overdue: days < 0 };
    });
    const buckets = BUCKETS.map(b => {
      const items = rows.filter(r => r.bucket === b);
      return { bucket: b, count: items.length, total: items.reduce((a, r) => a + r.outstanding, 0) };
    });
    const totalOutstanding = rows.reduce((a, r) => a + r.outstanding, 0);
    res.json({
      payables: rows, buckets,
      summary: {
        total_outstanding: totalOutstanding,
        overdue_total: rows.filter(r => r.overdue).reduce((a, r) => a + r.outstanding, 0),
        overdue_count: rows.filter(r => r.overdue).length,
        vendor_count: new Set(rows.map(r => r.vendor)).size,
      },
    });
  });

  router.post('/:id/pay', (req, res) => {
    const p = db.prepare(`SELECT * FROM ap_payables WHERE id = ?`).get(req.params.id);
    if (!p) return res.status(404).json({ error: 'hutang tidak ditemukan' });
    if (p.status === 'paid') return res.status(409).json({ error: 'hutang sudah lunas' });
    const amt = Number((req.body || {}).amount) || (p.amount - p.paid_amount);
    const paid = Math.min(p.amount, p.paid_amount + amt);
    db.prepare(`UPDATE ap_payables SET paid_amount = ?, status = ? WHERE id = ?`)
      .run(paid, paid >= p.amount ? 'paid' : 'partial', p.id);
    res.json({ ok: true, paid_amount: paid, status: paid >= p.amount ? 'paid' : 'partial' });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM ap_payables WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['vendor', 'invoice_no', 'invoice_date', 'due_date', 'amount', 'paid_amount', 'status']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE ap_payables SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM ap_payables WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/ap-aging';
  app.use(mountPath, router);
  console.log(`[ap-aging] mounted at ${mountPath} — accounts payable aging`);

  return { router, db };
}

module.exports = { setupApAging };
