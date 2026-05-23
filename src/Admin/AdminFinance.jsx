// client/src/Admin/AdminFinance.jsx
// Finance tab: Dashboard (P&L), Expenses CRUD, Tax Config, COGS Detail, Reports
import React, { useState, useEffect, useCallback } from 'react';
import { useUiKit } from "../components/uiKit.jsx";

const API = '/api/finance';

const fmtIDR = (n) => new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', maximumFractionDigits:0 }).format(Math.round(n || 0));
const fmtPct = (n) => `${(n || 0).toFixed(1)}%`;
const fmtDate = (sec) => sec ? new Date(sec*1000).toLocaleDateString('id-ID', {day:'2-digit',month:'short',year:'numeric'}) : '-';
const today = () => Math.floor(new Date().setHours(0,0,0,0)/1000);
const monthAgo = () => today() - 30*86400;
const yearStart = () => Math.floor(new Date(new Date().getFullYear(),0,1).getTime()/1000);

async function api(p, opts={}) {
  const res = await fetch(`${API}${p}`, {
    headers: {'Content-Type':'application/json'},
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({error: res.statusText}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export default function AdminFinance() {
  const [tab, setTab] = useState('dashboard');
  const tabs = [
    { k:'dashboard', l:'Dashboard' },
    { k:'pl', l:'P&L Report' },
    { k:'expenses', l:'Expenses' },
    { k:'categories', l:'Categories' },
    { k:'cogs', l:'COGS Detail' },
    { k:'tax', l:'Tax Config' },
  ];
  return (
    <div className="finance-tab" style={{padding:16}}>
      <h2 style={{marginTop:0}}>Finance</h2>
      <div style={{display:'flex', gap:4, borderBottom:'1px solid #e5e7eb', marginBottom:16, flexWrap:'wrap'}}>
        {tabs.map(t => (
          <button key={t.k} onClick={()=>setTab(t.k)} style={{
            padding:'8px 14px', border:'none', background:'transparent',
            borderBottom: tab===t.k ? '2px solid #3b82f6' : '2px solid transparent',
            color: tab===t.k ? '#3b82f6' : '#374151',
            fontWeight: tab===t.k ? 600 : 400, cursor:'pointer'
          }}>{t.l}</button>
        ))}
      </div>
      {tab==='dashboard' && <Dashboard />}
      {tab==='pl' && <PLReport />}
      {tab==='expenses' && <Expenses />}
      {tab==='categories' && <CategoryAdmin />}
      {tab==='cogs' && <COGSDetail />}
      {tab==='tax' && <TaxConfig />}
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
function Dashboard() {
  const [data, setData] = useState(null);
  useEffect(() => { api('/dashboard').then(setData).catch(console.error); }, []);
  if (!data) return <div>Loading...</div>;

  const periods = [
    { k:'today', l:'Hari Ini' },
    { k:'yesterday', l:'Kemarin' },
    { k:'this_month', l:'Bulan Ini' },
  ];

  return (
    <div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:12, marginBottom:20}}>
        {periods.map(p => {
          const pl = data[p.k];
          const trend = p.k === 'today' && data.yesterday.revenue.net > 0
            ? ((pl.revenue.net - data.yesterday.revenue.net) / data.yesterday.revenue.net * 100) : null;
          return (
            <div key={p.k} style={card}>
              <div style={cardLabel}>{p.l}</div>
              <div style={cardAmount}>{fmtIDR(pl.revenue.net)}</div>
              <div style={{fontSize:11, color:'#6b7280'}}>
                {pl.revenue.order_count} orders · {fmtIDR(pl.revenue.avg_order_value)} AOV
                {trend !== null && (
                  <span style={{color: trend > 0 ? '#10b981' : '#dc2626', marginLeft:8}}>
                    {trend > 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
                  </span>
                )}
              </div>
              <div style={{marginTop:10, paddingTop:10, borderTop:'1px dashed #e5e7eb', fontSize:12}}>
                <Row label="COGS" val={fmtIDR(pl.cogs.total)} />
                <Row label="OPEX" val={fmtIDR(pl.expenses.opex_total)} />
                <Row label="Gross Margin" val={fmtPct(pl.margins.gross_margin_pct)} bold color="#10b981" />
                <Row label="Net Margin" val={fmtPct(pl.margins.net_margin_pct)} bold color={pl.margins.net_margin_pct > 0 ? '#10b981' : '#dc2626'} />
              </div>
            </div>
          );
        })}
      </div>

      <h3>Tax Aktif</h3>
      <table style={tableStyle}>
        <thead><tr><th>Tax</th><th>Rate</th><th>Applies To</th><th>Inclusive</th></tr></thead>
        <tbody>
          {data.tax_config.map(t => (
            <tr key={t.id}><td><b>{t.name}</b></td><td>{(t.rate*100).toFixed(1)}%</td><td>{t.applies_to}</td><td>{t.inclusive ? '✓' : '-'}</td></tr>
          ))}
        </tbody>
      </table>

      <h3 style={{marginTop:20}}>Expense Terbaru</h3>
      <table style={tableStyle}>
        <thead><tr><th>Doc</th><th>Tanggal</th><th>Kategori</th><th>Vendor</th><th>Amount</th></tr></thead>
        <tbody>
          {data.last_expenses.map(e => (
            <tr key={e.doc_no}><td>{e.doc_no}</td><td>{fmtDate(e.expense_date)}</td><td>{e.category}</td><td>{e.vendor || '-'}</td><td>{fmtIDR(e.amount)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({label, val, bold, color}) {
  return (
    <div style={{display:'flex', justifyContent:'space-between', padding:'2px 0'}}>
      <span>{label}</span>
      <b style={{color, fontWeight: bold ? 700 : 500}}>{val}</b>
    </div>
  );
}

// ============================================================
// P&L REPORT
// ============================================================
function PLReport() {
  const [from, setFrom] = useState(monthAgo());
  const [to, setTo] = useState(today());
  const [pl, setPl] = useState(null);
  const [tender, setTender] = useState([]);
  const [series, setSeries] = useState([]);

  const refresh = useCallback(() => {
    api(`/pl?from=${from}&to=${to}`).then(setPl);
    api(`/revenue-by-tender?from=${from}&to=${to}`).then(setTender);
    api(`/pl/by-period?from=${from}&to=${to}&granularity=day`).then(setSeries);
  }, [from, to]);

  useEffect(() => { refresh(); }, [refresh]);

  const setRange = (days) => { setFrom(today() - days*86400); setTo(today()); };

  if (!pl) return <div>Loading...</div>;

  return (
    <div>
      <div style={{display:'flex', gap:8, marginBottom:16, alignItems:'center', flexWrap:'wrap'}}>
        <input type="date" value={new Date(from*1000).toISOString().slice(0,10)}
          onChange={e => setFrom(Math.floor(new Date(e.target.value).getTime()/1000))} />
        <span>→</span>
        <input type="date" value={new Date(to*1000).toISOString().slice(0,10)}
          onChange={e => setTo(Math.floor(new Date(e.target.value).getTime()/1000))} />
        <button onClick={() => setRange(7)} style={btn}>7 hari</button>
        <button onClick={() => setRange(30)} style={btn}>30 hari</button>
        <button onClick={() => setRange(90)} style={btn}>90 hari</button>
        <button onClick={() => { setFrom(yearStart()); setTo(today()); }} style={btn}>YTD</button>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20}}>
        <div style={card}>
          <h3 style={{marginTop:0}}>Income Statement</h3>
          <PLRow label="Gross Revenue" val={pl.revenue.gross} />
          <PLRow label="(-) Refunds" val={-pl.revenue.refunds} negative />
          <PLRow label="Net Revenue" val={pl.revenue.net} bold underline />
          <PLRow label={`(-) COGS [${pl.cogs.source==='bom_consumption' ? 'BOM' : 'manual'}]`} val={-pl.cogs.total} negative />
          <PLRow label="Gross Profit" val={pl.margins.gross_profit} bold positive />
          <PLRow label={`Gross Margin`} val={`${fmtPct(pl.margins.gross_margin_pct)}`} subtitle />
          <PLRow label="(-) Operating Expenses" val={-pl.expenses.opex_total} negative />
          <PLRow label="Operating Profit" val={pl.margins.operating_profit} bold positive />
          <PLRow label={`(-) Tax (${pl.tax.breakdown.map(t => t.name).join(' + ')})`} val={-pl.tax.total} negative />
          <PLRow label="Net Profit" val={pl.margins.net_profit} bold underline positive={pl.margins.net_profit > 0} />
          <PLRow label="Net Margin" val={fmtPct(pl.margins.net_margin_pct)} subtitle />
        </div>

        <div style={card}>
          <h3 style={{marginTop:0}}>Revenue by Tender</h3>
          <table style={tableStyle}>
            <thead><tr><th>Tender</th><th>Orders</th><th>Total</th><th>%</th></tr></thead>
            <tbody>
              {tender.map(t => {
                const pct = pl.revenue.net > 0 ? (t.total / pl.revenue.net * 100) : 0;
                return (
                  <tr key={t.tender_type}>
                    <td><b>{t.tender_type}</b></td>
                    <td>{t.orders}</td>
                    <td>{fmtIDR(t.total)}</td>
                    <td>
                      <div style={{display:'flex', alignItems:'center', gap:6}}>
                        <div style={{flex:1, background:'#e5e7eb', height:6, borderRadius:3, position:'relative'}}>
                          <div style={{position:'absolute', left:0, top:0, height:6, borderRadius:3, background:'#3b82f6', width:`${Math.min(100,pct)}%`}} />
                        </div>
                        <span style={{minWidth:38, fontSize:11}}>{pct.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <h3>Expenses Breakdown</h3>
      <table style={tableStyle}>
        <thead><tr><th>Category</th><th>Type</th><th>Entries</th><th>Total</th><th>% of Revenue</th></tr></thead>
        <tbody>
          {pl.expenses.by_category.map(c => (
            <tr key={c.id}>
              <td><b>{c.name}</b></td>
              <td><span style={typePill(c.type)}>{c.type.toUpperCase()}</span></td>
              <td>{c.entries}</td>
              <td>{fmtIDR(c.amount)}</td>
              <td>{pl.revenue.net > 0 ? fmtPct(c.amount / pl.revenue.net * 100) : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{marginTop:20}}>Daily Revenue (sparkline)</h3>
      <RevenueSparkline series={series} />
    </div>
  );
}

function PLRow({label, val, bold, underline, positive, negative, subtitle}) {
  const isNum = typeof val === 'number';
  return (
    <div style={{
      display:'flex', justifyContent:'space-between',
      padding: subtitle ? '0px 0 8px' : '6px 0',
      borderBottom: underline ? '1px solid #1f2937' : 'none',
      fontSize: subtitle ? 11 : 14,
      color: subtitle ? '#6b7280' : 'inherit'
    }}>
      <span style={{fontWeight: bold ? 700 : 400}}>{label}</span>
      <span style={{
        fontWeight: bold ? 700 : 500,
        color: negative ? '#dc2626' : positive ? '#10b981' : 'inherit'
      }}>{isNum ? fmtIDR(val) : val}</span>
    </div>
  );
}

function RevenueSparkline({series}) {
  if (!series.length) return <div style={{color:'#9ca3af'}}>No data</div>;
  const max = Math.max(...series.map(s => s.revenue));
  return (
    <div style={{display:'flex', gap:2, alignItems:'flex-end', height:120, background:'#f9fafb', padding:10, borderRadius:8}}>
      {series.map((s, i) => (
        <div key={i} title={`${s.period}: ${fmtIDR(s.revenue)} (${s.orders} orders)`}
          style={{flex:1, background:'#3b82f6', height: `${(s.revenue/max*100)||1}%`, borderRadius:'2px 2px 0 0', minHeight:2, cursor:'pointer'}} />
      ))}
    </div>
  );
}

// ============================================================
// EXPENSES
// ============================================================
function Expenses() {
  const { confirm } = useUiKit();
  const [list, setList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filter, setFilter] = useState('');
  const [from, setFrom] = useState(monthAgo());
  const [to, setTo] = useState(today());
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    const q = new URLSearchParams({ from, to });
    if (filter) q.append('category_id', filter);
    api(`/expenses?${q}`).then(setList);
  }, [filter, from, to]);

  useEffect(() => { api('/expense-categories').then(setCategories); load(); }, [load]);

  const totalAmount = list.filter(e => e.status === 'recorded').reduce((s,e) => s + e.amount, 0);

  const voidExpense = async (id) => {
    const reason = prompt('Alasan void?');
    if (!reason) return;
    await api(`/expenses/${id}/void`, { method:'POST', body:{reason, voided_by:'admin'} });
    load();
  };

  const remove = async (item) => {
    const ok = await confirm({
      title: `Hapus "${item.doc_no || '#'+item.id}"?`,
      message: "Expense yang sudah voided akan dihapus permanen. Tidak bisa dibatalkan.",
      danger: true, okLabel: "Hapus"
    });
    if (!ok) return;
    try {
      await api(`/expenses/${item.id}`, { method: "DELETE" });
      setMsg("✓ Dihapus"); load();
    } catch (e) { setMsg(e.message); }
  };

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8}}>
        <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <h3 style={{margin:0}}>Expenses ({list.length})</h3>
          <input type="date" value={new Date(from*1000).toISOString().slice(0,10)}
            onChange={e => setFrom(Math.floor(new Date(e.target.value).getTime()/1000))} />
          <span>→</span>
          <input type="date" value={new Date(to*1000).toISOString().slice(0,10)}
            onChange={e => setTo(Math.floor(new Date(e.target.value).getTime()/1000))} />
          <select value={filter} onChange={e=>setFilter(e.target.value)}>
            <option value="">Semua category</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span style={{color:'#6b7280'}}>Total: <b>{fmtIDR(totalAmount)}</b></span>
        </div>
        <div>
          <a href={`${API}/export/expenses.csv?from=${from}&to=${to}`} style={btn}>↓ CSV</a>{' '}
          <button onClick={() => { setEditing({}); setShowForm(true); }} style={btnPrimary}>+ Expense</button>
        </div>
      </div>

      {showForm && <ExpenseForm initial={editing} categories={categories}
        onClose={() => { setShowForm(false); setEditing(null); load(); }} />}

      {msg ? <div style={{ fontSize: 12, margin: "0 0 8px", color: msg.startsWith("✓") ? "#10b981" : "#dc2626" }}>{msg}</div> : null}

      <table style={tableStyle}>
        <thead><tr>
          <th>Doc No</th><th>Tanggal</th><th>Kategori</th><th>Vendor</th><th>Description</th><th>Amount</th><th>Tax</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>
          {list.map(e => (
            <tr key={e.id} style={{opacity: e.status==='voided' ? 0.5 : 1}}>
              <td style={{fontSize:11, color:'#6b7280'}}>{e.doc_no}</td>
              <td>{fmtDate(e.expense_date)}</td>
              <td><b>{e.category_name}</b><br/><span style={typePill(e.category_type)}>{e.category_type}</span></td>
              <td>{e.vendor || '-'}</td>
              <td style={{fontSize:12}}>{e.description || '-'}</td>
              <td><b>{fmtIDR(e.amount)}</b></td>
              <td>{e.tax_amount ? fmtIDR(e.tax_amount) : '-'}</td>
              <td>{e.status === 'voided' ? '✗ voided' : '✓'}</td>
              <td>
                <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                  {e.status === 'recorded' && (
                    <button onClick={() => voidExpense(e.id)} style={btnDanger}>Void</button>
                  )}
                  {e.status === 'voided' && (
                    <button onClick={() => remove(e)} title="Hapus" style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#dc2626", padding: "4px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️ Hapus</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpenseForm({initial, categories, onClose}) {
  const [f, setF] = useState({
    category_id: categories[0]?.id || '',
    expense_date: today(),
    amount: 0, tax_amount: 0,
    vendor:'', description:'', payment_method:'cash', notes:'',
    ...initial
  });
  const update = (k) => (e) => setF({...f, [k]: e.target.type === 'date' ? Math.floor(new Date(e.target.value).getTime()/1000) : e.target.value});
  const submit = async () => {
    try {
      const body = {...f, amount:parseFloat(f.amount)||0, tax_amount:parseFloat(f.tax_amount)||0, created_by:'admin'};
      await api('/expenses', {method:'POST', body});
      onClose();
    } catch (e) { alert(e.message); }
  };
  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <h3>Tambah Expense</h3>
        <div style={formGrid}>
          <label>Kategori* <select value={f.category_id} onChange={update('category_id')}>
            {categories.map(c => <option key={c.id} value={c.id}>[{c.type}] {c.name}</option>)}
          </select></label>
          <label>Tanggal* <input type="date" value={new Date(f.expense_date*1000).toISOString().slice(0,10)} onChange={update('expense_date')} /></label>
          <label>Amount* <input type="number" value={f.amount} onChange={update('amount')} /></label>
          <label>Tax Amount <input type="number" value={f.tax_amount} onChange={update('tax_amount')} /></label>
          <label>Vendor <input value={f.vendor} onChange={update('vendor')} placeholder="e.g. PLN" /></label>
          <label>Payment Method <select value={f.payment_method} onChange={update('payment_method')}>
            <option>cash</option><option>transfer</option><option>card</option><option>e-wallet</option>
          </select></label>
          <label style={{gridColumn:'1/-1'}}>Description <input value={f.description} onChange={update('description')} placeholder="Deskripsi singkat" /></label>
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
// CATEGORIES
// ============================================================
function CategoryAdmin() {
  const [list, setList] = useState([]);
  const load = useCallback(() => api('/expense-categories').then(setList), []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const id = prompt('ID (e.g. opex-pajak)?');
    const name = prompt('Nama display?');
    const type = prompt('Type (cogs/opex/capex)?', 'opex');
    if (!id || !name || !type) return;
    try { await api('/expense-categories', {method:'POST', body:{id, name, type}}); load(); }
    catch (e) { alert(e.message); }
  };

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', marginBottom:12}}>
        <h3 style={{margin:0}}>Expense Categories ({list.length})</h3>
        <button onClick={add} style={btnPrimary}>+ Category</button>
      </div>
      <table style={tableStyle}>
        <thead><tr><th>ID</th><th>Nama</th><th>Type</th><th>Order</th></tr></thead>
        <tbody>
          {list.map(c => (
            <tr key={c.id}>
              <td style={{fontSize:11, color:'#6b7280'}}>{c.id}</td>
              <td><b>{c.name}</b></td>
              <td><span style={typePill(c.type)}>{c.type}</span></td>
              <td>{c.display_order}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// COGS DETAIL
// ============================================================
function COGSDetail() {
  const [data, setData] = useState(null);
  const [from, setFrom] = useState(today() - 7*86400);
  const [to, setTo] = useState(today());

  useEffect(() => {
    api(`/cogs-detail?from=${from}&to=${to}`).then(setData);
  }, [from, to]);

  if (!data) return <div>Loading...</div>;
  const total = data.by_sku.reduce((s, d) => s + d.cost, 0);

  return (
    <div>
      <div style={{display:'flex', gap:8, marginBottom:16, alignItems:'center'}}>
        <input type="date" value={new Date(from*1000).toISOString().slice(0,10)}
          onChange={e => setFrom(Math.floor(new Date(e.target.value).getTime()/1000))} />
        <span>→</span>
        <input type="date" value={new Date(to*1000).toISOString().slice(0,10)}
          onChange={e => setTo(Math.floor(new Date(e.target.value).getTime()/1000))} />
        <span style={{color:'#6b7280', marginLeft:'auto'}}>Total COGS: <b>{fmtIDR(total)}</b></span>
      </div>

      <h3>COGS by SKU (BOM consumption from POS sales)</h3>
      <table style={tableStyle}>
        <thead><tr><th>SKU</th><th>Total Qty</th><th>Total Cost</th><th>Transactions</th><th>% of total</th></tr></thead>
        <tbody>
          {data.by_sku.map(d => (
            <tr key={d.sku}>
              <td><b>{d.sku}</b></td>
              <td>{d.qty.toFixed(2)}</td>
              <td>{fmtIDR(d.cost)}</td>
              <td>{d.transactions}</td>
              <td>{total > 0 ? fmtPct(d.cost/total*100) : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.by_sku.length === 0 && (
        <div style={{padding:20, background:'#fef3c7', borderRadius:8, color:'#92400e', marginTop:12}}>
          ⚠️ Belum ada data COGS. Pastikan: (1) POS sale udah trigger <code>consumeStockForOrder()</code>, (2) BOM udah di-set per menu, (3) <code>audit_warehouse.last_cost</code> ter-isi (update via procurement GR).
        </div>
      )}
    </div>
  );
}

// ============================================================
// TAX CONFIG
// ============================================================
function TaxConfig() {
  const [list, setList] = useState([]);
  const load = useCallback(() => api('/tax-config').then(setList), []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const id = prompt('ID (e.g. ppn)?');
    const name = prompt('Nama?');
    const rate = parseFloat(prompt('Rate (0.11 untuk 11%)?'));
    if (!id || !name || isNaN(rate)) return;
    try { await api('/tax-config', {method:'POST', body:{id, name, rate}}); load(); }
    catch (e) { alert(e.message); }
  };

  const toggle = async (id, field, current) => {
    await api(`/tax-config/${id}`, {method:'PUT', body:{[field]:!current}});
    load();
  };

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', marginBottom:12}}>
        <h3 style={{margin:0}}>Tax Configuration</h3>
        <button onClick={add} style={btnPrimary}>+ Tax</button>
      </div>
      <table style={tableStyle}>
        <thead><tr><th>ID</th><th>Nama</th><th>Rate</th><th>Applies To</th><th>Active</th><th>Separately</th><th>Inclusive</th></tr></thead>
        <tbody>
          {list.map(t => (
            <tr key={t.id}>
              <td>{t.id}</td>
              <td><b>{t.name}</b></td>
              <td>{(t.rate*100).toFixed(1)}%</td>
              <td>{t.applies_to}</td>
              <td><button onClick={()=>toggle(t.id, 'is_active', t.is_active)} style={btnToggle}>{t.is_active ? '✓' : '✗'}</button></td>
              <td><button onClick={()=>toggle(t.id, 'display_separately', t.display_separately)} style={btnToggle}>{t.display_separately ? '✓' : '✗'}</button></td>
              <td><button onClick={()=>toggle(t.id, 'inclusive', t.inclusive)} style={btnToggle}>{t.inclusive ? '✓' : '✗'}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{fontSize:12, color:'#6b7280', marginTop:12}}>
        <b>Inclusive</b> = harga di menu sudah include pajak (gak ditambah lagi). <b>Separately</b> = ditampilkan sebagai line item terpisah di receipt.
      </p>
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================
const card = { background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, padding:16 };
const cardLabel = { fontSize:11, textTransform:'uppercase', color:'#6b7280', letterSpacing:'0.05em', fontWeight:700 };
const cardAmount = { fontSize:28, fontWeight:700, marginTop:4, letterSpacing:'-0.02em' };
const tableStyle = { width:'100%', borderCollapse:'collapse', background:'#fff', fontSize:13 };
const btn = { padding:'6px 14px', background:'#f3f4f6', border:'1px solid #d1d5db', borderRadius:4, cursor:'pointer', fontSize:13, textDecoration:'none', color:'#374151', display:'inline-block' };
const btnPrimary = { padding:'6px 14px', background:'#3b82f6', color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontWeight:600 };
const btnDanger = { padding:'4px 10px', background:'#fee2e2', color:'#dc2626', border:'1px solid #fca5a5', borderRadius:4, cursor:'pointer', fontSize:11 };
const btnToggle = { padding:'4px 10px', background:'#f3f4f6', border:'1px solid #d1d5db', borderRadius:4, cursor:'pointer', fontSize:12 };
const formGrid = { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:12 };
const modalOverlay = { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 };
const modalBox = { background:'#fff', borderRadius:8, padding:20, maxWidth:'95vw', minWidth:500 };

const typePill = (type) => ({
  display:'inline-block', padding:'2px 8px', borderRadius:4, fontSize:10, fontWeight:600, textTransform:'uppercase',
  background: type==='cogs' ? '#fef3c7' : type==='opex' ? '#dbeafe' : '#fce7f3',
  color: type==='cogs' ? '#92400e' : type==='opex' ? '#1e40af' : '#9f1239'
});

if (typeof document !== 'undefined' && !document.getElementById('finance-styles')) {
  const s = document.createElement('style');
  s.id = 'finance-styles';
  s.textContent = `
    .finance-tab table th { background:#f3f4f6; padding:8px; text-align:left; border-bottom:1px solid #e5e7eb; font-size:11px; text-transform:uppercase; color:#6b7280; }
    .finance-tab table td { padding:8px; border-bottom:1px solid #f3f4f6; vertical-align:top; }
    .finance-tab input, .finance-tab select, .finance-tab textarea { padding:6px 8px; border:1px solid #d1d5db; border-radius:4px; font-size:13px; box-sizing:border-box; }
    .finance-tab label { display:block; font-size:12px; color:#374151; font-weight:500; margin-bottom:4px; }
    .finance-tab label input, .finance-tab label select, .finance-tab label textarea { width:100%; margin-top:4px; }
  `;
  document.head.appendChild(s);
}
