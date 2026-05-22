import { useState, useEffect } from "react";
import { api } from "./api.js";

export default function AdminLogin({ onLogin }) {
  const [pin,    setPin]    = useState("");
  const [error,  setError]  = useState("");
  const [busy,   setBusy]   = useState(false);
  const [shake,  setShake]  = useState(false);

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (pin.length === 6) handleLogin();
  }, [pin]);

  // Opt out of the global auto-zoom — auto-zoom.css zooms html up to 1.4x on
  // wide screens, which (× 100vh) makes this full-screen login overflow.
  useEffect(() => {
    const prev = document.documentElement.style.zoom;
    document.documentElement.style.zoom = "1";
    return () => { document.documentElement.style.zoom = prev; };
  }, []);

  async function handleLogin() {
    setBusy(true); setError("");
    try {
      const res = await api.login(pin);
      localStorage.setItem("adminToken", res.token);
      localStorage.setItem("adminRole",  res.role);
      localStorage.setItem("adminName",  res.name);
      onLogin(res);
    } catch (e) {
      setError("PIN salah. Coba lagi.");
      setPin("");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally { setBusy(false); }
  }

  const handleKey = (k) => {
    if (busy) return;
    if (k === "⌫") { setPin(p => p.slice(0,-1)); setError(""); return; }
    if (pin.length < 6) setPin(p => p + k);
  };

  return (
    <div style={L.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        button{cursor:pointer;-webkit-tap-highlight-color:transparent;}
      `}</style>

      <div style={L.wrap}>
        {/* Logo */}
        <img src="/logo.png" alt="KaryaOS" style={{ width: 88, height: 88, objectFit: "contain", marginBottom: 8 }} />
        <div style={L.brand}>KaryaOS</div>
        <div style={L.title}>ADMIN ACCESS</div>
        <div style={L.sub}>Masukkan PIN 6 digit Anda</div>

        {/* PIN dots */}
        <div style={{...L.dots, animation: shake?"shake 0.4s ease":"none"}}>
          {Array.from({length:6},(_,i)=>(
            <div key={i} style={{
              ...L.dot,
              background: i < pin.length ? "#F59E0B" : "transparent",
              borderColor: i < pin.length ? "#F59E0B" : "#21262d",
              boxShadow: i < pin.length ? "0 0 8px rgba(245,158,11,0.5)" : "none",
            }}/>
          ))}
        </div>

        {error && <div style={L.error}>{error}</div>}
        {busy  && <div style={L.checking}><span style={L.spinner}/>Memverifikasi...</div>}

        {/* Numpad */}
        <div style={L.pad}>
          {[1,2,3,4,5,6,7,8,9,"⌫",0,""].map((k,i)=>(
            k==="" ? <div key={i}/> :
            <button key={i} onPointerDown={e=>{e.preventDefault();handleKey(k);}}
              style={k==="⌫" ? L.delKey : L.key}>
              {k}
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}

const L = {
  root:    {fontFamily:"'Inter',sans-serif",background:"#050810",color:"#fff",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"},
  wrap:    {textAlign:"center",padding:"40px 24px",maxWidth:360,width:"100%",animation:"fadeUp 0.3s ease"},
  logo:    {fontSize:56,marginBottom:8},
  brand:   {fontFamily:"'Geist Mono',monospace",fontSize:28,fontWeight:700,color:"#F59E0B",letterSpacing:4,marginBottom:4},
  title:   {fontFamily:"'Geist Mono',monospace",fontSize:14,letterSpacing:4,color:"#555",marginBottom:6},
  sub:     {fontSize:13,color:"#444",marginBottom:32},
  dots:    {display:"flex",gap:14,justifyContent:"center",marginBottom:24},
  dot:     {width:18,height:18,borderRadius:"50%",border:"2px solid",transition:"all 0.2s"},
  error:   {fontSize:13,color:"#F87171",marginBottom:12,background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.2)",borderRadius:8,padding:"8px 16px"},
  checking:{display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontSize:12,color:"#F59E0B",marginBottom:12},
  spinner: {width:14,height:14,border:"2px solid #333",borderTop:"2px solid #F59E0B",borderRadius:"50%",animation:"spin 0.8s linear infinite",display:"inline-block"},
  pad:     {display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:28},
  key:     {height:64,fontSize:22,fontFamily:"'Geist Mono',monospace",fontWeight:700,background:"#0d1117",border:"1px solid #1a1a2e",borderRadius:14,color:"#fff",transition:"background 0.1s"},
  delKey:  {height:64,fontSize:20,background:"#0d1117",border:"1px solid #1a1a2e",borderRadius:14,color:"#F87171",fontWeight:700},
  hints:   {display:"flex",gap:16,justifyContent:"center",flexWrap:"wrap"},
  hint:    {fontSize:11,color:"#333",fontFamily:"'Geist Mono',monospace"},
};
