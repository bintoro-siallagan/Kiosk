import React, { useState, useEffect, useMemo } from "react";
import API_HOST from "../apiBase.js";

const BRAND = "var(--brand-primary,#FF6B35)";
const BG = "#0A0A0A";
const CARD = "#1A1A1A";
const BORDER = "#2A2A2A";
const TEXT = "#FAFAFA";
const SUB = "#A1A1AA";

const API = API_HOST;

const TYPE_META = {
  percent: { label: "% OFF", color: "#3B82F6", bg: "rgba(59,130,246,0.15)" },
  fixed: { label: "POTONGAN", color: "#10B981", bg: "rgba(16,185,129,0.15)" },
  bogo: { label: "BOGO 🎁", color: "#EC4899", bg: "rgba(236,72,153,0.15)" },
};

function rupiah(n) {
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

function parseDate(v) {
  if (v == null) return null;
  if (typeof v === "number") return new Date(v);
  return new Date(v);
}

function isExpired(p) {
  const end = parseDate(p.validUntil);
  if (!end || isNaN(end)) return false;
  return end.getTime() < Date.now();
}

function isNotStarted(p) {
  const start = parseDate(p.validFrom);
  if (!start || isNaN(start)) return false;
  return start.getTime() > Date.now();
}

function isUsedUp(p) {
  if (!p.usageLimit) return false;
  return (p.usedCount || 0) >= p.usageLimit;
}

function isAvailable(p) {
  return p.active && !isExpired(p) && !isNotStarted(p) && !isUsedUp(p);
}

function daysLeft(p) {
  const end = parseDate(p.validUntil);
  if (!end || isNaN(end)) return null;
  const diff = end.getTime() - Date.now();
  if (diff < 0) return -1;
  return Math.ceil(diff / 86400000);
}

function customerTier(customer) {
  if (!customer) return "guest";
  const tags = Array.isArray(customer.tags) ? customer.tags : [];
  if (tags.includes("vip")) return "vip";
  if (tags.includes("member")) return "member";
  return "guest";
}

function isEligible(promo, customer) {
  if (!promo.forMember) return true;
  const tier = customerTier(customer);
  // VIP-only check via code/desc heuristic
  if (promo.code === "VIP25" || /vip/i.test(promo.desc || "")) {
    return tier === "vip";
  }
  // Member check
  return tier === "member" || tier === "vip";
}

function valueLabel(p) {
  if (p.type === "percent") return `${p.value}%`;
  if (p.type === "fixed") return rupiah(p.value);
  if (p.type === "bogo") return "GRATIS";
  return "";
}

export default function FlowPromos({ customer, setActivePromo, setScreen }) {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [detail, setDetail] = useState(null);
  const [filter, setFilter] = useState("available");
  const [copied, setCopied] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`${API}/api/promos`);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const all = await r.json();
      setPromos(all);
    } catch (e) {
      setErr(e.message || "Gagal load promo");
    } finally {
      setLoading(false);
    }
  }

  const tier = customerTier(customer);

  const filtered = useMemo(() => {
    let list = [...promos];
    if (filter === "available") list = list.filter(isAvailable);
    if (filter === "member") list = list.filter(p => p.forMember && isAvailable(p));
    if (filter === "bogo") list = list.filter(p => p.type === "bogo" && isAvailable(p));
    if (filter === "bank") list = list.filter(p => p.requiredPaymentHint && isAvailable(p));
    if (filter === "expired") list = list.filter(p => isExpired(p) || isUsedUp(p));
    // Sort: eligible first, then by validUntil asc (expiring soon first)
    list.sort((a, b) => {
      const aE = isEligible(a, customer) ? 0 : 1;
      const bE = isEligible(b, customer) ? 0 : 1;
      if (aE !== bE) return aE - bE;
      const aD = parseDate(a.validUntil)?.getTime() || Infinity;
      const bD = parseDate(b.validUntil)?.getTime() || Infinity;
      return aD - bD;
    });
    return list;
  }, [promos, filter, customer]);

  const counts = useMemo(() => ({
    available: promos.filter(isAvailable).length,
    member: promos.filter(p => p.forMember && isAvailable(p)).length,
    bogo: promos.filter(p => p.type === "bogo" && isAvailable(p)).length,
    bank: promos.filter(p => p.requiredPaymentHint && isAvailable(p)).length,
  }), [promos]);

  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    } catch (e) {
      // fallback
      const t = document.createElement("textarea");
      t.value = code;
      document.body.appendChild(t);
      t.select();
      try { document.execCommand("copy"); setCopied(code); setTimeout(() => setCopied(null), 1500); } catch {}
      document.body.removeChild(t);
    }
  }

  function usePromo(promo) {
    if (setActivePromo) setActivePromo(promo);
    copyCode(promo.code);
    setDetail(null);
    setTimeout(() => setScreen("menu"), 400);
  }

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, paddingBottom: 24 }}>
      {/* Header */}
      <div style={{ position: "sticky", top: 0, background: BG, borderBottom: `1px solid ${BORDER}`, padding: "16px 20px", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setScreen("home")} style={{
            background: "transparent", border: "none", color: TEXT,
            fontSize: 24, cursor: "pointer", padding: 0, width: 32
          }}>←</button>
          <h1 style={{ margin: 0, fontFamily: "'Inter', sans-serif", fontSize: 28, color: BRAND, letterSpacing: 1 }}>
            PROMO
          </h1>
        </div>
        <div style={{ fontSize: 12, color: SUB, marginTop: 4, marginLeft: 44 }}>
          {tier === "vip" && "🌟 VIP — semua promo + VIP exclusive"}
          {tier === "member" && "🎫 Member — bisa pakai promo member"}
          {tier === "guest" && "👤 Login dulu buat promo member"}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ padding: "12px 20px", display: "flex", gap: 8, overflowX: "auto" }}>
        {[
          { id: "available", label: `🎉 Tersedia (${counts.available})` },
          { id: "member", label: `🎫 Member (${counts.member})` },
          { id: "bogo", label: `🎁 BOGO (${counts.bogo})` },
          { id: "bank", label: `🏦 Bank (${counts.bank})` },
          { id: "expired", label: "⏰ Lewat" },
        ].map(t => (
          <button key={t.id} onClick={() => setFilter(t.id)} style={{
            padding: "8px 14px", borderRadius: 999,
            border: `1px solid ${filter === t.id ? BRAND : BORDER}`,
            background: filter === t.id ? BRAND : "transparent",
            color: filter === t.id ? "#000" : TEXT,
            fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap"
          }}>{t.label}</button>
        ))}
      </div>

      {/* List */}
      <div style={{ padding: "0 20px" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: 60, color: SUB }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
            Loading promo...
          </div>
        )}
        {err && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: 16, color: "#EF4444" }}>
            ⚠ {err}
            <button onClick={load} style={{ display: "block", marginTop: 8, background: "transparent", border: "1px solid #EF4444", color: "#EF4444", padding: "6px 12px", borderRadius: 8, cursor: "pointer" }}>Coba Lagi</button>
          </div>
        )}
        {!loading && !err && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 60, color: SUB }}>
            <div style={{ fontSize: 60, marginBottom: 16 }}>🎉</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: TEXT }}>Belum ada promo</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Pantengin terus ya!</div>
          </div>
        )}

        {!loading && !err && filtered.map(p => {
          const eligible = isEligible(p, customer);
          const available = isAvailable(p);
          const dLeft = daysLeft(p);
          const t = TYPE_META[p.type] || TYPE_META.fixed;
          const usagePct = p.usageLimit ? Math.min(100, ((p.usedCount || 0) / p.usageLimit) * 100) : 0;
          const expired = isExpired(p);
          const usedUp = isUsedUp(p);

          return (
            <button key={p.id} onClick={() => setDetail(p)} disabled={!available} style={{
              display: "block", width: "100%", textAlign: "left", marginBottom: 10,
              background: CARD,
              border: `1px solid ${available && eligible ? BORDER : "rgba(255,255,255,0.04)"}`,
              borderRadius: 14, padding: 14, cursor: available ? "pointer" : "not-allowed",
              opacity: available && eligible ? 1 : 0.5,
              position: "relative", overflow: "hidden"
            }}>
              {/* Type badge top-right */}
              <div style={{
                position: "absolute", top: 14, right: 14,
                background: t.bg, color: t.color,
                fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                letterSpacing: 0.5
              }}>{t.label}</div>

              {/* Code + value */}
              <div style={{ marginBottom: 10, paddingRight: 70 }}>
                <div style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 24,
                  color: available && eligible ? BRAND : SUB, letterSpacing: 1, lineHeight: 1
                }}>
                  {p.code}
                </div>
                <div style={{ fontSize: 13, color: TEXT, marginTop: 6, lineHeight: 1.4 }}>
                  {p.desc}
                </div>
              </div>

              {/* Meta */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: SUB }}>
                {p.minOrder > 0 && <span>Min. {rupiah(p.minOrder)}</span>}
                {p.maxDiscount > 0 && p.type !== "bogo" && <span>Max. {rupiah(p.maxDiscount)}</span>}
                {p.requiredPaymentHint && (
                  <span style={{ color: "#3B82F6", fontWeight: 600 }}>🏦 {p.requiredPaymentHint}</span>
                )}
                {p.forMember && (
                  <span style={{ color: "#EC4899", fontWeight: 600 }}>⭐ Member</span>
                )}
              </div>

              {/* Bottom info */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 11, color: dLeft != null && dLeft <= 7 ? "#F97316" : SUB, fontWeight: dLeft != null && dLeft <= 7 ? 600 : 400 }}>
                  {expired ? "✕ Expired" :
                   usedUp ? "✕ Habis" :
                   !eligible ? "🔒 Member only" :
                   dLeft != null ? (dLeft === 0 ? "⏰ Habis today!" : dLeft <= 7 ? `⏰ ${dLeft} hari lagi` : `📅 ${dLeft} hari lagi`) :
                   "Active"}
                </span>
                {p.usageLimit && (
                  <span style={{ fontSize: 10, color: SUB }}>
                    {p.usedCount || 0}/{p.usageLimit}
                  </span>
                )}
              </div>

              {/* Usage progress bar */}
              {p.usageLimit && usagePct > 0 && (
                <div style={{ height: 2, background: BORDER, borderRadius: 2, marginTop: 6 }}>
                  <div style={{ height: "100%", background: usagePct > 80 ? "#F97316" : BRAND, borderRadius: 2, width: `${usagePct}%` }} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Detail bottom sheet */}
      {detail && (
        <div onClick={() => setDetail(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100,
          display: "flex", alignItems: "flex-end", justifyContent: "center"
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: BG, width: "100%", maxWidth: 440, borderRadius: "20px 20px 0 0",
            maxHeight: "90vh", overflowY: "auto", padding: 20
          }}>
            <div style={{ width: 40, height: 4, background: BORDER, borderRadius: 2, margin: "0 auto 16px" }} />

            {/* Big value display */}
            <div style={{
              background: `linear-gradient(135deg, ${BRAND}20 0%, ${BRAND}05 100%)`,
              border: `1px solid ${BRAND}40`,
              borderRadius: 16, padding: 20, marginBottom: 16, textAlign: "center"
            }}>
              <div style={{ fontSize: 11, color: BRAND, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
                {(TYPE_META[detail.type] || TYPE_META.fixed).label}
              </div>
              <div style={{
                fontFamily: "'Inter', sans-serif", fontSize: 56, color: BRAND, lineHeight: 1, marginBottom: 8
              }}>
                {valueLabel(detail)}
              </div>
              <div style={{ fontSize: 14, color: TEXT, lineHeight: 1.4, padding: "0 12px" }}>
                {detail.desc}
              </div>
            </div>

            {/* Code with copy */}
            <div style={{
              background: CARD, border: `2px dashed ${BRAND}`, borderRadius: 12,
              padding: 16, marginBottom: 16, textAlign: "center"
            }}>
              <div style={{ fontSize: 11, color: SUB, marginBottom: 6, letterSpacing: 1 }}>KODE PROMO</div>
              <div style={{
                fontFamily: "'Inter', sans-serif", fontSize: 32, color: BRAND, letterSpacing: 2, marginBottom: 8
              }}>
                {detail.code}
              </div>
              <button onClick={() => copyCode(detail.code)} style={{
                background: copied === detail.code ? "#10B981" : "transparent",
                color: copied === detail.code ? "#fff" : BRAND,
                border: `1px solid ${copied === detail.code ? "#10B981" : BRAND}`,
                padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer"
              }}>
                {copied === detail.code ? "✓ Tersalin!" : "📋 Salin Kode"}
              </button>
            </div>

            {/* Info */}
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 13 }}>
              {detail.minOrder > 0 && <DRow label="Min. order" value={rupiah(detail.minOrder)} />}
              {detail.maxDiscount > 0 && detail.type !== "bogo" && (
                <DRow label="Max. potongan" value={rupiah(detail.maxDiscount)} />
              )}
              {detail.requiredPaymentHint && (
                <DRow label="Pembayaran" value={`🏦 ${detail.requiredPaymentHint}`} color="#3B82F6" />
              )}
              {detail.forMember && (
                <DRow label="Khusus" value={detail.code === "VIP25" ? "🌟 VIP" : "🎫 Member"} color="#EC4899" />
              )}
              {detail.validUntil && (
                <DRow label="Berlaku sampai" value={parseDate(detail.validUntil).toLocaleDateString("id-ID", {
                  day: "numeric", month: "long", year: "numeric"
                })} />
              )}
              {detail.usageLimit && (
                <DRow label="Sisa" value={`${detail.usageLimit - (detail.usedCount || 0)} dari ${detail.usageLimit}`} />
              )}
            </div>

            {/* BOGO config hint */}
            {detail.bogoConfig && (
              <div style={{ background: "rgba(236,72,153,0.08)", border: "1px solid rgba(236,72,153,0.25)", borderRadius: 10, padding: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: "#EC4899", fontWeight: 700, marginBottom: 4 }}>CARA PAKAI BOGO</div>
                <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.5 }}>
                  {detail.bogoConfig.mode === "universal" && `Beli min ${detail.bogoConfig.buyQty} item apa aja, dapet ${detail.bogoConfig.getQty} gratis (max ${detail.bogoConfig.maxFreeQty || 1} item gratis)`}
                  {detail.bogoConfig.mode === "same" && `Beli ${detail.bogoConfig.buyQty + 1} item yang sama, ${detail.bogoConfig.getQty} gratis`}
                  {detail.bogoConfig.mode === "cross" && `Beli item tertentu → dapet item lain gratis`}
                  {detail.bogoConfig.mode === "category" && `Beli ${detail.bogoConfig.buyQty + 1} item dari kategori sama, termurah gratis`}
                </div>
              </div>
            )}

            {/* Eligibility warning */}
            {!isEligible(detail, customer) && (
              <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 10, padding: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: BRAND, fontWeight: 600 }}>
                  🔒 Promo khusus {detail.code === "VIP25" ? "VIP member" : "member"}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDetail(null)} style={{
                flex: 1, background: "transparent", border: `1px solid ${BORDER}`,
                color: TEXT, padding: "14px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer"
              }}>Close</button>
              <button
                onClick={() => usePromo(detail)}
                disabled={!isAvailable(detail) || !isEligible(detail, customer)}
                style={{
                  flex: 2, background: BRAND, border: "none",
                  color: "#000", padding: "14px", borderRadius: 12, fontSize: 14, fontWeight: 700,
                  cursor: "pointer", opacity: !isAvailable(detail) || !isEligible(detail, customer) ? 0.4 : 1
                }}
              >
                🚀 Pakai Sekarang
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DRow({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", gap: 12 }}>
      <span style={{ color: "#A1A1AA" }}>{label}</span>
      <span style={{ color: color || "#FAFAFA", fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}
