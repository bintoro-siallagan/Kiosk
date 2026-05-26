// server/outlet-launch-backend.js
// karyaOS — Karya Outlet Launch Readiness (KOLR)
// New outlet launch tracking dengan multi-dept sign-off + photo evidence.
// Solusi untuk "antar departemen salah-menyalahkan" saat opening outlet.
//
// 9 departments: construction, it, hr, operations, marketing, finance,
//                supply_chain, compliance, qa
// 6 stages:      t_minus_30, t_minus_14, t_minus_7, t_minus_3, t_minus_1, d_day
//
// STRICT workflow: GO LIVE locked sampai SEMUA 9 dept lead sign-off.
//
// Endpoints mounted at /api/launch:
//   GET    /launches                  — list active + recent launches
//   POST   /launches                  — create new launch (project)
//   GET    /launches/:id              — full detail: tasks, evidence, signoffs
//   PATCH  /launches/:id              — update meta (target_open_date, name)
//   DELETE /launches/:id              — archive (status=archived)
//   GET    /launches/:id/tasks        — all tasks (filterable by dept/stage)
//   PATCH  /tasks/:id                 — update status + note (no PIN needed)
//   POST   /tasks/:id/evidence        — upload photo evidence (base64)
//   GET    /evidence/:filename        — serve photo
//   POST   /launches/:id/signoff      — dept lead sign-off with PIN
//   POST   /launches/:id/go-live      — final GO LIVE (strict validation)
//   POST   /launches/:id/waiver       — GM override (records waived items)
//   GET    /launches/:id/audit        — full audit trail
//   GET    /templates                 — default templates per vertical
//   POST   /templates/reseed          — reset to default (dev only)

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const nowSec = () => Math.floor(Date.now() / 1000);
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

const DEPARTMENTS = [
  { code: 'construction', label: '🏗️ Construction & Fit-Out', color: '#f59e0b', order: 1 },
  { code: 'it',           label: '💻 IT & Tech (POS, Network, CCTV)', color: '#22d3ee', order: 2 },
  { code: 'hr',           label: '👥 HR & Training', color: '#a855f7', order: 3 },
  { code: 'operations',   label: '⚙️ Operations & SOP', color: '#10b981', order: 4 },
  { code: 'supply_chain', label: '📦 Supply Chain & Stock', color: '#3b82f6', order: 5 },
  { code: 'marketing',    label: '📢 Marketing & Promo', color: '#ec4899', order: 6 },
  { code: 'finance',      label: '💰 Finance & Cash Float', color: '#06b6d4', order: 7 },
  { code: 'compliance',   label: '⚖️ Compliance & Legal', color: '#84cc16', order: 8 },
  { code: 'qa',           label: '🔍 Quality Assurance & Soft-Launch', color: '#f43f5e', order: 9 },
];

const STAGES = [
  { code: 't_minus_30', label: 'T-30 Hari', days: 30, color: '#94a3b8' },
  { code: 't_minus_14', label: 'T-14 Hari', days: 14, color: '#22d3ee' },
  { code: 't_minus_7',  label: 'T-7 Hari',  days: 7,  color: '#a855f7' },
  { code: 't_minus_3',  label: 'T-3 Hari',  days: 3,  color: '#f59e0b' },
  { code: 't_minus_1',  label: 'T-1 Hari',  days: 1,  color: '#ef4444' },
  { code: 'd_day',      label: 'D-Day (Opening)', days: 0, color: '#10b981' },
];

