import { useState, useEffect } from "react";
import { api } from "./api.js";

import { fmtMoney as fIDR } from "./lib/currency.js";
const fDate = (d) => new Date(d).toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"});

const TYPE_CFG = {
  percent: { label:"Persen (%)",  icon:"%" },
  fixed:   { label:"Nominal (Rp)", icon:"Rp" },
  bogo:    { label:"BOGO 🎁",      icon:"🎁" },
};

const BOGO_MODES = [
  { value:"universal", label:"Universal — beli N item, gratis termurah" },
  { value:"same",      label:"Same item — beli & gratis item yang sama" },
  { value:"cross",     label:"Cross — beli item A, gratis item B" },
  { value:"category",  label:"Category — beli dari kategori X" },
];

const TAG_CFG = {
  active:  { bg:"rgba(52,211,153,0.12)", color:"#34D399", label:"Active" },
  expired: { bg:"rgba(248,113,113,0.12)", color:"#F87171", label:"Kadaluarsa" },
  inactive:{ bg:"rgba(107,114,128,0.1)",  color:"#6B7280", label:"Inactive" },
  full:    { bg:"rgba(245,158,11,0.12)",  color:"#F59E0B", label:"Habis" },
};

function promoStatus(p) {
  if (!p.active) return "inactive";
  if (Date.now() > p.validUntil) return "expired";
  if (p.usedCount >= p.usageLimit) return "full";
  return "active";
}

const EMPTY_FORM = {
  code:"", type:"percent", value:"", desc:"",
  minOrder:"", maxDiscount:"", usageLimit:"100",
  validUntil: new Date(Date.now()+86400000*30).toISOString().split("T")[0],
  active: true, forMember: false,
  requiredPaymentHint: "",
  // BOGO fields
  bogoMode:"universal",
  bogoBuyQty:"1",
  bogoGetQty:"1",
  bogoMaxFreeQty:"3",
  bogoTriggerItemId:"",
  bogoFreeItemId:"",
  bogoCategoryId:"",
};

