// server/general-ledger-backend.js
// General Ledger — chart of accounts + saldo, plus Memorial Journal
// (jurnal manual / penyesuaian) yang langsung update saldo akun.
//
//   GET  /api/general-ledger            — chart of accounts + memorial journal
//   POST /api/general-ledger/memorial   — posting jurnal memorial { description, debit, credit, amount }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS gl_accounts (
  code TEXT PRIMARY KEY, name TEXT, acc_type TEXT, normal_balance TEXT, balance REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS memorial_journals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT, description TEXT, lines TEXT,
  total REAL, posted_by TEXT, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const ACC_TYPES = ['Aset', 'Kewajiban', 'Ekuitas', 'Pendapatan', 'Beban'];
const nowSec = () => Math.floor(Date.now() / 1000);

function setupGeneralLedger(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };

  // Seed chart of accounts
  if (db.prepare(`SELECT COUNT(*) c FROM gl_accounts`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO gl_accounts (code, name, acc_type, normal_balance, balance) VALUES (?,?,?,?,?)`);
    [
      ['1-100', 'Kas', 'Aset', 'debit', 18500000], ['1-110', 'Bank', 'Aset', 'debit', 142000000],
      ['1-120', 'Piutang Usaha', 'Aset', 'debit', 17600000], ['1-130', 'Persediaan', 'Aset', 'debit', 38000000],
      ['1-200', 'Peralatan & Mesin', 'Aset', 'debit', 95000000],
      ['2-100', 'Hutang Usaha', 'Kewajiban', 'credit', 24000000], ['2-200', 'Hutang Bank', 'Kewajiban', 'credit', 60000000],
      ['3-100', 'Modal Pemilik', 'Ekuitas', 'credit', 200000000], ['3-200', 'Laba Ditahan', 'Ekuitas', 'credit', 27200000],
      ['4-100', 'Pendapatan Penjualan', 'Pendapatan', 'credit', 57000000],
      ['5-100', 'HPP', 'Beban', 'debit', 20000000], ['5-200', 'Beban Gaji', 'Beban', 'debit', 14000000],
      ['5-300', 'Beban Operasional', 'Beban', 'debit', 8000000], ['5-400', 'Beban Sewa', 'Beban', 'debit', 6500000],
    ].forEach(a => ins.run(...a));
  }
  // Seed memorial journals
  if (db.prepare(`SELECT COUNT(*) c FROM memorial_journals`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO memorial_journals (ref, description, lines, total, posted_by, created_at) VALUES (?,?,?,?,?,?)`);
    const N = nowSec();
    [
      ['MJ-2026-001', 'Penyusutan peralatan bulan ini', [['5-300', 2000000, 0], ['1-200', 0, 2000000]], 5],
      ['MJ-2026-002', 'Koreksi pencatatan kas kurang', [['1-100', 500000, 0], ['4-100', 0, 500000]], 3],
      ['MJ-2026-003', 'Reklasifikasi hutang usaha ke hutang bank', [['2-100', 3000000, 0], ['2-200', 0, 3000000]], 8],
    ].forEach(([ref, desc, lines, d]) => ins.run(ref, desc,
      JSON.stringify(lines.map(([acc, dr, cr]) => ({ account_code: acc, debit: dr, credit: cr }))),
      lines.reduce((s, l) => s + l[1], 0), 'Finance', N - d * 86400));
  }

  const accName = {};
  for (const a of many(`SELECT code,name FROM gl_accounts`)) accName[a.code] = a.name;

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const accounts = many(`SELECT * FROM gl_accounts ORDER BY code`);
    const groups = ACC_TYPES.map(t => {
      const accs = accounts.filter(a => a.acc_type === t);
      return { type: t, accounts: accs, total: accs.reduce((s, a) => s + a.balance, 0) };
    });
    const memorial = many(`SELECT * FROM memorial_journals ORDER BY created_at DESC`).map(m => ({
      ...m, lines: (() => { try { return JSON.parse(m.lines || '[]').map(l => ({ ...l, name: accName[l.account_code] || l.account_code })); } catch { return []; } })(),
    }));
    res.json({
      groups, memorial,
      summary: {
        accounts: accounts.length,
        total_aset: groups.find(g => g.type === 'Aset').total,
        total_beban: groups.find(g => g.type === 'Beban').total,
        memorial_count: memorial.length,
      },
    });
  });

  router.post('/memorial', (req, res) => {
    const b = req.body || {};
    const amt = Math.round(Number(b.amount) || 0);
    if (!b.debit || !b.credit || b.debit === b.credit) return res.status(400).json({ error: 'akun debit & kredit wajib & beda' });
    if (!(amt > 0)) return res.status(400).json({ error: 'jumlah wajib > 0' });
    const dAcc = db.prepare(`SELECT * FROM gl_accounts WHERE code = ?`).get(b.debit);
    const cAcc = db.prepare(`SELECT * FROM gl_accounts WHERE code = ?`).get(b.credit);
    if (!dAcc || !cAcc) return res.status(404).json({ error: 'akun tidak ditemukan' });

    db.transaction(() => {
      // debit account: + kalau normal debit, − kalau normal credit
      db.prepare(`UPDATE gl_accounts SET balance = balance + ? WHERE code = ?`)
        .run(dAcc.normal_balance === 'debit' ? amt : -amt, b.debit);
      db.prepare(`UPDATE gl_accounts SET balance = balance + ? WHERE code = ?`)
        .run(cAcc.normal_balance === 'credit' ? amt : -amt, b.credit);
      const n = db.prepare(`SELECT COUNT(*) c FROM memorial_journals`).get().c;
      db.prepare(`INSERT INTO memorial_journals (ref, description, lines, total, posted_by) VALUES (?,?,?,?,?)`).run(
        `MJ-${new Date().toISOString().slice(0, 7).replace('-', '')}-${String(n + 1).padStart(3, '0')}`,
        (b.description || 'Jurnal memorial').trim(),
        JSON.stringify([{ account_code: b.debit, debit: amt, credit: 0 }, { account_code: b.credit, debit: 0, credit: amt }]),
        amt, (b.posted_by || 'Finance').trim());
    })();
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/general-ledger';
  app.use(mountPath, router);
  console.log(`[general-ledger] mounted at ${mountPath} — GL & memorial journal`);

  return { router, db };
}

module.exports = { setupGeneralLedger };
