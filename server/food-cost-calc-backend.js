// server/food-cost-calc-backend.js
// Food Cost Calculator — kalkulator biaya bahan: rakit resep, hitung
// food cost, margin & harga jual ideal. Tool what-if untuk menu baru.
//
//   GET  /api/food-cost-calc   — katalog bahan + kalkulasi tersimpan
//   POST /api/food-cost-calc   — simpan kalkulasi

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS food_cost_calcs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, product_name TEXT, ingredients TEXT,
  total_cost REAL, selling_price REAL, margin_pct REAL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const nowSec = () => Math.floor(Date.now() / 1000);
const J = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

function setupFoodCostCalc(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };
  const costOf = {};
  for (const w of many(`SELECT id, cost_per_unit FROM audit_warehouse`)) costOf[w.id] = w.cost_per_unit || 0;

  if (db.prepare(`SELECT COUNT(*) c FROM food_cost_calcs`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO food_cost_calcs (product_name, ingredients, total_cost, selling_price, margin_pct) VALUES (?,?,?,?,?)`);
    [
      ['Signature Froyo Bowl', [['RM01', 'Yogurt Base Plain', 0.15, 'kg'], ['TP01', 'Granola', 0.03, 'kg'], ['PK01', 'Cup 12oz', 1, 'pcs']], 35000],
      ['Mango Smoothie Large', [['RM06', 'Buah Mango', 0.2, 'kg'], ['RM04', 'Gula Cair', 0.05, 'liter'], ['PK02', 'Cup 16oz', 1, 'pcs']], 42000],
    ].forEach(([name, items, price]) => {
      const ings = items.map(([sku, nm, qty, unit]) => ({ sku, name: nm, qty, unit, unit_cost: costOf[sku] || 0, line_cost: Math.round((costOf[sku] || 0) * qty) }));
      const total = ings.reduce((s, x) => s + x.line_cost, 0);
      ins.run(name, JSON.stringify(ings), total, price, price > 0 ? Math.round((price - total) / price * 100) : 0);
    });
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const calcs = db.prepare(`SELECT * FROM food_cost_calcs ORDER BY created_at DESC`).all()
      .map(c => ({ ...c, ingredients: J(c.ingredients), food_cost_pct: c.selling_price > 0 ? Math.round(c.total_cost / c.selling_price * 100) : 0 }));
    res.json({
      ingredients: many(`SELECT id AS sku, name, unit, cost_per_unit FROM audit_warehouse ORDER BY id`),
      calculations: calcs,
      summary: {
        saved: calcs.length,
        avg_margin: calcs.length ? Math.round(calcs.reduce((s, c) => s + c.margin_pct, 0) / calcs.length) : 0,
        avg_food_cost: calcs.length ? Math.round(calcs.reduce((s, c) => s + c.food_cost_pct, 0) / calcs.length) : 0,
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    const items = (Array.isArray(b.ingredients) ? b.ingredients : []).filter(i => i.sku && Number(i.qty) > 0);
    if (!b.product_name || !items.length) return res.status(400).json({ error: 'nama produk & minimal 1 bahan wajib' });
    const ings = items.map(i => {
      const uc = costOf[i.sku] != null ? costOf[i.sku] : Number(i.unit_cost) || 0;
      return { sku: i.sku, name: i.name || i.sku, qty: Number(i.qty), unit: i.unit || 'pcs', unit_cost: uc, line_cost: Math.round(uc * Number(i.qty)) };
    });
    const total = ings.reduce((s, x) => s + x.line_cost, 0);
    const price = Number(b.selling_price) || 0;
    db.prepare(`INSERT INTO food_cost_calcs (product_name, ingredients, total_cost, selling_price, margin_pct) VALUES (?,?,?,?,?)`)
      .run(String(b.product_name).trim(), JSON.stringify(ings), total, price, price > 0 ? Math.round((price - total) / price * 100) : 0);
    res.json({ ok: true, total_cost: total });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM food_cost_calcs WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['product_name', 'total_cost', 'selling_price', 'margin_pct']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    // ingredients: store as JSON string
    if (b.ingredients !== undefined) {
      const ingStr = typeof b.ingredients === 'string' ? b.ingredients : JSON.stringify(b.ingredients);
      fields.push(`ingredients = ?`); args.push(ingStr);
    }
    // auto-recompute margin if selling_price + total_cost both known
    if (b.selling_price !== undefined && b.total_cost !== undefined) {
      const sp = Number(b.selling_price) || 0;
      const tc = Number(b.total_cost) || 0;
      const m = sp > 0 ? Math.round((sp - tc) / sp * 100) : 0;
      // replace any margin_pct push since we want the computed value
      const idx = fields.findIndex(f => f.startsWith('margin_pct'));
      if (idx >= 0) { args[idx] = m; } else { fields.push(`margin_pct = ?`); args.push(m); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE food_cost_calcs SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM food_cost_calcs WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/food-cost-calc';
  app.use(mountPath, router);
  console.log(`[food-cost-calc] mounted at ${mountPath} — food cost calculator`);

  return { router, db };
}

module.exports = { setupFoodCostCalc };
