// server/procurement-gaps-backend.js
// Procurement Wave 2: Purchase Return + Invoice Aging + Advance Purchase + PR Qty Suggestion.
// ADDITIVE module — extends existing procurement-backend.js. Mount at SAME path /api/procurement
// so endpoints feel like one cohesive module.
//
// Requirements:
//   - procurement-backend.js already loaded (creates suppliers, purchase_orders, goods_receipts, etc.)
//   - master-items-backend.js loaded (BOM → for PR qty suggestion based on consumption)
//   - audit_warehouse exists with last_cost column

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const DEFAULT_DB = path.join(__dirname, '..', 'data', 'kiosk.db');

const SCHEMA_SQL = `
-- Purchase Return: barang dikembaliin ke supplier (damaged, wrong, expired)
CREATE TABLE IF NOT EXISTS purchase_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no TEXT UNIQUE NOT NULL,
  gr_id INTEGER NOT NULL,
  supplier_id INTEGER NOT NULL,
  return_date INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('damaged','wrong_item','expired','quality_issue','overstock','other')),
  notes TEXT,
  total_value REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized','voided')),
  credit_note_ref TEXT,
  refund_method TEXT,
  finalized_at INTEGER, finalized_by TEXT,
  voided_at INTEGER, voided_by TEXT, voided_reason TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  created_by TEXT,
  FOREIGN KEY (gr_id) REFERENCES goods_receipts(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);
CREATE INDEX IF NOT EXISTS idx_returns_gr ON purchase_returns(gr_id);
CREATE INDEX IF NOT EXISTS idx_returns_supplier ON purchase_returns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON purchase_returns(status);

CREATE TABLE IF NOT EXISTS pr_return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL,
  sku TEXT NOT NULL,
  name TEXT,
  qty REAL NOT NULL,
  unit TEXT,
  unit_price REAL,
  line_total REAL,
  item_reason TEXT,
  FOREIGN KEY (return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE
);

-- Advance Purchase: DP/uang muka ke supplier sebelum PO complete
CREATE TABLE IF NOT EXISTS advance_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no TEXT UNIQUE NOT NULL,
  supplier_id INTEGER NOT NULL,
  po_id INTEGER,
  advance_date INTEGER NOT NULL,
  amount REAL NOT NULL,
  payment_method TEXT,
  reference TEXT,
  notes TEXT,
  applied_amount REAL DEFAULT 0,
  remaining_amount REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','partial','refunded','voided')),
  created_at INTEGER DEFAULT (strftime('%s','now')),
  created_by TEXT,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id)
);
CREATE INDEX IF NOT EXISTS idx_advance_supplier ON advance_purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_advance_status ON advance_purchases(status);
`;

function nowSec() { return Math.floor(Date.now() / 1000); }
function safeJson(s) { try { return JSON.parse(s); } catch { return s; } }

