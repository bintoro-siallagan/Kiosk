// server/hris-backend.js
// HRIS & Workforce — Command Center Core Indicator #6.
// Attendance, late check-in, overtime, staffing level, productivity, payroll.
//
//   POST /api/hris/checkin    — { staff_name, role, scheduled_in }
//   POST /api/hris/checkout   — { staff_name }
//   GET  /api/hris/summary    — ringkasan buat Command Center

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const { toCsv } = require('./csv-util');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS hris_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_name TEXT NOT NULL,
  role TEXT,
  work_date TEXT NOT NULL,
  scheduled_in TEXT DEFAULT '08:00',
  check_in_at INTEGER,
  check_out_at INTEGER,
  status TEXT DEFAULT 'absent',
  late_minutes INTEGER DEFAULT 0,
  overtime_minutes INTEGER DEFAULT 0,
  productivity_score INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_hris_date ON hris_attendance(work_date);
`;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function setupHris(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  const router = express.Router();
  router.use(express.json());

  // ── CHECK-IN ──
  router.post('/checkin', (req, res) => {
    const { staff_name, role, scheduled_in } = req.body || {};
    if (!staff_name) return res.status(400).json({ error: 'staff_name wajib' });
    const date = todayStr();
    // Idempoten — kalau sudah check-in hari ini, no-op (bukan error)
    const existing = db.prepare(`SELECT * FROM hris_attendance WHERE staff_name=? AND work_date=?`).get(staff_name, date);
    if (existing) {
      return res.json({ ok: true, already: true, status: existing.status, late_minutes: existing.late_minutes });
    }
    const now = Math.floor(Date.now() / 1000);
    const sched = scheduled_in || '08:00';
    const [sh, sm] = sched.split(':').map(Number);
    const d = new Date();
    const schedTs = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate(), sh, sm).getTime() / 1000);
    const lateMin = Math.max(0, Math.round((now - schedTs) / 60));
    const status = lateMin > 5 ? 'late' : 'present';
    const info = db.prepare(`INSERT INTO hris_attendance (staff_name,role,work_date,scheduled_in,check_in_at,status,late_minutes)
      VALUES (?,?,?,?,?,?,?)`).run(staff_name, role || null, date, sched, now, status, lateMin);
    res.json({ ok: true, id: info.lastInsertRowid, status, late_minutes: lateMin });
  });

  // ── CHECK-OUT ──
  router.post('/checkout', (req, res) => {
    const { staff_name } = req.body || {};
    const date = todayStr();
    const row = db.prepare(`SELECT * FROM hris_attendance WHERE staff_name=? AND work_date=?`).get(staff_name, date);
    if (!row) return res.status(404).json({ error: 'belum check-in hari ini' });
    const now = Math.floor(Date.now() / 1000);
    const [sh, sm] = (row.scheduled_in || '08:00').split(':').map(Number);
    const d = new Date();
    const endTs = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate(), sh + 8, sm).getTime() / 1000);
    const otMin = Math.max(0, Math.round((now - endTs) / 60));
    db.prepare(`UPDATE hris_attendance SET check_out_at=?, overtime_minutes=? WHERE id=?`).run(now, otMin, row.id);
    res.json({ ok: true, overtime_minutes: otMin });
  });

  // ── SUMMARY (Command Center) ──
  router.get('/summary', (req, res) => {
    const date = req.query.date || todayStr();
    const needed = Number(req.query.needed) || 5;
    const roster = db.prepare(`SELECT * FROM hris_attendance WHERE work_date=? ORDER BY check_in_at`).all(date);

    const present = roster.filter(r => r.status === 'present').length;
    const late = roster.filter(r => r.status === 'late').length;
    const absent = roster.filter(r => r.status === 'absent').length;
    const onDuty = present + late;
    const otTotal = roster.reduce((s, r) => s + (r.overtime_minutes || 0), 0);
    const prod = roster.map(r => r.productivity_score).filter(x => x != null);

    res.json({
      date,
      roster,
      attendance: { present, late, absent, on_duty: onDuty, total: roster.length },
      staffing: { on_duty: onDuty, needed, level: needed ? Math.round(onDuty / needed * 100) : 100 },
      overtime: { total_minutes: otTotal, staff_count: roster.filter(r => (r.overtime_minutes || 0) > 0).length },
      productivity: { avg_score: prod.length ? Math.round(prod.reduce((a, b) => a + b, 0) / prod.length) : null },
      payroll: { period: 'Mei 2026', status: 'berjalan', next_run: '1 Jun 2026' },
    });
  });

  // ── EXPORT CSV (buat HRD) ──
  router.get('/export.csv', (req, res) => {
    const rows = db.prepare(`SELECT * FROM hris_attendance ORDER BY work_date DESC, check_in_at`).all();
    const fmt = (ts) => ts ? new Date(ts * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';
    const header = ['Tanggal', 'Staff', 'Role', 'Jadwal Masuk', 'Check-in', 'Check-out', 'Status', 'Telat (menit)', 'Lembur (menit)', 'Produktivitas'];
    const body = rows.map(r => [
      r.work_date, r.staff_name, r.role || '', r.scheduled_in || '',
      fmt(r.check_in_at), fmt(r.check_out_at), r.status,
      r.late_minutes || 0, r.overtime_minutes || 0, r.productivity_score ?? '',
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=hris-attendance.csv');
    res.send(toCsv(header, body));
  });

  // ── RECAP (rentang tanggal) — buat HRD lihat per periode ──
  router.get('/recap', (req, res) => {
    const to = req.query.to || todayStr();
    const from = req.query.from || to;
    const rows = db.prepare(`
      SELECT staff_name, role,
        COUNT(*) work_days,
        SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) present_days,
        SUM(CASE WHEN status='late' THEN 1 ELSE 0 END) late_days,
        SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END) absent_days,
        COALESCE(SUM(late_minutes),0) total_late,
        COALESCE(SUM(overtime_minutes),0) total_ot,
        ROUND(AVG(productivity_score)) avg_prod
      FROM hris_attendance
      WHERE work_date BETWEEN ? AND ?
      GROUP BY staff_name, role
      ORDER BY staff_name
    `).all(from, to);
    const staff = rows.map(r => ({
      ...r,
      attendance_rate: r.work_days ? Math.round((r.present_days + r.late_days) / r.work_days * 100) : 0,
    }));
    res.json({
      from, to,
      staff,
      totals: {
        staff_count: staff.length,
        total_late_incidents: staff.reduce((s, x) => s + x.late_days, 0),
        total_overtime_min: staff.reduce((s, x) => s + x.total_ot, 0),
        avg_attendance: staff.length ? Math.round(staff.reduce((s, x) => s + x.attendance_rate, 0) / staff.length) : 0,
      },
    });
  });

  const mountPath = opts.mountPath || '/api/hris';
  app.use(mountPath, router);
  console.log(`[hris] mounted at ${mountPath} — attendance + workforce`);

  return { router, db };
}

module.exports = { setupHris };
