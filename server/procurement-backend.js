// server/procurement-backend.js
// Procurement module: Suppliers → PR → PO → GR → Invoice → Payment
// Integrates with audit_warehouse (stock auto-update on GR) and finance/expenses (on Payment).
// Ref pattern: ESB Core P2P flow, simplified for kiosk scale.

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const DEFAULT_DB = path.join(__dirname, '..', 'data', 'kiosk.db');

// ============================================================
// SCHEMA
// ============================================================
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_id TEXT,
  payment_terms INTEGER DEFAULT 30,
  bank_name TEXT,
  bank_account TEXT,
  bank_holder TEXT,
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS purchase_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_number TEXT UNIQUE NOT NULL,
  requested_by TEXT NOT NULL,
  department TEXT,
  request_date INTEGER NOT NULL,
  needed_date INTEGER,
  priority TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'draft',
  notes TEXT,
  approved_by TEXT,
  approved_at INTEGER,
  rejected_reason TEXT,
  total_estimated REAL DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS pr_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_id INTEGER NOT NULL,
  sku TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT,
  estimated_price REAL DEFAULT 0,
  subtotal REAL DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (pr_id) REFERENCES purchase_requests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_number TEXT UNIQUE NOT NULL,
  pr_id INTEGER,
  supplier_id INTEGER NOT NULL,
  order_date INTEGER NOT NULL,
  expected_date INTEGER,
  status TEXT DEFAULT 'draft',
  subtotal REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  total REAL DEFAULT 0,
  notes TEXT,
  created_by TEXT,
  sent_at INTEGER,
  received_at INTEGER,
  closed_at INTEGER,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY (pr_id) REFERENCES purchase_requests(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS po_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER NOT NULL,
  pr_item_id INTEGER,
  sku TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity_ordered REAL NOT NULL,
  quantity_received REAL DEFAULT 0,
  unit TEXT,
  unit_price REAL NOT NULL,
  subtotal REAL DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS goods_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gr_number TEXT UNIQUE NOT NULL,
  po_id INTEGER NOT NULL,
  supplier_id INTEGER NOT NULL,
  receipt_date INTEGER NOT NULL,
  received_by TEXT NOT NULL,
  status TEXT DEFAULT 'received',
  delivery_note TEXT,
  notes TEXT,
  has_discrepancy INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS gr_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gr_id INTEGER NOT NULL,
  po_item_id INTEGER NOT NULL,
  sku TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity_received REAL NOT NULL,
  quantity_rejected REAL DEFAULT 0,
  rejection_reason TEXT,
  unit TEXT,
  unit_price REAL,
  expiry_date INTEGER,
  batch_number TEXT,
  notes TEXT,
  FOREIGN KEY (gr_id) REFERENCES goods_receipts(id) ON DELETE CASCADE,
  FOREIGN KEY (po_item_id) REFERENCES po_items(id)
);

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  supplier_invoice_no TEXT,
  po_id INTEGER NOT NULL,
  gr_id INTEGER,
  supplier_id INTEGER NOT NULL,
  invoice_date INTEGER NOT NULL,
  due_date INTEGER NOT NULL,
  subtotal REAL NOT NULL,
  tax_amount REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  total REAL NOT NULL,
  paid_amount REAL DEFAULT 0,
  status TEXT DEFAULT 'unpaid',
  notes TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (gr_id) REFERENCES goods_receipts(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_number TEXT UNIQUE NOT NULL,
  invoice_id INTEGER NOT NULL,
  supplier_id INTEGER NOT NULL,
  payment_date INTEGER NOT NULL,
  amount REAL NOT NULL,
  method TEXT NOT NULL,
  reference TEXT,
  paid_by TEXT NOT NULL,
  finance_expense_id INTEGER,
  notes TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY (invoice_id) REFERENCES purchase_invoices(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE INDEX IF NOT EXISTS idx_pr_status ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_gr_po ON goods_receipts(po_id);
CREATE INDEX IF NOT EXISTS idx_invoice_status ON purchase_invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoice_due ON purchase_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_payment_invoice ON payments(invoice_id);
`;

// ============================================================
// HELPERS
// ============================================================
function nowSec() { return Math.floor(Date.now() / 1000); }

function genDocNumber(db, prefix, table, column) {
  const yyyymm = new Date().toISOString().slice(0,7).replace('-','');
  const pattern = `${prefix}-${yyyymm}-%`;
  const row = db.prepare(
    `SELECT ${column} AS last FROM ${table} WHERE ${column} LIKE ? ORDER BY ${column} DESC LIMIT 1`
  ).get(pattern);
  let seq = 1;
  if (row && row.last) {
    const parts = row.last.split('-');
    seq = parseInt(parts[2], 10) + 1;
  }
  return `${prefix}-${yyyymm}-${String(seq).padStart(4,'0')}`;
}

function recalcPRTotal(db, prId) {
  const row = db.prepare(`SELECT COALESCE(SUM(subtotal),0) AS total FROM pr_items WHERE pr_id = ?`).get(prId);
  db.prepare(`UPDATE purchase_requests SET total_estimated = ?, updated_at = ? WHERE id = ?`)
    .run(row.total, nowSec(), prId);
}

function recalcPOTotal(db, poId) {
  const row = db.prepare(`SELECT COALESCE(SUM(subtotal),0) AS sub FROM po_items WHERE po_id = ?`).get(poId);
  const po = db.prepare(`SELECT tax_amount, discount FROM purchase_orders WHERE id = ?`).get(poId);
  const total = row.sub + (po.tax_amount || 0) - (po.discount || 0);
  db.prepare(`UPDATE purchase_orders SET subtotal = ?, total = ?, updated_at = ? WHERE id = ?`)
    .run(row.sub, total, nowSec(), poId);
}

function updatePOReceiveStatus(db, poId) {
  // After GR, check if all qty fully received → status closed; partial → partial
  const items = db.prepare(`SELECT quantity_ordered, quantity_received FROM po_items WHERE po_id = ?`).all(poId);
  const allReceived = items.every(i => i.quantity_received >= i.quantity_ordered);
  const someReceived = items.some(i => i.quantity_received > 0);
  let status = 'sent';
  if (allReceived) status = 'received';
  else if (someReceived) status = 'partial';
  const patch = { status, updated_at: nowSec() };
  if (allReceived) patch.received_at = nowSec();
  const sets = Object.keys(patch).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE purchase_orders SET ${sets} WHERE id = ?`).run(...Object.values(patch), poId);
  return status;
}

