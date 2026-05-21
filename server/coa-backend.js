// server/coa-backend.js
// Chart of Accounts (COA) — master daftar akun akuntansi, terstruktur
// per tipe & grup. Fondasi semua modul akuntansi (GL, jurnal, laporan).
//
//   GET  /api/coa               — COA ter-grup + summary
//   POST /api/coa               — tambah akun
//   POST /api/coa/:code/toggle  — aktif / nonaktif akun

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS coa_accounts (
  code TEXT PRIMARY KEY, name TEXT, account_type TEXT, account_group TEXT,
  normal_balance TEXT, is_active INTEGER DEFAULT 1, description TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const TYPES = ['Aset', 'Kewajiban', 'Ekuitas', 'Pendapatan', 'HPP', 'Beban'];
const NORMAL = { Aset: 'debit', HPP: 'debit', Beban: 'debit', Kewajiban: 'credit', Ekuitas: 'credit', Pendapatan: 'credit' };

// COA standar F&B retail Indonesia — [code, name, type, group]
const COA = [
  ['1-1100', 'Kas', 'Aset', 'Aset Lancar'],
  ['1-1110', 'Kas Kecil (Petty Cash)', 'Aset', 'Aset Lancar'],
  ['1-1200', 'Bank', 'Aset', 'Aset Lancar'],
  ['1-1300', 'Piutang Usaha', 'Aset', 'Aset Lancar'],
  ['1-1310', 'Piutang Karyawan', 'Aset', 'Aset Lancar'],
  ['1-1400', 'Persediaan Bahan Baku', 'Aset', 'Aset Lancar'],
  ['1-1410', 'Persediaan Barang Jadi', 'Aset', 'Aset Lancar'],
  ['1-1500', 'Biaya Dibayar Dimuka', 'Aset', 'Aset Lancar'],
  ['1-2100', 'Peralatan & Mesin', 'Aset', 'Aset Tetap'],
  ['1-2200', 'Perlengkapan Outlet', 'Aset', 'Aset Tetap'],
  ['1-2900', 'Akumulasi Penyusutan', 'Aset', 'Aset Tetap'],
  ['2-1100', 'Hutang Usaha', 'Kewajiban', 'Kewajiban Lancar'],
  ['2-1200', 'Hutang Pajak — PPN', 'Kewajiban', 'Kewajiban Lancar'],
  ['2-1210', 'Hutang Pajak — PPh 21', 'Kewajiban', 'Kewajiban Lancar'],
  ['2-1300', 'Hutang Gaji', 'Kewajiban', 'Kewajiban Lancar'],
  ['2-1400', 'Pendapatan Diterima Dimuka', 'Kewajiban', 'Kewajiban Lancar'],
  ['2-2100', 'Hutang Bank', 'Kewajiban', 'Kewajiban Jangka Panjang'],
  ['3-1100', 'Modal Pemilik', 'Ekuitas', 'Ekuitas'],
  ['3-2100', 'Laba Ditahan', 'Ekuitas', 'Ekuitas'],
  ['3-3100', 'Prive / Penarikan Pemilik', 'Ekuitas', 'Ekuitas'],
  ['4-1100', 'Penjualan — Dine-in', 'Pendapatan', 'Pendapatan Usaha'],
  ['4-1200', 'Penjualan — Takeaway', 'Pendapatan', 'Pendapatan Usaha'],
  ['4-1300', 'Penjualan — Online / Delivery', 'Pendapatan', 'Pendapatan Usaha'],
  ['4-1400', 'Penjualan — Kiosk', 'Pendapatan', 'Pendapatan Usaha'],
  ['4-1900', 'Diskon Penjualan', 'Pendapatan', 'Pendapatan Usaha'],
  ['4-2100', 'Pendapatan Biaya Layanan', 'Pendapatan', 'Pendapatan Lain'],
  ['4-2900', 'Pendapatan Lain-lain', 'Pendapatan', 'Pendapatan Lain'],
  ['5-1100', 'HPP — Bahan Baku', 'HPP', 'Harga Pokok Penjualan'],
  ['5-1200', 'HPP — Kemasan', 'HPP', 'Harga Pokok Penjualan'],
  ['5-1300', 'HPP — Waste / Susut', 'HPP', 'Harga Pokok Penjualan'],
  ['6-1100', 'Beban Gaji & Upah', 'Beban', 'Beban Operasional'],
  ['6-1200', 'Beban Sewa', 'Beban', 'Beban Operasional'],
  ['6-1300', 'Beban Listrik & Air', 'Beban', 'Beban Operasional'],
  ['6-1400', 'Beban Marketing & Promosi', 'Beban', 'Beban Operasional'],
  ['6-1500', 'Beban Maintenance & Repair', 'Beban', 'Beban Operasional'],
  ['6-1600', 'Beban Penyusutan', 'Beban', 'Beban Operasional'],
  ['6-1700', 'Beban Admin Bank & MDR', 'Beban', 'Beban Operasional'],
  ['6-1900', 'Beban Operasional Lain-lain', 'Beban', 'Beban Operasional'],
];

function setupCoa(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM coa_accounts`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO coa_accounts (code, name, account_type, account_group, normal_balance, is_active) VALUES (?,?,?,?,?,1)`);
    for (const [code, name, type, group] of COA) ins.run(code, name, type, group, NORMAL[type]);
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM coa_accounts ORDER BY code`).all();
    const groups = [];
    for (const t of TYPES) {
      const ta = rows.filter(r => r.account_type === t);
      if (!ta.length) continue;
      const gmap = {};
      for (const a of ta) (gmap[a.account_group] = gmap[a.account_group] || []).push(a);
      groups.push({ type: t, normal: NORMAL[t], count: ta.length, sub: Object.entries(gmap).map(([group, accounts]) => ({ group, accounts })) });
    }
    res.json({
      groups, types: TYPES,
      summary: {
        total: rows.length,
        active: rows.filter(r => r.is_active).length,
        inactive: rows.filter(r => !r.is_active).length,
        by_type: TYPES.map(t => ({ type: t, count: rows.filter(r => r.account_type === t).length })).filter(x => x.count),
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.code || !b.name || !TYPES.includes(b.account_type))
      return res.status(400).json({ error: 'kode, nama & tipe akun wajib' });
    if (db.prepare(`SELECT code FROM coa_accounts WHERE code = ?`).get(b.code))
      return res.status(409).json({ error: 'kode akun sudah dipakai' });
    db.prepare(`INSERT INTO coa_accounts (code, name, account_type, account_group, normal_balance, is_active, description) VALUES (?,?,?,?,?,1,?)`)
      .run(String(b.code).trim(), String(b.name).trim(), b.account_type,
        (b.account_group || b.account_type).trim(), NORMAL[b.account_type], (b.description || '').trim());
    res.json({ ok: true });
  });

  router.post('/:code/toggle', (req, res) => {
    const a = db.prepare(`SELECT * FROM coa_accounts WHERE code = ?`).get(req.params.code);
    if (!a) return res.status(404).json({ error: 'akun tidak ditemukan' });
    db.prepare(`UPDATE coa_accounts SET is_active = ? WHERE code = ?`).run(a.is_active ? 0 : 1, a.code);
    res.json({ ok: true });
  });

  // edit akun — nama, grup, tipe, deskripsi (kode tetap)
  router.post('/:code', (req, res) => {
    const a = db.prepare(`SELECT * FROM coa_accounts WHERE code = ?`).get(req.params.code);
    if (!a) return res.status(404).json({ error: 'akun tidak ditemukan' });
    const b = req.body || {};
    const type = TYPES.includes(b.account_type) ? b.account_type : a.account_type;
    db.prepare(`UPDATE coa_accounts SET name = ?, account_type = ?, account_group = ?, normal_balance = ?, description = ? WHERE code = ?`)
      .run((b.name || a.name).trim(), type, (b.account_group || a.account_group).trim(),
        NORMAL[type], (b.description != null ? b.description : a.description || '').trim(), a.code);
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/coa';
  app.use(mountPath, router);
  console.log(`[coa] mounted at ${mountPath} — chart of accounts master`);

  return { router, db };
}

module.exports = { setupCoa };
