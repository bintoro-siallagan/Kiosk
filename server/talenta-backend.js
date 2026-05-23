// server/talenta-backend.js
// Integrasi Talenta (Mekari HRIS) — SCAFFOLD, read-only.
// Tujuan akhir: ambil data karyawan buat verifikasi "diskon karyawan".
//
// Auth: HMAC-SHA256 ala Mekari API. Kredensial dari .env:
//   TALENTA_CLIENT_ID, TALENTA_CLIENT_SECRET
//   TALENTA_EMPLOYEE_PATH  (opsional — konfirmasi dari Postman collection Mekari)
//
// Endpoints di /api/talenta/*:
//   GET /status      — status integrasi (configured? terhubung?)
//   GET /employees   — ambil daftar karyawan (butuh kredensial valid)
//
// Cara dapet kredensial: email talenta-integration@mekari.com (email +
// nama perusahaan + company_id) → daftar Mekari Developer → Create
// Application → centang scope employee → dapet Client ID + Secret.

const express = require('express');
const crypto = require('crypto');
const https = require('https');
const Database = require('better-sqlite3');
const path = require('path');

const API_HOST = 'api.mekari.com';
// Path employee Talenta — konfirmasi final dari Postman Collection Mekari
const EMPLOYEE_PATH = process.env.TALENTA_EMPLOYEE_PATH || '/v2/talenta/v2/employee';

// ── Sync panel — attendance/shift/payroll/incentive ──
const SYNC_SCHEMA = `
CREATE TABLE IF NOT EXISTS talenta_sync (
  entity TEXT PRIMARY KEY, last_sync INTEGER, status TEXT DEFAULT 'idle', record_count INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS talenta_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT, records INTEGER, at INTEGER
);
`;
const SYNC_ENTITIES = [
  { key: 'attendance', icon: '🕐', name: 'Attendance', desc: 'Absensi & jam kerja crew', table: 'hris_attendance' },
  { key: 'shift',      icon: '📅', name: 'Shift',      desc: 'Jadwal & roster shift',     table: 'pos_shifts' },
  { key: 'payroll',    icon: '💰', name: 'Payroll',    desc: 'Gaji & komponen payroll',   table: 'payroll_runs' },
  { key: 'incentive',  icon: '🎁', name: 'Incentive',  desc: 'Bonus & incentive crew',    table: 'reward_redemptions' },
];
const ENT_MAP = Object.fromEntries(SYNC_ENTITIES.map(e => [e.key, e]));

// HMAC signing ala Mekari — headers "date request-line"
function signedHeaders(method, pathWithQuery, clientId, clientSecret) {
  const date = new Date().toUTCString();
  const requestLine = `${method} ${pathWithQuery} HTTP/1.1`;
  const payload = `date: ${date}\n${requestLine}`;
  const signature = crypto.createHmac('sha256', clientSecret).update(payload).digest('base64');
  return {
    Date: date,
    Authorization: `hmac username="${clientId}", algorithm="hmac-sha256", headers="date request-line", signature="${signature}"`,
  };
}

function talentaRequest(method, reqPath) {
  return new Promise((resolve) => {
    const clientId = process.env.TALENTA_CLIENT_ID || '';
    const clientSecret = process.env.TALENTA_CLIENT_SECRET || '';
    if (!clientId || !clientSecret) return resolve({ configured: false });
    const headers = signedHeaders(method, reqPath, clientId, clientSecret);
    const req = https.request({ host: API_HOST, path: reqPath, method, headers, timeout: 10000 }, (r) => {
      let body = '';
      r.on('data', c => (body += c));
      r.on('end', () => resolve({ configured: true, ok: r.statusCode >= 200 && r.statusCode < 300, status: r.statusCode, body }));
    });
    req.on('error', e => resolve({ configured: true, ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ configured: true, ok: false, error: 'timeout' }); });
    req.end();
  });
}

