// server/quotation-backend.js
// Quotation — penawaran harga B2B sebelum jadi Sales Order.
//
//   GET  /api/quotation             — daftar quotation + summary
//   POST /api/quotation             — buat quotation
//   POST /api/quotation/:id/status  — ubah status { status }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, quote_no TEXT, customer_name TEXT, customer_type TEXT,
  items TEXT, subtotal REAL, tax REAL, total REAL, valid_until INTEGER,
  status TEXT DEFAULT 'draft', created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const STATUSES = ['draft', 'sent', 'accepted', 'rejected'];
const DAY = 86400;
const nowSec = () => Math.floor(Date.now() / 1000);
const J = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };
const sumLines = (its) => its.reduce((s, i) => s + (i.qty || 0) * (i.unit_price || 0), 0);

function setupQuotation(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const genNo = () => `QT-202605-${String(db.prepare(`SELECT COUNT(*) c FROM quotations`).get().c + 1).padStart(3, '0')}`;

  if (db.prepare(`SELECT COUNT(*) c FROM quotations`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO quotations (quote_no, customer_name, customer_type, items, subtotal, tax, total, valid_until, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const N = nowSec();
    [
      ['PT Sukses Makmur', 'Korporat', [['Original Froyo', 300, 'cup', 17500]], 'accepted', 12],
      ['Hotel Santika Bandung', 'Korporat', [['Dessert Platter', 80, 'pax', 44000]], 'sent', 3],
      ['Brand Frappe Co', 'Lintas Brand', [['Yogurt Base Plain', 120, 'kg', 56000]], 'draft', 1],
      ['PT Catering Berkah', 'Antar PT', [['Froyo Cup Mix', 600, 'cup', 15500]], 'rejected', 18],
    ].forEach(([cn, ct, items, st, d]) => {
      const its = items.map(([name, qty, unit, price]) => ({ name, qty, unit, unit_price: price }));
      const sub = sumLines(its), tax = Math.round(sub * 0.11);
      ins.run(genNo(), cn, ct, JSON.stringify(its), sub, tax, sub + tax, N + (30 - d) * DAY, st, N - d * DAY);
    });
  }

  const shape = (r) => ({ ...r, items: J(r.items), expired: r.valid_until < nowSec() && !['accepted', 'rejected'].includes(r.status) });

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM quotations ORDER BY created_at DESC`).all().map(shape);
    res.json({
      quotations: rows, statuses: STATUSES,
      summary: {
        total: rows.length,
        open: rows.filter(r => ['draft', 'sent'].includes(r.status)).length,
        accepted: rows.filter(r => r.status === 'accepted').length,
        win_rate: rows.filter(r => ['accepted', 'rejected'].includes(r.status)).length
          ? Math.round(rows.filter(r => r.status === 'accepted').length / rows.filter(r => ['accepted', 'rejected'].includes(r.status)).length * 100) : 0,
        value: rows.reduce((s, r) => s + (r.total || 0), 0),
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    const items = (Array.isArray(b.items) ? b.items : []).filter(i => i.name && Number(i.qty) > 0 && Number(i.unit_price) > 0);
    if (!b.customer_name || !items.length) return res.status(400).json({ error: 'customer & minimal 1 item wajib' });
    const its = items.map(i => ({ name: i.name, qty: Number(i.qty), unit: i.unit || 'pcs', unit_price: Number(i.unit_price) }));
    const sub = sumLines(its), tax = Math.round(sub * 0.11);
    db.prepare(`INSERT INTO quotations (quote_no, customer_name, customer_type, items, subtotal, tax, total, valid_until, status)
      VALUES (?,?,?,?,?,?,?,?, 'draft')`).run(genNo(), String(b.customer_name).trim(), b.customer_type || 'Korporat',
      JSON.stringify(its), sub, tax, sub + tax, nowSec() + 30 * DAY);
    res.json({ ok: true });
  });

  router.post('/:id/status', (req, res) => {
    const q = db.prepare(`SELECT * FROM quotations WHERE id = ?`).get(req.params.id);
    if (!q) return res.status(404).json({ error: 'quotation tidak ditemukan' });
    const st = (req.body || {}).status;
    if (!STATUSES.includes(st)) return res.status(400).json({ error: 'status tidak valid' });
    db.prepare(`UPDATE quotations SET status = ? WHERE id = ?`).run(st, q.id);
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/quotation';
  app.use(mountPath, router);
  console.log(`[quotation] mounted at ${mountPath} — B2B quotation`);

  return { router, db };
}

module.exports = { setupQuotation };
