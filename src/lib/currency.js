// src/lib/currency.js
// Centralized currency formatter — per-tenant via tenantBrand from /api/companies/branding.
// Replaces hardcoded `"Rp " + n.toLocaleString("id-ID")` patterns.

let _currency = "IDR";
let _locale = "id-ID";

// Currency configs (top 5 SEA + global)
const CURRENCY_CONFIG = {
  IDR: { symbol: "Rp",  position: "before", decimals: 0, separator: ".", locale: "id-ID" },
  USD: { symbol: "$",   position: "before", decimals: 2, separator: ",", locale: "en-US" },
  SGD: { symbol: "S$",  position: "before", decimals: 2, separator: ",", locale: "en-SG" },
  MYR: { symbol: "RM",  position: "before", decimals: 2, separator: ",", locale: "ms-MY" },
  THB: { symbol: "฿",   position: "before", decimals: 2, separator: ",", locale: "th-TH" },
  PHP: { symbol: "₱",   position: "before", decimals: 2, separator: ",", locale: "en-PH" },
  VND: { symbol: "₫",   position: "after",  decimals: 0, separator: ".", locale: "vi-VN" },
  EUR: { symbol: "€",   position: "before", decimals: 2, separator: ",", locale: "de-DE" },
  GBP: { symbol: "£",   position: "before", decimals: 2, separator: ",", locale: "en-GB" },
};

// Initialize from tenant branding (call once on app boot)
export function initCurrency({ currency_code, locale }) {
  if (currency_code && CURRENCY_CONFIG[currency_code]) {
    _currency = currency_code;
  }
  if (locale) {
    _locale = locale;
  } else if (CURRENCY_CONFIG[_currency]) {
    _locale = CURRENCY_CONFIG[_currency].locale;
  }
}

export function getCurrencyConfig() {
  return CURRENCY_CONFIG[_currency] || CURRENCY_CONFIG.IDR;
}

// Format amount with tenant currency. Backward compatible drop-in for `fIDR(n)`.
export function formatCurrency(amount, opts = {}) {
  const cfg = getCurrencyConfig();
  const n = Number(amount || 0);
  const rounded = cfg.decimals === 0 ? Math.round(n) : n;
  const formatted = rounded.toLocaleString(_locale, {
    minimumFractionDigits: cfg.decimals,
    maximumFractionDigits: cfg.decimals,
  });
  const showSymbol = opts.symbol !== false;
  if (!showSymbol) return formatted;
  return cfg.position === "after"
    ? `${formatted} ${cfg.symbol}`
    : `${cfg.symbol} ${formatted}`;
}

// Short alias (drop-in replacement for `fIDR`)
export const fmtMoney = formatCurrency;

// Auto-bootstrap on import — fetch tenant branding & set
if (typeof window !== "undefined") {
  fetch("/api/companies/branding")
    .then(r => r.json())
    .then(b => initCurrency({ currency_code: b?.currency_code, locale: b?.locale }))
    .catch(() => {});
}
