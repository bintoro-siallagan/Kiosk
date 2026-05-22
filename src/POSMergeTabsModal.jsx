import React, { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3011";
const fIDR = (n) => "Rp " + (n || 0).toLocaleString("id-ID");

export default function POSMergeTabsModal({ sourceTab, kasir, onClose, onSuccess }) {
  const [tabs, setTabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [targetId, setTargetId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadTabs();
  }, []);

  async function loadTabs() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/orders?limit=100`);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data.orders || []);
      const otherTabs = arr.filter(o =>
        o.status === "tab_open" && o.id !== sourceTab.id
      );
      otherTabs.sort((a, b) => (b.time || 0) - (a.time || 0));
      setTabs(otherTabs);
    } catch (e) {
      setError("Gagal memuat tab: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleMerge() {
    if (!targetId) {
      setError("Pilih target tab dulu");
      return;
    }

    const target = tabs.find(t => t.id === targetId);
    const totalAfter = (sourceTab.total || 0) + (target?.total || 0);
    const itemsAfter = (sourceTab.items?.length || 0) + (target?.items?.length || 0);

    if (!confirm(
      `Merge tab?\n\n` +
      `Tab #${sourceTab.id} (Meja ${sourceTab.table || '-'}) akan digabung ke Tab #${targetId} (Meja ${target?.table || '-'})\n\n` +
      `Hasil:\n` +
      `  Tab #${targetId} = ${itemsAfter} items, ${fIDR(totalAfter)}\n` +
      `  Tab #${sourceTab.id} akan di-cancel\n\n` +
      `Lanjut?`
    )) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/orders/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceIds: [sourceTab.id],
          targetId,
          mergedBy: kasir || "Unknown"
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Merge failed");
      onSuccess(data);
    } catch (e) {
      setError("Gagal: " + e.message);
      setSubmitting(false);
    }
  }

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.header}>
          <div>
            <div style={S.title}>Merge Tab</div>
            <div style={S.subtitle}>
              Pindahkan items Tab #{sourceTab.id} (Meja {sourceTab.table || '-'}) ke tab lain
            </div>
          </div>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>

        <div style={S.sourceBox}>
          <div style={S.sourceLabel}>SUMBER</div>
          <div style={S.sourceRow}>
            <div>
              <div style={S.sourceId}>#{sourceTab.id}</div>
              <div style={S.sourceMeta}>
                {sourceTab.type === "dine" ? "🍽️ Dine-in" : "🛍️ Take-away"}
                {sourceTab.table && sourceTab.table !== "-" && ` · Meja ${sourceTab.table}`}
              </div>
            </div>
            <div style={S.sourceTotal}>{fIDR(sourceTab.total)}</div>
          </div>
          <div style={S.sourceItems}>
            {(sourceTab.items || []).length} item · {sourceTab.customer_name || "tanpa nama"}
          </div>
        </div>

        <div style={S.arrow}>↓</div>

        <div style={S.targetSection}>
          <div style={S.sectionLabel}>TARGET (Pilih tab tujuan)</div>

          {loading && <div style={S.empty}>Memuat tabs...</div>}

          {!loading && tabs.length === 0 && (
            <div style={S.empty}>
              Tidak ada tab aktif lain untuk di-merge.<br/>
              <span style={S.emptyHint}>Buat tab baru dulu, atau pakai tab existing.</span>
            </div>
          )}

          {!loading && tabs.map(t => (
            <div
              key={t.id}
              onClick={() => setTargetId(t.id)}
              style={{
                ...S.targetCard,
                ...(targetId === t.id ? S.targetCardActive : {})
              }}
            >
              <div style={S.targetRow}>
                <div>
                  <div style={S.targetId}>#{t.id}</div>
                  <div style={S.targetMeta}>
                    {t.type === "dine" ? "🍽️ Dine-in" : "🛍️ Take-away"}
                    {t.table && t.table !== "-" && ` · Meja ${t.table}`}
                    {t.customer_name && ` · ${t.customer_name}`}
                  </div>
                </div>
                <div style={S.targetTotal}>{fIDR(t.total)}</div>
              </div>
              <div style={S.targetItems}>
                {(t.items || []).length} item
                {targetId === t.id && (
                  <span style={S.checkmark}> · ✓ Dipilih</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {error && <div style={S.error}>{error}</div>}

        <div style={S.footer}>
          <button onClick={onClose} style={S.btnSecondary} disabled={submitting}>
            Batal
          </button>
          <button
            onClick={handleMerge}
            style={S.btnPrimary}
            disabled={submitting || !targetId || tabs.length === 0}
          >
            {submitting ? "Memproses..." : `🔗 Merge ke #${targetId || '?'}`}
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
    zIndex: 1500, fontFamily: "'Inter', sans-serif",
    padding: 20,
  },
  modal: {
    width: "min(560px, 100%)", maxHeight: "90vh",
    background: "linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%)",
    border: "1px solid #2a2a2a", borderRadius: 16,
    display: "flex", flexDirection: "column", overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  },
  header: {
    padding: "20px 24px", borderBottom: "1px solid #2a2a2a",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  title: { fontFamily: "'Inter', sans-serif", fontSize: 28, color: "#F59E0B", letterSpacing: 1.5 },
  subtitle: { fontSize: 12, color: "#9CA3AF", marginTop: 4, lineHeight: 1.4 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
    color: "#F87171", fontSize: 16, cursor: "pointer",
  },
  sourceBox: {
    margin: "16px 20px", padding: "14px 16px", borderRadius: 12,
    background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)",
  },
  sourceLabel: { fontSize: 10, color: "#F59E0B", letterSpacing: 1.5, fontWeight: 700, marginBottom: 8 },
  sourceRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  sourceId: { fontFamily: "'Inter', sans-serif", fontSize: 22, color: "#F59E0B", letterSpacing: 1 },
  sourceMeta: { fontSize: 12, color: "#D1D5DB", marginTop: 2 },
  sourceTotal: { fontFamily: "'Inter', sans-serif", fontSize: 22, color: "white" },
  sourceItems: { fontSize: 11, color: "#9CA3AF", marginTop: 6 },
  arrow: { textAlign: "center", fontSize: 28, color: "#F59E0B", padding: "0 0 6px" },
  targetSection: { padding: "0 20px 16px", flex: 1, overflowY: "auto" },
  sectionLabel: { fontSize: 10, color: "#9CA3AF", letterSpacing: 1.5, fontWeight: 700, marginBottom: 10 },
  empty: { textAlign: "center", padding: "30px 20px", color: "#6B7280", fontSize: 13 },
  emptyHint: { fontSize: 11, color: "#4B5563" },
  targetCard: {
    padding: "12px 14px", marginBottom: 8, borderRadius: 12,
    background: "rgba(255,255,255,0.03)", border: "1px solid #2a2a2a",
    cursor: "pointer", transition: "all 0.15s",
  },
  targetCardActive: {
    background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.5)",
  },
  targetRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  targetId: { fontFamily: "'Inter', sans-serif", fontSize: 18, color: "#F59E0B", letterSpacing: 1 },
  targetMeta: { fontSize: 11, color: "#D1D5DB", marginTop: 2 },
  targetTotal: { fontFamily: "'Inter', sans-serif", fontSize: 18, color: "white" },
  targetItems: { fontSize: 11, color: "#9CA3AF", marginTop: 4 },
  checkmark: { color: "#10B981", fontWeight: 600 },
  error: { padding: "10px 20px", color: "#F87171", fontSize: 12 },
  footer: {
    padding: "14px 20px", borderTop: "1px solid #2a2a2a",
    display: "flex", gap: 10, justifyContent: "flex-end",
  },
  btnSecondary: {
    padding: "10px 20px", borderRadius: 10,
    background: "transparent", border: "1px solid #2a2a2a", color: "#9CA3AF",
    cursor: "pointer", fontFamily: "inherit", fontSize: 14,
  },
  btnPrimary: {
    padding: "10px 20px", borderRadius: 10,
    background: "linear-gradient(135deg, #F59E0B, #DC8B0B)",
    border: "none", color: "white",
    cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700,
  },
};
