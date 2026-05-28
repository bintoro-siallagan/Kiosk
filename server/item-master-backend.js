// server/item-master-backend.js
// Item Master — registry terpadu semua item: finished goods, raw
// material, packaging, modifier. Item core + kategori + tipe.
//
//   GET /api/item-master   — items + tipe + kategori + summary

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS item_master (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_code TEXT UNIQUE, sku TEXT, barcode TEXT,
  name TEXT, short_name TEXT, category TEXT, subcategory TEXT,
  item_type TEXT, base_price REAL DEFAULT 0, uom TEXT DEFAULT 'pcs',
  image_url TEXT,
  status TEXT DEFAULT 'active', created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
// 7 tipe item
const TYPES = [
  { type: 'Finished Goods', icon: '🍦' }, { type: 'Raw Material', icon: '🌾' },
  { type: 'Semi Finished', icon: '🧪' }, { type: 'Modifier', icon: '➕' },
  { type: 'Packaging', icon: '📦' }, { type: 'Service Item', icon: '🛎️' },
  { type: 'Promo Item', icon: '🎁' },
];
const CAT_MAP = { froyo: 'Frozen Yogurt', smoothies: 'Beverage', yogulato: 'Frozen Yogurt', takehome: 'Take Home', collab: 'Signature' };

function setupItemMaster(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  // Migrate: add image_url if missing
  try {
    const cols = db.prepare(`PRAGMA table_info(item_master)`).all();
    if (!cols.some(c => c.name === 'image_url')) {
      db.exec(`ALTER TABLE item_master ADD COLUMN image_url TEXT`);
    }
  } catch (e) { console.warn('[item-master] migrate image_url:', e.message); }
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };

  // Seed registry dari pos_menus (finished goods) + audit_warehouse (material)
  if (db.prepare(`SELECT COUNT(*) c FROM item_master`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO item_master
      (item_code, sku, barcode, name, short_name, category, subcategory, item_type, base_price, uom)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    let n = 1;
    const bc = () => '899' + String(2000000000 + n);
    for (const m of many(`SELECT category_id, name, price FROM pos_menus ORDER BY category_id, price`)) {
      const cat3 = (m.category_id || 'gen').slice(0, 3).toUpperCase();
      const code = `FG-${cat3}-${String(n).padStart(3, '0')}`;
      ins.run(code, 'SKU-' + code, bc(), m.name, m.name.split(' ')[0],
        CAT_MAP[m.category_id] || 'Lainnya', (m.category_id || '').replace(/^\w/, c => c.toUpperCase()),
        'Finished Goods', m.price || 0, 'pcs');
      n++;
    }
    for (const w of many(`SELECT id, name, unit, cost_per_unit FROM audit_warehouse ORDER BY id`)) {
      const type = /^RM/i.test(w.id) ? 'Raw Material' : /^PK/i.test(w.id) ? 'Packaging' : /^TP/i.test(w.id) ? 'Modifier' : 'Raw Material';
      ins.run(w.id, 'SKU-' + w.id, bc(), w.name, w.name.split(' ').slice(0, 2).join(' '),
        type === 'Packaging' ? 'Packaging' : type === 'Modifier' ? 'Topping' : 'Bahan Baku', '',
        type, w.cost_per_unit || 0, w.unit || 'pcs');
      n++;
    }
  }

  const router = express.Router();

  // Auto-sync helper: ensure every pos_menus item exists in item_master as Finished Goods
  function syncFromPosMenus() {
    const existingCodes = new Set(many(`SELECT item_code FROM item_master`).map(r => r.item_code));
    const existingNames = new Set(many(`SELECT name FROM item_master`).map(r => (r.name || '').toLowerCase().trim()));
    const ins = db.prepare(`INSERT OR IGNORE INTO item_master
      (item_code, sku, barcode, name, short_name, category, subcategory, item_type, base_price, uom)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    let n = many(`SELECT COUNT(*) c FROM item_master`)[0]?.c || 0;
    const bc = () => '899' + String(2000000000 + (++n));
    let added = 0;
    for (const m of many(`SELECT id, category_id, name, price FROM pos_menus`)) {
      if (existingNames.has((m.name || '').toLowerCase().trim())) continue;
      const cat3 = (m.category_id || 'gen').slice(0, 3).toUpperCase();
      // Use pos_menus.id as item_code prefix
      let code = `FG-${cat3}-${String(m.id).slice(-6).toUpperCase()}`;
      while (existingCodes.has(code)) code = `FG-${cat3}-${Math.random().toString(36).slice(-5).toUpperCase()}`;
      ins.run(code, 'SKU-' + code, bc(), m.name, (m.name || '').split(' ')[0],
        CAT_MAP[m.category_id] || 'Lainnya', (m.category_id || '').replace(/^\w/, c => c.toUpperCase()),
        'Finished Goods', m.price || 0, 'pcs');
      existingCodes.add(code);
      existingNames.add((m.name || '').toLowerCase().trim());
      added++;
    }
    return added;
  }

  router.get('/', (req, res) => {
    // Auto-sync newly-added pos_menus items so bulk uploads appear here too
    try { syncFromPosMenus(); } catch (e) { console.warn('[item-master] sync failed:', e.message); }

    const items = many(`SELECT * FROM item_master ORDER BY item_type, name`);
    const typeCount = {};
    const catCount = {};
    for (const it of items) {
      typeCount[it.item_type] = (typeCount[it.item_type] || 0) + 1;
      catCount[it.category] = (catCount[it.category] || 0) + 1;
    }
    res.json({
      items,
      types: TYPES.map(t => ({ ...t, count: typeCount[t.type] || 0 })),
      categories: Object.entries(catCount).map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      summary: {
        total: items.length,
        finished_goods: typeCount['Finished Goods'] || 0,
        raw_material: typeCount['Raw Material'] || 0,
        packaging: typeCount['Packaging'] || 0,
        active: items.filter(i => i.status === 'active').length,
      },
    });
  });

  // POST /sync — force re-sync from pos_menus (called after bulk upload)
  router.post('/sync', (req, res) => {
    try {
      const added = syncFromPosMenus();
      res.json({ ok: true, added });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /:itemCode/image — upload/replace image for an item.
  // Stores file via multer, updates item_master + matching pos_menus (by name) for kiosk consistency.
  router.post('/:itemCode/image', (req, res) => {
    const upload = opts.uploadMiddleware;
    if (!upload) return res.status(500).json({ error: 'upload middleware not configured' });
    upload.single('image')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'no image uploaded' });
      const url = `/uploads/${req.file.filename}`;
      try {
        const item = db.prepare(`SELECT name FROM item_master WHERE item_code = ?`).get(req.params.itemCode);
        if (!item) return res.status(404).json({ error: 'item not found' });
        db.prepare(`UPDATE item_master SET image_url = ? WHERE item_code = ?`).run(url, req.params.itemCode);
        // Mirror to pos_menus by name for kiosk visibility
        try { db.prepare(`UPDATE pos_menus SET image_url = ?, updated_at = strftime('%s','now') WHERE LOWER(TRIM(name)) = ?`).run(url, item.name.toLowerCase().trim()); } catch {}
        res.json({ ok: true, image_url: url });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
  });

  // PATCH /:itemCode — update editable fields (name, description, item_code rename, category, price, status)
  // Mirror perubahan ke pos_menus juga kalau name matched (untuk konsistensi kiosk/POS display).
  router.patch('/:itemCode', (req, res) => {
    try {
      const orig = db.prepare(`SELECT * FROM item_master WHERE item_code = ?`).get(req.params.itemCode);
      if (!orig) return res.status(404).json({ error: 'item not found' });
      const b = req.body || {};
      const fields = [];
      const args = [];
      const allowed = ['name', 'description', 'category', 'subcategory', 'base_price', 'uom', 'status', 'barcode', 'item_code'];
      for (const k of allowed) {
        if (k in b) {
          fields.push(`${k} = ?`);
          args.push(b[k]);
        }
      }
      if (!fields.length) return res.json({ ok: true, noop: true });
      args.push(req.params.itemCode);
      db.prepare(`UPDATE item_master SET ${fields.join(', ')} WHERE item_code = ?`).run(...args);
      // Mirror name + description + price ke pos_menus (kiosk visibility)
      try {
        const updates = [];
        const pargs = [];
        if (b.name) { updates.push('name = ?'); pargs.push(b.name); }
        if (b.description) { updates.push('description = ?'); pargs.push(b.description); }
        if (b.base_price !== undefined) { updates.push('price = ?'); pargs.push(Number(b.base_price) || 0); }
        if (updates.length > 0) {
          updates.push("updated_at = strftime('%s','now')");
          pargs.push(orig.name.toLowerCase().trim());
          db.prepare(`UPDATE pos_menus SET ${updates.join(', ')} WHERE LOWER(TRIM(name)) = ?`).run(...pargs);
        }
      } catch {}
      const updated = db.prepare(`SELECT * FROM item_master WHERE item_code = ?`).get(b.item_code || req.params.itemCode);
      res.json({ ok: true, item: updated });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // DELETE /:itemCode/image — remove image association
  router.delete('/:itemCode/image', (req, res) => {
    try {
      const item = db.prepare(`SELECT name FROM item_master WHERE item_code = ?`).get(req.params.itemCode);
      if (!item) return res.status(404).json({ error: 'item not found' });
      db.prepare(`UPDATE item_master SET image_url = NULL WHERE item_code = ?`).run(req.params.itemCode);
      try { db.prepare(`UPDATE pos_menus SET image_url = NULL, updated_at = strftime('%s','now') WHERE LOWER(TRIM(name)) = ?`).run(item.name.toLowerCase().trim()); } catch {}
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  const mountPath = opts.mountPath || '/api/item-master';
  app.use(mountPath, router);
  console.log(`[item-master] mounted at ${mountPath} — unified item registry`);

  return { router, db };
}

module.exports = { setupItemMaster };
