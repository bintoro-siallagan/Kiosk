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

const API_HOST = 'api.mekari.com';
// Path employee Talenta — konfirmasi final dari Postman Collection Mekari
const EMPLOYEE_PATH = process.env.TALENTA_EMPLOYEE_PATH || '/v2/talenta/v2/employee';

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

  const mountPath = opts.mountPath || '/api/talenta';
  app.use(mountPath, router);
  const has = !!(process.env.TALENTA_CLIENT_ID && process.env.TALENTA_CLIENT_SECRET);
  console.log(`[talenta] mounted at ${mountPath} — Mekari HRIS (${has ? 'configured' : 'scaffold — no credentials yet'})`);
  return { router };
}

module.exports = { setupTalenta };
