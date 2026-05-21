// server/cash-flow-backend.js
// Laporan Arus Kas — Cash Flow Statement (Operating / Investing /
// Financing). Melengkapi 3 laporan keuangan inti.
//
//   GET /api/cash-flow   — laporan arus kas + saldo kas

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cashflow_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT, period TEXT, section TEXT,
  label TEXT, amount REAL, sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cashflow_meta (
  period TEXT PRIMARY KEY, opening_cash REAL
);
`;
const SECTIONS = ['Operasi', 'Investasi', 'Pendanaan'];

function setupCashFlow(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM cashflow_lines`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO cashflow_lines (period, section, label, amount, sort) VALUES (?,?,?,?,?)`);
    const P = 'Mei 2026';
    // [section, label, amount]
    [
      ['Operasi', 'Laba bersih operasional', 95000000],
      ['Operasi', 'Penyusutan & amortisasi', 12000000],
      ['Operasi', 'Kenaikan piutang usaha', -8500000],
      ['Operasi', 'Kenaikan persediaan', -15000000],
      ['Operasi', 'Kenaikan hutang usaha', 18000000],
      ['Investasi', 'Pembelian peralatan outlet', -45000000],
      ['Investasi', 'Pembelian aset kendaraan', -20000000],
      ['Pendanaan', 'Penerimaan pinjaman bank', 50000000],
      ['Pendanaan', 'Pembayaran cicilan pinjaman', -15000000],
      ['Pendanaan', 'Prive / dividen pemilik', -25000000],
    ].forEach(([s, l, a], i) => ins.run(P, s, l, a, i));
    db.prepare(`INSERT INTO cashflow_meta (period, opening_cash) VALUES (?,?)`).run(P, 120000000);
  }

  const router = express.Router();

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM cashflow_lines ORDER BY sort`).all();
    const meta = db.prepare(`SELECT * FROM cashflow_meta LIMIT 1`).get() || { period: 'Mei 2026', opening_cash: 0 };
    const sections = SECTIONS.map(s => {
      const lines = rows.filter(r => r.section === s);
      return { section: s, lines, subtotal: lines.reduce((a, r) => a + r.amount, 0) };
    });
    const netChange = sections.reduce((a, s) => a + s.subtotal, 0);
    const closing = meta.opening_cash + netChange;
    res.json({
      period: meta.period, sections,
      net_change: netChange,
      opening_cash: meta.opening_cash,
      closing_cash: closing,
      summary: {
        operating: sections[0].subtotal,
        investing: sections[1].subtotal,
        financing: sections[2].subtotal,
        net_change: netChange, closing_cash: closing,
        healthy: sections[0].subtotal > 0,   // arus kas operasi positif = sehat
      },
    });
  });

  const mountPath = opts.mountPath || '/api/cash-flow';
  app.use(mountPath, router);
  console.log(`[cash-flow] mounted at ${mountPath} — cash flow statement`);

  return { router, db };
}

module.exports = { setupCashFlow };
