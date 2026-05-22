import { useState, useEffect } from "react";
import { api } from "./api.js";

const fIDR  = (a) => "Rp " + Math.round(a||0).toLocaleString("id-ID");
const fDate = (d) => d ? new Date(d).toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"}) : "–";
const fAgo  = (d) => { if(!d) return "–"; const s=Math.floor((Date.now()-d)/86400000); return s===0?"Hari ini":s===1?"Kemarin":`${s} hari lalu`; };

const TAG_CFG = {
  member:{label:"Member",  bg:"rgba(56,189,248,0.12)", color:"#38BDF8"},
  vip:   {label:"⭐ VIP",  bg:"rgba(245,158,11,0.12)", color:"#F59E0B"},
  new:   {label:"Baru",    bg:"rgba(52,211,153,0.12)", color:"#34D399"},
};

export default function MemberList({ onBack }) {
  const [customers, setCustomers]   = useState([]);
  const [stats,     setStats]       = useState(null);
  const [loading,   setLoading]     = useState(true);
  const [search,    setSearch]      = useState("");
  const [tagFilter, setTagFilter]   = useState("all");
  const [selected,  setSelected]    = useState(null);
  const [waSending, setWASending]   = useState(null);
  const [waResult,  setWAResult]    = useState(null);
  const [waMsg,     setWAMsg]       = useState("");
  const [sortBy,    setSortBy]      = useState("lastVisit"); // lastVisit | visits | totalSpend | createdAt
  const [toast,     setToast]       = useState(null);

  useEffect(()=>{
    load();
  },[]);

  async function load() {
    setLoading(true);
    try {
      const [cRes, sRes] = await Promise.all([api.getCustomers(), api.getCustomerStats()]);
      setCustomers(cRes.data || cRes);
      setStats(sRes);
    } catch { setCustomers([]); }
    finally { setLoading(false); }
  }

  function notify(msg, color="#34D399") {
    setToast({msg,color});
    setTimeout(()=>setToast(null),3000);
  }

  async function handleSendWA(customer, customMsg) {
    setWASending(customer.id);
    try {
      // Get latest order for this customer
      const orders = await api.getOrders().catch(()=>[]);
      const lastOrder = orders.find(o=>o.customerId===customer.id || o.customerPhone===customer.phone);
      const result = await api.sendWATracking({
        phone:        customer.phone,
        orderId:      lastOrder?.id || "—",
        customerName: customer.name,
      });
      // Open WA link in new tab
      window.open(result.waUrl, "_blank");
      notify(`WhatsApp link dibuka untuk ${customer.name} ✓`);
    } catch { notify("Gagal membuat WA link","#F87171"); }
    finally { setWASending(null); }
  }

  async function handleDelete(id) {
    if (!confirm("Hapus customer ini?")) return;
    await api.deleteCustomer(id).catch(()=>{});
    setCustomers(p=>p.filter(c=>c.id!==id));
    if (selected?.id===id) setSelected(null);
    notify("Customer dihapus");
  }

  async function toggleTag(customer, tag) {
    const hasTags = customer.tags||[];
    const newTags = hasTags.includes(tag) ? hasTags.filter(t=>t!==tag) : [...hasTags, tag];
    const updated = await api.updateCustomer(customer.id, {tags:newTags}).catch(()=>({...customer,tags:newTags}));
    setCustomers(p=>p.map(c=>c.id===customer.id?updated:c));
    if (selected?.id===customer.id) setSelected(updated);
  }

  const filtered = customers
    .filter(c => {
      if (search) { const q=search.toLowerCase(); return c.name.toLowerCase().includes(q)||c.phone.includes(search); }
      return true;
    })
    .filter(c => tagFilter==="all" || (c.tags||[]).includes(tagFilter))
    .sort((a,b) => {
      if(sortBy==="visits")     return (b.visits||0)-(a.visits||0);
      if(sortBy==="totalSpend") return (b.totalSpend||0)-(a.totalSpend||0);
      if(sortBy==="createdAt")  return (b.createdAt||0)-(a.createdAt||0);
      return (b.lastVisit||0)-(a.lastVisit||0);
    });

  return (
    <div style={M.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#F59E0B33;border-radius:2px}
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        @keyframes notif{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        input:focus,textarea:focus{outline:none}
        .row:hover{background:rgba(255,255,255,0.02)!important}
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
        <div style={M.hLeft}>
          <button style={M.backBtn} onClick={onBack}>← Kembali</button>
          <div>
            <div style={M.title}>👥 MEMBER & CUSTOMER</div>
            <div style={M.sub}>Database pelanggan kiosk KaryaOS</div>
          </div>
        </div>
        <button style={M.reloadBtn} onClick={load}>↺ Refresh</button>
      </div>

      {/* STATS ROW */}
      {stats && (
        <div style={M.statsRow}>
          {[
            {label:"Total Customer", val:stats.total,               color:"#fff",       icon:"👥"},
            {label:"Member",         val:stats.members,             color:"#38BDF8",    icon:"🎫"},
            {label:"VIP",            val:stats.vip,                 color:"#F59E0B",    icon:"⭐"},
            {label:"Baru Hari Ini",  val:stats.newToday,            color:"#34D399",    icon:"🆕"},
            {label:"Total Revenue",  val:fIDR(stats.totalRev),      color:"#F59E0B",    icon:"💰"},
            {label:"Rata² Kunjungan",val:`${stats.avgVisits}x`,     color:"#A78BFA",    icon:"📊"},
          ].map((s,i)=>(
            <div key={i} style={M.statCard}>
              <span style={{fontSize:20}}>{s.icon}</span>
              <div>
                <div style={{fontFamily:"'Geist Mono',monospace",fontSize:18,fontWeight:700,color:s.color}}>{s.val}</div>
                <div style={{fontSize:10,color:"#555",letterSpacing:1,marginTop:2}}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={M.body}>
        {/* LEFT: List */}
        <div style={M.listCol}>
          {/* Filters */}
          <div style={M.filterBar}>
            <input style={M.searchInput} value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="🔍 Cari nama atau nomor HP..."/>
            <div style={M.filterGroup}>
              {["all","member","vip","new"].map(f=>(
                <button key={f} style={{...M.filterBtn,...(tagFilter===f?M.filterActive:{})}} onClick={()=>setTagFilter(f)}>
                  {f==="all"?"Semua":TAG_CFG[f]?.label||f}
                </button>
              ))}
            </div>
            <select style={M.sortSelect} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
              <option value="lastVisit">Kunjungan Terakhir</option>
              <option value="visits">Terbanyak Kunjungan</option>
              <option value="totalSpend">Terbesar Spend</option>
              <option value="createdAt">Terbaru Daftar</option>
            </select>
          </div>

          {loading ? (
            <div style={{textAlign:"center",padding:48,color:"#555"}}>Memuat data...</div>
          ) : (
            <div style={M.listWrap}>
              <div style={M.listHead}>
                <span style={{flex:2}}>Customer</span>
                <span style={{width:70,textAlign:"center"}}>Kunjungan</span>
                <span style={{width:110,textAlign:"right"}}>Total Spend</span>
                <span style={{width:90,textAlign:"center"}}>Kunjungan Terakhir</span>
                <span style={{width:80,textAlign:"center"}}>Aksi</span>
              </div>

              {filtered.length===0 && (
                <div style={{textAlign:"center",color:"#444",padding:40}}>Tidak ada customer ditemukan</div>
              )}

              {filtered.map(c=>(
                <div key={c.id} className="row" onClick={()=>setSelected(c)}
                  style={{...M.listRow,...(selected?.id===c.id?M.listRowActive:{})}}>
                  <span style={{flex:2,display:"flex",alignItems:"center",gap:10}}>
                    <div style={{...M.avatar,background:`hsl(${c.id.charCodeAt(1)*37%360},50%,30%)`}}>
                      {c.name[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{fontSize:13,fontWeight:600}}>{c.name}</div>
                      <div style={{fontSize:11,color:"#666",fontFamily:"'Geist Mono',monospace"}}>{c.phone}</div>
                      <div style={{display:"flex",gap:4,marginTop:3,flexWrap:"wrap"}}>
                        {(c.tags||[]).map(t=>(
                          <span key={t} style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:20,...(TAG_CFG[t]||{})}}>
                            {TAG_CFG[t]?.label||t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </span>
                  <span style={{width:70,textAlign:"center",fontFamily:"'Geist Mono',monospace",fontSize:14,fontWeight:700,color:"#F59E0B"}}>{c.visits}</span>
                  <span style={{width:110,textAlign:"right",fontSize:12,fontWeight:600}}>{fIDR(c.totalSpend)}</span>
                  <span style={{width:90,textAlign:"center",fontSize:11,color:"#555"}}>{fAgo(c.lastVisit)}</span>
                  <span style={{width:80,textAlign:"center",display:"flex",gap:4,justifyContent:"center"}}>
                    <button style={M.waIconBtn} disabled={waSending===c.id}
                      onClick={e=>{e.stopPropagation();handleSendWA(c);}}>
                      {waSending===c.id?"⏳":"💬"}
                    </button>
                    <button style={M.delIconBtn} onClick={e=>{e.stopPropagation();handleDelete(c.id);}}>🗑️</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Detail panel */}
        {selected && (
          <div style={{...M.detailCol,animation:"slideIn 0.25s ease"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div style={M.detailTitle}>Detail Customer</div>
              <button style={{background:"transparent",border:"none",color:"#555",fontSize:18,cursor:"pointer"}} onClick={()=>setSelected(null)}>✕</button>
            </div>

            {/* Avatar + name */}
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{...M.avatarLg,background:`hsl(${selected.id.charCodeAt(1)*37%360},50%,35%)`,margin:"0 auto 12px"}}>
                {selected.name[0].toUpperCase()}
              </div>
              <div style={{fontFamily:"'Geist Mono',monospace",fontSize:18,fontWeight:700}}>{selected.name}</div>
              <div style={{fontSize:13,color:"#666",fontFamily:"'Geist Mono',monospace",marginTop:4}}>{selected.phone}</div>
              <div style={{display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap",marginTop:8}}>
                {(selected.tags||[]).map(t=>(
                  <span key={t} style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,...(TAG_CFG[t]||{bg:"#222",color:"#aaa"})}}>{TAG_CFG[t]?.label||t}</span>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div style={M.statsGrid}>
              {[
                {label:"Total Kunjungan", val:selected.visits, color:"#F59E0B"},
                {label:"Total Spend",     val:fIDR(selected.totalSpend), color:"#34D399"},
                {label:"Rata² per Visit", val:selected.visits?fIDR(selected.totalSpend/selected.visits):"–", color:"#38BDF8"},
              ].map((s,i)=>(
                <div key={i} style={M.miniStat}>
                  <div style={{fontFamily:"'Geist Mono',monospace",fontSize:16,fontWeight:700,color:s.color}}>{s.val}</div>
                  <div style={{fontSize:10,color:"#555",marginTop:2}}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Timeline */}
            <div style={M.detailCard}>
              <div style={M.cardLabel}>TIMELINE</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {[
                  {label:"Daftar", val:fDate(selected.createdAt)},
                  {label:"Kunjungan Terakhir", val:fAgo(selected.lastVisit)},
                  {label:"Status", val:selected.tags?.includes("vip")?"⭐ VIP":selected.tags?.includes("member")?"🎫 Member":"🆕 Baru"},
                ].map((r,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #0f1629"}}>
                    <span style={{fontSize:12,color:"#555"}}>{r.label}</span>
                    <span style={{fontSize:12,fontWeight:600}}>{r.val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tags management */}
            <div style={M.detailCard}>
              <div style={M.cardLabel}>KELOLA TAG</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {["member","vip","new"].map(t=>{
                  const has = (selected.tags||[]).includes(t);
                  const cfg = TAG_CFG[t];
                  return (
                    <button key={t} style={{...M.tagToggle,
                      background:has?cfg.bg:"transparent",
                      border:`1px solid ${has?cfg.color:"#21262d"}`,
                      color:has?cfg.color:"#555",
                    }} onClick={()=>toggleTag(selected,t)}>
                      {has?"✓ ":""}{cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* WA section */}
            <div style={M.detailCard}>
              <div style={M.cardLabel}>KIRIM WHATSAPP</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <button style={M.waBigBtn} disabled={waSending===selected.id}
                  onClick={()=>handleSendWA(selected)}>
                  {waSending===selected.id ? "⏳ Membuka WA..." : "💬 Kirim Link Tracking"}
                </button>
                <button style={M.waPromoBtn} onClick={()=>{
                  const msg = encodeURIComponent(`Halo ${selected.name}! 🎉\n\nAda promo spesial dari KaryaOS untuk member setia kami!\n\nKunjungi kami sekarang dan dapatkan penawaran eksklusif. 🍽️\n\nSampai jumpa!`);
                  const waPhone = selected.phone.startsWith("0")?"62"+selected.phone.slice(1):selected.phone;
                  window.open(`https://wa.me/${waPhone}?text=${msg}`,"_blank");
                }}>
                  📣 Kirim Pesan Promo
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const M = {
  root:   {fontFamily:"'Inter',sans-serif",background:"#050810",color:"#fff",minHeight:"100vh",display:"flex",flexDirection:"column"},
  header: {display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 24px",background:"#080c10",borderBottom:"1px solid #0f1629",flexWrap:"wrap",gap:10},
  hLeft:  {display:"flex",alignItems:"center",gap:16},
  title:  {fontFamily:"'Geist Mono',monospace",fontSize:18,fontWeight:700,color:"#F59E0B",letterSpacing:1},
  sub:    {fontSize:11,color:"#555"},
  backBtn:{background:"transparent",border:"1px solid #1a1a2e",borderRadius:8,padding:"7px 12px",color:"#555",fontSize:12},
  reloadBtn:{background:"#0d1117",border:"1px solid #1a1a2e",borderRadius:8,padding:"7px 14px",color:"#888",fontSize:12},
  statsRow:{display:"flex",gap:10,padding:"14px 24px",overflowX:"auto",background:"#080c10",borderBottom:"1px solid #0f1629"},
  statCard:{display:"flex",alignItems:"center",gap:12,background:"#0d1117",border:"1px solid #1a1a2e",borderRadius:12,padding:"10px 16px",flexShrink:0},
  body:   {display:"flex",flex:1,overflow:"hidden"},
  listCol:{flex:1,display:"flex",flexDirection:"column",overflowY:"auto",padding:"16px 24px"},
  filterBar:{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"},
  searchInput:{flex:1,minWidth:200,background:"#0d1117",border:"1px solid #1a1a2e",borderRadius:10,padding:"8px 14px",color:"#fff",fontSize:13},
  filterGroup:{display:"flex",gap:4},
  filterBtn:{background:"#0d1117",border:"1px solid #1a1a2e",borderRadius:20,padding:"5px 12px",color:"#666",fontSize:11,fontWeight:600,transition:"all 0.15s"},
  filterActive:{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B"},
  sortSelect:{background:"#0d1117",border:"1px solid #1a1a2e",borderRadius:8,padding:"6px 10px",color:"#888",fontSize:11},
  listWrap:{background:"#080c10",border:"1px solid #0f1629",borderRadius:14,overflow:"hidden"},
  listHead:{display:"flex",padding:"10px 16px",background:"#050810",fontSize:10,color:"#555",letterSpacing:1,textTransform:"uppercase",borderBottom:"1px solid #0f1629",gap:8},
  listRow:{display:"flex",alignItems:"center",padding:"12px 16px",borderBottom:"1px solid #080c10",gap:8,cursor:"pointer",transition:"background 0.1s"},
  listRowActive:{background:"rgba(245,158,11,0.05)!important",borderLeft:"2px solid #F59E0B"},
  avatar:{width:36,height:36,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,flexShrink:0},
  waIconBtn:{background:"rgba(37,211,102,0.12)",border:"1px solid rgba(37,211,102,0.3)",borderRadius:8,padding:"5px 8px",fontSize:13},
  delIconBtn:{background:"rgba(248,113,113,0.08)",border:"1px solid rgba(248,113,113,0.2)",borderRadius:8,padding:"5px 8px",fontSize:13},
  detailCol:{width:300,background:"#080c10",borderLeft:"1px solid #0f1629",padding:"20px",overflowY:"auto",flexShrink:0},
  detailTitle:{fontFamily:"'Geist Mono',monospace",fontSize:13,fontWeight:700,color:"#aaa",letterSpacing:2},
  avatarLg:{width:64,height:64,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:700},
  statsGrid:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14},
  miniStat:{background:"#0d1117",border:"1px solid #0f1629",borderRadius:10,padding:"10px 8px",textAlign:"center"},
  detailCard:{background:"#0d1117",border:"1px solid #0f1629",borderRadius:12,padding:"14px",marginBottom:12},
  cardLabel:{fontSize:10,fontWeight:700,color:"#555",letterSpacing:2,textTransform:"uppercase",marginBottom:10},
  tagToggle:{borderRadius:20,padding:"5px 14px",fontSize:12,fontWeight:600,transition:"all 0.15s"},
  waBigBtn:{background:"linear-gradient(90deg,#25D366,#128C7E)",border:"none",borderRadius:10,padding:"11px",color:"#fff",fontWeight:700,fontSize:13,width:"100%"},
  waPromoBtn:{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:"10px",color:"#888",fontSize:12,width:"100%"},
};
