// server/remote-ops-backend.js
// karyaOS — Remote Outlet Command (KROC)
// Cross-vertical (F&B + Cinema) — outlet manager self-audit with photos,
// composite health score, anomaly detector + WA alert, CCTV embed config,
// scheduled visits with GPS check-in proof.
//
// Goal: kurangi cost OP Head visit dengan remote eyes-on per outlet.
//
// Endpoints mounted at /api/remote-ops:
//   GET    /outlets                  — list outlets + latest health score
//   GET    /audit/templates          — checklist templates per vertical
//   GET    /audit/today?outlet=XX    — today's submitted audit
//   POST   /audit/submit             — manager submit checklist + photos
//   GET    /audit/photos/:filename   — serve photo
//   GET    /health-scores            — all outlets composite scores
//   POST   /health-scores/recompute  — manual trigger
//   GET    /anomalies                — list active anomalies
//   POST   /anomalies/:id/resolve    — mark resolved
//   GET    /cameras?outlet=XX        — list cameras per outlet
//   POST   /cameras                  — add/update camera
//   DELETE /cameras/:id              — remove camera
//   POST   /visits/schedule          — schedule visit
//   POST   /visits/checkin           — GPS check-in with photo
//   GET    /visits                   — list visits
//
// Cron jobs (auto-started):
//   - Health score recompute      every 30 min
//   - Anomaly detector            every 15 min

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const nowSec = () => Math.floor(Date.now() / 1000);
const DAY = 86400;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS outlet_audit_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vertical TEXT NOT NULL,                -- 'fnb' | 'cinema' | 'shared'
  code TEXT NOT NULL UNIQUE,             -- 'lobby_clean', 'kitchen_hygiene'
  label TEXT NOT NULL,
  category TEXT,                         -- 'Cleanliness' | 'Operations' | 'Safety'
  requires_photo INTEGER DEFAULT 1,
  display_order INTEGER DEFAULT 100
);

CREATE TABLE IF NOT EXISTS outlet_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outlet_code TEXT NOT NULL,
  outlet_name TEXT,
  vertical TEXT NOT NULL,                -- 'fnb' | 'cinema'
  manager_name TEXT,
  manager_pin_hash TEXT,
  audit_date TEXT NOT NULL,              -- YYYY-MM-DD
  submitted_at INTEGER NOT NULL,
  gps_lat REAL, gps_lon REAL,
  device_info TEXT,
  overall_score INTEGER,                 -- 0-100 average of item ratings × 20
  total_items INTEGER, pass_items INTEGER,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_audits_outlet_date ON outlet_audits(outlet_code, audit_date);

CREATE TABLE IF NOT EXISTS outlet_audit_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_id INTEGER NOT NULL,
  item_code TEXT NOT NULL,
  item_label TEXT NOT NULL,
  rating INTEGER NOT NULL,               -- 1..5
  photo_filename TEXT,                   -- relative path in uploads
  note TEXT,
  FOREIGN KEY(audit_id) REFERENCES outlet_audits(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_audit_items_audit ON outlet_audit_items(audit_id);

CREATE TABLE IF NOT EXISTS outlet_health_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outlet_code TEXT NOT NULL,
  outlet_name TEXT,
  vertical TEXT,
  computed_at INTEGER NOT NULL,
  score INTEGER NOT NULL,                -- 0-100
  grade TEXT,                            -- A/B/C/D
  breakdown TEXT,                        -- JSON: {sales_pct, rating_pct, incident_pct, audit_pct, void_pct}
  metrics TEXT                           -- JSON raw inputs
);
CREATE INDEX IF NOT EXISTS idx_health_outlet ON outlet_health_scores(outlet_code, computed_at);

