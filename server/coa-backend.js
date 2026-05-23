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
  // ── Cinema vertical accounts ──
  ['2-1500', 'Hutang Royalti Distributor Film',  'Kewajiban',  'Kewajiban Lancar'],
  ['4-1500', 'Penjualan Tiket Cinema',           'Pendapatan', 'Pendapatan Cinema'],
  ['4-1510', 'Penjualan F&B Cinema — Bundle',    'Pendapatan', 'Pendapatan Cinema'],
  ['4-1520', 'Penjualan F&B Cinema — In-Studio', 'Pendapatan', 'Pendapatan Cinema'],
  ['4-1530', 'Penjualan Event Booking Cinema',   'Pendapatan', 'Pendapatan Cinema'],
  ['5-2100', 'HPP — Royalti Distributor Film',   'HPP',        'Harga Pokok Cinema'],
  ['5-2200', 'HPP — Bahan F&B Cinema',           'HPP',        'Harga Pokok Cinema'],
  ['6-2100', 'Beban Operasional Cinema',         'Beban',      'Beban Cinema'],
];

// Industry templates — apply preset COA per industri
const TEMPLATES = {
  fnb: { label: 'F&B / Restaurant', accounts: [] },  // Default sudah F&B
  cinema: { label: 'Cinema', accounts: [
    ['4-1500', 'Penjualan Tiket Cinema',           'Pendapatan', 'Pendapatan Cinema'],
    ['4-1510', 'Penjualan F&B Cinema — Bundle',    'Pendapatan', 'Pendapatan Cinema'],
    ['4-1520', 'Penjualan F&B Cinema — In-Studio', 'Pendapatan', 'Pendapatan Cinema'],
    ['4-1530', 'Penjualan Event Booking Cinema',   'Pendapatan', 'Pendapatan Cinema'],
    ['2-1500', 'Hutang Royalti Distributor Film',  'Kewajiban',  'Kewajiban Lancar'],
    ['5-2100', 'HPP — Royalti Distributor Film',   'HPP',        'Harga Pokok Cinema'],
    ['5-2200', 'HPP — Bahan F&B Cinema',           'HPP',        'Harga Pokok Cinema'],
    ['6-2100', 'Beban Operasional Cinema',         'Beban',      'Beban Cinema'],
  ] },
  retail: { label: 'Retail / Toko', accounts: [
    ['4-1600', 'Penjualan Retail',                 'Pendapatan', 'Pendapatan Retail'],
    ['4-1610', 'Penjualan Online (Marketplace)',   'Pendapatan', 'Pendapatan Retail'],
    ['5-3100', 'HPP Retail — Cost of Goods',       'HPP',        'Harga Pokok Retail'],
    ['6-3100', 'Beban Komisi Marketplace',         'Beban',      'Beban Penjualan'],
  ] },
  salon: { label: 'Salon / Beauty', accounts: [
    ['4-1700', 'Pendapatan Jasa Salon',            'Pendapatan', 'Pendapatan Jasa'],
    ['4-1710', 'Pendapatan Penjualan Produk',      'Pendapatan', 'Pendapatan Retail'],
    ['5-4100', 'HPP — Produk Salon',               'HPP',        'Harga Pokok Salon'],
    ['6-4100', 'Beban Komisi Karyawan Salon',      'Beban',      'Beban Operasional'],
  ] },
};

