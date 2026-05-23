// src/pricing.js
// Shared pricing helpers — service charge dine-in, etc.
// Used by Kiosk, POSConfirm, POSPayment, DigitalReceipt, POSReceipt.

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Cached config (refresh on demand)
let _cache = { pct: 5, enabled: true, label: "Service Charge", lastFetch: 0 };

export async function loadServiceChargeConfig() {
  try {
    const [pct, enabled, label] = await Promise.all([
      fetch(`${API}/api/pos/config/SERVICE_CHARGE_DINEIN_PCT`).then(r => r.json()).catch(() => null),
      fetch(`${API}/api/pos/config/SERVICE_CHARGE_DINEIN_ENABLED`).then(r => r.json()).catch(() => null),
      fetch(`${API}/api/pos/config/SERVICE_CHARGE_LABEL`).then(r => r.json()).catch(() => null),
    ]);
    _cache = {
      pct:     Number(pct?.parsed_value ?? pct?.value ?? 5) || 5,
      enabled: (enabled?.parsed_value ?? enabled?.value ?? true) !== false && (enabled?.parsed_value ?? enabled?.value ?? true) !== "false",
      label:   String(label?.parsed_value ?? label?.value ?? "Service Charge").replace(/^"|"$/g, ""),
      lastFetch: Date.now(),
    };
  } catch {}
  return _cache;
}

export function getServiceChargeConfig() {
  return _cache;
}

// Hitung service charge — return 0 kalau bukan dine-in atau disabled.
export function calcServiceCharge(subtotal, orderType, configOverride) {
  const c = configOverride || _cache;
  if (!c.enabled) return 0;
  if (!subtotal || subtotal <= 0) return 0;
  const isDineIn = orderType === "dine" || orderType === "dine-in" || orderType === "dinein";
  if (!isDineIn) return 0;
  const pct = c.pct || 0;
  return Math.round(subtotal * pct / 100);
}

// Helper: hitung breakdown total termasuk service charge.
// Return { subtotal, discount, serviceCharge, total }
export function calcOrderTotal({ items = [], subtotal: rawSubtotal, discount = 0, orderType, config }) {
  const subtotal = rawSubtotal != null ? rawSubtotal :
    items.reduce((s, it) => s + ((it.price || 0) + (it.addonTotal || 0)) * (it.qty || 1), 0);
  const afterDisc = Math.max(0, subtotal - discount);
  const serviceCharge = calcServiceCharge(afterDisc, orderType, config);
  const total = afterDisc + serviceCharge;
  return { subtotal, discount, afterDiscount: afterDisc, serviceCharge, total };
}
