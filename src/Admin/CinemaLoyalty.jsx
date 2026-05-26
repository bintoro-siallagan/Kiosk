// karyaOS — Cinema Loyalty / Membership Admin
// Tier Bronze/Silver/Gold/Platinum berdasar lifetime spend.
// 1pt per Rp 1000 spent × tier multiplier · 1pt = Rp 100 discount.
// Birthday bonus 1x free ticket per tahun (±7 hari grace).

import { useState, useEffect, useCallback } from "react";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const TIER_COLOR = { bronze: "#cd7f32", silver: "#94a3b8", gold: "#fbbf24", platinum: "#a855f7" };
const TIER_ICON  = { bronze: "🥉", silver: "🥈", gold: "🥇", platinum: "👑" };

export default function CinemaLoyalty({ apiBase = "" }) {
  const base = `${apiBase}/api/cinema`;
  const [tiers, setTiers] = useState([]);
  const [searchPhone, setSearchPhone] = useState("");
  const [member, setMember] = useState(null);
  const [recent, setRecent] = useState([]);
  const [tierInfo, setTierInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [form, setForm] = useState({});

  // Load tier definitions
  useEffect(() => {
    fetch(`${base}/loyalty-tiers`).then(r => r.json()).then(d => setTiers(d.tiers || [])).catch(() => {});
  }, [base]);

  const showMsg = (m, kind = "ok") => { setMsg({ m, kind }); setTimeout(() => setMsg(null), 3000); };

  const lookup = useCallback(async (phoneInput) => {
    const phone = String(phoneInput || searchPhone).replace(/[^0-9]/g, "");
    if (!phone) { showMsg("Enter nomor HP", "err"); return; }
    setLoading(true);
    try {
      const r = await fetch(`${base}/loyalty/${phone}`);
      if (r.status === 404) {
        setMember(null);
        showMsg("Member belum register — daftarkan dulu", "warn");
      } else {
        const d = await r.json();
        setMember(d.member);
        setTierInfo(d.tier_info);
        setRecent(d.recent_transactions || []);
      }
    } catch (e) { showMsg("Error: " + e.message, "err"); }
    finally { setLoading(false); }
  }, [base, searchPhone]);

  const register = async () => {
    if (!form.customer_phone) { showMsg("Phone wajib", "err"); return; }
    try {
      const r = await fetch(`${base}/loyalty`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Gagal register");
      showMsg(`✓ ${d.action === "registered" ? "Member registered" : "Profile updated"}`);
      setForm({});
      lookup(form.customer_phone);
    } catch (e) { showMsg("⚠ " + e.message, "err"); }
  };

  const earnPoints = async () => {
    if (!member) return;
    const amount = prompt("Spend amount (Rp):", "75000");
    if (!amount || isNaN(amount)) return;
    try {
      const r = await fetch(`${base}/loyalty/earn`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_phone: member.customer_phone, amount: parseInt(amount, 10) }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      showMsg(`✓ +${d.points_earned} poin · saldo ${d.new_balance}${d.tier_up ? ` · 🎉 TIER UP ke ${d.tier_label}` : ""}`);
      lookup(member.customer_phone);
    } catch (e) { showMsg("⚠ " + e.message, "err"); }
  };

  const redeemPoints = async () => {
    if (!member) return;
    const pts = prompt(`Redeem poin (max ${member.points_balance}):`, "100");
    if (!pts || isNaN(pts)) return;
    try {
      const r = await fetch(`${base}/loyalty/redeem`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_phone: member.customer_phone, points: parseInt(pts, 10) }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      showMsg(`✓ -${d.points_redeemed}pt · discount ${rp(d.discount_rupiah)} · saldo ${d.new_balance}`);
      lookup(member.customer_phone);
    } catch (e) { showMsg("⚠ " + e.message, "err"); }
  };

  const claimBirthday = async () => {
    if (!member) return;
    try {
      const r = await fetch(`${base}/loyalty/birthday-claim`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_phone: member.customer_phone }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      showMsg(`🎂 Birthday claimed · +${d.points_granted}pt (Rp ${d.equivalent_rupiah.toLocaleString("id-ID")} value)`);
      lookup(member.customer_phone);
    } catch (e) { showMsg("⚠ " + e.message, "err"); }
  };

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🎫 Cinema Loyalty Membership</div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>
          4-tier (Bronze/Silver/Gold/Platinum) by lifetime spend · 1pt = Rp 1000 spent × multiplier · 1pt redeem = Rp 100 discount · Birthday bonus 1×/tahun
        </div>
      </div>

      {/* Tier ladder */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 16 }}>
        {tiers.map(t => (
          <div key={t.tier} style={{ background: C.card, border: `1px solid ${TIER_COLOR[t.tier]}55`, borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: TIER_COLOR[t.tier] }}>{t.label}</div>
              <div style={{ fontSize: 11, color: C.sub, fontFamily: "'Geist Mono',monospace" }}>×{t.point_multiplier}</div>
            </div>
            <div style={{ fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>min spend</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: "'Geist Mono',monospace" }}>{rp(t.min)}</div>
          </div>
        ))}
      </div>

      {/* Search/lookup */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={searchPhone} onChange={e => setSearchPhone(e.target.value)}
            placeholder="No. HP member (08...)" style={{ ...inp, flex: 1, minWidth: 200 }}
            onKeyDown={e => e.key === "Enter" && lookup()} />
          <button onClick={() => lookup()} style={B.lookup}>🔍 Cari Member</button>
          <button onClick={() => { setMember(null); setSearchPhone(""); setForm({ customer_phone: searchPhone }); }} style={B.add}>＋ List Baru</button>
        </div>
      </div>

      {/* Register form */}
      {!member && form.customer_phone && (
        <div style={{ background: C.card, border: `1px solid #10b98166`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#10b981", marginBottom: 10 }}>＋ List Member Baru</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="No. HP*"><input value={form.customer_phone || ""} onChange={e => setForm({ ...form, customer_phone: e.target.value })} style={inp} /></Field>
            <Field label="Nama*"><input value={form.customer_name || ""} onChange={e => setForm({ ...form, customer_name: e.target.value })} style={inp} /></Field>
            <Field label="Email"><input type="email" value={form.customer_email || ""} onChange={e => setForm({ ...form, customer_email: e.target.value })} style={inp} /></Field>
            <Field label="Tgl Lahir (YYYY-MM-DD)"><input type="date" value={form.birthday || ""} onChange={e => setForm({ ...form, birthday: e.target.value })} style={inp} /></Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={register} style={B.save}>Daftarkan</button>
            <button onClick={() => setForm({})} style={B.cancel}>Cancel</button>
          </div>
        </div>
      )}

      {/* Member detail */}
      {member && tierInfo && (
        <div style={{ background: C.card, border: `1px solid ${TIER_COLOR[member.tier]}66`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>{TIER_ICON[member.tier]} {member.customer_name || "(no name)"}</div>
              <div style={{ fontSize: 12, color: C.sub, fontFamily: "'Geist Mono',monospace", marginTop: 2 }}>{member.customer_phone}</div>
              {member.customer_email && <div style={{ fontSize: 11, color: C.dim }}>{member.customer_email}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: C.sub, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace" }}>TIER</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: TIER_COLOR[member.tier], textTransform: "uppercase", letterSpacing: 1 }}>{member.tier}</div>
              <div style={{ fontSize: 10, color: C.dim }}>multiplier ×{tierInfo.point_multiplier}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 14 }}>
            <KPI label="POIN SALDO" value={member.points_balance} color="#fbbf24" />
            <KPI label="LIFETIME SPEND" value={rp(member.lifetime_spend)} color="#10b981" />
            <KPI label="TOTAL TIKET" value={member.total_tickets} color="#22d3ee" />
            <KPI label="BIRTHDAY" value={member.birthday || "—"} color="#ec4899" small />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={earnPoints} style={B.earn}>💰 Manual Earn</button>
            <button onClick={redeemPoints} disabled={member.points_balance === 0} style={{ ...B.redeem, opacity: member.points_balance === 0 ? 0.4 : 1 }}>🎁 Redeem Points</button>
            {member.birthday && <button onClick={claimBirthday} style={B.birthday}>🎂 Claim Birthday Bonus</button>}
          </div>

          {recent.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 6 }}>📋 RECENT TRANSACTIONS</div>
              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
                {recent.map(t => (
                  <div key={t.id} style={{ display: "grid", gridTemplateColumns: "100px 1fr 80px 80px", padding: "8px 12px", borderBottom: `1px solid ${C.border}`, fontSize: 12, alignItems: "center" }}>
                    <span style={{ fontFamily: "'Geist Mono',monospace", color: C.dim, fontSize: 10 }}>{new Date(t.created_at * 1000).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    <span style={{ color: "#fff" }}>{t.description}</span>
                    <span style={{ textAlign: "right", fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: t.amount > 0 ? "#10b981" : "#fca5a5" }}>{t.amount > 0 ? "+" : ""}{t.amount}pt</span>
                    <span style={{ textAlign: "right", fontFamily: "'Geist Mono',monospace", color: C.sub, fontSize: 11 }}>= {t.balance_after}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {loading && <div style={{ padding: 14, color: C.dim, textAlign: "center" }}>Memuat…</div>}
      {msg && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: msg.kind === "err" ? "#7f1d1d" : msg.kind === "warn" ? "#78350f" : "#14532d", border: `1px solid ${msg.kind === "err" ? "#ef4444" : msg.kind === "warn" ? "#fbbf24" : "#22c55e"}`, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{msg.m}</div>}
    </div>
  );
}

function KPI({ label, value, color, small }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 9.5, color: C.sub, letterSpacing: 1.3, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: small ? 14 : 20, fontWeight: 800, color, fontFamily: "'Geist Mono',monospace", letterSpacing: -0.3 }}>{value}</div>
    </div>
  );
}
function Field({ label, children }) { return (<div><div style={{ fontSize: 10, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>{children}</div>); }
const inp = { padding: "9px 11px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none", width: "100%" };
const B = {
  lookup:  { background: "#22d3ee22", border: "1px solid #22d3ee66", color: "#22d3ee", padding: "9px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  add:     { background: "#10b98122", border: "1px solid #10b98166", color: "#10b981", padding: "9px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  save:    { background: "#10b981", border: "none", color: "#04130c", padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
  cancel:  { background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, color: C.sub, padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  earn:    { background: "linear-gradient(135deg,#10b981,#34d399)", border: "none", color: "#04130c", padding: "9px 16px", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
  redeem:  { background: "linear-gradient(135deg,#fbbf24,#f59e0b)", border: "none", color: "#111", padding: "9px 16px", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
  birthday:{ background: "linear-gradient(135deg,#ec4899,#f472b6)", border: "none", color: "#fff", padding: "9px 16px", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
};
