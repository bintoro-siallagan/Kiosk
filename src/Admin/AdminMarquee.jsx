// karyaOS — Admin Marquee Editor
// Edit "text jalan" (running ticker) yang muncul di Cinema kiosk, POSCDS,
// POSHome, FlowApp. Pesan disimpan sebagai JSON array of strings di
// pos_config key 'KIOSK_MARQUEE_CUSTOM' — server menggabungkan dengan
// pesan auto (Sultan, promo, coming soon) di /api/marquee.

import { useState, useEffect } from "react";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };

export default function AdminMarquee({ apiBase = "" }) {
  const base = apiBase || "";
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [preview, setPreview] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [scope, setScope] = useState("global");  // "global" atau outlet code (mis "OTL-001")

  const showToast = (m, kind = "ok") => { setToast({ m, kind }); setTimeout(() => setToast(null), 2200); };

  // Load outlets buat dropdown scope
  useEffect(() => {
    fetch(`${base}/api/outlet-master`)
      .then(r => r.json())
      .then(d => setOutlets(d?.outlets || []))
      .catch(() => {});
  }, [base]);

  // Load messages untuk scope yang dipilih (global atau per-outlet)
  useEffect(() => {
    setLoading(true);
    const key = scope === "global" ? "KIOSK_MARQUEE_CUSTOM" : `KIOSK_MARQUEE_CUSTOM:${scope.toUpperCase()}`;
    fetch(`${base}/api/pos/config/${key}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const val = d?.value;
        if (Array.isArray(val)) setLines(val);
        else if (typeof val === "string" && val.trim()) {
          try { const arr = JSON.parse(val); if (Array.isArray(arr)) setLines(arr); else setLines([val]); }
          catch { setLines([val]); }
        } else setLines([]);
      })
      .catch(() => setLines([]))
      .finally(() => setLoading(false));
    // Load preview — kalau scope outlet, request marquee dengan outlet param
    const previewUrl = scope === "global"
      ? `${base}/api/marquee?surface=kiosk`
      : `${base}/api/marquee?surface=kiosk&outlet=${encodeURIComponent(scope)}`;
    fetch(previewUrl).then(r => r.json()).then(d => setPreview(d?.items || [])).catch(() => {});
  }, [base, scope]);

  const updateLine = (i, val) => {
    const next = [...lines]; next[i] = val; setLines(next);
  };
  const addLine = () => setLines([...lines, ""]);
  const removeLine = (i) => setLines(lines.filter((_, j) => j !== i));

  const save = async () => {
    setSaving(true);
    try {
      const clean = lines.map(s => String(s).trim()).filter(Boolean);
      const key = scope === "global" ? "KIOSK_MARQUEE_CUSTOM" : `KIOSK_MARQUEE_CUSTOM:${scope.toUpperCase()}`;
      // Coba PUT dulu — kalau key belum ada (404), buat via POST
      let r = await fetch(`${base}/api/pos/config/${key}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: clean, updated_by: "admin-marquee" }),
      });
      if (r.status === 404) {
        // Key belum ada — create via POST
        r = await fetch(`${base}/api/pos/config`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key, value: clean, type: "json",
            description: scope === "global" ? "Custom marquee messages (global)" : `Custom marquee messages for outlet ${scope}`,
            category: "marketing", updated_by: "admin-marquee",
          }),
        });
      }
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `Gagal menyimpan (${r.status})`);
      }
      showToast(`Tersimpan (${clean.length} pesan, scope: ${scope})`);
      const previewUrl = scope === "global"
        ? `${base}/api/marquee?surface=kiosk`
        : `${base}/api/marquee?surface=kiosk&outlet=${encodeURIComponent(scope)}`;
      const p = await fetch(previewUrl).then(r => r.json()).catch(() => null);
      if (p?.items) setPreview(p.items);
    } catch (e) {
      showToast(e.message || "Failed to save", "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3", maxWidth: 900 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>📣 Marquee Editor</div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>
          Text jalan yang muncul di Cinema kiosk · POSCDS · POSHome · FlowApp.
          Pesan custom di-mix dengan auto-konten: Sultan jam ini, promo aktif, film coming soon.
        </div>
      </div>

      {/* Scope selector — global vs per-outlet */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, color: C.sub, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>SCOPE</div>
        <select value={scope} onChange={e => setScope(e.target.value)} style={{ ...inp, minWidth: 240, width: "auto" }}>
          <option value="global">🌐 Global (semua outlet)</option>
          {outlets.map(o => (
            <option key={o.code} value={o.code}>📍 {o.code} — {o.name} ({o.area})</option>
          ))}
        </select>
        <div style={{ fontSize: 11, color: scope === "global" ? "#22d3ee" : "#fbbf24", flex: 1 }}>
          {scope === "global"
            ? "Pesan akan tampil di SEMUA outlet (default)."
            : `Pesan akan OVERRIDE global untuk outlet ${scope}. Outlet lain tetap pakai global.`}
        </div>
      </div>

      {/* Editor */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#fbbf24", fontFamily: "'Geist Mono',monospace", letterSpacing: 2, fontWeight: 700 }}>PESAN CUSTOM · {scope === "global" ? "GLOBAL" : scope.toUpperCase()}</div>
          <button onClick={addLine} style={B.add}>＋ Tambah baris</button>
        </div>
        {loading ? (
          <div style={{ color: C.sub, fontSize: 13, padding: 16, textAlign: "center" }}>Memuat…</div>
        ) : lines.length === 0 ? (
          <div style={{ color: C.dim, fontSize: 13, padding: "30px 12px", textAlign: "center", border: `1px dashed ${C.border}`, borderRadius: 10 }}>
            No pesan custom. Klik <b>+ Tambah baris</b> untuk mulai.
            <div style={{ fontSize: 11, marginTop: 6, color: C.dim }}>Auto-konten (Sultan/promo/coming soon) tetap jalan walaupun custom kosong.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lines.map((line, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace", width: 24 }}>{String(i + 1).padStart(2, "0")}</div>
                <input value={line} onChange={e => updateLine(i, e.target.value)}
                  placeholder="Mis: Buka 10:00–22:00 · Free popcorn Sabtu · Bayar pakai BCA diskon 20%"
                  style={inp} />
                <button onClick={() => removeLine(i)} style={B.del}>×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center" }}>
          <button onClick={save} disabled={saving || loading} style={{ ...B.save, opacity: saving || loading ? 0.5 : 1 }}>
            {saving ? "Menyimpan…" : "💾 Simpan ke semua kiosk"}
          </button>
          <div style={{ fontSize: 11, color: C.sub }}>
            Berlaku langsung — kiosk refresh setiap 60 detik.
          </div>
        </div>
      </div>

      {/* Preview */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 12, color: "#22d3ee", fontFamily: "'Geist Mono',monospace", letterSpacing: 2, fontWeight: 700, marginBottom: 10 }}>📡 PREVIEW SAAT INI</div>
        {preview.length === 0 ? (
          <div style={{ color: C.dim, fontSize: 13 }}>No pesan apapun di marquee.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {preview.map((it, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 16 }}>{it.icon}</span>
                <span style={{ flex: 1, fontSize: 13, color: it.color || "#e6edf3" }}>{it.text}</span>
                <span style={{ fontSize: 10, color: C.dim, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, textTransform: "uppercase", padding: "2px 8px", background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>{it.kind}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: toast.kind === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.kind === "err" ? "#ef4444" : "#22c55e"}`,
          color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast.m}</div>
      )}
    </div>
  );
}

const inp = { flex: 1, padding: "9px 12px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none" };
const B = {
  add:  { background: "#f59e0b22", border: "1px solid #f59e0b66", color: "#fbbf24", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  save: { background: "#10b981", border: "none", color: "#04130c", padding: "10px 22px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  del:  { background: "#ef444418", border: "1px solid #ef444444", color: "#fca5a5", padding: "6px 10px", borderRadius: 7, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
};
