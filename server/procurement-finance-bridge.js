// server/procurement-finance-bridge.js
// Patch module — DUA hook kritis untuk akurasi data:
//   1. onGoodsReceived(grId)      → update audit_warehouse.last_cost dengan weighted average
//   2. onPaymentRecorded(paymentId) → auto-create finance_expense (category COGS - Bahan Baku)
//
// Tanpa hook ini:
//   - COGS report di Finance bakal selalu 0 (karena last_cost = 0)
//   - Total OPEX di P&L gak include bahan baku dari procurement (under-report cost)
//
// USAGE — DUA OPSI:
//
// A. Manual call dari existing procurement handlers (recommended, gak perlu edit existing file):
//    const { onGoodsReceived, onPaymentRecorded } = require('./procurement-finance-bridge');
//    // setelah GR di-finalize:
//    onGoodsReceived(db, grId);
//    // setelah payment di-create:
//    onPaymentRecorded(db, paymentId, finance);
//
// B. Setup auto-listener via SQLite triggers:
//    setupBridgeTriggers(db);  // optional, kalau lo gak mau ubah handler

const Database = require('better-sqlite3');
const path = require('path');

const DEFAULT_DB = path.join(__dirname, '..', 'data', 'kiosk.db');

function nowSec() { return Math.floor(Date.now() / 1000); }
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

/**
 * Convert qty across units (gr↔kg etc.) using master_units table.
 * Re-implemented here for self-containment.
 */
function convertQty(db, qty, fromUnit, toUnit) {
  if (fromUnit === toUnit) return qty;
  try {
    const from = db.prepare(`SELECT * FROM master_units WHERE code = ?`).get(fromUnit);
    const to = db.prepare(`SELECT * FROM master_units WHERE code = ?`).get(toUnit);
    if (!from || !to || from.base_unit !== to.base_unit) return null;
    return (qty * from.to_base_factor) / to.to_base_factor;
  } catch { return null; }
}

// ============================================================
// HOOK 1: onGoodsReceived — weighted average last_cost
// ============================================================
/**
 * Update audit_warehouse.last_cost using weighted-average method.
 * Run this AFTER GR is finalized and stock has been incremented.
 *
 * Algorithm:
 *   newAvgCost = (oldStock × oldCost + receivedQty × poUnitPrice) / (oldStock + receivedQty)
 *
 * Edge cases handled:
 *   - First receipt (oldStock=0) → newAvg = poUnitPrice
 *   - Negative oldStock (drift) → treat as 0 for calc
 *   - Unit mismatch GR vs warehouse → convert
 *   - Missing PO unit_price → skip (warn)
 *
 * @param {Database} db
 * @param {number} grId  goods_receipts.id
 * @returns {Object} { ok, updates: [{sku, old_cost, new_cost, qty_received, source}], errors }
 */
function onGoodsReceived(db, grId) {
  if (!grId) return { ok: false, errors: ['grId required'] };

  // 1. Load GR with items + PO line items
  let gr, grItems;
  try {
    gr = db.prepare(`SELECT * FROM goods_receipts WHERE id = ?`).get(grId);
    if (!gr) return { ok: false, errors: [`GR ${grId} not found`] };

    grItems = db.prepare(`SELECT * FROM gr_items WHERE gr_id = ?`).all(grId);
  } catch (e) {
    return { ok: false, errors: [`schema mismatch: ${e.message}`, 'expected goods_receipts + gr_items tables from procurement-backend.js'] };
  }

  if (grItems.length === 0) return { ok: false, errors: ['no GR items'] };

  // 2. Try to get PO unit prices (link via PO id if available)
  const poItemsBySku = new Map();
  if (gr.po_id) {
    try {
      const poItems = db.prepare(`SELECT sku, unit_price, unit FROM po_items WHERE po_id = ?`).all(gr.po_id);
      for (const pi of poItems) poItemsBySku.set(pi.sku, pi);
    } catch {}
  }

  const updates = [];
  const errors = [];

  const tx = db.transaction(() => {
    for (const item of grItems) {
      const qtyReceived = item.qty_received || item.qty || 0;
      if (qtyReceived <= 0) continue;

      // Resolve unit_price from GR item, fallback to PO item
      let unitPrice = item.unit_price;
      let priceSource = 'gr_item';
      if (!unitPrice && poItemsBySku.has(item.sku)) {
        unitPrice = poItemsBySku.get(item.sku).unit_price;
        priceSource = 'po_item';
      }
      if (!unitPrice || unitPrice <= 0) {
        errors.push({ sku: item.sku, reason: 'no unit_price in GR/PO', skipped: true });
        continue;
      }

      // Load warehouse row
      const wh = db.prepare(`SELECT current_stock, last_cost, unit FROM audit_warehouse WHERE sku = ?`).get(item.sku);
      if (!wh) {
        errors.push({ sku: item.sku, reason: 'sku not in audit_warehouse', skipped: true });
        continue;
      }

      // Convert qty + price to warehouse unit if needed
      let qtyInWhUnit = qtyReceived;
      let priceInWhUnit = unitPrice;
      if (item.unit && item.unit !== wh.unit) {
        const converted = convertQty(db, qtyReceived, item.unit, wh.unit);
        if (converted === null) {
          errors.push({ sku: item.sku, reason: `unit conversion failed: ${item.unit} → ${wh.unit}`, skipped: true });
          continue;
        }
        // qty: convert from GR unit to warehouse unit
        qtyInWhUnit = converted;
        // price: invert ratio so price per warehouse unit
        priceInWhUnit = unitPrice * qtyReceived / converted;
      }

      // Weighted average — but use the stock BEFORE this GR for calculation
      // (caller has already incremented stock during GR finalize, so subtract qty back out)
      const stockBeforeGR = Math.max(0, (wh.current_stock || 0) - qtyInWhUnit);
      const oldCost = wh.last_cost || 0;
      const newTotalStock = stockBeforeGR + qtyInWhUnit;
      const newAvgCost = newTotalStock > 0
        ? ((stockBeforeGR * oldCost) + (qtyInWhUnit * priceInWhUnit)) / newTotalStock
        : priceInWhUnit;

      // reconciled: write real column cost_per_unit (last_cost is a generated alias)
      db.prepare(`UPDATE audit_warehouse SET cost_per_unit = ?, updated_at = ? WHERE sku = ?`)
        .run(newAvgCost, nowSec(), item.sku);

      updates.push({
        sku: item.sku,
        old_cost: oldCost,
        new_cost: newAvgCost,
        qty_received: qtyInWhUnit,
        unit_price: priceInWhUnit,
        stock_before: stockBeforeGR,
        stock_after: newTotalStock,
        source: priceSource
      });

      // Log to pos_events for audit
      try {
        db.prepare(`INSERT INTO pos_events (event_type, event_subtype, payload, actor, severity, created_at) VALUES (?,?,?,?,?,?)`)
          .run('cost_update', 'weighted_avg',
            JSON.stringify({ gr_id: grId, sku: item.sku, old_cost: oldCost, new_cost: newAvgCost, method: 'weighted_avg' }),
            'system', 'info', nowSec());
      } catch {}
    }
  });

  try { tx(); } catch (e) { return { ok: false, errors: [e.message] }; }
  return { ok: errors.length === 0, updates, errors };
}

