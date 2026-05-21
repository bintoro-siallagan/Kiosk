// server/compliance-backend.js
// Compliance & Perizinan — tracking izin & sertifikasi F&B (Halal MUI,
// BPOM/PIRT, NIB, Izin Laik Sehat) + alert masa berlaku.
//
//   GET  /api/compliance            — daftar izin + status berlaku
//   POST /api/compliance            — tambah izin
//   POST /api/compliance/:id/renew  — perpanjang { expiry_date }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS compliance_licenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, name TEXT, number TEXT,
  issuer TEXT, outlet TEXT, issued_date INTEGER, expiry_date INTEGER,
  is_active INTEGER DEFAULT 1, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const TYPES = ['Halal MUI', 'BPOM / PIRT', 'NIB', 'Izin Laik Sehat', 'SIUP', 'Sertifikat Lainnya'];
const nowSec = () => Math.floor(Date.now() / 1000);
const DAY = 86400;

function setupCompliance(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM compliance_licenses`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO compliance_licenses (type, name, number, issuer, outlet, issued_date, expiry_date, is_active) VALUES (?,?,?,?,?,?,?,1)`);
    const N = nowSec();
    // [type, name, number, issuer, outlet, issuedYrsAgo, expiryInDays]
    [
      ['Halal MUI', 'Sertifikat Halal Produk', 'ID-31-001-2024', 'BPJPH / MUI', 'Semua Outlet', 1.5, 200],
      ['BPOM / PIRT', 'Izin Edar Pangan Olahan', 'PIRT-2063171', 'Dinkes Kota', 'Central Kitchen', 2, 45],
      ['NIB', 'Nomor Induk Berusaha', 'NIB-9120004567', 'OSS / BKPM', 'PT Pusat', 3, 900],
      ['Izin Laik Sehat', 'Sertifikat Laik Higiene Sanitasi', 'LS-PSK-0231', 'Dinkes Kota', 'Paskal', 1, 20],
      ['Izin Laik Sehat', 'Sertifikat Laik Higiene Sanitasi', 'LS-PSK-0232', 'Dinkes Kota', 'Sudirman', 1, -10],
      ['SIUP', 'Surat Izin Usaha Perdagangan', 'SIUP-503-1188', 'DPMPTSP', 'PT Pusat', 2, 540],
      ['Sertifikat Lainnya', 'Sertifikat K3 / APAR', 'K3-APAR-0077', 'Damkar Kota', 'Dago', 0.5, 120],
    ].forEach(([t, nm, no, iss, ol, yrs, exp]) =>
      ins.run(t, nm, no, iss, ol, N - Math.round(yrs * 365) * DAY, N + exp * DAY));
  }

  // status: valid · expiring (≤60 hari) · expired
  const statusOf = (days) => days < 0 ? 'expired' : days <= 60 ? 'expiring' : 'valid';

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const N = nowSec();
    const rows = db.prepare(`SELECT * FROM compliance_licenses WHERE is_active = 1 ORDER BY expiry_date`).all().map(r => {
      const days = Math.floor((r.expiry_date - N) / DAY);
      return { ...r, days_left: days, status: statusOf(days) };
    });
    res.json({
      licenses: rows, types: TYPES,
      summary: {
        total: rows.length,
        valid: rows.filter(r => r.status === 'valid').length,
        expiring: rows.filter(r => r.status === 'expiring').length,
        expired: rows.filter(r => r.status === 'expired').length,
        compliance_pct: rows.length ? Math.round(rows.filter(r => r.status === 'valid').length / rows.length * 100) : 100,
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.number) return res.status(400).json({ error: 'nama & nomor izin wajib' });
    if (!TYPES.includes(b.type)) return res.status(400).json({ error: 'jenis izin tidak valid' });
    const exp = Number(b.expiry_days) > 0 ? nowSec() + Number(b.expiry_days) * DAY : nowSec() + 365 * DAY;
    db.prepare(`INSERT INTO compliance_licenses (type, name, number, issuer, outlet, issued_date, expiry_date, is_active) VALUES (?,?,?,?,?,?,?,1)`)
      .run(b.type, String(b.name).trim(), String(b.number).trim(), b.issuer || '-', b.outlet || 'Semua Outlet', nowSec(), exp);
    res.json({ ok: true });
  });

  router.post('/:id/renew', (req, res) => {
    const l = db.prepare(`SELECT * FROM compliance_licenses WHERE id = ?`).get(req.params.id);
    if (!l) return res.status(404).json({ error: 'izin tidak ditemukan' });
    const days = Number((req.body || {}).extend_days) > 0 ? Number((req.body).extend_days) : 365;
    db.prepare(`UPDATE compliance_licenses SET expiry_date = ?, issued_date = ? WHERE id = ?`)
      .run(nowSec() + days * DAY, nowSec(), l.id);
    res.json({ ok: true, new_expiry: nowSec() + days * DAY });
  });

  const mountPath = opts.mountPath || '/api/compliance';
  app.use(mountPath, router);
  console.log(`[compliance] mounted at ${mountPath} — license & permit tracking`);

  return { router, db };
}

module.exports = { setupCompliance };
