// server/petty-cash-backend.js
// Petty Cash — kas kecil per outlet + budget bulanan. Top-up, expense,
// saldo realtime & kontrol budget.
//
//   GET  /api/petty-cash            — saldo + budget per outlet + transaksi
//   POST /api/petty-cash/topup      — { outlet, amount, by }
//   POST /api/petty-cash/expense    — { outlet, amount, description, by }
//   POST /api/petty-cash/budget     — { outlet, monthly_budget }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS petty_cash_outlets (
  outlet TEXT PRIMARY KEY, monthly_budget REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS petty_cash_txn (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outlet TEXT, txn_type TEXT, amount REAL, description TEXT, by_who TEXT,
  at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const nowSec = () => Math.floor(Date.now() / 1000);
const monthStart = () => Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);

function setupPettyCash(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  // Seed outlets + transaksi (sekali)
  if (db.prepare(`SELECT COUNT(*) c FROM petty_cash_outlets`).get().c === 0) {
    const ob = db.prepare(`INSERT INTO petty_cash_outlets (outlet, monthly_budget) VALUES (?,?)`);
    const tx = db.prepare(`INSERT INTO petty_cash_txn (outlet, txn_type, amount, description, by_who, at) VALUES (?,?,?,?,?,?)`);
    const N = nowSec();
    const seed = [
      ['Paskal', 3500000, [['topup', 3500000, 'Top-up awal bulan', 20], ['expense', 200000, 'Galon air mineral', 14], ['expense', 150000, 'Es batu', 8], ['expense', 180000, 'ATK & perlengkapan', 3]]],
      ['Sudirman', 3000000, [['topup', 3000000, 'Top-up awal bulan', 20], ['expense', 240000, 'Tisu & sabun', 12], ['expense', 320000, 'Buah urgent', 5]]],
      ['BSD City', 2500000, [['topup', 2500000, 'Top-up awal bulan', 19], ['expense', 175000, 'Perlengkapan dapur', 9], ['expense', 90000, 'Galon air', 2]]],
      ['Kemang', 2500000, [['topup', 2500000, 'Top-up awal bulan', 20], ['expense', 2280000, 'Renovasi kecil + supplies', 6]]],
      ['Dago', 2000000, [['topup', 2000000, 'Top-up awal bulan', 21], ['expense', 140000, 'Es batu & galon', 4]]],
      ['Balikpapan', 2000000, [['topup', 2000000, 'Top-up awal bulan', 18], ['expense', 95000, 'Tisu dapur', 7]]],
    ];
    for (const [ol, bud, txns] of seed) {
      ob.run(ol, bud);
      for (const [ty, amt, desc, d] of txns) tx.run(ol, ty, amt, desc, 'Outlet Manager', N - d * 86400);
    }
  }

  const router = express.Router();
  router.use(express.json());

  const buildOutlets = () => {
    const ms = monthStart();
    return db.prepare(`SELECT * FROM petty_cash_outlets ORDER BY outlet`).all().map(o => {
      const all = db.prepare(`SELECT txn_type, amount, at FROM petty_cash_txn WHERE outlet = ?`).all(o.outlet);
      const balance = all.reduce((s, t) => s + (t.txn_type === 'topup' ? t.amount : -t.amount), 0);
      const monthExpense = all.filter(t => t.txn_type === 'expense' && t.at >= ms).reduce((s, t) => s + t.amount, 0);
      const pct = o.monthly_budget > 0 ? Math.round(monthExpense / o.monthly_budget * 100) : 0;
      return {
        outlet: o.outlet, monthly_budget: o.monthly_budget, balance,
        month_expense: monthExpense, budget_used_pct: pct,
        status: pct > 90 ? 'over' : pct > 70 ? 'warning' : 'ok',
      };
    });
  };

  router.get('/', (req, res) => {
    const outlets = buildOutlets();
    res.json({
      outlets,
      transactions: db.prepare(`SELECT * FROM petty_cash_txn ORDER BY at DESC LIMIT 20`).all(),
      summary: {
        total_balance: outlets.reduce((s, o) => s + o.balance, 0),
        total_budget: outlets.reduce((s, o) => s + o.monthly_budget, 0),
        month_expense: outlets.reduce((s, o) => s + o.month_expense, 0),
        over_budget: outlets.filter(o => o.status === 'over').length,
      },
    });
  });

  const addTxn = (type) => (req, res) => {
    const b = req.body || {};
    if (!db.prepare(`SELECT outlet FROM petty_cash_outlets WHERE outlet = ?`).get(b.outlet))
      return res.status(404).json({ error: 'outlet tidak ditemukan' });
    const amt = Math.round(Number(b.amount) || 0);
    if (!(amt > 0)) return res.status(400).json({ error: 'jumlah wajib > 0' });
    db.prepare(`INSERT INTO petty_cash_txn (outlet, txn_type, amount, description, by_who) VALUES (?,?,?,?,?)`)
      .run(b.outlet, type, amt, (b.description || (type === 'topup' ? 'Top-up kas' : 'Pengeluaran')).trim(), (b.by || 'Staff').trim());
    res.json({ ok: true });
  };
  router.post('/topup', addTxn('topup'));
  router.post('/expense', addTxn('expense'));

  router.post('/budget', (req, res) => {
    const b = req.body || {};
    if (!db.prepare(`SELECT outlet FROM petty_cash_outlets WHERE outlet = ?`).get(b.outlet))
      return res.status(404).json({ error: 'outlet tidak ditemukan' });
    db.prepare(`UPDATE petty_cash_outlets SET monthly_budget = ? WHERE outlet = ?`)
      .run(Math.max(0, Number(b.monthly_budget) || 0), b.outlet);
    res.json({ ok: true });
  });

  // dipakai Simple Purchase — auto-log expense kalau bayar pakai Petty Cash
  global.logPettyCash = (outlet, amount, description) => {
    try {
      if (db.prepare(`SELECT outlet FROM petty_cash_outlets WHERE outlet = ?`).get(outlet)) {
        db.prepare(`INSERT INTO petty_cash_txn (outlet, txn_type, amount, description, by_who) VALUES (?, 'expense', ?, ?, 'Simple Purchase')`)
          .run(outlet, Math.round(amount || 0), description || 'Simple Purchase');
      }
    } catch { /* noop */ }
  };

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM petty_cash_txn WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['outlet', 'txn_type', 'amount', 'description', 'by_who', 'at']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE petty_cash_txn SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM petty_cash_txn WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/petty-cash';
  app.use(mountPath, router);
  console.log(`[petty-cash] mounted at ${mountPath} — petty cash & budget`);

  return { router, db };
}

module.exports = { setupPettyCash };