// Default tasks per (dept × stage). [dept, stage, item_label, requires_photo]
const DEFAULT_TASKS = [
  // ── CONSTRUCTION ──
  ['construction', 't_minus_30', 'Final layout & floor plan approved', 1],
  ['construction', 't_minus_30', 'Vendor kontraktor confirmed + kontrak signed', 0],
  ['construction', 't_minus_14', 'Fit-out 70% selesai (struktur, plafon, lantai)', 1],
  ['construction', 't_minus_14', 'Listrik & plumbing terpasang & uji coba', 1],
  ['construction', 't_minus_7',  'AC, exhaust kitchen, ducting terpasang', 1],
  ['construction', 't_minus_7',  'Signage utama (luar) terpasang', 1],
  ['construction', 't_minus_3',  'Furniture & fixture terpasang final', 1],
  ['construction', 't_minus_3',  'Cleaning paska konstruksi', 1],
  ['construction', 't_minus_1',  'Punch-list defect zero', 1],
  ['construction', 'd_day',      'Building handover ke Ops', 1],

  // ── IT ──
  ['it', 't_minus_30', 'Internet provider order + tanggal install confirmed', 0],
  ['it', 't_minus_14', 'Kabel LAN + power point POS area selesai', 1],
  ['it', 't_minus_7',  'Internet live + speed test ≥50Mbps', 1],
  ['it', 't_minus_7',  'POS hardware terkirim ke site (kasir, CDS, printer)', 1],
  ['it', 't_minus_3',  'POS terinstall + login test sukses', 1],
  ['it', 't_minus_3',  'CCTV ter-install + recording aktif', 1],
  ['it', 't_minus_3',  'WiFi customer aktif + bandwidth segregation', 0],
  ['it', 't_minus_1',  'KDS / CDS / kiosk integration test end-to-end', 1],
  ['it', 't_minus_1',  'Backup printer + power UPS tersedia', 1],
  ['it', 'd_day',      'Standby IT support on-site D-Day', 0],

  // ── HR ──
  ['hr', 't_minus_30', 'Headcount plan approved (kasir, kitchen, manager)', 0],
  ['hr', 't_minus_30', 'Job posting & recruitment kicked off', 0],
  ['hr', 't_minus_14', 'Semua posisi inti terisi (kontrak signed)', 0],
  ['hr', 't_minus_14', 'Schedule training 5-hari finalized', 0],
  ['hr', 't_minus_7',  'Product knowledge training selesai', 1],
  ['hr', 't_minus_7',  'POS / kiosk handling training selesai', 1],
  ['hr', 't_minus_3',  'SOP grooming, attendance, hygiene briefed', 1],
  ['hr', 't_minus_3',  'Seragam terdistribusi ke semua staff', 1],
  ['hr', 't_minus_1',  'Final dry-run service simulation', 1],
  ['hr', 'd_day',      'Briefing pagi D-Day + line-up motivasi', 1],

  // ── OPERATIONS ──
  ['operations', 't_minus_30', 'SOP buka-tutup outlet final', 0],
  ['operations', 't_minus_30', 'Menu engineering & resep finalized', 0],
  ['operations', 't_minus_14', 'Operational manual hardcopy on-site', 1],
  ['operations', 't_minus_14', 'Floor plan service flow validated', 0],
  ['operations', 't_minus_7',  'Equipment dapur tested (kompor, fryer, chiller)', 1],
  ['operations', 't_minus_7',  'Smallwares & utensils complete', 1],
  ['operations', 't_minus_3',  'Soft-opening dry-run (internal staff sebagai customer)', 1],
  ['operations', 't_minus_1',  'Cleaning final + sanitasi area produksi', 1],
  ['operations', 't_minus_1',  'Emergency protocol briefed (kebakaran, listrik mati)', 0],
  ['operations', 'd_day',      'Pre-opening check 60 menit sebelum buka', 1],

  // ── SUPPLY CHAIN ──
  ['supply_chain', 't_minus_30', 'Supplier list final + kontrak harga signed', 0],
  ['supply_chain', 't_minus_14', 'PO opening stock ke semua supplier dikirim', 0],
  ['supply_chain', 't_minus_7',  'Cold storage suhu stable -18°C / 4°C', 1],
  ['supply_chain', 't_minus_3',  'Dry storage stock complete (sesuai par-level)', 1],
  ['supply_chain', 't_minus_3',  'Fresh produce dikirim & inspected', 1],
  ['supply_chain', 't_minus_1',  'F&B opening stock 100% (frozen, dry, chilled)', 1],
  ['supply_chain', 't_minus_1',  'Cinema concession stock (popcorn, snack, drink) ready', 1],
  ['supply_chain', 'd_day',      'Daily order untuk D+1 sudah ditempatkan', 0],

  // ── MARKETING ──
  ['marketing', 't_minus_30', 'Grand opening date locked + budget approved', 0],
  ['marketing', 't_minus_30', 'Creative brief (poster, video, social) approved', 0],
  ['marketing', 't_minus_14', 'Social media teaser campaign live', 0],
  ['marketing', 't_minus_14', 'Influencer / KOL invited & confirmed', 0],
  ['marketing', 't_minus_7',  'Local print/banner sekitar outlet terpasang', 1],
  ['marketing', 't_minus_7',  'Opening promo (BOGO, diskon, free) di-config di POS', 0],
  ['marketing', 't_minus_3',  'Press release dikirim + media invitation', 0],
  ['marketing', 't_minus_1',  'Opening event flow rehearsal', 0],
  ['marketing', 'd_day',      'Live coverage social media + IG story', 1],

  // ── FINANCE ──
  ['finance', 't_minus_30', 'Outlet code & cost center created di accounting', 0],
  ['finance', 't_minus_14', 'Bank account & rekening setor terbuka', 0],
  ['finance', 't_minus_14', 'EDC / QRIS / payment gateway aktif & test', 1],
  ['finance', 't_minus_7',  'Cash float Rp 5jt disiapkan + petty cash Rp 2jt', 1],
  ['finance', 't_minus_7',  'Asuransi properti aktif', 0],
  ['finance', 't_minus_3',  'Pricing & tax config di POS final', 0],
  ['finance', 't_minus_1',  'Cash counting machine tested', 1],
  ['finance', 'd_day',      'Opening balance recorded di journal', 0],

  // ── COMPLIANCE ──
  ['compliance', 't_minus_30', 'NIB / SIUP / TDP outlet baru terbit', 1],
  ['compliance', 't_minus_30', 'IMB / PBG bangunan valid', 1],
  ['compliance', 't_minus_14', 'Sertifikat halal MUI (kalau brand halal)', 1],
  ['compliance', 't_minus_14', 'BPOM / sertifikat produksi pangan', 1],
  ['compliance', 't_minus_7',  'Izin operasional dari kelurahan/kecamatan', 1],
  ['compliance', 't_minus_7',  'Sertifikat fire safety + APAR valid', 1],
  ['compliance', 't_minus_3',  'P3K & emergency exit signage compliant', 1],
  ['compliance', 't_minus_1',  'BPJS Kesehatan & Ketenagakerjaan staff aktif', 0],
  ['compliance', 'd_day',      'Semua sertifikat di-display di area customer', 1],

  // ── QA ──
  ['qa', 't_minus_30', 'QA SOP & checklist soft-launch final', 0],
  ['qa', 't_minus_14', 'Mystery shopper script & scorecard ready', 0],
  ['qa', 't_minus_7',  'Soft-launch invite list (50 internal + family)', 0],
  ['qa', 't_minus_3',  'Soft-launch dilaksanakan + feedback collected', 1],
  ['qa', 't_minus_3',  'Issue list dari soft-launch → action plan', 0],
  ['qa', 't_minus_1',  'Re-check semua issue critical (zero P0 bugs)', 0],
  ['qa', 't_minus_1',  'Mystery shopper round-1 (anonymous customer)', 1],
  ['qa', 'd_day',      'QA on-site standby + real-time issue triage', 0],
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS outlet_launches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outlet_code TEXT NOT NULL,
  outlet_name TEXT NOT NULL,
  vertical TEXT NOT NULL DEFAULT 'fnb',  -- fnb | cinema
  area TEXT,
  target_open_date INTEGER NOT NULL,     -- unix sec
  project_manager TEXT,
  gm_name TEXT,
  status TEXT DEFAULT 'in_progress',     -- in_progress | live | waived_live | archived | cancelled
  go_live_at INTEGER,
  went_live_by TEXT,
  waiver_reason TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_launches_status ON outlet_launches(status, target_open_date);

CREATE TABLE IF NOT EXISTS launch_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  launch_id INTEGER NOT NULL,
  department TEXT NOT NULL,
  stage TEXT NOT NULL,
  item_code TEXT,
  item_label TEXT NOT NULL,
  requires_photo INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',         -- pending | in_progress | done | blocked | na
  owner TEXT,
  deadline INTEGER,
  note TEXT,
  updated_at INTEGER,
  updated_by TEXT,
  FOREIGN KEY(launch_id) REFERENCES outlet_launches(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tasks_launch ON launch_tasks(launch_id, department, stage);

CREATE TABLE IF NOT EXISTS launch_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  uploaded_by TEXT,
  uploaded_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  gps_lat REAL, gps_lon REAL,
  gps_distance_m INTEGER,
  device_id TEXT,
  FOREIGN KEY(task_id) REFERENCES launch_tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_evidence_task ON launch_evidence(task_id);

CREATE TABLE IF NOT EXISTS launch_signoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  launch_id INTEGER NOT NULL,
  department TEXT NOT NULL,
  signed_by_name TEXT NOT NULL,
  signed_by_pin_hash TEXT NOT NULL,
  signed_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  total_tasks INTEGER,
  done_tasks INTEGER,
  blocked_tasks INTEGER,
  na_tasks INTEGER,
  comment TEXT,
  selfie_filename TEXT,
  gps_lat REAL, gps_lon REAL,
  gps_distance_m INTEGER,
  device_id TEXT,
  FOREIGN KEY(launch_id) REFERENCES outlet_launches(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_signoffs_unique ON launch_signoffs(launch_id, department);

CREATE TABLE IF NOT EXISTS launch_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  launch_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,              -- created | task_updated | evidence_uploaded | signed_off | signoff_revoked | go_live | waiver
  actor TEXT,
  department TEXT,
  detail TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_launch ON launch_audit(launch_id, created_at);
`;

// Idempotent migrations untuk DB existing
const MIGRATIONS = [
  `ALTER TABLE launch_evidence ADD COLUMN gps_lat REAL`,
  `ALTER TABLE launch_evidence ADD COLUMN gps_lon REAL`,
  `ALTER TABLE launch_evidence ADD COLUMN gps_distance_m INTEGER`,
  `ALTER TABLE launch_evidence ADD COLUMN device_id TEXT`,
  `ALTER TABLE launch_signoffs ADD COLUMN selfie_filename TEXT`,
  `ALTER TABLE launch_signoffs ADD COLUMN gps_lat REAL`,
  `ALTER TABLE launch_signoffs ADD COLUMN gps_lon REAL`,
  `ALTER TABLE launch_signoffs ADD COLUMN gps_distance_m INTEGER`,
  `ALTER TABLE launch_signoffs ADD COLUMN device_id TEXT`,
];

function distMeters(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function setupOutletLaunch(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  for (const m of MIGRATIONS) { try { db.exec(m); } catch {} }

  const UPLOAD_DIR = opts.uploadDir || path.join(__dirname, 'uploads', 'launch');
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const logAudit = (launchId, eventType, detail = {}) => {
    try {
      db.prepare(`INSERT INTO launch_audit (launch_id, event_type, actor, department, detail) VALUES (?,?,?,?,?)`)
        .run(launchId, eventType, detail.actor || null, detail.department || null, JSON.stringify(detail));
    } catch (e) { console.error('[launch] audit error', e.message); }
  };

  // Seed tasks for a new launch from DEFAULT_TASKS
  function seedTasksForLaunch(launchId, targetOpenSec) {
    const ins = db.prepare(`INSERT INTO launch_tasks (launch_id, department, stage, item_label, requires_photo, deadline, status) VALUES (?,?,?,?,?,?,?)`);
    const stageDays = Object.fromEntries(STAGES.map(s => [s.code, s.days]));
    const tx = db.transaction(() => {
      for (const [dept, stage, label, photo] of DEFAULT_TASKS) {
        const deadline = targetOpenSec - (stageDays[stage] || 0) * 86400;
        ins.run(launchId, dept, stage, label, photo, deadline, 'pending');
      }
    });
    tx();
  }

  // Calculate readiness per dept + overall
  function calcReadiness(launchId) {
    const tasks = db.prepare(`SELECT department, status FROM launch_tasks WHERE launch_id=?`).all(launchId);
    const signoffs = db.prepare(`SELECT department FROM launch_signoffs WHERE launch_id=?`).all(launchId);
    const signoffSet = new Set(signoffs.map(s => s.department));
    const byDept = {};
    for (const d of DEPARTMENTS) {
      const dt = tasks.filter(t => t.department === d.code);
      const done = dt.filter(t => t.status === 'done').length;
      const na = dt.filter(t => t.status === 'na').length;
      const blocked = dt.filter(t => t.status === 'blocked').length;
      const total = dt.length;
      const eligible = total - na; // N/A doesn't count
      byDept[d.code] = {
        total, done, na, blocked,
        pct: eligible > 0 ? Math.round((done / eligible) * 100) : 100,
        signed_off: signoffSet.has(d.code),
        can_signoff: blocked === 0 && done + na === total && !signoffSet.has(d.code),
      };
    }
    const totalDept = DEPARTMENTS.length;
    const signedDept = DEPARTMENTS.filter(d => byDept[d.code].signed_off).length;
    const overallPct = Math.round(DEPARTMENTS.reduce((s, d) => s + byDept[d.code].pct, 0) / totalDept);
    return {
      by_department: byDept,
      overall_pct: overallPct,
      signed_departments: signedDept,
      total_departments: totalDept,
      can_go_live: signedDept === totalDept,
    };
  }

  // ─── ROUTER ───
  const router = express.Router();

  // List launches
  router.get('/launches', (req, res) => {
    const status = req.query.status || 'in_progress,live,waived_live';
    const arr = status.split(',').map(s => `'${s.replace(/'/g,'')}'`).join(',');
    const rows = db.prepare(`SELECT * FROM outlet_launches WHERE status IN (${arr}) ORDER BY target_open_date ASC`).all();
    const enriched = rows.map(r => ({ ...r, readiness: calcReadiness(r.id) }));
    res.json({ data: enriched, total: enriched.length });
  });

  // Create launch
  router.post('/launches', (req, res) => {
    try {
      const b = req.body || {};
      if (!b.outlet_code || !b.outlet_name || !b.target_open_date) {
        return res.status(400).json({ error: 'outlet_code, outlet_name, target_open_date wajib' });
      }
      const r = db.prepare(`INSERT INTO outlet_launches (outlet_code, outlet_name, vertical, area, target_open_date, project_manager, gm_name, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(b.outlet_code, b.outlet_name, b.vertical || 'fnb', b.area || null, b.target_open_date, b.project_manager || null, b.gm_name || null, b.notes || null, b.created_by || 'admin');
      seedTasksForLaunch(r.lastInsertRowid, b.target_open_date);
      logAudit(r.lastInsertRowid, 'created', { actor: b.created_by || 'admin', outlet: b.outlet_code });
      res.json({ ok: true, id: r.lastInsertRowid });
    } catch (e) {
      console.error('[launch] create error', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Launch detail
  router.get('/launches/:id', (req, res) => {
    const launch = db.prepare(`SELECT * FROM outlet_launches WHERE id=?`).get(req.params.id);
    if (!launch) return res.status(404).json({ error: 'Launch tidak ditemukan' });
    const tasks = db.prepare(`SELECT t.*, GROUP_CONCAT(e.filename) as evidence_filenames FROM launch_tasks t LEFT JOIN launch_evidence e ON e.task_id=t.id WHERE t.launch_id=? GROUP BY t.id ORDER BY t.department, t.stage, t.id`).all(req.params.id);
    const signoffs = db.prepare(`SELECT department, signed_by_name, signed_at, total_tasks, done_tasks, blocked_tasks, na_tasks, comment, selfie_filename, gps_distance_m FROM launch_signoffs WHERE launch_id=?`).all(req.params.id);
    res.json({
      launch,
      tasks: tasks.map(t => ({ ...t, evidence: t.evidence_filenames ? t.evidence_filenames.split(',') : [] })),
      signoffs,
      readiness: calcReadiness(req.params.id),
      departments: DEPARTMENTS,
      stages: STAGES,
    });
  });

  // Update launch meta
  router.patch('/launches/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const vals = [];
    for (const k of ['outlet_name', 'area', 'target_open_date', 'project_manager', 'gm_name', 'notes', 'status']) {
      if (b[k] !== undefined) { fields.push(`${k}=?`); vals.push(b[k]); }
    }
    if (!fields.length) return res.status(400).json({ error: 'no fields to update' });
    vals.push(req.params.id);
    db.prepare(`UPDATE outlet_launches SET ${fields.join(', ')} WHERE id=?`).run(...vals);
    res.json({ ok: true });
  });

  // Archive launch
  router.delete('/launches/:id', (req, res) => {
    db.prepare(`UPDATE outlet_launches SET status='archived' WHERE id=?`).run(req.params.id);
    res.json({ ok: true });
  });

  // Update task
  router.patch('/tasks/:id', (req, res) => {
    const b = req.body || {};
    const task = db.prepare(`SELECT * FROM launch_tasks WHERE id=?`).get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task tidak ditemukan' });
    // Prevent updates after signoff
    const so = db.prepare(`SELECT id FROM launch_signoffs WHERE launch_id=? AND department=?`).get(task.launch_id, task.department);
    if (so) return res.status(423).json({ error: `Departemen ${task.department} sudah sign-off. Revoke signoff dulu untuk edit task.` });

    const fields = []; const vals = [];
    for (const k of ['status', 'owner', 'note']) {
      if (b[k] !== undefined) { fields.push(`${k}=?`); vals.push(b[k]); }
    }
    fields.push(`updated_at=?`); vals.push(nowSec());
    fields.push(`updated_by=?`); vals.push(b.updated_by || 'admin');
    vals.push(req.params.id);
    db.prepare(`UPDATE launch_tasks SET ${fields.join(', ')} WHERE id=?`).run(...vals);
    logAudit(task.launch_id, 'task_updated', { actor: b.updated_by || 'admin', department: task.department, task_id: task.id, status: b.status });
    res.json({ ok: true });
  });

  // Upload evidence photo — GPS check vs outlet pin (kalau ada)
  router.post('/tasks/:id/evidence', (req, res) => {
    try {
      const b = req.body || {};
      if (!b.photo_b64 || b.photo_b64.length < 100) return res.status(400).json({ error: 'photo_b64 required' });
      const task = db.prepare(`SELECT * FROM launch_tasks WHERE id=?`).get(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task tidak ditemukan' });
      const so = db.prepare(`SELECT id FROM launch_signoffs WHERE launch_id=? AND department=?`).get(task.launch_id, task.department);
      if (so) return res.status(423).json({ error: 'Departemen sudah sign-off' });

      // Super-admin bypass via bypass_pin
      let isSuperAdmin = false;
      if (b.bypass_pin) {
        try {
          const sa = db.prepare(`SELECT id FROM admin_users WHERE pin=? AND role IN ('super-admin','admin') AND active=1`).get(String(b.bypass_pin));
          if (sa) isSuperAdmin = true;
        } catch {}
      }

      // Geofence check — hanya untuk task fisik (requires_photo=1) yang umumnya
      // di-site. Off-site dept (marketing creative, legal) skip check.
      let distance = null;
      const launch = db.prepare(`SELECT outlet_code, outlet_name FROM outlet_launches WHERE id=?`).get(task.launch_id);
      if (launch) {
        const pin = db.prepare(`SELECT gps_lat, gps_lon, gps_radius_m, geofence_enforce FROM outlet_pins WHERE outlet_code=?`).get(launch.outlet_code);
        if (pin?.gps_lat && pin?.gps_lon && b.gps_lat && b.gps_lon) {
          distance = distMeters(pin.gps_lat, pin.gps_lon, b.gps_lat, b.gps_lon);
          const radius = pin.gps_radius_m || 200;
          if (distance > radius && !isSuperAdmin && pin.geofence_enforce) {
            return res.status(403).json({
              error: `Lokasi Anda ${distance}m dari outlet (batas ${radius}m). Evidence wajib dari area outlet.`,
              distance_m: distance, radius_m: radius,
            });
          }
        }
      }

      const mime = (b.photo_b64.match(/^data:image\/(\w+);base64,/) || [null, 'jpg'])[1];
      const data = b.photo_b64.replace(/^data:image\/\w+;base64,/, '');
      const filename = `launch_${task.launch_id}_${task.department}_${task.id}_${Date.now()}.${mime}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, filename), Buffer.from(data, 'base64'));
      db.prepare(`INSERT INTO launch_evidence (task_id, filename, uploaded_by, gps_lat, gps_lon, gps_distance_m, device_id) VALUES (?,?,?,?,?,?,?)`)
        .run(task.id, filename, b.uploaded_by || 'admin', b.gps_lat || null, b.gps_lon || null, distance, b.device_id || null);
      logAudit(task.launch_id, 'evidence_uploaded', { actor: b.uploaded_by || 'admin', department: task.department, task_id: task.id, filename, distance_m: distance });
      res.json({ ok: true, filename, distance_m: distance });
    } catch (e) {
      console.error('[launch] evidence upload error', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Serve evidence
  router.get('/evidence/:filename', (req, res) => {
    const fn = req.params.filename;
    if (!/^[\w.-]+$/.test(fn)) return res.status(400).end();
    const fp = path.join(UPLOAD_DIR, fn);
    if (!fs.existsSync(fp)) return res.status(404).end();
    res.sendFile(fp);
  });

  // Dept sign-off (STRICT: requires all tasks done/na, no blocked)
  router.post('/launches/:id/signoff', (req, res) => {
    const b = req.body || {};
    if (!b.department || !b.signed_by_name || !b.pin) {
      return res.status(400).json({ error: 'department, signed_by_name, pin wajib' });
    }
    const launch = db.prepare(`SELECT * FROM outlet_launches WHERE id=?`).get(req.params.id);
    if (!launch) return res.status(404).json({ error: 'Launch tidak ditemukan' });
    if (launch.status !== 'in_progress') return res.status(400).json({ error: `Launch sudah ${launch.status}` });

    const tasks = db.prepare(`SELECT status, requires_photo, id FROM launch_tasks WHERE launch_id=? AND department=?`).all(req.params.id, b.department);
    if (tasks.length === 0) return res.status(400).json({ error: 'Departemen tidak punya task' });

    const blocked = tasks.filter(t => t.status === 'blocked').length;
    const pending = tasks.filter(t => ['pending','in_progress'].includes(t.status)).length;
    if (blocked > 0) return res.status(400).json({ error: `Masih ada ${blocked} task BLOCKED. Resolve dulu sebelum sign-off.` });
    if (pending > 0) return res.status(400).json({ error: `Masih ada ${pending} task belum done/N/A.` });

    // Check evidence requirement
    const evidenceCheck = db.prepare(`
      SELECT t.id, t.item_label FROM launch_tasks t
      LEFT JOIN launch_evidence e ON e.task_id=t.id
      WHERE t.launch_id=? AND t.department=? AND t.requires_photo=1 AND t.status='done'
      GROUP BY t.id HAVING COUNT(e.id)=0
    `).all(req.params.id, b.department);
    if (evidenceCheck.length > 0) {
      return res.status(400).json({ error: `${evidenceCheck.length} task wajib foto belum ada evidence: ${evidenceCheck.map(x=>x.item_label.slice(0,40)).slice(0,3).join('; ')}…` });
    }

    // Selfie kerja wajib (anti-nitip-PIN)
    if (!b.selfie_b64 || b.selfie_b64.length < 100) {
      return res.status(400).json({ error: 'Selfie kerja wajib disertakan untuk sign-off (anti-nitip-PIN).' });
    }

    // Save selfie
    let selfieFn = null;
    try {
      const mime = (b.selfie_b64.match(/^data:image\/(\w+);base64,/) || [null, 'jpg'])[1];
      const data = b.selfie_b64.replace(/^data:image\/\w+;base64,/, '');
      selfieFn = `signoff_${req.params.id}_${b.department}_${Date.now()}.${mime}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, selfieFn), Buffer.from(data, 'base64'));
    } catch (e) { console.error('[launch] signoff selfie save fail', e.message); }

    // Distance to outlet (info only — many dept leads sign-off remote)
    let signoffDistance = null;
    try {
      const launchRow = db.prepare(`SELECT outlet_code FROM outlet_launches WHERE id=?`).get(req.params.id);
      if (launchRow) {
        const pinRow = db.prepare(`SELECT gps_lat, gps_lon FROM outlet_pins WHERE outlet_code=?`).get(launchRow.outlet_code);
        if (pinRow?.gps_lat && b.gps_lat) signoffDistance = distMeters(pinRow.gps_lat, pinRow.gps_lon, b.gps_lat, b.gps_lon);
      }
    } catch {}

    const done = tasks.filter(t => t.status === 'done').length;
    const na = tasks.filter(t => t.status === 'na').length;
    const pinHash = sha256(b.pin);

    try {
      db.prepare(`INSERT INTO launch_signoffs (launch_id, department, signed_by_name, signed_by_pin_hash, total_tasks, done_tasks, blocked_tasks, na_tasks, comment, selfie_filename, gps_lat, gps_lon, gps_distance_m, device_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(req.params.id, b.department, b.signed_by_name, pinHash, tasks.length, done, blocked, na, b.comment || null,
             selfieFn, b.gps_lat || null, b.gps_lon || null, signoffDistance, b.device_id || null);
    } catch (e) {
      if (e.message.includes('UNIQUE')) return res.status(409).json({ error: `${b.department} sudah pernah sign-off. Revoke dulu kalau mau ulang.` });
      throw e;
    }
    logAudit(req.params.id, 'signed_off', { actor: b.signed_by_name, department: b.department, comment: b.comment, distance_m: signoffDistance, selfie: selfieFn });
    res.json({ ok: true, readiness: calcReadiness(req.params.id) });
  });

  // Revoke sign-off
  router.delete('/launches/:id/signoff/:department', (req, res) => {
    const r = db.prepare(`DELETE FROM launch_signoffs WHERE launch_id=? AND department=?`).run(req.params.id, req.params.department);
    if (r.changes === 0) return res.status(404).json({ error: 'Signoff tidak ditemukan' });
    logAudit(req.params.id, 'signoff_revoked', { actor: req.body?.by || 'admin', department: req.params.department });
    res.json({ ok: true });
  });

  // GO LIVE (strict)
  router.post('/launches/:id/go-live', (req, res) => {
    const b = req.body || {};
    const launch = db.prepare(`SELECT * FROM outlet_launches WHERE id=?`).get(req.params.id);
    if (!launch) return res.status(404).json({ error: 'Launch tidak ditemukan' });
    if (launch.status !== 'in_progress') return res.status(400).json({ error: `Launch sudah ${launch.status}` });

    const readiness = calcReadiness(req.params.id);
    if (!readiness.can_go_live) {
      const missing = DEPARTMENTS.filter(d => !readiness.by_department[d.code].signed_off).map(d => d.label);
      return res.status(400).json({ error: `Belum bisa GO LIVE. ${missing.length} departemen belum sign-off: ${missing.join(', ')}` });
    }

    db.prepare(`UPDATE outlet_launches SET status='live', go_live_at=?, went_live_by=? WHERE id=?`)
      .run(nowSec(), b.went_live_by || 'admin', req.params.id);
    logAudit(req.params.id, 'go_live', { actor: b.went_live_by || 'admin', readiness });
    res.json({ ok: true, message: `🎉 ${launch.outlet_name} GO LIVE!` });
  });

  // Waiver — GM override (records waived state)
  router.post('/launches/:id/waiver', (req, res) => {
    const b = req.body || {};
    if (!b.reason || !b.gm_name || !b.gm_pin) return res.status(400).json({ error: 'reason, gm_name, gm_pin wajib' });
    // In production: validate gm_pin against an authorized GM user
    const launch = db.prepare(`SELECT * FROM outlet_launches WHERE id=?`).get(req.params.id);
    if (!launch) return res.status(404).json({ error: 'Launch tidak ditemukan' });
    if (launch.status !== 'in_progress') return res.status(400).json({ error: `Launch sudah ${launch.status}` });

    const readiness = calcReadiness(req.params.id);
    const missing = DEPARTMENTS.filter(d => !readiness.by_department[d.code].signed_off).map(d => d.code);

    db.prepare(`UPDATE outlet_launches SET status='waived_live', go_live_at=?, went_live_by=?, waiver_reason=? WHERE id=?`)
      .run(nowSec(), b.gm_name, `${b.reason} | waived_depts: ${missing.join(',')}`, req.params.id);
    logAudit(req.params.id, 'waiver', { actor: b.gm_name, reason: b.reason, waived_departments: missing });
    res.json({ ok: true, waived_departments: missing });
  });

  // Audit trail
  router.get('/launches/:id/audit', (req, res) => {
    const rows = db.prepare(`SELECT * FROM launch_audit WHERE launch_id=? ORDER BY created_at DESC LIMIT 500`).all(req.params.id);
    res.json({ data: rows.map(r => ({ ...r, detail: (() => { try { return JSON.parse(r.detail); } catch { return r.detail; } })() })) });
  });

  // Templates
  router.get('/templates', (req, res) => {
    const groups = {};
    for (const [dept, stage, label, photo] of DEFAULT_TASKS) {
      groups[dept] = groups[dept] || {};
      groups[dept][stage] = groups[dept][stage] || [];
      groups[dept][stage].push({ label, requires_photo: !!photo });
    }
    res.json({ departments: DEPARTMENTS, stages: STAGES, tasks: groups, total_tasks: DEFAULT_TASKS.length });
  });

  app.use(opts.mountPath || '/api/launch', router);
  console.log(`[launch] mounted at ${opts.mountPath || '/api/launch'} — KOLR ${DEFAULT_TASKS.length} tasks × 9 dept × 6 stage`);

  return { router, db };
}

module.exports = { setupOutletLaunch, DEPARTMENTS, STAGES };
