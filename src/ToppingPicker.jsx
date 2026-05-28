import { useState, useMemo } from 'react';
import * as audio from "./audio.js";
import { useMenu } from './MenuContext.jsx';

/**
 * ToppingPicker — fullscreen overlay untuk pilih topping froyo.
 *
 * Muncul saat customer klik item yang punya freeToppings > 0.
 * Setelah pilih topping → klik "Add" → callback onConfirm dipanggil.
 *
 * Props:
 *   item      : menu item object dari menuData.js { id, name, emoji, price, freeToppings, desc }
 *   onConfirm : (item, selectedToppings[], addonCost) => void
 *   onClose   : () => void
 */

export default function ToppingPicker({ item, onConfirm, onClose }) {
  const { toppings: TOPPINGS, extraToppingPrice: EXTRA_TOPPING_PRICE } = useMenu();
  const [selected, setSelected] = useState([]);
  const [activeGroup, setActiveGroup] = useState('all');

  const freeCount = item?.freeToppings || 0;

  // Group toppings
  const groups = useMemo(() => {
    const map = {};
    TOPPINGS.forEach(t => {
      if (!map[t.group]) map[t.group] = [];
      map[t.group].push(t);
    });
    return Object.entries(map).map(([name, items]) => ({ name, items }));
  }, []);

  // Toggle topping selection
  const toggle = (topping) => {
    audio.playClick();
    setSelected(prev => {
      const exists = prev.find(s => s.id === topping.id);
      if (exists) return prev.filter(s => s.id !== topping.id);
      return [...prev, topping];
    });
  };

  const isSelected = (id) => selected.some(s => s.id === id);

  // Calculate cost
  const addonCost = useMemo(() => {
    let cost = 0;
    selected.forEach((t, idx) => {
      if (idx < freeCount) {
        // Within free quota — only premium surcharge
        cost += t.price || 0;
      } else {
        // Beyond quota — extra topping fee + premium surcharge
        cost += EXTRA_TOPPING_PRICE + (t.price || 0);
      }
    });
    return cost;
  }, [selected, freeCount]);

  const totalPrice = (item?.price || 0) + addonCost;
  const freeUsed = Math.min(selected.length, freeCount);
  const extraCount = Math.max(0, selected.length - freeCount);

  // Filter by group
  const visibleToppings = activeGroup === 'all'
    ? TOPPINGS
    : TOPPINGS.filter(t => t.group === activeGroup);

  const handleConfirm = () => {
    audio.playConfirm();
    onConfirm(item, selected, addonCost);
  };

  // Quick-add: skip toppings, langsung tambah item polos (1 tap saving)
  const handleSkipAdd = () => {
    audio.playConfirm();
    onConfirm(item, [], 0);
  };

  if (!item) return null;

  return (
    <div style={S.overlay} onClick={onClose}>
      <style>{`@keyframes tpSlideUp{from{transform:translateY(30px) scale(.97);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}`}</style>
      <div className="lg" style={S.panel} onClick={e => e.stopPropagation()}>

        {/* ── HEADER ──────────────────────── */}
        <div style={S.header}>
          <div style={S.headerLeft}>
            <span style={S.itemEmoji}>{item.emoji}</span>
            <div>
              <div style={S.itemName}>{item.name}</div>
              {item.desc && <div style={S.itemDesc}>{item.desc}</div>}
            </div>
          </div>
          <div style={S.basePrice}>Rp {item.price.toLocaleString('id-ID')}</div>
        </div>

        {/* ── PROGRESS BAR ────────────────── */}
        <div style={S.progressSection}>
          <div style={S.progressLabel}>
            <span>{freeUsed}/{freeCount} free toppings selected</span>
            {extraCount > 0 && (
              <span style={S.extraBadge}>+{extraCount} extra · Rp {(extraCount * EXTRA_TOPPING_PRICE).toLocaleString('id-ID')}</span>
            )}
          </div>
          <div style={S.progressTrack}>
            <div
              style={{
                ...S.progressFill,
                width: `${Math.min(100, (selected.length / Math.max(freeCount, 1)) * 100)}%`,
                background: selected.length > freeCount ? '#F59E0B' : 'linear-gradient(90deg,var(--brand-primary,#FF6B35),var(--brand-secondary,#E55A2B))',
              }}
            />
          </div>
        </div>

        {/* ── GROUP TABS ──────────────────── */}
        <div style={S.tabs}>
          {[{ name: 'all', label: 'All' }, ...groups.map(g => ({ name: g.name, label: g.name }))].map(tab => (
            <button
              key={tab.name}
              style={{
                ...S.tab,
                ...(activeGroup === tab.name ? S.tabActive : {}),
              }}
              onClick={() => setActiveGroup(tab.name)}
            >
              {tab.label}
              {tab.name !== 'all' && activeGroup !== tab.name && (
                <span style={S.tabCount}>
                  {selected.filter(s => s.group === tab.name).length || ''}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── TOPPING GRID ────────────────── */}
        <div style={S.grid}>
          {visibleToppings.map(t => {
            const sel = isSelected(t.id);
            const idx = selected.findIndex(s => s.id === t.id);
            const isFree = idx >= 0 && idx < freeCount;
            const isPremium = t.price > 0;

            return (
              <button
                key={t.id}
                style={{
                  ...S.toppingBtn,
                  ...(sel ? S.toppingSelected : {}),
                }}
                onClick={() => toggle(t)}
              >
                <div style={S.toppingName}>{t.name}</div>
                <div style={S.toppingMeta}>
                  {isPremium && <span style={S.premiumTag}>+Rp {t.price.toLocaleString('id-ID')}</span>}
                  {sel && isFree && <span style={S.freeTag}>Free</span>}
                  {sel && !isFree && <span style={S.extraTag}>Extra</span>}
                </div>
                {sel && <div style={S.checkCircle}>✓</div>}
              </button>
            );
          })}
        </div>

        {/* ── SELECTED SUMMARY ────────────── */}
        {selected.length > 0 && (
          <div style={S.selectedBar}>
            {selected.map((t, i) => (
              <span
                key={t.id}
                style={{
                  ...S.selectedChip,
                  background: i < freeCount ? 'color-mix(in srgb,var(--brand-primary,#FF6B35) 14%,transparent)' : 'rgba(245,158,11,0.15)',
                  borderColor: i < freeCount ? 'color-mix(in srgb,var(--brand-primary,#FF6B35) 45%,transparent)' : 'rgba(245,158,11,0.45)',
                }}
                onClick={() => toggle(t)}
              >
                {t.name} ✕
              </span>
            ))}
          </div>
        )}

        {/* ── FOOTER / CTA — min-tap optimized ────────────────── */}
        <div style={S.footer}>
          <button style={S.cancelBtn} onClick={onClose}>
            Cancel
          </button>

          {/* Skip-Add Quick action — kalau user gak mau topping, 1 tap done */}
          {selected.length === 0 && (
            <button onClick={handleSkipAdd} style={{
              padding: "12px 18px", borderRadius: 12,
              background: "rgba(255,255,255,0.05)",
              border: "1.5px solid rgba(255,255,255,0.15)",
              color: "rgba(255,255,255,0.85)",
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
              letterSpacing: 0.2, transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}>
              Skip Topping → Add
            </button>
          )}

          <div style={S.priceBreakdown}>
            {addonCost > 0 && (
              <div style={S.addonLine}>
                Toppings +Rp {addonCost.toLocaleString('id-ID')}
              </div>
            )}
            <div style={S.totalLine}>
              Rp {totalPrice.toLocaleString('id-ID')}
            </div>
          </div>

          <button className="lg lg-brand order-pill" style={S.confirmBtn} onClick={handleConfirm}>
            {selected.length > 0 ? `Add ${selected.length} Topping${selected.length > 1 ? "s" : ""}` : "Add to Cart"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STYLES — Apple-feel liquid glass, brand-color aware via CSS var
// ============================================================
const FONT = "'Inter',sans-serif";
const S = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    fontFamily: FONT,
  },
  // Inline glass — works in any context (POS/Kiosk/Flow) without depending on .lg class CSS
  panel: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '95vh',
    borderRadius: 28,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'tpSlideUp 0.35s cubic-bezier(.2,.8,.2,1)',
    background: 'linear-gradient(180deg, rgba(40,44,58,0.92) 0%, rgba(20,22,32,0.95) 100%)',
    backdropFilter: 'blur(40px) saturate(200%)',
    WebkitBackdropFilter: 'blur(40px) saturate(200%)',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 24px 60px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.32)',
  },

  // Header
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    minWidth: 0,
    flex: 1,
  },
  itemEmoji: {
    fontSize: 38,
    filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))',
  },
  itemName: {
    fontSize: 18,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.95)',
    letterSpacing: '-0.4px',
    fontFamily: FONT,
  },
  itemDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 3,
    fontFamily: FONT,
  },
  basePrice: {
    fontSize: 16,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.7)',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.2px',
    fontFamily: FONT,
  },

  // Progress
  progressSection: {
    padding: '14px 24px 8px',
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 7,
    fontFamily: FONT,
  },
  extraBadge: {
    color: '#F59E0B',
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    background: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.3s cubic-bezier(.2,.8,.2,1), background 0.2s',
  },

  // Tabs
  tabs: {
    display: 'flex',
    gap: 6,
    padding: '10px 24px 6px',
    overflowX: 'auto',
  },
  tab: {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.025)',
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontFamily: FONT,
    letterSpacing: '-0.1px',
    transition: 'all 0.18s ease',
  },
  tabActive: {
    background: 'linear-gradient(180deg,var(--brand-primary,#FF6B35),var(--brand-secondary,#E55A2B))',
    color: '#fff',
    borderColor: 'rgba(255,255,255,0.16)',
    fontWeight: 600,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 12px color-mix(in srgb,var(--brand-primary,#FF6B35) 32%,transparent)',
  },
  tabCount: {
    fontSize: 10,
    background: 'color-mix(in srgb,var(--brand-primary,#FF6B35) 25%,transparent)',
    borderRadius: 99,
    padding: '1px 5px',
    minWidth: 14,
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
  },

  // Grid
  grid: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 24px 16px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 10,
    alignContent: 'start',
  },
  // BIG TAP TARGET — finger-friendly utk rush hour (min 80px height)
  toppingBtn: {
    position: 'relative',
    padding: '18px 14px',
    borderRadius: 14,
    border: '1.5px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    color: 'rgba(255,255,255,0.92)',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.18s cubic-bezier(.2,.8,.2,1)',
    minHeight: 80,
    fontFamily: FONT,
    fontSize: 14,
  },
  // SELECTED — dramatic brand glow + scale boost
  toppingSelected: {
    background: 'linear-gradient(135deg, color-mix(in srgb,var(--brand-primary,#FF6B35) 20%,rgba(255,255,255,0.03)), color-mix(in srgb,var(--brand-primary,#FF6B35) 8%,transparent))',
    border: '1.5px solid color-mix(in srgb,var(--brand-primary,#FF6B35) 70%,transparent)',
    color: '#fff',
    boxShadow: '0 4px 14px color-mix(in srgb,var(--brand-primary,#FF6B35) 35%,transparent), inset 0 1px 0 rgba(255,255,255,0.15)',
    transform: 'scale(1.02)',
  },
  toppingName: {
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 5,
    letterSpacing: '-0.1px',
  },
  toppingMeta: {
    display: 'flex',
    gap: 5,
    flexWrap: 'wrap',
  },
  premiumTag: {
    fontSize: 10,
    padding: '2px 7px',
    borderRadius: 6,
    background: 'rgba(245,158,11,0.14)',
    color: '#F59E0B',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.1px',
  },
  freeTag: {
    fontSize: 10,
    padding: '2px 7px',
    borderRadius: 6,
    background: 'rgba(52,211,153,0.16)',
    color: '#34D399',
    fontWeight: 600,
    letterSpacing: '-0.1px',
  },
  extraTag: {
    fontSize: 10,
    padding: '2px 7px',
    borderRadius: 6,
    background: 'rgba(245,158,11,0.14)',
    color: '#F59E0B',
    fontWeight: 600,
    letterSpacing: '-0.1px',
  },
  checkCircle: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    background: 'linear-gradient(180deg,var(--brand-primary,#FF6B35),var(--brand-secondary,#E55A2B))',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 3px 8px color-mix(in srgb,var(--brand-primary,#FF6B35) 32%,transparent)',
  },

  // Selected bar
  selectedBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    padding: '8px 24px 4px',
    borderTop: '1px solid rgba(255,255,255,0.05)',
  },
  selectedChip: {
    padding: '5px 11px',
    borderRadius: 999,
    border: '1px solid',
    fontSize: 11,
    fontWeight: 500,
    color: '#fff',
    cursor: 'pointer',
    fontFamily: FONT,
    letterSpacing: '-0.1px',
  },

  // Footer
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 22px 18px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    gap: 12,
  },
  cancelBtn: {
    padding: '12px 18px',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.7)',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    fontFamily: FONT,
    letterSpacing: '-0.1px',
  },
  priceBreakdown: {
    textAlign: 'center',
    flex: 1,
    fontFamily: FONT,
  },
  addonLine: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    fontVariantNumeric: 'tabular-nums',
    marginBottom: 2,
  },
  totalLine: {
    fontSize: 20,
    fontWeight: 600,
    color: '#fff',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.6px',
  },
  // Inline tinted-glass so it works in any context (POS, Kiosk, Flow) without depending on .lg-brand class
  confirmBtn: {
    padding: '13px 22px',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.16)',
    background: 'radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))',
    color: '#fff',
    textShadow: '0 1px 3px rgba(0,0,0,0.45)',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    letterSpacing: '-0.2px',
    fontFamily: FONT,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)',
    backdropFilter: 'blur(28px) saturate(180%)',
    WebkitBackdropFilter: 'blur(28px) saturate(180%)',
  },
};
