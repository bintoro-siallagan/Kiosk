// server/ar-backend.js
// Accounts Receivable (Piutang) — invoice ke customer korporat / event
// booking / partner. Aging + tracking pembayaran.
//
//   GET  /api/ar            — daftar invoice + aging + summary
//   POST /api/ar            — buat invoice
//   POST /api/ar/:id/pay    — catat pembayaran masuk

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ar_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  customer TEXT NOT NULL,
  customer_type TEXT DEFAULT 'corporate',
  description TEXT,
  amount REAL NOT NULL,
  paid_amount REAL DEFAULT 0,
  invoice_date INTEGER,
  due_date INTEGER,
  status TEXT DEFAULT 'unpaid',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;

const DAY = 86400;
const nowSec = () => Math.floor(Date.now() / 1000);
const genNumber = (db) => {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const n = db.prepare(`SELECT COUNT(*) c FROM ar_invoices WHERE invoice_number LIKE ?`).get(`AR-${ym}-%`).c;
  return `AR-${ym}-${String(n + 1).padStart(4, '0')}`;
};

function setupAR(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  const router = express.Router();
  router.use(express.json());

  const decorate = (r) => {
    const outstanding = Math.max(0, Math.round(r.amount - r.paid_amount));
    let bucket = 'lunas';
    if (r.status !== 'paid') {
      const over = Math.floor((nowSec() - r.due_date) / DAY);
      bucket = over < 0 ? 'current' : over <= 30 ? 'd30' : over <= 60 ? 'd60' : 'd60p';
    }
    return { ...r, outstanding, aging: bucket };
  };

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM ar_invoices ORDER BY due_date`).all().map(decorate);
    const unpaid = rows.filter(r => r.status !== 'paid');
    const inB = (b) => unpaid.filter(r => r.aging === b).reduce((s, r) => s + r.outstanding, 0);
    res.json({
      invoices: rows,
      summary: {
        total: rows.length,
        total_outstanding: unpaid.reduce((s, r) => s + r.outstanding, 0),
        overdue: inB('d30') + inB('d60') + inB('d60p'),
        paid_count: rows.filter(r => r.status === 'paid').length,
        aging: { current: inB('current'), d30: inB('d30'), d60: inB('d60'), d60p: inB('d60p') },
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.customer || !(Number(b.amount) > 0)) return res.status(400).json({ error: 'customer & jumlah wajib' });
    const dueDays = Number(b.due_days) > 0 ? Number(b.due_days) : 30;
    const r = db.prepare(`INSERT INTO ar_invoices
      (invoice_number, customer, customer_type, description, amount, invoice_date, due_date, status)
      VALUES (?,?,?,?,?,?,?,'unpaid')`).run(
      genNumber(db), b.customer.trim(), b.customer_type || 'corporate',
      (b.description || '').trim(), Number(b.amount), nowSec(), nowSec() + dueDays * DAY);
    res.json({ ok: true, id: r.lastInsertRowid });
  });

  router.post('/:id/pay', (req, res) => {
    const inv = db.prepare(`SELECT * FROM ar_invoices WHERE id=?`).get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'invoice tidak ditemukan' });
    const pay = Number((req.body || {}).amount);
    if (!(pay > 0)) return res.status(400).json({ error: 'jumlah bayar tidak valid' });
    const paid = Math.min(inv.amount, inv.paid_amount + pay);
    const status = paid >= inv.amount ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    db.prepare(`UPDATE ar_invoices SET paid_amount=?, status=?, updated_at=strftime('%s','now') WHERE id=?`)
      .run(paid, status, inv.id);
    res.json({ ok: true, status });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM ar_invoices WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['invoice_number', 'customer', 'customer_type', 'description', 'amount', 'paid_amount', 'invoice_date', 'due_date', 'status']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    fields.push(`updated_at = strftime('%s','now')`);
    args.push(req.params.id);
    db.prepare(`UPDATE ar_invoices SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM ar_invoices WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/ar';
  app.use(mountPath, router);
  console.log(`[ar] mounted at ${mountPath} — accounts receivable`);

  return { router, db };
}

module.exports = { setupAR };
