// server/service-visit-backend.js
// karyaOS — Service Visit (Karya Field Service)
// Visit dept (IT/Maintenance/Supplier/QA) ke outlet untuk task tertentu.
// Contoh: 'Perbaiki PC kasir di Grand Indonesia' — assigned ke IT, ada
// checklist, staff submit dengan foto + selfie + GPS.
//
// Anti-fake-location:
// - Geofence enforce per outlet (sama dengan audit)
// - Selfie kerja wajib (anti-nitip-ID)
// - Device ID tracking
// - Super-admin bypass via PIN
//
// KPI per dept: response time (created → checked_in), completion %,
// avg foto per ticket, ticket on-time rate.
//
// Endpoints at /api/service:
//   GET    /tickets                — list tickets (filter by status, dept, outlet, assignee)
//   POST   /tickets                — create ticket (assigns + auto-seeds template checklist)
//   GET    /tickets/:id            — detail with items + photos + selfie
//   PATCH  /tickets/:id            — update ticket meta
//   DELETE /tickets/:id            — cancel ticket
//   POST   /tickets/:id/start      — staff start (record checkin time + GPS + selfie + device)
//   PATCH  /tickets/:id/items/:itemId — update item status / note
//   POST   /tickets/:id/items/:itemId/photo — upload photo evidence
//   POST   /tickets/:id/finish     — staff finish (final selfie + summary + notes)
//   GET    /templates              — list templates per dept
//   POST   /templates              — create/update template (per dept)
//   DELETE /templates/:id          — remove template
//   GET    /kpi                    — dept KPI summary (response time, completion, on-time rate)

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const nowSec = () => Math.floor(Date.now() / 1000);
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function distMeters(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS service_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_no TEXT UNIQUE,                 -- auto-gen: SV-2026-0001
  outlet_code TEXT NOT NULL,
  outlet_name TEXT,
  department TEXT NOT NULL,              -- it | maintenance | supplier | qa | facility | custom
  ticket_type TEXT,                      -- 'PC Repair' | 'AC Service' | 'Stock Restock' | dst
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'normal',        -- low | normal | high | urgent
  assigned_to_name TEXT,                 -- nama staff yang ditugaskan
  assigned_to_id TEXT,                   -- optional staff id
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  due_at INTEGER,                        -- SLA deadline
  started_at INTEGER,                    -- staff checkin
  start_gps_lat REAL, start_gps_lon REAL, start_gps_distance_m INTEGER,
  start_selfie TEXT,                     -- filename
  start_device_id TEXT,
  finished_at INTEGER,
  finish_summary TEXT,
  finish_selfie TEXT,
  finish_gps_lat REAL, finish_gps_lon REAL,
  status TEXT DEFAULT 'open',            -- open | in_progress | completed | cancelled
  on_time INTEGER                        -- 1 if finished_at <= due_at, 0 else, null if open
);
CREATE INDEX IF NOT EXISTS idx_st_outlet ON service_tickets(outlet_code, status);
CREATE INDEX IF NOT EXISTS idx_st_dept ON service_tickets(department, status);
CREATE INDEX IF NOT EXISTS idx_st_assigned ON service_tickets(assigned_to_name, status);

