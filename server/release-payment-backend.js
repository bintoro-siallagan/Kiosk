// server/release-payment-backend.js
// Release Payment — pencairan pembayaran ke vendor atas invoice yang
// sudah disetujui. Step terakhir AP: approve → release.
//
//   GET  /api/release-payment            — pending + released + summary
//   POST /api/release-payment/:id/release — cairkan pembayaran

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS payment_releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT, release_no TEXT, payee TEXT, invoice_ref TEXT,
  amount REAL, due_date INTEGER, payment_method TEXT, status TEXT DEFAULT 'pending',
  released_by TEXT, released_at INTEGER, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const METHODS = ['Transfer Bank', 'Cash', 'Cek / Giro'];
const nowSec = () => Math.floor(Date.now() / 1000);

function setupReleasePayment(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM payment_releases`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO payment_releases
      (release_no, payee, invoice_ref, amount, due_date, payment_method, status, released_by, released_at, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const N = nowSec(); let i = 1;
    const no = () => `PAY-202605-${String(i++).padStart(3, '0')}`;
    // [payee, invoice, amount, dueDays, method, status, relDaysAgo]
    [
      ['PT Dairy Prima', 'INV-2026-041', 12500000, 3, 'Transfer Bank', 'pending', null],
      ['Fresh Fruit Co', 'INV-2026-038', 4800000, -2, 'Transfer Bank', 'pending', null],
      ['Packaging Mandiri', 'INV-2026-044', 8200000, 5, 'Transfer Bank', 'pending', null],
      ['Topping Supplier ID', 'INV-2026-040', 3600000, 1, 'Transfer Bank', 'pending', null],
      ['PLN — Listrik Outlet', 'INV-2026-045', 6400000, 7, 'Transfer Bank', 'pending', null],
      ['PT Dairy Prima', 'INV-2026-030', 11000000, -10, 'Transfer Bank', 'released', 5],
      ['Sewa Gedung Paskal', 'INV-2026-025', 25000000, -14, 'Transfer Bank', 'released', 8],
      ['Fresh Fruit Co', 'INV-2026-033', 5200000, -8, 'Cash', 'released', 3],
    ].forEach(([p, inv, amt, dd, m, st, rel]) =>
      ins.run(no(), p, inv, amt, N + dd * 86400, m, st, st === 'released' ? 'Finance Director' : null,
        rel != null ? N - rel * 86400 : null, N - 15 * 86400));
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM payment_releases ORDER BY due_date`).all();
    const N = nowSec(), monthStart = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);
    const pending = rows.filter(r => r.status === 'pending').map(r => ({ ...r, overdue: r.due_date < N }));
    const released = rows.filter(r => r.status === 'released').sort((a, b) => b.released_at - a.released_at);
    res.json({
      pending, released, payment_methods: METHODS,
      summary: {
        pending_count: pending.length,
        pending_total: pending.reduce((s, r) => s + r.amount, 0),
        overdue: pending.filter(r => r.overdue).length,
        released_month: released.filter(r => r.released_at >= monthStart).reduce((s, r) => s + r.amount, 0),
      },
    });
  });

  router.post('/:id/release', (req, res) => {
    const r = db.prepare(`SELECT * FROM payment_releases WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'pembayaran tidak ditemukan' });
    if (r.status === 'released') return res.status(409).json({ error: 'pembayaran sudah dicairkan' });
    const m = (req.body || {}).payment_method;
    db.prepare(`UPDATE payment_releases SET status='released', payment_method=?, released_by=?, released_at=? WHERE id=?`)
      .run(METHODS.includes(m) ? m : r.payment_method, (req.body || {}).released_by || 'Finance Director', nowSec(), r.id);
    res.json({ ok: true });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM payment_releases WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    // financial guard — block PATCH on released; restrict editable fields to safe ones
    if (row.status === 'released' || row.status === 'paid') {
      return res.status(403).json({ error: 'pembayaran sudah dicairkan — tidak bisa diubah' });
    }
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['payee', 'invoice_ref', 'amount', 'due_date', 'payment_method']) {
      if (b[k] !== undefined) {
        if (k === 'payment_method' && !METHODS.includes(b[k])) continue;
        fields.push(`${k} = ?`);
        args.push(b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE payment_releases SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const row = db.prepare(`SELECT status FROM payment_releases WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    // financial guard — only delete pending/draft. 403 for released/paid.
    if (row.status === 'released' || row.status === 'paid') {
      return res.status(403).json({ error: 'pembayaran sudah dicairkan — tidak bisa dihapus' });
    }
    const info = db.prepare(`DELETE FROM payment_releases WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/release-payment';
  app.use(mountPath, router);
  console.log(`[release-payment] mounted at ${mountPath} — vendor payment release`);

  return { router, db };
}

module.exports = { setupReleasePayment };
