// server/seed-backend.js
// karyaOS — Global Seed / Recovery Endpoint
// Kalau ada module error/empty, manual trigger re-seed dari sini.
//
// Endpoints at /api/seed:
//   GET    /status        — list semua module + count data
//   POST   /reset-demo    — wipe DEMO_ prefix data + re-seed semua module
//   POST   /reseed/launch — re-seed launch demo project
//   POST   /reseed/service — re-seed service demo ticket
//   POST   /reseed/outlet-pins — re-seed outlet pins dari outlets table
//   POST   /reseed/all    — run all reseed sequentially

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const nowSec = () => Math.floor(Date.now() / 1000);

function setupSeed(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');

  const safeCount = (table) => {
    try { return db.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c; }
    catch { return null; }
  };

  function reseedLaunch() {
    try {
      const existing = db.prepare(`SELECT id FROM outlet_launches WHERE outlet_code LIKE 'DEMO_%'`).all();
      if (existing.length > 0) return { skipped: 'demo launch already exists', count: existing.length };
      const now = nowSec();
      const r = db.prepare(`INSERT INTO outlet_launches (outlet_code, outlet_name, vertical, area, target_open_date, project_manager, gm_name, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run('DEMO_KEMANG_02', 'Kemang Plaza 2 (DEMO)', 'fnb', 'Jakarta Selatan',
             now + 45 * 86400, 'Rina Pratama', 'Budi Hartono',
             'Auto-seeded demo — bisa di-archive setelah Anda buat project asli.', 'system-seed');
      // Trigger task seeding via outlet-launch backend pattern
      try {
        const { DEPARTMENTS, STAGES } = require('./outlet-launch-backend');
        // We can't easily re-export DEFAULT_TASKS — call REST endpoint instead OR rely on launch backend auto-seed.
        // For now just create the empty launch; tasks will need manual seeding via PATCH or via internal call.
      } catch {}
      return { ok: true, launch_id: r.lastInsertRowid };
    } catch (e) { return { error: e.message }; }
  }

  function reseedService() {
    try {
      const existing = db.prepare(`SELECT id FROM service_tickets WHERE created_by='system-seed'`).all();
      if (existing.length > 0) return { skipped: 'demo ticket already exists', count: existing.length };
      let outletCode = 'DEMO_OUTLET', outletName = 'Demo Outlet';
      try {
        const o = db.prepare(`SELECT name FROM outlets LIMIT 1`).get();
        if (o) { outletCode = o.name.replace(/\s+/g, '_').toUpperCase(); outletName = o.name; }
      } catch {}
      const year = new Date().getFullYear();
      const cnt = db.prepare(`SELECT COUNT(*) c FROM service_tickets WHERE ticket_no LIKE ?`).get(`SV-${year}-%`).c;
      const ticketNo = `SV-${year}-${String(cnt + 1).padStart(4, '0')}`;
      const due = nowSec() + 86400;
      const r = db.prepare(`INSERT INTO service_tickets (ticket_no, outlet_code, outlet_name, department, ticket_type, title, description, priority, assigned_to_name, created_by, due_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(ticketNo, outletCode, outletName, 'it', 'PC Repair',
             '[DEMO] PC kasir #2 sering hang',
             'Auto-seed demo ticket.', 'high', 'Manager', 'system-seed', due);
      const ticketId = r.lastInsertRowid;
      // Seed items from any IT template
      try {
        const tpl = db.prepare(`SELECT items_json FROM service_templates WHERE department='it' LIMIT 1`).get();
        if (tpl) {
          const items = JSON.parse(tpl.items_json);
          const insItem = db.prepare(`INSERT INTO service_ticket_items (ticket_id, item_label, requires_photo, display_order) VALUES (?,?,?,?)`);
          const tx = db.transaction(() => items.forEach((it, i) => insItem.run(ticketId, it.label, it.requires_photo ? 1 : 0, it.order || (i + 1) * 10)));
          tx();
        }
      } catch {}
      return { ok: true, ticket_no: ticketNo };
    } catch (e) { return { error: e.message }; }
  }

  function reseedOutletPins() {
    try {
      const existing = db.prepare(`SELECT COUNT(*) c FROM outlet_pins`).get().c;
      if (existing > 0) return { skipped: 'outlet pins exist', count: existing };
      const AREA_COORDS = {
        'Jakarta':   { lat: -6.2088, lon: 106.8456 },
        'Bandung':   { lat: -6.9175, lon: 107.6191 },
        'Tangerang': { lat: -6.1783, lon: 106.6319 },
        'Surabaya':  { lat: -7.2575, lon: 112.7521 },
        'Kalimantan':{ lat: -1.2379, lon: 116.8529 },
      };
      const fallback = { lat: -6.2088, lon: 106.8456 };
      const outletRows = db.prepare(`SELECT name, area, manager FROM outlets`).all();
      if (outletRows.length === 0) return { error: 'No outlets to seed pins for' };
      const insPin = db.prepare(`INSERT OR IGNORE INTO outlet_pins (outlet_code, outlet_name, vertical, manager_name, gps_lat, gps_lon, gps_radius_m, geofence_enforce, address, manager_pin_hash) VALUES (?,?,?,?,?,?,?,?,?,?)`);
      const defaultPinHash = sha256('1234');
      let seeded = 0;
      for (const o of outletRows) {
        const coords = AREA_COORDS[o.area] || fallback;
        const jitter = () => (Math.random() - 0.5) * 0.01;
        const code = o.name.replace(/\s+/g, '_').toUpperCase();
        const r = insPin.run(code, o.name, 'fnb', o.manager || null,
                   coords.lat + jitter(), coords.lon + jitter(),
                   200, 0, `${o.name}, ${o.area}`, defaultPinHash);
        if (r.changes > 0) seeded++;
      }
      return { ok: true, seeded };
    } catch (e) { return { error: e.message }; }
  }

  const router = express.Router();

  // Diagnostics
  router.get('/status', (req, res) => {
    const status = {
      timestamp: new Date().toISOString(),
      modules: {
        outlets:           safeCount('outlets'),
        outlet_pins:       safeCount('outlet_pins'),
        outlet_launches:   safeCount('outlet_launches'),
        launch_tasks:      safeCount('launch_tasks'),
        service_tickets:   safeCount('service_tickets'),
        service_templates: safeCount('service_templates'),
        departments:       safeCount('departments'),
        admin_users:       safeCount('admin_users'),
        cinema_tickets:    safeCount('cinema_tickets'),
        cinema_cashier_ratings: safeCount('cinema_cashier_ratings'),
        outlet_audits:     safeCount('outlet_audits'),
        outlet_anomalies:  safeCount('outlet_anomalies'),
      },
    };
    const issues = [];
    if (status.modules.outlets === 0) issues.push('No outlets — Owner registry kosong');
    if (status.modules.outlet_pins === 0) issues.push('Geofence belum ter-config — submit /api/seed/reseed/outlet-pins');
    if (status.modules.outlet_launches === 0) issues.push('No launch projects — submit /api/seed/reseed/launch');
    if (status.modules.service_tickets === 0) issues.push('No service tickets — submit /api/seed/reseed/service');
    if (status.modules.admin_users === 0) issues.push('CRITICAL: no admin users — system locked');
    status.issues = issues;
    status.healthy = issues.length === 0;
    res.json(status);
  });

  router.post('/reseed/launch', (req, res) => res.json(reseedLaunch()));
  router.post('/reseed/service', (req, res) => res.json(reseedService()));
  router.post('/reseed/outlet-pins', (req, res) => res.json(reseedOutletPins()));

  // ─── Demo Orders Generator ──────────────────────────────
  // POST /api/seed/demo-orders?count=30
  // Generate realistic sample orders distributed across today + few feedback
  // ratings. Tagged source='demo-seed' utk easy cleanup.
  // Use case: investor demo, screenshot marketing, manual QA test.
  router.post('/demo-orders', (req, res) => {
    const count = Math.min(Math.max(parseInt(req.query.count, 10) || 30, 1), 200);
    try {
      const menus = db.prepare(`SELECT id, name, emoji, price FROM pos_menus WHERE COALESCE(is_available,1)=1 LIMIT 30`).all();
      if (!menus.length) return res.status(400).json({ error: 'Tidak ada menu — seed menu dulu' });

      const NAMES = ['Andi', 'Sari', 'Budi', 'Rina', 'Doni', 'Maya', 'Eka', 'Hani', 'Bayu', 'Indah', 'Joko', 'Wina', 'Tomi', 'Lina', 'Aji', 'Citra', 'Reza', 'Dewi', 'Fajar', 'Putri', 'Galih', 'Aulia', 'Hadi', 'Mira', 'Yoga'];
      const PAYS = ['CASH', 'QRIS', 'CARD', 'CASH', 'QRIS', 'QRIS']; // QRIS lebih sering
      const TYPES = ['dine', 'takeaway', 'dine', 'takeaway', 'takeaway']; // takeaway sedikit lebih
      const KASIRS = ['Sari', 'Budi', 'Andi'];

      // Distribute timestamps across today (start 8am to current hour)
      const dayStartMs = new Date().setHours(8, 0, 0, 0);
      const nowMs = Date.now();
      const spanMs = Math.max(60000, nowMs - dayStartMs); // at least 1 min span

      const insertOrder = db.prepare(`
        INSERT INTO orders (id, time, type, "table", status, pay, items, addons, subtotal, tax, total, customer_name, customer_phone, kasir, source)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);

      const created = [];
      for (let i = 0; i < count; i++) {
        const ts = dayStartMs + Math.floor(Math.random() * spanMs);
        const orderId = `D${ts.toString(36).slice(-6).toUpperCase()}-${i}`;
        const itemCount = 1 + Math.floor(Math.random() * 3); // 1-3 items
        const items = [];
        for (let j = 0; j < itemCount; j++) {
          const m = menus[Math.floor(Math.random() * menus.length)];
          const q = 1 + Math.floor(Math.random() * 2);
          items.push({ id: m.id, n: m.name, e: m.emoji || '', q, p: m.price, addonTotal: 0, addons: {} });
        }
        const subtotal = items.reduce((s, it) => s + it.p * it.q, 0);
        const tax = Math.round(subtotal * 11 / 111);
        const total = subtotal;
        const type = TYPES[Math.floor(Math.random() * TYPES.length)];
        const pay = PAYS[Math.floor(Math.random() * PAYS.length)];
        const customerName = Math.random() < 0.7 ? NAMES[Math.floor(Math.random() * NAMES.length)] : null;
        const customerPhone = customerName && Math.random() < 0.4 ? `0812${String(Math.floor(Math.random() * 99999999)).padStart(8, '0')}` : null;
        const kasir = KASIRS[Math.floor(Math.random() * KASIRS.length)];
        // Status distribution: 70% completed, 15% ready, 10% preparing, 5% waiting
        const r = Math.random();
        const status = r < 0.7 ? 'completed' : r < 0.85 ? 'ready' : r < 0.95 ? 'preparing' : 'waiting';
        const table = type === 'dine' ? `T${1 + Math.floor(Math.random() * 12)}` : '-';

        try {
          insertOrder.run(orderId, ts, type, table, status, pay,
            JSON.stringify(items), '[]', subtotal, tax, total,
            customerName, customerPhone, kasir, 'demo-seed');
          created.push(orderId);
        } catch {}
      }

      // Generate ratings for ~40% of completed orders
      let ratingCount = 0;
      try {
        const completedDemo = db.prepare(`SELECT id FROM orders WHERE source = 'demo-seed' AND status = 'completed' AND time >= ?`).all(dayStartMs);
        const insertFb = db.prepare(`INSERT INTO customer_feedback (order_ref, rating, comment, cashier, source, created_at) VALUES (?,?,?,?,?,?)`);
        const COMMENTS_GOOD = ['Mantap banget!', 'Cepet pelayanannya', 'Enak banget', 'Recommended', 'Selalu konsisten enak', 'Kasir ramah', '', '', null];
        const COMMENTS_MID  = ['Cukup', 'Lumayan', 'Standard', '', null];
        const COMMENTS_BAD  = ['Agak lama nunggu', 'Rasa kurang', 'Kasir kurang ramah'];
        for (const o of completedDemo) {
          if (Math.random() > 0.4) continue;
          const rRoll = Math.random();
          const stars = rRoll < 0.55 ? 5 : rRoll < 0.85 ? 4 : rRoll < 0.95 ? 3 : 2;
          const pool = stars >= 4 ? COMMENTS_GOOD : stars === 3 ? COMMENTS_MID : COMMENTS_BAD;
          const comment = pool[Math.floor(Math.random() * pool.length)];
          const ts = dayStartMs + Math.floor(Math.random() * spanMs);
          insertFb.run(o.id, stars, comment, ['Sari', 'Budi', 'Andi'][Math.floor(Math.random() * 3)], 'demo-seed', Math.floor(ts / 1000));
          ratingCount++;
        }
      } catch {}

      res.json({ ok: true, orders_created: created.length, ratings_created: ratingCount, source: 'demo-seed' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/seed/demo-orders/cleanup — hapus semua demo-seed data
  router.post('/demo-orders/cleanup', (req, res) => {
    try {
      const o = db.prepare(`DELETE FROM orders WHERE source = 'demo-seed'`).run();
      let f = { changes: 0 };
      try { f = db.prepare(`DELETE FROM customer_feedback WHERE source = 'demo-seed'`).run(); } catch {}
      res.json({ ok: true, orders_deleted: o.changes, ratings_deleted: f.changes });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/reseed/all', (req, res) => {
    res.json({
      launch: reseedLaunch(),
      service: reseedService(),
      outlet_pins: reseedOutletPins(),
    });
  });

  router.post('/reset-demo', (req, res) => {
    if (req.body?.confirm !== 'YES_RESET_DEMO') {
      return res.status(400).json({ error: 'Pass {confirm: "YES_RESET_DEMO"} to actually reset' });
    }
    try {
      // Delete DEMO_ prefixed launches + cascade
      const dels = [];
      try { dels.push({ launches: db.prepare(`DELETE FROM outlet_launches WHERE outlet_code LIKE 'DEMO_%'`).run().changes }); } catch {}
      try { dels.push({ service_tickets: db.prepare(`DELETE FROM service_tickets WHERE created_by='system-seed'`).run().changes }); } catch {}
      // Re-seed
      const seeds = { launch: reseedLaunch(), service: reseedService(), outlet_pins: reseedOutletPins() };
      res.json({ deleted: dels, seeded: seeds });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.use(opts.mountPath || '/api/seed', router);
  console.log(`[seed] mounted at ${opts.mountPath || '/api/seed'} — recovery endpoint`);
  return { router, db };
}

module.exports = { setupSeed };
