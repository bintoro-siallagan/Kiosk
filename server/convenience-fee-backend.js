// server/convenience-fee-backend.js
// Convenience Fee — biaya layanan buat transaksi DIGITAL (QRIS/e-wallet/
// gateway) untuk nutup biaya MDR. Tunai bebas fee. Tampil di struk.
//
//   GET  /api/convenience-fee   — config { enabled, amount, label }
//   POST /api/convenience-fee   — update config

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS convenience_fee_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER DEFAULT 1,
  amount REAL DEFAULT 2500,
  label TEXT DEFAULT 'Biaya Layanan QRIS',
  updated_at INTEGER
);
`;

function setupConvenienceFee(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  if (!db.prepare(`SELECT id FROM convenience_fee_config WHERE id = 1`).get()) {
    db.prepare(`INSERT INTO convenience_fee_config (id, enabled, amount, label) VALUES (1,1,2500,'Biaya Layanan QRIS')`).run();
  }

  const getConfig = () => db.prepare(`SELECT enabled, amount, label FROM convenience_fee_config WHERE id = 1`).get()
    || { enabled: 0, amount: 0, label: 'Biaya Layanan' };

  // dipakai server (POST /api/orders) — fee buat transaksi DIGITAL di
  // channel self-order (kiosk/QR/customer). Tunai & POS kasir bebas fee.
  global.getConvenienceFee = (payMethod, source) => {
    const c = getConfig();
    const cash = /^cash$|tunai/i.test(String(payMethod || ''));
    const selfOrder = /kiosk|customer|qr/i.test(String(source || 'kiosk'));
    return (c.enabled && !cash && selfOrder) ? Math.round(c.amount) : 0;
  };

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => res.json(getConfig()));

  router.post('/', (req, res) => {
    const b = req.body || {};
    db.prepare(`UPDATE convenience_fee_config
      SET enabled = ?, amount = ?, label = ?, updated_at = strftime('%s','now') WHERE id = 1`).run(
      b.enabled ? 1 : 0, Math.max(0, Number(b.amount) || 0),
      (b.label || 'Biaya Layanan').toString().trim() || 'Biaya Layanan');
    res.json({ ok: true, ...getConfig() });
  });

  const mountPath = opts.mountPath || '/api/convenience-fee';
  app.use(mountPath, router);
  console.log(`[convenience-fee] mounted at ${mountPath} — biaya layanan digital payment`);

  return { router, db };
}

module.exports = { setupConvenienceFee };
