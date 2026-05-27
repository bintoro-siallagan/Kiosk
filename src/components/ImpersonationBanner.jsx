// src/components/ImpersonationBanner.jsx
// Global banner — super-admin sedang impersonate tenant tertentu.
// Mount sekali di root App.jsx supaya muncul di semua surface
// (AdminHome, POS, Kiosk, Flow, Cinema). Sebelumnya hanya di AdminHome.

import { useEffect, useState } from "react";

export default function ImpersonationBanner() {
  const [ctx, setCtx] = useState(() => readCtx());

  // Re-read kalau localStorage berubah dari tab lain
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "karya_company_ctx") setCtx(readCtx());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!ctx?._impersonating) return null;

  const exit = async () => {
    const { stopImpersonate } = await import("../companyAuth.js");
    stopImpersonate();
    window.location.reload();
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 99999,
      background: "linear-gradient(90deg, rgba(168,85,247,0.95), rgba(251,191,36,0.95))",
      borderBottom: "1px solid rgba(251,191,36,0.6)",
      padding: "8px 16px", display: "flex", alignItems: "center", gap: 10,
      fontSize: 12, color: "#fff", fontWeight: 700, fontFamily: "'Inter',sans-serif",
      backdropFilter: "blur(8px)",
      boxShadow: "0 4px 12px rgba(168,85,247,0.25)",
    }}>
      <span style={{ fontSize: 14 }}>🎯</span>
      <span style={{ fontFamily: "'Geist Mono',monospace", letterSpacing: 1, textTransform: "uppercase", fontSize: 10, color: "#000" }}>IMPERSONATING</span>
      <span style={{ flex: 1, fontWeight: 800, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}>
        {ctx.company?.name || ctx.company?.code || "Tenant"}
      </span>
      <button onClick={exit} style={{
        background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.5)",
        color: "#fff", padding: "5px 14px", borderRadius: 8,
        fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.4,
      }}>✕ Exit</button>
    </div>
  );
}

function readCtx() {
  try {
    return JSON.parse(localStorage.getItem("karya_company_ctx") || "null");
  } catch {
    return null;
  }
}
