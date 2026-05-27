// src/lib/tenantTheme.js
// Shared tenant theme helper — apply font_family + bg_config dari Branding
// ke semua surfaces (cinema web, kiosk, POS, FlowApp, dll).

import { useEffect, useMemo } from "react";

// Lazy-load Google Font CSS link untuk font_family tertentu.
// Idempotent — skip kalau sudah di-load sebelumnya.
export function loadGoogleFont(fontFamily) {
  if (!fontFamily || typeof document === "undefined") return;
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@300;400;500;600;700;800;900&display=swap`;
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

// Convert bg_config object → CSS background value
// Mode: "default" | "color" | "gradient" | "image" | "pattern"
// fallback = default background kalau bg_config null atau mode "default"
export function bgConfigToCss(cfg, fallback = "#141414") {
  if (!cfg || cfg.mode === "default") return fallback;
  if (cfg.mode === "color") return cfg.value || fallback;
  if (cfg.mode === "gradient") {
    return `linear-gradient(${cfg.direction || "135deg"}, ${cfg.value || fallback}, ${cfg.value2 || fallback})`;
  }
  if (cfg.mode === "image" && cfg.value) {
    return `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.85)), url('${cfg.value}') center/cover fixed, ${fallback}`;
  }
  if (cfg.mode === "pattern") {
    if (cfg.value === "dots")  return `radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px) 0 0/20px 20px, ${fallback}`;
    if (cfg.value === "grid")  return `linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px) 0 0/20px 20px, linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px) 0 0/20px 20px, ${fallback}`;
    if (cfg.value === "noise") return `repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0px, transparent 1px, transparent 3px), ${fallback}`;
  }
  return fallback;
}

// React hook: pass brand object (dari /api/companies/branding) → returns
// { fontFamily, background } siap pakai di style root.
// fallbackBg dipakai kalau tenant gak set custom bg.
// fallbackFont dipakai sbg secondary font di font-family stack.
export function useTenantTheme(brand, { fallbackBg = "#141414", fallbackFont = "'Inter','-apple-system',sans-serif" } = {}) {
  const tenantFont = brand?.font_family;
  const tenantBg = brand?.bg_config;

  // Lazy-load Google Font saat tenantFont berubah
  useEffect(() => {
    if (tenantFont) loadGoogleFont(tenantFont);
  }, [tenantFont]);

  return useMemo(() => ({
    fontFamily: tenantFont ? `'${tenantFont}',${fallbackFont}` : fallbackFont,
    background: bgConfigToCss(tenantBg, fallbackBg),
    fontName: tenantFont || null,
    bgConfig: tenantBg || null,
  }), [tenantFont, tenantBg, fallbackBg, fallbackFont]);
}
