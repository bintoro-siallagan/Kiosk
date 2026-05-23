// server/payroll-backend.js
// Payroll Integration — hitung gaji dari HRIS (staff + attendance/OT),
// lengkap BPJS + PPh21 + lembur. Proses payroll → otomatis posting ke
// finance sebagai beban gaji.
//
//   GET  /api/payroll?period=YYYY-MM  — preview payroll per staff
//   POST /api/payroll/process         — proses + posting ke finance

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS payroll_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT UNIQUE NOT NULL,
  staff_count INTEGER, total_bruto REAL, total_bpjs REAL,
  total_pph21 REAL, total_thp REAL, total_cost REAL,
  finance_expense_id INTEGER, processed_by TEXT,
  processed_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;

// gaji pokok per role (Rp/bulan)
const SALARY = { manager: 6500000, supervisor: 4500000, kasir: 3500000, barista: 3500000, gudang: 3500000 };
const baseSalary = (role) => SALARY[(role || '').toLowerCase()] || 3500000;
const PTKP_MONTH = 4500000;     // PTKP 54jt/thn → batas PPh21
const thisPeriod = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

function setupPayroll(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const one = (s, ...p) => { try { return db.prepare(s).get(...p); } catch { return null; } };
  const many = (s, ...p) => { try { return db.prepare(s).all(...p); } catch { return []; } };

  // hitung payroll semua staff aktif untuk 1 periode
  const compute = (period) => {
    const staff = many(`SELECT id, name, role FROM pos_staff WHERE is_active = 1`);
    const lines = staff.map(s => {
      const gaji = baseSalary(s.role);
      const otMin = (one(`SELECT COALESCE(SUM(overtime_minutes),0) v FROM hris_attendance
        WHERE staff_name = ? AND work_date LIKE ?`, s.name, period + '%') || { v: 0 }).v;
      const otHours = otMin / 60;
      const lembur = Math.round(gaji / 173 * otHours * 1.5);
      const bruto = gaji + lembur;
      const bpjs = Math.round(gaji * 0.03);                          // potongan karyawan
      const pph21 = bruto > PTKP_MONTH ? Math.round((bruto - PTKP_MONTH) * 0.05) : 0;
      const thp = bruto - bpjs - pph21;
      const company_cost = bruto + Math.round(gaji * 0.04);          // + BPJS employer
      return { staff_id: s.id, name: s.name, role: s.role, gaji_pokok: gaji,
        ot_hours: +otHours.toFixed(1), lembur, bruto, bpjs, pph21, thp, company_cost };
    });
    const sum = (f) => lines.reduce((a, b) => a + b[f], 0);
    return {
      lines,
      summary: {
        staff_count: lines.length, total_bruto: sum('bruto'), total_bpjs: sum('bpjs'),
        total_pph21: sum('pph21'), total_thp: sum('thp'), total_cost: sum('company_cost'),
      },
    };
  };

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const period = req.query.period || thisPeriod();
    const c = compute(period);
    res.json({ period, ...c, processed: one(`SELECT * FROM payroll_runs WHERE period = ?`, period) || null });
  });

  router.post('/process', (req, res) => {
    const period = (req.body && req.body.period) || thisPeriod();
    if (one(`SELECT id FROM payroll_runs WHERE period = ?`, period))
      return res.status(409).json({ error: 'payroll periode ini sudah diproses' });
    const c = compute(period);
    if (!c.lines.length) return res.status(400).json({ error: 'tidak ada staff aktif' });

    const tx = db.transaction(() => {
      // posting ke finance — beban gaji
      let expenseId = null;
      try {
        const ex = db.prepare(`INSERT INTO finance_expenses
          (doc_no, category_id, expense_date, amount, tax_amount, vendor, description, payment_method, status, created_by)
          VALUES (?,?,?,?,0,?,?,?, 'recorded', 'Payroll')`).run(
          'PAY-' + period, 'opex-gaji', Math.floor(Date.now() / 1000), c.summary.total_cost,
          '-', `Payroll ${period} — ${c.summary.staff_count} staff (gaji+BPJS+lembur)`, 'transfer');
        expenseId = ex.lastInsertRowid;
      } catch (e) { /* tabel finance_expenses beda — skip posting */ }

      const r = db.prepare(`INSERT INTO payroll_runs
        (period, staff_count, total_bruto, total_bpjs, total_pph21, total_thp, total_cost, finance_expense_id, processed_by)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(period, c.summary.staff_count, c.summary.total_bruto,
        c.summary.total_bpjs, c.summary.total_pph21, c.summary.total_thp, c.summary.total_cost,
        expenseId, (req.body && req.body.by) || 'Finance');
      return { id: r.lastInsertRowid, finance_expense_id: expenseId };
    });
    res.json({ ok: true, ...tx() });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM payroll_runs WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['processed_by']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE payroll_runs SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM payroll_runs WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    // Payroll runs are sensitive financial records — only allow delete if no finance posting was created
    if (row.finance_expense_id) {
      return res.status(403).json({ error: 'payroll sudah diposting ke finance — tidak bisa dihapus' });
    }
    db.prepare(`DELETE FROM payroll_runs WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/payroll';
  app.use(mountPath, router);
  console.log(`[payroll] mounted at ${mountPath} — HRIS → finance payroll`);

  return { router, db };
}

module.exports = { setupPayroll };