// ============================================================
// WAREHOUSE & FINANCE BRIDGE
// audit_warehouse: assume columns (sku TEXT PK, name TEXT, current_stock REAL, unit TEXT, ...)
// pos_events: forensic audit log table from command-center
// ============================================================
function updateWarehouseStock(db, sku, deltaQty, reason, refType, refId, actor) {
  // Increment stock; create row if SKU not exists (defensive — should exist already)
  const existing = db.prepare(`SELECT current_stock FROM audit_warehouse WHERE sku = ?`).get(sku);
  if (!existing) {
    // Log warning but don't fail — let admin reconcile via Master Item
    console.warn(`[procurement] SKU not in warehouse: ${sku} — skipped stock update`);
    return { ok: false, reason: 'sku_not_in_warehouse' };
  }
  const newStock = (existing.current_stock || 0) + deltaQty;
  // reconciled: write real column stock (current_stock is a generated alias)
  db.prepare(`UPDATE audit_warehouse SET stock = ?, updated_at = ? WHERE sku = ?`)
    .run(newStock, nowSec(), sku);

  // Audit log entry (pos_events table from command-center; safe insert)
  try {
    db.prepare(`
      INSERT INTO pos_events (event_type, payload, actor, created_at)
      VALUES (?, ?, ?, ?)
    `).run(
      'stock_receipt',
      JSON.stringify({ sku, delta: deltaQty, new_stock: newStock, reason, ref_type: refType, ref_id: refId }),
      actor || 'system',
      nowSec()
    );
  } catch (e) {
    // pos_events may not exist in some environments — silent fail
  }
  return { ok: true, new_stock: newStock };
}

