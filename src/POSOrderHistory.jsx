import React, { useState, useEffect } from "react";
import { requireManagerPin } from "./components/ManagerPinGate.jsx";
import API_HOST from "./apiBase.js";

const API = API_HOST;

const STATUS_LABELS = {
  completed:      { label: "Done",          color: "#6B7280", bg: "rgba(107,114,128,0.15)", icon: "🏁" },
  cancelled:      { label: "Cancel",            color: "#F87171", bg: "rgba(248,113,113,0.15)", icon: "✕" },
  refunded:       { label: "Refund Penuh",     color: "#8B5CF6", bg: "rgba(139,92,246,0.15)", icon: "↩" },
  partial_refund: { label: "Refund Sebagian",  color: "#A78BFA", bg: "rgba(167,139,250,0.15)", icon: "½" },
  tab_open:       { label: "Tab Aktif",        color: "#10B981", bg: "rgba(16,185,129,0.15)", icon: "🟢" },
  preparing:      { label: "Diproses",         color: "#3B82F6", bg: "rgba(59,130,246,0.15)", icon: "👨‍🍳" },
  ready:          { label: "Siap",             color: "#10B981", bg: "rgba(16,185,129,0.15)", icon: "✅" },
  waiting:        { label: "Menunggu",         color: "#F59E0B", bg: "color-mix(in srgb, var(--brand-primary,#FF6B35) 15%, transparent)", icon: "⏳" },
};

const fIDR = (n) => "Rp " + (n || 0).toLocaleString("id-ID");

