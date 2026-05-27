import React, { useState, useEffect, useMemo } from "react";
import API_HOST from "../apiBase.js";

const BRAND = "var(--brand-primary,#FF6B35)";
const BG = "#0A0A0A";
const CARD = "#1A1A1A";
const BORDER = "#2A2A2A";
const TEXT = "#FAFAFA";
const SUB = "#A1A1AA";

const API = API_HOST;

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

function rupiah(n) {
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

function relTime(epoch) {
  const now = Date.now();
  const diff = now - epoch;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "Baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  if (hrs < 24) return `${hrs} jam lalu`;
  if (days < 7) return `${days} hari lalu`;
  return new Date(epoch).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric"
  });
}

function fullDate(epoch) {
  return new Date(epoch).toLocaleString("id-ID", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

const STATUS_META = {
  completed: { label: "Done", color: "#10B981", bg: "rgba(16,185,129,0.12)", emoji: "✓" },
  cancelled: { label: "Dibatalkan", color: "#EF4444", bg: "rgba(239,68,68,0.12)", emoji: "✕" },
  refunded: { label: "Refund Penuh", color: "#F97316", bg: "rgba(249,115,22,0.12)", emoji: "↻" },
  partial_refund: { label: "Refund Sebagian", color: "#F97316", bg: "rgba(249,115,22,0.12)", emoji: "↻" },
  waiting: { label: "Menunggu", color: "var(--brand-primary,#FF6B35)", bg: "rgba(245,158,11,0.12)", emoji: "⏳" },
  received: { label: "Diterima", color: "var(--brand-primary,#FF6B35)", bg: "rgba(245,158,11,0.12)", emoji: "📨" },
  preparing: { label: "Preparing", color: "#3B82F6", bg: "rgba(59,130,246,0.12)", emoji: "👨‍🍳" },
  in_progress: { label: "Preparing", color: "#3B82F6", bg: "rgba(59,130,246,0.12)", emoji: "👨‍🍳" },
  ready: { label: "Siap Diambil", color: "#10B981", bg: "rgba(16,185,129,0.12)", emoji: "🎉" },
};

function statusOf(s) {
  return STATUS_META[s] || { label: s || "—", color: SUB, bg: "rgba(255,255,255,0.06)", emoji: "•" };
}

const SOURCE_META = {
  customer_portal: { label: "KaryaOS", color: BRAND },
  kiosk: { label: "Kiosk", color: "#3B82F6" },
  pos: { label: "Cashier", color: "#8B5CF6" },
};

const ACTIVE_STATUSES = ["waiting", "received", "preparing", "in_progress", "ready"];

export default function FlowHistory({ session, addToCart, setScreen }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [detail, setDetail] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`${API}/api/orders`);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const all = await r.json();
      const mine = all
        .filter(o => {
          const sessPhone = session?.phone || session?._phoneLocal || session?.customerPhone;
          return matchPhone(o.customerPhone, sessPhone);
        })
        .sort((a, b) => b.time - a.time);
      setOrders(mine);
    } catch (e) {
      setErr(e.message || "Gagal load riwayat");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (filter === "active") return orders.filter(o => ACTIVE_STATUSES.includes(o.status));
    if (filter === "completed") return orders.filter(o => o.status === "completed");
    return orders;
  }, [orders, filter]);

  const stats = useMemo(() => ({
    total: orders.length,
    active: orders.filter(o => ACTIVE_STATUSES.includes(o.status)).length,
    spend: orders.filter(o => o.status === "completed").reduce((s, o) => s + (o.total || 0), 0)
  }), [orders]);

  function handleReorder(order) {
    (order.items || []).forEach(it => {
      const q = it.q || 1;
      const item = {
        id: it.id || `r${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        e: it.e,
        n: it.n,
        p: it.p,
      };
      for (let i = 0; i < q; i++) addToCart(item);
    });
    setDetail(null);
    setScreen("menu");
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
            RIWAYAT PESANAN
          </h1>
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding: "16px 20px" }}>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 16, display: "flex", justifyContent: "space-around" }}>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: BRAND, fontFamily: "'Inter', sans-serif", lineHeight: 1 }}>{stats.total}</div>
            <div style={{ fontSize: 11, color: SUB, marginTop: 4 }}>Total Pesanan</div>
          </div>
          <div style={{ width: 1, background: BORDER }} />
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: stats.active > 0 ? "#3B82F6" : SUB, fontFamily: "'Inter', sans-serif", lineHeight: 1 }}>{stats.active}</div>
            <div style={{ fontSize: 11, color: SUB, marginTop: 4 }}>Active</div>
          </div>
          <div style={{ width: 1, background: BORDER }} />
          <div style={{ textAlign: "center", flex: 1.4 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#10B981", lineHeight: 1 }}>{rupiah(stats.spend)}</div>
            <div style={{ fontSize: 11, color: SUB, marginTop: 4 }}>Subtotal</div>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ padding: "0 20px 12px", display: "flex", gap: 8, overflowX: "auto" }}>
        {[
          { id: "all", label: `Semua (${orders.length})` },
          { id: "active", label: `Aktif (${stats.active})` },
          { id: "completed", label: "Done" }
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
            Loading riwayat...
          </div>
        )}
        {err && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: 16, color: "#EF4444" }}>
            ⚠ {err}
            <button onClick={load} style={{ display: "block", marginTop: 8, background: "transparent", border: "1px solid #EF4444", color: "#EF4444", padding: "6px 12px", borderRadius: 8, cursor: "pointer" }}>
              Coba Lagi
            </button>
          </div>
        )}
        {!loading && !err && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 60, color: SUB }}>
            <div style={{ fontSize: 60, marginBottom: 16 }}>📦</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: TEXT }}>
              {filter === "all" ? "Belum ada pesanan" :
               filter === "active" ? "No orders aktif" : "Belum ada pesanan selesai"}
            </div>
            <div style={{ fontSize: 13 }}>Yuk mulai pesan!</div>
            {filter === "all" && (
              <button onClick={() => setScreen("menu")} style={{
                marginTop: 20, background: BRAND, color: "#000", border: "none",
                padding: "12px 24px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer"
              }}>Pesan Sekarang</button>
            )}
          </div>
        )}

        {!loading && !err && filtered.map(order => {
          const st = statusOf(order.status);
          const src = SOURCE_META[order.source];
          const isActive = ACTIVE_STATUSES.includes(order.status);
          const itemsPreview = (order.items || []).slice(0, 2);
          const moreCount = (order.items || []).length - 2;

          return (
            <button key={order.id} onClick={() => setDetail(order)} style={{
              display: "block", width: "100%", textAlign: "left", marginBottom: 10,
              background: CARD, border: `1px solid ${isActive ? "rgba(59,130,246,0.4)" : BORDER}`,
              borderRadius: 14, padding: 14, cursor: "pointer",
              boxShadow: isActive ? "0 0 0 2px rgba(59,130,246,0.15)" : "none"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, color: BRAND, letterSpacing: 0.5, lineHeight: 1 }}>
                    #{order.id}
                  </div>
                  <div style={{ fontSize: 11, color: SUB, marginTop: 4 }}>{relTime(order.time)}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <span style={{ background: st.bg, color: st.color, fontSize: 11, padding: "3px 8px", borderRadius: 6, fontWeight: 600, whiteSpace: "nowrap" }}>
                    {st.emoji} {st.label}
                  </span>
                  {src && (
                    <span style={{ fontSize: 10, color: src.color, fontWeight: 600, opacity: 0.8 }}>
                      via {src.label}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                {itemsPreview.map((it, i) => (
                  <div key={i} style={{ fontSize: 13, color: TEXT, marginBottom: 2 }}>
                    <span style={{ marginRight: 6 }}>{it.e}</span>
                    {it.q > 1 && <span style={{ color: SUB }}>{it.q}× </span>}
                    {it.n}
                  </div>
                ))}
                {moreCount > 0 && (
                  <div style={{ fontSize: 12, color: SUB, fontStyle: "italic" }}>+ {moreCount} item lagi</div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
                <span style={{ fontSize: 11, color: SUB }}>
                  {order.type === "dine" ? `🪑 Dine In · ${order.table}` : "📦 Bawa Pulang"}
                </span>
                <span style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>
                  {rupiah(order.total)}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Detail Modal */}
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

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 32, color: BRAND, lineHeight: 1 }}>
                    #{detail.id}
                  </div>
                  <div style={{ fontSize: 12, color: SUB, marginTop: 4 }}>{fullDate(detail.time)}</div>
                </div>
                <span style={{
                  background: statusOf(detail.status).bg, color: statusOf(detail.status).color,
                  fontSize: 12, padding: "5px 10px", borderRadius: 8, fontWeight: 700, whiteSpace: "nowrap"
                }}>
                  {statusOf(detail.status).emoji} {statusOf(detail.status).label}
                </span>
              </div>
            </div>

            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 13 }}>
              <Row label="Jenis" value={detail.type === "dine" ? `Dine In · ${detail.table}` : "Bawa Pulang"} />
              <Row label="Pembayaran" value={detail.pay} />
              {SOURCE_META[detail.source] && (
                <Row label="Channel" value={SOURCE_META[detail.source].label} />
              )}
              {detail.kasir && <Row label="Cashier" value={detail.kasir} />}
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: SUB, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Item ({detail.items?.length || 0})
              </div>
              {(detail.items || []).map((it, i) => (
                <div key={i} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        <span style={{ marginRight: 6 }}>{it.e}</span>
                        {it.n}
                      </div>
                      {it.q > 1 && (
                        <div style={{ fontSize: 12, color: SUB, marginTop: 4 }}>{it.q}× {rupiah(it.p)}</div>
                      )}
                      {it.addons?.toppings?.length > 0 && (
                        <div style={{ fontSize: 11, color: SUB, marginTop: 6, lineHeight: 1.4 }}>
                          + {it.addons.toppings.map(t => t.name).join(", ")}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginLeft: 12, whiteSpace: "nowrap" }}>
                      {rupiah((it.p || 0) * (it.q || 1) + (it.addonTotal || 0))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 13 }}>
              <Row label="Subtotal" value={rupiah(detail.subtotal)} />
              {detail.promoDiscount > 0 && (
                <Row label={`Promo${detail.promoCode ? ` (${detail.promoCode})` : ""}`} value={`-${rupiah(detail.promoDiscount)}`} valueColor="#10B981" />
              )}
              {detail.pointsDiscount > 0 && (
                <Row label={`Poin (${detail.pointsRedeemed})`} value={`-${rupiah(detail.pointsDiscount)}`} valueColor="#10B981" />
              )}
              {detail.refundedAmount > 0 && (
                <Row label="Refund" value={`-${rupiah(detail.refundedAmount)}`} valueColor="#F97316" />
              )}
              <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 8, paddingTop: 8 }}>
                <Row label="Total" value={rupiah(detail.total)} bold />
              </div>
              {detail.pointsEarned > 0 && (
                <div style={{ marginTop: 8, padding: 8, background: "rgba(245,158,11,0.1)", borderRadius: 6, textAlign: "center", fontSize: 12, color: BRAND, fontWeight: 600 }}>
                  +{detail.pointsEarned} poin diperoleh ⭐
                </div>
              )}
            </div>

            {detail.cancelReason && (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: "#EF4444", fontWeight: 700, marginBottom: 4 }}>ALASAN PEMBATALAN</div>
                <div style={{ fontSize: 13 }}>{detail.cancelReason}</div>
              </div>
            )}
            {detail.refundReason && (
              <div style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: 10, padding: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: "#F97316", fontWeight: 700, marginBottom: 4 }}>ALASAN REFUND</div>
                <div style={{ fontSize: 13 }}>{detail.refundReason}</div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button onClick={() => setDetail(null)} style={{
                flex: 1, background: "transparent", border: `1px solid ${BORDER}`,
                color: TEXT, padding: "14px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer"
              }}>Close</button>
              {detail.status === "completed" && (
                <button onClick={() => handleReorder(detail)} style={{
                  flex: 2, background: BRAND, border: "none",
                  color: "#000", padding: "14px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer"
                }}>🔄 Pesan Ulang</button>
              )}
              {ACTIVE_STATUSES.includes(detail.status) && (
                <button onClick={() => { load(); setDetail(null); }} style={{
                  flex: 2, background: "#3B82F6", border: "none",
                  color: "#fff", padding: "14px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer"
                }}>🔄 Refresh Status</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, valueColor, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", gap: 12 }}>
      <span style={{ color: "#A1A1AA" }}>{label}</span>
      <span style={{ color: valueColor || "#FAFAFA", fontWeight: bold ? 700 : 400, fontSize: bold ? 16 : 13, textAlign: "right" }}>{value}</span>
    </div>
  );
}