function createFinanceExpense(db, payment, supplier, invoice) {
  // Try insert into finance_expenses if it exists (schema from existing /api/finance/expenses)
  // Generic safe shape: { date, category, vendor, amount, method, reference, notes }
  try {
    const stmt = db.prepare(`
      INSERT INTO finance_expenses (date, category, vendor, amount, method, reference, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      payment.payment_date,
      'COGS - Bahan Baku',
      supplier.name,
      payment.amount,
      payment.method,
      payment.payment_number,
      `Payment for ${invoice.invoice_number} (PO ${invoice.po_id})`,
      nowSec()
    );
    return info.lastInsertRowid;
  } catch (e) {
    console.warn('[procurement] finance_expenses insert failed:', e.message);
    return null;
  }
}

// ============================================================
// MAIN SETUP
// ============================================================
function setupProcurement(app, opts = {}) {
  const db = new Database(opts.dbPath || DEFAULT_DB);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);

  const router = express.Router();
  router.use(express.json());

  // ========== DASHBOARD ==========
  router.get('/dashboard', (req, res) => {
    const stats = {
      pr_pending: db.prepare(`SELECT COUNT(*) c FROM purchase_requests WHERE status='submitted'`).get().c,
      pr_approved: db.prepare(`SELECT COUNT(*) c FROM purchase_requests WHERE status='approved'`).get().c,
      po_open: db.prepare(`SELECT COUNT(*) c FROM purchase_orders WHERE status IN ('sent','partial')`).get().c,
      po_value_open: db.prepare(`SELECT COALESCE(SUM(total),0) v FROM purchase_orders WHERE status IN ('sent','partial')`).get().v,
      invoices_unpaid: db.prepare(`SELECT COUNT(*) c FROM purchase_invoices WHERE status IN ('unpaid','partial')`).get().c,
      invoices_overdue: db.prepare(`SELECT COUNT(*) c FROM purchase_invoices WHERE status IN ('unpaid','partial') AND due_date < ?`).get(nowSec()).c,
      ap_outstanding: db.prepare(`SELECT COALESCE(SUM(total - paid_amount),0) v FROM purchase_invoices WHERE status IN ('unpaid','partial')`).get().v,
      suppliers_active: db.prepare(`SELECT COUNT(*) c FROM suppliers WHERE is_active=1`).get().c,
    };
    res.json(stats);
  });

  // ========== SUPPLIERS ==========
  router.get('/suppliers', (req, res) => {
    const { active, search } = req.query;
    let sql = 'SELECT * FROM suppliers WHERE 1=1';
    const params = [];
    if (active !== undefined) {
      sql += ' AND is_active = ?'; params.push(active === 'true' ? 1 : 0);
    }
    if (search) {
      sql += ' AND (name LIKE ? OR code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY name ASC';
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/suppliers/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json(row);
  });

  router.post('/suppliers', (req, res) => {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ error: 'name required' });
    const code = b.code || `SUP-${String(Date.now()).slice(-6)}`;
    try {
      const info = db.prepare(`
        INSERT INTO suppliers (code, name, contact_person, phone, email, address, tax_id,
          payment_terms, bank_name, bank_account, bank_holder, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(code, b.name, b.contact_person, b.phone, b.email, b.address, b.tax_id,
        b.payment_terms || 30, b.bank_name, b.bank_account, b.bank_holder, b.notes);
      res.json({ id: info.lastInsertRowid, code });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'code already exists' });
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/suppliers/:id', (req, res) => {
    const b = req.body || {};
    const allowed = ['name','contact_person','phone','email','address','tax_id',
      'payment_terms','bank_name','bank_account','bank_holder','is_active','notes'];
    const sets = [], params = [];
    for (const k of allowed) {
      if (b[k] !== undefined) { sets.push(`${k} = ?`); params.push(b[k]); }
    }
    if (!sets.length) return res.status(400).json({ error: 'no fields to update' });
    sets.push(`updated_at = ?`); params.push(nowSec());
    params.push(req.params.id);
    db.prepare(`UPDATE suppliers SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  });

  router.delete('/suppliers/:id', (req, res) => {
    // Soft delete — set inactive (FK references prevent hard delete anyway)
    db.prepare(`UPDATE suppliers SET is_active = 0, updated_at = ? WHERE id = ?`)
      .run(nowSec(), req.params.id);
    res.json({ ok: true });
  });

  // ========== PURCHASE REQUESTS ==========
  router.get('/pr', (req, res) => {
    const { status, limit = 50 } = req.query;
    let sql = `SELECT * FROM purchase_requests WHERE 1=1`;
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ` ORDER BY created_at DESC LIMIT ?`; params.push(parseInt(limit, 10));
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/pr/:id', (req, res) => {
    const pr = db.prepare(`SELECT * FROM purchase_requests WHERE id = ?`).get(req.params.id);
    if (!pr) return res.status(404).json({ error: 'not found' });
    pr.items = db.prepare(`SELECT * FROM pr_items WHERE pr_id = ? ORDER BY id`).all(pr.id);
    res.json(pr);
  });

  router.post('/pr', (req, res) => {
    const b = req.body || {};
    if (!b.requested_by) return res.status(400).json({ error: 'requested_by required' });
    if (!Array.isArray(b.items) || !b.items.length) return res.status(400).json({ error: 'items required' });

    const tx = db.transaction(() => {
      const pr_number = genDocNumber(db, 'PR', 'purchase_requests', 'pr_number');
      const info = db.prepare(`
        INSERT INTO purchase_requests (pr_number, requested_by, department, request_date,
          needed_date, priority, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(pr_number, b.requested_by, b.department, b.request_date || nowSec(),
        b.needed_date, b.priority || 'normal', b.status || 'draft', b.notes);
      const prId = info.lastInsertRowid;

      const itemStmt = db.prepare(`
        INSERT INTO pr_items (pr_id, sku, item_name, quantity, unit, estimated_price, subtotal, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const it of b.items) {
        const subtotal = (it.quantity || 0) * (it.estimated_price || 0);
        itemStmt.run(prId, it.sku, it.item_name, it.quantity, it.unit,
          it.estimated_price || 0, subtotal, it.notes);
      }
      recalcPRTotal(db, prId);
      return { id: prId, pr_number };
    });
    res.json(tx());
  });

  router.put('/pr/:id', (req, res) => {
    const pr = db.prepare(`SELECT status FROM purchase_requests WHERE id = ?`).get(req.params.id);
    if (!pr) return res.status(404).json({ error: 'not found' });
    if (!['draft','submitted'].includes(pr.status)) {
      return res.status(409).json({ error: `cannot edit PR in status ${pr.status}` });
    }
    const b = req.body || {};
    const allowed = ['requested_by','department','needed_date','priority','status','notes'];
    const sets = [], params = [];
    for (const k of allowed) {
      if (b[k] !== undefined) { sets.push(`${k} = ?`); params.push(b[k]); }
    }
    if (sets.length) {
      sets.push(`updated_at = ?`); params.push(nowSec());
      params.push(req.params.id);
      db.prepare(`UPDATE purchase_requests SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    }
    if (Array.isArray(b.items)) {
      db.prepare(`DELETE FROM pr_items WHERE pr_id = ?`).run(req.params.id);
      const stmt = db.prepare(`
        INSERT INTO pr_items (pr_id, sku, item_name, quantity, unit, estimated_price, subtotal, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const it of b.items) {
        stmt.run(req.params.id, it.sku, it.item_name, it.quantity, it.unit,
          it.estimated_price || 0, (it.quantity||0)*(it.estimated_price||0), it.notes);
      }
      recalcPRTotal(db, req.params.id);
    }
    res.json({ ok: true });
  });

  router.post('/pr/:id/submit', (req, res) => {
    const pr = db.prepare(`SELECT status FROM purchase_requests WHERE id = ?`).get(req.params.id);
    if (!pr) return res.status(404).json({ error: 'not found' });
    if (pr.status !== 'draft') return res.status(409).json({ error: `cannot submit from ${pr.status}` });
    db.prepare(`UPDATE purchase_requests SET status='submitted', updated_at=? WHERE id=?`)
      .run(nowSec(), req.params.id);
    res.json({ ok: true });
  });

  router.post('/pr/:id/approve', (req, res) => {
    const { approved_by } = req.body || {};
    if (!approved_by) return res.status(400).json({ error: 'approved_by required' });
    const pr = db.prepare(`SELECT status FROM purchase_requests WHERE id = ?`).get(req.params.id);
    if (!pr) return res.status(404).json({ error: 'not found' });
    if (pr.status !== 'submitted') return res.status(409).json({ error: `cannot approve from ${pr.status}` });
    db.prepare(`UPDATE purchase_requests SET status='approved', approved_by=?, approved_at=?, updated_at=? WHERE id=?`)
      .run(approved_by, nowSec(), nowSec(), req.params.id);
    res.json({ ok: true });
  });

  router.post('/pr/:id/reject', (req, res) => {
    const { rejected_reason, approved_by } = req.body || {};
    db.prepare(`UPDATE purchase_requests SET status='rejected', rejected_reason=?, approved_by=?, approved_at=?, updated_at=? WHERE id=?`)
      .run(rejected_reason, approved_by, nowSec(), nowSec(), req.params.id);
    res.json({ ok: true });
  });

  // Convert approved PR → PO
  router.post('/pr/:id/convert', (req, res) => {
    const { supplier_id, expected_date, created_by, unit_prices } = req.body || {};
    if (!supplier_id) return res.status(400).json({ error: 'supplier_id required' });

    const pr = db.prepare(`SELECT * FROM purchase_requests WHERE id = ?`).get(req.params.id);
    if (!pr) return res.status(404).json({ error: 'PR not found' });
    if (pr.status !== 'approved') return res.status(409).json({ error: `PR not approved (status=${pr.status})` });

    const items = db.prepare(`SELECT * FROM pr_items WHERE pr_id = ?`).all(pr.id);

    const tx = db.transaction(() => {
      const po_number = genDocNumber(db, 'PO', 'purchase_orders', 'po_number');
      const info = db.prepare(`
        INSERT INTO purchase_orders (po_number, pr_id, supplier_id, order_date, expected_date,
          status, created_by, notes)
        VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)
      `).run(po_number, pr.id, supplier_id, nowSec(), expected_date, created_by,
        `Created from ${pr.pr_number}`);
      const poId = info.lastInsertRowid;

      const itemStmt = db.prepare(`
        INSERT INTO po_items (po_id, pr_item_id, sku, item_name, quantity_ordered,
          unit, unit_price, subtotal, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const it of items) {
        const price = (unit_prices && unit_prices[it.sku] !== undefined)
          ? unit_prices[it.sku] : it.estimated_price;
        itemStmt.run(poId, it.id, it.sku, it.item_name, it.quantity,
          it.unit, price, it.quantity * price, it.notes);
      }
      recalcPOTotal(db, poId);

      db.prepare(`UPDATE purchase_requests SET status='converted', updated_at=? WHERE id=?`)
        .run(nowSec(), pr.id);
      return { id: poId, po_number };
    });
    res.json(tx());
  });

  // ========== PURCHASE ORDERS ==========
  router.get('/po', (req, res) => {
    const { status, supplier_id, limit = 50 } = req.query;
    let sql = `
      SELECT po.*, s.name AS supplier_name, s.code AS supplier_code
      FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ' AND po.status = ?'; params.push(status); }
    if (supplier_id) { sql += ' AND po.supplier_id = ?'; params.push(supplier_id); }
    sql += ` ORDER BY po.created_at DESC LIMIT ?`; params.push(parseInt(limit,10));
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/po/:id', (req, res) => {
    const po = db.prepare(`
      SELECT po.*, s.name AS supplier_name, s.code AS supplier_code, s.phone AS supplier_phone
      FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      WHERE po.id = ?
    `).get(req.params.id);
    if (!po) return res.status(404).json({ error: 'not found' });
    po.items = db.prepare(`SELECT * FROM po_items WHERE po_id = ? ORDER BY id`).all(po.id);
    po.receipts = db.prepare(`SELECT * FROM goods_receipts WHERE po_id = ? ORDER BY receipt_date DESC`).all(po.id);
    res.json(po);
  });

  // Direct PO (without PR)
  router.post('/po', (req, res) => {
    const b = req.body || {};
    if (!b.supplier_id) return res.status(400).json({ error: 'supplier_id required' });
    if (!Array.isArray(b.items) || !b.items.length) return res.status(400).json({ error: 'items required' });

    const tx = db.transaction(() => {
      const po_number = genDocNumber(db, 'PO', 'purchase_orders', 'po_number');
      const info = db.prepare(`
        INSERT INTO purchase_orders (po_number, supplier_id, order_date, expected_date,
          status, tax_amount, discount, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(po_number, b.supplier_id, b.order_date || nowSec(), b.expected_date,
        b.status || 'draft', b.tax_amount || 0, b.discount || 0, b.notes, b.created_by);
      const poId = info.lastInsertRowid;

      const stmt = db.prepare(`
        INSERT INTO po_items (po_id, sku, item_name, quantity_ordered, unit, unit_price, subtotal, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const it of b.items) {
        stmt.run(poId, it.sku, it.item_name, it.quantity_ordered,
          it.unit, it.unit_price, it.quantity_ordered * it.unit_price, it.notes);
      }
      recalcPOTotal(db, poId);
      return { id: poId, po_number };
    });
    res.json(tx());
  });

  router.put('/po/:id', (req, res) => {
    const po = db.prepare(`SELECT status FROM purchase_orders WHERE id = ?`).get(req.params.id);
    if (!po) return res.status(404).json({ error: 'not found' });
    if (!['draft'].includes(po.status)) return res.status(409).json({ error: `cannot edit PO in status ${po.status}` });

    const b = req.body || {};
    const allowed = ['expected_date','tax_amount','discount','notes'];
    const sets = [], params = [];
    for (const k of allowed) {
      if (b[k] !== undefined) { sets.push(`${k} = ?`); params.push(b[k]); }
    }
    if (sets.length) {
      sets.push(`updated_at = ?`); params.push(nowSec());
      params.push(req.params.id);
      db.prepare(`UPDATE purchase_orders SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    }
    if (Array.isArray(b.items)) {
      db.prepare(`DELETE FROM po_items WHERE po_id = ?`).run(req.params.id);
      const stmt = db.prepare(`
        INSERT INTO po_items (po_id, sku, item_name, quantity_ordered, unit, unit_price, subtotal, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const it of b.items) {
        stmt.run(req.params.id, it.sku, it.item_name, it.quantity_ordered,
          it.unit, it.unit_price, it.quantity_ordered * it.unit_price, it.notes);
      }
    }
    recalcPOTotal(db, req.params.id);
    res.json({ ok: true });
  });

  router.post('/po/:id/send', (req, res) => {
    const po = db.prepare(`SELECT status FROM purchase_orders WHERE id = ?`).get(req.params.id);
    if (!po) return res.status(404).json({ error: 'not found' });
    if (po.status !== 'draft') return res.status(409).json({ error: `cannot send from ${po.status}` });
    db.prepare(`UPDATE purchase_orders SET status='sent', sent_at=?, updated_at=? WHERE id=?`)
      .run(nowSec(), nowSec(), req.params.id);
    res.json({ ok: true });
  });

  router.post('/po/:id/cancel', (req, res) => {
    db.prepare(`UPDATE purchase_orders SET status='cancelled', updated_at=? WHERE id=?`)
      .run(nowSec(), req.params.id);
    res.json({ ok: true });
  });

  router.post('/po/:id/close', (req, res) => {
    db.prepare(`UPDATE purchase_orders SET status='closed', closed_at=?, updated_at=? WHERE id=?`)
      .run(nowSec(), nowSec(), req.params.id);
    res.json({ ok: true });
  });

  // ========== GOODS RECEIPTS ==========
  router.get('/gr', (req, res) => {
    const { po_id, limit = 50 } = req.query;
    let sql = `
      SELECT gr.*, po.po_number, s.name AS supplier_name
      FROM goods_receipts gr
      LEFT JOIN purchase_orders po ON po.id = gr.po_id
      LEFT JOIN suppliers s ON s.id = gr.supplier_id
      WHERE 1=1
    `;
    const params = [];
    if (po_id) { sql += ' AND gr.po_id = ?'; params.push(po_id); }
    sql += ` ORDER BY gr.receipt_date DESC LIMIT ?`; params.push(parseInt(limit,10));
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/gr/:id', (req, res) => {
    const gr = db.prepare(`
      SELECT gr.*, po.po_number, s.name AS supplier_name
      FROM goods_receipts gr
      LEFT JOIN purchase_orders po ON po.id = gr.po_id
      LEFT JOIN suppliers s ON s.id = gr.supplier_id
      WHERE gr.id = ?
    `).get(req.params.id);
    if (!gr) return res.status(404).json({ error: 'not found' });
    gr.items = db.prepare(`SELECT * FROM gr_items WHERE gr_id = ? ORDER BY id`).all(gr.id);
    res.json(gr);
  });

  // CORE: GR creation → auto-update warehouse stock + update PO received qty
  router.post('/gr', (req, res) => {
    const b = req.body || {};
    if (!b.po_id) return res.status(400).json({ error: 'po_id required' });
    if (!b.received_by) return res.status(400).json({ error: 'received_by required' });
    if (!Array.isArray(b.items) || !b.items.length) return res.status(400).json({ error: 'items required' });

    const po = db.prepare(`SELECT * FROM purchase_orders WHERE id = ?`).get(b.po_id);
    if (!po) return res.status(404).json({ error: 'PO not found' });
    if (!['sent','partial'].includes(po.status)) {
      return res.status(409).json({ error: `cannot GR against PO in status ${po.status}` });
    }

    const poItems = db.prepare(`SELECT * FROM po_items WHERE po_id = ?`).all(b.po_id);
    const poItemMap = new Map(poItems.map(i => [i.id, i]));

    // Validate qty doesn't exceed remaining
    for (const it of b.items) {
      const poItem = poItemMap.get(it.po_item_id);
      if (!poItem) return res.status(400).json({ error: `invalid po_item_id ${it.po_item_id}` });
      const remaining = poItem.quantity_ordered - poItem.quantity_received;
      if (it.quantity_received > remaining + 0.0001) {
        return res.status(400).json({
          error: `qty exceeds remaining for ${poItem.item_name} (max ${remaining})`
        });
      }
    }

    const tx = db.transaction(() => {
      const gr_number = genDocNumber(db, 'GR', 'goods_receipts', 'gr_number');
      const hasDiscrepancy = b.items.some(i => (i.quantity_rejected || 0) > 0);
      const grInfo = db.prepare(`
        INSERT INTO goods_receipts (gr_number, po_id, supplier_id, receipt_date, received_by,
          status, delivery_note, notes, has_discrepancy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(gr_number, b.po_id, po.supplier_id, b.receipt_date || nowSec(),
        b.received_by, 'received', b.delivery_note, b.notes, hasDiscrepancy ? 1 : 0);
      const grId = grInfo.lastInsertRowid;

      const grItemStmt = db.prepare(`
        INSERT INTO gr_items (gr_id, po_item_id, sku, item_name, quantity_received,
          quantity_rejected, rejection_reason, unit, unit_price, expiry_date, batch_number, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const poItemUpdate = db.prepare(`
        UPDATE po_items SET quantity_received = quantity_received + ? WHERE id = ?
      `);

      for (const it of b.items) {
        const poItem = poItemMap.get(it.po_item_id);
        grItemStmt.run(grId, it.po_item_id, poItem.sku, poItem.item_name,
          it.quantity_received, it.quantity_rejected || 0, it.rejection_reason,
          poItem.unit, poItem.unit_price, it.expiry_date, it.batch_number, it.notes);
        // Update PO item received qty
        poItemUpdate.run(it.quantity_received, it.po_item_id);
        // CORE: update warehouse stock (only accepted qty, not rejected)
        updateWarehouseStock(db, poItem.sku, it.quantity_received,
          `GR ${gr_number}`, 'goods_receipt', grId, b.received_by);
      }

      // Update PO status based on receipt
      const newStatus = updatePOReceiveStatus(db, b.po_id);

      return { id: grId, gr_number, po_status: newStatus };
    });
    const grResult = tx();
    global.onGoodsReceived?.(grResult.id);   // Wave 2B bridge hook — weighted-avg last_cost
    res.json(grResult);
  });

  // ========== PURCHASE INVOICES ==========
  router.get('/invoices', (req, res) => {
    const { status, supplier_id, overdue, limit = 50 } = req.query;
    let sql = `
      SELECT inv.*, po.po_number, s.name AS supplier_name
      FROM purchase_invoices inv
      LEFT JOIN purchase_orders po ON po.id = inv.po_id
      LEFT JOIN suppliers s ON s.id = inv.supplier_id
      WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ' AND inv.status = ?'; params.push(status); }
    if (supplier_id) { sql += ' AND inv.supplier_id = ?'; params.push(supplier_id); }
    if (overdue === 'true') {
      sql += ` AND inv.status IN ('unpaid','partial') AND inv.due_date < ?`;
      params.push(nowSec());
    }
    sql += ` ORDER BY inv.due_date ASC LIMIT ?`; params.push(parseInt(limit,10));
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/invoices/:id', (req, res) => {
    const inv = db.prepare(`
      SELECT inv.*, po.po_number, s.name AS supplier_name, s.payment_terms
      FROM purchase_invoices inv
      LEFT JOIN purchase_orders po ON po.id = inv.po_id
      LEFT JOIN suppliers s ON s.id = inv.supplier_id
      WHERE inv.id = ?
    `).get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'not found' });
    inv.payments = db.prepare(`SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC`).all(inv.id);
    res.json(inv);
  });

  router.post('/invoices', (req, res) => {
    const b = req.body || {};
    if (!b.po_id) return res.status(400).json({ error: 'po_id required' });
    if (!b.total || b.total <= 0) return res.status(400).json({ error: 'total required' });

    const po = db.prepare(`SELECT * FROM purchase_orders WHERE id = ?`).get(b.po_id);
    if (!po) return res.status(404).json({ error: 'PO not found' });

    const invoice_number = genDocNumber(db, 'INV', 'purchase_invoices', 'invoice_number');
    const supplier = db.prepare(`SELECT payment_terms FROM suppliers WHERE id = ?`).get(po.supplier_id);
    const invoiceDate = b.invoice_date || nowSec();
    const dueDate = b.due_date || (invoiceDate + (supplier?.payment_terms || 30) * 86400);

    const info = db.prepare(`
      INSERT INTO purchase_invoices (invoice_number, supplier_invoice_no, po_id, gr_id,
        supplier_id, invoice_date, due_date, subtotal, tax_amount, discount, total, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(invoice_number, b.supplier_invoice_no, b.po_id, b.gr_id,
      po.supplier_id, invoiceDate, dueDate,
      b.subtotal || b.total, b.tax_amount || 0, b.discount || 0, b.total, b.notes);

    res.json({ id: info.lastInsertRowid, invoice_number });
  });

  router.put('/invoices/:id', (req, res) => {
    const inv = db.prepare(`SELECT status FROM purchase_invoices WHERE id = ?`).get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'not found' });
    if (inv.status === 'paid') return res.status(409).json({ error: 'cannot edit paid invoice' });

    const b = req.body || {};
    const allowed = ['supplier_invoice_no','invoice_date','due_date','subtotal','tax_amount','discount','total','notes'];
    const sets = [], params = [];
    for (const k of allowed) {
      if (b[k] !== undefined) { sets.push(`${k} = ?`); params.push(b[k]); }
    }
    if (!sets.length) return res.json({ ok: true });
    params.push(req.params.id);
    db.prepare(`UPDATE purchase_invoices SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  });

  // ========== PAYMENTS ==========
  router.get('/payments', (req, res) => {
    const { invoice_id, limit = 50 } = req.query;
    let sql = `
      SELECT p.*, inv.invoice_number, s.name AS supplier_name
      FROM payments p
      LEFT JOIN purchase_invoices inv ON inv.id = p.invoice_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE 1=1
    `;
    const params = [];
    if (invoice_id) { sql += ' AND p.invoice_id = ?'; params.push(invoice_id); }
    sql += ` ORDER BY p.payment_date DESC LIMIT ?`; params.push(parseInt(limit,10));
    res.json(db.prepare(sql).all(...params));
  });

  // CORE: Payment creation → updates invoice + creates finance expense
  router.post('/payments', (req, res) => {
    const b = req.body || {};
    if (!b.invoice_id) return res.status(400).json({ error: 'invoice_id required' });
    if (!b.amount || b.amount <= 0) return res.status(400).json({ error: 'amount required' });
    if (!b.method) return res.status(400).json({ error: 'method required' });
    if (!b.paid_by) return res.status(400).json({ error: 'paid_by required' });

    const inv = db.prepare(`SELECT * FROM purchase_invoices WHERE id = ?`).get(b.invoice_id);
    if (!inv) return res.status(404).json({ error: 'invoice not found' });
    if (inv.status === 'paid') return res.status(409).json({ error: 'invoice already paid' });

    const remaining = inv.total - inv.paid_amount;
    if (b.amount > remaining + 0.0001) {
      return res.status(400).json({ error: `amount exceeds remaining (${remaining})` });
    }

    const supplier = db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(inv.supplier_id);

    const tx = db.transaction(() => {
      const payment_number = genDocNumber(db, 'PAY', 'payments', 'payment_number');
      const paymentDate = b.payment_date || nowSec();

      const info = db.prepare(`
        INSERT INTO payments (payment_number, invoice_id, supplier_id, payment_date,
          amount, method, reference, paid_by, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(payment_number, b.invoice_id, inv.supplier_id, paymentDate,
        b.amount, b.method, b.reference, b.paid_by, b.notes);
      const paymentId = info.lastInsertRowid;

      // Update invoice paid_amount + status
      const newPaid = inv.paid_amount + b.amount;
      const newStatus = newPaid >= inv.total - 0.0001 ? 'paid' : 'partial';
      db.prepare(`UPDATE purchase_invoices SET paid_amount = ?, status = ? WHERE id = ?`)
        .run(newPaid, newStatus, b.invoice_id);

      // CORE: create finance expense
      const expenseId = createFinanceExpense(db,
        { payment_number, payment_date: paymentDate, amount: b.amount, method: b.method },
        supplier, inv);
      if (expenseId) {
        db.prepare(`UPDATE payments SET finance_expense_id = ? WHERE id = ?`).run(expenseId, paymentId);
      }

      // Audit log
      try {
        db.prepare(`INSERT INTO pos_events (event_type, payload, actor, created_at) VALUES (?, ?, ?, ?)`)
          .run('procurement_payment', JSON.stringify({
            payment_number, invoice_number: inv.invoice_number, amount: b.amount,
            supplier: supplier?.name, expense_id: expenseId
          }), b.paid_by, nowSec());
      } catch {}

      return { id: paymentId, payment_number, invoice_status: newStatus, expense_id: expenseId };
    });
    const payResult = tx();
    global.onPaymentRecorded?.(payResult.id);   // Wave 2B bridge hook — payment→expense link
    res.json(payResult);
  });

  // Mount router
  const mountPath = opts.mountPath || '/api/procurement';
  app.use(mountPath, router);

  console.log(`[procurement] mounted at ${mountPath}`);
  return { router, db };
}

module.exports = { setupProcurement, SCHEMA_SQL };
