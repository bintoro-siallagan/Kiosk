import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3011";

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
  root: { minHeight:"100vh", background:"#111", color:"#fff", fontFamily:"'DM Sans',sans-serif",
    display:"flex", flexDirection:"column" },
  header: { display:"flex", alignItems:"center", gap:12,
    padding:"12px 20px", borderBottom:"1px solid #222", background:"#0a0a0a" },
  iconBtn: { background:"transparent", border:"1px solid #333", color:"#aaa",
    padding:"8px 14px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit" },
  ctx: { flex:1, fontSize:14, color:"#F59E0B", fontWeight:600 },
  main: { flex:1, padding:"40px 24px", maxWidth:560, margin:"0 auto", width:"100%", boxSizing:"border-box" },
  title: { fontFamily:"'Bebas Neue',cursive", fontSize:42, color:"#F59E0B", letterSpacing:2,
    margin:0, textAlign:"center" },
  subtitle: { textAlign:"center", color:"#888", fontSize:13, marginBottom:24 },
  tabs: { display:"flex", gap:6, padding:4, background:"#0a0a0a", border:"1px solid #222",
    borderRadius:12, marginBottom:20 },
  tab: { flex:1, padding:"12px", background:"transparent", border:"none", color:"#888",
    borderRadius:8, cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600,
    display:"flex", alignItems:"center", justifyContent:"center", gap:6 },
  tabActive: { background:"#F59E0B", color:"#111", fontWeight:800 },
  panel: { background:"#0a0a0a", border:"1px solid #222", borderRadius:14, padding:24 },
  label: { display:"block", fontSize:12, color:"#888", marginBottom:6, marginTop:8,
    letterSpacing:0.5, textTransform:"uppercase", fontWeight:600 },
  inputRow: { display:"flex", gap:8, marginBottom:8 },
  input: { flex:1, padding:"14px 16px", borderRadius:10,
    background:"#1a1a1a", border:"1px solid #2a2a2a", color:"#fff",
    fontFamily:"inherit", fontSize:16, boxSizing:"border-box" },
  inputFull: { width:"100%", padding:"14px 16px", borderRadius:10,
    background:"#1a1a1a", border:"1px solid #2a2a2a", color:"#fff",
    fontFamily:"inherit", fontSize:16, boxSizing:"border-box", marginBottom:8 },
  searchBtn: { padding:"0 20px", background:"#1a1a1a", border:"1px solid #F59E0B",
    color:"#F59E0B", borderRadius:10, cursor:"pointer", fontFamily:"inherit",
    fontWeight:700, fontSize:14 },
  err: { fontSize:12, color:"#EF4444", padding:"8px 0", marginBottom:8 },
  memberCard: { marginTop:16, padding:16, background:"#111", border:"1px solid #F59E0B",
    borderRadius:12 },
  memberTop: { display:"flex", justifyContent:"space-between", alignItems:"flex-start",
    marginBottom:12 },
  memberName: { fontSize:16, fontWeight:700 },
  memberPhone: { fontSize:12, color:"#888", marginTop:2 },
  memberPoints: { textAlign:"right" },
  pointsLabel: { fontSize:10, color:"#666", letterSpacing:1, fontWeight:600 },
  pointsValue: { fontSize:20, fontWeight:800, color:"#F59E0B", fontFamily:"'Bebas Neue',cursive" },
  tagsRow: { display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" },
  tag: { fontSize:10, padding:"3px 8px", borderRadius:100,
    background:"rgba(245,158,11,0.15)", color:"#F59E0B", fontWeight:600 },
  primaryBtn: { width:"100%", padding:"14px", background:"#F59E0B", color:"#111",
    border:"none", borderRadius:12, fontFamily:"inherit", fontSize:14, fontWeight:800,
    letterSpacing:1, cursor:"pointer", marginTop:12 },
  hint: { fontSize:11, color:"#666", textAlign:"center", marginTop:10, marginBottom:0 }
};
