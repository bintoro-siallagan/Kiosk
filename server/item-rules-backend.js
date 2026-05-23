// server/item-rules-backend.js
// Item Rules — kitchen routing (KDS station), promo engine link,
// availability rule + combo & bundle.
//
//   GET  /api/item-rules          — per-item rules + combos
//   POST /api/item-rules/:code    — update rules 1 item

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS item_rules (
  item_code TEXT PRIMARY KEY,
  kitchen_station TEXT DEFAULT 'Bar',
  promo_eligible INTEGER DEFAULT 1, loyalty_eligible INTEGER DEFAULT 1,
  cashback_eligible INTEGER DEFAULT 0,
  availability_mode TEXT DEFAULT 'Always', auto_hide_soldout INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS item_combos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, combo_type TEXT, items TEXT, price REAL, active INTEGER DEFAULT 1
);
`;
const STATIONS = ['Bar', 'Kitchen', 'Dessert', 'Cinema Snack'];
const AVAIL = ['Always', 'Scheduled', 'Peak Hour Only'];
const STATION_BY_CAT = { 'Beverage': 'Bar', 'Frozen Yogurt': 'Dessert', 'Take Home': 'Kitchen', 'Signature': 'Dessert' };

function setupItemRules(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };

  // Seed rules per finished-goods item
  if (db.prepare(`SELECT COUNT(*) c FROM item_rules`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO item_rules
      (item_code, kitchen_station, promo_eligible, loyalty_eligible, cashback_eligible, availability_mode, auto_hide_soldout)
      VALUES (?,?,?,?,?,?,?)`);
    for (const it of many(`SELECT item_code, category FROM item_master WHERE item_type = 'Finished Goods'`)) {
      const cat = it.category || '';
      const station = STATION_BY_CAT[cat] || 'Bar';
      const isTakehome = /take home/i.test(cat);
      const isSignature = /signature/i.test(cat);
      ins.run(it.item_code, station,
        isTakehome ? 0 : 1, 1,
        (cat === 'Beverage' || isSignature) ? 1 : 0,
        isSignature ? 'Peak Hour Only' : isTakehome ? 'Scheduled' : 'Always', 1);
    }
  }
  // Seed combos
  if (db.prepare(`SELECT COUNT(*) c FROM item_combos`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO item_combos (name, combo_type, items, price) VALUES (?,?,?,?)`);
    [
      ['Cinema Combo', 'cinema', ['Original Froyo', 'Mango Smoothie'], 45000],
      ['Meal Combo', 'meal', ['Chocolate Froyo', 'Topping Granola'], 38000],
      ['Family Package', 'family', ['4× Froyo Mix'], 95000],
      ['Couple Set', 'meal', ['2× Smoothie'], 58000],
    ].forEach(([n, t, items, p]) => ins.run(n, t, JSON.stringify(items), p));
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const items = many(`SELECT m.item_code, m.name, m.category, r.*
      FROM item_master m JOIN item_rules r ON r.item_code = m.item_code
      WHERE m.item_type = 'Finished Goods' ORDER BY m.category, m.name`).map(r => ({
      item_code: r.item_code, name: r.name, category: r.category,
      kitchen_station: r.kitchen_station,
      promo_eligible: !!r.promo_eligible, loyalty_eligible: !!r.loyalty_eligible,
      cashback_eligible: !!r.cashback_eligible,
      availability_mode: r.availability_mode, auto_hide_soldout: !!r.auto_hide_soldout,
    }));
    const combos = many(`SELECT * FROM item_combos ORDER BY id`).map(c => ({
      id: c.id, name: c.name, combo_type: c.combo_type, price: c.price, active: !!c.active,
      items: (() => { try { return JSON.parse(c.items || '[]'); } catch { return []; } })(),
    }));
    const station = {};
    for (const it of items) station[it.kitchen_station] = (station[it.kitchen_station] || 0) + 1;
    res.json({
      items, combos,
      catalog: { stations: STATIONS, availability_modes: AVAIL },
      station_dist: STATIONS.map(s => ({ station: s, count: station[s] || 0 })),
      summary: {
        total: items.length,
        promo_eligible: items.filter(i => i.promo_eligible).length,
        cashback_eligible: items.filter(i => i.cashback_eligible).length,
        scheduled: items.filter(i => i.availability_mode !== 'Always').length,
        combos: combos.length,
      },
    });
  });

  router.post('/:code', (req, res) => {
    const row = db.prepare(`SELECT * FROM item_rules WHERE item_code = ?`).get(req.params.code);
    if (!row) return res.status(404).json({ error: 'item tidak ditemukan' });
    const b = req.body || {};
    db.prepare(`UPDATE item_rules SET kitchen_station=?, promo_eligible=?, loyalty_eligible=?,
      cashback_eligible=?, availability_mode=?, auto_hide_soldout=? WHERE item_code=?`).run(
      STATIONS.includes(b.kitchen_station) ? b.kitchen_station : row.kitchen_station,
      b.promo_eligible ? 1 : 0, b.loyalty_eligible ? 1 : 0, b.cashback_eligible ? 1 : 0,
      AVAIL.includes(b.availability_mode) ? b.availability_mode : row.availability_mode,
      b.auto_hide_soldout ? 1 : 0, row.item_code);
    res.json({ ok: true });
  });

  // ── Combo CRUD ──────────────────────────────────────────────────────
  router.post('/combos', (req, res) => {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'nama wajib' });
    const items = Array.isArray(b.items) ? b.items : (typeof b.items === 'string' ? b.items.split(',').map(s => s.trim()).filter(Boolean) : []);
    db.prepare(`INSERT INTO item_combos (name, combo_type, items, price) VALUES (?,?,?,?)`)
      .run(String(b.name).trim(), b.combo_type || 'meal', JSON.stringify(items), Number(b.price) || 0);
    res.json({ ok: true });
  });
  router.patch('/combos/:id', (req, res) => {
    const c = db.prepare(`SELECT * FROM item_combos WHERE id = ?`).get(req.params.id);
    if (!c) return res.status(404).json({ error: 'combo tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    if (b.name !== undefined)       { fields.push('name = ?');       args.push(String(b.name).trim()); }
    if (b.combo_type !== undefined) { fields.push('combo_type = ?'); args.push(String(b.combo_type)); }
    if (b.items !== undefined) {
      const items = Array.isArray(b.items) ? b.items : (typeof b.items === 'string' ? b.items.split(',').map(s => s.trim()).filter(Boolean) : []);
      fields.push('items = ?'); args.push(JSON.stringify(items));
    }
    if (b.price !== undefined)      { fields.push('price = ?');      args.push(Number(b.price) || 0); }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE item_combos SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/combos/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM item_combos WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'combo tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/item-rules';
  app.use(mountPath, router);
  console.log(`[item-rules] mounted at ${mountPath} — kitchen routing, promo & combo`);

  return { router, db };
}

module.exports = { setupItemRules };
