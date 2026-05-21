// server/core-tax-backend.js
// Core Tax — modul perpajakan: PPN (keluaran/masukan), PPh (21/23/25/
// final), faktur pajak & SPT Masa. Kewajiban pajak F&B enterprise.
//
//   GET  /api/core-tax             — ringkasan pajak + record + SPT
//   POST /api/core-tax/:id/status  — update status { status }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tax_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tax_type TEXT, label TEXT, period TEXT,
  dpp REAL, rate REAL, amount REAL, flow TEXT, status TEXT DEFAULT 'draft',
  due_date INTEGER, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const STATUSES = ['draft', 'reported', 'paid'];
const nowSec = () => Math.floor(Date.now() / 1000);
const DAY = 86400;

function setupCoreTax(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM tax_records`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO tax_records (tax_type, label, period, dpp, rate, amount, flow, status, due_date) VALUES (?,?,?,?,?,?,?,?,?)`);
    const due = nowSec() + 20 * DAY; // jatuh tempo 20 hari ke depan
    // [type, label, dpp, rate, amount, flow, status]
    [
      ['PPN', 'PPN Keluaran — Penjualan', 800000000, 11, 88000000, 'output', 'reported'],
      ['PPN', 'PPN Masukan — Pembelian', 400000000, 11, 44000000, 'input', 'reported'],
      ['PPh 21', 'PPh 21 — Gaji Karyawan', 0, 0, 8500000, 'pph', 'paid'],
      ['PPh 23', 'PPh 23 — Jasa Pihak Ketiga', 0, 2, 2000000, 'pph', 'draft'],
      ['PPh 25', 'PPh 25 — Angsuran Badan', 0, 0, 12000000, 'pph', 'paid'],
      ['PPh 4(2)', 'PPh Final 4(2) — Sewa Tempat', 35000000, 10, 3500000, 'pph', 'reported'],
    ].forEach(([t, l, dpp, rate, amt, flow, st]) => ins.run(t, l, 'Mei 2026', dpp, rate, amt, flow, st, due));
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const recs = db.prepare(`SELECT * FROM tax_records ORDER BY tax_type, id`).all();
    const sum = (f) => recs.filter(f).reduce((s, r) => s + r.amount, 0);
    const ppnOut = sum(r => r.tax_type === 'PPN' && r.flow === 'output');
    const ppnIn = sum(r => r.tax_type === 'PPN' && r.flow === 'input');
    const pphRecs = recs.filter(r => r.flow === 'pph');
    const pphTotal = pphRecs.reduce((s, r) => s + r.amount, 0);
    const ppnPayable = ppnOut - ppnIn;

    const due = nowSec() + 20 * DAY;
    const spt = [
      { name: 'SPT Masa PPN', period: 'Mei 2026', due_date: due, status: ppnPayable === recs.filter(r => r.tax_type === 'PPN' && r.status !== 'draft').length ? 'siap' : 'siap' },
      { name: 'SPT Masa PPh 21', period: 'Mei 2026', due_date: due, status: 'siap' },
      { name: 'SPT Masa PPh 23', period: 'Mei 2026', due_date: due, status: 'pending' },
      { name: 'SPT Masa Unifikasi', period: 'Mei 2026', due_date: due, status: 'pending' },
    ];
    const reported = recs.filter(r => r.status !== 'draft').length;

    res.json({
      period: 'Mei 2026',
      ppn: {
        dpp_penjualan: sum(r => r.tax_type === 'PPN' && r.flow === 'output') / 0.11,
        keluaran: ppnOut, masukan: ppnIn, kurang_bayar: ppnPayable,
      },
      pph: pphRecs.map(r => ({ id: r.id, type: r.tax_type, label: r.label, amount: r.amount, status: r.status })),
      faktur_pajak: { issued: 47, period: 'Mei 2026' },
      spt,
      records: recs,
      summary: {
        total_liability: ppnPayable + pphTotal,
        ppn_payable: ppnPayable,
        pph_total: pphTotal,
        faktur_issued: 47,
        compliance_pct: Math.round(reported / recs.length * 100),
      },
    });
  });

  router.post('/:id/status', (req, res) => {
    const r = db.prepare(`SELECT * FROM tax_records WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'record pajak tidak ditemukan' });
    const st = (req.body || {}).status;
    if (!STATUSES.includes(st)) return res.status(400).json({ error: 'status tidak valid' });
    db.prepare(`UPDATE tax_records SET status = ? WHERE id = ?`).run(st, r.id);
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/core-tax';
  app.use(mountPath, router);
  console.log(`[core-tax] mounted at ${mountPath} — PPN / PPh / faktur pajak / SPT`);

  return { router, db };
}

module.exports = { setupCoreTax };
