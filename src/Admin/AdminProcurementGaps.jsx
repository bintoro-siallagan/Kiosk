// client/src/Admin/AdminProcurementGaps.jsx
// Procurement Wave 2 admin UI — Returns + Advances + Invoice Aging + PR Suggest.
// Pasangkan ke AdminProcurement.jsx existing sebagai tab tambahan, atau standalone.
import React, { useState, useEffect, useCallback } from 'react';

const API_HOST = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const API = API_HOST + '/api/procurement';
const fmtIDR = (n) => new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', maximumFractionDigits:0 }).format(Math.round(n||0));
const fmtDate = (sec) => sec ? new Date(sec*1000).toLocaleDateString('id-ID', {day:'2-digit',month:'short',year:'numeric'}) : '-';
const today = () => Math.floor(new Date().setHours(0,0,0,0)/1000);

async function api(p, opts={}) {
  const res = await fetch(`${API}${p}`, { headers:{'Content-Type':'application/json'}, ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (!res.ok) { const err = await res.json().catch(()=>({error:res.statusText})); throw new Error(err.error || `HTTP ${res.status}`); }
  return res.json();
}

export default function AdminProcurementGaps() {
  const [tab, setTab] = useState('dashboard');
  const tabs = [
    {k:'dashboard', l:'Dashboard'},
    {k:'returns', l:'Returns'},
    {k:'advances', l:'Advances (DP)'},
    {k:'aging', l:'Invoice Aging'},
    {k:'suggest', l:'PR Suggest'},
  ];
  return (
    <div className="proc-gaps" style={{padding:16}}>
      <h2 style={{marginTop:0}}>Procurement — Wave 2</h2>
      <div style={{display:'flex', gap:4, borderBottom:'1px solid #e5e7eb', marginBottom:16, flexWrap:'wrap'}}>
        {tabs.map(t => (
          <button key={t.k} onClick={()=>setTab(t.k)} style={tabBtn(tab===t.k)}>{t.l}</button>
        ))}
      </div>
      {tab==='dashboard' && <Dashboard />}
      {tab==='returns' && <Returns />}
      {tab==='advances' && <Advances />}
      {tab==='aging' && <InvoiceAging />}
      {tab==='suggest' && <PRSuggest />}
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
function Dashboard() {
  const [data, setData] = useState(null);
  useEffect(()=>{ api('/wave2-dashboard').then(setData).catch(console.error); }, []);
  if (!data) return <div>Loading...</div>;
  const ag = data.aging_summary || {};
  return (
    <div>
      <h3>Invoice Aging Summary</h3>
      <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:8, marginBottom:20}}>
        {[
          {k:'current', l:'Belum Jatuh Tempo', color:'#10b981'},
          {k:'b1', l:'0-30 hari', color:'#f59e0b'},
          {k:'b2', l:'31-60 hari', color:'#f97316'},
          {k:'b3', l:'61-90 hari', color:'#ef4444'},
          {k:'b4', l:'90+ kritis', color:'#991b1b'},
        ].map(b => (
          <div key={b.k} style={{...card, borderTop:`3px solid ${b.color}`}}>
            <div style={cardLabel}>{b.l}</div>
            <div style={{...cardAmount, fontSize:18, color:b.color}}>{fmtIDR(ag[b.k]||0)}</div>
          </div>
        ))}
      </div>
      <div style={{padding:12, background:'#f9fafb', borderRadius:8, marginBottom:20}}>
        Total Outstanding AP: <b style={{fontSize:20, color: ag.b4 > 0 ? '#dc2626' : '#1f2937'}}>{fmtIDR(ag.total_outstanding||0)}</b>
      </div>

      <h3>Urgent PR Suggestions</h3>
      {data.urgent_pr_suggestions.length === 0 ? <div style={{color:'#10b981'}}>✓ No urgent restocks</div> : (
        <table style={tableStyle}>
          <thead><tr><th>SKU</th><th>Current</th><th>Avg/Day</th><th>Suggested</th><th>Reasoning</th></tr></thead>
          <tbody>
            {data.urgent_pr_suggestions.map(s => (
              <tr key={s.sku} style={{background:'#fef2f2'}}>
                <td><b>{s.sku}</b><br/><span style={{fontSize:11, color:'#6b7280'}}>{s.name}</span></td>
                <td>{s.current_stock?.toFixed(1)} {s.unit}</td>
                <td>{s.avg_daily_consumption?.toFixed(2)}</td>
                <td><b style={{color:'#dc2626'}}>{s.suggested_qty.toFixed(0)} {s.unit}</b></td>
                <td style={{fontSize:12}}>{s.reasoning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{marginTop:20}}>Recent Returns</h3>
      <table style={tableStyle}>
        <thead><tr><th>Doc</th><th>Tanggal</th><th>Supplier</th><th>Reason</th><th>Value</th><th>Status</th></tr></thead>
        <tbody>
          {data.recent_returns.map(r => (
            <tr key={r.id}>
              <td>{r.doc_no}</td>
              <td>{fmtDate(r.return_date)}</td>
              <td>{r.supplier_name || '-'}</td>
              <td>{r.reason}</td>
              <td>{fmtIDR(r.total_value)}</td>
              <td><StatusPill v={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{marginTop:20}}>Pending Advances (DP Belum Habis)</h3>
      <table style={tableStyle}>
        <thead><tr><th>Doc</th><th>Tanggal</th><th>Supplier</th><th>Amount</th><th>Applied</th><th>Sisa</th><th>Status</th></tr></thead>
        <tbody>
          {data.pending_advances.map(a => (
            <tr key={a.id}>
              <td>{a.doc_no}</td>
              <td>{fmtDate(a.advance_date)}</td>
              <td>{a.supplier_name || '-'}</td>
              <td>{fmtIDR(a.amount)}</td>
              <td>{fmtIDR(a.applied_amount)}</td>
              <td><b>{fmtIDR(a.remaining_amount)}</b></td>
              <td><StatusPill v={a.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// RETURNS
// ============================================================
function Returns() {
  const [list, setList] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const load = useCallback(()=>api('/returns').then(setList).catch(console.error), []);
  useEffect(()=>{ load(); }, [load]);

  const finalize = async (id) => {
    const credit = prompt('Credit Note ref (optional)?');
    const refund = prompt('Refund method (credit_note / cash / transfer)?', 'credit_note');
    if (!confirm('Finalize akan reverse stock dari warehouse. Lanjut?')) return;
    try {
      const r = await api(`/returns/${id}/finalize`, {method:'POST', body:{
        finalized_by: 'admin', credit_note_ref: credit || null, refund_method: refund
      }});
      alert(`Finalized! Stock adjustments: ${r.stock_adjustments.length}`);
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', marginBottom:12}}>
        <h3 style={{margin:0}}>Purchase Returns ({list.length})</h3>
        <button onClick={()=>setShowForm(true)} style={btnPrimary}>+ Return</button>
      </div>
      {showForm && <ReturnForm onClose={()=>{setShowForm(false); load();}} />}
      <table style={tableStyle}>
        <thead><tr><th>Doc No</th><th>Tanggal</th><th>Supplier</th><th>Reason</th><th>Items</th><th>Value</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {list.map(r => (
            <tr key={r.id}>
              <td>{r.doc_no}</td>
              <td>{fmtDate(r.return_date)}</td>
              <td>{r.supplier_name || '-'}</td>
              <td>{r.reason}</td>
              <td>{r.item_count}</td>
              <td>{fmtIDR(r.total_value)}</td>
              <td><StatusPill v={r.status} /></td>
              <td>
                {r.status === 'draft' && <button onClick={()=>finalize(r.id)} style={btnPrimary}>Finalize</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReturnForm({onClose}) {
  const [suppliers, setSuppliers] = useState([]);
  const [grOptions, setGrOptions] = useState([]);
  const [f, setF] = useState({
    gr_id: '', supplier_id: '', reason: 'damaged', notes: '',
    return_date: today(),
    items: [{sku:'', name:'', qty:0, unit:'pcs', unit_price:0, item_reason:''}]
  });

  useEffect(()=>{
    fetch(`${API}/suppliers`).then(r=>r.json()).then(setSuppliers).catch(()=>{});
    fetch(`${API}/gr`).then(r=>r.json()).then(setGrOptions).catch(()=>{});
  }, []);

  const update = (k) => (e) => setF({...f, [k]: e.target.value});
  const updateItem = (i, k, v) => {
    const items = [...f.items]; items[i] = {...items[i], [k]: v}; setF({...f, items});
  };
  const addItem = () => setF({...f, items:[...f.items, {sku:'', name:'', qty:0, unit:'pcs', unit_price:0}]});
  const removeItem = (i) => setF({...f, items: f.items.filter((_, idx)=> idx !== i)});

  const submit = async () => {
    if (!f.gr_id || !f.supplier_id) return alert('GR + Supplier wajib');
    if (f.items.filter(i => i.sku && i.qty > 0).length === 0) return alert('At least 1 item');
    try {
      await api('/returns', {method:'POST', body:{
        ...f,
        gr_id: Number(f.gr_id), supplier_id: Number(f.supplier_id),
        items: f.items.filter(i => i.sku && i.qty > 0).map(i => ({...i, qty:Number(i.qty), unit_price:Number(i.unit_price)})),
        created_by: 'admin'
      }});
      onClose();
    } catch (e) { alert(e.message); }
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={e=>e.stopPropagation()}>
        <h3>Buat Purchase Return</h3>
        <div style={formGrid}>
          <label>GR Reference* <select value={f.gr_id} onChange={update('gr_id')}>
            <option value="">- pilih GR -</option>
            {grOptions.map(g => <option key={g.id} value={g.id}>{g.doc_no || `GR #${g.id}`}</option>)}
          </select></label>
          <label>Supplier* <select value={f.supplier_id} onChange={update('supplier_id')}>
            <option value="">- pilih supplier -</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
          <label>Reason* <select value={f.reason} onChange={update('reason')}>
            <option value="damaged">Damaged</option>
            <option value="wrong_item">Wrong Item</option>
            <option value="expired">Expired</option>
            <option value="quality_issue">Quality Issue</option>
            <option value="overstock">Overstock</option>
            <option value="other">Other</option>
          </select></label>
          <label>Tanggal <input type="date" value={new Date(f.return_date*1000).toISOString().slice(0,10)}
            onChange={e=>setF({...f, return_date: Math.floor(new Date(e.target.value).getTime()/1000)})} /></label>
          <label style={{gridColumn:'1/-1'}}>Notes <textarea value={f.notes} onChange={update('notes')} rows={2} /></label>
        </div>

        <h4 style={{marginTop:16, marginBottom:8}}>Items to Return</h4>
        <table style={tableStyle}>
          <thead><tr><th>SKU</th><th>Nama</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {f.items.map((it, i) => (
              <tr key={i}>
                <td><input value={it.sku} onChange={e=>updateItem(i,'sku',e.target.value)} placeholder="SKU" /></td>
                <td><input value={it.name} onChange={e=>updateItem(i,'name',e.target.value)} placeholder="(optional)" /></td>
                <td><input type="number" step="0.001" value={it.qty} onChange={e=>updateItem(i,'qty',e.target.value)} style={{width:80}} /></td>
                <td><select value={it.unit} onChange={e=>updateItem(i,'unit',e.target.value)} style={{width:70}}>
                  <option>pcs</option><option>gr</option><option>kg</option><option>ml</option><option>l</option><option>btl</option><option>pak</option>
                </select></td>
                <td><input type="number" value={it.unit_price} onChange={e=>updateItem(i,'unit_price',e.target.value)} style={{width:100}} /></td>
                <td>{fmtIDR(Number(it.qty)*Number(it.unit_price))}</td>
                <td><button onClick={()=>removeItem(i)} style={btnDanger}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addItem} style={btn}>+ Item</button>

        <div style={{marginTop:16}}>
          <button onClick={submit} style={btnPrimary}>Simpan Draft</button>{' '}
          <button onClick={onClose} style={btn}>Batal</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ADVANCES (DP)
// ============================================================
function Advances() {
  const [list, setList] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const load = useCallback(()=>api('/advances').then(setList), []);
  useEffect(()=>{
    fetch(`${API}/suppliers`).then(r=>r.json()).then(setSuppliers).catch(()=>{});
    load();
  }, [load]);

  const applyAdv = async (id, remaining) => {
    const invoiceId = prompt('Invoice ID untuk apply DP?');
    if (!invoiceId) return;
    const amount = parseFloat(prompt(`Amount to apply (max ${remaining})?`, remaining));
    if (!amount) return;
    try {
      await api(`/advances/${id}/apply`, {method:'POST', body:{
        amount, invoice_id: Number(invoiceId), applied_by: 'admin'
      }});
      load();
    } catch (e) { alert(e.message); }
  };

  const refundAdv = async (id) => {
    if (!confirm('Refund sisa DP? Status jadi refunded.')) return;
    await api(`/advances/${id}/refund`, {method:'POST', body:{refunded_by:'admin'}});
    load();
  };

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', marginBottom:12}}>
        <h3 style={{margin:0}}>Advance Purchases / DP ({list.length})</h3>
        <button onClick={()=>setShowForm(true)} style={btnPrimary}>+ DP</button>
      </div>
      {showForm && <AdvanceForm suppliers={suppliers} onClose={()=>{setShowForm(false); load();}} />}
      <table style={tableStyle}>
        <thead><tr><th>Doc</th><th>Tanggal</th><th>Supplier</th><th>PO Ref</th><th>Amount</th><th>Applied</th><th>Sisa</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {list.map(a => (
            <tr key={a.id}>
              <td>{a.doc_no}</td>
              <td>{fmtDate(a.advance_date)}</td>
              <td>{a.supplier_name || '-'}</td>
              <td>{a.po_doc_no || '-'}</td>
              <td>{fmtIDR(a.amount)}</td>
              <td>{fmtIDR(a.applied_amount)}</td>
              <td><b>{fmtIDR(a.remaining_amount)}</b></td>
              <td><StatusPill v={a.status} /></td>
              <td>
                {(a.status === 'pending' || a.status === 'partial') && a.remaining_amount > 0 && (
                  <>
                    <button onClick={()=>applyAdv(a.id, a.remaining_amount)} style={btnSmall}>Apply</button>{' '}
                    <button onClick={()=>refundAdv(a.id)} style={btnDanger}>Refund</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdvanceForm({suppliers, onClose}) {
  const [f, setF] = useState({supplier_id:'', po_id:'', advance_date:today(), amount:0,
    payment_method:'transfer', reference:'', notes:''});
  const update = (k) => (e) => setF({...f, [k]:e.target.value});
  const submit = async () => {
    if (!f.supplier_id || !f.amount) return alert('supplier + amount wajib');
    try {
      await api('/advances', {method:'POST', body:{...f,
        supplier_id:Number(f.supplier_id), po_id: f.po_id ? Number(f.po_id) : null,
        amount:Number(f.amount), created_by:'admin'}});
      onClose();
    } catch (e) { alert(e.message); }
  };
  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={e=>e.stopPropagation()}>
        <h3>Buat Advance Purchase (DP)</h3>
        <div style={formGrid}>
          <label>Supplier* <select value={f.supplier_id} onChange={update('supplier_id')}>
            <option value="">-</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
          <label>PO ID (optional) <input value={f.po_id} onChange={update('po_id')} placeholder="link ke PO" /></label>
          <label>Tanggal <input type="date" value={new Date(f.advance_date*1000).toISOString().slice(0,10)}
            onChange={e=>setF({...f, advance_date: Math.floor(new Date(e.target.value).getTime()/1000)})} /></label>
          <label>Amount* <input type="number" value={f.amount} onChange={update('amount')} /></label>
          <label>Payment Method <select value={f.payment_method} onChange={update('payment_method')}>
            <option>transfer</option><option>cash</option><option>check</option>
          </select></label>
          <label>Reference (bank trx ref) <input value={f.reference} onChange={update('reference')} /></label>
          <label style={{gridColumn:'1/-1'}}>Notes <textarea value={f.notes} onChange={update('notes')} rows={2} /></label>
        </div>
        <div style={{marginTop:16}}>
          <button onClick={submit} style={btnPrimary}>Simpan</button>{' '}
          <button onClick={onClose} style={btn}>Batal</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// INVOICE AGING
// ============================================================
function InvoiceAging() {
  const [data, setData] = useState(null);
  useEffect(()=>{ api('/invoice-aging').then(setData).catch(console.error); }, []);
  if (!data) return <div>Loading...</div>;
  if (data.error) return <div style={{padding:20, background:'#fef2f2', color:'#991b1b', borderRadius:8}}>
    Error: {data.error}<br/><span style={{fontSize:12}}>{data.hint}</span></div>;

  return (
    <div>
      <h3>Per-Supplier Outstanding</h3>
      <table style={tableStyle}>
        <thead><tr><th>Supplier</th><th>Current</th><th>0-30</th><th>31-60</th><th>61-90</th><th>90+</th><th>Total</th></tr></thead>
        <tbody>
          {data.by_supplier.map(s => (
            <tr key={s.id} style={{background: s.b4 > 0 ? '#fef2f2' : 'transparent'}}>
              <td><b>{s.name}</b></td>
              <td>{fmtIDR(s.current)}</td>
              <td style={{color: s.b1 > 0 ? '#f59e0b' : '#6b7280'}}>{fmtIDR(s.b1)}</td>
              <td style={{color: s.b2 > 0 ? '#f97316' : '#6b7280'}}>{fmtIDR(s.b2)}</td>
              <td style={{color: s.b3 > 0 ? '#ef4444' : '#6b7280'}}>{fmtIDR(s.b3)}</td>
              <td style={{color: s.b4 > 0 ? '#991b1b' : '#6b7280', fontWeight:600}}>{fmtIDR(s.b4)}</td>
              <td><b>{fmtIDR(s.total)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{marginTop:20}}>Invoice Detail by Bucket</h3>
      {Object.entries(data.buckets).map(([k, invoices]) => invoices.length > 0 && (
        <div key={k} style={{marginBottom:16}}>
          <h4>{data.labels[k]} ({invoices.length})</h4>
          <table style={tableStyle}>
            <thead><tr><th>Invoice</th><th>Supplier</th><th>Tanggal</th><th>Due Date</th><th>Days Overdue</th><th>Outstanding</th></tr></thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td>{inv.doc_no}</td>
                  <td>{inv.supplier_name}</td>
                  <td>{fmtDate(inv.invoice_date)}</td>
                  <td>{fmtDate(inv.due_date)}</td>
                  <td>{inv.days_overdue}</td>
                  <td><b>{fmtIDR(inv.outstanding)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// PR SUGGEST
// ============================================================
function PRSuggest() {
  const [data, setData] = useState(null);
  const [params, setParams] = useState({lookback_days:14, forecast_days:14, safety_days:7});
  const [filter, setFilter] = useState('all');
  const load = useCallback(()=>{
    const q = new URLSearchParams(params);
    api(`/pr-suggest?${q}`).then(setData);
  }, [params]);
  useEffect(()=>{ load(); }, [load]);

  const generateDraft = async (urgency) => {
    if (!confirm(`Generate draft PR untuk semua item urgency=${urgency.join('/')}?`)) return;
    try {
      const r = await api('/pr-suggest/generate-draft', {method:'POST', body:{
        urgency_filter: urgency, ...params
      }});
      if (r.items_count === 0) return alert('Tidak ada urgent items');
      alert(`Draft PR: ${r.items_count} items siap. ${r.hint}\n\nCopy shape ini ke /api/procurement/pr POST untuk create draft.`);
      console.log('Draft PR shape:', r.draft_pr);
    } catch (e) { alert(e.message); }
  };

  if (!data) return <div>Loading...</div>;

  const filtered = filter === 'all' ? data.suggestions : data.suggestions.filter(s => s.urgency === filter);

  return (
    <div>
      <div style={{display:'flex', gap:8, marginBottom:16, alignItems:'center', flexWrap:'wrap'}}>
        <span>Lookback: <input type="number" value={params.lookback_days} onChange={e=>setParams({...params, lookback_days:Number(e.target.value)})} style={{width:60}} /> hari</span>
        <span>Forecast: <input type="number" value={params.forecast_days} onChange={e=>setParams({...params, forecast_days:Number(e.target.value)})} style={{width:60}} /> hari</span>
        <span>Safety: <input type="number" value={params.safety_days} onChange={e=>setParams({...params, safety_days:Number(e.target.value)})} style={{width:60}} /> hari</span>
        <button onClick={load} style={btn}>Refresh</button>
        <select value={filter} onChange={e=>setFilter(e.target.value)}>
          <option value="all">Semua urgency</option>
          <option value="high">High only</option>
          <option value="medium">Medium only</option>
          <option value="low">Low only</option>
        </select>
        <button onClick={()=>generateDraft(['high'])} style={btnDanger}>Gen Draft (High)</button>
        <button onClick={()=>generateDraft(['high','medium'])} style={btnPrimary}>Gen Draft (High+Med)</button>
      </div>

      <table style={tableStyle}>
        <thead><tr><th>SKU</th><th>Current</th><th>Avg/Day</th><th>Forecast Usage</th><th>Stock After</th><th>Suggested</th><th>Urgency</th><th>Reasoning</th></tr></thead>
        <tbody>
          {filtered.map(s => (
            <tr key={s.sku} style={{background: s.urgency==='high' ? '#fef2f2' : s.urgency==='medium' ? '#fef3c7' : 'transparent'}}>
              <td><b>{s.sku}</b><br/><span style={{fontSize:11, color:'#6b7280'}}>{s.name}</span></td>
              <td>{s.current_stock?.toFixed(1)} {s.unit}</td>
              <td>{s.avg_daily_consumption?.toFixed(2)}</td>
              <td>{s.forecast_usage_for_period?.toFixed(1)}</td>
              <td style={{color: s.stock_after_forecast < 0 ? '#dc2626' : '#10b981'}}>{s.stock_after_forecast?.toFixed(1)}</td>
              <td><b>{s.suggested_qty > 0 ? `${s.suggested_qty} ${s.unit}` : '-'}</b></td>
              <td><UrgencyPill v={s.urgency} /></td>
              <td style={{fontSize:12}}>{s.reasoning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// SHARED
// ============================================================
function StatusPill({v}) {
  const map = {
    draft:'#9ca3af', finalized:'#10b981', voided:'#dc2626',
    pending:'#f59e0b', applied:'#10b981', partial:'#f97316', refunded:'#6b7280'
  };
  return <span style={{padding:'2px 8px', borderRadius:4, fontSize:10, fontWeight:600, textTransform:'uppercase',
    background: (map[v] || '#9ca3af')+'33', color: map[v] || '#374151'}}>{v}</span>;
}

function UrgencyPill({v}) {
  const map = {high:{bg:'#fee2e2', c:'#991b1b'}, medium:{bg:'#fef3c7', c:'#92400e'}, low:{bg:'#d1fae5', c:'#065f46'}};
  const m = map[v] || {bg:'#f3f4f6', c:'#374151'};
  return <span style={{padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:600, textTransform:'uppercase', background:m.bg, color:m.c}}>{v}</span>;
}

const tabBtn = (active) => ({padding:'8px 14px', border:'none', background:'transparent',
  borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
  color: active ? '#3b82f6' : '#374151', fontWeight: active ? 600 : 400, cursor:'pointer'});
const card = {background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, padding:12};
const cardLabel = {fontSize:10, textTransform:'uppercase', color:'#6b7280', letterSpacing:'0.05em', fontWeight:700};
const cardAmount = {fontSize:22, fontWeight:700, marginTop:4};
const tableStyle = {width:'100%', borderCollapse:'collapse', background:'#fff', fontSize:13};
const btn = {padding:'6px 14px', background:'#f3f4f6', border:'1px solid #d1d5db', borderRadius:4, cursor:'pointer', fontSize:13};
const btnPrimary = {padding:'6px 14px', background:'#3b82f6', color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontWeight:600};
const btnDanger = {padding:'4px 10px', background:'#fee2e2', color:'#dc2626', border:'1px solid #fca5a5', borderRadius:4, cursor:'pointer', fontSize:12};
const btnSmall = {padding:'4px 10px', background:'#dbeafe', color:'#1e40af', border:'1px solid #93c5fd', borderRadius:4, cursor:'pointer', fontSize:12};
const formGrid = {display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:12};
const modalOverlay = {position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000};
const modalBox = {background:'#fff', borderRadius:8, padding:20, maxWidth:'95vw', maxHeight:'90vh', overflow:'auto', minWidth:700};

if (typeof document !== 'undefined' && !document.getElementById('proc-gaps-styles')) {
  const s = document.createElement('style');
  s.id = 'proc-gaps-styles';
  s.textContent = `
    .proc-gaps table th { background:#f3f4f6; padding:8px; text-align:left; border-bottom:1px solid #e5e7eb; font-size:11px; text-transform:uppercase; color:#6b7280; }
    .proc-gaps table td { padding:8px; border-bottom:1px solid #f3f4f6; vertical-align:top; }
    .proc-gaps input, .proc-gaps select, .proc-gaps textarea { padding:6px 8px; border:1px solid #d1d5db; border-radius:4px; font-size:13px; box-sizing:border-box; }
    .proc-gaps label { display:block; font-size:12px; color:#374151; font-weight:500; margin-bottom:4px; }
    .proc-gaps label input, .proc-gaps label select, .proc-gaps label textarea { width:100%; margin-top:4px; }
  `;
  document.head.appendChild(s);
}