CREATE TABLE IF NOT EXISTS outlet_anomalies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outlet_code TEXT NOT NULL,
  outlet_name TEXT,
  vertical TEXT,
  anomaly_type TEXT NOT NULL,            -- 'sales_drop' | 'low_rating' | 'void_spike' | 'incident_open' | 'no_audit'
  severity TEXT NOT NULL,                -- 'warning' | 'critical'
  message TEXT NOT NULL,
  metric_value REAL,
  threshold_value REAL,
  detected_at INTEGER NOT NULL,
  dedupe_key TEXT NOT NULL,              -- 'outlet|type|date' to prevent duplicates per day
  status TEXT DEFAULT 'open',            -- 'open' | 'acknowledged' | 'resolved'
  resolved_at INTEGER, resolved_by TEXT,
  notified_at INTEGER                    -- when WA push fired
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_anomalies_dedupe ON outlet_anomalies(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_anomalies_outlet ON outlet_anomalies(outlet_code, status);

CREATE TABLE IF NOT EXISTS outlet_cameras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outlet_code TEXT NOT NULL,
  camera_name TEXT NOT NULL,             -- 'Lobby', 'Kitchen', 'Cashier', 'Studio 1'
  camera_type TEXT NOT NULL,             -- 'mjpeg' | 'hls' | 'iframe'
  url TEXT NOT NULL,
  username TEXT, password TEXT,          -- optional auth
  display_order INTEGER DEFAULT 100,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_cameras_outlet ON outlet_cameras(outlet_code, is_active);

CREATE TABLE IF NOT EXISTS outlet_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_name TEXT NOT NULL,
  visitor_role TEXT,                     -- 'op_head' | 'qa' | 'finance' | 'owner'
  outlet_code TEXT NOT NULL,
  outlet_name TEXT,
  scheduled_at INTEGER,
  checked_in_at INTEGER,
  checked_out_at INTEGER,
  gps_lat REAL, gps_lon REAL,
  gps_distance_m INTEGER,                -- distance from outlet pin (haversine)
  arrival_photo TEXT,
  notes TEXT,
  status TEXT DEFAULT 'scheduled',       -- 'scheduled' | 'checked_in' | 'completed' | 'no_show'
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_visits_outlet ON outlet_visits(outlet_code, status);

CREATE TABLE IF NOT EXISTS outlet_pins (
  outlet_code TEXT PRIMARY KEY,
  outlet_name TEXT NOT NULL,
  vertical TEXT NOT NULL DEFAULT 'fnb',
  manager_pin_hash TEXT,                 -- sha256 of PIN; PIN = '1234' default
  manager_name TEXT,
  gps_lat REAL, gps_lon REAL,            -- outlet GPS pin for visit verification
  whatsapp_number TEXT,                  -- target for anomaly alerts
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;

// Default checklist templates per vertical
const DEFAULT_TEMPLATES = [
  // SHARED (both verticals)
  ['shared', 'lobby_clean',       '🧹 Kebersihan Lobby/Entrance',     'Cleanliness', 1, 10],
  ['shared', 'restroom_clean',    '🚻 Kebersihan Restroom',            'Cleanliness', 1, 20],
  ['shared', 'staff_grooming',    '👔 Grooming & Seragam Staff',       'Operations',  1, 30],
  ['shared', 'pos_hardware',      '💻 POS Hardware OK',                'Operations',  0, 40],
  ['shared', 'cash_float',        '💵 Cash Float Aman',                'Operations',  0, 50],
  ['shared', 'cctv_recording',    '📹 CCTV Recording Aktif',           'Safety',      0, 60],
  ['shared', 'fire_extinguisher', '🧯 APAR Tersedia & Valid',          'Safety',      0, 70],
  ['shared', 'first_aid',         '🩹 P3K Lengkap',                    'Safety',      0, 80],
  // F&B specific
  ['fnb', 'kitchen_hygiene',     '🍳 Higenitas Dapur',                'Cleanliness', 1, 100],
  ['fnb', 'chiller_temp',        '❄️ Suhu Chiller Sesuai',            'Operations',  1, 110],
  ['fnb', 'food_display',        '🍰 Display Makanan Fresh',          'Operations',  1, 120],
  ['fnb', 'queue_management',    '🧍 Antrian Terkelola',              'Operations',  0, 130],
  ['fnb', 'expired_check',       '📅 Cek Tanggal Kedaluwarsa',        'Safety',      1, 140],
  // CINEMA specific
  ['cinema', 'studio_clean',     '🎬 Studio Bersih (kursi, lantai)',  'Cleanliness', 1, 200],
  ['cinema', 'studio_ac',        '❄️ AC Studio Sejuk',                'Operations',  0, 210],
  ['cinema', 'projector_check',  '📽️ Projector & Sound Test',         'Operations',  1, 220],
  ['cinema', 'concession_stock', '🍿 Stok Concession Tersedia',       'Operations',  1, 230],
  ['cinema', 'seat_condition',   '💺 Kondisi Kursi (no rusak)',        'Safety',      1, 240],
  ['cinema', 'emergency_exit',   '🚪 Pintu Darurat Tidak Terhalang',  'Safety',      1, 250],
];

function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

// Haversine in meters
function distMeters(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function setupRemoteOps(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  // Seed templates if empty
  const tplCount = db.prepare(`SELECT COUNT(*) c FROM outlet_audit_templates`).get().c;
  if (tplCount === 0) {
    const ins = db.prepare(`INSERT OR IGNORE INTO outlet_audit_templates (vertical, code, label, category, requires_photo, display_order) VALUES (?,?,?,?,?,?)`);
    for (const t of DEFAULT_TEMPLATES) ins.run(...t);
    console.log(`[remote-ops] seeded ${DEFAULT_TEMPLATES.length} default audit templates`);
  }

  // Uploads dir
  const UPLOAD_DIR = opts.uploadDir || path.join(__dirname, 'uploads', 'remote-ops');
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  // Helpers
  const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };

  // Lookup outlets registry — try multiple sources (outlets table, pos_config)
  function listAllOutlets() {
    const list = [];
    try {
      const rows = db.prepare(`SELECT name, area, manager FROM outlets`).all();
      for (const r of rows) list.push({ code: r.name.replace(/\s+/g, '_').toUpperCase(), name: r.name, area: r.area, manager: r.manager, vertical: 'fnb' });
    } catch {}
    try {
      const rows = db.prepare(`SELECT outlet_code, outlet_name, vertical, manager_name FROM outlet_pins`).all();
      for (const r of rows) {
        if (!list.find(x => x.code === r.outlet_code)) {
          list.push({ code: r.outlet_code, name: r.outlet_name, manager: r.manager_name, vertical: r.vertical });
        }
      }
    } catch {}
    return list;
  }

  // ────────────────────────────────────────────────────────────────
  // HEALTH SCORE ENGINE
  // ────────────────────────────────────────────────────────────────
  function computeHealthScore(outletCode, outletName, vertical) {
    const now = nowSec();
    const today = new Date().toISOString().slice(0, 10);
    const sevenAgo = now - 7 * DAY;

    // 1. SALES — today vs 7d average (FnB: orders, Cinema: cinema_tickets)
    let salesToday = 0, sales7dAvg = 0;
    try {
      if (vertical === 'cinema') {
        const t = db.prepare(`SELECT COALESCE(SUM(price),0) v FROM cinema_tickets WHERE outlet=? AND date(created_at,'unixepoch')=date('now')`).get(outletCode);
        salesToday = t?.v || 0;
        const a = db.prepare(`SELECT COALESCE(SUM(price),0)/7.0 v FROM cinema_tickets WHERE outlet=? AND created_at>=? AND created_at<?`).get(outletCode, sevenAgo, now - DAY);
        sales7dAvg = a?.v || 0;
      } else {
        const t = db.prepare(`SELECT COALESCE(SUM(total),0) v FROM orders WHERE outlet=? AND date(created_at,'unixepoch')=date('now')`).get(outletCode);
        salesToday = t?.v || 0;
        const a = db.prepare(`SELECT COALESCE(SUM(total),0)/7.0 v FROM orders WHERE outlet=? AND created_at>=? AND created_at<?`).get(outletCode, sevenAgo, now - DAY);
        sales7dAvg = a?.v || 0;
      }
    } catch {}
    const salesRatio = sales7dAvg > 0 ? salesToday / sales7dAvg : 1;
    const salesPct = Math.max(0, Math.min(100, salesRatio * 100));

    // 2. RATING — avg cashier rating last 7 days
    let avgRating = 5, ratingCount = 0;
    try {
      const r = db.prepare(`SELECT AVG(rating) avg, COUNT(*) cnt FROM cinema_cashier_ratings WHERE outlet=? AND created_at>=?`).get(outletCode, sevenAgo);
      if (r?.cnt > 0) { avgRating = r.avg; ratingCount = r.cnt; }
    } catch {}
    const ratingPct = ratingCount === 0 ? 80 : Math.max(0, Math.min(100, (avgRating / 5) * 100));

    // 3. INCIDENTS — open count
    let openIncidents = 0;
    try {
      const i = db.prepare(`SELECT COUNT(*) c FROM cinema_incidents WHERE outlet=? AND status='open'`).get(outletCode);
      openIncidents += i?.c || 0;
    } catch {}
    try {
      const i = db.prepare(`SELECT COUNT(*) c FROM outlet_issues WHERE resolved=0`).get();
      openIncidents += Math.min(5, i?.c || 0);
    } catch {}
    const incidentPct = Math.max(0, 100 - openIncidents * 20);

    // 4. AUDIT COMPLETION — submitted today?
    let auditScore = 0, auditSubmitted = false;
    try {
      const a = db.prepare(`SELECT overall_score FROM outlet_audits WHERE outlet_code=? AND audit_date=?`).get(outletCode, today);
      if (a) { auditSubmitted = true; auditScore = a.overall_score; }
    } catch {}
    const auditPct = auditSubmitted ? auditScore : (new Date().getHours() < 10 ? 70 : 30);

    // 5. VOID RATE — voids today vs orders today
    let voidPct = 100;
    try {
      const v = db.prepare(`SELECT COUNT(*) c FROM cinema_ticket_voids WHERE outlet=? AND date(created_at,'unixepoch')=date('now')`).get(outletCode);
      const t = db.prepare(`SELECT COUNT(*) c FROM cinema_tickets WHERE outlet=? AND date(created_at,'unixepoch')=date('now')`).get(outletCode);
      const rate = (t?.c || 0) > 0 ? (v?.c || 0) / t.c : 0;
      voidPct = Math.max(0, 100 - rate * 1000); // 10% void = 0 pct
    } catch {}

    // Composite
    const score = Math.round(salesPct * 0.30 + ratingPct * 0.25 + incidentPct * 0.20 + auditPct * 0.15 + voidPct * 0.10);
    const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D';

    const breakdown = { sales_pct: Math.round(salesPct), rating_pct: Math.round(ratingPct), incident_pct: Math.round(incidentPct), audit_pct: Math.round(auditPct), void_pct: Math.round(voidPct) };
    const metrics = { sales_today: salesToday, sales_7d_avg: Math.round(sales7dAvg), avg_rating: avgRating, rating_count: ratingCount, open_incidents: openIncidents, audit_submitted: auditSubmitted };

    db.prepare(`INSERT INTO outlet_health_scores (outlet_code, outlet_name, vertical, computed_at, score, grade, breakdown, metrics) VALUES (?,?,?,?,?,?,?,?)`)
      .run(outletCode, outletName, vertical, now, score, grade, JSON.stringify(breakdown), JSON.stringify(metrics));

    return { outlet_code: outletCode, outlet_name: outletName, vertical, score, grade, breakdown, metrics, computed_at: now };
  }

  function recomputeAllHealthScores() {
    const outlets = listAllOutlets();
    const results = [];
    for (const o of outlets) {
      try { results.push(computeHealthScore(o.code, o.name, o.vertical || 'fnb')); }
      catch (e) { console.error('[remote-ops] health score error', o.code, e.message); }
    }
    // Cleanup: keep last 96 entries (~48h @ 30min) per outlet
    try { db.exec(`DELETE FROM outlet_health_scores WHERE id NOT IN (SELECT id FROM outlet_health_scores ORDER BY computed_at DESC LIMIT ${outlets.length * 96})`); } catch {}
    return results;
  }

  // ────────────────────────────────────────────────────────────────
  // ANOMALY DETECTOR
  // ────────────────────────────────────────────────────────────────
  function pushWaAlert(outletCode, message, severity) {
    // Try to find outlet WA number, else fallback to global notifications hook
    try {
      const pin = db.prepare(`SELECT whatsapp_number FROM outlet_pins WHERE outlet_code=?`).get(outletCode);
      const wa = pin?.whatsapp_number;
      if (!wa) return false;
      // Use existing notifications.fanout if available, else log
      const payload = { channel: 'whatsapp', to: wa, text: `🚨 *${severity.toUpperCase()}* — ${outletCode}\n${message}\n\n_karyaOS Remote Ops_` };
      // Insert pending notification — actual sender uses webhook
      try { db.prepare(`INSERT INTO notification_queue (channel, recipient, body, status, created_at) VALUES (?,?,?,?,?)`)
        .run('whatsapp', wa, payload.text, 'pending', nowSec()); } catch {}
      console.log(`[remote-ops] WA alert queued → ${wa}: ${message}`);
      return true;
    } catch { return false; }
  }

  function detectAnomalies() {
    const outlets = listAllOutlets();
    const today = new Date().toISOString().slice(0, 10);
    const now = nowSec();
    const insAnomaly = db.prepare(`INSERT OR IGNORE INTO outlet_anomalies
      (outlet_code, outlet_name, vertical, anomaly_type, severity, message, metric_value, threshold_value, detected_at, dedupe_key, notified_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    const detected = [];

    for (const o of outlets) {
      // 1. Sales drop > 30% vs 7d avg
      try {
        const t = o.vertical === 'cinema'
          ? db.prepare(`SELECT COALESCE(SUM(price),0) v FROM cinema_tickets WHERE outlet=? AND date(created_at,'unixepoch')=date('now')`).get(o.code)
          : db.prepare(`SELECT COALESCE(SUM(total),0) v FROM orders WHERE outlet=? AND date(created_at,'unixepoch')=date('now')`).get(o.code);
        const a = o.vertical === 'cinema'
          ? db.prepare(`SELECT COALESCE(SUM(price),0)/7.0 v FROM cinema_tickets WHERE outlet=? AND created_at>=? AND created_at<?`).get(o.code, now - 7*DAY, now - DAY)
          : db.prepare(`SELECT COALESCE(SUM(total),0)/7.0 v FROM orders WHERE outlet=? AND created_at>=? AND created_at<?`).get(o.code, now - 7*DAY, now - DAY);
        const salesToday = t?.v || 0, sales7dAvg = a?.v || 0;
        if (sales7dAvg > 100000 && salesToday < sales7dAvg * 0.7 && new Date().getHours() >= 14) {
          const dropPct = Math.round((1 - salesToday/sales7dAvg) * 100);
          const dedupe = `${o.code}|sales_drop|${today}`;
          const msg = `Sales drop ${dropPct}% vs avg minggu ini (Rp ${Math.round(salesToday/1000)}K vs Rp ${Math.round(sales7dAvg/1000)}K)`;
          const result = insAnomaly.run(o.code, o.name, o.vertical, 'sales_drop', dropPct >= 50 ? 'critical' : 'warning', msg, salesToday, sales7dAvg, now, dedupe, null);
          if (result.changes > 0) { pushWaAlert(o.code, msg, dropPct >= 50 ? 'critical' : 'warning'); detected.push({ outlet: o.code, type: 'sales_drop', msg }); }
        }
      } catch {}

      // 2. Low rating last 5 ratings avg <3.5
      try {
        const r = db.prepare(`SELECT AVG(rating) avg, COUNT(*) cnt FROM (SELECT rating FROM cinema_cashier_ratings WHERE outlet=? ORDER BY created_at DESC LIMIT 5)`).get(o.code);
        if (r?.cnt >= 5 && r.avg < 3.5) {
          const dedupe = `${o.code}|low_rating|${today}`;
          const msg = `Avg rating kasir 5 review terakhir: ${r.avg.toFixed(2)}★ (di bawah threshold 3.5)`;
          const result = insAnomaly.run(o.code, o.name, o.vertical, 'low_rating', r.avg < 3.0 ? 'critical' : 'warning', msg, r.avg, 3.5, now, dedupe, null);
          if (result.changes > 0) { pushWaAlert(o.code, msg, 'warning'); detected.push({ outlet: o.code, type: 'low_rating', msg }); }
        }
      } catch {}

      // 3. Incident open >1h
      try {
        const i = db.prepare(`SELECT id, type, message, created_at FROM cinema_incidents WHERE outlet=? AND status='open' AND created_at<? ORDER BY created_at LIMIT 1`).get(o.code, now - 3600);
        if (i) {
          const dedupe = `${o.code}|incident_open|${today}|${i.id}`;
          const msg = `Insiden "${i.type}" open >1 jam — ${i.message || 'no detail'}`;
          const result = insAnomaly.run(o.code, o.name, o.vertical, 'incident_open', 'critical', msg, (now - i.created_at)/60, 60, now, dedupe, null);
          if (result.changes > 0) { pushWaAlert(o.code, msg, 'critical'); detected.push({ outlet: o.code, type: 'incident_open', msg }); }
        }
      } catch {}

      // 4. No audit submitted by 10AM
      try {
        if (new Date().getHours() >= 10) {
          const a = db.prepare(`SELECT id FROM outlet_audits WHERE outlet_code=? AND audit_date=?`).get(o.code, today);
          if (!a) {
            const dedupe = `${o.code}|no_audit|${today}`;
            const msg = `Daily audit belum disubmit (deadline 10:00). Manager: ${o.manager || '—'}`;
            const result = insAnomaly.run(o.code, o.name, o.vertical, 'no_audit', 'warning', msg, 0, 1, now, dedupe, null);
            if (result.changes > 0) { pushWaAlert(o.code, msg, 'warning'); detected.push({ outlet: o.code, type: 'no_audit', msg }); }
          }
        }
      } catch {}

      // 5. Void rate >10%
      try {
        const v = db.prepare(`SELECT COUNT(*) c FROM cinema_ticket_voids WHERE outlet=? AND date(created_at,'unixepoch')=date('now')`).get(o.code);
        const t = db.prepare(`SELECT COUNT(*) c FROM cinema_tickets WHERE outlet=? AND date(created_at,'unixepoch')=date('now')`).get(o.code);
        if ((t?.c || 0) >= 10 && (v?.c || 0) / t.c > 0.1) {
          const rate = (v.c / t.c * 100).toFixed(1);
          const dedupe = `${o.code}|void_spike|${today}`;
          const msg = `Void rate ${rate}% (${v.c}/${t.c}) — di atas threshold 10%`;
          const result = insAnomaly.run(o.code, o.name, o.vertical, 'void_spike', 'warning', msg, v.c/t.c, 0.1, now, dedupe, null);
          if (result.changes > 0) { pushWaAlert(o.code, msg, 'warning'); detected.push({ outlet: o.code, type: 'void_spike', msg }); }
        }
      } catch {}
    }
    return detected;
  }

  // ────────────────────────────────────────────────────────────────
  // ROUTER
  // ────────────────────────────────────────────────────────────────
  const router = express.Router();

  // List outlets with latest health score
  router.get('/outlets', (req, res) => {
    const outlets = listAllOutlets();
    const result = outlets.map(o => {
      const latest = db.prepare(`SELECT * FROM outlet_health_scores WHERE outlet_code=? ORDER BY computed_at DESC LIMIT 1`).get(o.code);
      const today = new Date().toISOString().slice(0, 10);
      const auditToday = db.prepare(`SELECT id, overall_score, submitted_at FROM outlet_audits WHERE outlet_code=? AND audit_date=?`).get(o.code, today);
      const openAnomalies = db.prepare(`SELECT COUNT(*) c FROM outlet_anomalies WHERE outlet_code=? AND status='open'`).get(o.code).c;
      return {
        ...o,
        health: latest ? { score: latest.score, grade: latest.grade, breakdown: safeJson(latest.breakdown), metrics: safeJson(latest.metrics), computed_at: latest.computed_at } : null,
        audit_today: auditToday || null,
        open_anomalies: openAnomalies,
      };
    });
    res.json({ data: result, total: result.length });
  });

  // Audit templates per vertical
  router.get('/audit/templates', (req, res) => {
    const vertical = req.query.vertical || 'fnb';
    const rows = db.prepare(`SELECT * FROM outlet_audit_templates WHERE vertical IN ('shared', ?) ORDER BY display_order`).all(vertical);
    res.json({ data: rows });
  });

  // Today's audit for outlet
  router.get('/audit/today', (req, res) => {
    const outlet = req.query.outlet;
    if (!outlet) return res.status(400).json({ error: 'outlet required' });
    const today = new Date().toISOString().slice(0, 10);
    const audit = db.prepare(`SELECT * FROM outlet_audits WHERE outlet_code=? AND audit_date=?`).get(outlet, today);
    if (!audit) return res.json({ submitted: false });
    const items = db.prepare(`SELECT * FROM outlet_audit_items WHERE audit_id=?`).all(audit.id);
    res.json({ submitted: true, audit, items });
  });

  // Submit audit — JSON with embedded base64 photos
  // Body: { outlet_code, outlet_name, vertical, manager_name, manager_pin, gps_lat, gps_lon, notes, items: [{code,label,rating,photo_b64,note}] }
  router.post('/audit/submit', (req, res) => {
    try {
      const b = req.body || {};
      if (!b.outlet_code || !Array.isArray(b.items) || b.items.length === 0) {
        return res.status(400).json({ error: 'outlet_code + items required' });
      }
      // Verify PIN if outlet has one
      const pin = db.prepare(`SELECT manager_pin_hash FROM outlet_pins WHERE outlet_code=?`).get(b.outlet_code);
      if (pin?.manager_pin_hash) {
        if (!b.manager_pin || sha256(String(b.manager_pin)) !== pin.manager_pin_hash) {
          return res.status(403).json({ error: 'Invalid PIN' });
        }
      }

      const today = new Date().toISOString().slice(0, 10);
      const now = nowSec();
      const totalItems = b.items.length;
      const passItems = b.items.filter(x => (x.rating || 0) >= 4).length;
      const overall = Math.round(b.items.reduce((s, x) => s + (x.rating || 0), 0) / totalItems * 20);

      // Upsert audit (one per outlet per day)
      const existing = db.prepare(`SELECT id FROM outlet_audits WHERE outlet_code=? AND audit_date=?`).get(b.outlet_code, today);
      let auditId;
      if (existing) {
        db.prepare(`UPDATE outlet_audits SET submitted_at=?, gps_lat=?, gps_lon=?, overall_score=?, total_items=?, pass_items=?, notes=?, manager_name=? WHERE id=?`)
          .run(now, b.gps_lat || null, b.gps_lon || null, overall, totalItems, passItems, b.notes || null, b.manager_name || null, existing.id);
        db.prepare(`DELETE FROM outlet_audit_items WHERE audit_id=?`).run(existing.id);
        auditId = existing.id;
      } else {
        const r = db.prepare(`INSERT INTO outlet_audits (outlet_code, outlet_name, vertical, manager_name, audit_date, submitted_at, gps_lat, gps_lon, device_info, overall_score, total_items, pass_items, notes)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
            b.outlet_code, b.outlet_name || null, b.vertical || 'fnb', b.manager_name || null,
            today, now, b.gps_lat || null, b.gps_lon || null, b.device_info || null,
            overall, totalItems, passItems, b.notes || null
          );
        auditId = r.lastInsertRowid;
      }

      // Save items + photos
      const insItem = db.prepare(`INSERT INTO outlet_audit_items (audit_id, item_code, item_label, rating, photo_filename, note) VALUES (?,?,?,?,?,?)`);
      for (const it of b.items) {
        let filename = null;
        if (it.photo_b64 && typeof it.photo_b64 === 'string' && it.photo_b64.length > 100) {
          const mime = (it.photo_b64.match(/^data:image\/(\w+);base64,/) || [null, 'jpg'])[1];
          const data = it.photo_b64.replace(/^data:image\/\w+;base64,/, '');
          filename = `${b.outlet_code}_${today}_${auditId}_${it.code}.${mime}`;
          try { fs.writeFileSync(path.join(UPLOAD_DIR, filename), Buffer.from(data, 'base64')); }
          catch (e) { console.error('[remote-ops] photo save fail', e.message); filename = null; }
        }
        insItem.run(auditId, it.code, it.label || it.code, it.rating || 0, filename, it.note || null);
      }

      // Auto-resolve "no_audit" anomaly for today
      try { db.prepare(`UPDATE outlet_anomalies SET status='resolved', resolved_at=?, resolved_by='auto-on-submit' WHERE outlet_code=? AND anomaly_type='no_audit' AND status='open' AND date(detected_at,'unixepoch')=date('now')`).run(now, b.outlet_code); } catch {}

      // Recompute health score immediately
      try { computeHealthScore(b.outlet_code, b.outlet_name, b.vertical || 'fnb'); } catch {}

      res.json({ ok: true, audit_id: auditId, overall_score: overall });
    } catch (e) {
      console.error('[remote-ops] audit submit error', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Serve audit photo
  router.get('/audit/photos/:filename', (req, res) => {
    const fn = req.params.filename;
    if (!/^[\w.-]+$/.test(fn)) return res.status(400).end();
    const fp = path.join(UPLOAD_DIR, fn);
    if (!fs.existsSync(fp)) return res.status(404).end();
    res.sendFile(fp);
  });

  // Health scores list
  router.get('/health-scores', (req, res) => {
    const outlets = listAllOutlets();
    const result = outlets.map(o => {
      const latest = db.prepare(`SELECT * FROM outlet_health_scores WHERE outlet_code=? ORDER BY computed_at DESC LIMIT 1`).get(o.code);
      return { outlet_code: o.code, outlet_name: o.name, vertical: o.vertical, ...(latest ? { score: latest.score, grade: latest.grade, breakdown: safeJson(latest.breakdown), metrics: safeJson(latest.metrics), computed_at: latest.computed_at } : { score: null }) };
    });
    res.json({ data: result });
  });

  router.post('/health-scores/recompute', (req, res) => {
    const results = recomputeAllHealthScores();
    res.json({ ok: true, count: results.length, data: results });
  });

  // Anomalies
  router.get('/anomalies', (req, res) => {
    const status = req.query.status || 'open';
    const rows = db.prepare(`SELECT * FROM outlet_anomalies WHERE status=? ORDER BY detected_at DESC LIMIT 200`).all(status);
    res.json({ data: rows });
  });

  router.post('/anomalies/:id/resolve', (req, res) => {
    const by = req.body?.by || 'admin';
    db.prepare(`UPDATE outlet_anomalies SET status='resolved', resolved_at=?, resolved_by=? WHERE id=?`).run(nowSec(), by, req.params.id);
    res.json({ ok: true });
  });

  router.post('/anomalies/detect', (req, res) => {
    const detected = detectAnomalies();
    res.json({ ok: true, count: detected.length, data: detected });
  });

  // Cameras
  router.get('/cameras', (req, res) => {
    const outlet = req.query.outlet;
    const where = outlet ? `WHERE outlet_code=? AND is_active=1` : `WHERE is_active=1`;
    const args = outlet ? [outlet] : [];
    const rows = db.prepare(`SELECT * FROM outlet_cameras ${where} ORDER BY outlet_code, display_order`).all(...args);
    res.json({ data: rows });
  });

  router.post('/cameras', (req, res) => {
    const b = req.body || {};
    if (!b.outlet_code || !b.camera_name || !b.url || !b.camera_type) return res.status(400).json({ error: 'outlet_code, camera_name, url, camera_type required' });
    if (b.id) {
      db.prepare(`UPDATE outlet_cameras SET camera_name=?, camera_type=?, url=?, username=?, password=?, display_order=?, is_active=? WHERE id=?`)
        .run(b.camera_name, b.camera_type, b.url, b.username || null, b.password || null, b.display_order || 100, b.is_active === false ? 0 : 1, b.id);
      return res.json({ ok: true, id: b.id });
    }
    const r = db.prepare(`INSERT INTO outlet_cameras (outlet_code, camera_name, camera_type, url, username, password, display_order) VALUES (?,?,?,?,?,?,?)`)
      .run(b.outlet_code, b.camera_name, b.camera_type, b.url, b.username || null, b.password || null, b.display_order || 100);
    res.json({ ok: true, id: r.lastInsertRowid });
  });

  router.delete('/cameras/:id', (req, res) => {
    db.prepare(`DELETE FROM outlet_cameras WHERE id=?`).run(req.params.id);
    res.json({ ok: true });
  });

  // Outlet pin config (PIN, WhatsApp number, GPS)
  router.get('/outlet-pins', (req, res) => {
    const rows = db.prepare(`SELECT outlet_code, outlet_name, vertical, manager_name, gps_lat, gps_lon, whatsapp_number FROM outlet_pins`).all();
    res.json({ data: rows });
  });

  router.post('/outlet-pins', (req, res) => {
    const b = req.body || {};
    if (!b.outlet_code || !b.outlet_name) return res.status(400).json({ error: 'outlet_code + outlet_name required' });
    const pinHash = b.manager_pin ? sha256(String(b.manager_pin)) : undefined;
    const existing = db.prepare(`SELECT outlet_code FROM outlet_pins WHERE outlet_code=?`).get(b.outlet_code);
    if (existing) {
      db.prepare(`UPDATE outlet_pins SET outlet_name=?, vertical=?, manager_name=?, gps_lat=?, gps_lon=?, whatsapp_number=?${pinHash ? ', manager_pin_hash=?' : ''} WHERE outlet_code=?`)
        .run(...[b.outlet_name, b.vertical || 'fnb', b.manager_name || null, b.gps_lat || null, b.gps_lon || null, b.whatsapp_number || null, ...(pinHash ? [pinHash] : []), b.outlet_code]);
    } else {
      db.prepare(`INSERT INTO outlet_pins (outlet_code, outlet_name, vertical, manager_name, gps_lat, gps_lon, whatsapp_number, manager_pin_hash) VALUES (?,?,?,?,?,?,?,?)`)
        .run(b.outlet_code, b.outlet_name, b.vertical || 'fnb', b.manager_name || null, b.gps_lat || null, b.gps_lon || null, b.whatsapp_number || null, pinHash || sha256('1234'));
    }
    res.json({ ok: true });
  });

  // Visits
  router.post('/visits/schedule', (req, res) => {
    const b = req.body || {};
    if (!b.visitor_name || !b.outlet_code || !b.scheduled_at) return res.status(400).json({ error: 'visitor_name, outlet_code, scheduled_at required' });
    const r = db.prepare(`INSERT INTO outlet_visits (visitor_name, visitor_role, outlet_code, outlet_name, scheduled_at, status) VALUES (?,?,?,?,?,?)`)
      .run(b.visitor_name, b.visitor_role || null, b.outlet_code, b.outlet_name || null, b.scheduled_at, 'scheduled');
    res.json({ ok: true, id: r.lastInsertRowid });
  });

  router.post('/visits/checkin', (req, res) => {
    try {
      const b = req.body || {};
      if (!b.visitor_name || !b.outlet_code || !b.gps_lat || !b.gps_lon) return res.status(400).json({ error: 'visitor_name, outlet_code, gps required' });
      const pin = db.prepare(`SELECT outlet_name, gps_lat, gps_lon FROM outlet_pins WHERE outlet_code=?`).get(b.outlet_code);
      const distance = pin?.gps_lat ? distMeters(pin.gps_lat, pin.gps_lon, b.gps_lat, b.gps_lon) : null;

      // Save photo
      let photoFn = null;
      if (b.arrival_photo_b64) {
        const mime = (b.arrival_photo_b64.match(/^data:image\/(\w+);base64,/) || [null, 'jpg'])[1];
        const data = b.arrival_photo_b64.replace(/^data:image\/\w+;base64,/, '');
        photoFn = `visit_${b.outlet_code}_${nowSec()}.${mime}`;
        try { fs.writeFileSync(path.join(UPLOAD_DIR, photoFn), Buffer.from(data, 'base64')); }
        catch (e) { console.error('[remote-ops] visit photo save fail', e.message); photoFn = null; }
      }

      // Look for scheduled visit today, else create on-the-fly
      const today = new Date().toISOString().slice(0, 10);
      const sched = db.prepare(`SELECT id FROM outlet_visits WHERE visitor_name=? AND outlet_code=? AND date(scheduled_at,'unixepoch')=? AND status='scheduled' ORDER BY scheduled_at LIMIT 1`).get(b.visitor_name, b.outlet_code, today);
      const now = nowSec();
      let visitId;
      if (sched) {
        db.prepare(`UPDATE outlet_visits SET checked_in_at=?, gps_lat=?, gps_lon=?, gps_distance_m=?, arrival_photo=?, status='checked_in', notes=COALESCE(?,notes) WHERE id=?`)
          .run(now, b.gps_lat, b.gps_lon, distance, photoFn, b.notes || null, sched.id);
        visitId = sched.id;
      } else {
        const r = db.prepare(`INSERT INTO outlet_visits (visitor_name, visitor_role, outlet_code, outlet_name, scheduled_at, checked_in_at, gps_lat, gps_lon, gps_distance_m, arrival_photo, status, notes)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(b.visitor_name, b.visitor_role || null, b.outlet_code, pin?.outlet_name || null, now, now, b.gps_lat, b.gps_lon, distance, photoFn, 'checked_in', b.notes || null);
        visitId = r.lastInsertRowid;
      }

      res.json({ ok: true, id: visitId, distance_m: distance, within_radius: distance !== null && distance <= 200 });
    } catch (e) {
      console.error('[remote-ops] visit checkin error', e);
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/visits', (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 100;
    const rows = db.prepare(`SELECT * FROM outlet_visits ORDER BY COALESCE(checked_in_at, scheduled_at) DESC LIMIT ?`).all(limit);
    res.json({ data: rows });
  });

  app.use(opts.mountPath || '/api/remote-ops', router);
  console.log(`[remote-ops] mounted at ${opts.mountPath || '/api/remote-ops'} — KROC remote outlet command`);

  // ──────────────────────────────
  // CRON JOBS
  // ──────────────────────────────
  // Initial run after 30s
  setTimeout(() => { try { recomputeAllHealthScores(); } catch (e) { console.error('[remote-ops] init health error', e); } }, 30 * 1000);
  setTimeout(() => { try { detectAnomalies(); } catch (e) { console.error('[remote-ops] init anomaly error', e); } }, 60 * 1000);

  // Recurring
  setInterval(() => { try { recomputeAllHealthScores(); } catch {} }, 30 * 60 * 1000); // 30 min
  setInterval(() => { try { detectAnomalies(); } catch {} }, 15 * 60 * 1000); // 15 min

  return { router, db, recomputeAllHealthScores, detectAnomalies };
}

module.exports = { setupRemoteOps };
