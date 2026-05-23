import ToppingPicker from "./ToppingPicker.jsx";
import Screensaver from "./Screensaver.jsx";
import KioskReviewFeed from "./KioskReviewFeed.jsx";
import * as audio from "./audio.js";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import PromoInput from "./PromoInput.jsx";
import { api, createSocket } from "./api.js";
import { useMenu } from "./MenuContext.jsx";
import { calcServiceCharge, loadServiceChargeConfig } from "./pricing.js";

const fIDR = (a) => "Rp " + Math.round(a||0).toLocaleString("id-ID");

// ─── FOOD IMAGE ───────────────────────────────────────────────────────────────
function FoodImage({ item, size = 140 }) {
  const palettes = {
    "🍦 Frozen Yogurt": ["#2D1B4E","#8B5CF6","#C084FC","#E9D5FF"],
    "🥤 Smoothies":     ["#831843","#EC4899","#F9A8D4","#FCE7F3"],
    "🍨 Yogulato":      ["#164E63","#06B6D4","#67E8F9","#CFFAFE"],
    "📦 Take Home":     ["#78350F","#F59E0B","#FCD34D","#FEF3C7"],
    "✨ Special":       ["#7F1D1D","#EF4444","#FCA5A5","#FEE2E2"],
  };
  const colors = palettes[item.category] || ["#333","#555","#777","#999"];
  const id = `grad-${item.id}`;
  return (
    <div style={{ width:size, height:size, borderRadius:16, overflow:"hidden", flexShrink:0, position:"relative" }}>
      <svg width={size} height={size} style={{ position:"absolute", inset:0 }}>
        <defs>
          <radialGradient id={id} cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor={colors[1]} stopOpacity="1"/>
            <stop offset="50%" stopColor={colors[0]} stopOpacity="1"/>
            <stop offset="100%" stopColor="#111" stopOpacity="1"/>
          </radialGradient>
        </defs>
        <rect width={size} height={size} fill={`url(#${id})`}/>
        {[...Array(8)].map((_,i) => (
          <circle key={i} cx={20+i*16} cy={size-18} r={3} fill={colors[2]} fillOpacity={0.3}/>
        ))}
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
        fontSize: size > 100 ? 52 : 32, filter:"drop-shadow(0 4px 8px rgba(0,0,0,0.5))" }}>
        {item.emoji}
      </div>
    </div>
  );
}

// ─── ADDON MODAL ──────────────────────────────────────────────────────────────
const addonsByCategory = {
  "🍔 Burgers": [
    { id:"a1", group:"Tingkat Kepedasan", type:"single", options:[
      {id:"sp0",label:"Tidak Pedas",price:0},{id:"sp1",label:"Pedas Sedang 🌶️",price:0},{id:"sp2",label:"Pedas Banget 🔥",price:0},
    ]},
    { id:"a2", group:"Tambahan Topping", type:"multi", options:[
      {id:"tp1",label:"Ekstra Keju",price:8000},{id:"tp2",label:"Ekstra Bacon",price:12000},
      {id:"tp3",label:"Telur Mata Sapi",price:8000},{id:"tp4",label:"Alpukat",price:10000},{id:"tp5",label:"Jamur Tumis",price:7000},
    ]},
    { id:"a3", group:"Saus Pilihan", type:"multi", options:[
      {id:"sc1",label:"BBQ Sauce",price:3000},{id:"sc2",label:"Sriracha Mayo",price:3000},
      {id:"sc3",label:"Garlic Aioli",price:3000},{id:"sc4",label:"Thousand Island",price:3000},
    ]},
  ],
  "🍕 Pizza": [
    { id:"b1", group:"Ukuran Pizza", type:"single", options:[
      {id:"sz1",label:"Personal (20cm)",price:0},{id:"sz2",label:"Medium (30cm)",price:25000},{id:"sz3",label:"Large (40cm)",price:45000},
    ]},
    { id:"b2", group:"Ekstra Topping", type:"multi", options:[
      {id:"pt1",label:"Mozzarella Ekstra",price:12000},{id:"pt2",label:"Pepperoni",price:15000},
      {id:"pt3",label:"Olive Hitam",price:8000},{id:"pt4",label:"Capsicum Merah",price:7000},{id:"pt5",label:"Truffle Oil",price:18000},
    ]},
    { id:"b3", group:"Pinggiran (Crust)", type:"single", options:[
      {id:"cr1",label:"Tipis & Renyah",price:0},{id:"cr2",label:"Thick Crust",price:5000},{id:"cr3",label:"Cheese Stuffed 🧀",price:15000},
    ]},
  ],
  "🥗 Salads": [
    { id:"c1", group:"Pilihan Protein", type:"single", options:[
      {id:"pr1",label:"Tanpa Protein",price:0},{id:"pr2",label:"Ayam Panggang",price:15000},
      {id:"pr3",label:"Udang Goreng",price:20000},{id:"pr4",label:"Tuna",price:18000},
    ]},
    { id:"c2", group:"Dressing", type:"single", options:[
      {id:"dr1",label:"Caesar",price:0},{id:"dr2",label:"Balsamic Vinaigrette",price:0},
      {id:"dr3",label:"Honey Mustard",price:0},{id:"dr4",label:"Tanpa Dressing",price:0},
    ]},
    { id:"c3", group:"Ekstra", type:"multi", options:[
      {id:"st1",label:"Crouton Ekstra",price:5000},{id:"st2",label:"Keju Parmesan",price:8000},{id:"st3",label:"Alpukat Slice",price:10000},
    ]},
  ],
  "🍟 Sides": [
    { id:"d1", group:"Ukuran Porsi", type:"single", options:[
      {id:"ps1",label:"Regular",price:0},{id:"ps2",label:"Large (+50%)",price:10000},
    ]},
    { id:"d2", group:"Saus Celup", type:"multi", options:[
      {id:"dp1",label:"Ketchup",price:2000},{id:"dp2",label:"Mayo",price:2000},{id:"dp3",label:"Cheese Sauce",price:5000},
      {id:"dp4",label:"Chipotle",price:3000},{id:"dp5",label:"Sweet Chili",price:2000},
    ]},
  ],
  "🥤 Drinks": [
    { id:"e1", group:"Ukuran", type:"single", options:[
      {id:"dk1",label:"Regular (350ml)",price:0},{id:"dk2",label:"Large (500ml)",price:8000},
    ]},
    { id:"e2", group:"Level Es", type:"single", options:[
      {id:"ic1",label:"Tanpa Es",price:0},{id:"ic2",label:"Es Sedikit",price:0},{id:"ic3",label:"Es Normal",price:0},{id:"ic4",label:"Es Penuh",price:0},
    ]},
    { id:"e3", group:"Tambahan", type:"multi", options:[
      {id:"da1",label:"Whipped Cream",price:5000},{id:"da2",label:"Boba Pearl",price:7000},
      {id:"da3",label:"Jelly Cincau",price:5000},{id:"da4",label:"Oat Milk",price:5000},
    ]},
  ],
  "🍰 Desserts": [
    { id:"f1", group:"Pilihan Topping", type:"multi", options:[
      {id:"dt1",label:"Ice Cream Scoop 🍨",price:12000},{id:"dt2",label:"Whipped Cream",price:5000},
      {id:"dt3",label:"Berry Compote",price:8000},{id:"dt4",label:"Caramel Drizzle",price:5000},{id:"dt5",label:"Chocolate Sauce",price:5000},
    ]},
    { id:"f2", group:"Temperatur", type:"single", options:[
      {id:"tm1",label:"Hangat",price:0},{id:"tm2",label:"Dingin",price:0},
    ]},
  ],
};

