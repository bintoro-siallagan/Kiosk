import { useState } from "react";
import API_HOST from "./apiBase.js";

const API_BASE = API_HOST;

const TABS = [
  { id: "member", icon: "📱", label: "Member" },
  { id: "new",    icon: "✨", label: "Baru" },
  { id: "guest",  icon: "👤", label: "Tamu" }
];

export default function POSCustomerPicker({ order, onContinue, onBack, onCancel }) {
  const [tab, setTab] = useState("member");

  // ── Existing member lookup ──
  const [phoneIn, setPhoneIn] = useState("");
  const [searching, setSearching] = useState(false);
  const [foundMember, setFoundMember] = useState(null);
  const [searchErr, setSearchErr] = useState(null);

  // ── New member registration ──
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [creating, setCreating] = useState(false);

  // ── Guest ──
  const [guestName, setGuestName] = useState("");

  // ── Search ──
  const handleSearch = async () => {
    if (!phoneIn || phoneIn.length < 8) {
      setSearchErr("Phone minimal 8 digit");
      return;
    }
    setSearching(true);
    setSearchErr(null);
    setFoundMember(null);
    try {
      const url = `${API_BASE}/api/customers/lookup?phone=${encodeURIComponent(phoneIn.trim())}`;
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        // Response may be either {id, name, ...} OR {data: {...}} OR null/empty
        const cust = data?.id ? data : (data?.data?.id ? data.data : null);
        if (cust) {
          // Optionally fetch loyalty/points
          try {
            const lr = await fetch(`${API_BASE}/api/customers/${cust.id}/loyalty`);
            if (lr.ok) {
              const loyalty = await lr.json();
              cust.points = loyalty?.points ?? cust.points ?? 0;
            }
          } catch {}
          setFoundMember(cust);
        } else {
          setSearchErr("Member tidak ditemukan. Coba daftar baru di tab Baru.");
        }
      } else {
        setSearchErr("Member tidak ditemukan");
      }
    } catch (e) {
      setSearchErr("Koneksi gagal: " + e.message);
    } finally {
      setSearching(false);
    }
  };

  const handleUseMember = () => {
    onContinue({
      customerId: foundMember.id,
      customerName: foundMember.name,
      customerPhone: foundMember.phone,
      customerPoints: foundMember.points || 0,
      isNewMember: false
    });
  };

  // ── Create new ──
  const handleCreateMember = async () => {
    if (!newName.trim()) { alert("Nama wajib diisi"); return; }
    if (!newPhone.trim() || newPhone.length < 8) { alert("Phone min 8 digit"); return; }
    setCreating(true);
    try {
      const r = await fetch(`${API_BASE}/api/customers`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          name: newName.trim(),
          phone: newPhone.trim()
        })
      });
      if (!r.ok) throw new Error("Server error " + r.status);
      const created = await r.json();
      const cust = created?.id ? created : created?.data;
      if (cust && cust.id) {
        onContinue({
          customerId: cust.id,
          customerName: cust.name,
          customerPhone: cust.phone,
          customerPoints: cust.points || 0,
          isNewMember: true
        });
      } else {
        alert("Gagal membuat member: response tidak valid");
      }
    } catch (e) {
      alert("Gagal: " + e.message);
    } finally {
      setCreating(false);
    }
  };

  // ── Guest ──
  const handleGuest = () => {
    onContinue({
      customerId: null,
      customerName: guestName.trim() || null,
      customerPhone: null,
      customerPoints: 0,
      isNewMember: false
    });
  };

  // ── Render ──
  const ctxLabel = (
    <>
      {order.type === "dine-in" ? "🍽️ Dine-in" : "🛍️ Take-away"}
      {order.table && <span style={{color:"#666"}}> · {order.table.name}</span>}
    </>
  );

  return (
    <div style={S.root}>
      <header style={S.header}>
        <button onClick={onBack} style={S.iconBtn}>← Back</button>
        <div style={S.ctx}>{ctxLabel}</div>
        <button onClick={onCancel} style={S.iconBtn}>✕</button>
      </header>

      <main style={S.main}>
        <h1 style={S.title}>Customer</h1>
        <p style={S.subtitle}>Pilih opsi member untuk akumulasi poin</p>

        {/* Tabs */}
        <div style={S.tabs}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setSearchErr(null); }}
              style={{...S.tab, ...(tab === t.id ? S.tabActive : {})}}>
              <span style={{fontSize:18}}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Member existing tab */}
        {tab === "member" && (
          <div style={S.panel}>
            <label style={S.label}>Nomor HP Member</label>
            <div style={S.inputRow}>
              <input
                value={phoneIn}
                onChange={e => setPhoneIn(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="08xxxxxxxxxx"
                style={S.input}
                autoFocus
                onKeyDown={e => { if (e.key === "Enter") handleSearch(); }}
              />
              <button onClick={handleSearch} disabled={searching} style={S.searchBtn}>
                {searching ? "..." : "🔍 Cari"}
              </button>
            </div>
            {searchErr && <div style={S.err}>⚠ {searchErr}</div>}

            {foundMember && (
              <div style={S.memberCard}>
                <div style={S.memberTop}>
                  <div>
                    <div style={S.memberName}>👤 {foundMember.name}</div>
                    <div style={S.memberPhone}>{foundMember.phone}</div>
                  </div>
                  <div style={S.memberPoints}>
                    <div style={S.pointsLabel}>POIN</div>
                    <div style={S.pointsValue}>{(foundMember.points || 0).toLocaleString("id-ID")}</div>
                  </div>
                </div>
                {foundMember.tags && foundMember.tags.length > 0 && (
                  <div style={S.tagsRow}>
                    {foundMember.tags.map(t => (
                      <span key={t} style={S.tag}>{t}</span>
                    ))}
                  </div>
                )}
                <button onClick={handleUseMember} style={S.primaryBtn}>
                  ✓ Lanjut dengan Member Ini
                </button>
              </div>
            )}
          </div>
        )}

        {/* New member tab */}
        {tab === "new" && (
          <div style={S.panel}>
            <label style={S.label}>Nama Lengkap *</label>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nama customer"
              style={S.inputFull}
              autoFocus
            />
            <label style={S.label}>Nomor HP *</label>
            <input
              value={newPhone}
              onChange={e => setNewPhone(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="08xxxxxxxxxx"
              style={S.inputFull}
            />
            <button onClick={handleCreateMember} disabled={creating} style={S.primaryBtn}>
              {creating ? "Daftar..." : "✨ Daftar & Lanjut"}
            </button>
            <p style={S.hint}>Member baru akan dapat poin dari order ini</p>
          </div>
        )}

        {/* Guest tab */}
        {tab === "guest" && (
          <div style={S.panel}>
            <label style={S.label}>Nama (opsional)</label>
            <input
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              placeholder="Untuk panggil saat pesanan siap"
              style={S.inputFull}
              autoFocus
            />
            <button onClick={handleGuest} style={S.primaryBtn}>
              👤 Lanjut Tanpa Member
            </button>
            <p style={S.hint}>Order tetap tersimpan, tapi tidak ada akumulasi poin</p>
          </div>
        )}
      </main>
    </div>
  );
}

const S = {
  root: { minHeight:"100vh", background:"radial-gradient(ellipse 60% 50% at 30% 20%, rgba(70,76,98,0.45) 0%, transparent 65%), radial-gradient(ellipse 55% 45% at 75% 80%, rgba(50,55,72,0.35) 0%, transparent 65%), linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)", backgroundAttachment:"fixed", color:"#fff", fontFamily:"'Inter',sans-serif",
    display:"flex", flexDirection:"column" },
  header: { display:"flex", alignItems:"center", gap:12,
    padding:"14px 24px", borderBottom:"1px solid rgba(255,255,255,0.06)", background:"rgba(13,17,23,0.7)", backdropFilter:"blur(20px) saturate(180%)", WebkitBackdropFilter:"blur(20px) saturate(180%)", position:"sticky", top:0, zIndex:10 },
  iconBtn: { background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.7)",
    padding:"7px 14px", borderRadius:999, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:"'Inter',sans-serif", letterSpacing:"-0.1px" },
  ctx: { flex:1, fontSize:13, color:"rgba(255,255,255,0.6)", fontWeight:500, letterSpacing:"-0.1px" },
  main: { flex:1, padding:"40px 24px", maxWidth:560, margin:"0 auto", width:"100%", boxSizing:"border-box" },
  title: { fontFamily:"'Inter',sans-serif", fontSize:28, fontWeight:600, color:"rgba(255,255,255,0.95)", letterSpacing:"-0.8px",
    margin:"0 0 6px", textAlign:"center" },
  subtitle: { textAlign:"center", color:"rgba(255,255,255,0.5)", fontSize:13, marginBottom:26 },
  tabs: { display:"flex", gap:4, padding:5, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)",
    borderRadius:14, marginBottom:20 },
  tab: { flex:1, padding:"11px", background:"transparent", border:"none", color:"rgba(255,255,255,0.55)",
    borderRadius:10, cursor:"pointer", fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:500,
    display:"flex", alignItems:"center", justifyContent:"center", gap:6, letterSpacing:"-0.2px", transition:"all 0.18s ease" },
  tabActive: { background:"radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 55%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))", color:"#fff", textShadow:"0 1px 2px rgba(0,0,0,0.45)", fontWeight:600, boxShadow:"inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 12px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)" },
  panel: { background:"linear-gradient(180deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.008) 100%)", backdropFilter:"blur(28px) saturate(180%)", WebkitBackdropFilter:"blur(28px) saturate(180%)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:18, padding:24, boxShadow:"inset 0 1px 0 rgba(255,255,255,0.14),inset 0 -1px 0 rgba(0,0,0,0.18),0 8px 24px rgba(0,0,0,0.24)" },
  label: { display:"block", fontSize:11, color:"rgba(255,255,255,0.45)", marginBottom:6, marginTop:8,
    letterSpacing:0.4, textTransform:"uppercase", fontWeight:500 },
  inputRow: { display:"flex", gap:8, marginBottom:8 },
  input: { flex:1, padding:"13px 16px", borderRadius:12,
    background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.06)", color:"#fff",
    fontFamily:"'Inter',sans-serif", fontSize:15, boxSizing:"border-box", outline:"none", letterSpacing:"-0.2px" },
  inputFull: { width:"100%", padding:"13px 16px", borderRadius:12,
    background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.06)", color:"#fff",
    fontFamily:"'Inter',sans-serif", fontSize:15, boxSizing:"border-box", marginBottom:8, outline:"none", letterSpacing:"-0.2px" },
  searchBtn: { padding:"0 20px", background:"rgba(255,255,255,0.025)", border:"1px solid color-mix(in srgb, var(--brand-primary,#FF6B35) 35%, transparent)",
    color:"#fff", borderRadius:12, cursor:"pointer", fontFamily:"'Inter',sans-serif",
    fontWeight:600, fontSize:13, letterSpacing:"-0.1px" },
  err: { fontSize:12, color:"rgba(248,113,113,0.9)", padding:"8px 12px", marginBottom:8, background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.18)", borderRadius:10 },
  memberCard: { marginTop:16, padding:16, background:"linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))", border:"1px solid color-mix(in srgb, var(--brand-primary,#FF6B35) 35%, transparent)",
    borderRadius:14, boxShadow:"inset 0 1px 0 rgba(255,255,255,0.1), 0 8px 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 12%, transparent)" },
  memberTop: { display:"flex", justifyContent:"space-between", alignItems:"flex-start",
    marginBottom:12 },
  memberName: { fontSize:15, fontWeight:600, letterSpacing:"-0.2px", color:"rgba(255,255,255,0.95)" },
  memberPhone: { fontSize:12, color:"rgba(255,255,255,0.5)", marginTop:3, fontVariantNumeric:"tabular-nums" },
  memberPoints: { textAlign:"right" },
  pointsLabel: { fontSize:10, color:"rgba(255,255,255,0.45)", letterSpacing:0.4, fontWeight:500, textTransform:"uppercase" },
  pointsValue: { fontSize:20, fontWeight:600, color:"#fff", fontFamily:"'Inter',sans-serif", letterSpacing:"-0.5px", fontVariantNumeric:"tabular-nums" },
  tagsRow: { display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" },
  tag: { fontSize:10, padding:"3px 9px", borderRadius:999,
    background:"color-mix(in srgb, var(--brand-primary,#FF6B35) 14%, rgba(255,255,255,0.02))", color:"#fff", fontWeight:500, border:"1px solid color-mix(in srgb, var(--brand-primary,#FF6B35) 30%, transparent)" },
  primaryBtn: { width:"100%", padding:"14px", background:"radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))", color:"#fff", textShadow:"0 1px 3px rgba(0,0,0,0.45)",
    border:"1px solid rgba(255,255,255,0.16)", borderRadius:14, fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:600,
    letterSpacing:"-0.2px", cursor:"pointer", marginTop:12, boxShadow:"inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)" },
  hint: { fontSize:11, color:"rgba(255,255,255,0.4)", textAlign:"center", marginTop:10, marginBottom:0, letterSpacing:"-0.1px" }
};
