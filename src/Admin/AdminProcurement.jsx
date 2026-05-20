// client/src/Admin/AdminProcurement.jsx
// Procurement tab for AdminTools — Dashboard / Suppliers / PR / PO / GR / Invoices / Payments
import React, { useState, useEffect, useCallback, useMemo } from 'react';

const API = '/api/procurement';

// ============================================================
// HELPERS
// ============================================================
const fmtIDR = (n) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0
}).format(n || 0);

const fmtDate = (sec) => {
  if (!sec) return '-';
  return new Date(sec * 1000).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
};

const fmtDateTime = (sec) => {
  if (!sec) return '-';
  return new Date(sec * 1000).toLocaleString('id-ID');
};

const toUnixSec = (dateStr) => dateStr ? Math.floor(new Date(dateStr).getTime() / 1000) : null;
const fromUnixSec = (sec) => sec ? new Date(sec * 1000).toISOString().slice(0,10) : '';

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

const STATUS_COLORS = {
  draft: '#6b7280', submitted: '#f59e0b', approved: '#10b981',
  rejected: '#ef4444', converted: '#3b82f6', cancelled: '#6b7280',
  sent: '#3b82f6', partial: '#f59e0b', received: '#10b981', closed: '#6b7280',
  unpaid: '#ef4444', paid: '#10b981', overdue: '#dc2626',
};

