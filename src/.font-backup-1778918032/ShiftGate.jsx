import { useState, useEffect, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3011";

export default function ShiftGate({ children }) {
  const [shift, setShift] = useState(undefined); // undefined=loading, null=closed, obj=active

  const check = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/shifts/active`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const s = await res.json();
      setShift((s && s.id) ? s : null);
    } catch (err) {
      console.warn("[ShiftGate] check failed:", err);
      setShift(null);
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, 20000);
    return () => clearInterval(id);
  }, [check]);

  if (shift === undefined) return <div style={S.loading}>☕ Memuat...</div>;
  if (shift === null) return (
    <div style={S.overlay}>
      <div style={S.icon}>☕🔒</div>
      <h1 style={S.title}>BELUM SIAP MELAYANI</h1>
      <p style={S.subtitle}>
        Kasir belum membuka shift hari ini.<br/>
        Mohon tunggu beberapa saat lagi.
      </p>
      <button onClick={check} style={S.btn}>🔄 Cek Lagi</button>
      <div style={S.hint}>Auto-check setiap 20 detik</div>
    </div>
  );
  return children;
}

const S = {
  loading: {
    position: "fixed", inset: 0, background: "#111", color: "#666",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Inter',sans-serif", fontSize: 14
  },
  overlay: {
    position: "fixed", inset: 0, background: "#111", color: "#fff",
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    fontFamily: "'Inter',sans-serif",
    padding: "40px", textAlign: "center", zIndex: 9999
  },
  icon: { fontSize: 100, marginBottom: 16, opacity: 0.85 },
  title: {
    fontFamily: "'Inter',cursive",
    fontSize: 56, letterSpacing: 3, margin: "0 0 8px", color: "#F59E0B"
  },
  subtitle: {
    fontSize: 20, color: "#aaa",
    marginTop: 12, maxWidth: 520, lineHeight: 1.5
  },
  btn: {
    marginTop: 32, background: "#F59E0B", color: "#111",
    border: "none", borderRadius: 14, padding: "16px 32px",
    fontFamily: "'Inter',sans-serif",
    fontSize: 16, fontWeight: 700, cursor: "pointer",
    boxShadow: "0 4px 16px rgba(245,158,11,0.3)"
  },
  hint: { marginTop: 20, fontSize: 12, color: "#555" }
};
