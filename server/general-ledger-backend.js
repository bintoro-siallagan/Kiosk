// server/general-ledger-backend.js
// General Ledger — buku besar di atas Chart of Accounts (coa_accounts
// = single source of truth). Saldo akun = saldo awal + efek jurnal
// memorial. Plus Memorial Journal (jurnal manual / penyesuaian).
//
//   GET  /api/general-ledger            — chart (dari COA) + saldo + memorial
//   POST /api/general-ledger/memorial   — posting jurnal memorial

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS gl_opening_balance (
  code TEXT PRIMARY KEY, opening_balance REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS memorial_journals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT, description TEXT, lines TEXT,
  total REAL, posted_by TEXT, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const ACC_TYPES = ['Aset', 'Kewajiban', 'Ekuitas', 'Pendapatan', 'HPP', 'Beban'];
const nowSec = () => Math.floor(Date.now() / 1000);
const J = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

// saldo awal (mapped ke kode COA)
const OPENING = [
  ['1-1100', 18500000], ['1-1110', 5000000], ['1-1200', 142000000], ['1-1300', 17600000],
  ['1-1400', 38000000], ['1-2100', 95000000], ['2-1100', 24000000], ['2-2100', 60000000],
  ['3-1100', 200000000], ['3-2100', 32100000], ['4-1100', 57000000], ['5-1100', 20000000],
  ['6-1100', 14000000], ['6-1200', 6500000], ['6-1900', 8000000],
];

function setupGeneralLedger(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const many = (s, ...p) => { try { return db.prepare(s).all(...p); } catch { return []; } };

  // seed saldo awal
  if (db.prepare(`SELECT COUNT(*) c FROM gl_opening_balance`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO gl_opening_balance (code, opening_balance) VALUES (?,?)`);
    for (const [code, bal] of OPENING) ins.run(code, bal);
  }
  // migrasi: jurnal memorial lama (kode 5-digit "1-100") → bersihkan, re-seed pakai kode COA
  const mig = (() => {
    const m = db.prepare(`SELECT lines FROM memorial_journals LIMIT 1`).get();
    if (!m) return true; // kosong → seed fresh
    return J(m.lines).some(l => (l.account_code || '').length <= 5);
  })();
  if (mig) {
    db.prepare(`DELETE FROM memorial_journals`).run();
    const ins = db.prepare(`INSERT INTO memorial_journals (ref, description, lines, total, posted_by, created_at) VALUES (?,?,?,?,?,?)`);
    const N = nowSec();
    [
      ['MJ-2026-001', 'Penyusutan peralatan bulan ini', [['6-1600', 2000000, 0], ['1-2900', 0, 2000000]], 5],
      ['MJ-2026-002', 'Koreksi pencatatan kas kurang', [['1-1100', 500000, 0], ['4-2900', 0, 500000]], 3],
      ['MJ-2026-003', 'Reklasifikasi hutang usaha ke hutang bank', [['2-1100', 3000000, 0], ['2-2100', 0, 3000000]], 8],
    ].forEach(([ref, desc, lines, d]) => ins.run(ref, desc,
      JSON.stringify(lines.map(([acc, dr, cr]) => ({ account_code: acc, debit: dr, credit: cr }))),
      lines.reduce((s, l) => s + l[1], 0), 'Finance', N - d * 86400));
  }

  // ── chart of accounts diambil LIVE dari coa_accounts (single source) ──
  const loadCoa = () => {
    const rows = many(`SELECT code, name, account_type, normal_balance FROM coa_accounts WHERE is_active = 1 ORDER BY code`);
    const map = {}; for (const r of rows) map[r.code] = r;
    return { rows, map };
  };

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const { rows: coa, map } = loadCoa();
    const opening = {};
    for (const o of many(`SELECT code, opening_balance FROM gl_opening_balance`)) opening[o.code] = o.opening_balance;
    const memorial = many(`SELECT * FROM memorial_journals ORDER BY created_at DESC`);
    // delta saldo dari jurnal memorial
    const delta = {};
    for (const m of memorial) for (const l of J(m.lines)) {
      const acc = map[l.account_code]; if (!acc) continue;
      const d = (l.debit || 0) - (l.credit || 0);
      delta[l.account_code] = (delta[l.account_code] || 0) + (acc.normal_balance === 'debit' ? d : -d);
    }
    const accounts = coa.map(a => ({ ...a, acc_type: a.account_type, balance: (opening[a.code] || 0) + (delta[a.code] || 0) }));
    const groups = ACC_TYPES.map(t => {
      const accs = accounts.filter(a => a.account_type === t);
      return { type: t, accounts: accs, total: accs.reduce((s, a) => s + a.balance, 0) };
    }).filter(g => g.accounts.length);
    res.json({
      groups,
      memorial: memorial.map(m => ({ ...m, lines: J(m.lines).map(l => ({ ...l, name: (map[l.account_code] || {}).name || l.account_code })) })),
      summary: {
        accounts: accounts.length,
        total_aset: (groups.find(g => g.type === 'Aset') || { total: 0 }).total,
        total_beban: (groups.find(g => g.type === 'Beban') || { total: 0 }).total,
        memorial_count: memorial.length,
        source: 'Chart of Accounts (coa_accounts)',
      },
    });
  });

  router.post('/memorial', (req, res) => {
    const b = req.body || {};
    const amt = Math.round(Number(b.amount) || 0);
    if (!b.debit || !b.credit || b.debit === b.credit) return res.status(400).json({ error: 'akun debit & kredit wajib & beda' });
    if (!(amt > 0)) return res.status(400).json({ error: 'jumlah wajib > 0' });
    const { map } = loadCoa();
    if (!map[b.debit] || !map[b.credit]) return res.status(404).json({ error: 'akun tidak ada di COA' });
    const n = db.prepare(`SELECT COUNT(*) c FROM memorial_journals`).get().c;
    db.prepare(`INSERT INTO memorial_journals (ref, description, lines, total, posted_by) VALUES (?,?,?,?,?)`).run(
      `MJ-${new Date().toISOString().slice(0, 7).replace('-', '')}-${String(n + 1).padStart(3, '0')}`,
      (b.description || 'Jurnal memorial').trim(),
      JSON.stringify([{ account_code: b.debit, debit: amt, credit: 0 }, { account_code: b.credit, debit: 0, credit: amt }]),
      amt, (b.posted_by || 'Finance').trim());
    res.json({ ok: true });
  });

  // PATCH memorial journal — hanya description (field non-akuntansi yg aman)
  router.patch('/memorial/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM memorial_journals WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    // GL audit: hanya izinkan field yang aman (deskripsi/notes), TIDAK lines/total/ref
    for (const k of ['description']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE memorial_journals SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  // DELETE memorial journal — heavily guarded: hanya posting hari ini (anggap draft)
  router.delete('/memorial/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM memorial_journals WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const ageSec = nowSec() - (row.created_at || 0);
    const DRAFT_WINDOW = 24 * 3600; // 24 jam: anggap draft, boleh hapus
    if (ageSec > DRAFT_WINDOW) {
      return res.status(403).json({ error: 'jurnal sudah ter-posting (>24 jam) — tidak bisa dihapus. Buat jurnal koreksi/balik untuk membatalkan.' });
    }
    db.prepare(`DELETE FROM memorial_journals WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/general-ledger';
  app.use(mountPath, router);
  console.log(`[general-ledger] mounted at ${mountPath} — GL on COA + memorial journal`);

  return { router, db };
}

module.exports = { setupGeneralLedger };
