// server/device-session-backend.js
// Device & Session Control — device authorization, session monitor,
// suspicious login alert, force logout, location validation.
//
//   GET  /api/device-session                  — devices + sessions + alert
//   POST /api/device-session/:id/logout        — force logout sesi
//   POST /api/device-session/device/:id/authorize — { authorized } toggle device

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS device_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, type TEXT, outlet TEXT, authorized INTEGER DEFAULT 1, last_seen INTEGER
);
CREATE TABLE IF NOT EXISTS login_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_name TEXT, user_name TEXT, user_role TEXT, location TEXT, ip TEXT,
  login_at INTEGER, last_active INTEGER, status TEXT DEFAULT 'active',
  suspicious INTEGER DEFAULT 0, suspicious_reason TEXT
);
`;
const nowSec = () => Math.floor(Date.now() / 1000);

function setupDeviceSession(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM device_registry`).get().c === 0) {
    const dv = db.prepare(`INSERT INTO device_registry (name, type, outlet, authorized, last_seen) VALUES (?,?,?,?,?)`);
    [
      ['POS-Kasir-01', 'pos', 'Paskal', 1, 5], ['POS-Kasir-02', 'pos', 'Sudirman', 1, 12],
      ['Kiosk-Paskal-A', 'kiosk', 'Paskal', 1, 30], ['Kiosk-BSD-01', 'kiosk', 'BSD City', 1, 90],
      ['Admin-Laptop-HQ', 'desktop', 'HQ', 1, 2], ['Tablet-Manager-03', 'tablet', 'Kemang', 0, 180],
      ['Mobile-Unknown', 'mobile', '—', 0, 8],
    ].forEach(([n, t, o, a, m]) => dv.run(n, t, o, a, nowSec() - m * 60));
  }
  if (db.prepare(`SELECT COUNT(*) c FROM login_sessions`).get().c === 0) {
    const ss = db.prepare(`INSERT INTO login_sessions
      (device_name, user_name, user_role, location, ip, login_at, last_active, status, suspicious, suspicious_reason)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const N = nowSec();
    [
      ['POS-Kasir-01', 'Manager', 'outlet-manager', 'Paskal', '192.168.1.12', 240, 3, 'active', 0, null],
      ['POS-Kasir-01', 'Kasir 1', 'cashier', 'Paskal', '192.168.1.13', 300, 1, 'active', 0, null],
      ['POS-Kasir-02', 'Kasir 2', 'cashier', 'Sudirman', '192.168.5.21', 180, 6, 'active', 0, null],
      ['Admin-Laptop-HQ', 'Super Admin', 'super-admin', 'HQ Jakarta', '10.0.0.4', 90, 2, 'active', 0, null],
      ['Mobile-Unknown', 'Kasir 2', 'cashier', 'Bandung', '103.27.x.x', 45, 5, 'active', 1, 'Device belum terotorisasi + login dari lokasi tidak biasa'],
      ['Tablet-Manager-03', 'Andi', 'supervisor', 'Kemang', '192.168.9.7', 600, 30, 'active', 1, 'Device belum terotorisasi'],
      ['POS-Kasir-02', 'Kasir 3', 'cashier', 'Sudirman', '192.168.5.22', 900, 720, 'ended', 0, null],
    ].forEach(([dn, un, ur, loc, ip, lAgo, aAgo, st, sus, rsn]) =>
      ss.run(dn, un, ur, loc, ip, N - lAgo * 60, N - aAgo * 60, st, sus, rsn));
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const devices = db.prepare(`SELECT * FROM device_registry ORDER BY authorized DESC, last_seen DESC`).all();
    const sessions = db.prepare(`SELECT * FROM login_sessions ORDER BY login_at DESC`).all();
    const active = sessions.filter(s => s.status === 'active');
    res.json({
      devices,
      active_sessions: active,
      suspicious: active.filter(s => s.suspicious),
      history: sessions.filter(s => s.status !== 'active').slice(0, 8),
      summary: {
        active_sessions: active.length,
        devices: devices.length,
        authorized_devices: devices.filter(d => d.authorized).length,
        suspicious: active.filter(s => s.suspicious).length,
      },
    });
  });

  router.post('/:id/logout', (req, res) => {
    const s = db.prepare(`SELECT * FROM login_sessions WHERE id = ?`).get(req.params.id);
    if (!s) return res.status(404).json({ error: 'sesi tidak ditemukan' });
    db.prepare(`UPDATE login_sessions SET status = 'ended', last_active = ? WHERE id = ?`).run(nowSec(), s.id);
    res.json({ ok: true });
  });

  router.post('/device/:id/authorize', (req, res) => {
    const d = db.prepare(`SELECT * FROM device_registry WHERE id = ?`).get(req.params.id);
    if (!d) return res.status(404).json({ error: 'device tidak ditemukan' });
    const authorized = (req.body || {}).authorized ? 1 : 0;
    db.prepare(`UPDATE device_registry SET authorized = ? WHERE id = ?`).run(authorized, d.id);
    res.json({ ok: true, authorized });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM device_registry WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['name', 'type', 'outlet', 'authorized']) {
      if (b[k] !== undefined) {
        fields.push(`${k} = ?`);
        args.push(k === 'authorized' ? (b[k] ? 1 : 0) : b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE device_registry SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM device_registry WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/device-session';
  app.use(mountPath, router);
  console.log(`[device-session] mounted at ${mountPath} — device & session control`);

  return { router, db };
}

module.exports = { setupDeviceSession };
