// server/budget-plan-backend.js
// Budget Planning — budget periode, plan, detail/allokasi, revisi
// increase/decrease. Perencanaan budget enterprise.
//
//   GET  /api/budget-plan?period=<id>   — periode + detail + revisi
//   POST /api/budget-plan/period        — buat periode budget
//   POST /api/budget-plan/line          — tambah detail/alokasi
//   POST /api/budget-plan/revise        — revisi increase/decrease

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS budget_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, period_type TEXT,
  status TEXT DEFAULT 'active', created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS budget_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT, period_id INTEGER, category TEXT,
  allocated REAL DEFAULT 0, base_amount REAL DEFAULT 0, notes TEXT
);
CREATE TABLE IF NOT EXISTS budget_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, period_id INTEGER, line_id INTEGER, category TEXT,
  rev_type TEXT, amount REAL, reason TEXT, by_who TEXT,
  at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const nowSec = () => Math.floor(Date.now() / 1000);

function setupBudgetPlan(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const many = (s, ...p) => { try { return db.prepare(s).all(...p); } catch { return []; } };
  const one = (s, ...p) => { try { return db.prepare(s).get(...p); } catch { return null; } };

  // Seed (sekali)
  if (db.prepare(`SELECT COUNT(*) c FROM budget_periods`).get().c === 0) {
    const pp = db.prepare(`INSERT INTO budget_periods (name, period_type, status, created_at) VALUES (?,?,?,?)`);
    const ln = db.prepare(`INSERT INTO budget_lines (period_id, category, allocated, base_amount, notes) VALUES (?,?,?,?,?)`);
    const rv = db.prepare(`INSERT INTO budget_revisions (period_id, line_id, category, rev_type, amount, reason, by_who, at) VALUES (?,?,?,?,?,?,?,?)`);
    const N = nowSec();
    const q1 = pp.run('Q1 2026', 'Quarterly', 'closed', N - 100 * 86400).lastInsertRowid;
    [['Bahan Baku', 75000000], ['Gaji & Payroll', 110000000], ['Sewa & Utilitas', 33000000], ['Marketing', 20000000]]
      .forEach(([c, a]) => ln.run(q1, c, a, a, ''));
    const q2 = pp.run('Q2 2026', 'Quarterly', 'active', N - 20 * 86400).lastInsertRowid;
    const q2lines = [
      ['Bahan Baku', 80000000], ['Gaji & Payroll', 120000000], ['Sewa & Utilitas', 35000000],
      ['Marketing & Promo', 25000000], ['Operasional Outlet', 30000000], ['Maintenance & Repair', 12000000],
    ];
    const lineIds = {};
    for (const [c, a] of q2lines) lineIds[c] = ln.run(q2, c, a, a, '').lastInsertRowid;
    // contoh revisi
    db.prepare(`UPDATE budget_lines SET allocated = ? WHERE id = ?`).run(28000000, lineIds['Marketing & Promo']);
    rv.run(q2, lineIds['Marketing & Promo'], 'Marketing & Promo', 'increase', 3000000, 'Tambahan budget campaign payday', 'Owner / Director', N - 8 * 86400);
    db.prepare(`UPDATE budget_lines SET allocated = ? WHERE id = ?`).run(10000000, lineIds['Maintenance & Repair']);
    rv.run(q2, lineIds['Maintenance & Repair'], 'Maintenance & Repair', 'decrease', 2000000, 'Realokasi ke marketing', 'Finance Director', N - 8 * 86400);
  }

  const router = express.Router();
  router.use(express.json());

  const periodTotal = (pid) => (one(`SELECT COALESCE(SUM(allocated),0) t FROM budget_lines WHERE period_id = ?`, pid) || { t: 0 }).t;

  router.get('/', (req, res) => {
    const periods = many(`SELECT * FROM budget_periods ORDER BY created_at DESC`)
      .map(p => ({ ...p, total_allocated: periodTotal(p.id) }));
    const active = periods.find(p => p.status === 'active') || periods[0];
    const selId = Number(req.query.period) || (active && active.id);
    const sel = periods.find(p => p.id === selId) || active;
    const lines = sel ? many(`SELECT * FROM budget_lines WHERE period_id = ? ORDER BY allocated DESC`, sel.id) : [];
    const revisions = sel ? many(`SELECT * FROM budget_revisions WHERE period_id = ? ORDER BY at DESC`, sel.id) : [];
    res.json({
      periods,
      selected: sel ? {
        id: sel.id, name: sel.name, period_type: sel.period_type, status: sel.status,
        lines, revisions,
        total_plan: lines.reduce((s, l) => s + l.allocated, 0),
        total_base: lines.reduce((s, l) => s + (l.base_amount || 0), 0),
      } : null,
      summary: {
        periods: periods.length,
        active_total: active ? periodTotal(active.id) : 0,
        revisions: revisions.length,
        net_revision: revisions.reduce((s, r) => s + (r.rev_type === 'increase' ? r.amount : -r.amount), 0),
      },
    });
  });

  router.post('/period', (req, res) => {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'nama periode wajib' });
    const r = db.prepare(`INSERT INTO budget_periods (name, period_type, status) VALUES (?,?, 'active')`)
      .run(String(b.name).trim(), b.period_type || 'Monthly');
    res.json({ ok: true, id: r.lastInsertRowid });
  });

  router.post('/line', (req, res) => {
    const b = req.body || {};
    if (!one(`SELECT id FROM budget_periods WHERE id = ?`, b.period_id)) return res.status(404).json({ error: 'periode tidak ditemukan' });
    if (!b.category || !(Number(b.allocated) > 0)) return res.status(400).json({ error: 'kategori & jumlah wajib' });
    const amt = Math.round(Number(b.allocated));
    db.prepare(`INSERT INTO budget_lines (period_id, category, allocated, base_amount, notes) VALUES (?,?,?,?,?)`)
      .run(b.period_id, String(b.category).trim(), amt, amt, (b.notes || '').trim());
    res.json({ ok: true });
  });

  router.post('/revise', (req, res) => {
    const b = req.body || {};
    const line = one(`SELECT * FROM budget_lines WHERE id = ?`, b.line_id);
    if (!line) return res.status(404).json({ error: 'line budget tidak ditemukan' });
    if (!['increase', 'decrease'].includes(b.rev_type)) return res.status(400).json({ error: 'rev_type tidak valid' });
    const amt = Math.round(Number(b.amount) || 0);
    if (!(amt > 0)) return res.status(400).json({ error: 'jumlah revisi wajib > 0' });
    const delta = b.rev_type === 'increase' ? amt : -amt;
    const next = Math.max(0, line.allocated + delta);
    db.transaction(() => {
      db.prepare(`UPDATE budget_lines SET allocated = ? WHERE id = ?`).run(next, line.id);
      db.prepare(`INSERT INTO budget_revisions (period_id, line_id, category, rev_type, amount, reason, by_who)
        VALUES (?,?,?,?,?,?,?)`).run(line.period_id, line.id, line.category, b.rev_type, amt,
        (b.reason || '').trim(), (b.by || 'Finance').trim());
    })();
    res.json({ ok: true, new_allocated: next });
  });

  router.patch('/line/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM budget_lines WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['category', 'allocated', 'base_amount', 'notes']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE budget_lines SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/line/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM budget_lines WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    db.transaction(() => {
      db.prepare(`DELETE FROM budget_revisions WHERE line_id = ?`).run(req.params.id);
      db.prepare(`DELETE FROM budget_lines WHERE id = ?`).run(req.params.id);
    })();
    res.json({ ok: true });
  });

  router.patch('/period/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM budget_periods WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['name', 'period_type', 'status']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE budget_periods SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/period/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM budget_periods WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    db.transaction(() => {
      db.prepare(`DELETE FROM budget_revisions WHERE period_id = ?`).run(req.params.id);
      db.prepare(`DELETE FROM budget_lines WHERE period_id = ?`).run(req.params.id);
      db.prepare(`DELETE FROM budget_periods WHERE id = ?`).run(req.params.id);
    })();
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/budget-plan';
  app.use(mountPath, router);
  console.log(`[budget-plan] mounted at ${mountPath} — budget planning & allocation`);

  return { router, db };
}

module.exports = { setupBudgetPlan };
