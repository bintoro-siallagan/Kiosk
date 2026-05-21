// client/src/Admin/AdminLoyalty.jsx
// Loyalty program admin UI — customers, transactions, rewards CRUD, tier config, dashboard
import React, { useState, useEffect, useCallback } from 'react';

const fmtIDR = (n) => new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR', maximumFractionDigits:0}).format(Math.round(n||0));
const fmtDateTime = (sec) => sec ? new Date(sec*1000).toLocaleString('id-ID', {dateStyle:'short', timeStyle:'short'}) : '-';

export default function AdminLoyalty({ apiBase = '' }) {
  const [tab, setTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [search, setSearch] = useState('');
  const [drillCustomer, setDrillCustomer] = useState(null);
  const [drillTx, setDrillTx] = useState([]);
  const [showRewardForm, setShowRewardForm] = useState(false);
  const [editReward, setEditReward] = useState(null);
  const [showAdjust, setShowAdjust] = useState(null);
  const [showTierForm, setShowTierForm] = useState(false);
  const [tierForm, setTierForm] = useState({ code: '', name: '', emoji: '🎯', color: '#888888', min_lifetime_spend: '', earn_multiplier: '' });
  const [editTierCode, setEditTierCode] = useState(null);
  const [configForm, setConfigForm] = useState(null);

  const loadStats = useCallback(async () => {
    try { setStats(await fetch(`${apiBase}/api/loyalty/stats`).then(r => r.json())); } catch {}
  }, [apiBase]);

  const loadCustomers = useCallback(async () => {
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : '';
      setCustomers(await fetch(`${apiBase}/api/loyalty/customers${q}`).then(r => r.json()));
    } catch {}
  }, [apiBase, search]);

  const loadTiers = useCallback(async () => {
    try { setTiers(await fetch(`${apiBase}/api/loyalty/tiers`).then(r => r.json())); } catch {}
  }, [apiBase]);

  const loadRewards = useCallback(async () => {
    try { setRewards(await fetch(`${apiBase}/api/loyalty/rewards`).then(r => r.json())); } catch {}
  }, [apiBase]);

  const closeTierForm = () => {
    setShowTierForm(false); setEditTierCode(null);
    setTierForm({ code: '', name: '', emoji: '🎯', color: '#888888', min_lifetime_spend: '', earn_multiplier: '' });
  };

  const editTier = (t) => {
    setEditTierCode(t.code);
    setTierForm({
      code: t.code, name: t.name || '', emoji: t.emoji || '🎯', color: t.color || '#888888',
      min_lifetime_spend: String(t.min_lifetime_spend ?? ''), earn_multiplier: String(t.earn_multiplier ?? ''),
    });
    setShowTierForm(true);
  };

  const saveTier = async () => {
    const f = tierForm;
    if (!f.name.trim() || (!editTierCode && !f.code.trim())) { alert('Code & nama tier wajib diisi'); return; }
    const body = {
      name: f.name, emoji: f.emoji, color: f.color,
      min_lifetime_spend: Number(f.min_lifetime_spend) || 0,
      earn_multiplier: Number(f.earn_multiplier) || 1,
    };
    const r = await fetch(
      editTierCode ? `${apiBase}/api/loyalty/tiers/${editTierCode}` : `${apiBase}/api/loyalty/tiers`,
      {
        method: editTierCode ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editTierCode ? body : { code: f.code, ...body }),
      }
    );
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { alert(d.error || 'Gagal simpan tier'); return; }
    closeTierForm();
    loadTiers();
  };

  const deleteTier = async (code) => {
    if (!window.confirm(`Hapus tier "${code}"?`)) return;
    const r = await fetch(`${apiBase}/api/loyalty/tiers/${code}`, { method: 'DELETE' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { alert(d.error || 'Gagal hapus tier'); return; }
    loadTiers();
  };

  const deleteReward = async (id) => {
    if (!window.confirm('Hapus reward ini?')) return;
    const r = await fetch(`${apiBase}/api/loyalty/rewards/${id}`, { method: 'DELETE' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { alert(d.error || 'Gagal hapus reward'); return; }
    if (d.deactivated) alert(d.note || 'Reward dinonaktifkan (sudah pernah ditukar)');
    loadRewards();
  };

  // Parse CSV → array {phone,name,email}. Header opsional (auto-detect).
  const parseCsv = (text) => {
    const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const first = lines[0].toLowerCase();
    const start = (first.includes('phone') || first.includes('hp') || first.includes('nama')) ? 1 : 0;
    return lines.slice(start).map(l => {
      const c = l.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      return { phone: c[0], name: c[1] || '', email: c[2] || '' };
    }).filter(x => x.phone);
  };

  const handleUploadCsv = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const customers = parseCsv(reader.result);
      if (!customers.length) { alert('CSV kosong / format salah.\nUrutan kolom: phone, name, email'); return; }
      try {
        const r = await fetch(`${apiBase}/api/loyalty/customers/import`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customers }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { alert(d.error || 'Import gagal'); return; }
        alert(`Import selesai:\n✓ ${d.created} member ditambah\n• ${d.skipped} dilewati (duplikat/kosong)`);
        loadCustomers();
      } catch (err) { alert('Error: ' + err.message); }
    };
    reader.readAsText(file);
  };

  // Seed form config dari stats (sekali)
  useEffect(() => {
    if (stats?.config && !configForm) {
      const c = stats.config;
      setConfigForm({
        point_per_amount: c.point_per_amount, point_value_idr: c.point_value_idr,
        point_expiry_months: c.point_expiry_months, signup_bonus: c.signup_bonus,
        referral_bonus_referrer: c.referral_bonus_referrer, referral_bonus_referred: c.referral_bonus_referred,
      });
    }
  }, [stats, configForm]);

  const saveConfig = async () => {
    if (!configForm) return;
    const r = await fetch(`${apiBase}/api/loyalty/config`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configForm),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { alert(d.error || 'Gagal simpan config'); return; }
    alert('✓ Config loyalty disimpan');
    loadStats();
  };

  useEffect(() => {
    if (tab === 'dashboard') loadStats();
    if (tab === 'customers') { loadCustomers(); loadTiers(); }
    if (tab === 'tiers') loadTiers();
    if (tab === 'rewards') { loadRewards(); loadTiers(); }
  }, [tab, loadStats, loadCustomers, loadTiers, loadRewards]);

  const openDrill = async (c) => {
    setDrillCustomer(c);
    try {
      const tx = await fetch(`${apiBase}/api/loyalty/customers/${c.id}/transactions`).then(r => r.json());
      setDrillTx(tx);
    } catch {}
  };

  const submitAdjust = async (customerId, points, description) => {
    await fetch(`${apiBase}/api/loyalty/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customerId,
        points: Number(points),
        description,
        created_by: localStorage.getItem('kasir_name') || 'admin'
      })
    });
    setShowAdjust(null);
    loadCustomers();
    if (drillCustomer?.id === customerId) {
      const fresh = await fetch(`${apiBase}/api/loyalty/customers/${customerId}`).then(r => r.json());
      setDrillCustomer(fresh); openDrill(fresh);
    }
  };

  const saveReward = async (data) => {
    const isNew = !data.id;
    const url = isNew ? `${apiBase}/api/loyalty/rewards` : `${apiBase}/api/loyalty/rewards/${data.id}`;
    await fetch(url, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    setEditReward(null); setShowRewardForm(false);
    loadRewards();
  };

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <h2 style={{margin: 0, fontSize: 20}}>💎 Loyalty Program</h2>
        <div style={styles.tabs}>
          {['dashboard', 'customers', 'tiers', 'rewards'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={tabBtn(tab === t)}>
              {{dashboard:'Dashboard', customers:'Customers', tiers:'Tiers', rewards:'Rewards'}[t]}
            </button>
          ))}
        </div>
        <button onClick={() => { const a = document.createElement('a'); a.href = `${apiBase}/api/loyalty/export/customers.csv`; a.click(); }}
          style={{ background: '#34d39922', border: '1px solid #34d39966', color: '#34d399', borderRadius: 8, padding: '7px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          ⬇️ Export CSV
        </button>
      </div>

      {/* DASHBOARD */}
      {tab === 'dashboard' && stats && (
        <div style={{padding: 16}}>
          <div style={styles.kpiRow}>
            <KpiCard label="Total Members" value={stats.total_customers} color="#f97316" />
            <KpiCard label="Earn Hari Ini" value={`${stats.today.earn.total} pt`} sub={`${stats.today.earn.c} transaksi`} color="#4ade80" />
            <KpiCard label="Redeem Hari Ini" value={`${stats.today.redeem.total} pt`} sub={`${stats.today.redeem.c} transaksi`} color="#fbbf24" />
            <KpiCard label="Outstanding Points" value={stats.outstanding_points.toLocaleString('id-ID')} sub={fmtIDR(stats.outstanding_liability_idr) + ' liability'} color="#ef4444" />
          </div>

          <h3 style={styles.sectionTitle}>Tier Distribution</h3>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8}}>
            {tiers.map(t => {
              const d = stats.tier_distribution.find(x => x.tier === t.code);
              return (
                <div key={t.code} style={{...styles.tierStat, borderLeft: `4px solid ${t.color}`}}>
                  <div style={{fontSize: 22}}>{t.emoji} <b>{d?.count || 0}</b></div>
                  <div style={{fontSize: 11, color: '#9ca3af'}}>{t.name}</div>
                  <div style={{fontSize: 10, color: '#6b7280'}}>{t.earn_multiplier}x · min Rp {t.min_lifetime_spend.toLocaleString('id-ID')}</div>
                </div>
              );
            })}
          </div>

          <h3 style={styles.sectionTitle}>Config Loyalty</h3>
          <div style={styles.configBox}>
            {configForm && [
              ['point_per_amount', '1 poin earned per belanja Rp'],
              ['point_value_idr', 'Nilai 1 poin saat redeem (Rp)'],
              ['point_expiry_months', 'Point expiry (bulan)'],
              ['signup_bonus', 'Signup bonus (poin)'],
              ['referral_bonus_referrer', 'Referral bonus — pengajak (poin)'],
              ['referral_bonus_referred', 'Referral bonus — yang diajak (poin)'],
            ].map(([k, label]) => (
              <div key={k} style={styles.configRow}>
                <span>{label}</span>
                <input type="number" value={configForm[k] ?? ''}
                  onChange={e => setConfigForm(f => ({ ...f, [k]: e.target.value }))}
                  style={{ width: 130, background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 6, padding: '6px 9px', color: '#fff', fontSize: 13, textAlign: 'right', fontFamily: 'inherit' }} />
              </div>
            ))}
            <button onClick={saveConfig} style={{ ...styles.btnPrimary, marginTop: 12 }}>💾 Simpan Config</button>
          </div>
        </div>
      )}

      {/* CUSTOMERS */}
      {tab === 'customers' && (
        <div style={{padding: 16}}>
          <div style={{display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap'}}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cari nama / phone / email..."
              onKeyDown={e => e.key === 'Enter' && loadCustomers()}
              style={{...styles.input, flex: 1, maxWidth: 400}} />
            <button onClick={loadCustomers} style={styles.btnPrimary}>Search</button>
            <label style={{ background: '#1e3a5f', color: '#93c5fd', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              ⬆️ Upload CSV
              <input type="file" accept=".csv,text/csv" onChange={handleUploadCsv} style={{ display: 'none' }} />
            </label>
            <span style={{ fontSize: 11, color: '#6b7280' }}>kolom: phone, name, email</span>
          </div>

          <table style={styles.table}>
            <thead><tr>
              <th style={styles.th}>Phone</th>
              <th style={styles.th}>Nama</th>
              <th style={styles.th}>Tier</th>
              <th style={{...styles.th, textAlign: 'right'}}>Points</th>
              <th style={{...styles.th, textAlign: 'right'}}>Lifetime Spend</th>
              <th style={{...styles.th, textAlign: 'right'}}>Visits</th>
              <th style={styles.th}>Last Visit</th>
              <th style={styles.th}></th>
            </tr></thead>
            <tbody>
              {customers.length === 0 && <tr><td colSpan={8} style={{...styles.td, textAlign: 'center', color: '#6b7280', padding: 30}}>Belum ada customer</td></tr>}
              {customers.map(c => (
                <tr key={c.id} style={{borderBottom: '1px solid #2a2a2a', cursor: 'pointer'}} onClick={() => openDrill(c)}>
                  <td style={{...styles.td, fontFamily: 'monospace', fontSize: 12}}>{c.phone}</td>
                  <td style={styles.td}>{c.name || <span style={{color: '#6b7280'}}>-</span>}</td>
                  <td style={styles.td}>
                    <span style={{...styles.tierBadge, background: c.tier_color + '33', color: c.tier_color}}>
                      {c.tier_emoji} {c.tier_name}
                    </span>
                  </td>
                  <td style={{...styles.td, textAlign: 'right', fontWeight: 600, color: '#f97316'}}>{c.current_points?.toLocaleString('id-ID')}</td>
                  <td style={{...styles.td, textAlign: 'right'}}>{fmtIDR(c.lifetime_spend)}</td>
                  <td style={{...styles.td, textAlign: 'right'}}>{c.total_visits}</td>
                  <td style={styles.td}>{fmtDateTime(c.last_visit_at)}</td>
                  <td style={styles.td}>
                    <button onClick={(e) => { e.stopPropagation(); setShowAdjust(c); }} style={styles.adjustBtn}>Adjust</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TIERS */}
      {tab === 'tiers' && (
        <div style={{padding: 16}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
            <h3 style={styles.sectionTitle}>Tier Configuration</h3>
            <button onClick={() => showTierForm ? closeTierForm() : (setEditTierCode(null), setShowTierForm(true))} style={styles.btnPrimary}>
              {showTierForm ? '× Tutup' : '+ Tambah Tier'}
            </button>
          </div>
          <div style={{fontSize: 12, color: '#9ca3af', marginBottom: 14, padding: 10, background: '#0f1a2a', borderRadius: 6}}>
            💡 Tier auto-promote saat customer lewat threshold min_lifetime_spend.
          </div>

          {showTierForm && (
            <div style={{...styles.tierCard, borderLeft: '4px solid #f97316', marginBottom: 14}}>
              <div style={{fontSize: 13, fontWeight: 600, marginBottom: 10}}>{editTierCode ? `Edit Tier — ${editTierCode}` : 'Tier Baru'}</div>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8}}>
                {[
                  ['code', 'Code (cth: diamond)', 'text'],
                  ['name', 'Nama tier', 'text'],
                  ['emoji', 'Emoji', 'text'],
                  ['min_lifetime_spend', 'Min lifetime spend', 'number'],
                  ['earn_multiplier', 'Earn multiplier (cth 1.5)', 'number'],
                  ['color', 'Warna (#hex)', 'text'],
                ].map(([k, ph, type]) => {
                  const lockCode = k === 'code' && !!editTierCode;
                  return (
                    <input key={k} type={type} placeholder={ph} value={tierForm[k]} readOnly={lockCode}
                      onChange={e => setTierForm(f => ({ ...f, [k]: e.target.value }))}
                      style={{ background: lockCode ? '#1a1a1a' : '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 6, padding: '8px 10px', color: lockCode ? '#6b7280' : '#fff', fontSize: 13, fontFamily: 'inherit' }} />
                  );
                })}
              </div>
              <button onClick={saveTier} style={{...styles.btnPrimary, marginTop: 10}}>💾 {editTierCode ? 'Update Tier' : 'Simpan Tier'}</button>
            </div>
          )}

          {tiers.map(t => (
            <div key={t.code} style={{...styles.tierCard, borderLeft: `4px solid ${t.color}`}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                <div>
                  <div style={{fontSize: 20, fontWeight: 600}}>{t.emoji} {t.name}</div>
                  <div style={{fontSize: 12, color: '#9ca3af', marginTop: 4}}>
                    Min lifetime spend: <b style={{color: '#fff'}}>{fmtIDR(t.min_lifetime_spend)}</b>
                    {' · '}Earn multiplier: <b style={{color: '#fff'}}>{t.earn_multiplier}x</b>
                    {' · '}<span style={{color: '#6b7280'}}>code: {t.code}</span>
                  </div>
                </div>
                <div style={{display: 'flex', gap: 6}}>
                  <button onClick={() => editTier(t)}
                    style={{ background: '#1e3a5f', color: '#93c5fd', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                    ✏️ Edit
                  </button>
                  {t.code !== 'bronze' && (
                    <button onClick={() => deleteTier(t.code)}
                      style={{ background: '#7f1d1d', color: '#fecaca', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                      🗑 Hapus
                    </button>
                  )}
                </div>
              </div>
              {t.benefits && (
                <div style={{fontSize: 12, color: '#9ca3af', marginTop: 10, padding: 10, background: '#0f0f0f', borderRadius: 6}}>
                  <div>{t.benefits.description}</div>
                  {t.benefits.perks?.length > 0 && (
                    <ul style={{margin: '6px 0 0', paddingLeft: 18}}>
                      {t.benefits.perks.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* REWARDS */}
      {tab === 'rewards' && (
        <div style={{padding: 16}}>
          <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 16}}>
            <h3 style={styles.sectionTitle}>Reward Catalog</h3>
            <button onClick={() => { setEditReward({}); setShowRewardForm(true); }} style={styles.btnPrimary}>+ New Reward</button>
          </div>

          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10}}>
            {rewards.map(r => (
              <div key={r.id} style={{...styles.rewardCard, opacity: r.is_active ? 1 : 0.5}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                  <div style={{fontSize: 28}}>{r.emoji || '🎁'}</div>
                  <div style={{...styles.tierBadge, background: '#2a2a2a', color: '#9ca3af'}}>{r.min_tier_code}+</div>
                </div>
                <div style={{fontSize: 15, fontWeight: 600, color: '#fff', marginTop: 8}}>{r.name}</div>
                <div style={{fontSize: 11, color: '#9ca3af', marginTop: 4}}>{r.description}</div>
                <div style={{margin: '10px 0', padding: '8px 10px', background: '#0f0f0f', borderRadius: 6, display: 'flex', justifyContent: 'space-between'}}>
                  <span style={{color: '#f97316', fontWeight: 700}}>{r.cost_points} poin</span>
                  <span style={{color: '#9ca3af'}}>{r.type === 'cash_discount' ? `−${fmtIDR(r.value_amount)}` : r.type === 'voucher' ? fmtIDR(r.value_amount) + ' voucher' : r.type}</span>
                </div>
                {r.remaining_stock !== null && r.total_stock && (
                  <div style={{fontSize: 10, color: '#9ca3af'}}>Stock: {r.remaining_stock}/{r.total_stock}</div>
                )}
                <div style={{display: 'flex', gap: 6, marginTop: 10}}>
                  <button onClick={() => { setEditReward(r); setShowRewardForm(true); }} style={{...styles.btn, flex: 1}}>✏️ Edit</button>
                  <button onClick={() => deleteReward(r.id)}
                    style={{ background: '#7f1d1d', color: '#fecaca', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                    🗑 Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DRILL DOWN CUSTOMER */}
      {drillCustomer && (
        <CustomerDrill customer={drillCustomer} transactions={drillTx} onClose={() => setDrillCustomer(null)} apiBase={apiBase} />
      )}

      {/* ADJUST POINTS MODAL */}
      {showAdjust && (
        <AdjustModal customer={showAdjust} onSubmit={submitAdjust} onCancel={() => setShowAdjust(null)} />
      )}

      {/* REWARD FORM MODAL */}
      {showRewardForm && (
        <RewardForm reward={editReward} tiers={tiers} onSave={saveReward} onCancel={() => { setShowRewardForm(false); setEditReward(null); }} />
      )}
    </div>
  );
}

// ============================================================
// CUSTOMER DRILL DOWN
// ============================================================
function CustomerDrill({ customer, transactions, onClose, apiBase }) {
  const [rewards, setRewards] = useState([]);

  useEffect(() => {
    fetch(`${apiBase}/api/loyalty/customers/${customer.id}/available-rewards`)
      .then(r => r.json()).then(setRewards).catch(() => {});
  }, [apiBase, customer.id]);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{...styles.modalBox, maxWidth: 700}} onClick={e => e.stopPropagation()}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
          <div>
            <div style={{fontSize: 11, color: '#9ca3af'}}>{customer.phone}</div>
            <h2 style={{margin: '2px 0', color: '#fff'}}>{customer.name || '(no name)'}</h2>
            <span style={{...styles.tierBadge, background: (customer.tier_color || '#6b7280') + '33', color: customer.tier_color}}>
              {customer.tier_emoji} {customer.tier_name}
            </span>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>×</button>
        </div>

        <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16}}>
          <Stat label="Current Points" value={customer.current_points?.toLocaleString('id-ID')} color="#f97316" />
          <Stat label="Lifetime Spend" value={fmtIDR(customer.lifetime_spend)} color="#fff" />
          <Stat label="Visits" value={customer.total_visits} color="#fff" />
        </div>

        <h4 style={{color: '#fff', fontSize: 13, marginTop: 16}}>Available Rewards</h4>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6, marginBottom: 16}}>
          {rewards.filter(r => r.eligible).map(r => (
            <div key={r.id} style={{padding: 8, background: r.affordable ? '#0a2818' : '#0f0f0f', borderRadius: 6, opacity: r.affordable ? 1 : 0.5}}>
              <div style={{fontSize: 11, color: '#fff'}}>{r.emoji} {r.name}</div>
              <div style={{fontSize: 10, color: r.affordable ? '#4ade80' : '#9ca3af', marginTop: 2}}>
                {r.cost_points} pt {!r.affordable && '(belum cukup)'}
              </div>
            </div>
          ))}
        </div>

        <h4 style={{color: '#fff', fontSize: 13}}>Transaction History (100 terakhir)</h4>
        <div style={{maxHeight: 300, overflowY: 'auto'}}>
          {transactions.map(tx => (
            <div key={tx.id} style={styles.txRow}>
              <div style={{flex: 1}}>
                <div style={{fontSize: 12, color: '#fff'}}>{tx.description || tx.type}</div>
                <div style={{fontSize: 10, color: '#6b7280'}}>{fmtDateTime(tx.created_at)} · {tx.type}</div>
              </div>
              <div style={{textAlign: 'right'}}>
                <div style={{fontSize: 14, fontWeight: 600, color: tx.points >= 0 ? '#4ade80' : '#ef4444'}}>
                  {tx.points >= 0 ? '+' : ''}{tx.points} pt
                </div>
                <div style={{fontSize: 10, color: '#6b7280'}}>bal: {tx.balance_after}</div>
              </div>
            </div>
          ))}
          {transactions.length === 0 && <div style={styles.empty}>Belum ada transaksi</div>}
        </div>

        {customer.referral_code && (
          <div style={{marginTop: 16, padding: 10, background: '#0f1a2a', borderRadius: 6, fontSize: 12, color: '#9ca3af'}}>
            🎟️ Referral code: <b style={{color: '#f97316', fontFamily: 'monospace'}}>{customer.referral_code}</b>
            {customer.referred_by && <span> · Referred by ID #{customer.referred_by}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// ADJUST MODAL
// ============================================================
function AdjustModal({ customer, onSubmit, onCancel }) {
  const [points, setPoints] = useState('');
  const [description, setDescription] = useState('');

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modalBox} onClick={e => e.stopPropagation()}>
        <h3 style={{color: '#fff', marginTop: 0}}>Adjust Points: {customer.name || customer.phone}</h3>
        <div style={{fontSize: 12, color: '#9ca3af', marginBottom: 14}}>
          Current: <b style={{color: '#f97316'}}>{customer.current_points} pt</b>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Points (+ atau − untuk add/subtract)</label>
          <input type="number" value={points} onChange={e => setPoints(e.target.value)} style={styles.input} placeholder="+100 atau -50" />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Alasan adjust (wajib)</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} style={{...styles.input, resize: 'vertical'}}
            placeholder="Mis: complaint compensation, system error, etc." />
        </div>
        <div style={{padding: 10, background: '#2a1f0a', borderRadius: 6, fontSize: 11, color: '#fbbf24', marginBottom: 12}}>
          ⚠️ Adjust manual ke-log dengan severity warning di anomaly events. Pakai sparingly.
        </div>
        <div style={{display: 'flex', gap: 8}}>
          <button onClick={onCancel} style={{...styles.btn, flex: 1}}>Batal</button>
          <button onClick={() => { if (points && description) onSubmit(customer.id, points, description); }}
            disabled={!points || !description} style={{...styles.btnPrimary, flex: 2}}>Submit</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// REWARD FORM
// ============================================================
function RewardForm({ reward, tiers, onSave, onCancel }) {
  const [data, setData] = useState(reward || {});
  const update = (k, v) => setData({ ...data, [k]: v });

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modalBox} onClick={e => e.stopPropagation()}>
        <h3 style={{color: '#fff', marginTop: 0}}>{data.id ? 'Edit' : 'New'} Reward</h3>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8}}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Nama</label>
            <input value={data.name || ''} onChange={e => update('name', e.target.value)} style={styles.input} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Emoji</label>
            <input value={data.emoji || ''} onChange={e => update('emoji', e.target.value)} style={styles.input} placeholder="🎁" />
          </div>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Description</label>
          <input value={data.description || ''} onChange={e => update('description', e.target.value)} style={styles.input} />
        </div>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8}}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Cost Points</label>
            <input type="number" value={data.cost_points || ''} onChange={e => update('cost_points', Number(e.target.value))} style={styles.input} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Type</label>
            <select value={data.type || 'cash_discount'} onChange={e => update('type', e.target.value)} style={styles.select}>
              <option value="cash_discount">Cash Discount</option>
              <option value="voucher">Voucher</option>
              <option value="free_item">Free Item</option>
            </select>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Value (Rp)</label>
            <input type="number" value={data.value_amount || ''} onChange={e => update('value_amount', Number(e.target.value))} style={styles.input} />
          </div>
        </div>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8}}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Min Tier</label>
            <select value={data.min_tier_code || 'bronze'} onChange={e => update('min_tier_code', e.target.value)} style={styles.select}>
              {tiers.map(t => <option key={t.code} value={t.code}>{t.emoji} {t.name}</option>)}
            </select>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Max per Customer</label>
            <input type="number" value={data.max_redemptions_per_customer || ''} onChange={e => update('max_redemptions_per_customer', e.target.value ? Number(e.target.value) : null)} style={styles.input} placeholder="unlimited" />
          </div>
        </div>
        <div style={{display: 'flex', gap: 8, marginTop: 12}}>
          <button onClick={onCancel} style={{...styles.btn, flex: 1}}>Batal</button>
          <button onClick={() => onSave(data)} disabled={!data.name || !data.cost_points} style={{...styles.btnPrimary, flex: 2}}>Save</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={styles.statCard}>
      <div style={{fontSize: 10, color: '#9ca3af', textTransform: 'uppercase'}}>{label}</div>
      <div style={{fontSize: 18, fontWeight: 600, color, marginTop: 4}}>{value}</div>
    </div>
  );
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div style={styles.kpi}>
      <div style={{fontSize: 10, color: '#9ca3af', textTransform: 'uppercase'}}>{label}</div>
      <div style={{fontSize: 22, fontWeight: 600, color, marginTop: 4}}>{value}</div>
      {sub && <div style={{fontSize: 10, color: '#6b7280', marginTop: 4}}>{sub}</div>}
    </div>
  );
}

const tabBtn = (active) => ({
  padding: '8px 14px', background: active ? '#1f1f1f' : 'transparent',
  color: active ? '#f97316' : '#9ca3af', border: 'none',
  borderBottom: active ? '2px solid #f97316' : '2px solid transparent',
  fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit'
});

const styles = {
  root: { background: '#0a0a0a', color: '#fff', minHeight: '100vh', fontFamily: 'system-ui,-apple-system,sans-serif' },
  header: { padding: '16px 24px 0', borderBottom: '1px solid #1f1f1f' },
  tabs: { display: 'flex', marginTop: 16 },
  sectionTitle: { fontSize: 14, color: '#fff', margin: '0 0 12px' },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 18 },
  kpi: { background: '#1a1a1a', borderRadius: 8, padding: 14, border: '1px solid #2a2a2a' },
  tierStat: { background: '#1a1a1a', padding: 12, borderRadius: 8 },
  configBox: { background: '#1a1a1a', padding: 14, borderRadius: 8, border: '1px solid #2a2a2a' },
  configRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #2a2a2a', fontSize: 12, color: '#9ca3af' },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { padding: 10, textAlign: 'left', color: '#9ca3af', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #2a2a2a' },
  td: { padding: 10, color: '#fff' },
  tierBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600 },
  adjustBtn: { padding: '4px 10px', background: '#2a2a2a', color: '#9ca3af', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },

  tierCard: { background: '#1a1a1a', padding: 14, borderRadius: 8, marginBottom: 10, border: '1px solid #2a2a2a' },
  rewardCard: { background: '#1a1a1a', padding: 14, borderRadius: 8, border: '1px solid #2a2a2a' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalBox: { background: '#1a1a1a', borderRadius: 12, padding: 20, maxWidth: 500, width: '95vw', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #2a2a2a' },
  closeBtn: { width: 36, height: 36, borderRadius: 8, background: '#2a2a2a', color: '#9ca3af', border: 'none', fontSize: 20, cursor: 'pointer' },
  statCard: { background: '#0f0f0f', padding: 10, borderRadius: 6 },

  txRow: { display: 'flex', gap: 8, padding: '8px 10px', borderBottom: '1px solid #2a2a2a' },
  empty: { padding: 30, textAlign: 'center', color: '#6b7280' },

  formGroup: { marginBottom: 10 },
  label: { fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500, display: 'block', marginBottom: 4 },
  input: { width: '100%', padding: '8px 10px', background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 4, color: '#fff', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' },
  select: { width: '100%', padding: '8px 10px', background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 4, color: '#fff', fontSize: 13, fontFamily: 'inherit' },
  btn: { padding: '10px 16px', background: '#2a2a2a', color: '#9ca3af', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  btnPrimary: { padding: '10px 16px', background: '#f97316', color: '#0a0a0a', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
};
