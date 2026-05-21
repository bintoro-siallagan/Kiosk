// server/consolidation-backend.js
// Konsolidasi — laporan keuangan gabungan multi-PT / multi-outlet.
// Consolidated P&L, eliminasi transaksi antar-entitas (intercompany),
// kontribusi per entitas.
//
//   GET /api/consolidation   — laporan konsolidasi + eliminasi

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS consol_entities (
  code TEXT PRIMARY KEY, name TEXT, outlets TEXT, revenue REAL, cogs REAL, opex REAL
);
CREATE TABLE IF NOT EXISTS consol_intercompany (
  id INTEGER PRIMARY KEY AUTOINCREMENT, from_code TEXT, to_code TEXT, amount REAL, description TEXT
);
`;

function setupConsolidation(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };

  if (db.prepare(`SELECT COUNT(*) c FROM consol_entities`).get().c === 0) {
    const e = db.prepare(`INSERT INTO consol_entities (code, name, outlets, revenue, cogs, opex) VALUES (?,?,?,?,?,?)`);
    [
      ['PT-PST', 'PT Sour Sally Pusat', 'Paskal · Dago · Central Kitchen', 420000000, 168000000, 140000000],
      ['PT-JKT', 'PT Sour Sally Jakarta', 'Sudirman · Kemang', 310000000, 130000000, 105000000],
      ['PT-EXP', 'PT Sour Sally Ekspansi', 'BSD City · Balikpapan', 240000000, 102000000, 88000000],
    ].forEach(r => e.run(...r));
    const ic = db.prepare(`INSERT INTO consol_intercompany (from_code, to_code, amount, description) VALUES (?,?,?,?)`);
    [
      ['PT-PST', 'PT-JKT', 35000000, 'Suplai bahan baku Central Kitchen → outlet Jakarta'],
      ['PT-PST', 'PT-EXP', 28000000, 'Suplai bahan baku Central Kitchen → outlet Ekspansi'],
    ].forEach(r => ic.run(...r));
  }

  const router = express.Router();

  router.get('/', (req, res) => {
    const entities = many(`SELECT * FROM consol_entities`).map(e => {
      const gross = e.revenue - e.cogs;
      return {
        ...e, gross_profit: gross, net_profit: gross - e.opex,
        margin_pct: e.revenue ? Math.round((gross - e.opex) / e.revenue * 100) : 0,
      };
    });
    const intercompany = many(`SELECT * FROM consol_intercompany`);
    const nameOf = {}; for (const e of entities) nameOf[e.code] = e.name;
    const elim = intercompany.reduce((s, x) => s + x.amount, 0);

    const grossRev = entities.reduce((s, e) => s + e.revenue, 0);
    const grossCogs = entities.reduce((s, e) => s + e.cogs, 0);
    const opex = entities.reduce((s, e) => s + e.opex, 0);
    // eliminasi: intercompany sale (revenue penjual) = COGS pembeli → keduanya dieliminasi
    const revNet = grossRev - elim;
    const cogsNet = grossCogs - elim;
    const grossProfit = revNet - cogsNet;
    const netProfit = grossProfit - opex;

    res.json({
      period: 'Mei 2026',
      entities,
      intercompany: intercompany.map(x => ({ ...x, from_name: nameOf[x.from_code], to_name: nameOf[x.to_code] })),
      consolidated: {
        revenue_gross: grossRev, intercompany_elimination: elim, revenue_net: revNet,
        cogs: cogsNet, gross_profit: grossProfit, opex, net_profit: netProfit,
        margin_pct: revNet ? Math.round(netProfit / revNet * 100) : 0,
      },
      summary: {
        entities: entities.length,
        consolidated_revenue: revNet,
        consolidated_net_profit: netProfit,
        elimination: elim,
        top_contributor: entities.slice().sort((a, b) => b.net_profit - a.net_profit)[0] || null,
      },
    });
  });

  const mountPath = opts.mountPath || '/api/consolidation';
  app.use(mountPath, router);
  console.log(`[consolidation] mounted at ${mountPath} — multi-entity consolidation`);

  return { router, db };
}

module.exports = { setupConsolidation };
