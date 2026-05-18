import React, { useState, useEffect, useMemo } from "react";

const BRAND = "#F59E0B";
const BG = "#0A0A0A";
const CARD = "#1A1A1A";
const BORDER = "#2A2A2A";
const TEXT = "#FAFAFA";
const SUB = "#A1A1AA";

const API = typeof window !== "undefined"
  ? `${window.location.protocol}//${window.location.hostname}:3011`
  : "";

// Default loyalty config (overridden by API if available)
const DEFAULT_CFG = {
  enabled: true,
  earnRate: 1000,       // 1pt per Rp 1000 spend
  redeemRate: 100,      // 100pt per Rp 1000 discount
  maxRedeemPercent: 50, // max 50% of subtotal
};

function rupiah(n) {
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

function phoneVariants(phone) {
  if (!phone) return [];
  const clean = String(phone).replace(/\D/g, "");
  const v = [clean];
  if (clean.startsWith("0")) v.push("62" + clean.slice(1));
  else if (clean.startsWith("62")) v.push("0" + clean.slice(2));
  return v;
}

function matchPhone(orderPhone, sessionPhone) {
  if (!orderPhone || !sessionPhone) return false;
  const oc = String(orderPhone).replace(/\D/g, "");
  const variants = phoneVariants(sessionPhone);
  return variants.some(v => oc === v || (v.length >= 9 && oc.endsWith(v.slice(-9))));
}

export default function FlowRedeem({ session, setPointsToRedeem, setScreen }) {
  const [config, setConfig] = useState(DEFAULT_CFG);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState(session?.points || 0);
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/loyalty/config`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API}/api/orders`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/api/customers`).then(r => r.ok ? r.json() : []),
    ]).then(([cfg, allOrders, custList]) => {
      if (cfg && typeof cfg === "object") {
        setConfig({ ...DEFAULT_CFG, ...cfg });
      }
      // Find latest customer record (might have updated points)
      const sessPhone = session?.phone || session?._phoneLocal;
      const cust = Array.isArray(custList)
        ? custList.find(c => matchPhone(c.phone, sessPhone))
        : null;
      if (cust && typeof cust.points === "number") setPoints(cust.points);

      // Filter orders for this customer
      const mine = (Array.isArray(allOrders) ? allOrders : [])
        .filter(o => matchPhone(o.customerPhone, sessPhone))
        .filter(o => (o.pointsEarned || 0) > 0 || (o.pointsRedeemed || 0) > 0)
        .sort((a, b) => b.time - a.time);
      setOrders(mine);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [session]);

  // Stats from history
  const stats = useMemo(() => {
    const earned = orders.reduce((s, o) => s + (o.pointsEarned || 0), 0);
    const redeemed = orders.reduce((s, o) => s + (o.pointsRedeemed || 0), 0);
    return { earned, redeemed };
  }, [orders]);

  // Calculator: poin → rupiah
  const rupiahValue = useMemo(() => {
    return Math.floor(amount / config.redeemRate) * 1000;
  }, [amount, config]);

  // Max redeemable (no cart context here, just balance)
  const maxRedeem = useMemo(() => {
    return Math.floor(points / config.redeemRate) * config.redeemRate;
  }, [points, config]);

  // Tier
  const tags = Array.isArray(session?.tags) ? session.tags : [];
  const tier = tags.includes("vip") ? "vip" : tags.includes("member") ? "member" : "guest";
  const tierInfo = {
    vip: { label: "🌟 VIP", color: "#F59E0B" },
    member: { label: "🎫 Member", color: "#10B981" },
    guest: { label: "👤 Guest", color: "#A1A1AA" },
  }[tier];

  function handleApply() {
    if (amount < config.redeemRate) return;
    if (amount > maxRedeem) return;
    setPointsToRedeem(amount);
    setScreen("menu");
  }

  function quickPick(pct) {
    const target = Math.floor(maxRedeem * pct / 100 / config.redeemRate) * config.redeemRate;
    setAmount(target);
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
          <h1 style={{ margin: 0, fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: BRAND, letterSpacing: 1 }}>
            TUKAR POIN
          </h1>
        </div>
      </div>

      <div style={{ padding: 20 }}>
        {/* Big points display */}
        <div style={{
          background: `linear-gradient(135deg, ${BRAND}25 0%, ${BRAND}08 100%)`,
          border: `1px solid ${BRAND}50`,
          borderRadius: 20, padding: 24, textAlign: "center", marginBottom: 16
        }}>
          <div style={{ fontSize: 11, color: BRAND, fontWeight: 700, letterSpacing: 2, marginBottom: 8 }}>
            POIN KAMU
          </div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 72, color: BRAND, lineHeight: 1 }}>
            {points.toLocaleString("id-ID")}
          </div>
          <div style={{ fontSize: 13, color: SUB, marginTop: 6 }}>
            ≈ {rupiah(Math.floor(points / config.redeemRate) * 1000)} potongan
          </div>
          <div style={{ marginTop: 12, display: "inline-block", padding: "4px 12px", borderRadius: 999, background: tierInfo.color + "20", color: tierInfo.color, fontSize: 12, fontWeight: 700 }}>
            {tierInfo.label}
          </div>
        </div>

        {/* Stats */}
        {!loading && (stats.earned > 0 || stats.redeemed > 0) && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14, marginBottom: 16, display: "flex", justifyContent: "space-around" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: SUB }}>Total Diperoleh</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#10B981" }}>+{stats.earned.toLocaleString("id-ID")}</div>
            </div>
            <div style={{ width: 1, background: BORDER }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: SUB }}>Total Ditukar</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#F97316" }}>-{stats.redeemed.toLocaleString("id-ID")}</div>
            </div>
          </div>
        )}

        {/* Calculator */}
        {maxRedeem >= config.redeemRate ? (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: SUB, marginBottom: 12, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase" }}>
              Kalkulator Penukaran
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: SUB, marginBottom: 6 }}>
                Jumlah poin (kelipatan {config.redeemRate}, max {maxRedeem.toLocaleString("id-ID")})
              </div>
              <input
                type="number"
                value={amount || ""}
                onChange={e => {
                  const v = parseInt(e.target.value) || 0;
                  const rounded = Math.floor(v / config.redeemRate) * config.redeemRate;
                  setAmount(Math.min(rounded, maxRedeem));
                }}
                placeholder={`Min ${config.redeemRate}`}
                style={{
                  width: "100%", padding: "12px 14px", background: BG, border: `1px solid ${BORDER}`,
                  borderRadius: 10, color: TEXT, fontSize: 18, outline: "none", fontWeight: 700
                }}
              />
            </div>

            {/* Quick picks */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {[25, 50, 75, 100].map(pct => (
                <button key={pct} onClick={() => quickPick(pct)} style={{
                  flex: 1, padding: "8px 4px", borderRadius: 8,
                  border: `1px solid ${BORDER}`, background: "transparent",
                  color: TEXT, fontSize: 11, fontWeight: 600, cursor: "pointer"
                }}>{pct}%</button>
              ))}
            </div>

            {/* Conversion */}
            <div style={{
              background: BG, border: `1px solid ${BORDER}`, borderRadius: 10,
              padding: 12, textAlign: "center"
            }}>
              <div style={{ fontSize: 11, color: SUB }}>Setara potongan</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: BRAND, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>
                {rupiah(rupiahValue)}
              </div>
              <div style={{ fontSize: 10, color: SUB, marginTop: 4 }}>
                {config.redeemRate} poin = Rp 1.000
              </div>
            </div>

            <button
              onClick={handleApply}
              disabled={amount < config.redeemRate}
              style={{
                width: "100%", marginTop: 14, padding: "14px", borderRadius: 12,
                background: amount >= config.redeemRate ? BRAND : "#374151",
                border: "none", color: amount >= config.redeemRate ? "#000" : SUB,
                fontSize: 14, fontWeight: 800, cursor: amount >= config.redeemRate ? "pointer" : "not-allowed"
              }}
            >
              🚀 Pakai di Pesanan Berikutnya
            </button>
            <div style={{ fontSize: 10, color: SUB, marginTop: 6, textAlign: "center" }}>
              💡 Diskon akan otomatis diterapkan saat checkout
            </div>
          </div>
        ) : (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20, marginBottom: 16, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Poin belum cukup buat ditukar</div>
            <div style={{ fontSize: 12, color: SUB, lineHeight: 1.5 }}>
              Butuh minimal <b style={{ color: BRAND }}>{config.redeemRate} poin</b> = Rp 1.000<br />
              Kamu masih kurang <b style={{ color: BRAND }}>{Math.max(0, config.redeemRate - points)} poin</b>
            </div>
            <button onClick={() => setScreen("menu")} style={{
              marginTop: 16, background: BRAND, color: "#000", border: "none",
              padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer"
            }}>Pesan Lagi →</button>
          </div>
        )}

        {/* How it works */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: SUB, marginBottom: 10, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase" }}>
            Cara Kerja
          </div>
          <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.6 }}>
            <div style={{ marginBottom: 6 }}>💰 Belanja Rp {config.earnRate.toLocaleString("id-ID")} = 1 poin</div>
            <div style={{ marginBottom: 6 }}>🎁 {config.redeemRate} poin = Rp 1.000 potongan</div>
            <div>📊 Max pakai poin: {config.maxRedeemPercent}% dari total pesanan</div>
          </div>
        </div>

        {/* History */}
        {orders.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: SUB, marginBottom: 8, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase", padding: "0 4px" }}>
              Riwayat Poin
            </div>
            {orders.slice(0, 10).map(o => (
              <div key={o.id} style={{
                background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
                padding: 12, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center"
              }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>#{o.id}</div>
                  <div style={{ fontSize: 10, color: SUB }}>
                    {new Date(o.time).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {o.pointsEarned > 0 && (
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#10B981" }}>+{o.pointsEarned}</div>
                  )}
                  {o.pointsRedeemed > 0 && (
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#F97316" }}>-{o.pointsRedeemed}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
