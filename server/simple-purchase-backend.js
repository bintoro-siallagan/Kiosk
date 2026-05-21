// server/simple-purchase-backend.js
// Simple Purchase — pembelian cepat / petty cash buat barang kecil &
// urgent, tanpa rantai PR→PO→GD→GR. Catat → stok langsung nambah.
//
//   GET  /api/simple-purchase    — daftar + summary
//   POST /api/simple-purchase    — catat pembelian cepat

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS simple_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_no TEXT, item_name TEXT, sku TEXT, qty REAL, unit TEXT,
  unit_price REAL, total REAL, vendor TEXT, payment_method TEXT,
  outlet TEXT, purchased_by TEXT, notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const PAYMENTS = ['Cash', 'Petty Cash', 'Transfer'];
const nowSec = () => Math.floor(Date.now() / 1000);
const genNo = (db) => {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const n = db.prepare(`SELECT COUNT(*) c FROM simple_purchases WHERE purchase_no LIKE ?`).get(`SP-${ym}-%`).c;
  return `SP-${ym}-${String(n + 1).padStart(4, '0')}`;
};

function setupSimplePurchase(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  // Seed demo
  if (db.prepare(`SELECT COUNT(*) c FROM simple_purchases`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO simple_purchases
      (purchase_no, item_name, sku, qty, unit, unit_price, total, vendor, payment_method, outlet, purchased_by, notes, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const N = nowSec(); let i = 1;
    const ym = new Date().toISOString().slice(0, 7).replace('-', '');
    // [item, qty, unit, price, vendor, payment, outlet, by, daysAgo]
    [
      ['Galon Air Mineral', 10, 'galon', 20000, 'Toko Pak Budi', 'Petty Cash', 'Paskal', 'Outlet Manager', 1],
      ['Tisu Dapur', 24, 'pack', 12000, 'Indomaret', 'Cash', 'Sudirman', 'Supervisor', 2],
      ['Buah Strawberry (urgent)', 5, 'kg', 48000, 'Pasar Induk', 'Cash', 'Kemang', 'Outlet Manager', 0],
      ['Sabun Cuci Piring', 6, 'botol', 18000, 'Toko Kelontong', 'Petty Cash', 'BSD City', 'Crew', 3],
      ['Es Batu Kristal', 50, 'kg', 3000, 'Supplier Es Jaya', 'Cash', 'Paskal', 'Supervisor', 1],
    ].forEach(([nm, q, u, p, v, pm, ol, by, d]) =>
      ins.run(`SP-${ym}-${String(i++).padStart(4, '0')}`, nm, null, q, u, p, q * p, v, pm, ol, by, '', N - d * 86400));
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM simple_purchases ORDER BY created_at DESC`).all();
    const monthStart = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);
    const byPay = {};
    for (const r of rows) byPay[r.payment_method] = (byPay[r.payment_method] || 0) + r.total;
    res.json({
      purchases: rows,
      payment_methods: PAYMENTS,
      summary: {
        total_purchases: rows.length,
        total_spend: rows.reduce((s, r) => s + r.total, 0),
        month_spend: rows.filter(r => r.created_at >= monthStart).reduce((s, r) => s + r.total, 0),
        by_payment: PAYMENTS.map(p => ({ method: p, total: byPay[p] || 0 })),
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.item_name || !String(b.item_name).trim()) return res.status(400).json({ error: 'nama item wajib' });
    const qty = Number(b.qty) || 0, price = Number(b.unit_price) || 0;
    if (!(qty > 0) || !(price > 0)) return res.status(400).json({ error: 'qty & harga wajib > 0' });
    const total = Math.round(qty * price);
    const r = db.prepare(`INSERT INTO simple_purchases
      (purchase_no, item_name, sku, qty, unit, unit_price, total, vendor, payment_method, outlet, purchased_by, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      genNo(db), String(b.item_name).trim(), b.sku || null, qty, b.unit || 'pcs', price, total,
      (b.vendor || '-').trim(), PAYMENTS.includes(b.payment_method) ? b.payment_method : 'Cash',
      (b.outlet || '-').trim(), (b.purchased_by || 'Staff').trim(), (b.notes || '').trim());
    // kalau sku cocok di warehouse → stok langsung nambah
    let stockPosted = false;
    if (b.sku) {
      try {
        const upd = db.prepare(`UPDATE audit_warehouse SET stock = stock + ?, last_restock = ? WHERE id = ?`).run(qty, nowSec(), b.sku);
        stockPosted = upd.changes > 0;
      } catch { /* noop */ }
    }
    res.json({ ok: true, id: r.lastInsertRowid, total, stock_posted: stockPosted });
  });

  const mountPath = opts.mountPath || '/api/simple-purchase';
  app.use(mountPath, router);
  console.log(`[simple-purchase] mounted at ${mountPath} — quick / petty-cash purchase`);

  return { router, db };
}

module.exports = { setupSimplePurchase };
