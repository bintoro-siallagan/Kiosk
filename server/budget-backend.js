// server/budget-backend.js
// Budget Management — set budget per kategori beban per bulan, lacak
// realisasi (budget vs actual dari finance_expenses).
//
//   GET    /api/budget?period=YYYY-MM  — budget + realisasi + summary
//   POST   /api/budget                — set/update budget kategori
//   DELETE /api/budget/:id

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL,
  category_id TEXT NOT NULL,
  category_name TEXT,
  amount REAL NOT NULL,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(period, category_id)
);
`;

const monthBounds = (period) => {
  const [y, m] = String(period).split('-').map(Number);
  if (!y || !m) { const d = new Date(); return monthBounds(`${d.getFullYear()}-${d.getMonth() + 1}`); }
  return [
    Math.floor(new Date(y, m - 1, 1).getTime() / 1000),
    Math.floor(new Date(y, m, 1).getTime() / 1000),
  ];
};
const thisPeriod = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

function setupBudget(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  const one = (s, ...p) => { try { return db.prepare(s).get(...p); } catch { return null; } };
  const many = (s, ...p) => { try { return db.prepare(s).all(...p); } catch { return []; } };

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const period = req.query.period || thisPeriod();
    const [from, to] = monthBounds(period);

    const rows = many(`SELECT * FROM budgets WHERE period = ? ORDER BY category_name`, period).map(b => {
      const actual = Math.round((one(`SELECT COALESCE(SUM(amount),0) v FROM finance_expenses
        WHERE category_id = ? AND voided_at IS NULL AND expense_date >= ? AND expense_date < ?`,
        b.category_id, from, to) || { v: 0 }).v);
      const remaining = Math.round(b.amount - actual);
      return {
        ...b, actual, remaining,
        pct: b.amount > 0 ? Math.round(actual / b.amount * 100) : 0,
        status: actual > b.amount ? 'over' : actual > b.amount * 0.85 ? 'warning' : 'ok',
      };
    });

    res.json({
      period,
      budgets: rows,
      categories: many(`SELECT id, name, type FROM expense_categories WHERE is_active = 1 ORDER BY name`),
      summary: {
        total_budget: rows.reduce((s, r) => s + r.amount, 0),
        total_actual: rows.reduce((s, r) => s + r.actual, 0),
        total_remaining: rows.reduce((s, r) => s + r.remaining, 0),
        over_count: rows.filter(r => r.status === 'over').length,
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.category_id || !(Number(b.amount) > 0)) return res.status(400).json({ error: 'kategori & jumlah wajib' });
    const period = b.period || thisPeriod();
    const cat = one(`SELECT name FROM expense_categories WHERE id = ?`, b.category_id);
    db.prepare(`INSERT INTO budgets (period, category_id, category_name, amount, notes)
      VALUES (?,?,?,?,?)
      ON CONFLICT(period, category_id) DO UPDATE SET amount = excluded.amount, notes = excluded.notes`)
      .run(period, b.category_id, cat ? cat.name : b.category_id, Number(b.amount), (b.notes || '').trim());
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    db.prepare(`DELETE FROM budgets WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM budgets WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['period', 'category_name', 'amount', 'notes']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE budgets SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/budget';
  app.use(mountPath, router);
  console.log(`[budget] mounted at ${mountPath} — budget vs realisasi`);

  return { router, db };
}

module.exports = { setupBudget };