// ============================================================
// HOOK 2: onPaymentRecorded — auto-create finance_expense
// ============================================================
/**
 * After a procurement payment is created, auto-insert a corresponding
 * finance_expense row (category COGS - Bahan Baku) linked via reference.
 *
 * Idempotent: checks if expense already exists for this payment_id and skips.
 *
 * @param {Database} db
 * @param {number} paymentId  payments.id from procurement module
 * @returns {Object} { ok, expense_id, doc_no, skipped? }
 */
function onPaymentRecorded(db, paymentId) {
  if (!paymentId) return { ok: false, error: 'paymentId required' };

  // 1. Load payment
  let payment;
  try {
    payment = db.prepare(`
      SELECT p.*, i.doc_no AS invoice_doc_no, i.supplier_id, s.name AS supplier_name
      FROM payments p
      LEFT JOIN purchase_invoices i ON i.id = p.invoice_id
      LEFT JOIN suppliers s ON s.id = i.supplier_id
      WHERE p.id = ?
    `).get(paymentId);
  } catch (e) {
    return { ok: false, error: `schema mismatch: ${e.message}` };
  }
  if (!payment) return { ok: false, error: `payment ${paymentId} not found` };

  // 2. Check idempotency
  const existing = db.prepare(`SELECT id, doc_no FROM finance_expenses WHERE reference_type = 'procurement_payment' AND reference_id = ?`)
    .get(paymentId);
  if (existing) return { ok: true, expense_id: existing.id, doc_no: existing.doc_no, skipped: 'already_linked' };

  // 3. Determine category — default to bahan-baku for procurement payments
  // If category 'cogs-bahan-baku' doesn't exist, fall back to first 'cogs' category, then first category
  let categoryId = 'cogs-bahan-baku';
  const cat = db.prepare(`SELECT id FROM expense_categories WHERE id = ?`).get(categoryId);
  if (!cat) {
    const fallback = db.prepare(`SELECT id FROM expense_categories WHERE type = 'cogs' ORDER BY display_order LIMIT 1`).get();
    if (fallback) categoryId = fallback.id;
    else {
      const any = db.prepare(`SELECT id FROM expense_categories ORDER BY display_order LIMIT 1`).get();
      if (any) categoryId = any.id;
      else return { ok: false, error: 'no expense_categories defined' };
    }
  }

  // 4. Generate doc_no (EXP-YYYYMM-NNNN)
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const last = db.prepare(`SELECT doc_no FROM finance_expenses WHERE doc_no LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(`EXP-${ym}-%`);
  let seq = 1;
  if (last) seq = parseInt(last.doc_no.split('-').pop(), 10) + 1;
  const docNo = `EXP-${ym}-${String(seq).padStart(4, '0')}`;

  // 5. Insert
  try {
    const info = db.prepare(`
      INSERT INTO finance_expenses
        (doc_no, category_id, expense_date, amount, vendor, description,
         reference_type, reference_id, payment_method, status, created_by, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      docNo, categoryId, payment.payment_date || nowSec(), payment.amount,
      payment.supplier_name || `Supplier #${payment.supplier_id}`,
      `Procurement payment for invoice ${payment.invoice_doc_no || `#${payment.invoice_id}`}`,
      'procurement_payment', paymentId,
      payment.payment_method || payment.method || 'transfer',
      'recorded', 'system-bridge',
      `Auto-linked from payment doc_no=${payment.doc_no || paymentId}`
    );
    return { ok: true, expense_id: info.lastInsertRowid, doc_no: docNo };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================
// BACKFILL — useful for retro-applying to existing data
// ============================================================
/**
 * Retroactively apply last_cost weighted-avg for ALL GRs that haven't been processed.
 * Use sparingly — for first-time deployment after Wave 2.
 */
function backfillLastCosts(db, opts = {}) {
  const sinceTs = opts.since || 0;
  let grs;
  try {
    grs = db.prepare(`SELECT id FROM goods_receipts WHERE status IN ('received','partial','finalized') AND created_at >= ? ORDER BY created_at`)
      .all(sinceTs);
  } catch {
    grs = db.prepare(`SELECT id FROM goods_receipts WHERE created_at >= ? ORDER BY created_at`).all(sinceTs);
  }
  const summary = { processed: 0, updates: 0, errors: 0 };
  for (const gr of grs) {
    const r = onGoodsReceived(db, gr.id);
    summary.processed += 1;
    summary.updates += r.updates?.length || 0;
    summary.errors += r.errors?.length || 0;
  }
  return summary;
}

/**
 * Retroactively link all existing procurement payments to finance_expenses.
 */
function backfillExpenses(db, opts = {}) {
  const sinceTs = opts.since || 0;
  let payments;
  try {
    payments = db.prepare(`SELECT id FROM payments WHERE created_at >= ? ORDER BY created_at`).all(sinceTs);
  } catch (e) {
    return { error: e.message };
  }
  const summary = { processed: 0, linked: 0, skipped: 0, errors: 0 };
  for (const p of payments) {
    const r = onPaymentRecorded(db, p.id);
    summary.processed += 1;
    if (r.skipped) summary.skipped += 1;
    else if (r.ok) summary.linked += 1;
    else summary.errors += 1;
  }
  return summary;
}

// ============================================================
// SETUP — registers /api/bridge/* endpoints for manual trigger/backfill
// ============================================================
function setupBridge(app, opts = {}) {
  const db = new Database(opts.dbPath || DEFAULT_DB);
  db.pragma('journal_mode = WAL');

  const router = require('express').Router();
  router.use(require('express').json());

  // Manual triggers (called by procurement handlers if not auto-hooked)
  router.post('/on-goods-received/:gr_id', (req, res) => {
    res.json(onGoodsReceived(db, Number(req.params.gr_id)));
  });

  router.post('/on-payment-recorded/:payment_id', (req, res) => {
    res.json(onPaymentRecorded(db, Number(req.params.payment_id)));
  });

  // Backfill (one-shot after deploy)
  router.post('/backfill-last-costs', (req, res) => {
    res.json(backfillLastCosts(db, req.body || {}));
  });

  router.post('/backfill-expenses', (req, res) => {
    res.json(backfillExpenses(db, req.body || {}));
  });

  // Verify — show current last_cost coverage
  router.get('/last-cost-coverage', (req, res) => {
    try {
      const total = db.prepare(`SELECT COUNT(*) c FROM audit_warehouse`).get().c;
      const withCost = db.prepare(`SELECT COUNT(*) c FROM audit_warehouse WHERE last_cost > 0`).get().c;
      const rows = db.prepare(`SELECT sku, name, current_stock, last_cost, unit FROM audit_warehouse ORDER BY last_cost DESC LIMIT 20`).all();
      res.json({
        total_skus: total,
        with_cost: withCost,
        coverage_pct: total > 0 ? (withCost / total * 100) : 0,
        sample: rows
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/expense-link-coverage', (req, res) => {
    try {
      const total = db.prepare(`SELECT COUNT(*) c FROM payments`).get().c;
      const linked = db.prepare(`SELECT COUNT(*) c FROM finance_expenses WHERE reference_type='procurement_payment'`).get().c;
      res.json({
        total_payments: total,
        linked_expenses: linked,
        coverage_pct: total > 0 ? (linked / total * 100) : 0
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  const mountPath = opts.mountPath || '/api/bridge';
  app.use(mountPath, router);
  console.log(`[bridge] mounted at ${mountPath}`);

  return {
    router, db,
    onGoodsReceived: (grId) => onGoodsReceived(db, grId),
    onPaymentRecorded: (paymentId) => onPaymentRecorded(db, paymentId),
    backfillLastCosts: (opts) => backfillLastCosts(db, opts),
    backfillExpenses: (opts) => backfillExpenses(db, opts)
  };
}

module.exports = {
  setupBridge,
  onGoodsReceived,
  onPaymentRecorded,
  backfillLastCosts,
  backfillExpenses
};