CREATE TABLE IF NOT EXISTS service_ticket_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  item_code TEXT,
  item_label TEXT NOT NULL,
  requires_photo INTEGER DEFAULT 1,
  display_order INTEGER DEFAULT 100,
  status TEXT DEFAULT 'pending',         -- pending | done | skipped
  note TEXT,
  updated_at INTEGER,
  FOREIGN KEY(ticket_id) REFERENCES service_tickets(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sti_ticket ON service_ticket_items(ticket_id);

CREATE TABLE IF NOT EXISTS service_item_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_item_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  gps_lat REAL, gps_lon REAL, gps_distance_m INTEGER,
  uploaded_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  FOREIGN KEY(ticket_item_id) REFERENCES service_ticket_items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sip_item ON service_item_photos(ticket_item_id);

CREATE TABLE IF NOT EXISTS service_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department TEXT NOT NULL,
  template_name TEXT NOT NULL,           -- 'PC Repair', 'AC Service', dst
  description TEXT,
  items_json TEXT NOT NULL,              -- JSON array: [{label, requires_photo, order}]
  active INTEGER DEFAULT 1,
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tpl_dept ON service_templates(department, active);
`;

// Default templates per dept — best practice, admin bisa edit/tambah
const DEFAULT_TEMPLATES = [
  {
    department: 'it', template_name: 'PC / POS Hardware Repair',
    description: 'Troubleshoot & perbaikan PC kasir / POS terminal',
    items: [
      { label: 'Visual check: cek kondisi fisik PC (debu, kabel, port)', requires_photo: 1 },
      { label: 'Boot test: PC bisa boot ke OS dalam 60 detik', requires_photo: 1 },
      { label: 'POS app launch test', requires_photo: 1 },
      { label: 'Printer thermal connection test', requires_photo: 1 },
      { label: 'Customer display (CDS) connection test', requires_photo: 0 },
      { label: 'EDC / payment device integration test', requires_photo: 1 },
      { label: 'Internet connection speed test (≥20Mbps)', requires_photo: 1 },
      { label: 'Backup printer + UPS fungsional', requires_photo: 0 },
      { label: 'Cleanup: dust + cable tidy', requires_photo: 1 },
      { label: 'Demo transaksi test dengan kasir on-site', requires_photo: 0 },
    ],
  },
  {
    department: 'it', template_name: 'Network / WiFi Service',
    description: 'Troubleshoot router, WiFi, koneksi internet outlet',
    items: [
      { label: 'Modem / router status indicator normal', requires_photo: 1 },
      { label: 'Speed test downlink ≥50Mbps', requires_photo: 1 },
      { label: 'Speed test uplink ≥10Mbps', requires_photo: 1 },
      { label: 'WiFi SSID customer + staff terpisah', requires_photo: 0 },
      { label: 'Coverage WiFi merata di semua area (signal ≥-70dBm)', requires_photo: 1 },
      { label: 'Port LAN POS area fungsional', requires_photo: 0 },
      { label: 'Backup 4G / cellular ready (kalau ada)', requires_photo: 0 },
    ],
  },
  {
    department: 'maintenance', template_name: 'AC / HVAC Service',
    description: 'Perawatan rutin AC outlet',
    items: [
      { label: 'Cuci filter AC indoor', requires_photo: 1 },
      { label: 'Cek freon level + pressure', requires_photo: 1 },
      { label: 'Cek outdoor unit (debu, kotoran)', requires_photo: 1 },
      { label: 'Test suhu output ≤18°C', requires_photo: 1 },
      { label: 'Cek drainase air kondensasi (tidak bocor)', requires_photo: 1 },
      { label: 'Cek remote / wall controller berfungsi', requires_photo: 0 },
    ],
  },
  {
    department: 'maintenance', template_name: 'Kitchen Equipment Service',
    description: 'Service dapur: kompor, fryer, chiller',
    items: [
      { label: 'Kompor: api stabil semua tungku', requires_photo: 1 },
      { label: 'Deep fryer: suhu konsisten ±5°C', requires_photo: 1 },
      { label: 'Chiller suhu 0-4°C', requires_photo: 1 },
      { label: 'Freezer suhu -18°C atau lebih dingin', requires_photo: 1 },
      { label: 'Exhaust hood + filter bersih', requires_photo: 1 },
      { label: 'Drainase area bersih', requires_photo: 0 },
    ],
  },
  {
    department: 'maintenance', template_name: 'Plumbing / Water Service',
    description: 'Saluran air, kran, toilet',
    items: [
      { label: 'Semua kran wastafel berfungsi (tidak bocor)', requires_photo: 1 },
      { label: 'Toilet flush + tidak buntu', requires_photo: 1 },
      { label: 'Pipa pembuangan dapur lancar', requires_photo: 0 },
      { label: 'Water heater (kalau ada) fungsional', requires_photo: 0 },
    ],
  },
  {
    department: 'supplier', template_name: 'Stock Delivery & Receiving',
    description: 'Supplier kirim barang ke outlet',
    items: [
      { label: 'Surat jalan lengkap + valid', requires_photo: 1 },
      { label: 'Jumlah barang sesuai PO', requires_photo: 1 },
      { label: 'Kondisi barang baik (tidak rusak/expire dekat)', requires_photo: 1 },
      { label: 'Suhu cold chain (kalau frozen/chilled) sesuai', requires_photo: 1 },
      { label: 'Tanda tangan + cap penerimaan outlet', requires_photo: 1 },
    ],
  },
  {
    department: 'qa', template_name: 'Outlet Quality Audit (QA)',
    description: 'Audit mendadak QA dept untuk outlet',
    items: [
      { label: 'Mystery shopper observasi service kasir', requires_photo: 0 },
      { label: 'Cek hygiene dapur (food safety)', requires_photo: 1 },
      { label: 'Cek presentasi produk display', requires_photo: 1 },
      { label: 'Test kualitas signature menu (taste)', requires_photo: 1 },
      { label: 'Customer feedback (interview 3 customer)', requires_photo: 0 },
      { label: 'Staff grooming + name tag check', requires_photo: 1 },
    ],
  },
  {
    department: 'facility', template_name: 'General Facility Inspection',
    description: 'Inspeksi fasilitas umum outlet',
    items: [
      { label: 'APAR + smoke detector ter-inspeksi', requires_photo: 1 },
      { label: 'CCTV recording aktif + lensa bersih', requires_photo: 1 },
      { label: 'Lampu emergency exit menyala', requires_photo: 0 },
      { label: 'P3K kit lengkap', requires_photo: 1 },
      { label: 'Signage + branding sesuai standar', requires_photo: 1 },
      { label: 'Lantai + dinding tidak rusak', requires_photo: 0 },
    ],
  },
];

function setupServiceVisit(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  // Multi-tenant: add company_id + airplane mode bypass GPS
  try { db.exec("ALTER TABLE service_tickets ADD COLUMN company_id INTEGER"); } catch {}
  try { db.exec("ALTER TABLE service_tickets ADD COLUMN gps_bypass INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE service_tickets ADD COLUMN gps_bypass_reason TEXT"); } catch {}
  try { db.exec("ALTER TABLE service_tickets ADD COLUMN gps_bypass_approver TEXT"); } catch {}
  // Tag existing tickets based on outlet_code prefix (CMX = cinema 2, else F&B 1)
  try {
    db.prepare(`UPDATE service_tickets
      SET company_id = CASE
        WHEN outlet_code LIKE 'CMX%' THEN 2
        ELSE 1
      END
      WHERE company_id IS NULL`).run();
  } catch {}

  // Seed templates if empty
  const tplCount = db.prepare(`SELECT COUNT(*) c FROM service_templates`).get().c;
  if (tplCount === 0) {
    const ins = db.prepare(`INSERT INTO service_templates (department, template_name, description, items_json, active, created_by) VALUES (?,?,?,?,1,'system-seed')`);
    for (const t of DEFAULT_TEMPLATES) {
      ins.run(t.department, t.template_name, t.description, JSON.stringify(t.items.map((it, i) => ({ ...it, order: (i+1)*10 }))));
    }
    console.log(`[service-visit] seeded ${DEFAULT_TEMPLATES.length} default service templates`);
  }

  // Auto-seed 1 demo ticket kalau belum ada apa-apa
  function autoSeedDemo() {
    try {
      const ticketCount = db.prepare(`SELECT COUNT(*) c FROM service_tickets`).get().c;
      if (ticketCount > 0) return;
      // Cari outlet pertama
      let outletCode = 'DEMO_OUTLET', outletName = 'Demo Outlet';
      try {
        const o = db.prepare(`SELECT name FROM outlets LIMIT 1`).get();
        if (o) { outletCode = o.name.replace(/\s+/g, '_').toUpperCase(); outletName = o.name; }
      } catch {}
      const year = new Date().getFullYear();
      const ticketNo = `SV-${year}-0001`;
      const due = Math.floor(Date.now() / 1000) + 86400;
      const r = db.prepare(`INSERT INTO service_tickets (ticket_no, outlet_code, outlet_name, department, ticket_type, title, description, priority, assigned_to_name, created_by, due_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(ticketNo, outletCode, outletName, 'it', 'PC Repair',
             '[DEMO] PC kasir #2 sering hang',
             'Tiket demo otomatis — kasir laporan PC kasir #2 freeze saat input order.',
             'high', 'Manager', 'system-seed', due);
      const ticketId = r.lastInsertRowid;
      // Seed checklist dari template PC Repair
      const tpl = db.prepare(`SELECT items_json FROM service_templates WHERE template_name LIKE '%PC%' LIMIT 1`).get();
      if (tpl) {
        const items = JSON.parse(tpl.items_json);
        const insItem = db.prepare(`INSERT INTO service_ticket_items (ticket_id, item_label, requires_photo, display_order) VALUES (?,?,?,?)`);
        const tx = db.transaction(() => items.forEach((it, i) => insItem.run(ticketId, it.label, it.requires_photo ? 1 : 0, it.order || (i + 1) * 10)));
        tx();
      }
      console.log(`[service-visit] 🌱 auto-seeded demo ticket ${ticketNo}`);
    } catch (e) { console.error('[service-visit] auto-seed error', e.message); }
  }
  autoSeedDemo();

  const UPLOAD_DIR = opts.uploadDir || path.join(__dirname, 'uploads', 'service');
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  function saveB64Photo(b64, filename) {
    if (!b64 || b64.length < 100) return null;
    try {
      const mime = (b64.match(/^data:image\/(\w+);base64,/) || [null, 'jpg'])[1];
      const data = b64.replace(/^data:image\/\w+;base64,/, '');
      const finalName = `${filename}.${mime}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, finalName), Buffer.from(data, 'base64'));
      return finalName;
    } catch (e) { console.error('[service] saveB64Photo', e.message); return null; }
  }

  function genTicketNo() {
    const year = new Date().getFullYear();
    const c = db.prepare(`SELECT COUNT(*) c FROM service_tickets WHERE ticket_no LIKE ?`).get(`SV-${year}-%`).c;
    return `SV-${year}-${String(c + 1).padStart(4, '0')}`;
  }

  function isSuperAdminPin(p) {
    if (!p) return false;
    try {
      const sa = db.prepare(`SELECT id FROM admin_users WHERE pin=? AND role IN ('super-admin','admin') AND active=1`).get(String(p));
      return !!sa;
    } catch { return false; }
  }

  function geofenceCheck(outletCode, gpsLat, gpsLon, bypass) {
    try {
      const pin = db.prepare(`SELECT gps_lat, gps_lon, gps_radius_m, geofence_enforce FROM outlet_pins WHERE outlet_code=?`).get(outletCode);
      if (!pin?.gps_lat || !gpsLat) return { ok: true, distance: null };
      const distance = distMeters(pin.gps_lat, pin.gps_lon, gpsLat, gpsLon);
      const radius = pin.gps_radius_m || 200;
      if (distance > radius && !bypass && pin.geofence_enforce) {
        return { ok: false, distance, radius, error: `Lokasi Anda ${distance}m dari outlet (batas ${radius}m). Wajib dari area outlet.` };
      }
      return { ok: true, distance, radius };
    } catch (e) { return { ok: true, distance: null, err: e.message }; }
  }

  const router = express.Router();

  // ─── TEMPLATES ───
  router.get('/templates', (req, res) => {
    const dept = req.query.department;
    const where = dept ? `WHERE active=1 AND department=?` : `WHERE active=1`;
    const args = dept ? [dept] : [];
    const rows = db.prepare(`SELECT * FROM service_templates ${where} ORDER BY department, template_name`).all(...args);
    res.json({ data: rows.map(r => ({ ...r, items: (() => { try { return JSON.parse(r.items_json); } catch { return []; } })() })) });
  });

  router.post('/templates', (req, res) => {
    const b = req.body || {};
    if (!b.department || !b.template_name || !Array.isArray(b.items)) {
      return res.status(400).json({ error: 'department, template_name, items[] wajib' });
    }
    const itemsJson = JSON.stringify(b.items);
    if (b.id) {
      db.prepare(`UPDATE service_templates SET department=?, template_name=?, description=?, items_json=?, active=?, updated_at=? WHERE id=?`)
        .run(b.department, b.template_name, b.description || null, itemsJson, b.active === false ? 0 : 1, nowSec(), b.id);
      return res.json({ ok: true, id: b.id });
    }
    const r = db.prepare(`INSERT INTO service_templates (department, template_name, description, items_json, active, created_by) VALUES (?,?,?,?,1,?)`)
      .run(b.department, b.template_name, b.description || null, itemsJson, b.created_by || 'admin');
    res.json({ ok: true, id: r.lastInsertRowid });
  });

  router.delete('/templates/:id', (req, res) => {
    db.prepare(`UPDATE service_templates SET active=0 WHERE id=?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ─── TICKETS ───
  router.get('/tickets', (req, res) => {
    const q = req.query || {};
    const where = []; const args = [];
    if (q.status) { where.push('status=?'); args.push(q.status); }
    if (q.department) { where.push('department=?'); args.push(q.department); }
    if (q.outlet_code) { where.push('outlet_code=?'); args.push(q.outlet_code); }
    if (q.assigned_to_name) { where.push('LOWER(COALESCE(assigned_to_name,\'\')) LIKE LOWER(?)'); args.push('%' + q.assigned_to_name + '%'); }
    // Multi-tenant: filter by company_id
    const scope = req.companyScope || { is_super_admin: true };
    if (!scope.is_super_admin) { where.push('company_id = ?'); args.push(scope.company_id); }
    const sql = `SELECT * FROM service_tickets ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY priority DESC, created_at DESC LIMIT 500`;
    const rows = db.prepare(sql).all(...args);
    res.json({ data: rows, total: rows.length });
  });

  router.post('/tickets', (req, res) => {
    try {
      const b = req.body || {};
      if (!b.outlet_code || !b.department || !b.title) return res.status(400).json({ error: 'outlet_code, department, title wajib' });
      // Multi-tenant: auto-tag company_id (derive from outlet_code prefix CMX = cinema 2)
      const scope = req.companyScope || { is_super_admin: true };
      const isCinemaOutlet = String(b.outlet_code).toUpperCase().startsWith('CMX');
      const companyId = scope.is_super_admin
        ? (parseInt(b.company_id, 10) || (isCinemaOutlet ? 2 : 1))
        : scope.company_id;
      const ticketNo = genTicketNo();
      const r = db.prepare(`INSERT INTO service_tickets (ticket_no, outlet_code, outlet_name, department, ticket_type, title, description, priority, assigned_to_name, created_by, due_at, company_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(ticketNo, b.outlet_code, b.outlet_name || null, b.department, b.ticket_type || null,
             b.title, b.description || null, b.priority || 'normal',
             b.assigned_to_name || null, b.created_by || 'admin', b.due_at || null, companyId);
      const ticketId = r.lastInsertRowid;
      // Seed items from template or custom items
      let items = [];
      if (b.template_id) {
        const tpl = db.prepare(`SELECT items_json FROM service_templates WHERE id=?`).get(b.template_id);
        if (tpl) { try { items = JSON.parse(tpl.items_json); } catch {} }
      } else if (Array.isArray(b.items)) {
        items = b.items;
      }
      if (items.length > 0) {
        const ins = db.prepare(`INSERT INTO service_ticket_items (ticket_id, item_label, requires_photo, display_order) VALUES (?,?,?,?)`);
        const tx = db.transaction(() => {
          items.forEach((it, i) => ins.run(ticketId, it.label, it.requires_photo ? 1 : 0, it.order || (i + 1) * 10));
        });
        tx();
      }
      res.json({ ok: true, id: ticketId, ticket_no: ticketNo, items_seeded: items.length });
    } catch (e) { console.error('[service] create error', e); res.status(500).json({ error: e.message }); }
  });

  router.get('/tickets/:id', (req, res) => {
    const t = db.prepare(`SELECT * FROM service_tickets WHERE id=?`).get(req.params.id);
    if (!t) return res.status(404).json({ error: 'Ticket tidak ditemukan' });
    const items = db.prepare(`SELECT i.*, GROUP_CONCAT(p.filename) as photo_filenames FROM service_ticket_items i LEFT JOIN service_item_photos p ON p.ticket_item_id=i.id WHERE i.ticket_id=? GROUP BY i.id ORDER BY i.display_order`).all(req.params.id);
    res.json({
      ticket: t,
      items: items.map(it => ({ ...it, photos: it.photo_filenames ? it.photo_filenames.split(',') : [] })),
    });
  });

  router.patch('/tickets/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const vals = [];
    for (const k of ['title','description','priority','assigned_to_name','due_at','status']) {
      if (b[k] !== undefined) { fields.push(`${k}=?`); vals.push(b[k]); }
    }
    if (!fields.length) return res.status(400).json({ error: 'no fields' });
    vals.push(req.params.id);
    db.prepare(`UPDATE service_tickets SET ${fields.join(', ')} WHERE id=?`).run(...vals);
    res.json({ ok: true });
  });

  router.delete('/tickets/:id', (req, res) => {
    db.prepare(`UPDATE service_tickets SET status='cancelled' WHERE id=?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ─── START (staff checkin) ───
  router.post('/tickets/:id/start', (req, res) => {
    try {
      const b = req.body || {};
      const ticket = db.prepare(`SELECT * FROM service_tickets WHERE id=?`).get(req.params.id);
      if (!ticket) return res.status(404).json({ error: 'Ticket tidak ditemukan' });
      if (ticket.status === 'completed' || ticket.status === 'cancelled') {
        return res.status(400).json({ error: `Ticket sudah ${ticket.status}` });
      }
      if (!b.selfie_b64) return res.status(400).json({ error: 'Selfie kerja wajib (anti-nitip-ID)' });
      if (!b.gps_lat || !b.gps_lon) return res.status(400).json({ error: 'GPS wajib' });

      const isSA = isSuperAdminPin(b.bypass_pin);
      const geo = geofenceCheck(ticket.outlet_code, b.gps_lat, b.gps_lon, isSA);
      if (!geo.ok) return res.status(403).json({ error: geo.error, distance_m: geo.distance, radius_m: geo.radius });

      const selfieFn = saveB64Photo(b.selfie_b64, `start_${ticket.ticket_no}_${Date.now()}`);
      const now = nowSec();
      db.prepare(`UPDATE service_tickets SET status='in_progress', started_at=?, start_gps_lat=?, start_gps_lon=?, start_gps_distance_m=?, start_selfie=?, start_device_id=? WHERE id=?`)
        .run(now, b.gps_lat, b.gps_lon, geo.distance, selfieFn, b.device_id || null, req.params.id);
      res.json({ ok: true, distance_m: geo.distance });
    } catch (e) { console.error('[service] start error', e); res.status(500).json({ error: e.message }); }
  });

  // ─── ITEM UPDATE ───
  router.patch('/tickets/:tid/items/:iid', (req, res) => {
    const b = req.body || {};
    const fields = []; const vals = [];
    if (b.status !== undefined) { fields.push('status=?'); vals.push(b.status); }
    if (b.note !== undefined) { fields.push('note=?'); vals.push(b.note); }
    fields.push('updated_at=?'); vals.push(nowSec());
    vals.push(req.params.iid, req.params.tid);
    db.prepare(`UPDATE service_ticket_items SET ${fields.join(', ')} WHERE id=? AND ticket_id=?`).run(...vals);
    res.json({ ok: true });
  });

  router.post('/tickets/:tid/items/:iid/photo', (req, res) => {
    try {
      const b = req.body || {};
      if (!b.photo_b64) return res.status(400).json({ error: 'photo_b64 required' });
      const ticket = db.prepare(`SELECT outlet_code FROM service_tickets WHERE id=?`).get(req.params.tid);
      if (!ticket) return res.status(404).json({ error: 'Ticket tidak ditemukan' });

      const isSA = isSuperAdminPin(b.bypass_pin);
      const geo = geofenceCheck(ticket.outlet_code, b.gps_lat, b.gps_lon, isSA);
      if (!geo.ok) return res.status(403).json({ error: geo.error, distance_m: geo.distance, radius_m: geo.radius });

      const fn = saveB64Photo(b.photo_b64, `item_${req.params.tid}_${req.params.iid}_${Date.now()}`);
      if (!fn) return res.status(500).json({ error: 'Photo save failed' });
      db.prepare(`INSERT INTO service_item_photos (ticket_item_id, filename, gps_lat, gps_lon, gps_distance_m) VALUES (?,?,?,?,?)`)
        .run(req.params.iid, fn, b.gps_lat || null, b.gps_lon || null, geo.distance);
      res.json({ ok: true, filename: fn });
    } catch (e) { console.error('[service] photo error', e); res.status(500).json({ error: e.message }); }
  });

  // ─── FINISH ───
  router.post('/tickets/:id/finish', (req, res) => {
    try {
      const b = req.body || {};
      const ticket = db.prepare(`SELECT * FROM service_tickets WHERE id=?`).get(req.params.id);
      if (!ticket) return res.status(404).json({ error: 'Ticket tidak ditemukan' });
      if (ticket.status !== 'in_progress') return res.status(400).json({ error: `Ticket status: ${ticket.status} — tidak bisa finish` });
      if (!b.selfie_b64) return res.status(400).json({ error: 'Selfie penutup wajib' });

      // Check semua required items done
      const items = db.prepare(`SELECT * FROM service_ticket_items WHERE ticket_id=?`).all(req.params.id);
      const pending = items.filter(i => i.status === 'pending');
      if (pending.length > 0) return res.status(400).json({ error: `${pending.length} item belum done/skipped` });

      const selfieFn = saveB64Photo(b.selfie_b64, `finish_${ticket.ticket_no}_${Date.now()}`);
      const now = nowSec();
      const onTime = ticket.due_at ? (now <= ticket.due_at ? 1 : 0) : null;
      db.prepare(`UPDATE service_tickets SET status='completed', finished_at=?, finish_summary=?, finish_selfie=?, finish_gps_lat=?, finish_gps_lon=?, on_time=? WHERE id=?`)
        .run(now, b.summary || null, selfieFn, b.gps_lat || null, b.gps_lon || null, onTime, req.params.id);
      res.json({ ok: true, on_time: onTime, duration_min: ticket.started_at ? Math.round((now - ticket.started_at) / 60) : null });
    } catch (e) { console.error('[service] finish error', e); res.status(500).json({ error: e.message }); }
  });

  // ─── PHOTO SERVE ───
  router.get('/photo/:filename', (req, res) => {
    const fn = req.params.filename;
    if (!/^[\w.-]+$/.test(fn)) return res.status(400).end();
    const fp = path.join(UPLOAD_DIR, fn);
    if (!fs.existsSync(fp)) return res.status(404).end();
    res.sendFile(fp);
  });

  // ─── KPI ───
  router.get('/kpi', (req, res) => {
    const days = parseInt(req.query.days || '30', 10);
    const since = nowSec() - days * 86400;
    const depts = db.prepare(`SELECT DISTINCT department FROM service_tickets WHERE created_at >= ?`).all(since).map(r => r.department);
    const result = depts.map(d => {
      const total = db.prepare(`SELECT COUNT(*) c FROM service_tickets WHERE department=? AND created_at >= ?`).get(d, since).c;
      const completed = db.prepare(`SELECT COUNT(*) c FROM service_tickets WHERE department=? AND status='completed' AND created_at >= ?`).get(d, since).c;
      const inProgress = db.prepare(`SELECT COUNT(*) c FROM service_tickets WHERE department=? AND status='in_progress' AND created_at >= ?`).get(d, since).c;
      const open = db.prepare(`SELECT COUNT(*) c FROM service_tickets WHERE department=? AND status='open' AND created_at >= ?`).get(d, since).c;
      const onTime = db.prepare(`SELECT COUNT(*) c FROM service_tickets WHERE department=? AND on_time=1 AND created_at >= ?`).get(d, since).c;
      const late = db.prepare(`SELECT COUNT(*) c FROM service_tickets WHERE department=? AND on_time=0 AND created_at >= ?`).get(d, since).c;
      // Avg response time (created → started) in minutes
      const respRow = db.prepare(`SELECT AVG(started_at - created_at) avg_sec FROM service_tickets WHERE department=? AND started_at IS NOT NULL AND created_at >= ?`).get(d, since);
      // Avg duration (started → finished)
      const durRow = db.prepare(`SELECT AVG(finished_at - started_at) avg_sec FROM service_tickets WHERE department=? AND finished_at IS NOT NULL AND started_at IS NOT NULL AND created_at >= ?`).get(d, since);
      return {
        department: d, total, completed, in_progress: inProgress, open, on_time: onTime, late,
        completion_pct: total > 0 ? Math.round(completed / total * 100) : 0,
        on_time_pct: (onTime + late) > 0 ? Math.round(onTime / (onTime + late) * 100) : null,
        avg_response_min: respRow.avg_sec ? Math.round(respRow.avg_sec / 60) : null,
        avg_duration_min: durRow.avg_sec ? Math.round(durRow.avg_sec / 60) : null,
      };
    });
    res.json({ data: result, period_days: days });
  });

  app.use(opts.mountPath || '/api/service', router);
  console.log(`[service-visit] mounted at ${opts.mountPath || '/api/service'} — Karya Field Service ${DEFAULT_TEMPLATES.length} templates`);
  return { router, db };
}

module.exports = { setupServiceVisit };
