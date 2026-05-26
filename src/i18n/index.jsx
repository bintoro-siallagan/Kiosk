// src/i18n/index.js — karyaOS lightweight i18n
//
// Usage:
//   import { useT, LocaleSwitcher } from "../i18n";
//   const t = useT();
//   <h1>{t("kiosk.welcome")}</h1>
//
// String registry di ./strings.js. Locale persisted di localStorage["karya_locale"].
// Default ID (Indonesia). Toggle via <LocaleSwitcher/> atau setLocale("en").

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { STRINGS, LOCALES, DEFAULT_LOCALE } from "./strings.js";

const STORAGE_KEY = "karya_locale";

function readStoredLocale() {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && LOCALES.includes(stored)) return stored;
  // Auto-detect browser language
  const browser = (navigator.language || "id").toLowerCase().split("-")[0];
  if (LOCALES.includes(browser)) return browser;
  return DEFAULT_LOCALE;
}

const LocaleContext = createContext({ locale: DEFAULT_LOCALE, setLocale: () => {}, t: (k) => k });

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(() => readStoredLocale());

  const setLocale = useCallback((next) => {
    if (!LOCALES.includes(next)) return;
    localStorage.setItem(STORAGE_KEY, next);
    setLocaleState(next);
    // Broadcast event biar surface lain (non-React iframe etc) bisa react
    window.dispatchEvent(new CustomEvent("karya:locale", { detail: { locale: next } }));
  }, []);

  // Listen for cross-window changes (multi-tab sync)
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY && e.newValue && LOCALES.includes(e.newValue)) {
        setLocaleState(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const t = useCallback((key, vars) => {
    const entry = STRINGS[key];
    let str = entry?.[locale] || entry?.[DEFAULT_LOCALE] || key;
    if (vars && typeof str === "string") {
      Object.keys(vars).forEach(k => {
        str = str.replaceAll(`{${k}}`, vars[k]);
      });
    }
    return str;
  }, [locale]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useT() {
  return useContext(LocaleContext).t;
}

export function useLocale() {
  return useContext(LocaleContext);
}

// Standalone t() — for places without React context (e.g., toast messages, validation strings)
// Reads locale fresh from localStorage each call.
export function tStatic(key, vars) {
  const locale = readStoredLocale();
  const entry = STRINGS[key];
  let str = entry?.[locale] || entry?.[DEFAULT_LOCALE] || key;
  if (vars && typeof str === "string") {
    Object.keys(vars).forEach(k => { str = str.replaceAll(`{${k}}`, vars[k]); });
  }
  return str;
}

// ─── LocaleSwitcher — floating pill button ───
export function LocaleSwitcher({ style = {}, compact = false }) {
  const { locale, setLocale } = useLocale();
  const next = locale === "id" ? "en" : "id";
  const flag = locale === "id" ? "🇮🇩" : "🇺🇸";
  const nextFlag = next === "id" ? "🇮🇩" : "🇺🇸";
  const labelMap = { id: "ID", en: "EN" };
  if (compact) {
    return (
      <button onClick={() => setLocale(next)} title={`Switch to ${labelMap[next]}`}
        style={{
          padding: "4px 10px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 20, color: "#fff", fontSize: 12, fontWeight: 700,
          cursor: "pointer", fontFamily: "'Geist Mono',monospace", letterSpacing: 1,
          display: "inline-flex", alignItems: "center", gap: 4,
          ...style,
        }}>
        {flag} {labelMap[locale]}
      </button>
    );
  }
  return (
    <div style={{ display: "inline-flex", gap: 4, padding: 3, background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 22, ...style }}>
      {LOCALES.map(l => (
        <button key={l} onClick={() => setLocale(l)} style={{
          padding: "6px 14px", background: locale === l ? "rgba(168,85,247,0.25)" : "transparent",
          border: "none", borderRadius: 18, color: locale === l ? "#fff" : "#94a3b8",
          fontSize: 13, fontWeight: 700, fontFamily: "'Geist Mono',monospace", letterSpacing: 1,
          cursor: "pointer", transition: "all 0.15s",
        }}>
          {l === "id" ? "🇮🇩 ID" : "🇺🇸 EN"}
        </button>
      ))}
    </div>
  );
}
