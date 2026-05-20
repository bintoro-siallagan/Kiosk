// client/src/Admin/AdminAggregator.jsx
// Admin UI buat manage delivery aggregator (GoFood / GrabFood / ShopeeFood / Traveloka).
//
// Tabs:
//   1. Live Orders   — incoming orders dengan accept/reject + status real-time
//   2. Reconciliation — gross / commission / net per provider per periode + CSV
//   3. Manual Entry   — kasir input order aggregator manual (API down / belum integrated)
//   4. Providers      — config commission rate, webhook secret, API key per provider
//   5. Sync Log       — audit trail menu sync ke aggregator
import React, { useState, useEffect, useCallback, useMemo } from 'react';

const fmtIDR = (n) => new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR', maximumFractionDigits:0}).format(Math.round(n||0));
const fmtDateTime = (sec) => sec ? new Date(sec*1000).toLocaleString('id-ID', {dateStyle:'short', timeStyle:'short'}) : '-';
const fmtElapsed = (sec) => {
  if (!sec) return '-';
  const diff = Math.floor(Date.now()/1000) - sec;
  if (diff < 60) return `${diff}d lalu`;
  if (diff < 3600) return `${Math.floor(diff/60)}m lalu`;
  return `${Math.floor(diff/3600)}j lalu`;
};

const PROVIDER_COLORS = {
  gofood: '#16a34a', grabfood: '#16a34a', shopeefood: '#ea580c', traveloka: '#1d4ed8'
};
const PROVIDER_ICONS = { gofood: '🛵', grabfood: '🛵', shopeefood: '🛒', traveloka: '✈️' };

