import { useState, useEffect, useRef } from "react";
import { api } from "./api.js";

const fIDR  = (a) => "Rp " + Math.round(a||0).toLocaleString("id-ID");
const fTime = (d) => new Date(d).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});

const STEPS = [
  {key:"waiting",   icon:"⏳", label:"Pesanan Diterima",  desc:"Pesanan Anda sudah masuk ke dapur"},
  {key:"preparing", icon:"👨‍🍳", label:"Sedang Dibuat",     desc:"Chef sedang menyiapkan pesanan Anda"},
  {key:"ready",     icon:"✅", label:"Siap Diambil!",     desc:"Pesanan Anda sudah siap! Segera ambil"},
  {key:"completed", icon:"🏁", label:"Selesai",           desc:"Terima kasih telah memesan di KaryaOS"},
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
      setError("Pesanan tidak ditemukan. Cek kembali nomor pesanan Anda.");
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
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes glow{0%,100%{box-shadow:0 0 8px rgba(52,211,153,0.3)}50%{box-shadow:0 0 20px rgba(52,211,153,0.6)}}
        input:focus{outline:none}
        button{font-family:'Inter',sans-serif;cursor:pointer}
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
            <div style={{fontFamily:"'Geist Mono',monospace",fontSize:16,fontWeight:700,marginBottom:6}}>Cek Status Pesanan</div>
            <div style={{fontSize:13,color:"#666",marginBottom:20}}>Masukkan nomor pesanan Anda</div>
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
            <div style={{fontFamily:"'Geist Mono',monospace",fontSize:16,fontWeight:700,marginBottom:6}}>Pesanan Tidak Ditemukan</div>
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
                  <div style={{fontFamily:"'Geist Mono',monospace",fontSize:24,fontWeight:700,color:"#F59E0B",letterSpacing:2}}>
                    #{order.id}
                  </div>
                  <div style={{fontSize:12,color:"#666",marginTop:2}}>
                    {order.type==="dine"?`🪑 Makan di Sini · Meja ${order.table}`:"🛍️ Bawa Pulang"}
                    {" · "}{fTime(order.time)}
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:"'Geist Mono',monospace",fontSize:18,fontWeight:700,color:"#fff"}}>{fIDR(order.total)}</div>
                  <div style={{fontSize:11,color:"#555",marginTop:2}}>💳 QRIS</div>
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
                <div style={{fontSize:13,color:"#666"}}>Pesanan ini telah dibatalkan. Silakan hubungi kasir.</div>
              </div>
            ) : (
              <div style={{...T.card,marginBottom:16}}>
                <div style={{fontFamily:"'Geist Mono',monospace",fontSize:11,fontWeight:700,color:"#555",letterSpacing:2,marginBottom:20}}>STATUS PESANAN</div>
                <div style={T.stepperWrap}>
                  {STEPS.map((step,i)=>{
                    const done    = i < stepIdx;
                    const current = i === stepIdx;
                    const pending = i > stepIdx;
                    return (
                      <div key={step.key} style={T.stepRow}>
                        {/* Icon */}
                        <div style={{...T.stepCircle,
                          background: done?"#34D399":current?"linear-gradient(135deg,#F59E0B,#F97316)":"#1a1a2e",
                          border: pending?"1px solid #21262d":`1px solid ${done?"#34D399":"#F59E0B"}`,
                          animation: current?"glow 2s ease-in-out infinite":"none",
                          boxShadow: current?"0 0 12px rgba(245,158,11,0.4)":"none",
                        }}>
                          <span style={{fontSize:current?22:18,animation:current?"bounce 1.5s ease-in-out infinite":"none"}}>
                            {done?"✓":step.icon}
                          </span>
                        </div>
                        {/* Text */}
                        <div style={{flex:1}}>
                          <div style={{fontSize:14,fontWeight:current?700:500,
                            color:done?"#34D399":current?"#F59E0B":pending?"#444":"#fff"}}>
                            {step.label}
                          </div>
                          {current && (
                            <div style={{fontSize:12,color:"#888",marginTop:2,animation:"fadeUp 0.3s ease"}}>
                              {step.desc}
                              {step.key==="ready" && <span style={{color:"#34D399",fontWeight:700}}> Segera ke meja kasir!</span>}
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
                            background:i<stepIdx?"#34D399":"#1a1a2e",
                            transition:"background 0.5s"}}/>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ETA */}
                {!["completed","cancelled"].includes(order.status) && (
                  <div style={{background:"rgba(245,158,11,0.05)",border:"1px solid rgba(245,158,11,0.15)",borderRadius:12,padding:"12px 16px",marginTop:16,display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:22}}>⏱️</span>
                    <div>
                      <div style={{fontSize:13,fontWeight:600}}>Estimasi Waktu</div>
                      <div style={{fontSize:12,color:"#888"}}>
                        {order.status==="waiting"?"10–20 menit":order.status==="preparing"?"5–12 menit":"Segera siap!"}
                      </div>
                    </div>
                    <div style={{marginLeft:"auto",fontFamily:"'Geist Mono',monospace",fontSize:11,color:"#555"}}>
                      Update: {fTime(lastPoll)}
                    </div>
                  </div>
                )}

                {/* Auto-refresh indicator */}
                {!["completed","cancelled"].includes(order.status) && (
                  <div style={{textAlign:"center",marginTop:12,fontSize:11,color:"#333",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                    <span style={{width:6,height:6,borderRadius:"50%",background:"#34D399",animation:"pulse 2s infinite",display:"inline-block"}}/>
                    Halaman refresh otomatis setiap 5 detik
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
  root:   {fontFamily:"'Inter',sans-serif",background:"#050810",color:"#fff",minHeight:"100vh"},
  header: {background:"#080c10",borderBottom:"1px solid #0f1629",padding:"14px 20px"},
  headerInner:{display:"flex",alignItems:"center",gap:12,maxWidth:520,margin:"0 auto"},
  logo:   {fontSize:28},
  brand:  {fontFamily:"'Geist Mono',monospace",fontSize:16,fontWeight:700,color:"#F59E0B",letterSpacing:2},
  brandSub:{fontSize:10,color:"#555",letterSpacing:2},
  homeBtn:{marginLeft:"auto",background:"transparent",border:"1px solid #1a1a2e",borderRadius:8,padding:"6px 12px",color:"#555",fontSize:12},
  body:   {maxWidth:520,margin:"0 auto",padding:"20px 16px"},
  card:   {background:"#0d1117",border:"1px solid #1a1a2e",borderRadius:16,padding:"18px 20px"},
  searchInput:{flex:1,background:"#080c10",border:"1px solid #21262d",borderRadius:10,padding:"10px 14px",color:"#fff",fontSize:16,fontFamily:"'Geist Mono',monospace",letterSpacing:2,textTransform:"uppercase"},
  searchBtn:{background:"linear-gradient(90deg,#F59E0B,#F97316)",border:"none",borderRadius:10,padding:"10px 20px",color:"#050810",fontWeight:700,fontSize:13,letterSpacing:1,fontFamily:"'Geist Mono',monospace"},
  stepperWrap:{display:"flex",flexDirection:"column",gap:0},
  stepRow:{display:"flex",alignItems:"center",gap:14,padding:"14px 0",position:"relative"},
  stepCircle:{width:52,height:52,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.4s"},
  waBtn:  {flex:2,background:"linear-gradient(90deg,#25D366,#128C7E)",border:"none",borderRadius:12,padding:"13px 16px",color:"#fff",fontWeight:700,fontSize:13},
  copyBtn:{flex:1,background:"#0d1117",border:"1px solid #21262d",borderRadius:12,padding:"13px",color:"#888",fontSize:13},
};
