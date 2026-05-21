/**
 * CommandCenter.jsx — Bites & Co. Enterprise Dashboard
 * Route: ?command=1
 * Layout: LANDSCAPE — optimized for desktop/monitor/TV
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import CommandExecutive from "./CommandExecutive.jsx";
import CommandCustomer from "./CommandCustomer.jsx";
import CommandOperation from "./CommandOperation.jsx";
import CommandHRIS from "./CommandHRIS.jsx";
import CommandPromo from "./CommandPromo.jsx";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

const RULES = {
  VOID_BOM:{l:"Void/Bom",i:"💣",cl:"#EF4444"},
  PHANTOM_CUP:{l:"Cup Tanpa Produk",i:"🥤",cl:"#F97316"},
  PROMO_ABUSE:{l:"Promo Abuse",i:"🏷️",cl:"#EAB308"},
  POIN_DRAIN:{l:"Poin Drain",i:"⭐",cl:"#8B5CF6"},
  CASH_GAP:{l:"Selisih Kas",i:"💵",cl:"#DC2626"},
  DISC_NOAUTH:{l:"Diskon No-Auth",i:"✂️",cl:"#EC4899"},
  ODD_HOUR:{l:"Jam Tidak Wajar",i:"🌙",cl:"#6366F1"},
  REFUND_LOOP:{l:"Refund Loop",i:"🔄",cl:"#14B8A6"},
  CANCEL_PROD:{l:"Cancel Post-Prod",i:"🚫",cl:"#F43F5E"},
  EMP_DISC:{l:"Diskon Karyawan",i:"👤",cl:"#D946EF"},
  WASTE_SPIKE:{l:"Waste Spike",i:"🗑️",cl:"#78716C"},
  STOCK_GHOST:{l:"Stok Ghost",i:"👻",cl:"#84CC16"},
  // Refund/Cancel module (RC) anomaly types
  cancel_event:{l:"Cancel Order",i:"❌",cl:"#F87171"},
  refund_event:{l:"Refund Order",i:"↩️",cl:"#A78BFA"},
  no_manager_pin:{l:"Tanpa Manager PIN",i:"🔓",cl:"#DC2626"},
  large_amount:{l:"Refund/Cancel Besar",i:"💸",cl:"#EF4444"},
  high_rate:{l:"Frekuensi Tinggi",i:"📈",cl:"#F97316"},
  late_refund:{l:"Refund Telat",i:"⏰",cl:"#EAB308"},
  self_approval:{l:"Self-Approval",i:"🪞",cl:"#EC4899"},
  weak_reason:{l:"Alasan Lemah",i:"📝",cl:"#6366F1"},
};
const SV={critical:{l:"CRIT",bg:"#450a0a",bd:"#dc2626",tx:"#fca5a5"},high:{l:"HIGH",bg:"#451a03",bd:"#ea580c",tx:"#fdba74"},medium:{l:"MED",bg:"#422006",bd:"#ca8a04",tx:"#fde047"},low:{l:"LOW",bg:"#052e16",bd:"#16a34a",tx:"#86efac"}};

const fR=n=>(n<0?"−":"")+"Rp "+Math.abs(n).toLocaleString("id-ID");
const fK=n=>n>=1e6?(n/1e6).toFixed(1)+"jt":n>=1e3?Math.round(n/1e3)+"rb":String(n);
const clk=()=>{const d=new Date();return[d.getHours(),d.getMinutes(),d.getSeconds()].map(v=>String(v).padStart(2,"0")).join(":");};
const ago=ts=>{const m=Math.floor((Date.now()-new Date(ts).getTime())/6e4);return m<1?"now":m<60?m+"m":Math.floor(m/60)+"h";};

async function fetchApi(path){
  try{
    const token = localStorage.getItem("adminToken") || "";
    const r = await fetch(`${API_BASE}${path}`, {
      headers: token ? { "Authorization": `Bearer ${token}` } : {}
    });
    if(!r.ok) throw new Error(r.status);
    return await r.json();
  } catch(e){return null;}
}

// ── UI ATOMS ────────────────────────────────────────────────
const SevBadge=({s})=>{const v=SV[s];return v?<span style={{background:v.bg,border:`1px solid ${v.bd}`,color:v.tx,padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:700,letterSpacing:1,fontFamily:"var(--m)"}}>{v.l}</span>:null;};

const Card=({children,style:sx,...p})=><div style={{background:"#0e0e13",border:"1px solid #1c1c25",borderRadius:14,padding:16,...sx}} {...p}>{children}</div>;

const Label=({children})=><div style={{fontSize:11,color:"#4a4a58",fontFamily:"var(--m)",textTransform:"uppercase",letterSpacing:1.5,marginBottom:8,fontWeight:600}}>{children}</div>;

const Bar=({pct,color,h=6})=><div style={{height:h,background:"#1c1c25",borderRadius:h,overflow:"hidden",flex:1}}><div style={{width:`${Math.min(Math.max(pct,1),100)}%`,height:"100%",background:color,borderRadius:h,transition:"width .5s ease-out"}}/></div>;

const KPI=({label,value,sub,accent,icon})=>(
  <Card style={{borderLeft:`4px solid ${accent}`,flex:1}}>
    <div style={{fontSize:11,color:"#4a4a58",fontFamily:"var(--m)",letterSpacing:1,marginBottom:4}}>{icon} {label}</div>
    <div style={{fontSize:28,fontWeight:700,color:accent,fontFamily:"var(--m)",lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:12,color:"#333",fontFamily:"var(--m)",marginTop:4}}>{sub}</div>}
  </Card>
);

const Row=({l,r,rc="#888"})=>(
  <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #15151e"}}>
    <span style={{fontSize:14,color:"#aaa"}}>{l}</span>
    <span style={{fontSize:14,fontWeight:600,fontFamily:"var(--m)",color:rc}}>{r}</span>
  </div>
);

// ── MAIN ────────────────────────────────────────────────────
export default function CommandCenter(){
  const [tab,setTab]=useState("exec");
  const [now,setNow]=useState(clk());
  const [feed,setFeed]=useState([]);
  const [exp,setExp]=useState(null);
  const [aF,setAF]=useState(null);

  const [zReport,setZReport]=useState(null);
  const [anomalies,setAnomalies]=useState([]);
  const [warehouse,setWarehouse]=useState(null);
  const [recon,setRecon]=useState(null);
  const [pgRecon,setPgRecon]=useState(null);
  const [kpi,setKpi]=useState(null);
  const [posBeh,setPosBeh]=useState(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{const t=setInterval(()=>setNow(clk()),1000);return()=>clearInterval(t);},[]);

  // WebSocket
  useEffect(()=>{
    let ws,rt;
    function connect(){
      const wsUrl=API_BASE.replace("http","ws");
      ws=new WebSocket(wsUrl);
      ws.onopen=()=>{setFeed(p=>[{t:clk(),x:"🟢 WebSocket connected",k:"sys"},...p].slice(0,100));};
      ws.onmessage=(e)=>{
        try{
          const d=JSON.parse(e.data);
          const ev=d.event||d.type||"?";
          const parts=[];
          if(d.data?.kasir||d.data?.cashierName)parts.push(d.data.kasir||d.data.cashierName);
          if(d.data?.id)parts.push(d.data.id);
          if(d.data?.total)parts.push(fR(d.data.total));
          setFeed(p=>[{t:clk(),x:`${ev} → ${parts.join(" · ")||JSON.stringify(d.data||{}).slice(0,60)}`,k:ev.includes("void")?"err":"ok"},...p].slice(0,100));
          if(ev==="pos:void"||ev==="order:new")refreshData();
        }catch(err){
          setFeed(p=>[{t:clk(),x:String(e.data).slice(0,80),k:"ws"},...p].slice(0,100));
        }
      };
      ws.onclose=()=>{rt=setTimeout(connect,3000);};
      ws.onerror=()=>ws.close();
    }
    connect();
    return()=>{clearTimeout(rt);if(ws)ws.close();};
  },[]);

  // Data polling
  const refreshData=useCallback(async()=>{
    const[z,a,w,rc,pg,k,pb]=await Promise.all([fetchApi("/api/reports/z"),fetchApi("/api/audit/anomalies"),fetchApi("/api/audit/warehouse"),fetchApi("/api/aggregator/reconcile"),fetchApi("/api/payment-gateway/reconcile"),fetchApi("/api/cashier-kpi"),fetchApi("/api/pos-behavior/summary")]);
    if(z)setZReport(z);
    if(a?.items)setAnomalies(prev=>{const ids=new Set(prev.map(x=>x.id));const n=a.items.filter(x=>!ids.has(x.id));return[...n,...prev];});
    if(w)setWarehouse(w);
    if(rc)setRecon(rc);
    if(pg)setPgRecon(pg);
    if(k)setKpi(k);
    if(pb)setPosBeh(pb);
    setLoading(false);
  },[]);

  useEffect(()=>{refreshData();const t=setInterval(refreshData,12000);return()=>clearInterval(t);},[refreshData]);

  // Computed
  const z=zReport||{};const zS=z.summary||{};
  const unr=useMemo(()=>anomalies.filter(a=>!a.resolved&&!a.res),[anomalies]);
  const critN=unr.filter(a=>(a.severity||a.sev)==="critical").length;
  const aLoss=unr.reduce((s,a)=>s+(a.amount||a.amt||0),0);
  const aByT=useMemo(()=>{const m={};Object.keys(RULES).forEach(k=>{m[k]=0;});unr.forEach(a=>{const t=a.type;if(m[t]!==undefined)m[t]++;});return m;},[unr]);
  const fltA=useMemo(()=>unr.filter(a=>!aF||a.type===aF),[unr,aF]);
  const whAlerts=(warehouse?.items||[]).filter(w=>w.stock<=w.minStock);
  const topItems=(z.topItems||[]).slice(0,10);
  const maxQ=topItems[0]?.qty||1;
  const aggGross=recon?.total?.gross_revenue||0;
  const aggComm=recon?.total?.total_commission||0;
  const aggNet=recon?.total?.net_revenue||0;
  const pgGross=pgRecon?.totals?.amount||0;
  const pgCount=pgRecon?.totals?.paid||0;
  const kpiCashiers=kpi?.cashiers||[];
  const kpiIssues=kpiCashiers.filter(c=>c.bad_count>0||(c.kpi_score!=null&&c.kpi_score<60));

  const resolve=useCallback(async id=>{
    setAnomalies(p=>p.map(a=>a.id===id?{...a,resolved:true,res:true}:a));
    try{
      const token=localStorage.getItem("adminToken")||"";
      await fetch(`${API_BASE}/api/audit/anomalies/${id}/resolve`,{method:"POST",headers:token?{"Authorization":`Bearer ${token}`}:{}});
    }catch(e){}
  },[]);

  const TABS=[
    {id:"exec",lb:"👔 Executive",ac:"#fbbf24"},
    {id:"cust",lb:"😊 Customer",ac:"#22d3ee"},
    {id:"ops",lb:"🟢 Operation",ac:"#84cc16"},
    {id:"hris",lb:"👥 HRIS",ac:"#a78bfa"},
    {id:"promo",lb:"🎯 Promo",ac:"#ec4899"},
    {id:"live",lb:"⚡ Live Sales",ac:"#10b981"},
    {id:"menu",lb:"📊 Top Menu",ac:"#3b82f6"},
    {id:"fin",lb:"📒 Finance",ac:"#a78bfa"},
    {id:"wh",lb:"📦 WH / PPIC",ac:"#f59e0b",bg:whAlerts.length},
    {id:"anom",lb:"🚨 Anomali",ac:"#ef4444",bg:unr.length},
  ];

  if(loading)return(
    <div style={{minHeight:"100vh",background:"#08080b",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#4a4a58",fontSize:16,fontFamily:"monospace"}}>Connecting to Bites-Kiosk...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return(
  <div style={{minHeight:"100vh",background:"#08080b",color:"#d4d4d8",position:"fixed",top:0,left:0,right:0,bottom:0,overflowY:"auto",zIndex:9999,"--m":"'Geist Mono',ui-monospace,monospace","--s":"'Geist','Segoe UI',system-ui,sans-serif",fontFamily:"var(--s)",padding:"20px 28px"}}>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600;700&display=swap');
      @font-face{font-family:'Geist';src:url('https://cdn.jsdelivr.net/npm/geist@1.3.0/dist/fonts/geist-sans/Geist-Regular.woff2') format('woff2');font-weight:400}
      @font-face{font-family:'Geist';src:url('https://cdn.jsdelivr.net/npm/geist@1.3.0/dist/fonts/geist-sans/Geist-Medium.woff2') format('woff2');font-weight:500}
      @font-face{font-family:'Geist';src:url('https://cdn.jsdelivr.net/npm/geist@1.3.0/dist/fonts/geist-sans/Geist-Bold.woff2') format('woff2');font-weight:700}
      *{box-sizing:border-box;margin:0;padding:0}
      ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#2a2a35;border-radius:2px}
      @keyframes pp{0%,100%{opacity:1}50%{opacity:.25}}
      @keyframes si{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
    `}</style>

    {/* ═══ HEADER ═══ */}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:10,height:10,borderRadius:"50%",background:"#10b981",boxShadow:"0 0 10px #10b981",animation:"pp 2s infinite"}}/>
        <div>
          <h1 style={{fontSize:22,fontWeight:700,letterSpacing:-1,color:"#fafafa"}}>Bites & Co. Command Center</h1>
          <p style={{fontSize:12,color:"#3a3a44",fontFamily:"var(--m)",letterSpacing:1}}>REALTIME MONITORING DASHBOARD</p>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:16}}>
        {critN>0&&<div style={{fontSize:13,fontFamily:"var(--m)",padding:"4px 12px",borderRadius:6,background:"#450a0a",border:"1px solid #dc262666",color:"#fca5a5",fontWeight:700}}>{critN} CRITICAL</div>}
        <div style={{fontSize:24,fontWeight:600,fontFamily:"var(--m)",color:"#555",letterSpacing:3}}>{now}</div>
      </div>
    </div>

    {/* ═══ TABS ═══ */}
    <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"1px solid #15151e",paddingBottom:0}}>
      {TABS.map(t=>(
        <button key={t.id} onClick={()=>setTab(t.id)} style={{
          padding:"10px 20px",fontSize:14,fontWeight:tab===t.id?700:400,
          color:tab===t.id?t.ac:"#4a4a58",background:"transparent",border:"none",
          borderBottom:tab===t.id?`3px solid ${t.ac}`:"3px solid transparent",
          cursor:"pointer",fontFamily:"var(--s)",position:"relative",
        }}>
          {t.lb}
          {(t.bg||0)>0&&<span style={{marginLeft:6,background:t.ac,color:"#fff",fontSize:11,fontWeight:700,borderRadius:8,padding:"1px 6px"}}>{t.bg}</span>}
        </button>
      ))}
    </div>

    {/* ═══ LIVE SALES ═══ */}
    {tab==="exec"&&<div style={{animation:"si .2s ease-out"}}><CommandExecutive/></div>}
    {tab==="cust"&&<div style={{animation:"si .2s ease-out"}}><CommandCustomer/></div>}
    {tab==="ops"&&<div style={{animation:"si .2s ease-out"}}><CommandOperation/></div>}
    {tab==="hris"&&<div style={{animation:"si .2s ease-out"}}><CommandHRIS/></div>}
    {tab==="promo"&&<div style={{animation:"si .2s ease-out"}}><CommandPromo/></div>}

    {tab==="live"&&<div style={{animation:"si .2s ease-out"}}>
      {/* KPI Row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:16,marginBottom:20}}>
        <KPI label="Revenue Hari Ini" value={fK(zS.grossRevenue||0)} accent="#10b981" icon="💰" sub={`${zS.transactionCount||0} orders`}/>
        <KPI label="Transaksi" value={zS.transactionCount||0} accent="#3b82f6" icon="🧾" sub={`avg ${fR(zS.avgTicket||0)}`}/>
        <KPI label="PPN 11%" value={fK(zS.taxExtracted||0)} accent="#f59e0b" icon="🏛️"/>
        <KPI label="Anomali Open" value={unr.length} accent={critN>0?"#ef4444":"#10b981"} icon="🚨" sub={critN>0?`${critN} critical`:"clear"}/>
      </div>

      {/* Two columns: Payment + WS Feed */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {/* Payment Breakdown */}
        <Card>
          <Label>Pembayaran</Label>
          {z.payments?Object.entries(z.payments).map(([method,data])=>{
            const pct=(zS.transactionCount||1)>0?Math.round((data.count||0)/(zS.transactionCount||1)*100):0;
            const color=method.toUpperCase()==="CASH"?"#10b981":"#3b82f6";
            return(
              <div key={method} style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                <span style={{fontSize:20}}>{method.toUpperCase()==="CASH"?"💵":"📱"}</span>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:16,fontWeight:600,color}}>{method.toUpperCase()}</span>
                    <span style={{fontSize:14,fontFamily:"var(--m)",color:"#888"}}>{data.count}× · {pct}%</span>
                  </div>
                  <Bar pct={pct} color={color} h={8}/>
                  <div style={{fontSize:13,color:"#444",fontFamily:"var(--m)",marginTop:4}}>{fR(data.total||0)}</div>
                </div>
              </div>
            );
          }):<div style={{color:"#333",fontSize:14}}>Belum ada data pembayaran</div>}
        </Card>

        {/* WS Feed */}
        <Card style={{maxHeight:300,overflowY:"auto"}}>
          <Label>WebSocket Live Feed</Label>
          {feed.slice(0,15).map((e,i)=>(
            <div key={i} style={{fontSize:13,fontFamily:"var(--m)",color:e.k==="err"?"#f87171":e.k==="ok"?"#34d399":e.k==="sys"?"#60a5fa":"#3a3a44",padding:"3px 0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
              <span style={{color:"#2a2a35",marginRight:8}}>{e.t}</span>{e.x}
            </div>
          ))}
        </Card>
      </div>

      {/* ═══ KPI KASIR + ISSUE LAYANAN ═══ */}
      <Card style={{marginTop:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <Label>👥 KPI Kasir — Penilaian Customer</Label>
          {kpiIssues.length>0&&(
            <span style={{fontSize:12,fontFamily:"var(--m)",padding:"3px 10px",borderRadius:6,background:"#450a0a",border:"1px solid #dc262666",color:"#fca5a5",fontWeight:700}}>
              ⚠️ {kpiIssues.length} kasir perlu perhatian
            </span>
          )}
        </div>
        {kpiCashiers.length===0?(
          <div style={{color:"#333",fontSize:14}}>Belum ada data kasir</div>
        ):kpiCashiers.map(c=>{
          const col=c.kpi_score==null?"#6b7280":c.kpi_score>=80?"#10b981":c.kpi_score>=60?"#f59e0b":"#ef4444";
          const issue=c.bad_count>0||(c.kpi_score!=null&&c.kpi_score<60);
          return(
            <div key={c.cashier} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid #15151e"}}>
              <div style={{width:44,height:44,borderRadius:"50%",border:`2px solid ${col}`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontFamily:"var(--m)",color:col,fontSize:15,flexShrink:0}}>
                {c.kpi_score!=null?c.kpi_score:"—"}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:15,fontWeight:600,color:"#e4e4e7"}}>{c.cashier}</div>
                <div style={{fontSize:12,color:"#666",fontFamily:"var(--m)"}}>
                  <span style={{color:"#f59e0b"}}>{"★".repeat(Math.round(c.avg_rating))||"—"}</span> {c.avg_rating||"—"} · {c.transactions} trx · {fR(c.total_sales)}
                </div>
              </div>
              {issue&&(
                <span style={{fontSize:12,fontFamily:"var(--m)",color:"#f87171",fontWeight:600}}>
                  {c.bad_count>0?`👎 ${c.bad_count} review jelek`:"⚠️ KPI rendah"}
                </span>
              )}
            </div>
          );
        })}
      </Card>

      {/* ═══ PERILAKU KASIR — deteksi main-main tombol POS ═══ */}
      <Card style={{marginTop:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <Label>🎮 Perilaku Kasir — Hapus Item Sebelum Bayar</Label>
          {(posBeh?.flagged_count||0)>0&&(
            <span style={{fontSize:12,fontFamily:"var(--m)",padding:"3px 10px",borderRadius:6,background:"#450a0a",border:"1px solid #dc262666",color:"#fca5a5",fontWeight:700}}>
              ⚠️ {posBeh.flagged_count} kasir kebanyakan hapus
            </span>
          )}
        </div>
        {!(posBeh?.cashiers?.length)?(
          <div style={{color:"#333",fontSize:14}}>Belum ada aktivitas hapus item hari ini</div>
        ):posBeh.cashiers.map(c=>(
          <div key={c.cashier} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid #15151e"}}>
            <div style={{flex:1,fontSize:15,fontWeight:600,color:c.flagged?"#f87171":"#e4e4e7"}}>{c.cashier}</div>
            <div style={{fontSize:12,color:"#666",fontFamily:"var(--m)"}}>
              🗑 {c.remove_item} item{c.remove_topping>0?` · ${c.remove_topping} topping`:""}
            </div>
            <div style={{fontSize:17,fontWeight:800,fontFamily:"var(--m)",color:c.flagged?"#ef4444":"#10b981",minWidth:46,textAlign:"right"}}>{c.total}×</div>
            {c.flagged&&<span style={{fontSize:11,color:"#f87171",fontFamily:"var(--m)",fontWeight:600}}>⚠️ gak fokus</span>}
          </div>
        ))}
        <div style={{fontSize:11,color:"#3a3a44",marginTop:8,fontFamily:"var(--m)"}}>
          Flag otomatis kalau lewat {posBeh?.threshold||15}× hapus/hari — indikator kasir main-main tombol.
        </div>
      </Card>
    </div>}

    {/* ═══ TOP MENU ═══ */}
    {tab==="menu"&&<div style={{animation:"si .2s ease-out"}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {/* Ranking */}
        <Card>
          <Label>Top Menu — Qty Sold</Label>
          {topItems.length>0?topItems.map((it,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<topItems.length-1?"1px solid #15151e":"none",animation:`si .2s ease-out ${i*.03}s both`}}>
              <span style={{width:28,fontSize:16,fontWeight:700,textAlign:"center",fontFamily:"var(--m)",color:i<3?["#fbbf24","#94a3b8","#d97706"][i]:"#555"}}>{i+1}</span>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:15,fontWeight:500,color:"#ddd"}}>{it.name}</span>
                  <span style={{fontSize:16,fontWeight:700,fontFamily:"var(--m)",color:"#c084fc"}}>{it.qty}×</span>
                </div>
                <Bar pct={it.qty/maxQ*100} color="#c084fc"/>
                <div style={{fontSize:12,color:"#444",fontFamily:"var(--m)",marginTop:2}}>{fR(it.revenue||0)}</div>
              </div>
            </div>
          )):<div style={{color:"#333",fontSize:14,padding:20,textAlign:"center"}}>Belum ada data</div>}
        </Card>

        {/* Revenue Heatmap */}
        <Card>
          <Label>Revenue per Item</Label>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            {topItems.slice(0,9).map((it,i)=>{
              const mx=topItems[0]?.revenue||1;const int=Math.max(.1,it.revenue/mx);
              return(
                <div key={i} style={{background:`rgba(192,132,252,${int*.25})`,border:"1px solid rgba(192,132,252,0.15)",borderRadius:10,padding:12,textAlign:"center"}}>
                  <div style={{fontSize:14,fontWeight:600,color:"#ddd",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.name}</div>
                  <div style={{fontSize:18,fontWeight:700,color:"#c084fc",fontFamily:"var(--m)"}}>{fK(it.revenue||0)}</div>
                  <div style={{fontSize:12,color:"#888",fontFamily:"var(--m)"}}>{it.qty}× sold</div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>}

    {/* ═══ FINANCE ═══ */}
    {tab==="fin"&&<div style={{animation:"si .2s ease-out"}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Card>
          <Label>📊 P&L Hari Ini</Label>
          <Row l="Gross Revenue" r={fR(zS.grossRevenue||0)} rc="#10b981"/>
          <Row l="Net Revenue" r={fR(zS.netRevenue||0)} rc="#3b82f6"/>
          <Row l="PPN 11%" r={fR(-(zS.taxExtracted||0))} rc="#f59e0b"/>
          {z.promoUsage&&Object.entries(z.promoUsage).map(([code,d])=>(
            <Row key={code} l={`Promo: ${code}`} r={fR(-(d.totalDiscount||0))} rc="#ec4899"/>
          ))}
          <Row l="🛵 Delivery Gross (aggregator)" r={fR(aggGross)} rc="#fb7185"/>
          <Row l="🛵 Delivery Komisi platform" r={fR(-aggComm)} rc="#ef4444"/>
          <Row l={`💳 Payment Gateway (${pgCount}× QRIS/e-wallet)`} r={fR(pgGross)} rc="#22d3ee"/>
          <Row l="Est. Fraud Loss" r={fR(-aLoss)} rc="#ef4444"/>
          <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0 0",borderTop:"2px solid #10b98133",marginTop:6}}>
            <span style={{fontSize:16,fontWeight:700,color:"#eee"}}>Net Profit (est.)</span>
            <span style={{fontSize:22,fontWeight:800,fontFamily:"var(--m)",color:"#10b981"}}>{fR((zS.netRevenue||0)-aLoss+aggNet+pgGross)}</span>
          </div>
        </Card>

        <Card>
          <Label>💵 Rekonsiliasi Kas</Label>
          {z.cashReconciliation?(
            <>
              <Row l="Cash Transactions" r={`${z.cashReconciliation.transactionCount}×`} rc="#10b981"/>
              <Row l="Total Cash Sales" r={fR(z.cashReconciliation.cashSales||0)} rc="#10b981"/>
              <Row l="Cash Received" r={fR(z.cashReconciliation.cashReceived||0)} rc="#3b82f6"/>
              <Row l="Change Given" r={fR(z.cashReconciliation.cashChange||0)} rc="#f59e0b"/>
            </>
          ):(
            <div style={{color:"#333",fontSize:14,padding:20,textAlign:"center"}}>Shift belum ditutup</div>
          )}
        </Card>
      </div>
    </div>}

    {/* ═══ WAREHOUSE / PPIC ═══ */}
    {tab==="wh"&&<div style={{animation:"si .2s ease-out"}}>
      <div style={{display:"grid",gridTemplateColumns:whAlerts.length>0?"1fr 2fr":"1fr",gap:16}}>
        {/* Critical Alerts */}
        {whAlerts.length>0&&<Card style={{borderLeft:"4px solid #ef4444",background:"#120a0a"}}>
          <Label>⚠ Stok Kritis</Label>
          {whAlerts.map((w,i)=>{
            const dl=w.dailyUse>0?Math.floor(w.stock/w.dailyUse):999;
            return(
              <div key={w.id||i} style={{padding:"8px 0",borderBottom:i<whAlerts.length-1?"1px solid #1a1114":"none"}}>
                <div style={{fontSize:15,fontWeight:600,color:"#fca5a5"}}>{w.name}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
                  <span style={{fontSize:12,color:"#666",fontFamily:"var(--m)"}}>{w.id}</span>
                  <span style={{fontSize:18,fontWeight:700,fontFamily:"var(--m)",color:"#ef4444"}}>{w.stock} <span style={{fontSize:12,color:"#888"}}>{w.unit}</span></span>
                  <span style={{fontSize:13,fontFamily:"var(--m)",color:dl<=2?"#ef4444":"#f59e0b"}}>{dl}d left</span>
                </div>
              </div>
            );
          })}
        </Card>}

        {/* Full Inventory */}
        <Card>
          <Label>📦 Inventory</Label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {(warehouse?.items||[]).map((w,i)=>{
              const pct=w.maxStock>0?w.stock/w.maxStock*100:0;
              const low=w.stock<=w.minStock;
              const dl=w.dailyUse>0?Math.floor(w.stock/w.dailyUse):999;
              return(
                <div key={w.id||i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",background:low?"#1a0a0a":"#0a0a0f",borderRadius:8,border:`1px solid ${low?"#dc262622":"#15151e"}`}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500,color:low?"#fca5a5":"#ccc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{w.name}</div>
                    <Bar pct={pct} color={low?"#ef4444":pct>60?"#10b981":"#eab308"} h={4}/>
                  </div>
                  <span style={{fontSize:14,fontWeight:700,fontFamily:"var(--m)",color:low?"#ef4444":"#ccc",minWidth:40,textAlign:"right"}}>{Math.round(w.stock*10)/10}</span>
                  <span style={{fontSize:11,fontFamily:"var(--m)",color:dl<=3?"#ef4444":dl<=7?"#f59e0b":"#555",minWidth:28,textAlign:"right"}}>{dl}d</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>}

    {/* ═══ ANOMALI ═══ */}
    {tab==="anom"&&<div style={{animation:"si .2s ease-out"}}>
      {/* KPI Row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:16}}>
        <KPI label="Open" value={unr.length} accent="#ef4444" icon="⚡"/>
        <KPI label="Est. Loss" value={fK(aLoss)} accent="#f59e0b" icon="📉"/>
        <KPI label="Critical" value={critN} accent="#dc2626" icon="🔴"/>
      </div>

      {/* Filters */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
        <button onClick={()=>setAF(null)} style={{padding:"5px 12px",borderRadius:6,fontSize:13,fontWeight:!aF?700:400,background:!aF?"#1c1c25":"#0e0e13",border:`1px solid ${!aF?"#555":"#1c1c25"}`,color:!aF?"#eee":"#555",cursor:"pointer",fontFamily:"var(--m)"}}>ALL</button>
        {Object.entries(RULES).map(([k,r])=>(
          <button key={k} onClick={()=>setAF(aF===k?null:k)} style={{padding:"5px 10px",borderRadius:6,fontSize:13,fontWeight:aF===k?700:400,background:aF===k?r.cl+"18":"#0e0e13",border:`1px solid ${aF===k?r.cl+"55":"#1c1c25"}`,color:aF===k?r.cl:"#555",cursor:"pointer",fontFamily:"var(--m)"}}>
            {r.i} {aByT[k]||0}
          </button>
        ))}
      </div>

      {/* Anomaly Grid */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {fltA.length===0&&<div style={{gridColumn:"1/3",textAlign:"center",padding:30,color:"#2a2a35",fontFamily:"var(--m)",fontSize:14}}>Tidak ada anomali</div>}
        {fltA.slice(0,20).map((a,idx)=>{
          const r=RULES[a.type];if(!r)return null;
          const isO=exp===a.id;const sev=a.severity||a.sev;
          const det=a.detail||a.det||"";
          const csName=a.cashier_name||a.cs||"?";
          const olName=a.outlet_id||a.ol||"?";
          const amt=a.amount||a.amt||0;
          return(
            <Card key={a.id} onClick={()=>setExp(isO?null:a.id)} style={{cursor:"pointer",borderLeft:`4px solid ${r.cl}`,background:a.nw?"#ef444406":"#0e0e13",border:`1px solid ${isO?r.cl+"44":"#1c1c25"}`,transition:"all .15s"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                <span style={{fontSize:18}}>{r.i}</span>
                <span style={{fontSize:14,fontWeight:600,color:r.cl,flex:1}}>{r.l}</span>
                <SevBadge s={sev}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#3e3e4a",fontFamily:"var(--m)",marginBottom:4}}>
                <span>{a.id} · {csName}</span>
                <span>{ago(a.created_at||a.ts)}</span>
              </div>
              {amt>0&&<div style={{fontSize:18,fontWeight:700,fontFamily:"var(--m)",color:"#f59e0b"}}>{fR(amt)}</div>}
              {isO&&<div style={{marginTop:8,background:"#08080b",borderRadius:8,border:"1px solid #15151e",padding:12,animation:"si .15s ease-out"}}>
                <p style={{fontSize:13,color:"#aaa",lineHeight:1.6,marginBottom:8}}>{det}</p>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  <button onClick={e=>{e.stopPropagation();resolve(a.id);}} style={{padding:"6px 14px",borderRadius:6,border:"1px solid #16a34a",background:"#16a34a15",color:"#10b981",fontSize:13,cursor:"pointer",fontWeight:600,fontFamily:"var(--m)"}}>✓ Resolve</button>
                  <button onClick={e=>e.stopPropagation()} style={{padding:"6px 14px",borderRadius:6,border:"1px solid #dc2626",background:"#dc262615",color:"#fca5a5",fontSize:13,cursor:"pointer",fontFamily:"var(--m)"}}>🚨 Eskalasi</button>
                </div>
              </div>}
            </Card>
          );
        })}
      </div>
    </div>}

    {/* ═══ FOOTER ═══ */}
    <div style={{marginTop:24,padding:"12px 0",borderTop:"1px solid #15151e",textAlign:"center",fontSize:11,color:"#222",fontFamily:"var(--m)",letterSpacing:1}}>
      BITES & CO. COMMAND CENTER v4 · 12 RULES · REALTIME · LANDSCAPE
    </div>
  </div>);
}