export default function AdminAggregator({ apiBase = '' }) {
  const [tab, setTab] = useState('live');
  const [providers, setProviders] = useState([]);
  const [orders, setOrders] = useState([]);
  const [reconcile, setReconcile] = useState(null);
  const [syncLog, setSyncLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  const loadProviders = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/aggregator/providers`).then(r => r.json());
      setProviders(Array.isArray(r) ? r : []);
    } catch {}
  }, [apiBase]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase}/api/aggregator/orders?limit=100`).then(r => r.json());
      setOrders(Array.isArray(r) ? r : []);
    } catch {}
    setLoading(false);
  }, [apiBase]);

  const loadReconcile = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/aggregator/reconcile`).then(r => r.json());
      setReconcile(r);
    } catch {}
  }, [apiBase]);

  const loadSyncLog = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/aggregator/sync-log?limit=50`).then(r => r.json());
      setSyncLog(Array.isArray(r) ? r : []);
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    loadProviders();
    if (tab === 'live') {
      loadOrders();
      const t = setInterval(loadOrders, 15 * 1000);
      return () => clearInterval(t);
    }
    if (tab === 'reconcile') loadReconcile();
    if (tab === 'sync') loadSyncLog();
  }, [tab, loadProviders, loadOrders, loadReconcile, loadSyncLog]);

  const activeOrders = useMemo(() =>
    orders.filter(o => !['completed', 'rejected', 'cancelled'].includes(o.status))
  , [orders]);

  const accept = async (id) => {
    await fetch(`${apiBase}/api/aggregator/orders/${id}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: localStorage.getItem('kasir_name') || 'admin' })
    });
    loadOrders();
  };

  const reject = async (id) => {
    const reason = prompt('Alasan reject (wajib):');
    if (!reason) return;
    await fetch(`${apiBase}/api/aggregator/orders/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: localStorage.getItem('kasir_name') || 'admin', reason })
    });
    loadOrders();
  };

  const markReady = async (id) => {
    await fetch(`${apiBase}/api/aggregator/orders/${id}/ready`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: localStorage.getItem('kasir_name') || 'admin' })
    });
    loadOrders();
  };

  const simulate = async (provider) => {
    await fetch(`${apiBase}/api/aggregator/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider })
    });
    loadOrders();
  };

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <h2 style={{margin: 0, fontSize: 20}}>🛵 Delivery Aggregator</h2>
        <div style={styles.tabs}>
          {['live', 'reconcile', 'manual', 'providers', 'sync'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={tabBtn(tab === t)}>
              {{live: 'Live Orders', reconcile: 'Reconciliation', manual: 'Manual Entry', providers: 'Providers', sync: 'Sync Log'}[t]}
              {t === 'live' && activeOrders.length > 0 && (
                <span style={styles.badge}>{activeOrders.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* LIVE ORDERS */}
      {tab === 'live' && (
        <div style={{padding: 16}}>
          {/* Quick stats top */}
          <div style={styles.kpiRow}>
            {providers.filter(p => p.is_active).map(p => {
              const count = orders.filter(o => o.provider_code === p.code && !['completed','rejected','cancelled'].includes(o.status)).length;
              return (
                <div key={p.code} style={{...styles.kpi, borderTop: `3px solid ${PROVIDER_COLORS[p.code] || '#6b7280'}`}}>
                  <div style={{fontSize: 11, color: '#9ca3af', textTransform: 'uppercase'}}>{p.name}</div>
                  <div style={{fontSize: 24, fontWeight: 600, marginTop: 4}}>{count}</div>
                  <div style={{fontSize: 10, color: '#6b7280'}}>order aktif · {(p.commission_rate*100).toFixed(0)}% komisi</div>
                  <button onClick={() => simulate(p.code)} style={styles.simBtn}>+ Test Order</button>
                </div>
              );
            })}
          </div>

          {/* Orders list */}
          <h3 style={styles.sectionTitle}>Order Aktif</h3>
          {activeOrders.length === 0 ? (
            <div style={styles.empty}>Tidak ada order pending. Klik "+ Test Order" buat simulasi.</div>
          ) : (
            <div style={styles.orderList}>
              {activeOrders.map(o => (
                <OrderCard key={o.id} order={o} now={now}
                  onAccept={() => accept(o.id)}
                  onReject={() => reject(o.id)}
                  onReady={() => markReady(o.id)} />
              ))}
            </div>
          )}

          {/* Recent completed */}
          <h3 style={{...styles.sectionTitle, marginTop: 24}}>Recent Completed</h3>
          <div style={styles.completedList}>
            {orders.filter(o => ['completed','rejected'].includes(o.status)).slice(0, 10).map(o => (
              <div key={o.id} style={styles.completedRow}>
                <span style={{...styles.providerTag, background: (PROVIDER_COLORS[o.provider_code] || '#6b7280') + '33', color: PROVIDER_COLORS[o.provider_code]}}>
                  {PROVIDER_ICONS[o.provider_code] || ''} {o.provider_code}
                </span>
                <span style={{flex: 1, color: '#fff', fontWeight: 500}}>{o.doc_no}</span>
                <span style={{color: '#9ca3af', fontSize: 12}}>{o.customer_name || '-'}</span>
                <span style={{color: '#fff', fontWeight: 600, minWidth: 100, textAlign: 'right'}}>{fmtIDR(o.gross_amount)}</span>
                <span style={{
                  ...styles.statusPill,
                  background: o.status === 'completed' ? '#0a3a26' : '#3a0f0f',
                  color: o.status === 'completed' ? '#4ade80' : '#ef4444'
                }}>
                  {o.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RECONCILIATION */}
      {tab === 'reconcile' && reconcile && (
        <div style={{padding: 16}}>
          <h3 style={styles.sectionTitle}>Hari Ini — Total</h3>
          <div style={styles.kpiRow}>
            <KpiCard label="Total Order" value={reconcile.total.total_orders} sub={`${reconcile.total.completed} completed`} />
            <KpiCard label="Gross Revenue" value={fmtIDR(reconcile.total.gross_revenue)} color="#f97316" big />
            <KpiCard label="Total Komisi" value={fmtIDR(reconcile.total.total_commission)} color="#ef4444" sub="dibayar ke platform" />
            <KpiCard label="Net Revenue" value={fmtIDR(reconcile.total.net_revenue)} color="#4ade80" big sub="masuk ke kios" />
          </div>

          <h3 style={styles.sectionTitle}>Breakdown per Provider</h3>
          <table style={styles.table}>
            <thead><tr>
              <th style={styles.th}>Provider</th>
              <th style={{...styles.th, textAlign: 'right'}}>Orders</th>
              <th style={{...styles.th, textAlign: 'right'}}>Completed</th>
              <th style={{...styles.th, textAlign: 'right'}}>Rejected</th>
              <th style={{...styles.th, textAlign: 'right'}}>Gross</th>
              <th style={{...styles.th, textAlign: 'right'}}>Komisi</th>
              <th style={{...styles.th, textAlign: 'right'}}>Net</th>
              <th style={{...styles.th, textAlign: 'right'}}>Avg Fulfill</th>
            </tr></thead>
            <tbody>
              {reconcile.by_provider.length === 0 && (
                <tr><td colSpan={8} style={{...styles.td, textAlign: 'center', color: '#6b7280', padding: 30}}>Belum ada data</td></tr>
              )}
              {reconcile.by_provider.map(r => (
                <tr key={r.provider_code} style={{borderBottom: '1px solid #2a2a2a'}}>
                  <td style={styles.td}>{PROVIDER_ICONS[r.provider_code]} {r.provider_code}</td>
                  <td style={{...styles.td, textAlign: 'right'}}>{r.total_orders}</td>
                  <td style={{...styles.td, textAlign: 'right', color: '#4ade80'}}>{r.completed}</td>
                  <td style={{...styles.td, textAlign: 'right', color: r.rejected > 0 ? '#ef4444' : '#9ca3af'}}>{r.rejected}</td>
                  <td style={{...styles.td, textAlign: 'right'}}>{fmtIDR(r.gross_revenue)}</td>
                  <td style={{...styles.td, textAlign: 'right', color: '#ef4444'}}>−{fmtIDR(r.total_commission)}</td>
                  <td style={{...styles.td, textAlign: 'right', color: '#4ade80', fontWeight: 600}}>{fmtIDR(r.net_revenue)}</td>
                  <td style={{...styles.td, textAlign: 'right', color: '#9ca3af'}}>{r.avg_fulfill_seconds > 0 ? `${Math.round(r.avg_fulfill_seconds/60)}m` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MANUAL ENTRY */}
      {tab === 'manual' && (
        <ManualEntry providers={providers.filter(p => p.is_active)} apiBase={apiBase} onSaved={() => { setTab('live'); loadOrders(); }} />
      )}

      {/* PROVIDERS */}
      {tab === 'providers' && (
        <ProvidersConfig providers={providers} apiBase={apiBase} onUpdated={loadProviders} />
      )}

      {/* SYNC LOG */}
      {tab === 'sync' && (
        <div style={{padding: 16}}>
          <h3 style={styles.sectionTitle}>Menu Sync Log (50 terakhir)</h3>
          {syncLog.length === 0 ? <div style={styles.empty}>Belum ada sync activity</div> : (
            <table style={styles.table}>
              <thead><tr>
                <th style={styles.th}>Tanggal</th>
                <th style={styles.th}>Provider</th>
                <th style={styles.th}>Action</th>
                <th style={styles.th}>Menu</th>
                <th style={styles.th}>Status</th>
              </tr></thead>
              <tbody>
                {syncLog.map(l => (
                  <tr key={l.id} style={{borderBottom: '1px solid #2a2a2a'}}>
                    <td style={styles.td}>{fmtDateTime(l.created_at)}</td>
                    <td style={styles.td}>{PROVIDER_ICONS[l.provider_code]} {l.provider_code}</td>
                    <td style={styles.td}>{l.action}</td>
                    <td style={styles.td}>{l.menu_id || '-'}</td>
                    <td style={styles.td}>
                      <span style={{...styles.statusPill, background: l.status === 'pending' ? '#2a1a0a' : l.status?.startsWith('skipped') ? '#1a1a1a' : '#0a3a26', color: l.status === 'pending' ? '#fbbf24' : l.status?.startsWith('skipped') ? '#9ca3af' : '#4ade80'}}>
                        {l.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ORDER CARD
// ============================================================
function OrderCard({ order, now, onAccept, onReject, onReady }) {
  const elapsed = Math.floor(now/1000) - order.received_at;
  const items = Array.isArray(order.items) ? order.items : [];
  const urgent = elapsed > 300; // > 5 menit belum di-accept = urgent

  return (
    <div style={{
      ...styles.orderCard,
      borderLeft: `4px solid ${PROVIDER_COLORS[order.provider_code] || '#6b7280'}`,
      boxShadow: urgent && order.status === 'pending' ? '0 0 0 1px #ef4444' : 'none'
    }}>
      <div style={styles.orderHeader}>
        <div>
          <div style={{fontSize: 11, color: '#9ca3af'}}>
            {PROVIDER_ICONS[order.provider_code]} {order.provider_code.toUpperCase()} · {order.doc_no}
            {order.manual_entry === 1 && <span style={{marginLeft: 6, color: '#fbbf24'}}>(MANUAL)</span>}
          </div>
          <div style={{fontSize: 14, fontWeight: 600, color: '#fff', marginTop: 2}}>
            {order.customer_name || 'Customer'}
          </div>
          <div style={{fontSize: 10, color: '#9ca3af'}}>{order.customer_phone || '-'}</div>
        </div>
        <div style={{textAlign: 'right'}}>
          <div style={{...styles.statusPill,
            background: order.status === 'pending' ? '#3a1a0a' : order.status === 'accepted' ? '#0a3a3a' : '#0a3a1a',
            color: order.status === 'pending' ? '#fbbf24' : order.status === 'accepted' ? '#67e8f9' : '#4ade80'
          }}>{order.status}</div>
          <div style={{fontSize: 10, color: urgent ? '#ef4444' : '#9ca3af', marginTop: 4, fontWeight: urgent ? 600 : 400}}>{fmtElapsed(order.received_at)}</div>
        </div>
      </div>

      {order.delivery_address && (
        <div style={{fontSize: 11, color: '#9ca3af', margin: '8px 0', padding: 6, background: '#0f0f0f', borderRadius: 4}}>
          📍 {order.delivery_address}
        </div>
      )}

      <div style={styles.itemsList}>
        {items.map((it, i) => (
          <div key={i} style={styles.itemRow}>
            <span style={{color: '#f97316', fontWeight: 600, minWidth: 24}}>{it.qty}×</span>
            <span style={{flex: 1, color: '#fff'}}>{it.display_name || it.menu_id}</span>
            <span style={{color: '#9ca3af', fontSize: 12}}>{fmtIDR(it.line_total || (it.display_price * it.qty))}</span>
          </div>
        ))}
      </div>

      {order.notes && (
        <div style={{fontSize: 11, color: '#fbbf24', marginTop: 6, padding: 6, background: '#2a1f0a', borderRadius: 4, fontStyle: 'italic'}}>
          📝 {order.notes}
        </div>
      )}

      <div style={styles.orderTotals}>
        <div style={{fontSize: 11, color: '#9ca3af'}}>
          Gross <b style={{color: '#fff'}}>{fmtIDR(order.gross_amount)}</b>
          {' · '}Komisi <b style={{color: '#ef4444'}}>−{fmtIDR(order.commission_amount)}</b>
          {' · '}Net <b style={{color: '#4ade80'}}>{fmtIDR(order.net_amount)}</b>
        </div>
      </div>

      <div style={styles.orderActions}>
        {order.status === 'pending' && (
          <>
            <button onClick={onReject} style={styles.rejectBtn}>Reject</button>
            <button onClick={onAccept} style={styles.acceptBtn}>✓ Accept & Create Ticket</button>
          </>
        )}
        {order.status === 'accepted' && (
          <button onClick={onReady} style={styles.readyBtn}>Mark Ready (Notify Driver)</button>
        )}
        {order.status === 'ready' && (
          <div style={{textAlign: 'center', color: '#4ade80', fontSize: 12}}>
            ✓ Siap diambil driver
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MANUAL ENTRY
// ============================================================
function ManualEntry({ providers, apiBase, onSaved }) {
  const [provider, setProvider] = useState(providers[0]?.code || 'gofood');
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [items, setItems] = useState([{ menu_id: '', display_name: '', qty: 1, display_price: 0 }]);
  const [deliveryFee, setDeliveryFee] = useState(10000);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const addItem = () => setItems([...items, { menu_id: '', display_name: '', qty: 1, display_price: 0 }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i, field, val) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: field === 'qty' || field === 'display_price' ? Number(val) : val };
    setItems(next);
  };

  const gross = useMemo(() => items.reduce((s, it) => s + (it.qty * it.display_price), 0) + Number(deliveryFee || 0), [items, deliveryFee]);

  const save = async () => {
    if (!provider || items.some(i => !i.display_name || i.qty <= 0)) return alert('Lengkapi semua item');
    setSaving(true);
    try {
      const payload = {
        provider, customer_name: customer, customer_phone: phone,
        items: items.map(i => ({ ...i, line_total: i.qty * i.display_price })),
        gross_amount: gross, delivery_fee: Number(deliveryFee) || 0, notes,
        entered_by: localStorage.getItem('kasir_name') || 'admin'
      };
      const r = await fetch(`${apiBase}/api/aggregator/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (r.ok) onSaved?.();
      else alert('Gagal save: ' + (await r.text()));
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  return (
    <div style={{padding: 16, maxWidth: 700}}>
      <h3 style={styles.sectionTitle}>Manual Entry Order Aggregator</h3>
      <div style={{fontSize: 12, color: '#9ca3af', marginBottom: 14, padding: 10, background: '#2a1f0a', borderRadius: 6}}>
        💡 Pakai mode ini kalau API aggregator belum di-integrate / down. Order langsung masuk ke flow biasa (KDS, commission tracking, reconciliation).
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>Provider</label>
        <select value={provider} onChange={e => setProvider(e.target.value)} style={styles.select}>
          {providers.map(p => <option key={p.code} value={p.code}>{p.name} ({(p.commission_rate*100).toFixed(0)}% komisi)</option>)}
        </select>
      </div>

      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8}}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Customer Name</label>
          <input value={customer} onChange={e => setCustomer(e.target.value)} style={styles.input} placeholder="Nama" />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Phone</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} style={styles.input} placeholder="0812..." />
        </div>
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>Delivery Address</label>
        <input value={address} onChange={e => setAddress(e.target.value)} style={styles.input} placeholder="Alamat" />
      </div>

      <h4 style={{color: '#fff', marginTop: 16, fontSize: 13}}>Items</h4>
      {items.map((it, i) => (
        <div key={i} style={{display: 'grid', gridTemplateColumns: '2fr 60px 1fr auto', gap: 8, marginBottom: 6}}>
          <input value={it.display_name} onChange={e => updateItem(i, 'display_name', e.target.value)} style={styles.input} placeholder="Nama item" />
          <input type="number" min="1" value={it.qty} onChange={e => updateItem(i, 'qty', e.target.value)} style={styles.input} />
          <input type="number" min="0" value={it.display_price} onChange={e => updateItem(i, 'display_price', e.target.value)} style={styles.input} placeholder="Harga" />
          <button onClick={() => removeItem(i)} style={{...styles.rejectBtn, padding: '6px 10px'}}>×</button>
        </div>
      ))}
      <button onClick={addItem} style={{...styles.input, cursor: 'pointer', textAlign: 'center', color: '#9ca3af'}}>+ Tambah Item</button>

      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12}}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Delivery Fee</label>
          <input type="number" value={deliveryFee} onChange={e => setDeliveryFee(e.target.value)} style={styles.input} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Notes</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} style={styles.input} placeholder="Catatan order" />
        </div>
      </div>

      <div style={{padding: 12, background: '#1a1a1a', borderRadius: 8, marginTop: 12}}>
        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 600}}>
          <span style={{color: '#9ca3af'}}>Gross Total</span>
          <span style={{color: '#f97316'}}>{fmtIDR(gross)}</span>
        </div>
      </div>

      <button onClick={save} disabled={saving} style={{...styles.acceptBtn, width: '100%', marginTop: 12, padding: 14, opacity: saving ? 0.5 : 1}}>
        {saving ? 'Saving...' : 'Save Order'}
      </button>
    </div>
  );
}

