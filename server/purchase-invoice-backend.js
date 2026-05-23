// server/purchase-invoice-backend.js
// Purchase Invoice + alur approval pembayaran.
// Finance "tarik" Good Delivery yg sudah diterima → jadi invoice (harga
// dari price list, locked). Invoice punya jatuh tempo (indikator).
// Alur bayar: pending → approved (Manager Purchase) → authorized
// (CFO/Direksi) → paid (Finance). Tiap step gak bisa lompat.
//
//   GET  /api/purchase-invoice          — daftar invoice + status jatuh tempo
//   GET  /api/purchase-invoice/sources  — GD diterima yg belum di-invoice
//   POST /api/purchase-invoice          — buat invoice dari GD
//   POST /api/purchase-invoice/:id/approve   — Manager Purchase
//   POST /api/purchase-invoice/:id/authorize — CFO / Direksi
//   POST /api/purchase-invoice/:id/pay       — Finance bayar

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS vendor_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  gd_id INTEGER,
  gd_number TEXT,
  supplier TEXT,
  supplier_invoice_no TEXT,
  invoice_date INTEGER,
  due_date INTEGER,
  subtotal REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  total REAL DEFAULT 0,
  status TEXT DEFAULT 'pending',
  approved_by TEXT, approved_at INTEGER,
  authorized_by TEXT, authorized_at INTEGER,
  paid_by TEXT, paid_at INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;

const nowSec = () => Math.floor(Date.now() / 1000);
const genInvNumber = (db) => {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const n = db.prepare(`SELECT COUNT(*) c FROM vendor_invoices WHERE invoice_number LIKE ?`).get(`INV-${ym}-%`).c;
  return `INV-${ym}-${String(n + 1).padStart(4, '0')}`;
};

// indikator jatuh tempo → biar finance tau invoice mana yg harus dibayar
const dueStatus = (inv) => {
  if (inv.status === 'paid') return 'lunas';
  if (!inv.due_date) return 'aman';
  const days = Math.floor((inv.due_date - nowSec()) / 86400);
  if (days < 0) return 'overdue';
  if (days <= 7) return 'jatuh_tempo';
  return 'aman';
};

function setupPurchaseInvoice(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  const router = express.Router();
  router.use(express.json());

  const decorate = (inv) => {
    const d = dueStatus(inv);
    const days = inv.due_date ? Math.floor((inv.due_date - nowSec()) / 86400) : null;
    return { ...inv, due_status: d, days_to_due: days };
  };

  router.get('/', (req, res) => {
    res.json(db.prepare(`SELECT * FROM vendor_invoices ORDER BY created_at DESC LIMIT 80`).all().map(decorate));
  });

  // GD yg sudah diterima tapi belum dibuatkan invoice
  router.get('/sources', (req, res) => {
    let gds = [];
    try {
      gds = db.prepare(`SELECT * FROM goods_deliveries WHERE status='received'
        AND id NOT IN (SELECT gd_id FROM vendor_invoices WHERE gd_id IS NOT NULL)
        ORDER BY received_at DESC`).all();
    } catch (e) { /* tabel GD belum ada */ }
    res.json(gds.map(g => ({ ...g, items: db.prepare(`SELECT * FROM gd_items WHERE gd_id=?`).all(g.id) })));
  });

  // Buat invoice dari GD — total dihitung dari price list (harga locked)
  router.post('/', (req, res) => {
    const b = req.body || {};
    const gd = db.prepare(`SELECT * FROM goods_deliveries WHERE id=?`).get(b.gd_id);
    if (!gd) return res.status(400).json({ error: 'Good Delivery tidak ditemukan' });
    if (db.prepare(`SELECT id FROM vendor_invoices WHERE gd_id=?`).get(gd.id))
      return res.status(409).json({ error: 'GD ini sudah punya invoice' });

    const items = db.prepare(`SELECT * FROM gd_items WHERE gd_id=?`).all(gd.id);
    let subtotal = 0;
    for (const it of items) {
      const pl = it.sku
        ? db.prepare(`SELECT price FROM price_list WHERE sku=? AND is_active=1 ORDER BY id DESC LIMIT 1`).get(it.sku)
        : null;
      const qty = it.qty_received || it.qty_delivered || 0;
      subtotal += qty * (pl ? pl.price : 0);
    }
    subtotal = Math.round(subtotal);
    const tax = Math.round(subtotal * 0.11);          // PPN 11%
    const total = subtotal + tax;
    const dueDays = Number(b.due_days) > 0 ? Number(b.due_days) : 14;

    const r = db.prepare(`INSERT INTO vendor_invoices
      (invoice_number, gd_id, gd_number, supplier, supplier_invoice_no, invoice_date, due_date, subtotal, tax, total, status, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      genInvNumber(db), gd.id, gd.gd_number, (b.supplier || gd.to_outlet || '').trim(),
      (b.supplier_invoice_no || '').trim(), nowSec(), nowSec() + dueDays * 86400,
      subtotal, tax, total, 'pending', (b.notes || '').trim());
    res.json({ ok: true, id: r.lastInsertRowid });
  });

  // step approval — gak bisa lompat
  const step = (fromStatus, toStatus, byField, atField) => (req, res) => {
    const inv = db.prepare(`SELECT * FROM vendor_invoices WHERE id=?`).get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'invoice tidak ditemukan' });
    if (inv.status !== fromStatus)
      return res.status(409).json({ error: `harus status "${fromStatus}" dulu (sekarang: ${inv.status})` });
    const by = ((req.body && req.body.by) || 'Manager').toString().trim() || 'Manager';
    db.prepare(`UPDATE vendor_invoices SET status=?, ${byField}=?, ${atField}=? WHERE id=?`)
      .run(toStatus, by, nowSec(), inv.id);
    res.json({ ok: true });
  };

  router.post('/:id/approve',   step('pending',    'approved',   'approved_by',   'approved_at'));
  router.post('/:id/authorize', step('approved',   'authorized', 'authorized_by', 'authorized_at'));
  router.post('/:id/pay',       step('authorized', 'paid',       'paid_by',       'paid_at'));

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM vendor_invoices WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['invoice_number', 'gd_id', 'gd_number', 'supplier', 'supplier_invoice_no', 'invoice_date', 'due_date', 'subtotal', 'tax', 'total', 'status', 'approved_by', 'approved_at', 'authorized_by', 'authorized_at', 'paid_by', 'paid_at', 'notes']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE vendor_invoices SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM vendor_invoices WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/purchase-invoice';
  app.use(mountPath, router);
  console.log(`[purchase-invoice] mounted at ${mountPath} — invoice + approval chain`);

  return { router, db };
}

module.exports = { setupPurchaseInvoice };