function setupTalenta(app, opts = {}) {
  const router = express.Router();
  router.use(express.json());

  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SYNC_SCHEMA);
  const countOf = (key) => {
    try { return db.prepare(`SELECT COUNT(*) c FROM ${ENT_MAP[key].table}`).get().c; } catch { return 0; }
  };
  if (db.prepare(`SELECT COUNT(*) c FROM talenta_sync`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO talenta_sync (entity, last_sync, status, record_count) VALUES (?,?,?,?)`);
    SYNC_ENTITIES.forEach((e, i) => ins.run(e.key, Math.floor(Date.now() / 1000) - (i + 1) * 3600, 'synced', countOf(e.key)));
  }

  // Status integrasi — dipakai kartu "Integrasi Talenta" di admin
  router.get('/status', async (req, res) => {
    const configured = !!(process.env.TALENTA_CLIENT_ID && process.env.TALENTA_CLIENT_SECRET);
    if (!configured) {
      return res.json({
        configured: false, state: 'belum_dikonfigurasi',
        message: 'Kredensial Talenta belum diset. Daftar di Mekari Developer, isi TALENTA_CLIENT_ID & TALENTA_CLIENT_SECRET di .env server.',
      });
    }
    const r = await talentaRequest('GET', `${EMPLOYEE_PATH}?limit=1`);
    if (r.ok) return res.json({ configured: true, state: 'terhubung', message: 'Koneksi Talenta OK — data karyawan bisa diambil.' });
    if (r.status === 401 || r.status === 403) {
      return res.json({ configured: true, state: 'kredensial_ditolak', message: `Kredensial ditolak (HTTP ${r.status}) — cek Client ID/Secret & scope employee.` });
    }
    return res.json({ configured: true, state: 'gagal', message: r.error || `HTTP ${r.status} — cek path employee (TALENTA_EMPLOYEE_PATH).`, status: r.status });
  });

  // Ambil daftar karyawan (buat verifikasi diskon karyawan — nanti)
  router.get('/employees', async (req, res) => {
    const r = await talentaRequest('GET', `${EMPLOYEE_PATH}?limit=${Number(req.query.limit) || 50}`);
    if (!r.configured) return res.status(400).json({ error: 'kredensial Talenta belum dikonfigurasi' });
    if (!r.ok) return res.status(502).json({ error: 'Talenta API error', status: r.status, detail: r.error });
    let data; try { data = JSON.parse(r.body); } catch { data = r.body; }
    res.json({ ok: true, data });
  });

  // Sync panel — status entitas + log
  router.get('/sync', (req, res) => {
    const sync = {};
    for (const r of db.prepare(`SELECT * FROM talenta_sync`).all()) sync[r.entity] = r;
    const entities = SYNC_ENTITIES.map(e => ({
      key: e.key, icon: e.icon, name: e.name, desc: e.desc, record_count: countOf(e.key),
      last_sync: (sync[e.key] || {}).last_sync || null, status: (sync[e.key] || {}).status || 'idle',
    }));
    const credConfigured = !!(process.env.TALENTA_CLIENT_ID && process.env.TALENTA_CLIENT_SECRET);
    res.json({
      connection: {
        provider: 'Talenta by Mekari', workspace: 'mysoursally',
        status: credConfigured ? 'connected' : 'sandbox', mode: 'realtime sync',
      },
      entities,
      log: db.prepare(`SELECT * FROM talenta_log ORDER BY at DESC LIMIT 12`).all(),
      summary: {
        entity_count: entities.length,
        total_records: entities.reduce((s, e) => s + e.record_count, 0),
        synced: entities.filter(e => e.status === 'synced').length,
        last_sync: Math.max(0, ...entities.map(e => e.last_sync || 0)),
      },
    });
  });

  // Trigger sinkronisasi
  router.post('/sync', (req, res) => {
    const entity = (req.body || {}).entity || 'all';
    const targets = entity === 'all' ? SYNC_ENTITIES.map(e => e.key) : [entity];
    if (targets.some(k => !ENT_MAP[k])) return res.status(400).json({ error: 'entity tidak valid' });
    const now = Math.floor(Date.now() / 1000);
    const upd = db.prepare(`INSERT INTO talenta_sync (entity, last_sync, status, record_count) VALUES (?,?, 'synced', ?)
      ON CONFLICT(entity) DO UPDATE SET last_sync = excluded.last_sync, status = 'synced', record_count = excluded.record_count`);
    const log = db.prepare(`INSERT INTO talenta_log (entity, records, at) VALUES (?,?,?)`);
    let total = 0;
    db.transaction(() => {
      for (const k of targets) { const c = countOf(k); upd.run(k, now, c); log.run(k, c, now); total += c; }
    })();
    res.json({ ok: true, synced: targets, records: total, at: now });
  });

  // PATCH/DELETE — keyed by `entity` (PRIMARY KEY) instead of id
  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM talenta_sync WHERE entity = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['last_sync', 'status', 'record_count']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE talenta_sync SET ${fields.join(', ')} WHERE entity = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM talenta_sync WHERE entity = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/talenta';
  app.use(mountPath, router);
  const has = !!(process.env.TALENTA_CLIENT_ID && process.env.TALENTA_CLIENT_SECRET);
  console.log(`[talenta] mounted at ${mountPath} — Mekari HRIS (${has ? 'configured' : 'scaffold — no credentials yet'})`);
  return { router };
}

module.exports = { setupTalenta };