export default function POSOrderHistory({ onClose, kasir = "Manager" }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [refundTarget, setRefundTarget] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadOrders();
  }, []);

  async function loadOrders() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/orders?limit=100`);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data.orders || []);
      arr.sort((a, b) => (b.time || 0) - (a.time || 0));
      setOrders(arr);
    } catch (e) {
      console.error("Load orders failed:", e);
      showToast("Riwayat belum tersedia, mohon coba lagi", "error");
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg, type = "info") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // Cancel order — gated behind manager PIN (replaces the old reason-only modal)
  async function handleCancel(order) {
    const auth = await requireManagerPin({
      title: `Batalkan Order #${order.id}`,
      message: `Total ${fIDR(order.total)}. Order ditandai batal & tidak bisa di-undo — cash drawer perlu reconcile manual.`,
      requireReason: true,
    });
    if (!auth.ok) return;
    try {
      const res = await fetch(`${API}/api/orders/${order.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: auth.reason, cancelledBy: auth.manager_id, managerPin: auth.pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cancel failed");
      showToast("✓ Order dibatalkan", "success");
      loadOrders();
    } catch (e) {
      showToast("❌ Gagal: " + e.message, "error");
    }
  }

  // Filter logic
  const filteredOrders = orders.filter(o => {
    // Search filter
    if (search) {
      const q = search.toLowerCase();
      if (!o.id.toLowerCase().includes(q) &&
          !(o.customerName || "").toLowerCase().includes(q) &&
          !(o.kasir || "").toLowerCase().includes(q)) {
        return false;
      }
    }
    // Status filter
    if (filter === "active") return ["tab_open", "waiting", "preparing", "ready"].includes(o.status);
    if (filter === "completed") return o.status === "completed";
    if (filter === "cancelled") return o.status === "cancelled";
    if (filter === "refunded") return ["refunded", "partial_refund"].includes(o.status);
    return true; // all
  });

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={S.title}>Riwayat Pesanan</div>
            <div style={S.subtitle}>{filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}</div>
          </div>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>

        {/* Search + Filter */}
        <div style={S.controls}>
          <input
            type="text"
            placeholder="🔍 Cari ID, nama, atau kasir..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={S.search}
          />
          <div style={S.filterTabs}>
            {[
              { key: "all", label: "Semua" },
              { key: "active", label: "Active" },
              { key: "completed", label: "Done" },
              { key: "cancelled", label: "Cancel" },
              { key: "refunded", label: "Refund" },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                style={{
                  ...S.filterBtn,
                  ...(filter === t.key ? S.filterBtnActive : {})
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Order List */}
        <div style={S.list}>
          {loading && <div style={S.empty}>Memuat...</div>}
          {!loading && filteredOrders.length === 0 && (
            <div style={S.empty}>Tidak ada order yang cocok.</div>
          )}
          {!loading && filteredOrders.map(o => (
            <OrderRow
              key={o.id}
              order={o}
              onCancel={() => handleCancel(o)}
              onRefund={() => setRefundTarget(o)}
            />
          ))}
        </div>
      </div>

      {/* Refund Modal */}
      {refundTarget && (
        <RefundModal
          order={refundTarget}
          kasir={kasir}
          onClose={() => setRefundTarget(null)}
          onSuccess={() => {
            setRefundTarget(null);
            showToast("✓ Refund berhasil", "success");
            loadOrders();
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          ...S.toast,
          background: toast.type === "error" ? "#EF4444" : toast.type === "success" ? "#10B981" : "#3B82F6"
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function OrderRow({ order, onCancel, onRefund }) {
  const status = STATUS_LABELS[order.status] || { label: order.status, color: "#9CA3AF", bg: "rgba(156,163,175,0.15)" };
  const isCancelled = order.status === "cancelled";
  const isFullyRefunded = order.status === "refunded";
  const isVoid = isCancelled;
  const canCancel = !isCancelled && !isFullyRefunded && order.status !== "tab_open";
  const canRefund = !isCancelled && !isFullyRefunded;

  const itemsSummary = (order.items || [])
    .map(i => `${i.n}${i.q > 1 ? ` ×${i.q}` : ''}`)
    .join(', ');

  const timeStr = new Date(order.time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const totalDisplay = order.total || 0;
  const refundedAmount = order.refundedAmount || 0;
  const remaining = totalDisplay - refundedAmount;

  return (
    <div style={S.row}>
      <div style={S.rowMain}>
        <div style={S.rowHeader}>
          <span style={S.orderId}>#{order.id}</span>
          <span style={S.orderMeta}>{timeStr} · {order.kasir || 'Unknown'} · {order.type === 'dine-in' ? `Meja ${order.table}` : 'Bawa'}</span>
        </div>
        {order.customerName && (
          <div style={S.customer}>👤 {order.customerName}</div>
        )}
        <div style={S.items}>{itemsSummary || '(no items)'}</div>
        <div style={S.totalRow}>
          <span style={S.total}>{fIDR(totalDisplay)}</span>
          {refundedAmount > 0 && (
            <span style={S.refundedTag}>
              -{fIDR(refundedAmount)} refunded
            </span>
          )}
          <span style={{
            ...S.statusBadge,
            color: status.color,
            background: status.bg,
            border: `1px solid ${status.color}40`
          }}>
            {status.icon} {status.label}
          </span>
        </div>
        {order.cancelReason && (
          <div style={S.reason}>✕ {order.cancelReason} <span style={S.reasonBy}>· {order.cancelledBy}</span></div>
        )}
        {order.refundReason && (
          <div style={S.reason}>↩ {order.refundReason} <span style={S.reasonBy}>· {order.refundedBy}</span></div>
        )}
      </div>
      <div style={S.actions}>
        {canCancel && (
          <button onClick={onCancel} style={S.btnCancel}>
            ✕ Batalkan
          </button>
        )}
        {canRefund && (
          <button onClick={onRefund} style={S.btnRefund}>
            ↩ Refund {refundedAmount > 0 ? '(+)' : ''}
          </button>
        )}
        {!canCancel && !canRefund && (
          <span style={S.lockedTag}>🔒 Final</span>
        )}
      </div>
    </div>
  );
}

function RefundModal({ order, kasir, onClose, onSuccess }) {
  const total = order.total || 0;
  const alreadyRefunded = order.refundedAmount || 0;
  const maxRefundable = total - alreadyRefunded;

  const [amount, setAmount] = useState(maxRefundable.toString());
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const amountNum = parseInt(amount) || 0;
  const isFullRefund = amountNum >= maxRefundable;
  const isValid = amountNum > 0 && amountNum <= maxRefundable && reason.trim();

  async function handleConfirm() {
    if (!isValid) {
      alert("Cek amount dan alasan");
      return;
    }
    const auth = await requireManagerPin({
      title: `Refund Order #${order.id}`,
      message: `${isFullRefund ? 'Refund PENUH' : 'Refund sebagian'} ${fIDR(amountNum)}` +
               `${isFullRefund ? '' : ` · sisa ${fIDR(maxRefundable - amountNum)}`}.`,
    });
    if (!auth.ok) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/orders/${order.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountNum,
          reason: reason.trim(),
          refundedBy: auth.manager_id,
          fullRefund: isFullRefund,
          managerPin: auth.pin
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refund failed");
      onSuccess();
    } catch (e) {
      alert("❌ Gagal: " + e.message);
      setSubmitting(false);
    }
  }

  function setPercent(p) {
    setAmount(Math.round(maxRefundable * p / 100).toString());
  }

  return (
    <div style={S.modalOverlay}>
      <div style={S.actionModal}>
        <div style={S.actionHeader}>
          <span style={{fontSize: 24}}>↩</span>
          <div>
            <div style={S.actionTitle}>Refund Order</div>
            <div style={S.actionSub}>#{order.id} · {fIDR(total)}</div>
          </div>
        </div>

        <div style={S.actionBody}>
          {alreadyRefunded > 0 && (
            <div style={S.refundInfo}>
              Sudah di-refund: <strong>{fIDR(alreadyRefunded)}</strong><br/>
              Bisa di-refund lagi: <strong>{fIDR(maxRefundable)}</strong>
            </div>
          )}

          <label style={S.label}>
            Jumlah refund <span style={{color: "#F87171"}}>*</span>
          </label>
          <div style={S.amountRow}>
            <span style={S.amountPrefix}>Rp</span>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min={0}
              max={maxRefundable}
              style={S.amountInput}
              autoFocus
            />
          </div>

          <div style={S.quickButtons}>
            {[25, 50, 75, 100].map(p => (
              <button key={p} onClick={() => setPercent(p)} style={S.quickBtn}>
                {p}%
              </button>
            ))}
          </div>

          {amountNum > maxRefundable && (
            <div style={S.error}>❌ Melebihi maksimum ({fIDR(maxRefundable)})</div>
          )}

          {isFullRefund && (
            <div style={S.fullRefundTag}>✓ Akan jadi refund PENUH (status: refunded)</div>
          )}

          <label style={{...S.label, marginTop: 16}}>
            Alasan refund <span style={{color: "#F87171"}}>*</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Contoh: Item rusak, salah pesan, customer komplain..."
            style={S.textarea}
            rows={3}
          />

          <div style={S.kasirInfo}>
            Yang refund: <strong>{kasir}</strong>
          </div>
        </div>

        <div style={S.actionFooter}>
          <button onClick={onClose} style={S.btnSecondary} disabled={submitting}>
            Tidak Jadi
          </button>
          <button
            onClick={handleConfirm}
            style={S.btnDanger}
            disabled={submitting || !isValid}
          >
            {submitting ? "Memproses..." : `Refund ${fIDR(amountNum)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000, fontFamily: "'Inter', sans-serif",
  },
  modal: {
    width: "min(900px, 95vw)", maxHeight: "92vh",
    background: "linear-gradient(180deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.008) 100%)",
    border: "1px solid #2a2a2a", borderRadius: 16,
    display: "flex", flexDirection: "column", overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  },
  header: {
    padding: "20px 24px", borderBottom: "1px solid #2a2a2a",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  title: { fontFamily: "'Inter', sans-serif", fontSize: 32, color: "#F59E0B", letterSpacing: 1.5 },
  subtitle: { fontSize: 13, color: "#9CA3AF", marginTop: 2 },
  closeBtn: {
    width: 40, height: 40, borderRadius: 12,
    background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
    color: "#F87171", fontSize: 18, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  controls: { padding: "16px 24px", borderBottom: "1px solid #2a2a2a", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" },
  search: {
    flex: 1, minWidth: 200, padding: "10px 14px", borderRadius: 10,
    background: "rgba(13,17,23,0.7)", border: "1px solid #2a2a2a", color: "white",
    fontSize: 14, outline: "none", fontFamily: "inherit",
  },
  filterTabs: { display: "flex", gap: 6 },
  filterBtn: {
    padding: "8px 14px", borderRadius: 8, fontSize: 13,
    background: "transparent", border: "1px solid #2a2a2a", color: "#9CA3AF",
    cursor: "pointer", fontFamily: "inherit",
  },
  filterBtnActive: {
    background: "color-mix(in srgb, var(--brand-primary,#FF6B35) 15%, transparent)", border: "1px solid #F59E0B", color: "#F59E0B",
  },
  list: { flex: 1, overflowY: "auto", padding: "8px 24px 24px" },
  empty: { textAlign: "center", padding: "40px 20px", color: "#6B7280", fontSize: 14 },
  row: {
    padding: "16px", marginBottom: 8, borderRadius: 12,
    background: "rgba(255,255,255,0.02)", border: "1px solid #2a2a2a",
    display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap",
  },
  rowMain: { flex: 1, minWidth: 280 },
  rowHeader: { display: "flex", gap: 12, alignItems: "baseline", marginBottom: 4, flexWrap: "wrap" },
  orderId: { fontFamily: "'Inter', sans-serif", fontSize: 22, color: "#F59E0B", letterSpacing: 1 },
  orderMeta: { fontSize: 12, color: "#6B7280" },
  customer: { fontSize: 13, color: "#A78BFA", marginBottom: 4 },
  items: { fontSize: 13, color: "#D1D5DB", marginBottom: 8, lineHeight: 1.4 },
  totalRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  total: { fontFamily: "'Inter', sans-serif", fontSize: 26, color: "#F59E0B" },
  refundedTag: { fontSize: 11, color: "#A78BFA", padding: "2px 8px", background: "rgba(167,139,250,0.1)", borderRadius: 6 },
  statusBadge: { fontSize: 11, padding: "4px 10px", borderRadius: 6, fontWeight: 600 },
  reason: { fontSize: 12, color: "#9CA3AF", marginTop: 6, fontStyle: "italic" },
  reasonBy: { color: "#6B7280" },
  actions: { display: "flex", flexDirection: "column", gap: 6, minWidth: 120 },
  btnCancel: {
    padding: "8px 14px", borderRadius: 8, fontSize: 12,
    background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
    color: "#F87171", cursor: "pointer", fontFamily: "inherit",
  },
  btnRefund: {
    padding: "8px 14px", borderRadius: 8, fontSize: 12,
    background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.3)",
    color: "#A78BFA", cursor: "pointer", fontFamily: "inherit",
  },
  lockedTag: { fontSize: 11, color: "#6B7280", textAlign: "center", padding: "8px 14px" },
  // Action modal
  modalOverlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1100,
  },
  actionModal: {
    width: "min(500px, 95vw)",
    background: "rgba(255,255,255,0.025)", border: "1px solid #2a2a2a", borderRadius: 16,
    display: "flex", flexDirection: "column", overflow: "hidden",
  },
  actionHeader: {
    padding: "20px 24px", borderBottom: "1px solid #2a2a2a",
    display: "flex", gap: 16, alignItems: "center",
  },
  actionTitle: { fontFamily: "'Inter', sans-serif", fontSize: 24, color: "white", letterSpacing: 1 },
  actionSub: { fontSize: 13, color: "#9CA3AF" },
  actionBody: { padding: "20px 24px", maxHeight: "60vh", overflowY: "auto" },
  actionWarning: {
    padding: "12px 14px", borderRadius: 10, marginBottom: 16,
    background: "color-mix(in srgb, var(--brand-primary,#FF6B35) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--brand-primary,#FF6B35) 30%, transparent)",
    color: "#FCD34D", fontSize: 13, lineHeight: 1.5,
  },
  refundInfo: {
    padding: "12px 14px", borderRadius: 10, marginBottom: 16,
    background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.3)",
    color: "#C4B5FD", fontSize: 13, lineHeight: 1.5,
  },
  label: { fontSize: 13, color: "#9CA3AF", marginBottom: 6, display: "block" },
  textarea: {
    width: "100%", padding: "10px 14px", borderRadius: 10,
    background: "rgba(13,17,23,0.7)", border: "1px solid #2a2a2a", color: "white",
    fontSize: 14, fontFamily: "inherit", resize: "vertical", outline: "none",
  },
  amountRow: { display: "flex", gap: 0, marginBottom: 10 },
  amountPrefix: {
    padding: "12px 14px", background: "rgba(13,17,23,0.7)",
    border: "1px solid #2a2a2a", borderRight: "none", borderRadius: "10px 0 0 10px",
    color: "#9CA3AF", fontSize: 14,
  },
  amountInput: {
    flex: 1, padding: "12px 14px", borderRadius: "0 10px 10px 0",
    background: "rgba(13,17,23,0.7)", border: "1px solid #2a2a2a", color: "white",
    fontSize: 18, fontFamily: "'Inter', sans-serif", letterSpacing: 1, outline: "none",
  },
  quickButtons: { display: "flex", gap: 6, marginBottom: 10 },
  quickBtn: {
    flex: 1, padding: "8px", borderRadius: 8,
    background: "transparent", border: "1px solid #2a2a2a", color: "#9CA3AF",
    cursor: "pointer", fontSize: 12, fontFamily: "inherit",
  },
  error: { fontSize: 12, color: "#F87171", marginTop: 4 },
  fullRefundTag: { fontSize: 12, color: "#A78BFA", marginTop: 4 },
  kasirInfo: { marginTop: 12, fontSize: 12, color: "#9CA3AF" },
  actionFooter: {
    padding: "16px 24px", borderTop: "1px solid #2a2a2a",
    display: "flex", gap: 10, justifyContent: "flex-end",
  },
  btnSecondary: {
    padding: "10px 20px", borderRadius: 10,
    background: "transparent", border: "1px solid #2a2a2a", color: "#9CA3AF",
    cursor: "pointer", fontFamily: "inherit", fontSize: 14,
  },
  btnDanger: {
    padding: "10px 20px", borderRadius: 10,
    background: "linear-gradient(135deg, #F87171, #DC2626)",
    border: "none", color: "white",
    cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 600,
  },
  toast: {
    position: "fixed", top: 20, right: 20,
    padding: "12px 20px", borderRadius: 10,
    color: "white", fontSize: 14, fontWeight: 600,
    boxShadow: "0 8px 24px rgba(0,0,0,0.3)", zIndex: 2000,
    fontFamily: "inherit",
  },
};