function nextDocNo(db, table, prefix, dateCol = 'created_at') {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const last = db.prepare(`SELECT doc_no FROM ${table} WHERE doc_no LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(`${prefix}-${ym}-%`);
  let seq = 1;
  if (last) seq = parseInt(last.doc_no.split('-').pop(), 10) + 1;
  return `${prefix}-${ym}-${String(seq).padStart(4, '0')}`;
}

// ============================================================
// PURCHASE RETURN HELPERS
// ============================================================
function reverseStockForReturn(db, returnId) {
  const items = db.prepare(`SELECT * FROM pr_return_items WHERE return_id = ?`).all(returnId);
  const results = [];
  for (const it of items) {
    try {
      // Decrease audit_warehouse.current_stock (since goods returned to supplier)
      const wh = db.prepare(`SELECT current_stock FROM audit_warehouse WHERE sku = ?`).get(it.sku);
      if (!wh) {
        results.push({ sku: it.sku, status: 'sku_not_in_warehouse' });
        continue;
      }
      const newStock = (wh.current_stock || 0) - it.qty;
      // reconciled: write real column stock (current_stock is a generated alias)
      db.prepare(`UPDATE audit_warehouse SET stock = ?, updated_at = ? WHERE sku = ?`)
        .run(newStock, nowSec(), it.sku);
      // Log to pos_events for audit trail
      try {
        db.prepare(`INSERT INTO pos_events (event_type, event_subtype, payload, actor, severity, created_at) VALUES (?,?,?,?,?,?)`)
          .run('stock_return',
            'purchase_return',
            JSON.stringify({ return_id: returnId, sku: it.sku, qty_returned: it.qty, unit: it.unit, new_stock: newStock }),
            'procurement', 'info', nowSec());
      } catch {}
      results.push({ sku: it.sku, status: 'ok', qty_returned: it.qty, new_stock: newStock });
    } catch (e) {
      results.push({ sku: it.sku, status: 'error', error: e.message });
    }
  }
  return results;
}

// ============================================================
// INVOICE AGING CALCULATION
// ============================================================
function calcInvoiceAging(db, asOfTs = null) {
  const asOf = asOfTs || nowSec();
  // Pull purchase_invoices that aren't fully paid
  // Strategy: invoice.outstanding = invoice.total - sum(payments_to_this_invoice)
  // If procurement-backend has different schema, adjust column names below
  let invoices;
  try {
    invoices = db.prepare(`
      SELECT i.id, i.invoice_number AS doc_no, i.invoice_date, i.due_date, i.total, i.supplier_id, i.status,
             s.name AS supplier_name,
             COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id = i.id), 0) AS paid
      FROM purchase_invoices i
      LEFT JOIN suppliers s ON s.id = i.supplier_id
      WHERE i.status != 'voided'
    `).all();
  } catch (e) {
    // schema may differ — soft fail with empty array
    return { error: e.message, hint: 'Expected purchase_invoices + payments tables from procurement-backend.js. Adjust column names if your schema differs.' };
  }

  const buckets = { current: [], b1: [], b2: [], b3: [], b4: [] };
  const summary = { current: 0, b1: 0, b2: 0, b3: 0, b4: 0, total_outstanding: 0 };
  const labels = {
    current: 'Belum jatuh tempo',
    b1: '0-30 hari overdue',
    b2: '31-60 hari overdue',
    b3: '61-90 hari overdue',
    b4: '90+ hari overdue (kritis)'
  };

  for (const inv of invoices) {
    const outstanding = (inv.total || 0) - (inv.paid || 0);
    if (outstanding <= 0.01) continue;  // paid

    const dueDate = inv.due_date || (inv.invoice_date ? (inv.invoice_date + 30 * 86400) : asOf);
    const daysOverdue = Math.floor((asOf - dueDate) / 86400);

    let bucket;
    if (daysOverdue <= 0) bucket = 'current';
    else if (daysOverdue <= 30) bucket = 'b1';
    else if (daysOverdue <= 60) bucket = 'b2';
    else if (daysOverdue <= 90) bucket = 'b3';
    else bucket = 'b4';

    buckets[bucket].push({
      ...inv,
      outstanding,
      days_overdue: Math.max(0, daysOverdue)
    });
    summary[bucket] += outstanding;
    summary.total_outstanding += outstanding;
  }

  // Per-supplier breakdown
  const bySupplier = {};
  for (const bucketKey of Object.keys(buckets)) {
    for (const inv of buckets[bucketKey]) {
      if (!bySupplier[inv.supplier_id]) {
        bySupplier[inv.supplier_id] = { id: inv.supplier_id, name: inv.supplier_name, current:0, b1:0, b2:0, b3:0, b4:0, total: 0 };
      }
      bySupplier[inv.supplier_id][bucketKey] += inv.outstanding;
      bySupplier[inv.supplier_id].total += inv.outstanding;
    }
  }

  return {
    as_of: asOf,
    summary,
    labels,
    buckets,
    by_supplier: Object.values(bySupplier).sort((a,b) => b.total - a.total)
  };
}

// ============================================================
// PR QTY SUGGESTION
// ============================================================
function suggestPRQty(db, opts = {}) {
  // Analyze consumption rate per SKU over last N days, then suggest order qty for next N days
  const lookbackDays = opts.lookback_days || 14;
  const forecastDays = opts.forecast_days || 14;
  const safetyDays = opts.safety_days || 7;
  const fromTs = nowSec() - lookbackDays * 86400;

  // Get consumption per SKU
  const events = db.prepare(`
    SELECT payload FROM pos_events
    WHERE event_type = 'stock_consumption' AND created_at >= ?
  `).all(fromTs);

  const consumed = {};
  for (const ev of events) {
    const p = safeJson(ev.payload);
    if (!p || !p.sku || !p.deducted) continue;
    if (!consumed[p.sku]) consumed[p.sku] = { sku: p.sku, total: 0, unit: p.unit };
    consumed[p.sku].total += p.deducted;
  }

  // Get current warehouse state
  let warehouse;
  try {
    warehouse = db.prepare(`SELECT sku, name, current_stock, unit, reorder_point, reorder_qty FROM audit_warehouse`).all();
  } catch {
    try {
      warehouse = db.prepare(`SELECT sku, name, current_stock, unit FROM audit_warehouse`).all();
    } catch { warehouse = []; }
  }

  const suggestions = [];
  for (const w of warehouse) {
    const c = consumed[w.sku] || { total: 0 };
    const avgDaily = c.total / lookbackDays;
    const forecastUsage = avgDaily * (forecastDays + safetyDays);
    const reorderPoint = w.reorder_point !== undefined ? w.reorder_point : (avgDaily * safetyDays);
    const stockAfter = (w.current_stock || 0) - (avgDaily * forecastDays);

    let suggestedQty = 0;
    let urgency = 'low';
    if (stockAfter < 0) {
      suggestedQty = Math.ceil(forecastUsage - (w.current_stock || 0));
      urgency = 'high';
    } else if ((w.current_stock || 0) < reorderPoint) {
      suggestedQty = Math.ceil(forecastUsage - (w.current_stock || 0));
      urgency = 'medium';
    } else if (avgDaily > 0 && stockAfter < reorderPoint) {
      suggestedQty = Math.ceil(forecastUsage * 0.5);
      urgency = 'low';
    }

    suggestions.push({
      sku: w.sku,
      name: w.name,
      current_stock: w.current_stock,
      unit: w.unit,
      avg_daily_consumption: avgDaily,
      forecast_usage_for_period: forecastUsage,
      reorder_point: reorderPoint,
      stock_after_forecast: stockAfter,
      suggested_qty: suggestedQty,
      urgency,
      reasoning: avgDaily === 0 ? 'no consumption recorded' :
        urgency === 'high' ? `Akan habis sebelum ${forecastDays} hari` :
        urgency === 'medium' ? 'Stock di bawah reorder point' :
        urgency === 'low' && suggestedQty > 0 ? 'Akan reach reorder point' :
        'Stock cukup'
    });
  }

  return {
    parameters: { lookback_days: lookbackDays, forecast_days: forecastDays, safety_days: safetyDays },
    suggestions: suggestions.sort((a,b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.urgency] - order[b.urgency];
    })
  };
}

// ============================================================
// MAIN SETUP
// ============================================================
function setupProcurementGaps(app, opts = {}) {
  const db = new Database(opts.dbPath || DEFAULT_DB);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);

  const router = express.Router();
  router.use(express.json());

  // ========== PURCHASE RETURNS ==========
  router.get('/returns', (req, res) => {
    const { status, supplier_id, from, to } = req.query;
    let sql = `
      SELECT r.*, s.name AS supplier_name,
        (SELECT COUNT(*) FROM pr_return_items WHERE return_id = r.id) AS item_count
      FROM purchase_returns r
      LEFT JOIN suppliers s ON s.id = r.supplier_id
      WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ' AND r.status = ?'; params.push(status); }
    if (supplier_id) { sql += ' AND r.supplier_id = ?'; params.push(supplier_id); }
    if (from) { sql += ' AND r.return_date >= ?'; params.push(Number(from)); }
    if (to) { sql += ' AND r.return_date <= ?'; params.push(Number(to)); }
    sql += ' ORDER BY r.return_date DESC, r.id DESC';
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/returns/:id', (req, res) => {
    const ret = db.prepare(`
      SELECT r.*, s.name AS supplier_name
      FROM purchase_returns r LEFT JOIN suppliers s ON s.id = r.supplier_id
      WHERE r.id = ?
    `).get(req.params.id);
    if (!ret) return res.status(404).json({ error: 'not found' });
    ret.items = db.prepare(`SELECT * FROM pr_return_items WHERE return_id = ?`).all(req.params.id);
    res.json(ret);
  });

  router.post('/returns', (req, res) => {
    const b = req.body || {};
    if (!b.gr_id || !b.supplier_id || !b.reason || !Array.isArray(b.items) || b.items.length === 0) {
      return res.status(400).json({ error: 'gr_id, supplier_id, reason, items[] required' });
    }
    const docNo = nextDocNo(db, 'purchase_returns', 'PR-RTN');
    const totalValue = b.items.reduce((s, it) => s + (it.qty * (it.unit_price || 0)), 0);
    try {
      const tx = db.transaction(() => {
        const info = db.prepare(`
          INSERT INTO purchase_returns
            (doc_no, gr_id, supplier_id, return_date, reason, notes, total_value, status, created_by)
          VALUES (?,?,?,?,?,?,?,?,?)
        `).run(
          docNo, b.gr_id, b.supplier_id, b.return_date || nowSec(),
          b.reason, b.notes || null, totalValue, 'draft', b.created_by || 'admin'
        );
        const returnId = info.lastInsertRowid;
        const itemStmt = db.prepare(`INSERT INTO pr_return_items (return_id, sku, name, qty, unit, unit_price, line_total, item_reason) VALUES (?,?,?,?,?,?,?,?)`);
        for (const it of b.items) {
          itemStmt.run(returnId, it.sku, it.name || null, it.qty, it.unit || null,
            it.unit_price || 0, it.qty * (it.unit_price || 0), it.item_reason || null);
        }
        return returnId;
      });
      const id = tx();
      res.json({ ok: true, id, doc_no: docNo });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/returns/:id/finalize', (req, res) => {
    const { finalized_by, credit_note_ref, refund_method } = req.body || {};
    if (!finalized_by) return res.status(400).json({ error: 'finalized_by required' });

    const ret = db.prepare(`SELECT * FROM purchase_returns WHERE id = ?`).get(req.params.id);
    if (!ret) return res.status(404).json({ error: 'not found' });
    if (ret.status !== 'draft') return res.status(409).json({ error: `status is ${ret.status}, only draft can be finalized` });

    const tx = db.transaction(() => {
      db.prepare(`UPDATE purchase_returns SET status='finalized', finalized_at=?, finalized_by=?, credit_note_ref=?, refund_method=? WHERE id=?`)
        .run(nowSec(), finalized_by, credit_note_ref || null, refund_method || null, req.params.id);
      const stockResults = reverseStockForReturn(db, Number(req.params.id));
      return stockResults;
    });
    const stockResults = tx();
    res.json({ ok: true, stock_adjustments: stockResults });
  });

  router.post('/returns/:id/void', (req, res) => {
    const { reason, voided_by } = req.body || {};
    if (!reason || !voided_by) return res.status(400).json({ error: 'reason, voided_by required' });
    const ret = db.prepare(`SELECT status FROM purchase_returns WHERE id = ?`).get(req.params.id);
    if (!ret) return res.status(404).json({ error: 'not found' });
    if (ret.status === 'finalized') return res.status(409).json({ error: 'cannot void finalized return — create a reversal entry instead' });
    db.prepare(`UPDATE purchase_returns SET status='voided', voided_at=?, voided_by=?, voided_reason=? WHERE id=?`)
      .run(nowSec(), voided_by, reason, req.params.id);
    res.json({ ok: true });
  });

  // ========== INVOICE AGING ==========
  router.get('/invoice-aging', (req, res) => {
    const asOf = req.query.as_of ? Number(req.query.as_of) : null;
    res.json(calcInvoiceAging(db, asOf));
  });

  router.get('/invoice-aging/supplier/:id', (req, res) => {
    const aging = calcInvoiceAging(db);
    const supplier = aging.by_supplier.find(s => String(s.id) === req.params.id);
    if (!supplier) return res.status(404).json({ error: 'no outstanding for supplier' });

    const supplierInvoices = [];
    for (const bucketKey of Object.keys(aging.buckets)) {
      for (const inv of aging.buckets[bucketKey]) {
        if (String(inv.supplier_id) === req.params.id) {
          supplierInvoices.push({ ...inv, bucket: bucketKey });
        }
      }
    }
    res.json({ supplier, invoices: supplierInvoices });
  });

  // ========== PR QTY SUGGESTION ==========
  router.get('/pr-suggest', (req, res) => {
    res.json(suggestPRQty(db, {
      lookback_days: req.query.lookback_days ? Number(req.query.lookback_days) : 14,
      forecast_days: req.query.forecast_days ? Number(req.query.forecast_days) : 14,
      safety_days: req.query.safety_days ? Number(req.query.safety_days) : 7
    }));
  });

  // Generate draft PR from suggestion (urgent items only)
  router.post('/pr-suggest/generate-draft', (req, res) => {
    const { urgency_filter = ['high','medium'], supplier_id, created_by = 'system' } = req.body || {};
    const suggestion = suggestPRQty(db, req.body || {});
    const items = suggestion.suggestions
      .filter(s => urgency_filter.includes(s.urgency) && s.suggested_qty > 0)
      .map(s => ({ sku: s.sku, name: s.name, qty: s.suggested_qty, unit: s.unit, notes: s.reasoning }));

    if (items.length === 0) {
      return res.json({ ok: true, items_count: 0, message: 'No urgent items to suggest' });
    }
    // Try to create a draft PR via existing procurement-backend endpoint
    // (we return the suggestion + items shape ready for /api/procurement/pr POST)
    res.json({
      ok: true,
      hint: 'POST this shape to /api/procurement/pr to create draft',
      draft_pr: {
        supplier_id: supplier_id || null,
        notes: `Auto-generated from PR Qty Suggestion at ${new Date().toISOString()}`,
        items
      },
      items_count: items.length,
      suggestion_summary: suggestion.parameters
    });
  });

  // ========== ADVANCE PURCHASE ==========
  router.get('/advances', (req, res) => {
    const { supplier_id, status } = req.query;
    let sql = `
      SELECT a.*, s.name AS supplier_name, po.po_number AS po_doc_no
      FROM advance_purchases a
      LEFT JOIN suppliers s ON s.id = a.supplier_id
      LEFT JOIN purchase_orders po ON po.id = a.po_id
      WHERE 1=1
    `;
    const params = [];
    if (supplier_id) { sql += ' AND a.supplier_id = ?'; params.push(supplier_id); }
    if (status) { sql += ' AND a.status = ?'; params.push(status); }
    sql += ' ORDER BY a.advance_date DESC';
    res.json(db.prepare(sql).all(...params));
  });

  router.post('/advances', (req, res) => {
    const b = req.body || {};
    if (!b.supplier_id || !b.amount) return res.status(400).json({ error: 'supplier_id, amount required' });
    const docNo = nextDocNo(db, 'advance_purchases', 'ADV');
    try {
      const info = db.prepare(`
        INSERT INTO advance_purchases (doc_no, supplier_id, po_id, advance_date, amount, payment_method, reference, notes, remaining_amount, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run(docNo, b.supplier_id, b.po_id || null, b.advance_date || nowSec(),
        b.amount, b.payment_method || null, b.reference || null, b.notes || null,
        b.amount, b.created_by || 'admin');
      res.json({ ok: true, id: info.lastInsertRowid, doc_no: docNo });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/advances/:id/apply', (req, res) => {
    const { amount, invoice_id, applied_by } = req.body || {};
    if (!amount || !invoice_id || !applied_by) return res.status(400).json({ error: 'amount, invoice_id, applied_by required' });
    const adv = db.prepare(`SELECT * FROM advance_purchases WHERE id = ?`).get(req.params.id);
    if (!adv) return res.status(404).json({ error: 'not found' });
    if (adv.status === 'voided' || adv.status === 'applied') return res.status(409).json({ error: `status is ${adv.status}` });
    if (amount > adv.remaining_amount + 0.01) return res.status(400).json({ error: `amount ${amount} > remaining ${adv.remaining_amount}` });

    const newApplied = adv.applied_amount + amount;
    const newRemaining = adv.amount - newApplied;
    const newStatus = newRemaining < 0.01 ? 'applied' : 'partial';

    db.prepare(`UPDATE advance_purchases SET applied_amount=?, remaining_amount=?, status=? WHERE id=?`)
      .run(newApplied, newRemaining, newStatus, req.params.id);

    res.json({ ok: true, applied_amount: newApplied, remaining_amount: newRemaining, status: newStatus });
  });

  router.post('/advances/:id/refund', (req, res) => {
    const { refunded_by, reason } = req.body || {};
    if (!refunded_by) return res.status(400).json({ error: 'refunded_by required' });
    const adv = db.prepare(`SELECT remaining_amount, status FROM advance_purchases WHERE id = ?`).get(req.params.id);
    if (!adv) return res.status(404).json({ error: 'not found' });
    if (adv.remaining_amount <= 0) return res.status(409).json({ error: 'no remaining amount to refund' });
    db.prepare(`UPDATE advance_purchases SET status='refunded' WHERE id=?`).run(req.params.id);
    res.json({ ok: true, refunded_amount: adv.remaining_amount });
  });

  // ========== DASHBOARD ==========
  router.get('/wave2-dashboard', (req, res) => {
    const aging = calcInvoiceAging(db);
    const recentReturns = db.prepare(`
      SELECT r.*, s.name AS supplier_name FROM purchase_returns r
      LEFT JOIN suppliers s ON s.id = r.supplier_id
      ORDER BY r.created_at DESC LIMIT 10
    `).all();
    const pendingAdvances = db.prepare(`
      SELECT a.*, s.name AS supplier_name FROM advance_purchases a
      LEFT JOIN suppliers s ON s.id = a.supplier_id
      WHERE a.status IN ('pending','partial') ORDER BY a.advance_date DESC LIMIT 10
    `).all();
    const urgentSuggestions = suggestPRQty(db).suggestions
      .filter(s => s.urgency === 'high').slice(0, 10);

    res.json({
      aging_summary: aging.summary,
      aging_labels: aging.labels,
      recent_returns: recentReturns,
      pending_advances: pendingAdvances,
      urgent_pr_suggestions: urgentSuggestions
    });
  });

  // PATCH/DELETE for purchase_returns (only while draft) — items cascade via FK
  router.patch('/returns/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM purchase_returns WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    if (row.status !== 'draft') {
      return res.status(403).json({ error: `status ${row.status} — hanya draft yang bisa diubah` });
    }
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['reason', 'notes', 'return_date', 'credit_note_ref', 'refund_method']) {
      if (b[k] !== undefined) {
        if (k === 'reason' && !['damaged', 'wrong_item', 'expired', 'quality_issue', 'overstock', 'other'].includes(b[k])) continue;
        fields.push(`${k} = ?`);
        args.push(b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE purchase_returns SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/returns/:id', (req, res) => {
    const row = db.prepare(`SELECT status FROM purchase_returns WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    if (row.status === 'finalized') {
      return res.status(403).json({ error: 'return sudah finalized — tidak bisa dihapus' });
    }
    db.transaction(() => {
      db.prepare(`DELETE FROM pr_return_items WHERE return_id = ?`).run(req.params.id);
      db.prepare(`DELETE FROM purchase_returns WHERE id = ?`).run(req.params.id);
    })();
    res.json({ ok: true });
  });

  // PATCH/DELETE for advance_purchases (only while pending — applied/refunded locked)
  router.patch('/advances/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM advance_purchases WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    if (row.status !== 'pending') {
      return res.status(403).json({ error: `status ${row.status} — hanya pending yang bisa diubah` });
    }
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['amount', 'payment_method', 'reference', 'notes', 'advance_date', 'po_id']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    // if amount changed, remaining_amount must also update
    if (b.amount !== undefined) {
      fields.push(`remaining_amount = ?`);
      args.push(Number(b.amount) - (row.applied_amount || 0));
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE advance_purchases SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/advances/:id', (req, res) => {
    const row = db.prepare(`SELECT status, applied_amount FROM advance_purchases WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    if (row.status === 'applied' || row.status === 'partial' || (row.applied_amount || 0) > 0) {
      return res.status(403).json({ error: 'advance sudah di-apply — tidak bisa dihapus' });
    }
    const info = db.prepare(`DELETE FROM advance_purchases WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/procurement';
  app.use(mountPath, router);

  console.log(`[procurement-gaps] mounted at ${mountPath}`);
  console.log(`[procurement-gaps] returns, advances, invoice-aging, pr-suggest`);

  return {
    router, db,
    calcInvoiceAging: (asOf) => calcInvoiceAging(db, asOf),
    suggestPRQty: (opts) => suggestPRQty(db, opts),
    reverseStockForReturn: (id) => reverseStockForReturn(db, id)
  };
}

module.exports = { setupProcurementGaps, SCHEMA_SQL };
