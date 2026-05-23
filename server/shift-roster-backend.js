// server/shift-roster-backend.js
// Shift Roster — penjadwalan shift staff per outlet per hari.
//
//   GET  /api/shift-roster            — roster (grup per tanggal) + summary
//   POST /api/shift-roster            — tambah jadwal shift
//   POST /api/shift-roster/:id/remove — hapus jadwal

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS shift_roster (
  id INTEGER PRIMARY KEY AUTOINCREMENT, staff_name TEXT, role TEXT, outlet TEXT,
  shift_date TEXT, shift_type TEXT, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const SHIFTS = ['Pagi', 'Siang', 'Malam'];
const SHIFT_HOURS = { Pagi: '07:00–15:00', Siang: '12:00–20:00', Malam: '15:00–23:00' };
const dateStr = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };

function setupShiftRoster(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM shift_roster`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO shift_roster (staff_name, role, outlet, shift_date, shift_type) VALUES (?,?,?,?,?)`);
    const crew = [
      ['Andre W.', 'Supervisor'], ['Sari M.', 'Kasir'], ['Budi S.', 'Barista'], ['Rina K.', 'Crew'],
      ['Doni P.', 'Kasir'], ['Lina W.', 'Barista'], ['Eka R.', 'Crew'], ['Fajar N.', 'Crew'],
    ];
    // 7 hari × Paskal/Dago × shift
    for (let day = 0; day < 7; day++) {
      for (const outlet of ['Paskal', 'Dago']) {
        for (let si = 0; si < (outlet === 'Paskal' ? 3 : 2); si++) {
          const c = crew[(day * 5 + si * 2 + (outlet === 'Dago' ? 1 : 0)) % crew.length];
          ins.run(c[0], c[1], outlet, dateStr(day), SHIFTS[si]);
        }
      }
    }
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM shift_roster ORDER BY shift_date, shift_type`).all()
      .map(r => ({ ...r, hours: SHIFT_HOURS[r.shift_type] || '' }));
    const today = dateStr(0);
    const byDate = {};
    for (const r of rows) (byDate[r.shift_date] = byDate[r.shift_date] || []).push(r);
    res.json({
      days: Object.keys(byDate).sort().map(d => ({ date: d, is_today: d === today, shifts: byDate[d] })),
      shift_types: SHIFTS,
      summary: {
        total_shifts: rows.length,
        today_shifts: rows.filter(r => r.shift_date === today).length,
        staff_count: new Set(rows.map(r => r.staff_name)).size,
        days: Object.keys(byDate).length,
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.staff_name || !b.shift_date) return res.status(400).json({ error: 'nama staff & tanggal wajib' });
    db.prepare(`INSERT INTO shift_roster (staff_name, role, outlet, shift_date, shift_type) VALUES (?,?,?,?,?)`)
      .run(String(b.staff_name).trim(), (b.role || 'Crew').trim(), (b.outlet || 'Paskal').trim(),
        b.shift_date, SHIFTS.includes(b.shift_type) ? b.shift_type : 'Pagi');
    res.json({ ok: true });
  });

  router.post('/:id/remove', (req, res) => {
    const r = db.prepare(`SELECT id FROM shift_roster WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'jadwal tidak ditemukan' });
    db.prepare(`DELETE FROM shift_roster WHERE id = ?`).run(r.id);
    res.json({ ok: true });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM shift_roster WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['staff_name', 'role', 'outlet', 'shift_date', 'shift_type']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE shift_roster SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM shift_roster WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/shift-roster';
  app.use(mountPath, router);
  console.log(`[shift-roster] mounted at ${mountPath} — staff shift scheduling`);

  return { router, db };
}

module.exports = { setupShiftRoster };