export default function PromoManager({ onBack }) {
  const [promos,  setPromos]  = useState([]);
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm,setForm]    = useState(false);
  const [editing, setEditing] = useState(null); // promo being edited
  const [form,    setFV]      = useState(EMPTY_FORM);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState(null);
  const [filter,  setFilter]  = useState("all"); // all | active | expired | inactive
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [ps, st, menu] = await Promise.all([api.getPromos(), api.getPromoStats(), api.getMenu().catch(()=>[])]);
      setPromos(ps); setStats(st);
      const items = Array.isArray(menu) ? menu : (menu?.items || []);
      setMenuItems(items);
      setCategories([...new Set(items.map(i => i.category).filter(Boolean))]);
    } catch { setPromos([]); }
    finally { setLoading(false); }
  }

  function notify(msg, color="#34D399") {
    setToast({msg,color});
    setTimeout(()=>setToast(null), 3000);
  }

  function openCreate() {
    setEditing(null);
    setFV(EMPTY_FORM);
    setForm(true);
  }

  function openEdit(p) {
    setEditing(p);
    const bc = p.bogoConfig || {};
    setFV({
      code:       p.code,
      type:       p.type,
      value:      String(p.value),
      desc:       p.desc,
      minOrder:   String(p.minOrder),
      maxDiscount:String(p.maxDiscount),
      usageLimit: String(p.usageLimit),
      validUntil: new Date(p.validUntil).toISOString().split("T")[0],
      active:     p.active,
      forMember:  p.forMember,
      requiredPaymentHint: p.requiredPaymentHint || "",
      bogoMode:           bc.mode || "universal",
      bogoBuyQty:         String(bc.buyQty || 1),
      bogoGetQty:         String(bc.getQty || 1),
      bogoMaxFreeQty:     String(bc.maxFreeQty || 3),
      bogoTriggerItemId:  bc.triggerItemId || "",
      bogoFreeItemId:     bc.freeItemId || "",
      bogoCategoryId:     bc.categoryId || "",
    });
    setForm(true);
  }

  async function handleSave() {
    if (!form.code.trim()) { notify("Kode wajib diisi","#F87171"); return; }
    if (form.type !== "bogo" && !form.value) { notify("Nilai diskon wajib diisi","#F87171"); return; }
    if (form.type === "bogo") {
      if ((form.bogoMode === "same" || form.bogoMode === "cross") && !form.bogoTriggerItemId) { notify("Pilih trigger item dulu","#F87171"); return; }
      if (form.bogoMode === "cross" && !form.bogoFreeItemId) { notify("Pilih free item dulu","#F87171"); return; }
      if (form.bogoMode === "category" && !form.bogoCategoryId) { notify("Select category dulu","#F87171"); return; }
    }
    setSaving(true);
    const payload = {
      code:        form.code.trim().toUpperCase(),
      type:        form.type,
      value:       Number(form.value) || 0,
      desc:        form.desc,
      minOrder:    Number(form.minOrder)||0,
      maxDiscount: Number(form.maxDiscount)||Number(form.value)||100000,
      usageLimit:  Number(form.usageLimit)||999,
      validUntil:  form.validUntil,
      active:      form.active,
      forMember:   form.forMember,
      requiredPaymentHint: form.requiredPaymentHint?.trim() || null,
    };
    if (form.type === "bogo") {
      payload.bogoConfig = {
        mode: form.bogoMode,
        buyQty: Number(form.bogoBuyQty) || 1,
        getQty: Number(form.bogoGetQty) || 1,
        maxFreeQty: Number(form.bogoMaxFreeQty) || 99,
      };
      if (form.bogoMode === "same" || form.bogoMode === "cross") {
        payload.bogoConfig.triggerItemId = form.bogoTriggerItemId;
      }
      if (form.bogoMode === "cross") {
        payload.bogoConfig.freeItemId = form.bogoFreeItemId;
      }
      if (form.bogoMode === "category") {
        payload.bogoConfig.categoryId = form.bogoCategoryId;
      }
    }
    try {
      if (editing) {
        const updated = await api.updatePromo(editing.id, payload);
        setPromos(p=>p.map(x=>x.id===editing.id?updated:x));
        notify("Promo diperbarui ✓");
      } else {
        const created = await api.createPromo(payload);
        setPromos(p=>[created,...p]);
        notify("Promo baru dibuat ✓");
      }
      setForm(false);
    } catch (e) { notify(e.message || "Gagal simpan","#F87171"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!confirm("Hapus promo ini?")) return;
    await api.deletePromo(id).catch(()=>{});
    setPromos(p=>p.filter(x=>x.id!==id));
    notify("Promo dihapus");
  }

  async function toggleActive(p) {
    const updated = await api.updatePromo(p.id, {active:!p.active}).catch(()=>({...p,active:!p.active}));
    setPromos(prev=>prev.map(x=>x.id===p.id?updated:x));
    notify(updated.active?"Promo diaktifkan ✓":"Promo dinonaktifkan");
  }

  const filtered = promos.filter(p => {
    if (filter==="all") return true;
    return promoStatus(p) === filter;
  });

  return (
    <div style={M.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#F59E0B33;border-radius:2px}
        @keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        @keyframes notif{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        input:focus,select:focus{outline:none}
        button{font-family:'Inter',sans-serif;cursor:pointer}
      `}</style>

      {/* TOAST */}
      {toast && (
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",border:`1px solid ${toast.color}44`,background:`${toast.color}0f`,color:toast.color,borderRadius:10,padding:"10px 20px",fontSize:12,fontWeight:600,zIndex:999,animation:"notif 0.3s ease",whiteSpace:"nowrap"}}>
          {toast.msg}
        </div>
      )}

      {/* HEADER */}
      <div style={M.header}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div>
            <div style={M.title}>🏷️ MANAJEMEN PROMO</div>
            <div style={M.sub}>Buat & kelola kode promo untuk customer</div>
          </div>
        </div>
        <button style={M.createBtn} onClick={openCreate}>+ BUAT PROMO BARU</button>
      </div>

      {/* STATS */}
      {stats && (
        <div style={M.statsRow}>
          {[
            {icon:"🏷️", label:"Total Promo",   val:stats.total,        color:"#fff"},
            {icon:"✅", label:"Active",           val:stats.active,       color:"#34D399"},
            {icon:"📊", label:"Total Dipakai",   val:stats.totalUsage,   color:"#F59E0B"},
            {icon:"💰", label:"Total Hemat",     val:fIDR(stats.totalSaved||0), color:"#38BDF8"},
          ].map((s,i)=>(
            <div key={i} style={M.statCard}>
              <span style={{fontSize:22}}>{s.icon}</span>
              <div>
                <div style={{fontFamily:"'Geist Mono',monospace",fontSize:18,fontWeight:700,color:s.color}}>{s.val}</div>
                <div style={{fontSize:10,color:"#555",letterSpacing:1}}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={M.body}>
        {/* Filters */}
        <div style={M.filterRow}>
          {["all","active","expired","inactive","full"].map(f=>(
            <button key={f} style={{...M.filterBtn,...(filter===f?M.filterActive:{})}} onClick={()=>setFilter(f)}>
              {f==="all"?"Semua":TAG_CFG[f]?.label||f}
              <span style={M.filterCount}>{f==="all"?promos.length:promos.filter(p=>promoStatus(p)===f).length}</span>
            </button>
          ))}
          <button style={M.reloadBtn} onClick={load}>↺</button>
        </div>

        {/* Promo list */}
        {loading ? (
          <div style={{textAlign:"center",padding:48,color:"#555"}}>Memuat...</div>
        ) : (
          <div style={M.grid}>
            {filtered.length===0 && (
              <div style={{gridColumn:"1/-1",textAlign:"center",padding:48,color:"#444"}}>
                <div style={{fontSize:40,marginBottom:12}}>🏷️</div>
                Belum ada promo
              </div>
            )}
            {filtered.map(p=>{
              const st = promoStatus(p);
              const cfg = TAG_CFG[st];
              const pct = Math.min(100, Math.round(p.usedCount/p.usageLimit*100));
              return (
                <div key={p.id} style={{...M.card,animation:"fadeUp 0.2s ease"}}>
                  {/* Top row */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                    <div>
                      <div style={M.code}>{p.code}</div>
                      <div style={{...M.statusTag,...cfg}}>{cfg.label}</div>
                    </div>
                    <div style={M.discBadge}>
                      {p.type==="percent" ? `${p.value}%` : fIDR(p.value)}
                      <div style={{fontSize:10,color:"#aaa",fontWeight:400,fontFamily:"'Inter',sans-serif"}}>{p.type==="percent"?"diskon":"potongan"}</div>
                    </div>
                  </div>

                  {/* Desc */}
                  <div style={{fontSize:13,color:"#888",marginBottom:10,lineHeight:1.4}}>{p.desc||"—"}</div>

                  {/* Details */}
                  <div style={M.detailGrid}>
                    <div style={M.detail}><span style={M.dk}>Min. Order</span><span style={M.dv}>{fIDR(p.minOrder)}</span></div>
                    <div style={M.detail}><span style={M.dk}>Max Discount</span><span style={M.dv}>{fIDR(p.maxDiscount)}</span></div>
                    <div style={M.detail}><span style={M.dk}>Berlaku s/d</span><span style={M.dv}>{fDate(p.validUntil)}</span></div>
                    <div style={M.detail}><span style={M.dk}>Khusus Member</span><span style={{...M.dv,color:p.forMember?"#38BDF8":"#555"}}>{p.forMember?"Ya":"Tidak"}</span></div>
                  </div>

                  {/* Usage bar */}
                  <div style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#555",marginBottom:4}}>
                      <span>Penggunaan</span>
                      <span style={{color:"#F59E0B",fontFamily:"'Geist Mono',monospace"}}>{p.usedCount}/{p.usageLimit}</span>
                    </div>
                    <div style={{height:4,background:"#1a1a2e",borderRadius:2,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${pct}%`,background:pct>=90?"#F87171":"#F59E0B",borderRadius:2,transition:"width 0.5s"}}/>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{display:"flex",gap:6}}>
                    <button style={M.editBtn} onClick={()=>openEdit(p)}>✎ Edit</button>
                    <button style={{...M.toggleBtn,
                      background:p.active?"rgba(248,113,113,0.1)":"rgba(52,211,153,0.1)",
                      border:`1px solid ${p.active?"#F8717133":"#34D39933"}`,
                      color:p.active?"#F87171":"#34D399",
                    }} onClick={()=>toggleActive(p)}>
                      {p.active?"Deactivate":"Activate"}
                    </button>
                    <button style={M.delBtn} onClick={()=>handleDelete(p.id)}>🗑️</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── CREATE/EDIT FORM PANEL ── */}
      {showForm && (
        <div style={M.overlay} onClick={()=>setForm(false)}>
          <div style={M.formPanel} onClick={e=>e.stopPropagation()}>
            <div style={M.formHeader}>
              <div style={M.formTitle}>{editing?"✎ Edit Promo":"✦ Buat Promo Baru"}</div>
              <button style={M.formClose} onClick={()=>setForm(false)}>✕</button>
            </div>

            <div style={M.formBody}>
              {/* Code */}
              <div style={M.fieldGroup}>
                <label style={M.label}>Kode Promo <span style={{color:"#F87171"}}>*</span></label>
                <input style={{...M.input,fontFamily:"'Geist Mono',monospace",fontSize:18,letterSpacing:3,textTransform:"uppercase"}}
                  value={form.code} onChange={e=>setFV(f=>({...f,code:e.target.value.toUpperCase()}))}
                  placeholder="CONTOH10" maxLength={20}
                  /* disabled={!!editing} removed — code editable. Note: old orders retain old code string */
                />
                {editing && <div style={{fontSize:11,color:"#F59E0B",marginTop:4}}>⚠ Rename code: struk lama dengan kode ini tidak bisa dipakai lagi</div>}
              </div>

              {/* Type + Value */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div style={M.fieldGroup}>
                  <label style={M.label}>Tipe Discount</label>
                  <select style={M.input} value={form.type} onChange={e=>setFV(f=>({...f,type:e.target.value}))}>
                    <option value="percent">Persen (%)</option>
                    <option value="fixed">Nominal (Rp)</option>
                    <option value="bogo">🎁 BOGO (Buy 1 Get 1)</option>
                  </select>
                </div>
                {form.type !== "bogo" && (
                <div style={M.fieldGroup}>
                  <label style={M.label}>Nilai {form.type==="percent"?"%":"Rp"} <span style={{color:"#F87171"}}>*</span></label>
                  <input style={M.input} type="number" value={form.value}
                    onChange={e=>setFV(f=>({...f,value:e.target.value}))}
                    placeholder={form.type==="percent"?"10":"25000"} min="1"/>
                </div>
                )}
              </div>

              {/* ─── BOGO CONFIG (conditional) ──────────────────────────── */}
              {form.type === "bogo" && (
                <div style={{background:"rgba(167,139,250,0.06)",border:"1px solid rgba(167,139,250,0.2)",borderRadius:10,padding:14,marginTop:6}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#A78BFA",letterSpacing:1,marginBottom:12}}>🎁 BOGO CONFIG</div>

                  <div style={M.fieldGroup}>
                    <label style={M.label}>Mode BOGO</label>
                    <select style={M.input} value={form.bogoMode} onChange={e=>setFV(f=>({...f,bogoMode:e.target.value}))}>
                      {BOGO_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>

                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                    <div style={M.fieldGroup}>
                      <label style={M.label}>Buy Qty</label>
                      <input style={M.input} type="number" min="1" value={form.bogoBuyQty}
                        onChange={e=>setFV(f=>({...f,bogoBuyQty:e.target.value}))}/>
                    </div>
                    <div style={M.fieldGroup}>
                      <label style={M.label}>Get Free Qty</label>
                      <input style={M.input} type="number" min="1" value={form.bogoGetQty}
                        onChange={e=>setFV(f=>({...f,bogoGetQty:e.target.value}))}/>
                    </div>
                    <div style={M.fieldGroup}>
                      <label style={M.label}>Max Free / Trx</label>
                      <input style={M.input} type="number" min="1" value={form.bogoMaxFreeQty}
                        onChange={e=>setFV(f=>({...f,bogoMaxFreeQty:e.target.value}))}/>
                    </div>
                  </div>

                  {(form.bogoMode === "same" || form.bogoMode === "cross") && (
                    <div style={M.fieldGroup}>
                      <label style={M.label}>{form.bogoMode==="cross"?"Trigger Item (yang dibeli)":"Item yang dibeli & gratis"} <span style={{color:"#F87171"}}>*</span></label>
                      <select style={M.input} value={form.bogoTriggerItemId} onChange={e=>setFV(f=>({...f,bogoTriggerItemId:e.target.value}))}>
                        <option value="">-- pilih item --</option>
                        {menuItems.map(item => <option key={item.id} value={item.id}>{item.name} (Rp {item.price?.toLocaleString("id-ID")})</option>)}
                      </select>
                    </div>
                  )}

                  {form.bogoMode === "cross" && (
                    <div style={M.fieldGroup}>
                      <label style={M.label}>Free Item (yang gratis) <span style={{color:"#F87171"}}>*</span></label>
                      <select style={M.input} value={form.bogoFreeItemId} onChange={e=>setFV(f=>({...f,bogoFreeItemId:e.target.value}))}>
                        <option value="">-- pilih item --</option>
                        {menuItems.map(item => <option key={item.id} value={item.id}>{item.name} (Rp {item.price?.toLocaleString("id-ID")})</option>)}
                      </select>
                    </div>
                  )}

                  {form.bogoMode === "category" && (
                    <div style={M.fieldGroup}>
                      <label style={M.label}>Kategori <span style={{color:"#F87171"}}>*</span></label>
                      <select style={M.input} value={form.bogoCategoryId} onChange={e=>setFV(f=>({...f,bogoCategoryId:e.target.value}))}>
                        <option value="">-- pilih kategori --</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  )}

                  <div style={{fontSize:11,color:"#888",lineHeight:1.6,marginTop:8,padding:"8px 10px",background:"rgba(255,255,255,0.02)",borderRadius:6}}>
                    💡 <strong>Universal</strong>: cart qty ≥ {Number(form.bogoBuyQty)+Number(form.bogoGetQty)}, gratis {form.bogoGetQty} termurah · max {form.bogoMaxFreeQty} per trx<br/>
                    <strong>Same</strong>: minimal beli {form.bogoBuyQty}+{form.bogoGetQty} item yang sama<br/>
                    <strong>Cross</strong>: beli {form.bogoBuyQty} item A, gratis {form.bogoGetQty} item B (item B harus ada di cart)<br/>
                    <strong>Category</strong>: cart ≥ {Number(form.bogoBuyQty)+Number(form.bogoGetQty)} dari kategori dipilih, gratis termurah
                  </div>
                </div>
              )}

              {/* Desc */}
              <div style={M.fieldGroup}>
                <label style={M.label}>Deskripsi</label>
                <input style={M.input} value={form.desc}
                  onChange={e=>setFV(f=>({...f,desc:e.target.value}))}
                  placeholder="Discount 10% untuk semua menu" maxLength={80}/>
              </div>

              {/* Hint Pembayaran (bank partnership) */}
              <div style={M.fieldGroup}>
                <label style={M.label}>🏦 Hint Pembayaran (opsional)</label>
                <input style={M.input} value={form.requiredPaymentHint||""}
                  onChange={e=>setFV(f=>({...f,requiredPaymentHint:e.target.value}))}
                  placeholder="BCA, Mandiri, GoPay, OVO, dll." maxLength={20}/>
                <div style={{fontSize:11,color:"#F59E0B99",marginTop:6,lineHeight:1.5,padding:"6px 10px",background:"rgba(245,158,11,0.06)",borderRadius:6}}>
                  💡 Kalau diisi, customer dapat reminder "Bayar pakai aplikasi <strong>{form.requiredPaymentHint||"<bank>"}</strong>" saat apply promo & di payment screen. Kosongkan untuk promo umum (non-bank).
                </div>
              </div>

              {/* Min order + Max discount */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div style={M.fieldGroup}>
                  <label style={M.label}>Min. Order (Rp)</label>
                  <input style={M.input} type="number" value={form.minOrder}
                    onChange={e=>setFV(f=>({...f,minOrder:e.target.value}))}
                    placeholder="50000" min="0"/>
                </div>
                <div style={M.fieldGroup}>
                  <label style={M.label}>Max Discount (Rp)</label>
                  <input style={M.input} type="number" value={form.maxDiscount}
                    onChange={e=>setFV(f=>({...f,maxDiscount:e.target.value}))}
                    placeholder="50000" min="0"/>
                </div>
              </div>

              {/* Usage limit + Valid until */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div style={M.fieldGroup}>
                  <label style={M.label}>Batas Penggunaan</label>
                  <input style={M.input} type="number" value={form.usageLimit}
                    onChange={e=>setFV(f=>({...f,usageLimit:e.target.value}))}
                    placeholder="100" min="1"/>
                </div>
                <div style={M.fieldGroup}>
                  <label style={M.label}>Berlaku Hingga</label>
                  <input style={M.input} type="date" value={form.validUntil}
                    onChange={e=>setFV(f=>({...f,validUntil:e.target.value}))}/>
                </div>
              </div>

              {/* Toggles */}
              <div style={{display:"flex",gap:16}}>
                {[
                  {key:"active",    label:"Aktifkan promo"},
                  {key:"forMember", label:"Khusus member"},
                ].map(t=>(
                  <button key={t.key} style={{...M.toggleChip,
                    background:form[t.key]?"rgba(52,211,153,0.12)":"#1a1a2e",
                    border:`1px solid ${form[t.key]?"#34D39944":"#21262d"}`,
                    color:form[t.key]?"#34D399":"#555",
                  }} onClick={()=>setFV(f=>({...f,[t.key]:!f[t.key]}))}>
                    {form[t.key]?"✓":""} {t.label}
                  </button>
                ))}
              </div>

              {/* Preview */}
              {form.code && form.value && (
                <div style={M.preview}>
                  <div style={{fontSize:11,color:"#555",letterSpacing:2,marginBottom:8}}>PREVIEW</div>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{fontFamily:"'Geist Mono',monospace",fontSize:18,color:"#F59E0B",letterSpacing:2}}>{form.code}</div>
                    <div style={{fontSize:13,color:"#888",flex:1}}>{form.desc}</div>
                    <div style={{fontFamily:"'Geist Mono',monospace",fontSize:16,color:"#34D399"}}>
                      {form.type==="percent"?`${form.value}% OFF`:`-${fIDR(Number(form.value))}`}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={M.formFooter}>
              <button style={M.cancelBtn} onClick={()=>setForm(false)}>Cancel</button>
              <button style={{...M.saveBtn,opacity:saving?0.6:1}} disabled={saving} onClick={handleSave}>
                {saving?"⏳ Menyimpan...":(editing?"SIMPAN PERUBAHAN":"BUAT PROMO")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const M = {
  root:      {fontFamily:"'Inter',sans-serif",background:"#050810",color:"#fff",minHeight:"100%",display:"flex",flexDirection:"column",position:"fixed",top:0,left:0,right:0,bottom:0,overflowY:"auto",zIndex:9999},
  header:    {display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 24px",background:"#080c10",borderBottom:"1px solid #0f1629",flexWrap:"wrap",gap:10},
  title:     {fontFamily:"'Geist Mono',monospace",fontSize:18,fontWeight:700,color:"#F59E0B",letterSpacing:1},
  sub:       {fontSize:11,color:"#555"},
  backBtn:   {background:"transparent",border:"1px solid #1a1a2e",borderRadius:8,padding:"7px 12px",color:"#555",fontSize:12},
  createBtn: {background:"linear-gradient(90deg,#F59E0B,#F97316)",border:"none",borderRadius:10,padding:"10px 20px",color:"#050810",fontWeight:700,fontSize:13,letterSpacing:1,fontFamily:"'Geist Mono',monospace"},
  statsRow:  {display:"flex",gap:10,padding:"14px 24px",overflowX:"auto",background:"#080c10",borderBottom:"1px solid #0f1629"},
  statCard:  {display:"flex",alignItems:"center",gap:12,background:"#0d1117",border:"1px solid #1a1a2e",borderRadius:12,padding:"10px 16px",flexShrink:0},
  body:      {flex:1,padding:"16px 24px",overflowY:"auto"},
  filterRow: {display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"},
  filterBtn: {background:"#0d1117",border:"1px solid #1a1a2e",borderRadius:20,padding:"5px 14px",color:"#666",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:6},
  filterActive:{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B"},
  filterCount:{background:"#1a1a2e",borderRadius:10,padding:"1px 6px",fontSize:10},
  reloadBtn: {marginLeft:"auto",background:"transparent",border:"1px solid #1a1a2e",borderRadius:8,padding:"5px 10px",color:"#555",fontSize:13},
  grid:      {display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14},
  card:      {background:"#0d1117",border:"1px solid #1a1a2e",borderRadius:14,padding:"18px 20px"},
  code:      {fontFamily:"'Geist Mono',monospace",fontSize:20,fontWeight:700,color:"#F59E0B",letterSpacing:2,marginBottom:6},
  statusTag: {fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,display:"inline-block",letterSpacing:0.5},
  discBadge: {textAlign:"right",fontFamily:"'Geist Mono',monospace",fontSize:24,fontWeight:700,color:"#fff"},
  detailGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:12},
  detail:    {display:"flex",flexDirection:"column",gap:2},
  dk:        {fontSize:10,color:"#555",letterSpacing:1},
  dv:        {fontSize:12,fontWeight:600},
  editBtn:   {flex:1,background:"#1a1a2e",border:"1px solid #21262d",borderRadius:8,padding:"7px",color:"#aaa",fontSize:12,fontWeight:600},
  toggleBtn: {flex:1,borderRadius:8,padding:"7px",fontSize:11,fontWeight:700},
  delBtn:    {background:"rgba(248,113,113,0.08)",border:"1px solid #F8717122",borderRadius:8,padding:"7px 10px",fontSize:13},
  // Form
  overlay:   {position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"},
  formPanel: {background:"#0d1117",borderRadius:"24px 24px 0 0",width:"100%",maxWidth:560,maxHeight:"90vh",display:"flex",flexDirection:"column",border:"1px solid #1a1a2e",animation:"slideIn 0.25s ease"},
  formHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"20px 22px 16px",borderBottom:"1px solid #1a1a2e"},
  formTitle: {fontFamily:"'Geist Mono',monospace",fontSize:16,fontWeight:700,color:"#F59E0B"},
  formClose: {background:"#1a1a2e",border:"none",borderRadius:"50%",width:32,height:32,color:"#888",fontSize:14},
  formBody:  {padding:"16px 22px",flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:14},
  formFooter:{padding:"14px 22px 24px",borderTop:"1px solid #1a1a2e",display:"flex",gap:10},
  fieldGroup:{display:"flex",flexDirection:"column",gap:6},
  label:     {fontSize:11,fontWeight:700,color:"#888",letterSpacing:1,textTransform:"uppercase"},
  input:     {background:"#080c10",border:"1px solid #21262d",borderRadius:10,padding:"10px 14px",color:"#fff",fontSize:14,fontFamily:"'Inter',sans-serif"},
  toggleChip:{borderRadius:10,padding:"9px 16px",fontSize:13,fontWeight:600,transition:"all 0.15s"},
  preview:   {background:"#080c10",border:"1px solid #F59E0B22",borderRadius:12,padding:"14px 16px"},
  cancelBtn: {background:"transparent",border:"1px solid #21262d",borderRadius:10,padding:"12px 20px",color:"#666",fontSize:13,fontWeight:600},
  saveBtn:   {flex:1,background:"linear-gradient(90deg,#F59E0B,#F97316)",border:"none",borderRadius:10,padding:"12px",color:"#050810",fontWeight:700,fontSize:14,letterSpacing:1,fontFamily:"'Geist Mono',monospace"},
};
