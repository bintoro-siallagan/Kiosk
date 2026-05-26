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
  // Prefer uploaded image if available
  const imageUrl = item.image_url || item.image;
  if (imageUrl) {
    const src = imageUrl.startsWith("http") ? imageUrl : imageUrl;
    return (
      <div style={{ width:size, height:size, borderRadius:16, overflow:"hidden", flexShrink:0, position:"relative", background:"#0a0e16" }}>
        <img src={src} alt={item.name} loading="lazy"
          style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }}
          onError={(e) => { e.currentTarget.style.display = "none"; }} />
      </div>
    );
  }
  // Fallback: SVG gradient + emoji
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
      <div className="lg" style={AM.sheet} onClick={e=>e.stopPropagation()}>
        <div style={AM.handle}/>
        <div style={AM.header}>
          <FoodImage item={item} size={72}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={AM.name}>{item.name}</div>
            <div style={AM.price}>{fIDR(item.price)}</div>
            {item.desc && <div style={AM.desc}>{item.desc}</div>}
          </div>
          <button style={AM.close} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div style={AM.body}>
          {groups.map(g => (
            <div key={g.id} style={AM.group}>
              <div style={AM.groupTitle}>
                <span>{g.group}</span>
                <span style={AM.groupHint}>{g.type==="single"?"Pick one":"Choose any"}</span>
              </div>
              <div style={AM.opts}>
                {g.options.map(opt => {
                  const active = g.type==="single" ? sel[g.id]===opt.id : sel[g.id]?.includes(opt.id);
                  return (
                    <button key={opt.id} className={active?"lg":""} style={{...AM.opt,...(active?AM.optOn:{})}}
                      onClick={()=>{
                        if(g.type==="single") setSel(s=>({...s,[g.id]:opt.id}));
                        else setSel(s=>({...s,[g.id]:s[g.id]?.includes(opt.id)?s[g.id].filter(x=>x!==opt.id):[...(s[g.id]||[]),opt.id]}));
                      }}>
                      <div style={{...AM.radio,borderColor:active?"var(--brand-primary,#FF6B35)":"rgba(255,255,255,0.18)",background:active?"var(--brand-primary,#FF6B35)":"transparent"}}>
                        {active && <div style={{width:8,height:8,borderRadius:"50%",background:"#fff"}}/>}
                      </div>
                      <span style={AM.optLabel}>{opt.label}</span>
                      <span style={{...AM.optPrice,color:opt.price?"#fff":"rgba(255,255,255,0.4)"}}>
                        {opt.price?`+${fIDR(opt.price)}`:"Free"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={AM.group}>
            <div style={AM.groupTitle}><span>Note</span> <span style={AM.groupHint}>Optional</span></div>
            <textarea style={AM.note} rows={2} placeholder="e.g. no onions, less spicy..."
              value={note} onChange={e=>setNote(e.target.value)}/>
          </div>
        </div>
        <div style={AM.footer}>
          {addonTotal>0 && <div style={AM.addonSum}>Add-ons +{fIDR(addonTotal)}</div>}
          <button className="lg lg-brand order-pill" style={AM.confirm} onClick={()=>onConfirm(item,sel,note,addonTotal)}>
            <span>Add to cart</span>
            <span style={AM.confirmAmount}>{fIDR(item.price+addonTotal)}</span>
          </button>
        </div>
      </div>
      <style>{`@keyframes slideUp{from{transform:translateY(60px);opacity:0}to{transform:translateY(0);opacity:1}} textarea{resize:none;outline:none}`}</style>
    </div>
  );
}

const AM = {
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(16px) saturate(180%)",WebkitBackdropFilter:"blur(16px) saturate(180%)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"},
  sheet:{borderRadius:"32px 32px 0 0",width:"100%",maxWidth:640,maxHeight:"90vh",display:"flex",flexDirection:"column",animation:"slideUp 0.35s cubic-bezier(.2,.8,.2,1)",borderBottom:"none",overflow:"hidden"},
  handle:{width:40,height:4,borderRadius:2,background:"rgba(255,255,255,0.15)",margin:"10px auto 4px"},
  header:{display:"flex",gap:14,padding:"14px 22px 18px",borderBottom:"1px solid rgba(255,255,255,0.06)",alignItems:"flex-start"},
  name:{fontSize:19,fontWeight:600,lineHeight:1.2,marginBottom:4,color:"rgba(255,255,255,0.95)",letterSpacing:"-0.4px",fontFamily:"'Inter',sans-serif"},
  price:{fontSize:16,fontWeight:600,color:"#fff",fontFamily:"'Inter',sans-serif",letterSpacing:"-0.3px",fontVariantNumeric:"tabular-nums"},
  desc:{fontSize:12,color:"rgba(255,255,255,0.5)",marginTop:5,lineHeight:1.45,fontFamily:"'Inter',sans-serif"},
  close:{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"50%",width:34,height:34,color:"rgba(255,255,255,0.6)",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},
  body:{overflowY:"auto",padding:"0 22px",flex:1},
  group:{padding:"16px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"},
  groupTitle:{fontSize:13,fontWeight:600,letterSpacing:"-0.2px",color:"rgba(255,255,255,0.92)",marginBottom:11,display:"flex",justifyContent:"space-between",alignItems:"baseline",fontFamily:"'Inter',sans-serif"},
  groupHint:{fontSize:11,color:"rgba(255,255,255,0.4)",fontWeight:400,letterSpacing:0,fontFamily:"'Inter',sans-serif"},
  opts:{display:"flex",flexDirection:"column",gap:8},
  opt:{display:"flex",alignItems:"center",gap:12,background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:14,padding:"13px 14px",cursor:"pointer",color:"rgba(255,255,255,0.85)",textAlign:"left",transition:"all 0.18s cubic-bezier(.2,.8,.2,1)",fontFamily:"'Inter',sans-serif"},
  optOn:{borderColor:"color-mix(in srgb,var(--brand-primary,#FF6B35) 50%,transparent)",color:"#fff",background:"color-mix(in srgb,var(--brand-primary,#FF6B35) 8%,rgba(255,255,255,0.02))"},
  optLabel:{flex:1,fontSize:14,fontWeight:500,letterSpacing:"-0.1px"},
  optPrice:{fontSize:13,fontWeight:600,fontVariantNumeric:"tabular-nums",letterSpacing:"-0.1px"},
  radio:{width:20,height:20,borderRadius:"50%",border:"2px solid",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.18s ease"},
  note:{width:"100%",background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:14,padding:"12px 14px",color:"rgba(255,255,255,0.9)",fontSize:14,fontFamily:"'Inter',sans-serif",boxSizing:"border-box",letterSpacing:"-0.1px"},
  footer:{padding:"14px 22px 24px",borderTop:"1px solid rgba(255,255,255,0.06)",background:"linear-gradient(180deg,transparent,rgba(0,0,0,0.18))"},
  addonSum:{fontSize:11,color:"rgba(255,255,255,0.5)",textAlign:"center",marginBottom:8,letterSpacing:0.2,fontFamily:"'Inter',sans-serif"},
  confirm:{width:"100%",border:"none",borderRadius:16,padding:"15px 20px",color:"#fff",fontSize:15,fontWeight:600,cursor:"pointer",letterSpacing:"-0.3px",fontFamily:"'Inter',sans-serif",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12},
  confirmAmount:{fontSize:16,fontWeight:600,letterSpacing:"-0.4px",fontVariantNumeric:"tabular-nums"},
};

const TAG_CLR = {
  "BESTSELLER":{bg:"#FF6B35",tx:"#000"},"NEW":{bg:"#00C896",tx:"#fff"},"HOT 🔥":{bg:"#FF3B30",tx:"#fff"},
  "CHEF'S PICK":{bg:"#FF6B35",tx:"#111"},"FRESH":{bg:"#4CD964",tx:"#fff"},"HEALTHY":{bg:"#5AC8FA",tx:"#fff"},
};

const IDLE_TIMEOUT = 45;

// ─── MAIN KIOSK ───────────────────────────────────────────────────────────────
export default function Kiosk({ onCheckout, onAdminAccess, tableInfo: tableInfoProp }) {
  const _menu = useMenu();
  const MENU_ITEMS = _menu.items;

  // Per-tenant brand override — fetch from /api/companies/branding (auto-scoped via outlet param or x-company-id)
  const [tenantBrand, setTenantBrand] = useState({ primary: "#FF6B35", secondary: "#E55A2B", name: null, code: null });
  useEffect(() => {
    fetch("/api/companies/branding").then(r => r.json()).then(b => {
      if (b?.brand_color) setTenantBrand({ primary: b.brand_color, secondary: b.brand_secondary || b.brand_color, name: b.name, code: b.company_code });
    }).catch(() => {});
  }, []);
  // Inject CSS variables so existing #FF6B35 references auto-themed via root override
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty("--brand-primary", tenantBrand.primary);
    r.style.setProperty("--brand-secondary", tenantBrand.secondary);
  }, [tenantBrand]);
  // "Platform default" tenant — these are the bootstrap/seed companies, treat as karyaos surface (not a customer brand).
  // BTS = Karya Bites (bootstrap F&B tenant), CMX = Cinema Express (bootstrap cinema tenant).
  const PLATFORM_TENANT_CODES = ["BTS", "CMX", "KARYAOS"];
  const isPlatformDefault = !tenantBrand.code || PLATFORM_TENANT_CODES.includes(tenantBrand.code);
  // Custom brand = real customer with their own brand identity (not bootstrap default, with brand color set)
  const isCustomBrand = !isPlatformDefault && tenantBrand.primary && tenantBrand.primary.toUpperCase() !== "#FF6B35";
  const BRAND_OVERRIDE_CSS = isCustomBrand ? `
    .add-btn { background: linear-gradient(135deg, ${tenantBrand.primary}, ${tenantBrand.secondary}) !important; }
    .pay-btn-premium { background: linear-gradient(135deg, ${tenantBrand.primary}, ${tenantBrand.secondary}) !important; }
    .order-btn-premium { color: ${tenantBrand.primary} !important; }
    .menu-card { border-top-color: ${tenantBrand.primary}33 !important; }
    .add-btn:hover { box-shadow: 0 6px 20px ${tenantBrand.primary}59, inset 0 1px 0 rgba(255,255,255,0.15) !important; }
    .pay-btn-premium:hover { box-shadow: 0 1px 2px rgba(0,0,0,0.3), 0 16px 40px ${tenantBrand.primary}66, inset 0 1px 0 rgba(255,255,255,0.18) !important; }
    ::-webkit-scrollbar-thumb { background: ${tenantBrand.primary}99 !important; }
  ` : "";
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
      <style>{FONT_CSS+KIOSK_CSS+BRAND_OVERRIDE_CSS}</style>
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
    <div style={{...K.welcome,background:"#000"}} className="boot-stage">
      <style>{FONT_CSS+KIOSK_CSS+BRAND_OVERRIDE_CSS}</style>
      <div style={K.welcomeInner}>
        {/* Backlit boot logo — lit-from-within feel ala MacBook lid */}
        <div style={{display:"flex",justifyContent:"center",marginBottom:40}}>
          <img
            src="/logo.png"
            alt={isCustomBrand ? tenantBrand.name : "karyaos"}
            className="boot-logo"
            onClick={()=>{const n=logoTaps+1;setLogoTaps(n);if(n>=5&&onAdminAccess){setLogoTaps(0);onAdminAccess();}}}
            style={{width:140,height:140,objectFit:"contain",cursor:"pointer"}}
          />
        </div>
        <h1 style={K.brand}>
          {isCustomBrand ? tenantBrand.name : (<>karya<span style={{fontWeight:300,opacity:.5}}>os</span></>)}
        </h1>
        <p style={K.tagline}>Crafted with love · Ordered with ease</p>
        <div style={K.clockDisp}>{time.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}</div>
        <div style={K.orderRow}>
          <button className="lg order-pill" style={K.orderBtn} onClick={()=>setOrderType("dine")}>
            <span style={K.orderBtnIcon}>🪑</span>
            <span style={K.orderBtnLabel}>Dine In</span>
            <span style={K.orderBtnSub}>Enjoy at your table</span>
          </button>
          <button className="lg lg-brand order-pill" style={{...K.orderBtn,...K.orderBtnAlt}} onClick={()=>setOrderType("takeaway")}>
            <span style={K.orderBtnIcon}>🛍️</span>
            <span style={K.orderBtnLabel}>Takeaway</span>
            <span style={K.orderBtnSub}>To go</span>
          </button>
        </div>
        <p style={K.tapHint}>Tap to begin</p>
      </div>
    </div>
  );

  // ── CONFIRM SCREEN ────────────────────────────────────────────────
  if (screen==="confirm") return (
    <div style={K.root}>
      <style>{FONT_CSS+KIOSK_CSS+BRAND_OVERRIDE_CSS}</style>
      <div style={K.confirmHeader}>
        <button style={K.backBtn} onClick={()=>setScreen("menu")}>← Back</button>
        <h2 style={K.confirmTitle}>Review your order</h2>
        <div style={K.typePill}>{orderType==="dine"?"🪑 Dine In":"🛍️ Takeaway"}</div>
      </div>
      <div style={K.confirmBody}>
        <div style={K.confirmItems}>
          {cart.map(e=>{
            const labels = getAddonLabels(e.addons,e.item.category);
            return (
              <div key={e.uid} className="lg" style={K.confirmItem}>
                <FoodImage item={e.item} size={72}/>
                <div style={K.confirmItemInfo}>
                  <div style={K.confirmItemName}>{e.item.name}</div>
                  {labels.length>0 && <div style={{...K.confirmItemAddon,marginTop:4,lineHeight:1.6}}>{labels.map((l,i)=><div key={i}>· {l}</div>)}</div>}
                  {e.note && <div style={K.confirmItemNote}>📝 {e.note}</div>}
                  <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8}}>
                    <button style={K.qtyMinus} onClick={()=>changeQty(e.uid,-1)} aria-label="Decrease">−</button>
                    <span style={K.qtyVal}>{e.qty}</span>
                    <button style={K.qtyPlus} onClick={()=>changeQty(e.uid,1)} aria-label="Increase">+</button>
                  </div>
                </div>
                <div style={K.confirmItemPrice}>{fIDR((e.item.price+e.addonTotal)*e.qty)}</div>
              </div>
            );
          })}
        </div>

        <button className="lg" style={K.promoCard} onClick={()=>setShowPromo(true)}>
          <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0,flex:1}}>
            <span style={K.promoIcon}>🏷️</span>
            <div style={{textAlign:"left",minWidth:0,flex:1}}>
              {promo ? (
                <>
                  <div style={K.promoCodeApplied}>{promo.code}</div>
                  <div style={K.promoDesc}>{promo.desc}</div>
                  {promo.freeItems?.length > 0 && (
                    <div style={K.promoFreeItems}>
                      🎁 Free: {promo.freeItems.map(fi=>`${fi.qty}× ${fi.name}`).join(", ")}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={K.promoTitle}>Have a promo code?</div>
                  <div style={K.promoDesc}>Tap to enter your code</div>
                </>
              )}
            </div>
          </div>
          {promo ? (
            <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
              <span style={K.promoDiscount}>−{fIDR(discount)}</span>
              <button style={K.promoRemoveBtn}
                onClick={e=>{e.stopPropagation();setPromo(null);}} aria-label="Remove promo">✕</button>
            </div>
          ) : (
            <span style={K.promoArrow}>→</span>
          )}
        </button>

        <div style={K.pointsHint}>
          <span style={{fontSize:14}}>🎁</span>
          <span><b style={{color:"rgba(255,255,255,0.85)"}}>Have loyalty points?</b> Redeem at the next step with your phone number.</span>
        </div>

        <div className="lg" style={K.billBox}>
          <div style={K.billRow}><span style={K.billLabel}>Subtotal</span><span style={K.billVal}>{fIDR(subtotal)}</span></div>
          {promo && (
            <>
              <div style={{...K.billRow,color:"rgba(52,211,153,0.92)"}}>
                <span>{promo.code}</span><span style={K.billVal}>−{fIDR(discount)}</span>
              </div>
              {promo.freeItems?.length > 0 && (
                <div style={K.billFreeLine}>
                  🎁 {promo.freeItems.map(fi=>`${fi.qty}× ${fi.name}`).join(", ")} included
                </div>
              )}
            </>
          )}
          {serviceCharge > 0 && (
            <div style={{...K.billRow, color:"rgba(251,191,36,0.85)"}}>
              <span style={K.billLabel}>{serviceConfig.label} · {serviceConfig.pct}%</span>
              <span style={K.billVal}>{fIDR(serviceCharge)}</span>
            </div>
          )}
          <div style={K.billRow}><span style={K.billLabel}>VAT · 11%</span><span style={K.billVal}>{fIDR(tax)}</span></div>
          <div style={K.billDivider}/>
          <div style={K.billTotal}>
            <span style={K.billTotalLabel}>Total</span>
            <span style={K.billTotalVal}>{fIDR(total)}</span>
          </div>
        </div>
      </div>

      <div style={K.confirmFooter}>
        <button style={K.editOrderBtn} onClick={()=>setScreen("menu")}>✎ Edit order</button>
        <button className="lg lg-brand order-pill" style={K.payBtn} onClick={()=>onCheckout?onCheckout(cart,orderType,promo,tableInfo):null}>
          <span>Pay now</span>
          <span style={K.payBtnAmount}>{fIDR(total)}</span>
        </button>
      </div>

      {showPromoTeaser && (
        <div onClick={()=>{audio.playClick();setShowPromoTeaser(false);setScreen("confirm");}}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(16px) saturate(180%)",WebkitBackdropFilter:"blur(16px) saturate(180%)",zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center",animation:"fadeIn 0.2s ease"}}>
          <div className="lg" onClick={e=>e.stopPropagation()}
            style={{borderRadius:28,padding:"40px 36px 32px",maxWidth:440,width:"90%",textAlign:"center",animation:"slideUp 0.35s cubic-bezier(.2,.8,.2,1)"}}>
            <div style={{fontSize:64,marginBottom:14,animation:"giftBounce 1.2s ease infinite",filter:"drop-shadow(0 8px 20px color-mix(in srgb,var(--brand-primary,#FF6B35) 35%,transparent))"}}>🎁</div>
            <h2 style={{fontFamily:"'Inter',sans-serif",fontSize:24,fontWeight:600,letterSpacing:"-0.6px",margin:"0 0 10px",color:"rgba(255,255,255,0.95)"}}>Check promo first?</h2>
            <p style={{fontSize:14,color:"rgba(255,255,255,0.55)",lineHeight:1.55,margin:"0 0 26px",fontFamily:"'Inter',sans-serif"}}>
              Got a code or voucher? Apply it before checkout.
            </p>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button className="lg lg-brand order-pill" onClick={()=>{audio.playConfirm();setShowPromoTeaser(false);setScreen("confirm");setShowPromo(true);}}
                style={{border:"none",borderRadius:14,padding:"15px 22px",color:"#fff",fontSize:15,fontWeight:600,fontFamily:"'Inter',sans-serif",letterSpacing:"-0.2px",cursor:"pointer"}}>
                Enter promo code
              </button>
              <button onClick={()=>{audio.playClick();setShowPromoTeaser(false);setScreen("confirm");}}
                style={{background:"transparent",border:"1px solid rgba(255,255,255,0.08)",borderRadius:14,padding:"13px 22px",color:"rgba(255,255,255,0.55)",fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
                Skip, continue to checkout
              </button>
            </div>
          </div>
          <style>{`
            @keyframes giftBounce{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-8px) rotate(4deg)}}
            @keyframes slideUp{from{transform:translateY(30px) scale(.96);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}
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
      <style>{FONT_CSS+KIOSK_CSS+BRAND_OVERRIDE_CSS}</style>

      {/* ══ LEFT: Menu 60% ══ */}
      <div style={K.splitLeft}>
        {/* Header — brand language consistent with welcome */}
        <div style={K.header}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <img src="/logo.png" alt="" className="boot-logo" style={{height:32,width:32,objectFit:"contain",animation:"none",filter:"drop-shadow(0 0 8px rgba(255,255,255,0.4)) drop-shadow(0 0 18px var(--brand-primary,#FF6B35))"}}/>
            <div>
              <div style={K.headerBrand}>
                {isCustomBrand ? tenantBrand.name : (<>karya<span style={{fontWeight:300,opacity:.55}}>os</span></>)}
              </div>
              <div style={K.headerSub}>{orderType==="dine"?"🪑 Dine In":"🛍️ Takeaway"}</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={K.headerTime}>{time.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}</div>
            <button style={K.resetBtn} onClick={()=>{clearCart();setOrderType(null);}}>✕ Reset</button>
          </div>
        </div>

        {/* Editorial rows — per category horizontal scroll, Netflix-style */}
        <div style={K.splitMenuScroll}>
          {/* ── FEATURED HERO ── tag BEST/PROMO/SIGNATURE or fallback to first ── */}
          {(() => {
            const hero =
              menuWithStock.find(m => ["PROMO","BEST","SIGNATURE","FEATURED","🔥","⭐"].some(t => (m.tag||"").toUpperCase().includes(t.toUpperCase()))) ||
              menuWithStock.find(m => m.avail !== false);
            if (!hero) return null;
            const inCart = cart.filter(e=>e.item.id===hero.id).reduce((a,e)=>a+e.qty,0);
            return (
              <section style={K.heroSection}>
                <div className="lg" style={K.heroCard} onClick={()=>{audio.playTap();(hero.freeToppings>0?setToppingItem(hero):setAddonItem(hero));}}>
                  <div style={K.heroImg}>
                    <FoodImage item={hero} size={280}/>
                    <div style={K.heroImgGloss}/>
                  </div>
                  <div style={K.heroInfo}>
                    <div style={K.heroBadge}>
                      <span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",background:"var(--brand-primary,#FF6B35)",boxShadow:"0 0 8px var(--brand-primary,#FF6B35)"}}/>
                      <span>{hero.tag || "TODAY'S PICK"}</span>
                    </div>
                    <div style={K.heroName}>{hero.name}</div>
                    {hero.desc && <div style={K.heroDesc}>{hero.desc}</div>}
                    <div style={K.heroBottom}>
                      <span style={K.heroPrice}>{fIDR(hero.price)}</span>
                      <button className="lg lg-brand order-pill" style={K.heroAddBtn}
                        onClick={(e)=>{e.stopPropagation();audio.playTap();(hero.freeToppings>0?setToppingItem(hero):setAddonItem(hero));}}>
                        {inCart>0 ? `+ Add more (${inCart})` : "+ Add to order"}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            );
          })()}

          {CATEGORIES.filter(c=>c!=="All").map(c=>{
            const rowItems = menuWithStock.filter(i=>i.category===c);
            if (rowItems.length===0) return null;
            return (
              <section key={c} style={K.editorialSection}>
                <header style={K.editorialHeader}>
                  <h2 style={K.editorialTitle}>{c}</h2>
                  <span style={K.editorialSub}>{rowItems.length} {rowItems.length===1?"item":"items"}</span>
                </header>
                <div className="editorial-row-wrap" style={K.editorialRowWrap}>
                <div className="editorial-row" style={K.editorialRow}>
                  {rowItems.map((item,i)=>{
                    const inCart=cart.filter(e=>e.item.id===item.id).reduce((a,e)=>a+e.qty,0);
                    return (
                      <div key={item.id} className="menu-card lg" style={{...K.editorialCard,animationDelay:`${i*0.04}s`,opacity:item.avail===false?0.5:1,pointerEvents:item.avail===false?"none":"auto"}}>
                        {item.tag && (
                          <div style={{...K.tag,background:TAG_CLR[item.tag]?.bg,color:TAG_CLR[item.tag]?.tx}}>{item.tag}</div>
                        )}
                        {inCart>0 && <div style={K.inCartBadge}>{inCart}</div>}
                        <div style={K.editorialCardImg}>
                          <FoodImage item={item} size={200}/>
                        </div>
                        <div style={K.editorialCardInfo}>
                          <div style={K.editorialCardName}>{item.name}</div>
                          <div style={K.editorialCardBottom}>
                            <span style={K.editorialCardPrice}>{fIDR(item.price)}</span>
                            {item.avail === false ? (
                              <span style={K.soldOutBadge}>SOLD OUT</span>
                            ) : (
                              <button className="add-btn" style={K.editorialAddBtn}
                                onClick={()=>{audio.playTap();(item.freeToppings>0?setToppingItem(item):setAddonItem(item));}}
                                aria-label={inCart>0?"Add more":"Add"}>
                                {inCart>0?"+1":"+"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                </div>
              </section>
            );
          })}
          <div style={{height:24}}/>
        </div>
      </div>

      {/* ══ RIGHT: Cart 40% ══ */}
      <div style={K.splitRight}>
        {/* Cart header */}
        <div style={K.cartPanelHeader}>
          <div>
            <h2 style={K.cartPanelTitle}>Your order</h2>
            <div style={K.cartPanelSub}>{cartCount>0 ? `${cartCount} item${cartCount===1?"":"s"}` : "No items yet"}</div>
          </div>
          {cart.length>0 && (
            <button onClick={clearCart} style={K.clearAllBtn}>Clear</button>
          )}
        </div>

        {/* Cart items — scrollable */}
        <div style={K.cartPanelBody}>
          {cart.length===0 ? (
            <div style={K.emptyCartPanel}>
              <div style={{position:"relative",width:120,height:120,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <div style={{position:"absolute",inset:0,borderRadius:"50%",background:"radial-gradient(circle,color-mix(in srgb,var(--brand-primary,#FF6B35) 14%,transparent),transparent 65%)",filter:"blur(20px)"}}/>
                <div style={{fontSize:54,opacity:.5,position:"relative"}}>🛍️</div>
              </div>
              <div style={K.emptyTitle}>Your cart is empty</div>
              <div style={K.emptyHint}>Browse the menu on the left to start your order</div>
              <div style={K.emptyChip}>
                <span style={{animation:"arrowPulse 1.8s ease-in-out infinite"}}>←</span>
                <span>tap a dish to begin</span>
              </div>
            </div>
          ) : (
            cart.map((e,i) => {
              const q = e.qty;
              const lineTotal = (e.item.price + e.addonTotal) * q;
              const labels = getAddonLabels(e.addons, e.item.category);
              return (
                <div key={e.uid} className="lg" style={K.cartPanelRow}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:10,marginBottom:6}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={K.cartRowName}>
                        {e.item.emoji && <span style={{marginRight:6}}>{e.item.emoji}</span>}{e.item.name}
                      </div>
                      <div style={K.cartRowUnit}>{fIDR(e.item.price)} each</div>
                    </div>
                    <button onClick={()=>changeQty(e.uid,-q)} style={K.removeBtn} aria-label="Remove item">✕</button>
                  </div>
                  {labels.length>0 && (
                    <div style={K.cartRowAddons}>
                      + {labels.join(", ")}
                      {e.addonTotal>0 && <span> · {fIDR(e.addonTotal)}</span>}
                    </div>
                  )}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
                    <div style={K.cartQtyGroup}>
                      <button onClick={()=>changeQty(e.uid,-1)} style={K.qtyMinus} aria-label="Decrease">−</button>
                      <div style={K.cartQtyVal}>{q}</div>
                      <button onClick={()=>changeQty(e.uid,1)} style={K.qtyPlus} aria-label="Increase">+</button>
                    </div>
                    <span style={K.cartLineTotal}>{fIDR(lineTotal)}</span>
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
                <div style={K.cartFooterRow}>
                  <span>Subtotal</span>
                  <span style={{fontVariantNumeric:"tabular-nums"}}>{fIDR(subtotal)}</span>
                </div>
              )}
              {serviceCharge > 0 && (
                <div style={{...K.cartFooterRow,color:"rgba(251,191,36,0.85)"}}>
                  <span>{serviceConfig.label} · {serviceConfig.pct}%</span>
                  <span style={{fontVariantNumeric:"tabular-nums"}}>+{fIDR(serviceCharge)}</span>
                </div>
              )}
              {serviceCharge > 0 && <div style={K.cartFooterDivider}/>}
              <div style={K.cartFooterTotal}>
                <span style={K.cartFooterTotalLabel}>Total</span>
                <span style={K.cartFooterTotalVal}>{fIDR(total)}</span>
              </div>
              <button onClick={goToConfirm} className="lg lg-brand order-pill"
                style={K.cartCheckoutBtn}>
                Checkout →
              </button>
            </>
          ) : (
            <button disabled style={K.cartCheckoutDisabled}>
              Select a dish to continue
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

      {/* Staff call button — floating pill, brand-themed */}
      {tableInfo && (
        <button className="lg" style={K.staffCallBtn} onClick={()=>{setStaffCall(true);setCallSent(false);setCallReason("");}}>
          🔔 <span style={{marginLeft:6}}>Call staff</span>
        </button>
      )}

      {/* Staff call modal */}
      {showStaffCall && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(20px) saturate(180%)",WebkitBackdropFilter:"blur(20px) saturate(180%)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
          <div className="lg" style={{borderRadius:28,padding:"32px 28px",width:"100%",maxWidth:440,textAlign:"center",animation:"slideUp 0.35s cubic-bezier(.2,.8,.2,1)"}}>
            {callSent ? (
              <>
                <div style={{fontSize:56,marginBottom:14,filter:"drop-shadow(0 8px 20px rgba(52,211,153,0.35))"}}>✅</div>
                <div style={{fontFamily:"'Inter',sans-serif",fontSize:22,fontWeight:600,letterSpacing:"-0.5px",color:"rgba(255,255,255,0.95)",marginBottom:8}}>Staff is on the way</div>
                <div style={{fontSize:13,color:"rgba(255,255,255,0.55)",marginBottom:22,fontFamily:"'Inter',sans-serif"}}>Please wait a moment.</div>
                <button style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:14,padding:"12px 28px",color:"rgba(255,255,255,0.7)",fontSize:13,fontWeight:500,fontFamily:"'Inter',sans-serif",cursor:"pointer"}} onClick={()=>setStaffCall(false)}>Close</button>
              </>
            ) : (
              <>
                <div style={{fontSize:44,marginBottom:10,filter:"drop-shadow(0 6px 16px color-mix(in srgb,var(--brand-primary,#FF6B35) 35%,transparent))"}}>🔔</div>
                <div style={{fontFamily:"'Inter',sans-serif",fontSize:22,fontWeight:600,letterSpacing:"-0.5px",color:"rgba(255,255,255,0.95)",marginBottom:4}}>Call staff</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.45)",marginBottom:22,fontFamily:"'Inter',sans-serif",letterSpacing:0.2}}>Table {tableInfo?.name||"-"}</div>
                <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:18,textAlign:"left"}}>
                  {[{en:"Need assistance",id:"Butuh bantuan"},{en:"Clean table",id:"Meja kotor"},{en:"Utensils",id:"Peralatan makan"},{en:"Order issue",id:"Keluhan pesanan"},{en:"Other",id:"Lainnya"}].map(r=>(
                    <button key={r.id} style={{
                      background:callReason===r.id?"color-mix(in srgb,var(--brand-primary,#FF6B35) 12%,rgba(255,255,255,0.02))":"rgba(255,255,255,0.025)",
                      border:`1px solid ${callReason===r.id?"color-mix(in srgb,var(--brand-primary,#FF6B35) 45%,transparent)":"rgba(255,255,255,0.06)"}`,
                      borderRadius:12,padding:"12px 14px",
                      color:callReason===r.id?"#fff":"rgba(255,255,255,0.72)",
                      fontSize:13,fontWeight:500,textAlign:"left",cursor:"pointer",fontFamily:"'Inter',sans-serif",letterSpacing:"-0.1px",transition:"all 0.18s ease",
                    }} onClick={()=>setCallReason(r.id)}>{r.en}</button>
                  ))}
                </div>
                <div style={{display:"flex",gap:10}}>
                  <button style={{flex:1,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:14,padding:"13px",color:"rgba(255,255,255,0.7)",fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"'Inter',sans-serif"}} onClick={()=>setStaffCall(false)}>Cancel</button>
                  <button className="lg lg-brand order-pill" style={{flex:2,border:"none",borderRadius:14,padding:"13px",color:"#fff",fontWeight:600,fontSize:14,fontFamily:"'Inter',sans-serif",letterSpacing:"-0.2px",opacity:!callReason?0.4:1,cursor:"pointer"}}
                    disabled={!callReason}
                    onClick={async()=>{await api.staffCall({tableId:tableInfo?.id,reason:callReason}).catch(()=>{});setCallSent(true);}}>
                    Send call 🔔
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
  @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
  @keyframes breathe{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:.85;transform:scale(1.04)}}
  @keyframes aurora{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(3%,-2%) scale(1.06)}66%{transform:translate(-2%,3%) scale(0.96)}}
  .logo-float{animation:float 6s ease-in-out infinite}
  .logo-halo{position:absolute;inset:-80px;border-radius:50%;background:radial-gradient(circle,var(--brand-primary,#FF6B35) 0%,transparent 60%);opacity:.30;filter:blur(48px);animation:breathe 5s ease-in-out infinite;pointer-events:none}
  .wordmark-glow{position:absolute;inset:-60px -40px;background:radial-gradient(ellipse 80% 60% at 50% 50%,var(--brand-primary,#FF6B35) 0%,transparent 65%);opacity:.32;filter:blur(70px);animation:breathe 6s ease-in-out infinite;pointer-events:none;z-index:0}
  /* ─── BACKLIT BOOT LOGO (MacBook lid / iPhone splash style) ───────── */
  /* Tight white core (sharp) + warm brand tint at outer corona — calm 5s breathing */
  @keyframes bootGlow{
    0%,100%{filter:brightness(0.94) drop-shadow(0 0 6px rgba(255,255,255,0.45)) drop-shadow(0 0 18px rgba(255,255,255,0.22)) drop-shadow(0 0 48px var(--brand-primary,#FF6B35))}
    50%{filter:brightness(1.02) drop-shadow(0 0 9px rgba(255,255,255,0.6)) drop-shadow(0 0 26px rgba(255,255,255,0.32)) drop-shadow(0 0 70px var(--brand-primary,#FF6B35))}
  }
  @keyframes bootFadeIn{0%{opacity:0;filter:brightness(0)}55%{opacity:.85}100%{opacity:1}}
  .boot-logo{animation:bootFadeIn 1.8s cubic-bezier(.4,0,.2,1) forwards,bootGlow 5.5s ease-in-out 1.8s infinite;will-change:filter,opacity}
  /* Match AdminHome background — deep navy charcoal, not pure black */
  .boot-stage{background:radial-gradient(ellipse 70% 55% at 50% 38%,rgba(40,44,58,0.5) 0%,transparent 70%),linear-gradient(160deg,#08090f 0%,#11131c 50%,#1a1d29 100%)!important;background-attachment:fixed!important}
  .boot-stage > div{padding-top:6vh!important}
  .aurora-blob{position:absolute;border-radius:50%;filter:blur(100px);pointer-events:none;will-change:transform}
  .aurora-1{top:-15%;left:-15%;width:65%;height:65%;background:radial-gradient(circle,var(--brand-primary,#FF6B35) 0%,transparent 70%);opacity:.22;animation:aurora 22s ease-in-out infinite}
  .aurora-2{bottom:-20%;right:-15%;width:70%;height:70%;background:radial-gradient(circle,var(--brand-secondary,#E55A2B) 0%,transparent 70%);opacity:.18;animation:aurora 28s ease-in-out infinite reverse}
  .aurora-3{top:35%;left:25%;width:45%;height:45%;background:radial-gradient(circle,#a78bfa 0%,transparent 70%);opacity:.10;animation:aurora 32s ease-in-out infinite}
  /* ─── LIQUID GLASS SYSTEM (iOS 26 style) ────────────────────────── */
  .lg{position:relative;background:linear-gradient(180deg,rgba(255,255,255,0.07) 0%,rgba(255,255,255,0.025) 60%,rgba(255,255,255,0.01) 100%);backdrop-filter:blur(40px) saturate(200%) brightness(1.08);-webkit-backdrop-filter:blur(40px) saturate(200%) brightness(1.08);box-shadow:inset 0 1px 0 rgba(255,255,255,0.25),inset 0 -1px 0 rgba(0,0,0,0.18),inset 0 12px 24px rgba(255,255,255,0.04),inset 0 -16px 24px rgba(0,0,0,0.15),0 10px 24px rgba(0,0,0,0.28),0 30px 70px rgba(0,0,0,0.32);overflow:hidden;isolation:isolate}
  /* Gradient border via masked layer */
  .lg::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;background:linear-gradient(180deg,rgba(255,255,255,0.55) 0%,rgba(255,255,255,0.08) 35%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.12) 100%);-webkit-mask:linear-gradient(#000,#000) content-box,linear-gradient(#000,#000);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;z-index:2}
  /* Specular sheen — top half gloss */
  .lg::after{content:"";position:absolute;top:0;left:0;right:0;height:55%;border-radius:inherit;background:radial-gradient(ellipse 75% 90% at 30% 0%,rgba(255,255,255,0.18) 0%,rgba(255,255,255,0.04) 45%,transparent 80%);pointer-events:none;z-index:1;mix-blend-mode:screen;opacity:.85}
  /* Variant: orb (circular) — tighter sheen */
  .lg-orb::after{height:60%;background:radial-gradient(ellipse 70% 60% at 30% 18%,rgba(255,255,255,0.32) 0%,rgba(255,255,255,0.06) 50%,transparent 80%)}
  /* Variant: brand-tinted pill (CTA) */
  .lg-brand{background:linear-gradient(180deg,var(--brand-primary,#FF6B35) 0%,var(--brand-secondary,#E55A2B) 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,0.35),inset 0 -1px 0 rgba(0,0,0,0.22),inset 0 12px 28px rgba(255,255,255,0.12),inset 0 -16px 28px rgba(0,0,0,0.18),0 10px 28px rgba(0,0,0,0.28),0 24px 60px color-mix(in srgb,var(--brand-primary,#FF6B35) 28%,transparent)}
  .lg-brand::before{background:linear-gradient(180deg,rgba(255,255,255,0.65) 0%,rgba(255,255,255,0.18) 35%,rgba(0,0,0,0.06) 60%,rgba(255,255,255,0.18) 100%)}
  /* Content must sit above sheen/border layers */
  .lg > *{position:relative;z-index:3}
  .order-pill{transition:transform .4s cubic-bezier(.2,.8,.2,1),box-shadow .4s ease}
  .order-pill:hover{transform:translateY(-4px) scale(1.015)}
  .order-pill:hover.lg{box-shadow:inset 0 1px 0 rgba(255,255,255,0.32),inset 0 -1px 0 rgba(0,0,0,0.18),inset 0 12px 24px rgba(255,255,255,0.06),inset 0 -16px 24px rgba(0,0,0,0.15),0 14px 34px rgba(0,0,0,0.34),0 40px 90px rgba(0,0,0,0.4)}
  .order-pill:hover.lg-brand{box-shadow:inset 0 1px 0 rgba(255,255,255,0.4),inset 0 -1px 0 rgba(0,0,0,0.22),inset 0 12px 28px rgba(255,255,255,0.18),inset 0 -16px 28px rgba(0,0,0,0.2),0 14px 34px rgba(0,0,0,0.32),0 32px 72px color-mix(in srgb,var(--brand-primary,#FF6B35) 38%,transparent)}
  .order-pill:active{transform:translateY(-1px) scale(0.99)}
  /* Editorial row edge-fade — hint horizontal scroll affordance */
  .editorial-row-wrap{position:relative}
  .editorial-row-wrap::before,.editorial-row-wrap::after{content:"";position:absolute;top:0;bottom:0;width:36px;pointer-events:none;z-index:4}
  .editorial-row-wrap::before{left:0;background:linear-gradient(90deg,#11131c 0%,rgba(17,19,28,0.6) 50%,transparent 100%)}
  .editorial-row-wrap::after{right:0;background:linear-gradient(270deg,#11131c 0%,rgba(17,19,28,0.6) 50%,transparent 100%)}
  /* Hide scrollbar in editorial rows (touch-scroll only) */
  .editorial-row::-webkit-scrollbar{display:none}
  .editorial-row{-ms-overflow-style:none;scrollbar-width:none}
  /* Hero card hover lift */
  .lg:hover{transition:transform .35s cubic-bezier(.2,.8,.2,1)}
  /* Hero specific brand glow tint */
  section[data-hero]>.lg{box-shadow:inset 0 1px 0 rgba(255,255,255,0.18),inset 0 -1px 0 rgba(0,0,0,0.22),inset 0 12px 28px rgba(255,255,255,0.05),inset 0 -16px 28px rgba(0,0,0,0.18),0 18px 40px rgba(0,0,0,0.35),0 30px 80px color-mix(in srgb,var(--brand-primary,#FF6B35) 18%,transparent)}
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
const PREMIUM_BG = "linear-gradient(160deg,#08090f 0%,#11131c 50%,#1a1d29 100%)";
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
  splitRoot:{height:"100vh",background:PREMIUM_BG,backgroundAttachment:"fixed",color:"#fff",display:"flex",overflow:"hidden",fontFamily:"'Inter',sans-serif"},
  splitLeft:{flex:"0 0 60%",display:"flex",flexDirection:"column",borderRight:BORDER_DEFAULT,overflow:"hidden"},
  splitRight:{flex:"0 0 40%",display:"flex",flexDirection:"column",background:"linear-gradient(180deg,rgba(13,17,23,0.6),rgba(8,9,10,0.85))",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",borderLeft:BORDER_DEFAULT},
  splitMenuScroll:{flex:1,overflowY:"auto",padding:"6px 0 0"},

  // ── FEATURED HERO ──
  heroSection:      {padding:"14px 18px 4px"},
  heroCard:         {display:"flex",borderRadius:24,overflow:"hidden",cursor:"pointer",minHeight:220},
  heroImg:          {flex:"0 0 48%",position:"relative",display:"flex",alignItems:"center",justifyContent:"center",background:"radial-gradient(ellipse 80% 60% at 40% 35%,color-mix(in srgb,var(--brand-primary,#FF6B35) 18%,transparent),transparent 70%)",overflow:"hidden"},
  heroImgGloss:     {position:"absolute",inset:0,background:"linear-gradient(135deg,rgba(255,255,255,0.06) 0%,transparent 50%)",pointerEvents:"none"},
  heroInfo:         {flex:1,padding:"22px 24px",display:"flex",flexDirection:"column",justifyContent:"space-between",gap:14},
  heroBadge:        {display:"inline-flex",alignItems:"center",gap:7,fontSize:10,letterSpacing:2.5,fontWeight:600,color:"rgba(255,255,255,0.65)",fontFamily:"'Inter',sans-serif",textTransform:"uppercase",alignSelf:"flex-start"},
  heroName:         {fontFamily:"'Inter',sans-serif",fontSize:28,fontWeight:600,letterSpacing:"-0.9px",color:"#fff",lineHeight:1.15,marginTop:4},
  heroDesc:         {fontSize:13,color:"rgba(255,255,255,0.55)",lineHeight:1.5,fontWeight:400,marginTop:-8},
  heroBottom:       {display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginTop:8},
  heroPrice:        {fontFamily:"'Inter',sans-serif",fontSize:24,fontWeight:600,color:"#fff",letterSpacing:"-0.5px",fontVariantNumeric:"tabular-nums"},
  heroAddBtn:       {padding:"12px 20px",borderRadius:14,border:"none",fontFamily:"'Inter',sans-serif",fontSize:14,fontWeight:600,letterSpacing:"-0.2px",color:"#fff",cursor:"pointer"},

  // ── EDITORIAL ROWS (Netflix-style horizontal scroll per category) ──
  editorialRowWrap: {position:"relative"},
  editorialSection: {marginBottom:18},
  editorialHeader:  {padding:"14px 18px 10px",display:"flex",justifyContent:"space-between",alignItems:"baseline"},
  editorialTitle:   {fontFamily:"'Inter',sans-serif",fontSize:21,fontWeight:600,letterSpacing:"-0.5px",color:"rgba(255,255,255,0.95)",margin:0,lineHeight:1.1},
  editorialSub:     {fontSize:11,color:"rgba(255,255,255,0.35)",fontWeight:400,letterSpacing:0.3,fontFamily:"'Inter',sans-serif"},
  editorialRow:     {display:"flex",gap:14,overflowX:"auto",padding:"6px 18px 14px",scrollSnapType:"x mandatory",scrollPaddingLeft:18,WebkitOverflowScrolling:"touch"},
  editorialCard:    {flex:"0 0 220px",scrollSnapAlign:"start",borderRadius:22,display:"flex",flexDirection:"column",position:"relative",cursor:"pointer"},
  editorialCardImg: {height:170,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden",borderTopLeftRadius:22,borderTopRightRadius:22,background:"radial-gradient(ellipse 80% 60% at 50% 30%,rgba(255,255,255,0.04),transparent 70%)"},
  editorialCardInfo:{padding:"12px 14px 14px",display:"flex",flexDirection:"column",gap:8},
  editorialCardName:{fontFamily:"'Inter',sans-serif",fontSize:15,fontWeight:600,letterSpacing:"-0.3px",color:"rgba(255,255,255,0.95)",lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",minHeight:36},
  editorialCardBottom:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10},
  editorialCardPrice:{fontFamily:"'Inter',sans-serif",fontSize:15,fontWeight:600,color:"#fff",letterSpacing:"-0.2px",fontVariantNumeric:"tabular-nums"},
  editorialAddBtn:  {width:34,height:34,minWidth:34,borderRadius:"50%",border:"none",background:"linear-gradient(180deg,var(--brand-primary,#FF6B35) 0%,var(--brand-secondary,#E55A2B) 100%)",color:"#fff",fontSize:18,fontWeight:700,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.3),0 4px 14px color-mix(in srgb,var(--brand-primary,#FF6B35) 35%,transparent)",fontFamily:"'Inter',sans-serif"},

  // ── CART PANEL ──
  cartPanelHeader:{padding:"20px 22px 16px",borderBottom:BORDER_DEFAULT,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:12},
  cartPanelTitle:{fontFamily:"'Inter',sans-serif",fontSize:22,fontWeight:600,color:"rgba(255,255,255,0.95)",letterSpacing:"-0.6px",lineHeight:1,margin:0},
  cartPanelSub:  {fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:5,fontWeight:400,letterSpacing:0.2,fontFamily:"'Inter',sans-serif"},
  cartPanelBody:{flex:1,overflowY:"auto",padding:"0 14px"},
  // bg/border/shadow handled by .lg class on element
  cartPanelRow:{borderRadius:16,padding:"13px",marginTop:8,transition:"all 0.2s cubic-bezier(0.4,0,0.2,1)"},
  cartPanelFooter:{padding:"18px 22px",borderTop:BORDER_DEFAULT,flexShrink:0,background:"linear-gradient(180deg,transparent,rgba(13,17,23,0.6))"},
  emptyCartPanel:{height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 28px 40px",gap:14,userSelect:"none"},
  emptyTitle:    {fontSize:16,fontWeight:600,color:"rgba(255,255,255,0.78)",letterSpacing:"-0.3px",fontFamily:"'Inter',sans-serif"},
  emptyHint:     {fontSize:12,color:"rgba(255,255,255,0.38)",textAlign:"center",lineHeight:1.55,fontFamily:"'Inter',sans-serif",marginTop:-6,maxWidth:200},
  emptyChip:     {marginTop:6,padding:"8px 16px",borderRadius:999,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.025)",fontSize:11,color:"rgba(255,255,255,0.45)",display:"flex",alignItems:"center",gap:7,fontFamily:"'Inter',sans-serif",letterSpacing:0.2},
  removeBtn:{background:"transparent",border:"none",color:"rgba(248,113,113,0.7)",fontSize:14,cursor:"pointer",padding:"4px 6px",flexShrink:0,transition:"all 0.2s ease",borderRadius:8},
  // cart row fine-grain
  cartRowName:   {fontFamily:"'Inter',sans-serif",fontSize:14,fontWeight:600,letterSpacing:"-0.2px",color:"rgba(255,255,255,0.95)",lineHeight:1.3},
  cartRowUnit:   {fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:3,fontVariantNumeric:"tabular-nums",fontFamily:"'Inter',sans-serif"},
  cartRowAddons: {fontSize:11,color:"color-mix(in srgb,var(--brand-primary,#FF6B35) 88%,#fff)",marginBottom:4,lineHeight:1.5,fontVariantNumeric:"tabular-nums"},
  cartQtyGroup:  {display:"flex",alignItems:"center",gap:6},
  cartQtyVal:    {width:28,textAlign:"center",fontSize:13,fontWeight:600,fontVariantNumeric:"tabular-nums"},
  cartLineTotal: {fontFamily:"'Inter',sans-serif",fontSize:14,fontWeight:600,color:"#fff",fontVariantNumeric:"tabular-nums",letterSpacing:"-0.2px"},
  // cart footer rows
  cartFooterRow: {display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,fontSize:12,color:"rgba(255,255,255,0.55)",fontFamily:"'Inter',sans-serif"},
  cartFooterDivider:{height:1,background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)",margin:"8px 0"},
  cartFooterTotal:{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:16},
  cartFooterTotalLabel:{fontFamily:"'Inter',sans-serif",fontSize:13,letterSpacing:0.4,color:"rgba(255,255,255,0.55)",fontWeight:400,textTransform:"uppercase"},
  cartFooterTotalVal:{fontFamily:"'Inter',sans-serif",fontSize:28,color:"#fff",fontWeight:600,letterSpacing:"-0.7px",fontVariantNumeric:"tabular-nums"},
  cartCheckoutBtn:{width:"100%",padding:"16px",borderRadius:16,border:"none",color:"#fff",fontFamily:"'Inter',sans-serif",fontSize:16,fontWeight:600,letterSpacing:"-0.3px",cursor:"pointer"},
  cartCheckoutDisabled:{width:"100%",padding:"15px",borderRadius:16,background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.06)",color:"rgba(255,255,255,0.3)",fontFamily:"'Inter',sans-serif",fontSize:14,fontWeight:500,letterSpacing:0.1,cursor:"not-allowed"},

  // ── IDLE ──
  idleOverlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif"},
  idleBox:    {textAlign:"center",padding:"44px 36px",background:GLASS_BG,backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderRadius:28,border:BORDER_FOCUS,maxWidth:380,boxShadow:"0 1px 2px rgba(0,0,0,0.4),0 24px 80px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.06)"},
  idleTitle:  {fontFamily:"'Inter',sans-serif",fontSize:32,fontWeight:750,letterSpacing:"-0.5px",color:"#FF6B35",marginBottom:8},
  idleSub:    {fontSize:13,color:"rgba(255,255,255,0.5)",marginBottom:12,fontFamily:"'Geist Mono',monospace",letterSpacing:1.5,textTransform:"uppercase"},
  idleCount:  {fontFamily:"'Inter',sans-serif",fontSize:72,fontWeight:750,letterSpacing:"-2px",color:"#fff",lineHeight:1,marginBottom:12},
  idleBar:    {height:6,background:"rgba(255,255,255,0.06)",borderRadius:3,marginBottom:24,overflow:"hidden"},
  idleFill:   {height:"100%",background:"linear-gradient(90deg,#FF6B35,#E55A2B)",borderRadius:3,transition:"width 1s linear",boxShadow:"0 0 12px rgba(255,107,53,0.5)"},
  idleBtn:    {width:"100%",background:"linear-gradient(135deg,#FF6B35,#F59E0B)",border:"none",borderRadius:14,padding:"16px",color:"#fff",fontSize:13,fontWeight:700,letterSpacing:1.5,fontFamily:"'Inter',sans-serif",marginBottom:10,boxShadow:SHADOW_CTA,transition:"all 0.2s cubic-bezier(0.4,0,0.2,1)"},
  idleCancel: {background:"transparent",border:BORDER_DEFAULT,borderRadius:10,padding:"10px 20px",color:"rgba(255,255,255,0.45)",fontSize:12,transition:"all 0.2s ease"},

  // ── WELCOME (Apple-feel: full-bleed, no container box, organic) ──
  welcome:    {fontFamily:"'Inter',sans-serif",background:"radial-gradient(ellipse 90% 70% at 50% 30%,#1c1f2c 0%,#0d0e15 55%,#06070b 100%)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"},
  welcomeInner:{textAlign:"center",padding:"40px 24px",maxWidth:560,width:"100%",position:"relative",zIndex:1},
  logoWrap:   {marginBottom:32},
  logoIcon:   {fontSize:72,lineHeight:1,marginBottom:10,display:"block"},
  brand:      {fontFamily:"'Inter',sans-serif",fontSize:"min(32px,5vw)",fontWeight:500,letterSpacing:"-0.8px",color:"rgba(255,255,255,0.88)",lineHeight:1,userSelect:"none"},
  tagline:    {fontSize:12,color:"rgba(255,255,255,0.38)",marginTop:10,letterSpacing:0.3,fontFamily:"'Inter',sans-serif",fontWeight:400},
  clockDisp:  {fontSize:11,color:"rgba(255,255,255,0.24)",marginBottom:48,marginTop:24,letterSpacing:8,fontFamily:"'Inter',sans-serif",fontVariantNumeric:"tabular-nums",fontWeight:400},
  welcomeQ:   {fontSize:15,letterSpacing:"-0.2px",color:"rgba(255,255,255,0.78)",marginBottom:28,fontFamily:"'Inter',sans-serif",fontWeight:500},
  orderRow:   {display:"flex",gap:18,justifyContent:"center",marginBottom:36},
  // background/shadow/border handled by .lg / .lg-brand classes — keep here only layout
  orderBtn:   {border:"none",borderRadius:32,padding:"38px 32px",display:"flex",flexDirection:"column",alignItems:"center",gap:10,flex:1,maxWidth:240,color:"#fff",cursor:"pointer"},
  orderBtnAlt:{},
  orderBtnIcon:{fontSize:46,filter:"drop-shadow(0 4px 12px rgba(0,0,0,0.25))"},
  orderBtnLabel:{fontFamily:"'Inter',sans-serif",fontSize:21,fontWeight:600,letterSpacing:"-0.4px"},
  orderBtnSub:{fontSize:12,color:"rgba(255,255,255,0.6)",fontFamily:"'Inter',sans-serif",letterSpacing:0.1,marginTop:2,fontWeight:400},
  tapHint:    {fontSize:11,letterSpacing:3,color:"rgba(255,255,255,0.22)",fontFamily:"'Inter',sans-serif",textTransform:"uppercase",fontWeight:500},

  // ── HEADER ──
  header:     {display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",background:"rgba(13,17,23,0.6)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",borderBottom:BORDER_DEFAULT,flexShrink:0},
  headerBrand:{fontFamily:"'Inter',sans-serif",fontSize:18,fontWeight:600,letterSpacing:"-0.4px",color:"rgba(255,255,255,0.92)"},
  headerSub:  {fontSize:11,color:"rgba(255,255,255,0.42)",fontFamily:"'Inter',sans-serif",letterSpacing:0.2,marginTop:1,fontWeight:400},
  headerTime: {fontSize:13,color:"rgba(255,255,255,0.35)",fontVariantNumeric:"tabular-nums",fontFamily:"'Geist Mono',monospace"},
  resetBtn:   {background:"transparent",border:BORDER_DEFAULT,borderRadius:8,padding:"6px 12px",color:"rgba(255,255,255,0.5)",fontSize:11,cursor:"pointer",transition:"all 0.2s ease",fontFamily:"'Geist Mono',monospace",letterSpacing:0.5},

  // ── CATEGORY ──
  catBar:     {display:"flex",gap:6,padding:"12px",overflowX:"auto",background:"rgba(13,17,23,0.4)",borderBottom:BORDER_DEFAULT,flexShrink:0},
  catBtn:     {background:"transparent",border:BORDER_DEFAULT,borderRadius:30,padding:"8px 16px",color:"rgba(255,255,255,0.55)",fontSize:13,whiteSpace:"nowrap",minHeight:40,flexShrink:0,fontWeight:500,letterSpacing:"-0.2px"},
  catActive:  {background:"rgba(255,107,53,0.15)",border:"1px solid rgba(255,107,53,0.4)",color:"#FF6B35",fontWeight:700,boxShadow:"inset 0 1px 0 rgba(255,255,255,0.08),0 0 16px rgba(255,107,53,0.15)"},

  // ── MENU GRID ──
  grid:       {display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12},
  // bg/border/shadow handled by .lg class on element; keep layout only
  card:       {borderRadius:22,display:"flex",flexDirection:"column",position:"relative"},
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
  addBtn:     {background:"linear-gradient(135deg,#FF6B35,#E55A2B)",border:"1px solid rgba(255,107,53,0.5)",borderRadius:16,padding:"9px 14px",color:"#000",fontSize:12,fontWeight:700,letterSpacing:0.5,boxShadow:"0 1px 2px rgba(0,0,0,0.3),0 4px 12px rgba(255,107,53,0.25),inset 0 1px 0 rgba(255,255,255,0.15)"},
  soldOutBadge:{background:"rgba(248,113,113,0.15)",color:"#F87171",border:"1px solid rgba(248,113,113,0.3)",borderRadius:20,padding:"6px 10px",fontSize:10,fontWeight:700,letterSpacing:1,fontFamily:"'Geist Mono',monospace",textTransform:"uppercase"},
  clearAllBtn:{background:"rgba(248,113,113,0.08)",border:"1px solid rgba(248,113,113,0.18)",borderRadius:999,padding:"5px 12px",color:"rgba(248,113,113,0.85)",fontSize:11,fontWeight:500,cursor:"pointer",transition:"all 0.2s ease",fontFamily:"'Inter',sans-serif",letterSpacing:0.2},

  // ── CART QTY ──
  qtyMinus:   {background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"50%",width:28,height:28,color:"rgba(255,255,255,0.7)",fontSize:14,fontWeight:500,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s ease",cursor:"pointer"},
  qtyPlus:    {background:"linear-gradient(180deg,var(--brand-primary,#FF6B35),var(--brand-secondary,#E55A2B))",border:"1px solid rgba(255,255,255,0.18)",borderRadius:"50%",width:28,height:28,color:"#fff",fontSize:14,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.22),0 4px 12px color-mix(in srgb,var(--brand-primary,#FF6B35) 32%,transparent)",transition:"all 0.2s ease",cursor:"pointer"},
  qtyVal:     {fontSize:14,fontWeight:600,minWidth:24,textAlign:"center",fontFamily:"'Inter',sans-serif",fontVariantNumeric:"tabular-nums",color:"rgba(255,255,255,0.92)"},

  // ── STAFF CALL ──
  // .lg class handles glass treatment; this just adds position + brand tint
  staffCallBtn:{position:"fixed",bottom:24,right:24,borderRadius:999,padding:"11px 18px",color:"rgba(255,255,255,0.92)",fontSize:13,fontWeight:600,zIndex:50,display:"flex",alignItems:"center",cursor:"pointer",fontFamily:"'Inter',sans-serif",letterSpacing:"-0.2px"},

  // ── CONFIRM SCREEN ──
  confirmHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 24px",background:"rgba(13,17,23,0.7)",backdropFilter:"blur(20px) saturate(180%)",WebkitBackdropFilter:"blur(20px) saturate(180%)",borderBottom:BORDER_DEFAULT,position:"sticky",top:0,zIndex:10,gap:12},
  backBtn:    {background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:999,padding:"7px 14px",color:"rgba(255,255,255,0.65)",fontSize:12,fontWeight:500,fontFamily:"'Inter',sans-serif",letterSpacing:"-0.1px",cursor:"pointer",transition:"all 0.2s ease"},
  confirmTitle:{fontFamily:"'Inter',sans-serif",fontSize:18,fontWeight:600,letterSpacing:"-0.5px",color:"rgba(255,255,255,0.95)",margin:0,lineHeight:1},
  typePill:   {background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:999,padding:"6px 14px",fontSize:12,color:"rgba(255,255,255,0.75)",fontFamily:"'Inter',sans-serif",fontWeight:500,letterSpacing:"-0.1px"},
  confirmBody:{flex:1,overflowY:"auto",padding:"24px 24px 28px",display:"flex",flexDirection:"column",gap:0,color:"#fff"},
  confirmItems:{display:"flex",flexDirection:"column",gap:10,marginBottom:18},
  // bg/shadow handled by .lg class
  confirmItem:{display:"flex",alignItems:"flex-start",gap:14,borderRadius:18,padding:"14px",color:"#fff"},
  confirmItemInfo:{flex:1,color:"#fff",minWidth:0},
  confirmItemName:{fontSize:15,fontWeight:600,marginBottom:3,letterSpacing:"-0.3px",color:"rgba(255,255,255,0.95)",fontFamily:"'Inter',sans-serif"},
  confirmItemAddon:{fontSize:11,color:"color-mix(in srgb,var(--brand-primary,#FF6B35) 85%,#fff)",marginBottom:3,fontFamily:"'Inter',sans-serif"},
  confirmItemNote:{fontSize:11,color:"rgba(255,255,255,0.45)",marginBottom:6,fontStyle:"italic",fontFamily:"'Inter',sans-serif"},
  confirmItemPrice:{fontSize:15,fontWeight:600,color:"#fff",fontFamily:"'Inter',sans-serif",letterSpacing:"-0.3px",whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"},
  // Promo card (full-width)
  promoCard:  {display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",borderRadius:16,padding:"14px 16px",color:"#fff",marginBottom:14,cursor:"pointer",border:"none",gap:12,fontFamily:"'Inter',sans-serif"},
  promoIcon:  {fontSize:22,filter:"drop-shadow(0 2px 8px rgba(0,0,0,0.3))",flexShrink:0},
  promoTitle: {fontSize:14,fontWeight:600,color:"rgba(255,255,255,0.9)",letterSpacing:"-0.2px"},
  promoDesc:  {fontSize:11,color:"rgba(255,255,255,0.45)",marginTop:2,fontFamily:"'Inter',sans-serif"},
  promoCodeApplied:{fontSize:13,fontWeight:600,color:"#34D399",letterSpacing:"-0.2px"},
  promoFreeItems:{fontSize:11,color:"#34D399",marginTop:3,fontWeight:500,fontFamily:"'Inter',sans-serif"},
  promoDiscount:{fontFamily:"'Inter',sans-serif",fontSize:15,fontWeight:600,color:"#34D399",fontVariantNumeric:"tabular-nums"},
  promoRemoveBtn:{background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.2)",color:"rgba(248,113,113,0.85)",fontSize:11,padding:"4px 8px",borderRadius:8,cursor:"pointer"},
  promoArrow: {color:"rgba(255,255,255,0.3)",fontSize:16,flexShrink:0},
  // Loyalty hint chip
  pointsHint: {fontSize:12,color:"rgba(255,255,255,0.55)",margin:"-2px 0 16px",display:"flex",alignItems:"flex-start",gap:9,background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"10px 13px",lineHeight:1.5,fontFamily:"'Inter',sans-serif"},
  // Bill box — .lg class on element
  billBox:    {borderRadius:18,padding:"18px 20px",marginBottom:18},
  billRow:    {display:"flex",justifyContent:"space-between",padding:"6px 0",fontSize:13,color:"rgba(255,255,255,0.6)",fontFamily:"'Inter',sans-serif"},
  billLabel:  {color:"rgba(255,255,255,0.55)"},
  billVal:    {fontVariantNumeric:"tabular-nums",color:"rgba(255,255,255,0.85)"},
  billFreeLine:{fontSize:11,color:"rgba(110,231,183,0.75)",marginTop:-4,marginBottom:6,paddingLeft:0,fontStyle:"italic",fontFamily:"'Inter',sans-serif"},
  billDivider:{height:1,background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent)",margin:"10px 0 8px"},
  billTotal:  {display:"flex",justifyContent:"space-between",alignItems:"baseline",fontFamily:"'Inter',sans-serif",paddingTop:2},
  billTotalLabel:{fontSize:13,letterSpacing:0.4,color:"rgba(255,255,255,0.55)",fontWeight:400,textTransform:"uppercase"},
  billTotalVal:{fontSize:30,fontWeight:600,color:"#fff",letterSpacing:"-0.8px",fontVariantNumeric:"tabular-nums"},
  confirmFooter:{padding:"16px 20px 20px",background:"rgba(13,17,23,0.75)",backdropFilter:"blur(20px) saturate(180%)",WebkitBackdropFilter:"blur(20px) saturate(180%)",borderTop:BORDER_DEFAULT,display:"flex",gap:10},
  editOrderBtn:{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:"15px 18px",color:"rgba(255,255,255,0.7)",fontSize:13,fontWeight:500,flex:1,transition:"all 0.2s ease",cursor:"pointer",fontFamily:"'Inter',sans-serif",letterSpacing:"-0.1px"},
  payBtn:     {flex:2,padding:"15px 22px",borderRadius:16,border:"none",color:"#fff",fontSize:15,fontWeight:600,letterSpacing:"-0.3px",fontFamily:"'Inter',sans-serif",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12},
  payBtnAmount:{fontSize:17,fontWeight:600,letterSpacing:"-0.4px",fontVariantNumeric:"tabular-nums"},
  proceedBtn: {width:"100%",marginTop:14,background:"linear-gradient(135deg,#FF6B35,#F59E0B)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:16,padding:"18px",color:"#fff",fontSize:15,fontWeight:800,letterSpacing:1.5,fontFamily:"'Inter',sans-serif",boxShadow:SHADOW_CTA},
};
