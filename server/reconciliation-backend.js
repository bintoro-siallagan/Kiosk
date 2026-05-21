// server/reconciliation-backend.js
// Reconciliation Center — Bank Reconciliation, Cash Count & GL
// Reconciliation dalam satu modul.
//
//   GET  /api/reconciliation                — 3 area rekonsiliasi
//   POST /api/reconciliation/bank-match/:id — match item bank
//   POST /api/reconciliation/cash-count     — catat cash count
//   POST /api/reconciliation/gl-reconcile/:code — toggle GL reconciled

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS bank_recon (
  id INTEGER PRIMARY KEY AUTOINCREMENT, txn_date TEXT, description TEXT,
  amount REAL, side TEXT, matched INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cash_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, outlet TEXT, system_cash REAL, counted_cash REAL,
  variance REAL, counted_by TEXT, counted_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS gl_recon (
  account_code TEXT PRIMARY KEY, account_name TEXT, balance REAL,
  reconciled INTEGER DEFAULT 0, reconciled_at INTEGER
);
`;
const nowSec = () => Math.floor(Date.now() / 1000);
const BANK_BALANCE = 140850000;   // saldo rekening koran

function setupReconciliation(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };

  if (db.prepare(`SELECT COUNT(*) c FROM bank_recon`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO bank_recon (txn_date, description, amount, side, matched) VALUES (?,?,?,?,?)`);
    [
      ['25 Mei', 'Setoran tunai harian', 15000000, 'book', 1], ['24 Mei', 'Transfer pembayaran vendor', -8500000, 'book', 1],
      ['23 Mei', 'Setoran QRIS settlement', 12300000, 'book', 1], ['25 Mei', 'Biaya admin bank', -55000, 'bank', 0],
      ['25 Mei', 'Bunga jasa giro', 142000, 'bank', 0], ['22 Mei', 'Cek belum cair — supplier', -3200000, 'book', 0],
    ].forEach(r => ins.run(...r));
  }
  if (db.prepare(`SELECT COUNT(*) c FROM cash_counts`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO cash_counts (outlet, system_cash, counted_cash, variance, counted_by, counted_at) VALUES (?,?,?,?,?,?)`);
    const N = nowSec();
    [['Paskal', 4500000, 4480000, -20000, 'Supervisor', 1], ['Sudirman', 3800000, 3800000, 0, 'Outlet Manager', 2],
     ['Kemang', 2900000, 2865000, -35000, 'Supervisor', 4]].forEach(([o, s, c, v, by, d]) => ins.run(o, s, c, v, by, N - d * 86400));
  }
  if (db.prepare(`SELECT COUNT(*) c FROM gl_recon`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO gl_recon (account_code, account_name, balance, reconciled, reconciled_at) VALUES (?,?,?,?,?)`);
    const accs = many(`SELECT code, name, balance FROM gl_accounts`);
    accs.forEach((a, i) => ins.run(a.code, a.name, a.balance, i % 3 === 2 ? 0 : 1, i % 3 === 2 ? null : nowSec() - 2 * 86400));
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const bankItems = many(`SELECT * FROM bank_recon ORDER BY matched, id`);
    const bookBalance = bankItems.filter(b => b.side === 'book').reduce((s, b) => s + b.amount, 0)
      + 125000000; // saldo awal buku
    const unmatchedBank = bankItems.filter(b => !b.matched);
    const counts = many(`SELECT * FROM cash_counts ORDER BY counted_at DESC`);
    const gl = many(`SELECT * FROM gl_recon ORDER BY account_code`);
    res.json({
      bank: {
        book_balance: bookBalance, bank_balance: BANK_BALANCE, difference: bookBalance - BANK_BALANCE,
        items: bankItems, unmatched: unmatchedBank.length,
      },
      cash: {
        counts,
        summary: {
          total_count: counts.length,
          total_variance: counts.reduce((s, c) => s + c.variance, 0),
          balanced: counts.filter(c => c.variance === 0).length,
        },
      },
      gl: {
        accounts: gl,
        reconciled: gl.filter(a => a.reconciled).length,
        total: gl.length,
      },
      summary: {
        bank_unmatched: unmatchedBank.length,
        cash_variance: counts.reduce((s, c) => s + c.variance, 0),
        gl_pending: gl.filter(a => !a.reconciled).length,
      },
    });
  });

  router.post('/bank-match/:id', (req, res) => {
    const r = db.prepare(`SELECT * FROM bank_recon WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'item tidak ditemukan' });
    db.prepare(`UPDATE bank_recon SET matched = ? WHERE id = ?`).run(r.matched ? 0 : 1, r.id);
    res.json({ ok: true });
  });

  router.post('/cash-count', (req, res) => {
    const b = req.body || {};
    const sys = Math.round(Number(b.system_cash) || 0), cnt = Math.round(Number(b.counted_cash) || 0);
    if (!b.outlet || !(sys > 0)) return res.status(400).json({ error: 'outlet & kas sistem wajib' });
    db.prepare(`INSERT INTO cash_counts (outlet, system_cash, counted_cash, variance, counted_by) VALUES (?,?,?,?,?)`)
      .run(b.outlet, sys, cnt, cnt - sys, (b.counted_by || 'Supervisor').trim());
    res.json({ ok: true, variance: cnt - sys });
  });

  router.post('/gl-reconcile/:code', (req, res) => {
    const r = db.prepare(`SELECT * FROM gl_recon WHERE account_code = ?`).get(req.params.code);
    if (!r) return res.status(404).json({ error: 'akun tidak ditemukan' });
    const next = r.reconciled ? 0 : 1;
    db.prepare(`UPDATE gl_recon SET reconciled = ?, reconciled_at = ? WHERE account_code = ?`)
      .run(next, next ? nowSec() : null, r.account_code);
    res.json({ ok: true, reconciled: !!next });
  });

  const mountPath = opts.mountPath || '/api/reconciliation';
  app.use(mountPath, router);
  console.log(`[reconciliation] mounted at ${mountPath} — bank / cash / GL reconciliation`);

  return { router, db };
}

module.exports = { setupReconciliation };