// ============================================================
// PROVIDERS CONFIG
// ============================================================
function ProvidersConfig({ providers, apiBase, onUpdated }) {
  const [editing, setEditing] = useState(null);

  const save = async (code, updates) => {
    await fetch(`${apiBase}/api/aggregator/providers/${code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    setEditing(null);
    onUpdated?.();
  };

  return (
    <div style={{padding: 16}}>
      <h3 style={styles.sectionTitle}>Config Provider</h3>
      <div style={{fontSize: 12, color: '#9ca3af', marginBottom: 14, padding: 10, background: '#0f1a2a', borderRadius: 6}}>
        🔗 Daftar merchant di GoBiz / GrabMerchant / ShopeeFood Partner buat dapet API key. Webhook secret optional — buat verify signature dari aggregator.
      </div>
      {providers.map(p => (
        <div key={p.code} style={{...styles.providerCard, opacity: p.is_active ? 1 : 0.5}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <div>
              <div style={{fontSize: 16, fontWeight: 600, color: '#fff'}}>{PROVIDER_ICONS[p.code]} {p.name}</div>
              <div style={{fontSize: 11, color: '#9ca3af', marginTop: 4}}>
                Commission: {(p.commission_rate*100).toFixed(1)}% · Prep buffer: {p.prep_buffer_minutes} menit
                {p.api_key ? ' · ✓ API Connected' : ' · ⚠️ Belum ada API key'}
              </div>
            </div>
            <div style={{display: 'flex', gap: 6}}>
              <button onClick={() => save(p.code, { is_active: !p.is_active })} style={styles.btn}>
                {p.is_active ? 'Disable' : 'Enable'}
              </button>
              <button onClick={() => setEditing(p)} style={styles.acceptBtn}>Edit</button>
            </div>
          </div>
          {editing?.code === p.code && (
            <div style={{marginTop: 12, padding: 12, background: '#0f0f0f', borderRadius: 6}}>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8}}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Commission Rate (%)</label>
                  <input type="number" step="0.01" min="0" max="0.5" defaultValue={p.commission_rate}
                    onChange={e => editing.commission_rate = parseFloat(e.target.value)}
                    style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Prep Buffer (min)</label>
                  <input type="number" defaultValue={p.prep_buffer_minutes}
                    onChange={e => editing.prep_buffer_minutes = Number(e.target.value)}
                    style={styles.input} />
                </div>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>API Key</label>
                <input defaultValue={p.api_key || ''}
                  onChange={e => editing.api_key = e.target.value}
                  style={styles.input} placeholder="Dari merchant dashboard aggregator" />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Webhook Secret</label>
                <input defaultValue={p.webhook_secret || ''}
                  onChange={e => editing.webhook_secret = e.target.value}
                  style={styles.input} placeholder="Untuk signature verify" />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Merchant ID</label>
                <input defaultValue={p.merchant_id || ''}
                  onChange={e => editing.merchant_id = e.target.value}
                  style={styles.input} />
              </div>
              <div style={{display: 'flex', gap: 8, marginTop: 12}}>
                <button onClick={() => setEditing(null)} style={styles.btn}>Batal</button>
                <button onClick={() => save(p.code, editing)} style={styles.acceptBtn}>Save</button>
              </div>
              <div style={{fontSize: 10, color: '#6b7280', marginTop: 8}}>
                Webhook URL: <code style={{color: '#f97316'}}>{window.location.origin}/api/aggregator/webhook/{p.code}</code>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function KpiCard({ label, value, sub, color = '#fff', big }) {
  return (
    <div style={styles.kpi}>
      <div style={{fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em'}}>{label}</div>
      <div style={{fontSize: big ? 22 : 18, fontWeight: 600, color, marginTop: 4}}>{value}</div>
      {sub && <div style={{fontSize: 10, color: '#6b7280', marginTop: 4}}>{sub}</div>}
    </div>
  );
}

const tabBtn = (active) => ({
  padding: '8px 14px', background: active ? '#1f1f1f' : 'transparent',
  color: active ? '#f97316' : '#9ca3af', border: 'none',
  borderBottom: active ? '2px solid #f97316' : '2px solid transparent',
  fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
  display: 'inline-flex', alignItems: 'center', gap: 6
});

const styles = {
  root: { background: '#0a0a0a', color: '#fff', minHeight: '100vh', fontFamily: 'system-ui,-apple-system,sans-serif' },
  header: { padding: '16px 24px 0', borderBottom: '1px solid #1f1f1f' },
  tabs: { display: 'flex', marginTop: 16 },
  badge: { background: '#ef4444', color: '#fff', borderRadius: 10, fontSize: 10, padding: '1px 7px', fontWeight: 600 },
  sectionTitle: { fontSize: 14, color: '#fff', margin: '0 0 12px' },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 18 },
  kpi: { background: '#1a1a1a', borderRadius: 8, padding: 14, border: '1px solid #2a2a2a' },
  empty: { padding: 40, textAlign: 'center', color: '#6b7280' },
  simBtn: { marginTop: 8, padding: '4px 8px', background: '#0f0f0f', color: '#9ca3af', border: '1px solid #2a2a2a', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', width: '100%' },

  orderList: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 },
  orderCard: { background: '#1a1a1a', borderRadius: 10, padding: 14, border: '1px solid #2a2a2a' },
  orderHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 },
  statusPill: { display: 'inline-block', padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' },
  itemsList: { padding: 8, background: '#0f0f0f', borderRadius: 6 },
  itemRow: { display: 'flex', gap: 8, padding: '4px 0', fontSize: 13, alignItems: 'center' },
  orderTotals: { padding: '8px 0', borderTop: '1px solid #2a2a2a', marginTop: 8, fontSize: 11 },
  orderActions: { display: 'flex', gap: 8, marginTop: 10 },
  acceptBtn: { flex: 2, padding: '10px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  rejectBtn: { padding: '10px 14px', background: '#7f1d1d', color: '#fecaca', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  readyBtn: { flex: 1, padding: '10px 14px', background: '#f97316', color: '#0a0a0a', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  btn: { padding: '8px 14px', background: '#2a2a2a', color: '#9ca3af', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },

  completedList: { background: '#1a1a1a', borderRadius: 8, padding: 8 },
  completedRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: '1px solid #2a2a2a' },
  providerTag: { padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600 },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { padding: 10, textAlign: 'left', color: '#9ca3af', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #2a2a2a' },
  td: { padding: 10, color: '#fff' },

  formGroup: { marginBottom: 10 },
  label: { fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500, display: 'block', marginBottom: 4 },
  input: { width: '100%', padding: '8px 10px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 4, color: '#fff', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' },
  select: { width: '100%', padding: '8px 10px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 4, color: '#fff', fontSize: 13, fontFamily: 'inherit' },

  providerCard: { background: '#1a1a1a', borderRadius: 8, padding: 14, marginBottom: 10, border: '1px solid #2a2a2a' }
};