function setupCoa(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  // ALTER for per-outlet scope + updated_at (idempotent)
  try { db.exec("ALTER TABLE coa_accounts ADD COLUMN outlet_scope TEXT DEFAULT 'all'"); } catch {}
  try { db.exec("ALTER TABLE coa_accounts ADD COLUMN updated_at INTEGER"); } catch {}
  // Editable journal map (account_name → coa_code) — extends hardcoded COA_MAP
  db.exec(`CREATE TABLE IF NOT EXISTS coa_journal_map (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_name TEXT NOT NULL UNIQUE,
    coa_code TEXT NOT NULL,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER
  )`);

  // Idempotent seed — INSERT OR IGNORE so new accounts (cinema, dst) muncul
  // di DB yang sudah lama tanpa overwrite akun custom user.
  const ins = db.prepare(`INSERT OR IGNORE INTO coa_accounts (code, name, account_type, account_group, normal_balance, is_active) VALUES (?,?,?,?,?,1)`);
  for (const [code, name, type, group] of COA) ins.run(code, name, type, group, NORMAL[type]);

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

  // ── BALANCES — compute saldo per akun dari journal/posting yang ada ──
  router.get('/balances', (req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const from = Number(req.query.from) || (now - 30 * 86400);
    const to   = Number(req.query.to) || now;
    // Best-effort: agregat dari pos_payments + cinema_tickets + finance_expenses.
    // Hasil per kode COA dengan debit/credit/balance.
    const balances = {};
    const bump = (code, dr, cr) => {
      if (!code) return;
      balances[code] = balances[code] || { code, debit: 0, credit: 0 };
      balances[code].debit += dr; balances[code].credit += cr;
    };
    // POS revenue (cash → Kas 1-1100, non-cash → 1-1300; revenue → 4-1100)
    try {
      const rows = db.prepare(`SELECT tender_type t, COALESCE(SUM(amount_applied),0) g FROM pos_payments
        WHERE status='completed' AND created_at BETWEEN ? AND ? GROUP BY tender_type`).all(from, to);
      for (const r of rows) {
        const gross = Math.round(r.g);
        const drCode = r.t === 'cash' ? '1-1100' : '1-1300';
        bump(drCode, gross, 0);
        bump('4-1100', 0, gross);
      }
    } catch {}
    // Cinema revenue
    try {
      const tk = db.prepare(`SELECT COALESCE(SUM(price),0) g FROM cinema_tickets WHERE sold_at BETWEEN ? AND ?`).get(from, to);
      if (tk.g) { bump('1-1100', tk.g, 0); bump('4-1500', 0, tk.g); }
      const vd = db.prepare(`SELECT COALESCE(SUM(price),0) g FROM cinema_ticket_voids WHERE voided_at BETWEEN ? AND ?`).get(from, to);
      if (vd.g) { bump('4-1500', vd.g, 0); bump('1-1100', 0, vd.g); }
      const bd = db.prepare(`SELECT COALESCE(SUM(qty*price),0) g FROM cinema_purchase_bundles WHERE created_at BETWEEN ? AND ?`).get(from, to);
      if (bd.g) { bump('1-1100', bd.g, 0); bump('4-1510', 0, bd.g); }
      const isq = db.prepare(`SELECT COALESCE(SUM(total),0) g FROM cinema_in_studio_orders WHERE status='delivered' AND created_at BETWEEN ? AND ?`).get(from, to);
      if (isq.g) { bump('1-1100', isq.g, 0); bump('4-1520', 0, isq.g); }
      const ev = db.prepare(`SELECT COALESCE(SUM(total_price),0) g FROM cinema_studio_bookings WHERE status IN ('confirmed','completed') AND ((completed_at BETWEEN ? AND ?) OR (status='confirmed' AND created_at BETWEEN ? AND ?))`).get(from, to, from, to);
      if (ev.g) { bump('1-1100', ev.g, 0); bump('4-1530', 0, ev.g); }
    } catch {}
    // Expenses (best-effort)
    try {
      const exps = db.prepare(`SELECT c.name, COALESCE(SUM(e.amount),0) v FROM finance_expenses e
        LEFT JOIN expense_categories c ON c.id = e.category_id
        WHERE e.voided_at IS NULL AND e.expense_date BETWEEN ? AND ? GROUP BY c.id`).all(from, to);
      for (const r of exps) {
        const v = Math.round(r.v); if (!v) continue;
        let code = '6-1900';
        if (/sewa/i.test(r.name)) code = '6-1200';
        else if (/gaji|payroll/i.test(r.name)) code = '6-1100';
        else if (/listrik|utilit/i.test(r.name)) code = '6-1300';
        bump(code, v, 0); bump('1-1100', 0, v);
      }
    } catch {}
    const accounts = db.prepare(`SELECT * FROM coa_accounts`).all();
    const result = accounts.map(a => {
      const b = balances[a.code] || { debit: 0, credit: 0 };
      const balance = a.normal_balance === 'debit' ? b.debit - b.credit : b.credit - b.debit;
      return { code: a.code, name: a.name, account_type: a.account_type, normal_balance: a.normal_balance,
        debit: b.debit, credit: b.credit, balance, abnormal: balance < 0 };
    });
    res.json({ from, to, balances: result });
  });

  // ── EXPORT — return all accounts (untuk CSV download di client) ──
  router.get('/export', (req, res) => {
    const rows = db.prepare(`SELECT code, name, account_type, account_group, normal_balance, is_active, description, outlet_scope FROM coa_accounts ORDER BY code`).all();
    res.json({ accounts: rows, count: rows.length });
  });

  // ── IMPORT — bulk insert dari parsed CSV ──
  router.post('/import', (req, res) => {
    const b = req.body || {};
    const rows = Array.isArray(b.rows) ? b.rows : [];
    const mode = b.mode === 'replace' ? 'replace' : 'merge';
    if (!rows.length) return res.status(400).json({ ok: false, error: 'rows wajib' });
    let inserted = 0, updated = 0, skipped = 0;
    db.transaction(() => {
      for (const r of rows) {
        if (!r.code || !r.name || !TYPES.includes(r.account_type)) { skipped++; continue; }
        const existing = db.prepare(`SELECT code FROM coa_accounts WHERE code = ?`).get(r.code);
        if (existing) {
          if (mode === 'replace') {
            db.prepare(`UPDATE coa_accounts SET name = ?, account_type = ?, account_group = ?, normal_balance = ?, description = ?, outlet_scope = ?, updated_at = ? WHERE code = ?`)
              .run(r.name, r.account_type, r.account_group || r.account_type, NORMAL[r.account_type], r.description || '', r.outlet_scope || 'all', Math.floor(Date.now()/1000), r.code);
            updated++;
          } else { skipped++; }
        } else {
          db.prepare(`INSERT INTO coa_accounts (code, name, account_type, account_group, normal_balance, is_active, description, outlet_scope) VALUES (?,?,?,?,?,1,?,?)`)
            .run(r.code, r.name, r.account_type, r.account_group || r.account_type, NORMAL[r.account_type], r.description || '', r.outlet_scope || 'all');
          inserted++;
        }
      }
    })();
    res.json({ ok: true, inserted, updated, skipped });
  });

  // ── INDUSTRY TEMPLATES ──
  router.get('/templates', (req, res) => {
    res.json({ templates: Object.entries(TEMPLATES).map(([id, t]) => ({ id, label: t.label, count: t.accounts.length })) });
  });
  router.post('/apply-template/:id', (req, res) => {
    const tpl = TEMPLATES[req.params.id];
    if (!tpl) return res.status(404).json({ ok: false, error: 'Template tidak ditemukan' });
    const ins = db.prepare(`INSERT OR IGNORE INTO coa_accounts (code, name, account_type, account_group, normal_balance, is_active) VALUES (?,?,?,?,?,1)`);
    let added = 0;
    for (const [code, name, type, group] of tpl.accounts) {
      const r = ins.run(code, name, type, group, NORMAL[type]);
      if (r.changes > 0) added++;
    }
    res.json({ ok: true, template: tpl.label, added, total: tpl.accounts.length });
  });

  // ── JOURNAL MAP — editable mapping account_name → coa_code ──
  router.get('/journal-map', (req, res) => {
    res.json({ map: db.prepare(`SELECT * FROM coa_journal_map ORDER BY account_name`).all() });
  });
  router.post('/journal-map', (req, res) => {
    const b = req.body || {};
    if (!b.account_name || !b.coa_code) return res.status(400).json({ ok: false, error: 'account_name + coa_code wajib' });
    const exists = db.prepare(`SELECT coa_code FROM coa_accounts WHERE code = ?`).get(b.coa_code);
    if (!exists) return res.status(400).json({ ok: false, error: 'coa_code tidak ditemukan di COA master' });
    try {
      db.prepare(`INSERT INTO coa_journal_map (account_name, coa_code, notes) VALUES (?,?,?)`)
        .run(b.account_name, b.coa_code, b.notes || '');
      res.json({ ok: true });
    } catch (e) {
      // Already exists — update instead
      db.prepare(`UPDATE coa_journal_map SET coa_code = ?, notes = ?, updated_at = ? WHERE account_name = ?`)
        .run(b.coa_code, b.notes || '', Math.floor(Date.now()/1000), b.account_name);
      res.json({ ok: true, updated: true });
    }
  });
  router.delete('/journal-map/:id', (req, res) => {
    db.prepare(`DELETE FROM coa_journal_map WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/coa';
  app.use(mountPath, router);
  console.log(`[coa] mounted at ${mountPath} — chart of accounts master`);

  return { router, db };
}

module.exports = { setupCoa };
