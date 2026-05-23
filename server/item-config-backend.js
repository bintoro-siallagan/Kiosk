// server/item-config-backend.js
// Item Config — Inventory Config (stock/non-stock, min stock, reorder
// point, expiry/batch tracking) + Modifier System (size/sugar/ice/
// topping/add-on). BOM/Recipe = modul Food Cost.
//
//   GET  /api/item-config                    — inventory config + modifier groups
//   POST /api/item-config/inventory/:code    — update inventory config 1 item

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS item_inventory (
  item_code TEXT PRIMARY KEY,
  inventory_type TEXT DEFAULT 'non-stock',
  min_stock REAL DEFAULT 0, reorder_point REAL DEFAULT 0,
  expiry_tracking INTEGER DEFAULT 0, batch_tracking INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS modifier_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, mod_type TEXT, options TEXT
);
`;

function setupItemConfig(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };

  // ── Seed inventory config ──
  if (db.prepare(`SELECT COUNT(*) c FROM item_inventory`).get().c === 0) {
    const wh = {};
    for (const w of many(`SELECT id, min_stock FROM audit_warehouse`)) wh[w.id] = w;
    const ins = db.prepare(`INSERT INTO item_inventory
      (item_code, inventory_type, min_stock, reorder_point, expiry_tracking, batch_tracking) VALUES (?,?,?,?,?,?)`);
    for (const it of many(`SELECT item_code, item_type, category FROM item_master`)) {
      const w = wh[it.item_code];
      const isMaterial = it.item_type === 'Raw Material' || it.item_type === 'Packaging' || it.item_type === 'Modifier';
      const isTakehome = /take home/i.test(it.category || '');
      const stock = w || isMaterial || isTakehome;
      const min = w ? (w.min_stock || 0) : (isTakehome ? 10 : 0);
      ins.run(it.item_code, stock ? 'stock' : 'non-stock', min, Math.round(min * 1.5),
        (it.item_type === 'Raw Material' || isTakehome) ? 1 : 0,
        it.item_type === 'Raw Material' ? 1 : 0);
    }
  }

  // ── Seed modifier groups ──
  if (db.prepare(`SELECT COUNT(*) c FROM modifier_groups`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO modifier_groups (name, mod_type, options) VALUES (?,?,?)`);
    [
      ['Size', 'single', [['Regular', 0], ['Large', 8000]]],
      ['Sugar Level', 'single', [['Normal', 0], ['Less Sugar', 0], ['No Sugar', 0]]],
      ['Ice Level', 'single', [['Normal Ice', 0], ['Less Ice', 0], ['No Ice', 0]]],
      ['Topping', 'multi', [['Granola', 5000], ['Oreo Crush', 5000], ['Choco Chips', 6000], ['Mochi Balls', 7000]]],
      ['Add-on', 'multi', [['Extra Shot', 6000], ['Oat Milk', 8000], ['Whipped Cream', 5000]]],
    ].forEach(([n, t, opts]) => ins.run(n, t, JSON.stringify(opts.map(([name, price]) => ({ name, price })))));
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const wh = {};
    for (const w of many(`SELECT id, stock FROM audit_warehouse`)) wh[w.id] = w.stock;
    const inventory = many(`SELECT m.item_code, m.name, m.item_type, m.uom, i.*
      FROM item_master m JOIN item_inventory i ON i.item_code = m.item_code ORDER BY m.item_type, m.name`)
      .map(r => ({
        item_code: r.item_code, name: r.name, item_type: r.item_type, uom: r.uom,
        inventory_type: r.inventory_type, min_stock: r.min_stock, reorder_point: r.reorder_point,
        expiry_tracking: !!r.expiry_tracking, batch_tracking: !!r.batch_tracking,
        current_stock: wh[r.item_code] != null ? wh[r.item_code] : null,
      }));
    const modifiers = many(`SELECT * FROM modifier_groups ORDER BY id`).map(g => ({
      id: g.id, name: g.name, mod_type: g.mod_type,
      options: (() => { try { return JSON.parse(g.options || '[]'); } catch { return []; } })(),
    }));
    res.json({
      inventory, modifiers,
      summary: {
        total: inventory.length,
        stock_items: inventory.filter(i => i.inventory_type === 'stock').length,
        non_stock: inventory.filter(i => i.inventory_type === 'non-stock').length,
        expiry_tracked: inventory.filter(i => i.expiry_tracking).length,
        modifier_groups: modifiers.length,
      },
      bom_note: 'BOM / Recipe per item dikelola di tab Food Cost — auto deduction realtime.',
    });
  });

  router.post('/inventory/:code', (req, res) => {
    const row = db.prepare(`SELECT * FROM item_inventory WHERE item_code = ?`).get(req.params.code);
    if (!row) return res.status(404).json({ error: 'item tidak ditemukan' });
    const b = req.body || {};
    db.prepare(`UPDATE item_inventory SET inventory_type=?, min_stock=?, reorder_point=?,
      expiry_tracking=?, batch_tracking=? WHERE item_code=?`).run(
      b.inventory_type === 'stock' ? 'stock' : 'non-stock',
      Math.max(0, Number(b.min_stock) || 0), Math.max(0, Number(b.reorder_point) || 0),
      b.expiry_tracking ? 1 : 0, b.batch_tracking ? 1 : 0, row.item_code);
    res.json({ ok: true });
  });

  // ── Modifier Group CRUD ─────────────────────────────────────────────
  router.post('/modifiers', (req, res) => {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'nama wajib' });
    const options = Array.isArray(b.options) ? b.options : [];
    db.prepare(`INSERT INTO modifier_groups (name, mod_type, options) VALUES (?,?,?)`)
      .run(String(b.name).trim(), b.mod_type || 'single', JSON.stringify(options));
    res.json({ ok: true });
  });
  router.patch('/modifiers/:id', (req, res) => {
    const g = db.prepare(`SELECT * FROM modifier_groups WHERE id = ?`).get(req.params.id);
    if (!g) return res.status(404).json({ error: 'group tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    if (b.name !== undefined)     { fields.push('name = ?');     args.push(String(b.name).trim()); }
    if (b.mod_type !== undefined) { fields.push('mod_type = ?'); args.push(String(b.mod_type)); }
    if (b.options !== undefined)  { fields.push('options = ?');  args.push(JSON.stringify(Array.isArray(b.options) ? b.options : [])); }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE modifier_groups SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/modifiers/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM modifier_groups WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'group tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/item-config';
  app.use(mountPath, router);
  console.log(`[item-config] mounted at ${mountPath} — inventory config & modifiers`);

  return { router, db };
}

module.exports = { setupItemConfig };
