import { useState, useRef, useEffect, useCallback } from "react";
import * as audio from "./audio.js";
import { api } from "./api.js";

const fIDR = (a) => "Rp " + Math.round(a||0).toLocaleString("id-ID");

// ── NUMPAD ────────────────────────────────────────────────────────────────────
function Numpad({ onKey }) {
  const keys = [1,2,3,4,5,6,7,8,9,"⌫",0,"✓"];
  return (
    <div style={N.pad}>
      {keys.map(k => (
        <button key={k} onPointerDown={e=>{e.preventDefault();onKey(k);}}
          style={k==="✓" ? N.keyEnter : k==="⌫" ? N.keyDel : N.key}>
          {k}
        </button>
      ))}
    </div>
  );
}

export default function CustomerInput({ cart, orderType, onConfirm, onBack }) {
  const [phone, setPhone]     = useState("");
  const [name,  setName]      = useState("");
  const [step,  setStep]      = useState("phone"); // phone | name | found
  const [busy,  setBusy]      = useState(false);
  const [shake, setShake]     = useState(false);
  const [customer, setCust]   = useState(null);
  const [loyalty, setLoyalty] = useState(null);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const nameRef               = useRef();
  const inputRef              = useRef();

  // Auto-focus name input when step changes
  useEffect(() => {
    if (step === "name") setTimeout(() => nameRef.current?.focus(), 80);
  }, [step]);

  const subtotal = cart.reduce((s,e) => s+(e.item.price+e.addonTotal)*e.qty, 0);
  const total    = subtotal + Math.round(subtotal*0.11);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  // Numpad handler for phone step
  const handleNumKey = useCallback((k) => {
    audio.playClick();
    if (k === "⌫") { setPhone(p => p.slice(0,-1)); return; }
    if (k === "✓") { handlePhoneDone(); return; }
    if (phone.length < 13) setPhone(p => p + k);
  }, [phone]);

  async function handlePhoneDone() {
    if (phone.length < 9) { triggerShake(); return; }
    setBusy(true);
    try {
      const found = await api.lookupCustomer(phone);
      audio.playSwoosh();
      if (found) {
        setCust(found);
        setName(found.name);
        try { setLoyalty(await api.getCustomerLoyalty(found.id)); } catch {}
        setStep("found");
      } else {
        setCust(null);
        setStep("name");
      }
    } catch {
      // Real error (network) — treat as new customer flow, fail-safe
      setCust(null);
      setStep("name");
    } finally { setBusy(false); }
  }

  async function handleConfirm() {
    if (!name.trim()) { triggerShake(); return; }
    setBusy(true);
    try {
      let c = customer;
      if (!c) c = await api.createCustomer({ name: name.trim(), phone }).catch(()=>null);
      const redeemDisc = loyalty ? Math.floor(redeemPoints / (loyalty.redeemRate||100)) * 1000 : 0;
      onConfirm({ customer: c, name: name.trim(), phone, loyalty, pointsRedeemed: redeemPoints, pointsDiscount: redeemDisc });
    } catch {
      onConfirm({ customer: null, name: name.trim(), phone, loyalty: null });
    } finally { setBusy(false); }
  }

  // Format phone display: 0812-3456-7890
  const displayPhone = phone.replace(/(\d{4})(\d{4})(\d+)/, "$1-$2-$3")
                            .replace(/(\d{4})(\d+)/, "$1-$2");

  const TAG = { member:{c:"#38BDF8",l:"Member"}, vip:{c:"#F59E0B",l:"⭐ VIP"}, new:{c:"#34D399",l:"Baru"} };

  return (
    <div style={C.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@700;800;900&family=DM+Sans:wght@400;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
        @keyframes pop{0%{transform:scale(0.85);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        button{cursor:pointer;user-select:none;-webkit-user-select:none;font-family:'Inter',sans-serif;}
        input:focus{outline:none}
      `}</style>

      {/* ── ORDER SUMMARY STRIP ── */}
      <div style={C.strip}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>{orderType==="dine"?"🪑":"🛍️"}</span>
          <div>
            <div style={C.stripLabel}>{orderType==="dine"?"Makan di Sini":"Bawa Pulang"} · {cart.reduce((s,e)=>s+e.qty,0)} item</div>
            <div style={C.stripItems}>{cart.slice(0,3).map(e=>e.item.name).join(" · ")}{cart.length>3?"...":""}</div>
          </div>
        </div>
        <div style={C.stripTotal}>{fIDR(total)}</div>
      </div>

      {/* ── PHONE STEP ── */}
      {step==="phone" && (
        <div key="step-phone" style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",padding:"28px 24px 24px",animation:"fadeUp 0.25s ease",gap:0,maxWidth:480,margin:"0 auto",width:"100%"}}>
          <div style={C.stepEmoji}>📱</div>
          <div style={C.stepTitle}>Phone number</div>
          <div style={{...C.stepSub,maxWidth:340}}>Get a notification when your order is ready and earn reward points.</div>

          {/* Phone display */}
          <div style={{...C.phoneDisplay, animation: shake?"shake 0.4s ease":"none"}}>
            <span style={C.phonePrefix}>+62</span>
            <span style={{...C.phoneNum, color: phone ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.2)"}}>
              {displayPhone || "___-____-____"}
            </span>
            {busy && <span style={C.spinner}/>}
          </div>

          <Numpad onKey={handleNumKey}/>

          <div style={{display:'flex',gap:8,marginTop:16,flexWrap:'wrap',justifyContent:'center',maxWidth:380}}>
            {["📍 Order tracking","💬 WhatsApp notif","🎁 Earn points"].map((b,i)=>(
              <span key={i} style={{fontSize:11,color:'rgba(255,255,255,0.55)',background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:999,padding:'6px 12px',letterSpacing:'-0.1px'}}>{b}</span>
            ))}
          </div>

          <button style={C.backLink} onClick={onBack}>← Back to menu</button>
        </div>
      )}

      {/* ── NAME STEP (new customer) ── */}
      {step==="name" && (
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 32px 32px",animation:"fadeUp 0.25s ease",maxWidth:480,margin:"0 auto",width:"100%"}}>
          <div style={C.stepEmoji}>👋</div>
          <div style={C.stepTitle}>Hai, siapa nama Anda?</div>
          <div style={C.stepSub}>
            <span style={{color:"#38BDF8",fontFamily:"'Inter',sans-serif",letterSpacing:1}}>{phone}</span>
            {" "}belum terdaftar
          </div>

          <input ref={nameRef} style={{...C.nameInput, animation:shake?"shake 0.4s ease":"none"}}
            value={name} onChange={e=>setName(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&handleConfirm()}
            placeholder="Ketik nama Anda..." maxLength={40}
          />

          {/* Benefit chips */}
          <div style={C.benefits}>
            {["📍 Tracking pesanan","💬 Info via WhatsApp","🎁 Promo member"].map((b,i)=>(
              <span key={i} style={C.benefitChip}>{b}</span>
            ))}
          </div>

          <div style={{display:"flex",gap:12,width:"100%",marginTop:20}}>
            <button style={C.ghostBtn} onClick={()=>setStep("phone")}>← Ubah No.</button>
            <button style={{...C.bigBtn, opacity:!name.trim()||busy?0.45:1, flex:2}}
              disabled={!name.trim()||busy} onClick={handleConfirm}>
              {busy ? <span style={C.spinner}/> : "DAFTAR & BAYAR →"}
            </button>
          </div>
        </div>
      )}

      {/* ── FOUND STEP (existing member) ── */}
      {step==="found" && customer && (
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 28px 28px",animation:"fadeUp 0.25s ease",maxWidth:480,margin:"0 auto",width:"100%"}}>
          <div style={{...C.stepEmoji,animation:"pop 0.4s ease"}}>🎉</div>
          <div style={C.stepTitle}>Welcome!</div>

          {/* Member card — vertical stack to avoid horizontal overlap on narrow screens */}
          <div style={C.memberCard}>
            <div style={C.memberTop}>
              <div style={C.memberAva}>{customer.name[0].toUpperCase()}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={C.memberName}>{customer.name}</div>
                <div style={C.memberPhone}>{customer.phone}</div>
              </div>
              <div style={C.visitsBlock}>
                <div style={C.visits}>{customer.visits}</div>
                <div style={C.visitsLabel}>visits</div>
              </div>
            </div>
            {(customer.tags||[]).length > 0 && (
              <div style={C.tagsRow}>
                {(customer.tags||[]).map(t=>(
                  <span key={t} style={{...C.tag,color:TAG[t]?.c||"#aaa",background:`${TAG[t]?.c||"#aaa"}18`,border:`1px solid ${TAG[t]?.c||"#aaa"}33`}}>
                    {TAG[t]?.l||t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {loyalty && loyalty.points >= loyalty.minRedeemPoints && (() => {
            const maxFromBalance = Math.floor(loyalty.points / loyalty.redeemRate) * loyalty.redeemRate;
            const maxFromPct = Math.floor((subtotal * 0.5) / loyalty.redeemRate) * loyalty.redeemRate;
            const maxRedeem = Math.min(maxFromBalance, maxFromPct);
            const redeemDisc = Math.floor(redeemPoints / loyalty.redeemRate) * 1000;
            return maxRedeem > 0 ? (
              <div style={C.redeemBox}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <span style={{fontSize:14,fontWeight:800,color:"#FB923C",letterSpacing:0.5}}>🎁 Tukar Poin jadi Discount</span>
                  <span style={{fontSize:12,fontWeight:700,color:"#FB923C",background:"rgba(251,146,60,0.15)",borderRadius:8,padding:"3px 9px"}}>{loyalty.points} poin</span>
                </div>
                <input type="range" min={0} max={maxRedeem} step={loyalty.redeemRate}
                  value={redeemPoints} onChange={e => setRedeemPoints(+e.target.value)}
                  style={C.slider} />
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#666",marginTop:4}}>
                  <span>Tanpa Tukar</span>
                  <span>Max {maxRedeem} pt</span>
                </div>
                <div style={{textAlign:"center",marginTop:10,padding:"8px",background:"rgba(251,146,60,0.08)",borderRadius:10}}>
                  {redeemPoints > 0 ? (
                    <>
                      <span style={{fontSize:18,fontWeight:700,color:"#FB923C"}}>{redeemPoints} poin</span>
                      <span style={{fontSize:13,color:"#888",margin:"0 8px"}}>·</span>
                      <span style={{fontSize:14,color:"#34D399",fontWeight:600}}>Hemat Rp {redeemDisc.toLocaleString("id-ID")}</span>
                    </>
                  ) : (
                    <span style={{fontSize:13,color:"#666"}}>Slide to tukar poin</span>
                  )}
                </div>
              </div>
            ) : null;
          })()}

          <div style={{display:"flex",gap:12,width:"100%",marginTop:20}}>
            <button style={C.ghostBtn} onClick={()=>{setStep("phone");setPhone("");setCust(null);setRedeemPoints(0);setLoyalty(null);}}>
              Bukan saya
            </button>
            <button style={{...C.bigBtn,flex:2,background:"linear-gradient(90deg,#34D399,#059669)"}}
              disabled={busy} onClick={handleConfirm}>
              {busy ? <span style={C.spinner}/> : "✓ YA, LANJUT BAYAR"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Numpad styles — big touch targets
const N = {
  pad:      {display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,width:"100%",maxWidth:340,margin:"20px 0 0"},
  key:      {height:72,fontSize:26,fontWeight:700,background:"#1a1a2e",border:"1px solid #252540",borderRadius:16,color:"#fff",fontFamily:"'Inter',sans-serif",letterSpacing:1,transition:"background 0.1s",WebkitTapHighlightColor:"transparent",active:{background:"#252540"}},
  keyDel:   {height:72,fontSize:22,background:"#1a1a2e",border:"1px solid #252540",borderRadius:16,color:"#F87171",fontWeight:700,transition:"background 0.1s"},
  keyEnter: {height:72,fontSize:18,background:"radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))",border:"1px solid rgba(255,255,255,0.16)",borderRadius:16,color:"#fff",textShadow:"0 1px 3px rgba(0,0,0,0.45)",fontWeight:600,letterSpacing:"-0.2px",fontFamily:"'Inter',sans-serif",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.22), 0 6px 16px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)"},
};

const C = {
  root: {
    fontFamily: "'Inter',sans-serif",
    background: "radial-gradient(ellipse 70% 55% at 50% 38%, rgba(70,76,98,0.45) 0%, transparent 70%), linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)",
    backgroundAttachment: "fixed",
    color: "#fff", minHeight: "100vh", display: "flex", flexDirection: "column",
  },
  strip: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "14px 24px",
    background: "rgba(13,17,23,0.7)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
    borderBottom: "1px solid rgba(255,255,255,0.06)", gap: 12,
    position: "sticky", top: 0, zIndex: 10,
  },
  stripLabel: { fontSize: 13, fontWeight: 600, marginBottom: 2, color: "rgba(255,255,255,0.92)", letterSpacing: "-0.2px" },
  stripItems: { fontSize: 11, color: "rgba(255,255,255,0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 },
  stripTotal: { fontFamily: "'Inter',sans-serif", fontSize: 20, fontWeight: 600, color: "#fff", letterSpacing: "-0.4px", flexShrink: 0, fontVariantNumeric: "tabular-nums" },
  stepEmoji: { fontSize: 72, marginBottom: 10, display: "block", textAlign: "center", filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.35))" },
  stepTitle: { fontFamily: "'Inter',sans-serif", fontSize: 28, fontWeight: 600, letterSpacing: "-0.8px", color: "rgba(255,255,255,0.95)", marginBottom: 8, textAlign: "center" },
  stepSub: { fontSize: 14, color: "rgba(255,255,255,0.55)", marginBottom: 22, textAlign: "center", lineHeight: 1.5 },
  // Phone display + name input — glass
  phoneDisplay: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16, padding: "16px 22px", width: "100%", maxWidth: 340, marginBottom: 12,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  phonePrefix: { fontSize: 16, color: "rgba(255,255,255,0.45)", fontFamily: "'Inter',sans-serif" },
  phoneNum: { fontFamily: "'Inter',sans-serif", fontSize: 26, fontWeight: 600, letterSpacing: 3, flex: 1, textAlign: "center", fontVariantNumeric: "tabular-nums", color: "rgba(255,255,255,0.95)" },
  spinner: { width: 18, height: 18, border: "2px solid rgba(255,255,255,0.15)", borderTop: "2px solid var(--brand-primary,#FF6B35)", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block", flexShrink: 0 },
  nameInput: {
    width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14, padding: "16px 20px", color: "#fff", fontSize: 18,
    marginBottom: 16, fontFamily: "'Inter',sans-serif", textAlign: "center", outline: "none", letterSpacing: "-0.2px",
  },
  benefits: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  benefitChip: { background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.22)", borderRadius: 999, padding: "5px 12px", fontSize: 12, color: "#34D399", fontWeight: 500 },
  // Member card — glass + vertical stack (top row: avatar+name+visits, then tags)
  memberCard: {
    display: "flex", flexDirection: "column", gap: 12,
    background: "linear-gradient(180deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.008) 100%)",
    backdropFilter: "blur(28px) saturate(180%)",
    WebkitBackdropFilter: "blur(28px) saturate(180%)",
    border: "1px solid rgba(56,189,248,0.18)",
    borderRadius: 18, padding: "18px 20px", width: "100%",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), 0 8px 24px rgba(0,0,0,0.22)",
  },
  memberTop: { display: "flex", alignItems: "center", gap: 14, width: "100%" },
  memberAva: {
    width: 50, height: 50, borderRadius: "50%",
    background: "linear-gradient(135deg,#38BDF8,#6366F1)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 22, fontWeight: 600, flexShrink: 0, color: "#fff",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 12px rgba(56,189,248,0.32)",
  },
  memberName: { fontSize: 17, fontWeight: 600, marginBottom: 4, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  memberPhone: { fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "'Inter',sans-serif", fontVariantNumeric: "tabular-nums", letterSpacing: 0.2 },
  visitsBlock: { textAlign: "right", flexShrink: 0 },
  visits: { fontFamily: "'Inter',sans-serif", fontSize: 26, fontWeight: 600, color: "#fff", lineHeight: 1, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.6px" },
  visitsLabel: { fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 3, letterSpacing: 0.3, fontWeight: 500, textTransform: "uppercase" },
  tagsRow: { display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 4, borderTop: "1px solid rgba(255,255,255,0.06)" },
  tag: { fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 999, letterSpacing: 0.3 },
  // Big brand CTA — tinted glass
  bigBtn: {
    background: "radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))",
    border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: 14, padding: "16px 20px",
    color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.45)",
    fontSize: 15, fontWeight: 600, letterSpacing: "-0.2px",
    fontFamily: "'Inter',sans-serif",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    transition: "opacity 0.15s, transform 0.18s",
    cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)",
  },
  redeemBox: {
    width: "100%", marginTop: 16, padding: "16px",
    background: "linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 8%, rgba(255,255,255,0.02)), rgba(13,17,23,0.4))",
    border: "1px solid color-mix(in srgb, var(--brand-primary,#FF6B35) 35%, transparent)",
    borderRadius: 14,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 18px color-mix(in srgb, var(--brand-primary,#FF6B35) 14%, transparent)",
  },
  slider: { width: "100%", accentColor: "var(--brand-primary,#FF6B35)", height: 6, cursor: "pointer" },
  ghostBtn: {
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14, padding: "16px 20px",
    color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 500, fontFamily: "'Inter',sans-serif", cursor: "pointer",
  },
  backLink: { background: "transparent", border: "none", color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 12, fontFamily: "'Inter',sans-serif", textDecoration: "underline", cursor: "pointer" },
};
