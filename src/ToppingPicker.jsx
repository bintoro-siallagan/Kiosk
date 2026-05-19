import { useState, useMemo } from 'react';
import * as audio from "./audio.js";
import { useMenu } from './MenuContext.jsx';

/**
 * ToppingPicker — fullscreen overlay untuk pilih topping froyo.
 *
 * Muncul saat customer klik item yang punya freeToppings > 0.
 * Setelah pilih topping → klik "Tambah" → callback onConfirm dipanggil.
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

  if (!item) return null;

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.panel} onClick={e => e.stopPropagation()}>

        {/* ── HEADER ──────────────────────── */}
        <div style={S.header}>
          <div style={S.headerLeft}>
            <span style={S.itemEmoji}>{item.emoji}</span>
            <div>
              <div style={S.itemName}>{item.name}</div>
              <div style={S.itemDesc}>{item.desc}</div>
            </div>
          </div>
          <div style={S.basePrice}>Rp {item.price.toLocaleString('id-ID')}</div>
        </div>

        {/* ── PROGRESS BAR ────────────────── */}
        <div style={S.progressSection}>
          <div style={S.progressLabel}>
            <span>{freeUsed}/{freeCount} topping gratis dipilih</span>
            {extraCount > 0 && (
              <span style={S.extraBadge}>+{extraCount} extra (Rp {(extraCount * EXTRA_TOPPING_PRICE).toLocaleString('id-ID')})</span>
            )}
          </div>
          <div style={S.progressTrack}>
            <div
              style={{
                ...S.progressFill,
                width: `${Math.min(100, (selected.length / Math.max(freeCount, 1)) * 100)}%`,
                background: selected.length > freeCount ? '#F59E0B' : '#FF6B35',
              }}
            />
          </div>
        </div>

        {/* ── GROUP TABS ──────────────────── */}
        <div style={S.tabs}>
          {[{ name: 'all', label: 'Semua' }, ...groups.map(g => ({ name: g.name, label: g.name }))].map(tab => (
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
                  borderColor: sel ? '#FF6B35' : 'rgba(255,255,255,0.08)',
                }}
                onClick={() => toggle(t)}
              >
                <div style={S.toppingName}>{t.name}</div>
                <div style={S.toppingMeta}>
                  {isPremium && <span style={S.premiumTag}>+Rp {t.price.toLocaleString('id-ID')}</span>}
                  {sel && isFree && <span style={S.freeTag}>GRATIS</span>}
                  {sel && !isFree && <span style={S.extraTag}>EXTRA</span>}
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
                  background: i < freeCount ? 'rgba(255,107,53,0.15)' : 'rgba(245,158,11,0.15)',
                  borderColor: i < freeCount ? '#FF6B35' : '#F59E0B',
                }}
                onClick={() => toggle(t)}
              >
                {t.name} ✕
              </span>
            ))}
          </div>
        )}

        {/* ── FOOTER / CTA ────────────────── */}
        <div style={S.footer}>
          <button style={S.cancelBtn} onClick={onClose}>
            ← Batal
          </button>

          <div style={S.priceBreakdown}>
            {addonCost > 0 && (
              <div style={S.addonLine}>
                Topping +Rp {addonCost.toLocaleString('id-ID')}
              </div>
            )}
            <div style={S.totalLine}>
              Rp {totalPrice.toLocaleString('id-ID')}
            </div>
          </div>

          <button style={S.confirmBtn} onClick={handleConfirm}>
            Tambah ke Keranjang
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STYLES — dark kiosk theme with Sour Sally pink accent
// ============================================================
const S = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.96)',
    backdropFilter: 'blur(2px)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  panel: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '95vh',
    background: '#111',
    borderRadius: 20,
    border: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
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
  },
  itemEmoji: {
    fontSize: 40,
  },
  itemName: {
    fontSize: 18,
    fontWeight: 700,
    color: '#fff',
  },
  itemDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  basePrice: {
    fontSize: 18,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.6)',
  },

  // Progress
  progressSection: {
    padding: '12px 24px 8px',
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 6,
  },
  extraBadge: {
    color: '#F59E0B',
    fontWeight: 600,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    background: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.2s, background 0.2s',
  },

  // Tabs
  tabs: {
    display: 'flex',
    gap: 6,
    padding: '8px 24px 4px',
    overflowX: 'auto',
  },
  tab: {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  tabActive: {
    background: '#FF6B35',
    color: '#fff',
    borderColor: '#FF6B35',
    fontWeight: 600,
  },
  tabCount: {
    fontSize: 10,
    background: 'rgba(255,107,53,0.3)',
    borderRadius: 99,
    padding: '1px 5px',
    minWidth: 14,
    textAlign: 'center',
  },

  // Grid
  grid: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 24px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 10,
    alignContent: 'start',
  },
  toppingBtn: {
    position: 'relative',
    padding: '14px 12px',
    borderRadius: 12,
    border: '2px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.02)',
    color: '#fff',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s',
    minHeight: 64,
  },
  toppingSelected: {
    background: 'rgba(255,107,53,0.08)',
  },
  toppingName: {
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 4,
  },
  toppingMeta: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
  },
  premiumTag: {
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 4,
    background: 'rgba(245,158,11,0.15)',
    color: '#F59E0B',
    fontWeight: 600,
  },
  freeTag: {
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 4,
    background: 'rgba(34,197,94,0.15)',
    color: '#22C55E',
    fontWeight: 700,
  },
  extraTag: {
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 4,
    background: 'rgba(245,158,11,0.15)',
    color: '#F59E0B',
    fontWeight: 700,
  },
  checkCircle: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    background: '#FF6B35',
    color: '#fff',
    fontSize: 11,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Selected bar
  selectedBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    padding: '8px 24px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  selectedChip: {
    padding: '4px 10px',
    borderRadius: 999,
    border: '1px solid',
    fontSize: 11,
    color: '#fff',
    cursor: 'pointer',
  },

  // Footer
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(0,0,0,0.3)',
    gap: 12,
  },
  cancelBtn: {
    padding: '12px 18px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.6)',
    cursor: 'pointer',
    fontSize: 14,
    whiteSpace: 'nowrap',
  },
  priceBreakdown: {
    textAlign: 'center',
    flex: 1,
  },
  addonLine: {
    fontSize: 11,
    color: '#F59E0B',
  },
  totalLine: {
    fontSize: 20,
    fontWeight: 800,
    color: '#fff',
  },
  confirmBtn: {
    padding: '14px 28px',
    borderRadius: 12,
    border: 'none',
    background: '#FF6B35',
    color: '#fff',
    fontSize: 15,
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    letterSpacing: 0.5,
  },
};