const StatusBadge = ({ status }) => (
  <span style={{
    padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
    color: '#fff', background: STATUS_COLORS[status] || '#6b7280',
    textTransform: 'uppercase'
  }}>{status}</span>
);

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function AdminProcurement() {
  const [subTab, setSubTab] = useState('dashboard');
  const subTabs = [
    { k: 'dashboard', l: 'Dashboard' },
    { k: 'suppliers', l: 'Suppliers' },
    { k: 'pr', l: 'Purchase Requests' },
    { k: 'po', l: 'Purchase Orders' },
    { k: 'gr', l: 'Goods Receipts' },
    { k: 'invoices', l: 'Invoices' },
    { k: 'payments', l: 'Payments' },
  ];

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Procurement</h2>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
        {subTabs.map(t => (
          <button key={t.k} onClick={() => setSubTab(t.k)} style={{
            padding: '8px 14px', border: 'none', background: 'transparent',
            borderBottom: subTab === t.k ? '2px solid #3b82f6' : '2px solid transparent',
            color: subTab === t.k ? '#3b82f6' : '#374151',
            fontWeight: subTab === t.k ? 600 : 400, cursor: 'pointer'
          }}>{t.l}</button>
        ))}
      </div>
      {subTab === 'dashboard' && <Dashboard />}
      {subTab === 'suppliers' && <Suppliers />}
      {subTab === 'pr' && <PurchaseRequests />}
      {subTab === 'po' && <PurchaseOrders />}
      {subTab === 'gr' && <GoodsReceipts />}
      {subTab === 'invoices' && <Invoices />}
      {subTab === 'payments' && <Payments />}
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
function Dashboard() {
  const [stats, setStats] = useState(null);
  const load = useCallback(() => api('/dashboard').then(setStats).catch(console.error), []);
  useEffect(() => { load(); }, [load]);

  if (!stats) return <div>Loading...</div>;

  const cards = [
    { label: 'PR Pending Approval', value: stats.pr_pending, color: '#f59e0b' },
    { label: 'PR Approved', value: stats.pr_approved, color: '#10b981' },
    { label: 'PO Open', value: stats.po_open, color: '#3b82f6' },
    { label: 'PO Value Open', value: fmtIDR(stats.po_value_open), color: '#3b82f6' },
    { label: 'Invoices Unpaid', value: stats.invoices_unpaid, color: '#ef4444' },
    { label: 'Invoices Overdue', value: stats.invoices_overdue, color: '#dc2626' },
    { label: 'A/P Outstanding', value: fmtIDR(stats.ap_outstanding), color: '#ef4444' },
    { label: 'Active Suppliers', value: stats.suppliers_active, color: '#6b7280' },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {cards.map(c => (
          <div key={c.label} style={{
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14,
            borderLeft: `4px solid ${c.color}`
          }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 24, color: '#6b7280', fontSize: 13 }}>
        Flow: PR (request) → PO (order ke supplier) → GR (terima barang, stok otomatis ke-update) → Invoice (tagihan supplier) → Payment (bayar, jadi expense di Finance).
      </p>
    </div>
  );
}

// ============================================================
// SUPPLIERS
// ============================================================
function Suppliers() {
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    api('/suppliers').then(setList).catch(console.error);
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleSave = async (data) => {
    try {
      if (editing?.id) {
        await api(`/suppliers/${editing.id}`, { method: 'PUT', body: data });
      } else {
        await api('/suppliers', { method: 'POST', body: data });
      }
      setShowForm(false); setEditing(null); load();
    } catch (e) { alert(e.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Nonaktifkan supplier ini?')) return;
    await api(`/suppliers/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Suppliers ({list.length})</h3>
        <button onClick={() => { setEditing(null); setShowForm(true); }} style={btnPrimary}>+ Tambah Supplier</button>
      </div>
      {showForm && (
        <SupplierForm initial={editing} onSave={handleSave} onCancel={() => { setShowForm(false); setEditing(null); }} />
      )}
      <table style={tableStyle}>
        <thead>
          <tr>
            <th>Code</th><th>Nama</th><th>Kontak</th><th>Telp</th>
            <th>Terms</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          {list.map(s => (
            <tr key={s.id}>
              <td>{s.code}</td>
              <td><b>{s.name}</b></td>
              <td>{s.contact_person || '-'}</td>
              <td>{s.phone || '-'}</td>
              <td>{s.payment_terms} hari</td>
              <td>{s.is_active ? <StatusBadge status="active" /> : <StatusBadge status="inactive" />}</td>
              <td>
                <button onClick={() => { setEditing(s); setShowForm(true); }} style={btnSmall}>Edit</button>{' '}
                {s.is_active === 1 && <button onClick={() => handleDelete(s.id)} style={btnSmallDanger}>Nonaktifkan</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SupplierForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState({
    code: '', name: '', contact_person: '', phone: '', email: '', address: '',
    tax_id: '', payment_terms: 30, bank_name: '', bank_account: '', bank_holder: '',
    notes: '', ...initial
  });
  const update = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div style={formCard}>
      <h4>{initial?.id ? 'Edit Supplier' : 'Tambah Supplier'}</h4>
      <div style={formGrid}>
        <label>Code <input value={f.code || ''} onChange={update('code')} placeholder="auto" /></label>
        <label>Nama* <input value={f.name} onChange={update('name')} required /></label>
        <label>Contact Person <input value={f.contact_person || ''} onChange={update('contact_person')} /></label>
        <label>Phone <input value={f.phone || ''} onChange={update('phone')} /></label>
        <label>Email <input value={f.email || ''} onChange={update('email')} /></label>
        <label>NPWP <input value={f.tax_id || ''} onChange={update('tax_id')} /></label>
        <label>Payment Terms (hari) <input type="number" value={f.payment_terms} onChange={update('payment_terms')} /></label>
        <label>Bank <input value={f.bank_name || ''} onChange={update('bank_name')} /></label>
        <label>No. Rekening <input value={f.bank_account || ''} onChange={update('bank_account')} /></label>
        <label>Atas Nama <input value={f.bank_holder || ''} onChange={update('bank_holder')} /></label>
        <label style={{ gridColumn: '1 / -1' }}>Alamat <textarea value={f.address || ''} onChange={update('address')} rows={2} /></label>
        <label style={{ gridColumn: '1 / -1' }}>Notes <textarea value={f.notes || ''} onChange={update('notes')} rows={2} /></label>
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={() => onSave(f)} style={btnPrimary}>Simpan</button>{' '}
        <button onClick={onCancel} style={btnSecondary}>Batal</button>
      </div>
    </div>
  );
}

// ============================================================
// PURCHASE REQUESTS
// ============================================================
function PurchaseRequests() {
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState('');
  const [detail, setDetail] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    const q = filter ? `?status=${filter}` : '';
    api(`/pr${q}`).then(setList).catch(console.error);
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, display: 'inline-block', marginRight: 12 }}>Purchase Requests</h3>
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">Semua status</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="converted">Converted</option>
          </select>
        </div>
        <button onClick={() => setShowForm(true)} style={btnPrimary}>+ Buat PR</button>
      </div>

      {showForm && <PRForm onClose={() => { setShowForm(false); load(); }} />}
      {detail && <PRDetail prId={detail} onClose={() => { setDetail(null); load(); }} />}

      <table style={tableStyle}>
        <thead>
          <tr>
            <th>PR Number</th><th>Tanggal</th><th>Requester</th><th>Dept</th>
            <th>Priority</th><th>Total Est.</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          {list.map(pr => (
            <tr key={pr.id}>
              <td><b>{pr.pr_number}</b></td>
              <td>{fmtDate(pr.request_date)}</td>
              <td>{pr.requested_by}</td>
              <td>{pr.department || '-'}</td>
              <td>{pr.priority}</td>
              <td>{fmtIDR(pr.total_estimated)}</td>
              <td><StatusBadge status={pr.status} /></td>
              <td><button onClick={() => setDetail(pr.id)} style={btnSmall}>Detail</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PRForm({ onClose }) {
  const [f, setF] = useState({
    requested_by: '', department: 'Kitchen', priority: 'normal',
    needed_date: '', notes: '', items: [{ sku:'', item_name:'', quantity:0, unit:'pcs', estimated_price:0 }]
  });
  const addItem = () => setF({ ...f, items: [...f.items, { sku:'', item_name:'', quantity:0, unit:'pcs', estimated_price:0 }] });
  const updItem = (idx, k, v) => {
    const items = [...f.items]; items[idx] = { ...items[idx], [k]: v }; setF({ ...f, items });
  };
  const removeItem = (idx) => setF({ ...f, items: f.items.filter((_,i)=>i!==idx) });
  const total = f.items.reduce((s,i)=>s+(i.quantity||0)*(i.estimated_price||0), 0);

  const submit = async (asDraft) => {
    try {
      await api('/pr', { method: 'POST', body: {
        ...f,
        needed_date: toUnixSec(f.needed_date),
        status: asDraft ? 'draft' : 'submitted',
        items: f.items.filter(i => i.sku && i.quantity > 0)
      }});
      onClose();
    } catch (e) { alert(e.message); }
  };

  return (
    <div style={formCard}>
      <h4>Buat Purchase Request</h4>
      <div style={formGrid}>
        <label>Requester* <input value={f.requested_by} onChange={e=>setF({...f, requested_by:e.target.value})} /></label>
        <label>Department
          <select value={f.department} onChange={e=>setF({...f, department:e.target.value})}>
            <option>Kitchen</option><option>Gudang</option><option>FoH</option><option>Admin</option>
          </select>
        </label>
        <label>Priority
          <select value={f.priority} onChange={e=>setF({...f, priority:e.target.value})}>
            <option value="low">Low</option><option value="normal">Normal</option>
            <option value="high">High</option><option value="urgent">Urgent</option>
          </select>
        </label>
        <label>Needed Date <input type="date" value={f.needed_date} onChange={e=>setF({...f, needed_date:e.target.value})} /></label>
        <label style={{ gridColumn:'1/-1' }}>Notes <textarea value={f.notes} onChange={e=>setF({...f, notes:e.target.value})} rows={2} /></label>
      </div>

      <h5 style={{ marginTop: 16 }}>Items</h5>
      <table style={tableStyle}>
        <thead><tr><th>SKU</th><th>Nama</th><th>Qty</th><th>Unit</th><th>Est. Harga</th><th>Subtotal</th><th></th></tr></thead>
        <tbody>
          {f.items.map((it, idx) => (
            <tr key={idx}>
              <td><input value={it.sku} onChange={e=>updItem(idx,'sku',e.target.value)} style={{width:100}} /></td>
              <td><input value={it.item_name} onChange={e=>updItem(idx,'item_name',e.target.value)} style={{width:180}} /></td>
              <td><input type="number" value={it.quantity} onChange={e=>updItem(idx,'quantity',parseFloat(e.target.value)||0)} style={{width:70}} /></td>
              <td><input value={it.unit} onChange={e=>updItem(idx,'unit',e.target.value)} style={{width:60}} /></td>
              <td><input type="number" value={it.estimated_price} onChange={e=>updItem(idx,'estimated_price',parseFloat(e.target.value)||0)} style={{width:110}} /></td>
              <td>{fmtIDR((it.quantity||0)*(it.estimated_price||0))}</td>
              <td><button onClick={()=>removeItem(idx)} style={btnSmallDanger}>×</button></td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={5} style={{textAlign:'right'}}><b>Total Est.</b></td><td><b>{fmtIDR(total)}</b></td><td></td></tr></tfoot>
      </table>
      <button onClick={addItem} style={btnSmall}>+ Item</button>

      <div style={{ marginTop: 12 }}>
        <button onClick={()=>submit(true)} style={btnSecondary}>Simpan Draft</button>{' '}
        <button onClick={()=>submit(false)} style={btnPrimary}>Submit untuk Approval</button>{' '}
        <button onClick={onClose} style={btnSecondary}>Batal</button>
      </div>
    </div>
  );
}

function PRDetail({ prId, onClose }) {
  const [pr, setPr] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [convertMode, setConvertMode] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [unitPrices, setUnitPrices] = useState({});

  const load = useCallback(() => {
    api(`/pr/${prId}`).then(p => {
      setPr(p);
      const prices = {};
      p.items.forEach(i => prices[i.sku] = i.estimated_price);
      setUnitPrices(prices);
    });
  }, [prId]);
  useEffect(() => { load(); api('/suppliers?active=true').then(setSuppliers); }, [load]);

  if (!pr) return null;

  const act = async (path, body = {}) => {
    try { await api(`/pr/${prId}${path}`, { method: 'POST', body }); load(); }
    catch (e) { alert(e.message); }
  };

  const doConvert = async () => {
    if (!supplierId) return alert('Pilih supplier dulu');
    try {
      const result = await api(`/pr/${prId}/convert`, { method: 'POST', body: {
        supplier_id: parseInt(supplierId,10),
        created_by: 'admin',
        unit_prices: unitPrices
      }});
      alert(`PO created: ${result.po_number}`);
      onClose();
    } catch (e) { alert(e.message); }
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h3>{pr.pr_number} <StatusBadge status={pr.status} /></h3>
          <button onClick={onClose} style={btnSmall}>×</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, fontSize:13, marginBottom:12 }}>
          <div><b>Requester:</b> {pr.requested_by}</div>
          <div><b>Department:</b> {pr.department || '-'}</div>
          <div><b>Request Date:</b> {fmtDate(pr.request_date)}</div>
          <div><b>Needed Date:</b> {fmtDate(pr.needed_date)}</div>
          <div><b>Priority:</b> {pr.priority}</div>
          <div><b>Total Est:</b> {fmtIDR(pr.total_estimated)}</div>
          {pr.approved_by && <div><b>Approved by:</b> {pr.approved_by} ({fmtDate(pr.approved_at)})</div>}
          {pr.rejected_reason && <div style={{color:'#dc2626'}}><b>Rejected:</b> {pr.rejected_reason}</div>}
        </div>
        {pr.notes && <p><b>Notes:</b> {pr.notes}</p>}

        <table style={tableStyle}>
          <thead><tr><th>SKU</th><th>Item</th><th>Qty</th><th>Unit</th><th>Est. Harga</th><th>Subtotal</th></tr></thead>
          <tbody>
            {pr.items.map(it => (
              <tr key={it.id}>
                <td>{it.sku}</td><td>{it.item_name}</td>
                <td>{it.quantity}</td><td>{it.unit}</td>
                <td>{fmtIDR(it.estimated_price)}</td><td>{fmtIDR(it.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 16 }}>
          {pr.status === 'draft' && (
            <button onClick={() => act('/submit')} style={btnPrimary}>Submit untuk Approval</button>
          )}
          {pr.status === 'submitted' && (
            <>
              <button onClick={() => act('/approve', { approved_by: 'admin' })} style={btnPrimary}>Approve</button>{' '}
              <button onClick={() => {
                const reason = prompt('Alasan reject?');
                if (reason) act('/reject', { rejected_reason: reason, approved_by: 'admin' });
              }} style={btnSmallDanger}>Reject</button>
            </>
          )}
          {pr.status === 'approved' && !convertMode && (
            <button onClick={() => setConvertMode(true)} style={btnPrimary}>Convert ke PO</button>
          )}
        </div>

        {convertMode && (
          <div style={{ marginTop: 16, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
            <h4>Convert ke PO</h4>
            <label>Supplier
              <select value={supplierId} onChange={e=>setSupplierId(e.target.value)} style={{ marginLeft: 8 }}>
                <option value="">-- Pilih supplier --</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
              </select>
            </label>
            <p style={{ fontSize: 12, color: '#6b7280' }}>Sesuaikan harga supplier (override est. harga):</p>
            <table style={tableStyle}>
              <thead><tr><th>SKU</th><th>Item</th><th>Qty</th><th>Est.</th><th>Harga Supplier</th></tr></thead>
              <tbody>
                {pr.items.map(it => (
                  <tr key={it.id}>
                    <td>{it.sku}</td><td>{it.item_name}</td><td>{it.quantity} {it.unit}</td>
                    <td>{fmtIDR(it.estimated_price)}</td>
                    <td><input type="number" value={unitPrices[it.sku] || 0}
                      onChange={e=>setUnitPrices({...unitPrices, [it.sku]: parseFloat(e.target.value)||0})}
                      style={{width:120}} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={doConvert} style={btnPrimary}>Buat PO</button>{' '}
            <button onClick={() => setConvertMode(false)} style={btnSecondary}>Batal</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// PURCHASE ORDERS
// ============================================================
function PurchaseOrders() {
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState('');
  const [detail, setDetail] = useState(null);

  const load = useCallback(() => {
    const q = filter ? `?status=${filter}` : '';
    api(`/po${q}`).then(setList).catch(console.error);
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, display: 'inline-block', marginRight: 12 }}>Purchase Orders</h3>
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">Semua</option>
            <option value="draft">Draft</option><option value="sent">Sent</option>
            <option value="partial">Partial</option><option value="received">Received</option>
            <option value="closed">Closed</option><option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {detail && <PODetail poId={detail} onClose={() => { setDetail(null); load(); }} />}

      <table style={tableStyle}>
        <thead>
          <tr>
            <th>PO Number</th><th>Supplier</th><th>Tanggal Order</th>
            <th>Expected</th><th>Total</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          {list.map(po => (
            <tr key={po.id}>
              <td><b>{po.po_number}</b></td>
              <td>{po.supplier_name}</td>
              <td>{fmtDate(po.order_date)}</td>
              <td>{fmtDate(po.expected_date)}</td>
              <td>{fmtIDR(po.total)}</td>
              <td><StatusBadge status={po.status} /></td>
              <td><button onClick={() => setDetail(po.id)} style={btnSmall}>Detail</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PODetail({ poId, onClose }) {
  const [po, setPo] = useState(null);
  const [grMode, setGrMode] = useState(false);

  const load = useCallback(() => api(`/po/${poId}`).then(setPo), [poId]);
  useEffect(() => { load(); }, [load]);
  if (!po) return null;

  const act = async (path) => {
    try { await api(`/po/${poId}${path}`, { method: 'POST' }); load(); }
    catch (e) { alert(e.message); }
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h3>{po.po_number} <StatusBadge status={po.status} /></h3>
          <button onClick={onClose} style={btnSmall}>×</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, fontSize:13, marginBottom:12 }}>
          <div><b>Supplier:</b> {po.supplier_name} ({po.supplier_code})</div>
          <div><b>Phone:</b> {po.supplier_phone || '-'}</div>
          <div><b>Order Date:</b> {fmtDate(po.order_date)}</div>
          <div><b>Expected:</b> {fmtDate(po.expected_date)}</div>
          <div><b>Subtotal:</b> {fmtIDR(po.subtotal)}</div>
          <div><b>Tax:</b> {fmtIDR(po.tax_amount)}</div>
          <div><b>Discount:</b> {fmtIDR(po.discount)}</div>
          <div><b>Total:</b> <span style={{fontSize:16, fontWeight:600}}>{fmtIDR(po.total)}</span></div>
        </div>

        <table style={tableStyle}>
          <thead><tr><th>SKU</th><th>Item</th><th>Ordered</th><th>Received</th><th>Sisa</th><th>Harga</th><th>Subtotal</th></tr></thead>
          <tbody>
            {po.items.map(it => {
              const remaining = it.quantity_ordered - it.quantity_received;
              return (
                <tr key={it.id}>
                  <td>{it.sku}</td><td>{it.item_name}</td>
                  <td>{it.quantity_ordered} {it.unit}</td>
                  <td>{it.quantity_received}</td>
                  <td style={{ color: remaining > 0 ? '#f59e0b' : '#10b981' }}>{remaining}</td>
                  <td>{fmtIDR(it.unit_price)}</td>
                  <td>{fmtIDR(it.subtotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {po.receipts && po.receipts.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <h4>Goods Receipts</h4>
            <ul>{po.receipts.map(r => <li key={r.id}>{r.gr_number} — {fmtDate(r.receipt_date)} ({r.received_by})</li>)}</ul>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          {po.status === 'draft' && (
            <>
              <button onClick={() => act('/send')} style={btnPrimary}>Send ke Supplier</button>{' '}
              <button onClick={() => act('/cancel')} style={btnSmallDanger}>Cancel</button>
            </>
          )}
          {['sent','partial'].includes(po.status) && !grMode && (
            <button onClick={() => setGrMode(true)} style={btnPrimary}>+ Terima Barang (GR)</button>
          )}
          {po.status === 'received' && (
            <button onClick={() => act('/close')} style={btnSecondary}>Close PO</button>
          )}
        </div>

        {grMode && <GRForm po={po} onDone={() => { setGrMode(false); load(); }} />}
      </div>
    </div>
  );
}

function GRForm({ po, onDone }) {
  const [received_by, setReceivedBy] = useState('');
  const [delivery_note, setDeliveryNote] = useState('');
  const [items, setItems] = useState(
    po.items.filter(i => i.quantity_ordered > i.quantity_received).map(i => ({
      po_item_id: i.id, sku: i.sku, item_name: i.item_name,
      max: i.quantity_ordered - i.quantity_received, unit: i.unit,
      quantity_received: i.quantity_ordered - i.quantity_received,
      quantity_rejected: 0, rejection_reason: '', batch_number: '', expiry_date: ''
    }))
  );
  const upd = (idx, k, v) => { const a=[...items]; a[idx]={...a[idx], [k]:v}; setItems(a); };

  const submit = async () => {
    if (!received_by) return alert('Nama penerima wajib diisi');
    try {
      const result = await api('/gr', { method: 'POST', body: {
        po_id: po.id, received_by, delivery_note,
        items: items.filter(i => i.quantity_received > 0).map(i => ({
          po_item_id: i.po_item_id,
          quantity_received: i.quantity_received,
          quantity_rejected: i.quantity_rejected || 0,
          rejection_reason: i.rejection_reason,
          batch_number: i.batch_number,
          expiry_date: toUnixSec(i.expiry_date)
        }))
      }});
      alert(`GR created: ${result.gr_number}\nPO status: ${result.po_status}\nStok warehouse otomatis ter-update.`);
      onDone();
    } catch (e) { alert(e.message); }
  };

  return (
    <div style={{ marginTop: 16, padding: 12, background: '#f0fdf4', border:'1px solid #86efac', borderRadius: 8 }}>
      <h4>Terima Barang (Goods Receipt)</h4>
      <div style={formGrid}>
        <label>Diterima oleh* <input value={received_by} onChange={e=>setReceivedBy(e.target.value)} /></label>
        <label>No. Surat Jalan <input value={delivery_note} onChange={e=>setDeliveryNote(e.target.value)} /></label>
      </div>
      <table style={tableStyle}>
        <thead><tr><th>SKU</th><th>Item</th><th>Max</th><th>Diterima</th><th>Ditolak</th><th>Alasan Tolak</th><th>Batch</th><th>Expiry</th></tr></thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={idx}>
              <td>{it.sku}</td>
              <td>{it.item_name}</td>
              <td>{it.max} {it.unit}</td>
              <td><input type="number" max={it.max} value={it.quantity_received}
                onChange={e=>upd(idx,'quantity_received',Math.min(parseFloat(e.target.value)||0, it.max))} style={{width:80}} /></td>
              <td><input type="number" value={it.quantity_rejected}
                onChange={e=>upd(idx,'quantity_rejected',parseFloat(e.target.value)||0)} style={{width:60}} /></td>
              <td><input value={it.rejection_reason} onChange={e=>upd(idx,'rejection_reason',e.target.value)} style={{width:120}} placeholder="opsional" /></td>
              <td><input value={it.batch_number} onChange={e=>upd(idx,'batch_number',e.target.value)} style={{width:80}} /></td>
              <td><input type="date" value={it.expiry_date} onChange={e=>upd(idx,'expiry_date',e.target.value)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: '#059669' }}>⚠️ Submit GR akan otomatis: (1) update stok di audit_warehouse, (2) update qty received di PO, (3) log ke pos_events.</p>
      <button onClick={submit} style={btnPrimary}>Submit GR</button>{' '}
      <button onClick={onDone} style={btnSecondary}>Batal</button>
    </div>
  );
}

// ============================================================
// GOODS RECEIPTS LIST
// ============================================================
function GoodsReceipts() {
  const [list, setList] = useState([]);
  const [detail, setDetail] = useState(null);
  useEffect(() => { api('/gr').then(setList).catch(console.error); }, []);

  return (
    <div>
      <h3 style={{ margin: 0, marginBottom: 12 }}>Goods Receipts</h3>
      {detail && <GRDetail grId={detail} onClose={() => setDetail(null)} />}
      <table style={tableStyle}>
        <thead><tr><th>GR Number</th><th>PO</th><th>Supplier</th><th>Tanggal</th><th>Penerima</th><th>Discrepancy</th><th></th></tr></thead>
        <tbody>
          {list.map(gr => (
            <tr key={gr.id}>
              <td><b>{gr.gr_number}</b></td>
              <td>{gr.po_number}</td>
              <td>{gr.supplier_name}</td>
              <td>{fmtDateTime(gr.receipt_date)}</td>
              <td>{gr.received_by}</td>
              <td>{gr.has_discrepancy ? <span style={{color:'#dc2626'}}>⚠️ Ya</span> : '-'}</td>
              <td><button onClick={() => setDetail(gr.id)} style={btnSmall}>Detail</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GRDetail({ grId, onClose }) {
  const [gr, setGr] = useState(null);
  useEffect(() => { api(`/gr/${grId}`).then(setGr); }, [grId]);
  if (!gr) return null;
  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <h3>{gr.gr_number}</h3>
          <button onClick={onClose} style={btnSmall}>×</button>
        </div>
        <div style={{ fontSize:13, marginBottom:12 }}>
          <div><b>PO:</b> {gr.po_number}</div>
          <div><b>Supplier:</b> {gr.supplier_name}</div>
          <div><b>Tanggal:</b> {fmtDateTime(gr.receipt_date)}</div>
          <div><b>Penerima:</b> {gr.received_by}</div>
          <div><b>Surat Jalan:</b> {gr.delivery_note || '-'}</div>
          {gr.notes && <div><b>Notes:</b> {gr.notes}</div>}
        </div>
        <table style={tableStyle}>
          <thead><tr><th>SKU</th><th>Item</th><th>Diterima</th><th>Ditolak</th><th>Alasan</th><th>Batch</th><th>Expiry</th></tr></thead>
          <tbody>
            {gr.items.map(it => (
              <tr key={it.id}>
                <td>{it.sku}</td><td>{it.item_name}</td>
                <td>{it.quantity_received} {it.unit}</td>
                <td>{it.quantity_rejected || '-'}</td>
                <td>{it.rejection_reason || '-'}</td>
                <td>{it.batch_number || '-'}</td>
                <td>{fmtDate(it.expiry_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// INVOICES
// ============================================================
function Invoices() {
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState('');
  const [detail, setDetail] = useState(null);
  const [createMode, setCreateMode] = useState(false);

  const load = useCallback(() => {
    let q = '';
    if (filter === 'overdue') q = '?overdue=true';
    else if (filter) q = `?status=${filter}`;
    api(`/invoices${q}`).then(setList).catch(console.error);
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, display: 'inline-block', marginRight: 12 }}>Purchase Invoices</h3>
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">Semua</option>
            <option value="unpaid">Unpaid</option><option value="partial">Partial</option>
            <option value="paid">Paid</option><option value="overdue">Overdue</option>
          </select>
        </div>
        <button onClick={() => setCreateMode(true)} style={btnPrimary}>+ Input Invoice</button>
      </div>

      {createMode && <InvoiceForm onClose={() => { setCreateMode(false); load(); }} />}
      {detail && <InvoiceDetail invId={detail} onClose={() => { setDetail(null); load(); }} />}

      <table style={tableStyle}>
        <thead>
          <tr>
            <th>Invoice No</th><th>Supplier</th><th>PO</th><th>Inv Date</th>
            <th>Due Date</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          {list.map(inv => {
            const outstanding = inv.total - (inv.paid_amount || 0);
            const overdue = inv.status !== 'paid' && inv.due_date < Math.floor(Date.now()/1000);
            return (
              <tr key={inv.id}>
                <td><b>{inv.invoice_number}</b></td>
                <td>{inv.supplier_name}</td>
                <td>{inv.po_number}</td>
                <td>{fmtDate(inv.invoice_date)}</td>
                <td style={{ color: overdue ? '#dc2626' : 'inherit', fontWeight: overdue ? 600 : 400 }}>
                  {fmtDate(inv.due_date)}{overdue && ' ⚠️'}
                </td>
                <td>{fmtIDR(inv.total)}</td>
                <td>{fmtIDR(inv.paid_amount)}</td>
                <td>{fmtIDR(outstanding)}</td>
                <td><StatusBadge status={overdue ? 'overdue' : inv.status} /></td>
                <td><button onClick={() => setDetail(inv.id)} style={btnSmall}>Detail</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InvoiceForm({ onClose }) {
  const [pos, setPos] = useState([]);
  const [f, setF] = useState({
    po_id: '', supplier_invoice_no: '', invoice_date: fromUnixSec(Math.floor(Date.now()/1000)),
    due_date: '', subtotal: 0, tax_amount: 0, discount: 0, total: 0, notes: ''
  });

  useEffect(() => { api('/po?status=received').then(setPos); }, []);
  const total = (parseFloat(f.subtotal)||0) + (parseFloat(f.tax_amount)||0) - (parseFloat(f.discount)||0);

  const submit = async () => {
    if (!f.po_id) return alert('Pilih PO');
    try {
      const result = await api('/invoices', { method: 'POST', body: {
        ...f, total,
        invoice_date: toUnixSec(f.invoice_date),
        due_date: toUnixSec(f.due_date)
      }});
      alert(`Invoice created: ${result.invoice_number}`);
      onClose();
    } catch (e) { alert(e.message); }
  };

  const selectPO = (poId) => {
    const po = pos.find(p => p.id === parseInt(poId,10));
    if (po) setF({ ...f, po_id: poId, subtotal: po.subtotal, tax_amount: po.tax_amount, discount: po.discount });
  };

  return (
    <div style={formCard}>
      <h4>Input Purchase Invoice</h4>
      <div style={formGrid}>
        <label>PO*
          <select value={f.po_id} onChange={e=>selectPO(e.target.value)}>
            <option value="">-- Pilih PO (sudah received) --</option>
            {pos.map(p => <option key={p.id} value={p.id}>{p.po_number} - {p.supplier_name} ({fmtIDR(p.total)})</option>)}
          </select>
        </label>
        <label>No. Invoice Supplier <input value={f.supplier_invoice_no} onChange={e=>setF({...f,supplier_invoice_no:e.target.value})} /></label>
        <label>Tanggal Invoice <input type="date" value={f.invoice_date} onChange={e=>setF({...f,invoice_date:e.target.value})} /></label>
        <label>Due Date <input type="date" value={f.due_date} onChange={e=>setF({...f,due_date:e.target.value})} /></label>
        <label>Subtotal <input type="number" value={f.subtotal} onChange={e=>setF({...f,subtotal:e.target.value})} /></label>
        <label>Tax <input type="number" value={f.tax_amount} onChange={e=>setF({...f,tax_amount:e.target.value})} /></label>
        <label>Discount <input type="number" value={f.discount} onChange={e=>setF({...f,discount:e.target.value})} /></label>
        <label>Total <input type="number" value={total} disabled style={{background:'#f3f4f6'}} /></label>
        <label style={{gridColumn:'1/-1'}}>Notes <textarea value={f.notes} onChange={e=>setF({...f,notes:e.target.value})} rows={2} /></label>
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={submit} style={btnPrimary}>Simpan</button>{' '}
        <button onClick={onClose} style={btnSecondary}>Batal</button>
      </div>
    </div>
  );
}

function InvoiceDetail({ invId, onClose }) {
  const [inv, setInv] = useState(null);
  const [payMode, setPayMode] = useState(false);
  const load = useCallback(() => api(`/invoices/${invId}`).then(setInv), [invId]);
  useEffect(() => { load(); }, [load]);
  if (!inv) return null;
  const outstanding = inv.total - inv.paid_amount;

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <h3>{inv.invoice_number} <StatusBadge status={inv.status} /></h3>
          <button onClick={onClose} style={btnSmall}>×</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, fontSize:13, marginBottom:12 }}>
          <div><b>Supplier:</b> {inv.supplier_name}</div>
          <div><b>PO:</b> {inv.po_number}</div>
          <div><b>No. Supplier:</b> {inv.supplier_invoice_no || '-'}</div>
          <div><b>Inv Date:</b> {fmtDate(inv.invoice_date)}</div>
          <div><b>Due Date:</b> {fmtDate(inv.due_date)}</div>
          <div><b>Subtotal:</b> {fmtIDR(inv.subtotal)}</div>
          <div><b>Tax:</b> {fmtIDR(inv.tax_amount)}</div>
          <div><b>Discount:</b> {fmtIDR(inv.discount)}</div>
          <div><b>Total:</b> <span style={{fontSize:16, fontWeight:600}}>{fmtIDR(inv.total)}</span></div>
          <div><b>Paid:</b> {fmtIDR(inv.paid_amount)}</div>
          <div style={{gridColumn:'1/-1'}}><b>Outstanding:</b> <span style={{fontSize:16, fontWeight:600, color: outstanding>0?'#dc2626':'#10b981'}}>{fmtIDR(outstanding)}</span></div>
        </div>

        {inv.payments && inv.payments.length > 0 && (
          <>
            <h4>Riwayat Pembayaran</h4>
            <table style={tableStyle}>
              <thead><tr><th>No. Payment</th><th>Tanggal</th><th>Jumlah</th><th>Metode</th><th>Reference</th><th>Paid by</th></tr></thead>
              <tbody>
                {inv.payments.map(p => (
                  <tr key={p.id}>
                    <td>{p.payment_number}</td><td>{fmtDate(p.payment_date)}</td>
                    <td>{fmtIDR(p.amount)}</td><td>{p.method}</td>
                    <td>{p.reference || '-'}</td><td>{p.paid_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {inv.status !== 'paid' && !payMode && (
          <button onClick={() => setPayMode(true)} style={btnPrimary}>+ Bayar Invoice</button>
        )}
        {payMode && <PaymentForm invoice={inv} onDone={() => { setPayMode(false); load(); }} />}
      </div>
    </div>
  );
}

function PaymentForm({ invoice, onDone }) {
  const outstanding = invoice.total - invoice.paid_amount;
  const [f, setF] = useState({
    payment_date: fromUnixSec(Math.floor(Date.now()/1000)),
    amount: outstanding, method: 'transfer', reference: '', paid_by: '', notes: ''
  });

  const submit = async () => {
    if (!f.paid_by) return alert('Nama paid_by wajib');
    try {
      const result = await api('/payments', { method: 'POST', body: {
        ...f, invoice_id: invoice.id, amount: parseFloat(f.amount),
        payment_date: toUnixSec(f.payment_date)
      }});
      alert(`Payment recorded: ${result.payment_number}\nStatus invoice: ${result.invoice_status}\nFinance expense ID: ${result.expense_id || 'n/a'}`);
      onDone();
    } catch (e) { alert(e.message); }
  };

  return (
    <div style={{ marginTop: 12, padding: 12, background: '#fef3c7', border:'1px solid #fcd34d', borderRadius: 8 }}>
      <h4>Bayar Invoice</h4>
      <div style={formGrid}>
        <label>Tanggal Bayar <input type="date" value={f.payment_date} onChange={e=>setF({...f,payment_date:e.target.value})} /></label>
        <label>Jumlah (max {fmtIDR(outstanding)}) <input type="number" max={outstanding} value={f.amount} onChange={e=>setF({...f,amount:e.target.value})} /></label>
        <label>Metode
          <select value={f.method} onChange={e=>setF({...f,method:e.target.value})}>
            <option>cash</option><option>transfer</option><option>check</option><option>debit</option>
          </select>
        </label>
        <label>Reference <input value={f.reference} onChange={e=>setF({...f,reference:e.target.value})} placeholder="No. transfer/cek" /></label>
        <label>Paid by* <input value={f.paid_by} onChange={e=>setF({...f,paid_by:e.target.value})} /></label>
        <label style={{gridColumn:'1/-1'}}>Notes <textarea value={f.notes} onChange={e=>setF({...f,notes:e.target.value})} rows={2} /></label>
      </div>
      <p style={{ fontSize: 12, color: '#92400e' }}>⚠️ Payment akan otomatis tercatat sebagai expense di Finance (COGS - Bahan Baku).</p>
      <button onClick={submit} style={btnPrimary}>Bayar</button>{' '}
      <button onClick={onDone} style={btnSecondary}>Batal</button>
    </div>
  );
}

// ============================================================
// PAYMENTS HISTORY
// ============================================================
function Payments() {
  const [list, setList] = useState([]);
  useEffect(() => { api('/payments').then(setList).catch(console.error); }, []);

  const total = list.reduce((s,p)=>s+(p.amount||0), 0);

  return (
    <div>
      <h3 style={{ margin: 0, marginBottom: 12 }}>Riwayat Pembayaran ({list.length}) — Total {fmtIDR(total)}</h3>
      <table style={tableStyle}>
        <thead><tr><th>No. Payment</th><th>Tanggal</th><th>Supplier</th><th>Invoice</th><th>Jumlah</th><th>Metode</th><th>Reference</th><th>Paid by</th><th>Expense ID</th></tr></thead>
        <tbody>
          {list.map(p => (
            <tr key={p.id}>
              <td><b>{p.payment_number}</b></td>
              <td>{fmtDate(p.payment_date)}</td>
              <td>{p.supplier_name}</td>
              <td>{p.invoice_number}</td>
              <td>{fmtIDR(p.amount)}</td>
              <td>{p.method}</td>
              <td>{p.reference || '-'}</td>
              <td>{p.paid_by}</td>
              <td>{p.finance_expense_id || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================
const tableStyle = { width: '100%', borderCollapse: 'collapse', background: '#fff', fontSize: 13 };
const btnPrimary = { padding: '6px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 };
const btnSecondary = { padding: '6px 14px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 4, cursor: 'pointer' };
const btnSmall = { padding: '4px 10px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 12 };
const btnSmallDanger = { padding: '4px 10px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer', fontSize: 12 };
const formCard = { background: '#f9fafb', padding: 16, borderRadius: 8, marginBottom: 16, border: '1px solid #e5e7eb' };
const formGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 };
const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalBox = { background: '#fff', borderRadius: 8, padding: 20, maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto', minWidth: 700 };

// Add base table cell styling (inline since no CSS file context)
if (typeof document !== 'undefined' && !document.getElementById('procurement-styles')) {
  const style = document.createElement('style');
  style.id = 'procurement-styles';
  style.textContent = `
    .procurement-tab table th { background: #f3f4f6; padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-transform: uppercase; color: #6b7280; }
    .procurement-tab table td { padding: 8px; border-bottom: 1px solid #f3f4f6; }
    .procurement-tab input, .procurement-tab select, .procurement-tab textarea { padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 13px; width: 100%; box-sizing: border-box; }
    .procurement-tab label { display: block; font-size: 12px; color: #374151; font-weight: 500; margin-bottom: 4px; }
  `;
  document.head.appendChild(style);
}