function AddonModal({ item, onClose, onConfirm }) {
  const groups = addonsByCategory[item.category] || [];
  const [sel, setSel] = useState(() => {
    const init = {};
    groups.forEach(g => { init[g.id] = g.type==="single" ? g.options[0].id : []; });
    return init;
  });
  const [note, setNote] = useState("");
  const addonTotal = groups.reduce((sum,g) => {
    if (g.type==="single") { const o=g.options.find(o=>o.id===sel[g.id]); return sum+(o?.price||0); }
    return sum+(sel[g.id]||[]).reduce((s,id)=>{ const o=g.options.find(o=>o.id===id); return s+(o?.price||0); },0);
  }, 0);
  return (
    <div style={AM.overlay} onClick={onClose}>
      <div style={AM.sheet} onClick={e=>e.stopPropagation()}>
        <div style={AM.header}>
          <FoodImage item={item} size={72}/>
          <div style={{flex:1}}>
            <div style={AM.name}>{item.name}</div>
            <div style={AM.price}>{fIDR(item.price)}</div>
            <div style={AM.desc}>{item.desc}</div>
          </div>
          <button style={AM.close} onClick={onClose}>✕</button>
        </div>
        <div style={AM.body}>
          {groups.map(g => (
            <div key={g.id} style={AM.group}>
              <div style={AM.groupTitle}>
                {g.group}
                <span style={AM.groupHint}>{g.type==="single"?"Pilih 1":"Bisa lebih dari 1"}</span>
              </div>
              <div style={AM.opts}>
                {g.options.map(opt => {
                  const active = g.type==="single" ? sel[g.id]===opt.id : sel[g.id]?.includes(opt.id);
                  return (
                    <button key={opt.id} style={{...AM.opt,...(active?AM.optOn:{})}}
                      onClick={()=>{
                        if(g.type==="single") setSel(s=>({...s,[g.id]:opt.id}));
                        else setSel(s=>({...s,[g.id]:s[g.id]?.includes(opt.id)?s[g.id].filter(x=>x!==opt.id):[...(s[g.id]||[]),opt.id]}));
                      }}>
                      <div style={{...AM.radio,borderColor:active?"#FF6B35":"#444",background:active?"#FF6B35":"transparent"}}>
                        {active && <div style={{width:8,height:8,borderRadius:"50%",background:"#fff"}}/>}
                      </div>
                      <span style={{flex:1,fontSize:15}}>{opt.label}</span>
                      <span style={{fontSize:13,color:opt.price?"#FF6B35":"#555",fontWeight:600}}>
                        {opt.price?`+${fIDR(opt.price)}`:"Gratis"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={AM.group}>
            <div style={AM.groupTitle}>Catatan <span style={AM.groupHint}>Opsional</span></div>
            <textarea style={AM.note} rows={2} placeholder="Contoh: tidak pakai bawang..."
              value={note} onChange={e=>setNote(e.target.value)}/>
          </div>
        </div>
        <div style={AM.footer}>
          {addonTotal>0 && <div style={AM.addonSum}>Tambahan: +{fIDR(addonTotal)}</div>}
          <button style={AM.confirm} onClick={()=>onConfirm(item,sel,note,addonTotal)}>
            TAMBAH KE KERANJANG  •  {fIDR(item.price+addonTotal)}
          </button>
        </div>
      </div>
      <style>{`@keyframes slideUp{from{transform:translateY(60px);opacity:0}to{transform:translateY(0);opacity:1}} textarea{resize:none;outline:none}`}</style>
    </div>
  );
}

const AM = {
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"},
  sheet:{background:"#141414",borderRadius:"24px 24px 0 0",width:"100%",maxWidth:640,maxHeight:"90vh",display:"flex",flexDirection:"column",animation:"slideUp 0.3s ease",border:"1px solid #2a2a2a",borderBottom:"none"},
  header:{display:"flex",gap:16,padding:"20px 20px 16px",borderBottom:"1px solid #1e1e1e",alignItems:"flex-start"},
  name:{fontSize:20,fontWeight:700,lineHeight:1.2,marginBottom:4},
  price:{fontSize:18,fontWeight:700,color:"#FF6B35",fontFamily:"'Inter',sans-serif",letterSpacing:1},
  desc:{fontSize:12,color:"#666",marginTop:4,lineHeight:1.4},
  close:{background:"#2a2a2a",border:"none",borderRadius:"50%",width:36,height:36,color:"#aaa",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"},
  body:{overflowY:"auto",padding:"0 20px",flex:1},
  group:{padding:"16px 0",borderBottom:"1px solid #1a1a1a"},
  groupTitle:{fontSize:12,fontWeight:700,letterSpacing:2,color:"#aaa",textTransform:"uppercase",marginBottom:10,display:"flex",justifyContent:"space-between"},
  groupHint:{fontSize:10,color:"#555",fontWeight:400,letterSpacing:0,textTransform:"none"},
  opts:{display:"flex",flexDirection:"column",gap:8},
  opt:{display:"flex",alignItems:"center",gap:12,background:"#1a1a1a",border:"1px solid #222",borderRadius:14,padding:"14px 16px",cursor:"pointer",color:"#ccc",textAlign:"left",transition:"all 0.15s"},
  optOn:{background:"rgba(255,107,53,0.08)",border:"1px solid #FF6B35",color:"#fff"},
  radio:{width:20,height:20,borderRadius:"50%",border:"2px solid",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"},
  note:{width:"100%",background:"#1a1a1a",border:"1px solid #222",borderRadius:12,padding:"12px 14px",color:"#ccc",fontSize:14,fontFamily:"'Inter',sans-serif",boxSizing:"border-box"},
  footer:{padding:"14px 20px 28px",borderTop:"1px solid #1e1e1e",background:"#0d0d0d"},
  addonSum:{fontSize:12,color:"#888",textAlign:"center",marginBottom:8},
  confirm:{width:"100%",background:"linear-gradient(90deg,#FF6B35,#FF3B30)",border:"none",borderRadius:16,padding:"18px",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",letterSpacing:1,fontFamily:"'Inter',sans-serif"},
};

const TAG_CLR = {
  "BESTSELLER":{bg:"#FF6B35",tx:"#fff"},"NEW":{bg:"#00C896",tx:"#fff"},"HOT 🔥":{bg:"#FF3B30",tx:"#fff"},
  "CHEF'S PICK":{bg:"#FFB800",tx:"#111"},"FRESH":{bg:"#4CD964",tx:"#fff"},"HEALTHY":{bg:"#5AC8FA",tx:"#fff"},
};

const IDLE_TIMEOUT = 45;

// ─── MAIN KIOSK ───────────────────────────────────────────────────────────────
export default function Kiosk({ onCheckout, onAdminAccess, tableInfo: tableInfoProp }) {
  const _menu = useMenu();
  const MENU_ITEMS = _menu.items;
  const CATEGORIES = useMemo(() => [
    "All",
    ..._menu.categories.map(c => `${c.emoji} ${c.name}`)
  ], [_menu.categories]);
  const MENU = useMemo(() => MENU_ITEMS.map(m => {
    const catCfg = _menu.categories.find(c => c.id === m.cat);
    return { ...m, category: catCfg ? `${catCfg.emoji} ${catCfg.name}` : m.cat };
  }), [MENU_ITEMS, _menu.categories]);

  const [cat,        setCat]        = useState("All");
  const [cart,       setCart]       = useState([]);
  const [screen,     setScreen]     = useState("menu");
  const [orderType,  setOrderType]  = useState(null);
  const [time,       setTime]       = useState(new Date());
  const [addonItem,  setAddonItem]  = useState(null);
  const [toppingItem,setToppingItem]= useState(null);
  const [logoTaps,   setLogoTaps]   = useState(0);
  const [promo,      setPromo]      = useState(null);
  const [showPromo,  setShowPromo]  = useState(false);
  const [showPromoTeaser, setShowPromoTeaser] = useState(false);
  const [promoTeaserShown, setPromoTeaserShown] = useState(false);
  const [serviceConfig, setServiceConfig] = useState({ pct: 5, enabled: true, label: "Service Charge" });
  useEffect(() => { loadServiceChargeConfig().then(setServiceConfig); }, []);
  const [tableInfo,  setTableInfo]  = useState(tableInfoProp || null);
  useEffect(() => { if (tableInfoProp) setTableInfo(tableInfoProp); }, [tableInfoProp]);

  // Full-screen kiosk — escape the 1126px #root width cap (index.css).
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    const pw = root.style.width, pm = root.style.maxWidth;
    root.style.width = "100%"; root.style.maxWidth = "none";
    return () => { root.style.width = pw; root.style.maxWidth = pm; };
  }, []);
  const [showStaffCall, setStaffCall] = useState(false);
  const [callReason, setCallReason] = useState("");
  const [callSent,   setCallSent]   = useState(false);
  const [stockOverrides, setStockOverrides] = useState({});
  const [showScreensaver, setShowScreensaver] = useState(false);
  const screensaverTimerRef = useRef(null);
  const [idleLeft,   setIdleLeft]   = useState(IDLE_TIMEOUT);
  const [showIdle,   setShowIdle]   = useState(false);
  const idleTimer    = useRef(null);
  const countdownRef = useRef(null);

  useEffect(() => {
    const t = setInterval(()=>setTime(new Date()), 1000);
    return ()=>clearInterval(t);
  }, []);

  useEffect(() => {
    const socket = createSocket((msg) => {
      if (msg.event === "menu:stockUpdate") {
        setStockOverrides(prev => ({ ...prev, [msg.data.id]: msg.data.avail }));
      }
      if (msg.event === "menu:bulkStockUpdate") {
        const overrides = {};
        (msg.data.items||[]).forEach(item => { overrides[item.id] = item.avail; });
        setStockOverrides(prev => ({ ...prev, ...overrides }));
      }
    });
    return () => socket.close();
  }, []);

  const resetIdle = useCallback(() => {
    setShowIdle(false);
    setIdleLeft(IDLE_TIMEOUT);
    clearTimeout(idleTimer.current);
    clearInterval(countdownRef.current);
    if (orderType) {
      idleTimer.current = setTimeout(() => {
        setShowIdle(true);
        setIdleLeft(15);
        countdownRef.current = setInterval(() => {
          setIdleLeft(n => {
            if (n <= 1) {
              clearInterval(countdownRef.current);
              setCart([]); setScreen("menu"); setOrderType(null);
              setPromo(null); setTableInfo(null); setShowIdle(false);
              return IDLE_TIMEOUT;
            }
            return n - 1;
          });
        }, 1000);
      }, IDLE_TIMEOUT * 1000);
    }
  }, [orderType]);

  useEffect(() => {
    resetIdle();
    return () => { clearTimeout(idleTimer.current); clearInterval(countdownRef.current); };
  }, [orderType, resetIdle]);

  useEffect(() => {
    const events = ["touchstart","click","keydown","mousemove"];
    const handler = () => resetIdle();
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    return () => events.forEach(e => window.removeEventListener(e, handler));
  }, [resetIdle]);

  useEffect(() => {
    const resetScreensaver = () => {
      if (screensaverTimerRef.current) clearTimeout(screensaverTimerRef.current);
      setShowScreensaver(false);
      if (orderType === null && cart.length === 0) {
        screensaverTimerRef.current = setTimeout(() => setShowScreensaver(true), 30000);
      }
    };
    resetScreensaver();
    const events = ["touchstart","click","keydown","mousemove"];
    const handler = () => resetScreensaver();
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    return () => {
      if (screensaverTimerRef.current) clearTimeout(screensaverTimerRef.current);
      events.forEach(e => window.removeEventListener(e, handler));
    };
  }, [orderType, cart.length]);

  const menuWithStock = MENU.map(item => ({
    ...item,
    avail: stockOverrides[item.id] !== undefined ? stockOverrides[item.id] : (item.avail !== false),
  }));
  const filtered   = (cat==="All" ? menuWithStock : menuWithStock.filter(i=>i.category===cat));
  const cartCount  = cart.reduce((a,e)=>a+e.qty, 0);
  const subtotal   = cart.reduce((s,e)=>s+(e.item.price+e.addonTotal)*e.qty, 0);
  const discount   = promo?.discount || 0;
  const afterDisc  = Math.max(0, subtotal - discount);
  // Service charge 5% otomatis untuk dine-in (config via /api/pos/config/SERVICE_CHARGE_DINEIN_*)
  const serviceCharge = calcServiceCharge(afterDisc, orderType, serviceConfig);
  const total      = afterDisc + serviceCharge;
  const tax        = Math.round(total * 11 / 111);

  const addToCart = (item, addons, note, addonTotal) => {
    const addonLabels = getAddonLabels(addons, item.category);
    const addonBreakdown = (addons?.toppings || []).map(t => ({ name: t.name, price: t.price || 0 }));
    setCart(c=>[...c,{item,addons,addonLabels,addonBreakdown,note,addonTotal,qty:1,uid:Date.now()}]);
    audio.playAddToCart();
    setAddonItem(null);
  };
  const changeQty = (uid, delta) => {
    audio.playClick();
    setCart(c=>c.map(e=>e.uid===uid?{...e,qty:e.qty+delta}:e).filter(e=>e.qty>0));
  };
  const clearCart = () => { setCart([]); setPromo(null); setPromoTeaserShown(false); };

  const goToConfirm = () => {
    // Single-click checkout — langsung ke confirm screen.
    // Promo teaser sebelumnya jadi interruption modal (perlu 2x klik) — sekarang
    // dilangkahi. User bisa input promo di confirm screen via PromoInput.
    setShowPromoTeaser(false);
    setScreen("confirm");
  };

  const getAddonLabels = (addons, category) => {
    const groups = addonsByCategory[category]||[];
    const labels = [];
    if (addons?.toppings?.length) addons.toppings.forEach(t => labels.push(t.name));
    groups.forEach(g=>{
      if(g.type==="single"){
        const o=g.options.find(o=>o.id===addons[g.id]);
        if(o&&!(o.price===0&&g.options[0].id===addons[g.id])) labels.push(o.label);
      } else (addons[g.id]||[]).forEach(id=>{
        const o=g.options.find(o=>o.id===id); if(o) labels.push(o.label);
      });
    });
    return labels;
  };

  useEffect(() => {
    if (showIdle) { audio.speak("Maaf, apakah masih di sini?"); }
  }, [showIdle]);

  // ── SCREENSAVER ───────────────────────────────────────────────────
  if (showScreensaver) return <Screensaver onDismiss={()=>setShowScreensaver(false)}/>;

  // ── IDLE WARNING ──────────────────────────────────────────────────
  if (showIdle) return (
    <div style={K.idleOverlay}>
      <style>{FONT_CSS+KIOSK_CSS}</style>
      <div style={K.idleBox}>
        <div style={{fontSize:64,marginBottom:16}}>😴</div>
        <div style={K.idleTitle}>Masih di sini?</div>
        <div style={K.idleSub}>Sesi akan direset dalam</div>
        <div style={K.idleCount}>{idleLeft}</div>
        <div style={K.idleBar}>
          <div style={{...K.idleFill,width:`${(idleLeft/15)*100}%`}}/>
        </div>
        <button style={K.idleBtn} onClick={()=>{audio.playConfirm(); resetIdle();}}>YA, LANJUTKAN PESAN</button>
        <button style={K.idleCancel} onClick={()=>{audio.playClick();setCart([]);setScreen("menu");setOrderType(null);setShowIdle(false);setPromoTeaserShown(false);}}>
          Mulai Ulang
        </button>
      </div>
    </div>
  );

  // ── WELCOME SCREEN ────────────────────────────────────────────────
  if (!orderType) return (
    <div style={K.welcome}>
      <style>{FONT_CSS+KIOSK_CSS}</style>
      <div style={K.welcomeInner}>
        <div style={K.logoWrap}>
          <img src="/logo.png" alt="KaryaOS" onClick={()=>{const n=logoTaps+1;setLogoTaps(n);if(n>=5&&onAdminAccess){setLogoTaps(0);onAdminAccess();}}} style={{width:150,height:150,objectFit:"contain",cursor:"pointer"}}/>
          <h1 style={K.brand}>KaryaOS</h1>
          <p style={K.tagline}>Crafted with love. Ordered with ease.</p>
        </div>
        <div style={K.clockDisp}>{time.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}</div>
        <p style={K.welcomeQ}>BAGAIMANA ANDA INGIN MEMESAN?</p>
        <div style={K.orderRow}>
          <button className="order-btn-premium" style={K.orderBtn} onClick={()=>setOrderType("dine")}>
            <span style={K.orderBtnIcon}>🪑</span>
            <span style={K.orderBtnLabel}>Makan di Sini</span>
            <span style={K.orderBtnSub}>Nikmati di meja Anda</span>
          </button>
          <button className="order-btn-premium" style={{...K.orderBtn,...K.orderBtnAlt}} onClick={()=>setOrderType("takeaway")}>
            <span style={K.orderBtnIcon}>🛍️</span>
            <span style={K.orderBtnLabel}>Bawa Pulang</span>
            <span style={K.orderBtnSub}>Dibawa pergi</span>
          </button>
        </div>
        <p style={K.tapHint}>KETUK UNTUK MULAI</p>
        <div style={{ marginTop: 22 }}><KioskReviewFeed/></div>
      </div>
    </div>
  );

  // ── CONFIRM SCREEN ────────────────────────────────────────────────
  if (screen==="confirm") return (
    <div style={K.root}>
      <style>{FONT_CSS+KIOSK_CSS}</style>
      <div style={K.confirmHeader}>
        <button style={K.backBtn} onClick={()=>setScreen("menu")}>← KEMBALI</button>
        <h2 style={K.confirmTitle}>KONFIRMASI PESANAN</h2>
        <div style={K.typePill}>{orderType==="dine"?"🪑 Makan di Sini":"🛍️ Bawa Pulang"}</div>
      </div>
      <div style={K.confirmBody}>
        <div style={K.confirmItems}>
          {cart.map(e=>{
            const labels = getAddonLabels(e.addons,e.item.category);
            return (
              <div key={e.uid} style={K.confirmItem}>
                <FoodImage item={e.item} size={72}/>
                <div style={K.confirmItemInfo}>
                  <div style={K.confirmItemName}>{e.item.name}</div>
                  {labels.length>0 && <div style={{...K.confirmItemAddon,marginTop:4,lineHeight:1.6}}>{labels.map((l,i)=><div key={i}>· {l}</div>)}</div>}
                  {e.note && <div style={K.confirmItemNote}>📝 {e.note}</div>}
                  <div style={{display:"flex",alignItems:"center",gap:8,marginTop:6}}>
                    <button style={K.qtyMinus} onClick={()=>changeQty(e.uid,-1)}>−</button>
                    <span style={K.qtyVal}>{e.qty}</span>
                    <button style={K.qtyPlus} onClick={()=>changeQty(e.uid,1)}>+</button>
                  </div>
                </div>
                <div style={K.confirmItemPrice}>{fIDR((e.item.price+e.addonTotal)*e.qty)}</div>
              </div>
            );
          })}
        </div>

        <button style={{
          display:"flex",alignItems:"center",justifyContent:"space-between",
          width:"100%",background:promo?"rgba(52,211,153,0.08)":"#1a1a1a",
          border:`1px solid ${promo?"rgba(52,211,153,0.3)":"#2a2a2a"}`,
          borderRadius:14,padding:"14px 16px",color:"#fff",marginBottom:16,cursor:"pointer",
        }} onClick={()=>setShowPromo(true)}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20}}>🏷️</span>
            <div style={{textAlign:"left"}}>
              {promo ? (
                <>
                  <div style={{fontSize:13,fontWeight:700,color:"#34D399"}}>{promo.code}</div>
                  <div style={{fontSize:11,color:"#888"}}>{promo.desc}</div>
                  {promo.freeItems?.length > 0 && (
                    <div style={{fontSize:11,color:"#34D399",marginTop:3,fontWeight:600}}>
                      🎁 GRATIS: {promo.freeItems.map(fi=>`${fi.qty}× ${fi.name}`).join(", ")}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{fontSize:13,fontWeight:600}}>Punya kode promo?</div>
                  <div style={{fontSize:11,color:"#666"}}>Ketuk untuk memasukkan kode</div>
                </>
              )}
            </div>
          </div>
          {promo ? (
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontFamily:"'Inter',sans-serif",fontSize:18,color:"#34D399",letterSpacing:1}}>-{fIDR(discount)}</span>
              <button style={{background:"transparent",border:"none",color:"#F87171",fontSize:14,padding:"4px 8px",borderRadius:8}}
                onClick={e=>{e.stopPropagation();setPromo(null);}}>✕</button>
            </div>
          ) : (
            <span style={{color:"#555",fontSize:13}}>→</span>
          )}
        </button>

        <div style={{fontSize:12,color:"#FB923C",margin:"-4px 0 14px",display:"flex",alignItems:"center",gap:7,background:"rgba(251,146,60,0.08)",border:"1px solid rgba(251,146,60,0.25)",borderRadius:10,padding:"9px 12px"}}>
          🎁 <span><b>Punya poin?</b> Bisa ditukar jadi diskon di langkah berikutnya — masukkan nomor HP member-mu.</span>
        </div>

        <div style={K.billBox}>
          <div style={K.billRow}><span style={K.billLabel}>Subtotal</span><span>{fIDR(subtotal)}</span></div>
          {promo && (
            <>
              <div style={{...K.billRow,color:"#34D399"}}>
                <span>🏷️ {promo.code}</span><span>-{fIDR(discount)}</span>
              </div>
              {promo.freeItems?.length > 0 && (
                <div style={{fontSize:10,color:"#6EE7B7",marginTop:-6,marginBottom:6,paddingLeft:18,fontStyle:"italic"}}>
                  🎁 {promo.freeItems.map(fi=>`${fi.qty}× ${fi.name}`).join(", ")} gratis
                </div>
              )}
            </>
          )}
          {serviceCharge > 0 && (
            <div style={{...K.billRow, color:"#FBBF24"}}>
              <span style={K.billLabel}>🍽️ {serviceConfig.label} {serviceConfig.pct}%</span>
              <span>{fIDR(serviceCharge)}</span>
            </div>
          )}
          <div style={K.billRow}><span style={K.billLabel}>PPN 11%</span><span>{fIDR(tax)}</span></div>
          <div style={K.billDivider}/>
          <div style={K.billTotal}>
            <span>TOTAL PEMBAYARAN</span>
            <span style={{color:"#FF6B35"}}>{fIDR(total)}</span>
          </div>
        </div>
      </div>

      <div style={K.confirmFooter}>
        <button style={K.editOrderBtn} onClick={()=>setScreen("menu")}>✎ Edit Pesanan</button>
        <button className="pay-btn-premium" style={K.payBtn} onClick={()=>onCheckout?onCheckout(cart,orderType,promo,tableInfo):null}>
          BAYAR SEKARANG  •  {fIDR(total)}
        </button>
      </div>

      {showPromoTeaser && (
        <div onClick={()=>{audio.playClick();setShowPromoTeaser(false);setScreen("confirm");}}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(8px)",zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center",animation:"fadeIn 0.2s ease"}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:"linear-gradient(135deg,#1a1a2e 0%,#050810 100%)",border:"2px solid #F59E0B44",borderRadius:24,padding:"40px 36px",maxWidth:480,width:"90%",textAlign:"center",boxShadow:"0 20px 60px rgba(245,158,11,0.2)",animation:"slideUp 0.3s ease"}}>
            <div style={{fontSize:80,marginBottom:20,animation:"giftBounce 1.2s ease infinite"}}>🎁</div>
            <h2 style={{fontFamily:"'Inter',sans-serif",fontSize:42,letterSpacing:3,margin:"0 0 12px",color:"#F59E0B"}}>CEK PROMO DULU?</h2>
            <p style={{fontSize:15,color:"#aaa",lineHeight:1.6,margin:"0 0 28px"}}>
              Punya kode promo atau voucher diskon?<br/>Pakai sekarang sebelum bayar!
            </p>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button onClick={()=>{audio.playConfirm();setShowPromoTeaser(false);setScreen("confirm");setShowPromo(true);}}
                style={{background:"linear-gradient(90deg,#F59E0B,#F97316)",border:"none",borderRadius:14,padding:"18px 24px",color:"#050810",fontSize:16,fontWeight:800,fontFamily:"'Inter',sans-serif",letterSpacing:3,cursor:"pointer"}}>
                🎟 YA, MASUKKAN KODE PROMO
              </button>
              <button onClick={()=>{audio.playClick();setShowPromoTeaser(false);setScreen("confirm");}}
                style={{background:"transparent",border:"1px solid #333",borderRadius:14,padding:"14px 24px",color:"#888",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                Lewati, lanjut ke konfirmasi
              </button>
            </div>
          </div>
          <style>{`
            @keyframes giftBounce{0%,100%{transform:translateY(0) rotate(-5deg)}50%{transform:translateY(-10px) rotate(5deg)}}
            @keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}
            @keyframes fadeIn{from{opacity:0}to{opacity:1}}
          `}</style>
        </div>
      )}

      {showPromo && (
        <PromoInput subtotal={subtotal} customerId={null} customerTags={[]}
          onApply={(r)=>{setPromo(r);setShowPromo(false);}} onClose={()=>setShowPromo(false)} cart={cart}/>
      )}
    </div>
  );

  // ── MENU SCREEN — SPLIT LAYOUT 60/40 ─────────────────────────────
  return (
    <div style={K.splitRoot} className="kiosk-root" onContextMenu={e=>e.preventDefault()}>
      <style>{FONT_CSS+KIOSK_CSS}</style>

      {/* ══ LEFT: Menu 60% ══ */}
      <div style={K.splitLeft}>
        {/* Header */}
        <div style={K.header}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <img src="/logo.png" alt="KaryaOS" style={{height:34,objectFit:"contain"}}/>
            <div>
              <div style={K.headerBrand}>KaryaOS</div>
              <div style={K.headerSub}>{orderType==="dine"?"🪑 Makan di Sini":"🛍️ Bawa Pulang"}</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={K.headerTime}>{time.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}</div>
            <button style={K.resetBtn} onClick={()=>{clearCart();setOrderType(null);}}>✕ Ganti</button>
          </div>
        </div>

        {/* Category bar */}
        <div style={K.catBar}>
          {CATEGORIES.map(c=>(
            <button key={c} className="cat-btn-premium" style={{...K.catBtn,...(cat===c?K.catActive:{})}} onClick={()=>setCat(c)}>
              {c}
            </button>
          ))}
        </div>

        {/* Menu grid — scrollable */}
        <div style={K.splitMenuScroll}>
          <div style={K.grid}>
            {filtered.map((item,i)=>{
              const inCart=cart.filter(e=>e.item.id===item.id).reduce((a,e)=>a+e.qty,0);
              return (
                <div key={item.id} className="menu-card" style={{...K.card,animationDelay:`${i*0.03}s`,opacity:item.avail===false?0.5:1,pointerEvents:item.avail===false?"none":"auto"}}>
                  {item.tag && (
                    <div style={{...K.tag,background:TAG_CLR[item.tag]?.bg,color:TAG_CLR[item.tag]?.tx}}>{item.tag}</div>
                  )}
                  {inCart>0 && <div style={K.inCartBadge}>{inCart}</div>}
                  <div style={K.imgWrap}>
                    <FoodImage item={item} size={110}/>
                  </div>
                  <div style={K.cardInfo}>
                    <div style={K.cardName}>{item.name}</div>
                    <div style={K.cardDesc}>{item.desc}</div>
                    <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                      <span style={K.calBadge}>{item.cal} kal</span>
                      <span style={K.addonHint}>✦ custom</span>
                    </div>
                    <div style={K.cardBottom}>
                      <span style={K.cardPrice}>{fIDR(item.price)}</span>
                      {item.avail === false ? (
                        <span style={K.soldOutBadge}>HABIS</span>
                      ) : (
                        <button className="add-btn" style={K.addBtn}
                          onClick={()=>{audio.playTap();(item.freeToppings>0?setToppingItem(item):setAddonItem(item));}}>
                          {inCart>0?"+ LAGI":"+ TAMBAH"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══ RIGHT: Cart 40% ══ */}
      <div style={K.splitRight}>
        {/* Cart header */}
        <div style={K.cartPanelHeader}>
          <h2 style={K.cartPanelTitle}>
            PESANAN{cartCount>0?` (${cartCount})`:""}
          </h2>
          {cart.length>0 && (
            <button onClick={clearCart} style={K.clearAllBtn}>🗑 Kosongin</button>
          )}
        </div>

        {/* Cart items — scrollable */}
        <div style={K.cartPanelBody}>
          {cart.length===0 ? (
            <div style={K.emptyCartPanel}>
              <div style={{fontSize:56,opacity:0.2,lineHeight:1}}>🛒</div>
              <div style={{fontSize:15,fontWeight:700,color:"#fff",opacity:0.35,marginTop:10}}>Belum ada pesanan</div>
              <div style={{fontSize:12,color:"#444",marginTop:6,textAlign:"center",lineHeight:1.6}}>
                Ketuk item di sebelah kiri<br/>untuk mulai pesan
              </div>
              <div style={{marginTop:14,padding:"7px 14px",borderRadius:999,border:"1px dashed #2a2a2a",fontSize:11,color:"#333",display:"flex",alignItems:"center",gap:6}}>
                <span style={{animation:"arrowPulse 1.8s ease-in-out infinite"}}>←</span>
                <span>pilih menu dulu</span>
              </div>
            </div>
          ) : (
            cart.map((e,i) => {
              const q = e.qty;
              const lineTotal = (e.item.price + e.addonTotal) * q;
              const labels = getAddonLabels(e.addons, e.item.category);
              return (
                <div key={e.uid} style={K.cartPanelRow}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:700,lineHeight:1.3}}>
                        <span style={{marginRight:6}}>{e.item.emoji}</span>{e.item.name}
                      </div>
                      <div style={{fontSize:12,color:"#666",marginTop:2}}>{fIDR(e.item.price)}</div>
                    </div>
                    <button onClick={()=>changeQty(e.uid,-q)} style={K.removeBtn}>✕</button>
                  </div>
                  {labels.length>0 && (
                    <div style={{fontSize:11,color:"#FF6B35",marginBottom:6,lineHeight:1.5}}>
                      + {labels.join(", ")}
                      {e.addonTotal>0 && <span style={{color:"#FF6B35"}}> ({fIDR(e.addonTotal)})</span>}
                    </div>
                  )}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <button onClick={()=>changeQty(e.uid,-1)} style={K.qtyMinus}>−</button>
                      <div style={{width:30,textAlign:"center",fontSize:13,fontWeight:700}}>{q}</div>
                      <button onClick={()=>changeQty(e.uid,1)} style={K.qtyPlus}>+</button>
                    </div>
                    <span style={{fontSize:14,fontWeight:700}}>{fIDR(lineTotal)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Cart footer */}
        <div style={K.cartPanelFooter}>
          {cart.length>0 ? (
            <>
              {/* Subtotal + service charge breakdown — kalau dine-in */}
              {serviceCharge > 0 && (
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,fontSize:12,color:"rgba(255,255,255,0.55)"}}>
                  <span>Subtotal</span>
                  <span>{fIDR(subtotal)}</span>
                </div>
              )}
              {serviceCharge > 0 && (
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,fontSize:12,color:"#FBBF24"}}>
                  <span>🍽️ {serviceConfig.label} {serviceConfig.pct}%</span>
                  <span>+{fIDR(serviceCharge)}</span>
                </div>
              )}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <span style={{fontFamily:"'Inter',sans-serif",fontSize:18,letterSpacing:1,color:"#aaa"}}>TOTAL</span>
                <span style={{fontFamily:"'Inter',sans-serif",fontSize:30,color:"#FF6B35"}}>{fIDR(total)}</span>
              </div>
              <button onClick={goToConfirm} className="pay-btn-premium"
                style={{width:"100%",padding:"16px",borderRadius:14,background:"linear-gradient(135deg,#FF6B35,#F59E0B)",border:"1px solid rgba(255,255,255,0.12)",color:"#fff",fontFamily:"'Inter',sans-serif",fontSize:18,fontWeight:800,letterSpacing:1.5,cursor:"pointer",boxShadow:SHADOW_CTA}}>
                CHECKOUT →
              </button>
            </>
          ) : (
            <button disabled style={{width:"100%",padding:"16px",borderRadius:14,background:"rgba(255,255,255,0.025)",border:BORDER_DEFAULT,color:"rgba(255,255,255,0.2)",fontFamily:"'Inter',sans-serif",fontSize:16,fontWeight:700,letterSpacing:1.5,cursor:"not-allowed"}}>
              PILIH MENU DULU
            </button>
          )}
        </div>
      </div>

      {/* ── MODALS ── */}
      {addonItem && (
        <AddonModal item={addonItem} onClose={()=>setAddonItem(null)} onConfirm={addToCart}/>
      )}
      {toppingItem && (
        <ToppingPicker item={toppingItem} onClose={()=>setToppingItem(null)}
          onConfirm={(item,selectedToppings,addonCost)=>{
            addToCart(item,{toppings:selectedToppings},"",addonCost);
            setToppingItem(null);
          }}/>
      )}

      {/* Staff call button */}
      {tableInfo && (
        <button style={K.staffCallBtn} onClick={()=>{setStaffCall(true);setCallSent(false);setCallReason("");}}>
          🔔 Panggil Staff
        </button>
      )}

      {/* Staff call modal */}
      {showStaffCall && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
          <div style={{background:"#0d1117",border:"1px solid #1a1a2e",borderRadius:20,padding:"28px",width:"100%",maxWidth:480,textAlign:"center"}}>
            {callSent ? (
              <>
                <div style={{fontSize:56,marginBottom:12}}>✅</div>
                <div style={{fontFamily:"'Inter',sans-serif",fontSize:24,letterSpacing:3,color:"#34D399",marginBottom:8}}>STAFF DIPANGGIL!</div>
                <div style={{fontSize:13,color:"#888",marginBottom:20}}>Mohon tunggu sebentar.</div>
                <button style={{...K.proceedBtn,background:"#1a1a2e",color:"#888"}} onClick={()=>setStaffCall(false)}>Tutup</button>
              </>
            ) : (
              <>
                <div style={{fontSize:48,marginBottom:12}}>🔔</div>
                <div style={{fontFamily:"'Inter',sans-serif",fontSize:24,letterSpacing:3,marginBottom:8}}>PANGGIL STAFF</div>
                <div style={{fontSize:13,color:"#666",marginBottom:20}}>Meja: {tableInfo?.name||"-"}</div>
                <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
                  {["Butuh bantuan","Meja kotor","Peralatan makan","Keluhan pesanan","Lainnya"].map(r=>(
                    <button key={r} style={{
                      background:callReason===r?"rgba(245,158,11,0.15)":"#1a1a2e",
                      border:`1px solid ${callReason===r?"#F59E0B44":"#21262d"}`,
                      borderRadius:10,padding:"12px",color:callReason===r?"#F59E0B":"#888",
                      fontSize:13,fontWeight:600,textAlign:"left",
                    }} onClick={()=>setCallReason(r)}>{r}</button>
                  ))}
                </div>
                <div style={{display:"flex",gap:10}}>
                  <button style={{flex:1,background:"#1a1a2e",border:"1px solid #21262d",borderRadius:12,padding:"14px",color:"#666",fontSize:13}} onClick={()=>setStaffCall(false)}>Batal</button>
                  <button style={{flex:2,background:"linear-gradient(90deg,#F59E0B,#F97316)",border:"none",borderRadius:12,padding:"14px",color:"#050810",fontWeight:700,fontSize:14,fontFamily:"'Inter',sans-serif",letterSpacing:1,opacity:!callReason?0.4:1}}
                    disabled={!callReason}
                    onClick={async()=>{await api.staffCall({tableId:tableInfo?.id,reason:callReason}).catch(()=>{});setCallSent(true);}}>
                    PANGGIL STAFF 🔔
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const FONT_CSS = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@700;800;900&family=DM+Sans:wght@300;400;500;600;700&display=swap');`;
const KIOSK_CSS = `
  :root{color-scheme:dark;--bg:#08090a;--text:#fff;--text-h:#fff;--border:#1e1f23}
  html,body{background:#08090a;color:#fff}
  *{box-sizing:border-box;margin:0;padding:0}
  ::-webkit-scrollbar{width:3px;height:3px}
  ::-webkit-scrollbar-thumb{background:rgba(255,107,53,0.6);border-radius:2px}
  ::-webkit-scrollbar-track{background:transparent}
  .cat-scroll::-webkit-scrollbar{display:none}
  .cat-scroll{-ms-overflow-style:none;scrollbar-width:none}
  @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pop{0%{transform:scale(1)}40%{transform:scale(1.12)}100%{transform:scale(1)}}
  @keyframes idlePulse{0%,100%{opacity:1}50%{opacity:0.5}}
  @keyframes arrowPulse{0%,100%{opacity:0.3;transform:translateX(0)}50%{opacity:0.8;transform:translateX(-4px)}}
  @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
  .menu-card{animation:fadeIn 0.3s cubic-bezier(0.4,0,0.2,1) forwards;transition:transform 0.25s cubic-bezier(0.4,0,0.2,1),border-color 0.25s ease,box-shadow 0.25s ease}
  .menu-card:hover{transform:translateY(-2px);border-color:rgba(255,255,255,0.12)!important;box-shadow:0 1px 2px rgba(0,0,0,0.3),0 12px 40px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.05)}
  .add-btn{transition:all 0.2s cubic-bezier(0.4,0,0.2,1)}
  .add-btn:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(255,107,53,0.35),inset 0 1px 0 rgba(255,255,255,0.15)}
  .add-btn:active{animation:pop 0.3s ease;transform:scale(0.93)!important}
  .cat-btn-premium{transition:all 0.2s cubic-bezier(0.4,0,0.2,1)}
  .cat-btn-premium:hover{background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.12)}
  .order-btn-premium{transition:all 0.25s cubic-bezier(0.4,0,0.2,1)}
  .order-btn-premium:hover{transform:translateY(-2px);box-shadow:0 1px 2px rgba(0,0,0,0.3),0 18px 48px rgba(0,0,0,0.45),inset 0 1px 0 rgba(255,255,255,0.06)}
  .pay-btn-premium{transition:all 0.25s cubic-bezier(0.4,0,0.2,1)}
  .pay-btn-premium:hover{transform:translateY(-1px);box-shadow:0 1px 2px rgba(0,0,0,0.3),0 16px 40px rgba(255,107,53,0.4),inset 0 1px 0 rgba(255,255,255,0.18)}
  button{cursor:pointer;font-family:'Inter',sans-serif}
  input,textarea{font-family:'Inter',sans-serif}
`;

// ─── PREMIUM AESTHETIC TOKENS ─────────────────────────────────────────────────
const PREMIUM_BG = "linear-gradient(160deg,#08090a 0%,#14151c 50%,#0a0b0e 100%)";
const PREMIUM_OVERLAY = "radial-gradient(800px 600px at 30% 10%,rgba(245,158,11,0.04),transparent),radial-gradient(600px 400px at 80% 70%,rgba(59,130,246,0.03),transparent)";
const GLASS_BG = "rgba(13,17,23,0.7)";
// Opaque dark card — fallback ke #0d1117 walaupun body putih (light-mode browser).
// Sebelumnya rgba(white,0.025) hampir transparan → teks white-on-white invisible.
const CARD_BG = "linear-gradient(180deg,#15171c 0%,#0d0f14 100%)";
const BORDER_DEFAULT = "1px solid rgba(255,255,255,0.08)";
const BORDER_FOCUS = "1px solid rgba(255,255,255,0.12)";
const SHADOW_CARD = "0 1px 2px rgba(0,0,0,0.3),0 8px 24px rgba(0,0,0,0.2),inset 0 1px 0 rgba(255,255,255,0.04)";
const SHADOW_CTA = "0 1px 2px rgba(0,0,0,0.3),0 10px 32px rgba(255,107,53,0.32),inset 0 1px 0 rgba(255,255,255,0.18)";

const K = {
  root:     {fontFamily:"'Inter',sans-serif",background:PREMIUM_BG,backgroundAttachment:"fixed",color:"#fff",minHeight:"100vh",display:"flex",flexDirection:"column",overflowX:"hidden",position:"relative"},

  // ── SPLIT LAYOUT ──
  splitRoot:{height:"100vh",background:PREMIUM_BG,backgroundImage:`${PREMIUM_OVERLAY},${PREMIUM_BG}`,color:"#fff",display:"flex",overflow:"hidden",fontFamily:"'Inter',sans-serif"},
  splitLeft:{flex:"0 0 60%",display:"flex",flexDirection:"column",borderRight:BORDER_DEFAULT,overflow:"hidden"},
  splitRight:{flex:"0 0 40%",display:"flex",flexDirection:"column",background:"linear-gradient(180deg,rgba(13,17,23,0.6),rgba(8,9,10,0.85))",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",borderLeft:BORDER_DEFAULT},
  splitMenuScroll:{flex:1,overflowY:"auto",padding:"12px 12px 16px"},

  // ── CART PANEL ──
  cartPanelHeader:{padding:"18px 22px",borderBottom:BORDER_DEFAULT,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"},
  cartPanelTitle:{fontFamily:"'Inter',sans-serif",fontSize:24,fontWeight:750,color:"#FF6B35",letterSpacing:"-0.5px"},
  cartPanelBody:{flex:1,overflowY:"auto",padding:"0 14px"},
  cartPanelRow:{background:CARD_BG,border:BORDER_DEFAULT,borderRadius:14,padding:"13px",marginTop:8,boxShadow:"0 1px 2px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.03)",transition:"all 0.2s cubic-bezier(0.4,0,0.2,1)"},
  cartPanelFooter:{padding:"18px 22px",borderTop:BORDER_DEFAULT,flexShrink:0,background:"linear-gradient(180deg,transparent,rgba(13,17,23,0.6))"},
  emptyCartPanel:{height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 24px",gap:0,userSelect:"none",paddingTop:60},
  removeBtn:{background:"transparent",border:"none",color:"#F87171",fontSize:16,cursor:"pointer",padding:"0 4px",flexShrink:0,transition:"all 0.2s ease",opacity:0.7},

  // ── IDLE ──
  idleOverlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif"},
  idleBox:    {textAlign:"center",padding:"44px 36px",background:GLASS_BG,backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderRadius:28,border:BORDER_FOCUS,maxWidth:380,boxShadow:"0 1px 2px rgba(0,0,0,0.4),0 24px 80px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.06)"},
  idleTitle:  {fontFamily:"'Inter',sans-serif",fontSize:32,fontWeight:750,letterSpacing:"-0.5px",color:"#FF6B35",marginBottom:8},
  idleSub:    {fontSize:13,color:"rgba(255,255,255,0.5)",marginBottom:12,fontFamily:"'Geist Mono',monospace",letterSpacing:1.5,textTransform:"uppercase"},
  idleCount:  {fontFamily:"'Inter',sans-serif",fontSize:72,fontWeight:750,letterSpacing:"-2px",color:"#fff",lineHeight:1,marginBottom:12},
  idleBar:    {height:6,background:"rgba(255,255,255,0.06)",borderRadius:3,marginBottom:24,overflow:"hidden"},
  idleFill:   {height:"100%",background:"linear-gradient(90deg,#FF6B35,#F59E0B)",borderRadius:3,transition:"width 1s linear",boxShadow:"0 0 12px rgba(255,107,53,0.5)"},
  idleBtn:    {width:"100%",background:"linear-gradient(135deg,#FF6B35,#F59E0B)",border:"none",borderRadius:14,padding:"16px",color:"#fff",fontSize:13,fontWeight:700,letterSpacing:1.5,fontFamily:"'Inter',sans-serif",marginBottom:10,boxShadow:SHADOW_CTA,transition:"all 0.2s cubic-bezier(0.4,0,0.2,1)"},
  idleCancel: {background:"transparent",border:BORDER_DEFAULT,borderRadius:10,padding:"10px 20px",color:"rgba(255,255,255,0.45)",fontSize:12,transition:"all 0.2s ease"},

  // ── WELCOME ──
  welcome:    {fontFamily:"'Inter',sans-serif",background:PREMIUM_BG,backgroundImage:`${PREMIUM_OVERLAY},${PREMIUM_BG}`,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"},
  welcomeInner:{textAlign:"center",padding:"40px 24px",maxWidth:620,width:"100%",position:"relative",zIndex:1},
  logoWrap:   {marginBottom:28},
  logoIcon:   {fontSize:72,lineHeight:1,marginBottom:10,display:"block"},
  brand:      {fontFamily:"'Inter',sans-serif",fontSize:"min(72px,11vw)",fontWeight:800,letterSpacing:"-1.5px",color:"#FF6B35",lineHeight:1,whiteSpace:"nowrap"},
  tagline:    {fontSize:13,color:"rgba(255,255,255,0.45)",marginTop:10,letterSpacing:2,fontFamily:"'Geist Mono',monospace",textTransform:"uppercase"},
  clockDisp:  {fontSize:14,color:"rgba(255,255,255,0.3)",marginBottom:40,letterSpacing:4,fontFamily:"'Geist Mono',monospace",fontVariantNumeric:"tabular-nums"},
  welcomeQ:   {fontSize:10,letterSpacing:3,color:"rgba(255,255,255,0.4)",marginBottom:24,fontFamily:"'Geist Mono',monospace",textTransform:"uppercase"},
  orderRow:   {display:"flex",gap:20,justifyContent:"center",marginBottom:40},
  orderBtn:   {background:CARD_BG,border:BORDER_DEFAULT,backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",borderRadius:24,padding:"34px 40px",display:"flex",flexDirection:"column",alignItems:"center",gap:8,flex:1,maxWidth:220,color:"#fff",cursor:"pointer",boxShadow:SHADOW_CARD},
  orderBtnAlt:{background:"linear-gradient(135deg,#FF6B35,#F59E0B)",border:"1px solid rgba(255,255,255,0.12)",boxShadow:"0 1px 2px rgba(0,0,0,0.3),0 14px 40px rgba(255,107,53,0.3),inset 0 1px 0 rgba(255,255,255,0.18)"},
  orderBtnIcon:{fontSize:44},
  orderBtnLabel:{fontFamily:"'Inter',sans-serif",fontSize:22,fontWeight:750,letterSpacing:"-0.5px"},
  orderBtnSub:{fontSize:11,color:"rgba(255,255,255,0.55)",fontFamily:"'Geist Mono',monospace",letterSpacing:1,textTransform:"uppercase",marginTop:2},
  tapHint:    {fontSize:10,letterSpacing:3,color:"rgba(255,255,255,0.2)",fontFamily:"'Geist Mono',monospace",textTransform:"uppercase"},

  // ── HEADER ──
  header:     {display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",background:"rgba(13,17,23,0.6)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",borderBottom:BORDER_DEFAULT,flexShrink:0},
  headerBrand:{fontFamily:"'Inter',sans-serif",fontSize:20,fontWeight:800,letterSpacing:"-0.5px",color:"#FF6B35"},
  headerSub:  {fontSize:10,color:"rgba(255,255,255,0.45)",fontFamily:"'Geist Mono',monospace",letterSpacing:1.5,textTransform:"uppercase",marginTop:2},
  headerTime: {fontSize:13,color:"rgba(255,255,255,0.35)",fontVariantNumeric:"tabular-nums",fontFamily:"'Geist Mono',monospace"},
  resetBtn:   {background:"transparent",border:BORDER_DEFAULT,borderRadius:8,padding:"6px 12px",color:"rgba(255,255,255,0.5)",fontSize:11,cursor:"pointer",transition:"all 0.2s ease",fontFamily:"'Geist Mono',monospace",letterSpacing:0.5},

  // ── CATEGORY ──
  catBar:     {display:"flex",gap:6,padding:"12px",overflowX:"auto",background:"rgba(13,17,23,0.4)",borderBottom:BORDER_DEFAULT,flexShrink:0},
  catBtn:     {background:"transparent",border:BORDER_DEFAULT,borderRadius:30,padding:"8px 16px",color:"rgba(255,255,255,0.55)",fontSize:13,whiteSpace:"nowrap",minHeight:40,flexShrink:0,fontWeight:500,letterSpacing:"-0.2px"},
  catActive:  {background:"rgba(255,107,53,0.15)",border:"1px solid rgba(255,107,53,0.4)",color:"#FF6B35",fontWeight:700,boxShadow:"inset 0 1px 0 rgba(255,255,255,0.08),0 0 16px rgba(255,107,53,0.15)"},

  // ── MENU GRID ──
  grid:       {display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12},
  card:       {background:CARD_BG,borderRadius:18,overflow:"hidden",display:"flex",flexDirection:"column",border:BORDER_DEFAULT,position:"relative",boxShadow:SHADOW_CARD},
  tag:        {position:"absolute",top:8,left:8,zIndex:2,fontSize:9,fontWeight:700,letterSpacing:1,padding:"3px 8px",borderRadius:20,boxShadow:"0 4px 12px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.2)"},
  inCartBadge:{position:"absolute",top:8,right:8,zIndex:2,background:"linear-gradient(135deg,#FF6B35,#F59E0B)",color:"#fff",borderRadius:"50%",width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,boxShadow:"0 4px 14px rgba(255,107,53,0.45),inset 0 1px 0 rgba(255,255,255,0.25)"},
  imgWrap:    {background:"linear-gradient(180deg,rgba(255,255,255,0.03) 0%,rgba(255,255,255,0.005) 100%)",padding:"12px",display:"flex",alignItems:"center",justifyContent:"center",minHeight:120},
  cardInfo:   {padding:"10px 12px",flex:1,display:"flex",flexDirection:"column",color:"#fff"},
  cardName:   {fontSize:14,fontWeight:750,lineHeight:1.25,marginBottom:4,letterSpacing:"-0.3px",color:"#fff"},
  cardDesc:   {fontSize:10,color:"rgba(255,255,255,0.4)",lineHeight:1.5,marginBottom:6,flex:1},
  calBadge:   {fontSize:9,color:"rgba(255,255,255,0.45)",background:"rgba(255,255,255,0.05)",border:BORDER_DEFAULT,padding:"2px 7px",borderRadius:20,fontFamily:"'Geist Mono',monospace",letterSpacing:0.5},
  addonHint:  {fontSize:9,color:"#FF6B35",background:"rgba(255,107,53,0.08)",padding:"2px 7px",borderRadius:20,border:"1px solid rgba(255,107,53,0.2)",fontFamily:"'Geist Mono',monospace",letterSpacing:0.5},
  cardBottom: {display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:"auto",paddingTop:6},
  cardPrice:  {fontFamily:"'Inter',sans-serif",fontSize:18,fontWeight:800,color:"#FF6B35",letterSpacing:"-0.5px"},
  addBtn:     {background:"linear-gradient(135deg,#FF6B35,#F59E0B)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:16,padding:"9px 14px",color:"#fff",fontSize:12,fontWeight:700,letterSpacing:0.5,boxShadow:"0 1px 2px rgba(0,0,0,0.3),0 4px 12px rgba(255,107,53,0.25),inset 0 1px 0 rgba(255,255,255,0.15)"},
  soldOutBadge:{background:"rgba(248,113,113,0.15)",color:"#F87171",border:"1px solid rgba(248,113,113,0.3)",borderRadius:20,padding:"6px 10px",fontSize:10,fontWeight:700,letterSpacing:1,fontFamily:"'Geist Mono',monospace",textTransform:"uppercase"},
  clearAllBtn:{background:"transparent",border:"none",color:"rgba(248,113,113,0.7)",fontSize:12,cursor:"pointer",transition:"all 0.2s ease"},

  // ── CART QTY ──
  qtyMinus:   {background:"rgba(255,255,255,0.05)",border:BORDER_DEFAULT,borderRadius:"50%",width:28,height:28,color:"#fff",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s ease"},
  qtyPlus:    {background:"linear-gradient(135deg,#FF6B35,#F59E0B)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:"50%",width:28,height:28,color:"#fff",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 8px rgba(255,107,53,0.3),inset 0 1px 0 rgba(255,255,255,0.18)",transition:"all 0.2s ease"},
  qtyVal:     {fontSize:14,fontWeight:750,minWidth:20,textAlign:"center",fontFamily:"'Geist Mono',monospace"},

  // ── STAFF CALL ──
  staffCallBtn:{position:"fixed",bottom:20,right:20,background:GLASS_BG,backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:30,padding:"11px 20px",color:"#F59E0B",fontSize:13,fontWeight:700,zIndex:50,display:"flex",alignItems:"center",gap:6,boxShadow:"0 1px 2px rgba(0,0,0,0.3),0 8px 24px rgba(245,158,11,0.15),inset 0 1px 0 rgba(255,255,255,0.05)",transition:"all 0.2s cubic-bezier(0.4,0,0.2,1)"},

  // ── CONFIRM SCREEN ──
  confirmHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",background:"rgba(13,17,23,0.7)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",borderBottom:BORDER_DEFAULT,position:"sticky",top:0,zIndex:10},
  backBtn:    {background:"transparent",border:BORDER_DEFAULT,borderRadius:10,padding:"8px 14px",color:"rgba(255,255,255,0.55)",fontSize:11,letterSpacing:1.5,fontFamily:"'Geist Mono',monospace",textTransform:"uppercase",transition:"all 0.2s ease"},
  confirmTitle:{fontFamily:"'Inter',sans-serif",fontSize:20,fontWeight:800,letterSpacing:"-0.5px",color:"#FF6B35"},
  typePill:   {background:"rgba(255,255,255,0.04)",border:BORDER_DEFAULT,borderRadius:20,padding:"5px 14px",fontSize:11,color:"rgba(255,255,255,0.65)",fontFamily:"'Geist Mono',monospace",letterSpacing:0.5},
  confirmBody:{flex:1,overflowY:"auto",padding:"20px 24px",display:"flex",flexDirection:"column",gap:0,background:"#08090a",color:"#fff"},
  confirmItems:{display:"flex",flexDirection:"column",gap:12,marginBottom:20},
  confirmItem:{display:"flex",alignItems:"flex-start",gap:14,background:CARD_BG,borderRadius:16,padding:"16px",border:BORDER_DEFAULT,boxShadow:SHADOW_CARD,color:"#fff"},
  confirmItemInfo:{flex:1,color:"#fff"},
  confirmItemName:{fontSize:16,fontWeight:750,marginBottom:4,letterSpacing:"-0.3px",color:"#fff"},
  confirmItemAddon:{fontSize:12,color:"#FF6B35",marginBottom:3},
  confirmItemNote:{fontSize:11,color:"rgba(255,255,255,0.45)",marginBottom:6,fontStyle:"italic"},
  confirmItemPrice:{fontSize:16,fontWeight:800,color:"#FF6B35",fontFamily:"'Inter',sans-serif",letterSpacing:"-0.5px",whiteSpace:"nowrap"},
  billBox:    {background:CARD_BG,backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",borderRadius:16,padding:"20px 24px",marginBottom:16,border:BORDER_DEFAULT,boxShadow:SHADOW_CARD},
  billRow:    {display:"flex",justifyContent:"space-between",padding:"7px 0",fontSize:14,borderBottom:"1px solid rgba(255,255,255,0.04)"},
  billLabel:  {color:"rgba(255,255,255,0.55)"},
  billDivider:{height:1,background:"rgba(255,255,255,0.08)",margin:"10px 0"},
  billTotal:  {display:"flex",justifyContent:"space-between",fontSize:22,fontWeight:800,fontFamily:"'Inter',sans-serif",letterSpacing:"-0.8px",paddingTop:4},
  confirmFooter:{padding:"16px 20px",background:"rgba(13,17,23,0.7)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",borderTop:BORDER_DEFAULT,display:"flex",gap:12},
  editOrderBtn:{background:"rgba(255,255,255,0.03)",border:BORDER_DEFAULT,borderRadius:14,padding:"16px 20px",color:"rgba(255,255,255,0.6)",fontSize:13,fontWeight:600,flex:1,transition:"all 0.2s ease"},
  payBtn:     {flex:2,background:"linear-gradient(135deg,#FF6B35,#F59E0B)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:14,padding:"16px",color:"#fff",fontSize:14,fontWeight:800,letterSpacing:0.5,fontFamily:"'Inter',sans-serif",boxShadow:SHADOW_CTA},
  proceedBtn: {width:"100%",marginTop:14,background:"linear-gradient(135deg,#FF6B35,#F59E0B)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:16,padding:"18px",color:"#fff",fontSize:15,fontWeight:800,letterSpacing:1.5,fontFamily:"'Inter',sans-serif",boxShadow:SHADOW_CTA},
};
