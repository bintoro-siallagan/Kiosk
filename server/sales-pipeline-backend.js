// server/sales-pipeline-backend.js
// Sales Pipeline / CRM — funnel lead B2B: prospek → qualified →
// proposal → negosiasi → menang/kalah.
//
//   GET  /api/sales-pipeline            — lead per stage + funnel
//   POST /api/sales-pipeline            — tambah lead
//   POST /api/sales-pipeline/:id/stage  — pindah stage { stage }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sales_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, company TEXT, contact TEXT,
  value REAL DEFAULT 0, stage TEXT DEFAULT 'Prospek', owner TEXT, source TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const STAGES = ['Prospek', 'Qualified', 'Proposal', 'Negosiasi', 'Menang', 'Kalah'];
const nowSec = () => Math.floor(Date.now() / 1000);

function setupSalesPipeline(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM sales_leads`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO sales_leads (code, company, contact, value, stage, owner, source) VALUES (?,?,?,?,?,?,?)`);
    let i = 1;
    // [company, contact, value, stage, owner, source]
    [
      ['PT Mitra Katering', 'Dewi Lestari', 45000000, 'Prospek', 'Andre', 'Referral'],
      ['Hotel Santika Group', 'Budi Pranoto', 120000000, 'Qualified', 'Sarah', 'Pameran'],
      ['Universitas Bina Bangsa', 'Rina Marlina', 38000000, 'Proposal', 'Andre', 'Inbound'],
      ['PT Logistik Makmur', 'Hendra Wijaya', 67000000, 'Negosiasi', 'Sarah', 'Cold Call'],
      ['Coworking Spaces ID', 'Maya Anggraini', 52000000, 'Proposal', 'Andre', 'Referral'],
      ['Klinik Sehat Sentosa', 'Doni Saputra', 28000000, 'Qualified', 'Sarah', 'Inbound'],
      ['PT Ritel Nusantara', 'Lina Hartati', 95000000, 'Menang', 'Andre', 'Pameran'],
      ['Sekolah Tunas Mulia', 'Agus Setiawan', 19000000, 'Kalah', 'Sarah', 'Cold Call'],
    ].forEach(([co, ct, v, st, ow, sr]) => ins.run(`LEAD-${String(i++).padStart(3, '0')}`, co, ct, v, st, ow, sr));
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM sales_leads ORDER BY value DESC`).all();
    const open = rows.filter(r => !['Menang', 'Kalah'].includes(r.stage));
    const won = rows.filter(r => r.stage === 'Menang');
    const lost = rows.filter(r => r.stage === 'Kalah');
    res.json({
      stages: STAGES.map(s => {
        const items = rows.filter(r => r.stage === s);
        return { stage: s, count: items.length, value: items.reduce((a, r) => a + r.value, 0), items };
      }),
      all_stages: STAGES,
      summary: {
        total_leads: rows.length,
        pipeline_value: open.reduce((a, r) => a + r.value, 0),
        won_value: won.reduce((a, r) => a + r.value, 0),
        win_rate: (won.length + lost.length) ? Math.round(won.length / (won.length + lost.length) * 100) : 0,
        open: open.length,
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.company || !String(b.company).trim()) return res.status(400).json({ error: 'nama perusahaan wajib' });
    const n = db.prepare(`SELECT COUNT(*) c FROM sales_leads`).get().c;
    db.prepare(`INSERT INTO sales_leads (code, company, contact, value, stage, owner, source) VALUES (?,?,?,?,?,?,?)`)
      .run(`LEAD-${String(n + 1).padStart(3, '0')}`, String(b.company).trim(), b.contact || '',
        Number(b.value) || 0, STAGES.includes(b.stage) ? b.stage : 'Prospek', b.owner || '-', b.source || 'Lainnya');
    res.json({ ok: true });
  });

  router.post('/:id/stage', (req, res) => {
    const l = db.prepare(`SELECT * FROM sales_leads WHERE id = ?`).get(req.params.id);
    if (!l) return res.status(404).json({ error: 'lead tidak ditemukan' });
    const st = (req.body || {}).stage;
    if (!STAGES.includes(st)) return res.status(400).json({ error: 'stage tidak valid' });
    db.prepare(`UPDATE sales_leads SET stage = ?, updated_at = ? WHERE id = ?`).run(st, nowSec(), l.id);
    res.json({ ok: true });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM sales_leads WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['code', 'company', 'contact', 'value', 'stage', 'owner', 'source']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    fields.push(`updated_at = ?`); args.push(nowSec());
    args.push(req.params.id);
    db.prepare(`UPDATE sales_leads SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM sales_leads WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/sales-pipeline';
  app.use(mountPath, router);
  console.log(`[sales-pipeline] mounted at ${mountPath} — B2B lead funnel / CRM`);

  return { router, db };
}

module.exports = { setupSalesPipeline };
