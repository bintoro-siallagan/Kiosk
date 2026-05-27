import { useState, useEffect, useRef } from "react";
import { api } from "./api.js";

const fIDR  = (a) => "Rp " + Math.round(a||0).toLocaleString("id-ID");
const fTime = (d) => new Date(d).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});

const STEPS = [
  {key:"waiting",   icon:"⏳", label:"Order Received",  desc:"Your order is now in the kitchen"},
  {key:"preparing", icon:"👨‍🍳", label:"Being Prepared",     desc:"Chef is preparing your order"},
  {key:"ready",     icon:"✅", label:"Ready to Pick Up!",     desc:"Your order is ready! Please collect it"},
  {key:"completed", icon:"🏁", label:"Done",           desc:"Terima kasih telah memesan di KaryaOS"},
];

const STATUS_IDX = {waiting:0, preparing:1, ready:2, completed:3, cancelled:-1};

export default function OrderTracking({ onHome }) {
  // Read orderId from URL query
  const urlOrderId = new URLSearchParams(window.location.search).get("order");
  const [orderId, setOrderId] = useState(urlOrderId||"");
  const [order,   setOrder]   = useState(null);
  const [loading, setLoading] = useState(!!urlOrderId);
  const [error,   setError]   = useState("");
  const [lastPoll, setPoll]   = useState(Date.now());
  const pollerRef = useRef();

  // Full-screen page — escape the 1126px #root width cap (index.css).
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    const pw = root.style.width, pm = root.style.maxWidth;
    root.style.width = "100%"; root.style.maxWidth = "none";
    return () => { root.style.width = pw; root.style.maxWidth = pm; };
  }, []);

  useEffect(() => {
    if (urlOrderId) fetchOrder(urlOrderId);
    return () => clearInterval(pollerRef.current);
  }, []);

  async function fetchOrder(id) {
    setLoading(true); setError("");
    try {
      const o = await api.getOrder(id.toUpperCase());
      setOrder(o);
      setPoll(Date.now());
      // Auto-poll until done
      if (!["completed","cancelled"].includes(o.status)) {
        clearInterval(pollerRef.current);
        pollerRef.current = setInterval(async () => {
          try {
            const fresh = await api.getOrder(id.toUpperCase());
            setOrder(fresh); setPoll(Date.now());
            if (["completed","cancelled"].includes(fresh.status)) {
              clearInterval(pollerRef.current);
            }
          } catch {}
        }, 4000);
      }
    } catch {
      setError("Order not found. Please double-check your order number.");
      setOrder(null);
    } finally { setLoading(false); }
  }

  function handleSearch() {
    if (!orderId.trim()) return;
    fetchOrder(orderId.trim());
  }

  const stepIdx = order ? STATUS_IDX[order.status] : -1;
  const isCancelled = order?.status === "cancelled";

  return (
    <div style={T.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;750;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes glow{0%,100%{box-shadow:0 0 16px rgba(52,211,153,0.35),inset 0 1px 0 rgba(255,255,255,0.08)}50%{box-shadow:0 0 28px rgba(52,211,153,0.65),inset 0 1px 0 rgba(255,255,255,0.12)}}
        @keyframes readyCelebrate{0%,100%{transform:scale(1);text-shadow:0 0 20px rgba(52,211,153,0.5)}50%{transform:scale(1.04);text-shadow:0 0 36px rgba(52,211,153,0.9)}}
        input:focus{outline:none;border-color:rgba(245,158,11,0.5)!important}
        button{font-family:'Inter',sans-serif;cursor:pointer;transition:all 0.2s cubic-bezier(0.4,0,0.2,1)}
        button:hover{transform:translateY(-1px)}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:2px}
      `}</style>

      {/* Header */}
      <div style={T.header}>
        <div style={T.headerInner}>
          <div style={T.logo}><img src="/logo.png" alt="KaryaOS" style={{ height: 40, objectFit: "contain" }} /></div>
          <div>
            <div style={T.brand}>KaryaOS</div>
            <div style={T.brandSub}>Order Tracking</div>
          </div>
          {onHome && <button style={T.homeBtn} onClick={onHome}>← Kembali</button>}
        </div>
      </div>

      <div style={T.body}>
        {/* Search */}
        {!urlOrderId && (
          <div style={{...T.card,marginBottom:20,textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:12}}>🔍</div>
            <div style={{fontFamily:"'Geist Mono',monospace",fontSize:16,fontWeight:700,marginBottom:6}}>Check Order Status</div>
            <div style={{fontSize:13,color:"#666",marginBottom:20}}>Enter your order number</div>
            <div style={{display:"flex",gap:10}}>
              <input style={T.searchInput} value={orderId} onChange={e=>setOrderId(e.target.value.toUpperCase())}
                onKeyDown={e=>e.key==="Enter"&&handleSearch()}
                placeholder="Contoh: A01" maxLength={8}/>
              <button style={T.searchBtn} onClick={handleSearch} disabled={loading}>
                {loading?"⏳":"Cari →"}
              </button>
            </div>
            {error && <div style={{color:"#F87171",fontSize:12,marginTop:8}}>{error}</div>}
          </div>
        )}

        {loading && (
          <div style={{textAlign:"center",padding:48}}>
            <div style={{width:40,height:40,border:"2px solid #1a1a2e",borderTop:"2px solid #F59E0B",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 16px"}}/>
            <div style={{color:"#555",fontSize:13}}>Mencari pesanan...</div>
          </div>
        )}

        {!loading && error && urlOrderId && (
          <div style={{...T.card,textAlign:"center"}}>
            <div style={{fontSize:48,marginBottom:12}}>😕</div>
            <div style={{fontFamily:"'Geist Mono',monospace",fontSize:16,fontWeight:700,marginBottom:6}}>Order Not Found</div>
            <div style={{fontSize:13,color:"#666",marginBottom:20}}>{error}</div>
            <button style={T.searchBtn} onClick={onHome}>← Kembali ke Kiosk</button>
          </div>
        )}

        {order && !loading && (
          <div style={{animation:"fadeUp 0.3s ease"}}>

            {/* Order header */}
            <div style={{...T.card,marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
                <div>
                  <div style={{fontFamily:"'Inter',sans-serif",fontSize:28,fontWeight:800,color:"#F59E0B",letterSpacing:"-1px"}}>
                    #{order.id}
                  </div>
                  <div style={{fontSize:11.5,color:"rgba(255,255,255,0.5)",marginTop:4,letterSpacing:0.3}}>
                    {order.type==="dine"?`🪑 Makan di Sini · Meja ${order.table}`:"🛍️ Bawa Pulang"}
                    {" · "}{fTime(order.time)}
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:"'Inter',sans-serif",fontSize:20,fontWeight:800,color:"#fff",letterSpacing:"-0.5px"}}>{fIDR(order.total)}</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginTop:3,fontFamily:"'JetBrains Mono',monospace",letterSpacing:1,textTransform:"uppercase"}}>💳 QRIS</div>
                </div>
              </div>

              {/* Items */}
              <div style={{borderTop:"1px solid #1a1a2e",paddingTop:12}}>
                {(order.items||[]).map((item,i)=>(
                  <div key={i} style={{display:"flex",gap:10,marginBottom:8,alignItems:"center"}}>
                    <span style={{fontSize:20}}>{item.e}</span>
                    <span style={{flex:1,fontSize:13,color:"#ccc"}}>{item.n}</span>
                    <span style={{fontSize:12,color:"#888"}}>×{item.q}</span>
                    <span style={{fontSize:13,fontWeight:600,fontFamily:"'Geist Mono',monospace",color:"#F59E0B"}}>{fIDR(item.p*item.q)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Status tracker */}
            {isCancelled ? (
              <div style={{...T.card,textAlign:"center",borderColor:"#F8717133"}}>
                <div style={{fontSize:48,marginBottom:12}}>❌</div>
                <div style={{fontFamily:"'Geist Mono',monospace",fontSize:18,fontWeight:700,color:"#F87171",marginBottom:6}}>PESANAN DIBATALKAN</div>
                <div style={{fontSize:13,color:"#666"}}>This order has been cancelled. Please contact the cashier.</div>
              </div>
            ) : (
              <div style={{...T.card,marginBottom:16}}>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.4)",letterSpacing:2,marginBottom:20,textTransform:"uppercase"}}>STATUS PESANAN</div>
                <div style={T.stepperWrap}>
                  {STEPS.map((step,i)=>{
                    const done    = i < stepIdx;
                    const current = i === stepIdx;
                    const pending = i > stepIdx;
                    return (
                      <div key={step.key} style={T.stepRow}>
                        {/* Icon */}
                        <div style={{...T.stepCircle,
                          background: done
                            ? "linear-gradient(135deg,#34D399,#10B981)"
                            : current
                              ? (step.key==="ready" ? "linear-gradient(135deg,#34D399,#10B981)" : "linear-gradient(135deg,#F59E0B,#F97316)")
                              : "rgba(255,255,255,0.03)",
                          border: pending?"1px solid rgba(255,255,255,0.06)":`1px solid ${done?"rgba(52,211,153,0.4)":(step.key==="ready"?"rgba(52,211,153,0.4)":"rgba(245,158,11,0.4)")}`,
                          animation: current?(step.key==="ready"?"glow 1.6s ease-in-out infinite":"glow 2s ease-in-out infinite"):"none",
                          boxShadow: current
                            ? (step.key==="ready" ? "0 0 24px rgba(52,211,153,0.55), inset 0 1px 0 rgba(255,255,255,0.15)" : "0 0 18px rgba(245,158,11,0.45), inset 0 1px 0 rgba(255,255,255,0.15)")
                            : done ? "0 0 12px rgba(52,211,153,0.25), inset 0 1px 0 rgba(255,255,255,0.1)" : "inset 0 1px 0 rgba(255,255,255,0.02)",
                        }}>
                          <span style={{fontSize:current?22:18,animation:current?"bounce 1.5s ease-in-out infinite":"none"}}>
                            {done?"✓":step.icon}
                          </span>
                        </div>
                        {/* Text */}
                        <div style={{flex:1}}>
                          <div style={{
                            fontSize: current && step.key==="ready" ? 28 : 14,
                            fontWeight: current ? (step.key==="ready" ? 800 : 750) : 500,
                            letterSpacing: current && step.key==="ready" ? "-0.8px" : "-0.2px",
                            color: done?"#34D399":current?(step.key==="ready"?"#34D399":"#F59E0B"):pending?"rgba(255,255,255,0.25)":"#fff",
                            textShadow: current && step.key==="ready" ? "0 0 20px rgba(52,211,153,0.5)" : "none",
                            animation: current && step.key==="ready" ? "readyCelebrate 1.6s ease-in-out infinite" : "none",
                            transition: "all 0.3s ease",
                          }}>
                            {step.label}
                          </div>
                          {current && (
                            <div style={{fontSize:12,color:"rgba(255,255,255,0.55)",marginTop:4,animation:"fadeUp 0.3s ease",letterSpacing:"-0.1px"}}>
                              {step.desc}
                              {step.key==="ready" && <span style={{color:"#34D399",fontWeight:700,display:"block",marginTop:4}}>Segera ke meja kasir!</span>}
                            </div>
                          )}
                        </div>
                        {/* Time indicator */}
                        {current && (
                          <div style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#F59E0B"}}>
                            <span style={{width:6,height:6,borderRadius:"50%",background:"#F59E0B",animation:"pulse 1.5s infinite",display:"inline-block"}}/>
                            SEKARANG
                          </div>
                        )}
                        {done && <div style={{fontSize:11,color:"#34D399"}}>✓</div>}
                        {/* Connector line */}
                        {i < STEPS.length-1 && (
                          <div style={{position:"absolute",left:26,top:52,width:2,height:32,
                            background:i<stepIdx?"linear-gradient(180deg,#34D399,rgba(52,211,153,0.3))":"rgba(255,255,255,0.06)",
                            transition:"background 0.5s"}}/>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ETA */}
                {!["completed","cancelled"].includes(order.status) && (
                  <div style={{background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.18)",borderRadius:13,padding:"13px 16px",marginTop:18,display:"flex",alignItems:"center",gap:12,boxShadow:"inset 0 1px 0 rgba(255,255,255,0.03)"}}>
                    <span style={{fontSize:22}}>⏱️</span>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,letterSpacing:"-0.2px"}}>Estimasi Waktu</div>
                      <div style={{fontSize:12,color:"rgba(255,255,255,0.55)",marginTop:2}}>
                        {order.status==="waiting"?"10–20 menit":order.status==="preparing"?"5–12 menit":"Segera siap!"}
                      </div>
                    </div>
                    <div style={{marginLeft:"auto",fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"rgba(255,255,255,0.35)",letterSpacing:0.5}}>
                      Update: {fTime(lastPoll)}
                    </div>
                  </div>
                )}

                {/* Auto-refresh indicator */}
                {!["completed","cancelled"].includes(order.status) && (
                  <div style={{textAlign:"center",marginTop:14,fontSize:10.5,color:"rgba(255,255,255,0.3)",display:"flex",alignItems:"center",justifyContent:"center",gap:6,fontFamily:"'JetBrains Mono',monospace",letterSpacing:0.5}}>
                    <span style={{width:6,height:6,borderRadius:"50%",background:"#34D399",animation:"pulse 2s infinite",display:"inline-block",boxShadow:"0 0 8px rgba(52,211,153,0.6)"}}/>
                    Refresh otomatis tiap 5 detik
                  </div>
                )}
              </div>
            )}

            {/* Customer info */}
            {order.customerName && (
              <div style={{...T.card,marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#38BDF8,#6366F1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700}}>
                    {order.customerName[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{fontSize:14,fontWeight:600}}>{order.customerName}</div>
                    <div style={{fontSize:12,color:"#666"}}>{order.customerPhone}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Share buttons */}
            <div style={{display:"flex",gap:10}}>
              <button style={T.waBtn} onClick={()=>{
                const url = `${window.location.origin}${window.location.pathname}?order=${order.id}`;
                const msg = encodeURIComponent(`Cek status pesanan KaryaOS #${order.id} saya di sini: ${url}`);
                window.open(`https://wa.me/?text=${msg}`,"_blank");
              }}>
                💬 Share via WhatsApp
              </button>
              <button style={T.copyBtn} onClick={()=>{
                const url = `${window.location.origin}${window.location.pathname}?order=${order.id}`;
                navigator.clipboard?.writeText(url);
              }}>
                📋 Copy Link
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const T = {
  root:   {
    fontFamily:"'Inter',sans-serif",
    background:`
      radial-gradient(800px 600px at 30% 10%, rgba(245,158,11,0.04), transparent),
      radial-gradient(600px 400px at 80% 70%, rgba(52,211,153,0.03), transparent),
      linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)
    `,
    backgroundAttachment:"fixed",
    color:"#fff",minHeight:"100vh",
  },
  header: {
    background:"rgba(13,17,23,0.7)",
    backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",
    borderBottom:"1px solid rgba(255,255,255,0.06)",
    padding:"16px 20px",
    position:"sticky",top:0,zIndex:10,
  },
  headerInner:{display:"flex",alignItems:"center",gap:12,maxWidth:520,margin:"0 auto"},
  logo:   {fontSize:28},
  brand:  {fontFamily:"'Inter',sans-serif",fontSize:17,fontWeight:800,color:"#F59E0B",letterSpacing:"-0.5px"},
  brandSub:{fontSize:9.5,color:"rgba(255,255,255,0.4)",letterSpacing:2,fontFamily:"'JetBrains Mono',monospace",textTransform:"uppercase",marginTop:2},
  homeBtn:{marginLeft:"auto",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:9,padding:"7px 14px",color:"rgba(255,255,255,0.55)",fontSize:11,fontFamily:"'JetBrains Mono',monospace",letterSpacing:1,textTransform:"uppercase"},
  body:   {maxWidth:520,margin:"0 auto",padding:"20px 16px"},
  card:   {
    background:"linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))",
    border:"1px solid rgba(255,255,255,0.06)",
    borderRadius:18,padding:"20px 22px",
    boxShadow:"0 1px 2px rgba(0,0,0,0.3), 0 10px 28px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)",
    backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",
  },
  searchInput:{
    flex:1,
    background:"rgba(0,0,0,0.3)",
    border:"1px solid rgba(255,255,255,0.06)",
    borderRadius:11,padding:"11px 16px",color:"#fff",fontSize:16,
    fontFamily:"'JetBrains Mono',monospace",letterSpacing:2,textTransform:"uppercase",
    fontWeight:600,
    transition:"all 0.2s ease",
  },
  searchBtn:{
    background:"linear-gradient(135deg,#F59E0B,#F97316)",
    border:"1px solid rgba(255,255,255,0.12)",
    borderRadius:11,padding:"11px 20px",color:"#0a0a0a",fontWeight:800,
    fontSize:13,letterSpacing:1,fontFamily:"'Inter',sans-serif",
    boxShadow:"0 1px 2px rgba(0,0,0,0.3), 0 8px 20px rgba(245,158,11,0.32), inset 0 1px 0 rgba(255,255,255,0.2)",
  },
  stepperWrap:{display:"flex",flexDirection:"column",gap:0},
  stepRow:{display:"flex",alignItems:"center",gap:14,padding:"14px 0",position:"relative"},
  stepCircle:{width:52,height:52,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.4s cubic-bezier(0.4,0,0.2,1)"},
  waBtn:  {
    flex:2,background:"linear-gradient(135deg,#25D366,#128C7E)",
    border:"1px solid rgba(255,255,255,0.12)",borderRadius:12,padding:"13px 16px",
    color:"#fff",fontWeight:700,fontSize:13,letterSpacing:"-0.2px",
    boxShadow:"0 1px 2px rgba(0,0,0,0.3), 0 8px 22px rgba(37,211,102,0.28), inset 0 1px 0 rgba(255,255,255,0.15)",
  },
  copyBtn:{
    flex:1,background:"rgba(255,255,255,0.03)",
    border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"13px",
    color:"rgba(255,255,255,0.6)",fontSize:13,fontWeight:600,
  },
};
