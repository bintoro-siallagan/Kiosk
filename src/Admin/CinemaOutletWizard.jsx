// karyaOS — Cinema Outlet Onboarding Wizard
// Admin HQ buka outlet baru auto-guided 6 step:
// 1. Outlet (master) → 2. Studio → 3. Layout & Pricing → 4. Branding CDS
// → 5. First Showtime → 6. Done (review + launch URLs)
//
// Setiap step save ke backend, progress preserved kalau modal di-close.

import { useState, useEffect, useMemo } from "react";
import CinemaStudioLayoutEditor from "./CinemaStudioLayoutEditor.jsx";

const API_HOST = import.meta.env.VITE_API_URL || "http://localhost:3001";

const STEPS = [
  { key: "outlet", label: "Outlet", icon: "🏢", desc: "Daftar cabang baru" },
  { key: "studio", label: "Studio", icon: "🏛️", desc: "Tambah ruang teater" },
  { key: "layout", label: "Layout & Harga", icon: "🪑", desc: "Custom kursi & kategori" },
  { key: "branding", label: "Branding CDS", icon: "🎨", desc: "Background TV + tiket header" },
  { key: "showtime", label: "Showtime Pertama", icon: "🗓️", desc: "Buat jadwal tayang" },
  { key: "done", label: "Launch!", icon: "🚀", desc: "Review URL setup" },
];

export default function CinemaOutletWizard({ apiBase, onClose, onDone }) {
  const base = `${apiBase || ""}/api/cinema`;
  const [stepIdx, setStepIdx] = useState(0);
  const [data, setData] = useState({
    outlet: { code: "", name: "", area: "", outlet_type: "cinema", seat_capacity: 0 },
    studio: { name: "Studio 1", studio_type: "Regular", rows: 8, cols: 12 },
    pricing: { regular: 50000, premium: 75000, couple: 90000, vip: 150000, disabled: 50000 },
    branding: { bgUrl: "", idleText: "", ticketBrand: "", ticketFooter: "" },
    showtime: { film_id: "", show_date: new Date().toISOString().slice(0, 10), start_time: "19:00", format: "2D", price: 0 },
  });
  const [savedIds, setSavedIds] = useState({ outletCode: "", studioId: null, showtimeId: null });
  const [films, setFilms] = useState([]);
  const [layoutStudio, setLayoutStudio] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${base}/films`).then(r => r.json()).then(d => setFilms(d.films || [])).catch(() => {});
  }, [base]);

  const current = STEPS[stepIdx];
  const next = () => setStepIdx(i => Math.min(STEPS.length - 1, i + 1));
  const back = () => setStepIdx(i => Math.max(0, i - 1));
  const update = (section, field, value) => setData(d => ({ ...d, [section]: { ...d[section], [field]: value } }));

  // ═══════════════════════════════════════════════
  // STEP HANDLERS — save per-step ke backend
  // ═══════════════════════════════════════════════
  const saveOutlet = async () => {
    const o = data.outlet;
    if (!o.code || !o.name) { setMsg("⚠ Code dan Name wajib"); return false; }
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`${apiBase}/api/outlet-master`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...o, status: "active" }),
      });
      const d = await r.json();
      if (!r.ok && !d.ok && !d.id) throw new Error(d.error || "Gagal save outlet");
      setSavedIds(p => ({ ...p, outletCode: o.code }));
      setMsg("✓ Outlet tersimpan");
      setBusy(false);
      return true;
    } catch (e) { setMsg("⚠ " + e.message); setBusy(false); return false; }
  };

  const saveStudio = async () => {
    const s = data.studio;
    if (!s.name) { setMsg("⚠ Nama studio wajib"); return false; }
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`${base}/studios`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...s, outlet: savedIds.outletCode || data.outlet.code }),
      });
      const d = await r.json();
      if (!d.ok && !d.id) throw new Error(d.error || "Gagal save studio");
      setSavedIds(p => ({ ...p, studioId: d.id }));
      setMsg("✓ Studio tersimpan");
      setBusy(false);
      return true;
    } catch (e) { setMsg("⚠ " + e.message); setBusy(false); return false; }
  };

  const saveBranding = async () => {
    const b = data.branding;
    const outlet = savedIds.outletCode || data.outlet.code;
    setBusy(true); setMsg("");
    try {
      const ups = [];
      if (b.bgUrl) ups.push({ key: `CINEMA_CDS_BG:${outlet}`, value: b.bgUrl });
      if (b.idleText) ups.push({ key: `CINEMA_CDS_IDLE_TEXT:${outlet}`, value: b.idleText });
      if (b.ticketBrand) ups.push({ key: `CINEMA_TICKET_BRAND:${outlet}`, value: b.ticketBrand });
      if (b.ticketFooter) ups.push({ key: `CINEMA_TICKET_FOOTER:${outlet}`, value: b.ticketFooter });
      for (const u of ups) {
        try {
          await fetch(`${apiBase}/api/pos/config/${encodeURIComponent(u.key)}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value: JSON.stringify(u.value) }),
          });
        } catch {
          await fetch(`${apiBase}/api/pos/config`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: u.key, value: JSON.stringify(u.value), type: "string", category: "cinema_branding" }),
          });
        }
      }
      setMsg(ups.length ? `✓ ${ups.length} branding config saved` : "Skip — semua field kosong");
      setBusy(false);
      return true;
    } catch (e) { setMsg("⚠ " + e.message); setBusy(false); return false; }
  };

  const saveShowtime = async () => {
    const s = data.showtime;
    if (!s.film_id || !s.show_date || !s.start_time) { setMsg("⚠ Film, tanggal, jam wajib"); return false; }
    if (!savedIds.studioId) { setMsg("⚠ Studio belum di-save"); return false; }
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`${base}/showtimes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...s, studio_id: savedIds.studioId }),
      });
      const d = await r.json();
      if (!d.ok && !d.id) throw new Error(d.error || "Gagal save showtime");
      setSavedIds(p => ({ ...p, showtimeId: d.id }));
      setMsg("✓ Showtime tersimpan");
      setBusy(false);
      return true;
    } catch (e) { setMsg("⚠ " + e.message); setBusy(false); return false; }
  };

  const handleUpload = async (e, field) => {
    const file = e.target.files?.[0]; if (!file) return;
    setMsg(`Uploading ${(file.size / 1024 / 1024).toFixed(1)}MB...`);
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch(`${apiBase}/api/upload`, { method: "POST", body: fd });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      update("branding", field, d.url);
      setMsg("✓ Upload sukses");
    } catch (err) { setMsg("⚠ " + err.message); }
  };

  const launchUrls = useMemo(() => {
    const o = savedIds.outletCode || "JKT01";
    const origin = window.location.origin;
    return [
      { label: "POS Cinema (Kasir)", url: `${origin}/?pos-cinema&outlet=${o}&fresh=1`, color: "#fbbf24" },
      { label: "CDS Second Display", url: `${origin}/?cinema-cds&outlet=${o}`, color: "#22d3ee" },
      { label: "KDS F&B Staff", url: `${origin}/?cinema-kds`, color: "#10b981" },
      { label: "Cinema Kiosk Customer", url: `${origin}/?cinema&outlet=${o}`, color: "#a855f7" },
      { label: "In-Studio QR Order", url: `${origin}/?cinema-snack&seat=A1&studio_id=${savedIds.studioId || "X"}`, color: "#f59e0b" },
    ];
  }, [savedIds]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)", zIndex: 15000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Inter',sans-serif" }}>
      <div style={{ background: "linear-gradient(160deg,#050810,#0c0f1a)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 880, maxHeight: "94vh", overflowY: "auto", color: "#e6edf3" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: "#a855f7", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>🚀 OUTLET ONBOARDING WIZARD</div>
            <div style={{ fontSize: 19, fontWeight: 800, marginTop: 4, letterSpacing: -0.3 }}>{current.icon} {current.label}</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{current.desc}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e6edf3", padding: "8px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✕ Tutup</button>
        </div>

        {/* Progress bar */}
        <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
          {STEPS.map((s, i) => (
            <div key={s.key} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= stepIdx ? "#a855f7" : "rgba(255,255,255,0.08)", transition: "background 0.3s" }} />
          ))}
        </div>

        {/* Step content */}
        <div style={{ minHeight: 280 }}>
          {current.key === "outlet" && (
            <div style={{ display: "grid", gap: 12 }}>
              <Field label="OUTLET CODE (unique, dipakai di URL)">
                <input value={data.outlet.code} onChange={e => update("outlet", "code", e.target.value.toUpperCase())}
                  placeholder="JKT01" style={inp} />
              </Field>
              <Field label="NAMA OUTLET">
                <input value={data.outlet.name} onChange={e => update("outlet", "name", e.target.value)}
                  placeholder="Cinema XXI Plaza Indonesia" style={inp} />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                <Field label="AREA / KOTA">
                  <input value={data.outlet.area} onChange={e => update("outlet", "area", e.target.value)}
                    placeholder="Jakarta Pusat" style={inp} />
                </Field>
                <Field label="SEAT CAPACITY (total)">
                  <input type="number" value={data.outlet.seat_capacity} onChange={e => update("outlet", "seat_capacity", parseInt(e.target.value) || 0)}
                    placeholder="200" style={inp} />
                </Field>
              </div>
              <div style={{ padding: 12, background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 8, fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>
                💡 OUTLET CODE akan jadi suffix URL semua surface — mis. <code style={{ color: "#22d3ee" }}>?outlet=JKT01</code>. Pilih singkat 3-6 char.
              </div>
            </div>
          )}

          {current.key === "studio" && (
            <div style={{ display: "grid", gap: 12 }}>
              <Field label="NAMA STUDIO">
                <input value={data.studio.name} onChange={e => update("studio", "name", e.target.value)}
                  placeholder="Studio 1" style={inp} />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <Field label="TIPE">
                  <select value={data.studio.studio_type} onChange={e => update("studio", "studio_type", e.target.value)} style={inp}>
                    {["Regular", "IMAX", "Premiere", "4DX"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="BARIS">
                  <input type="number" value={data.studio.rows} onChange={e => update("studio", "rows", parseInt(e.target.value) || 1)} style={inp} />
                </Field>
                <Field label="KOLOM">
                  <input type="number" value={data.studio.cols} onChange={e => update("studio", "cols", parseInt(e.target.value) || 1)} style={inp} />
                </Field>
              </div>
              <div style={{ padding: 12, background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 8, fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>
                💡 Default {data.studio.rows} × {data.studio.cols} = <b style={{ color: "#c084fc" }}>{data.studio.rows * data.studio.cols} kursi</b> all regular. Di step berikutnya kamu bisa custom layout (Premium/Couple/VIP/aisle).
              </div>
            </div>
          )}

          {current.key === "layout" && (
            <div>
              <div style={{ padding: 14, background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 8, marginBottom: 14, fontSize: 12, color: "#cbd5e1", lineHeight: 1.6 }}>
                Studio sudah dibuat dengan {data.studio.rows} × {data.studio.cols} kursi default Regular.
                <br/>Klik <b>🪑 Edit Layout</b> untuk:
                <br/>• Mark kursi premium/couple/VIP/disabled
                <br/>• Hapus baris/kolom yang tidak ada kursi
                <br/>• Rename label baris (PRM, VIP, dll)
                <br/>• Set harga per kategori (Regular Rp 50k, Premium 75k, Couple 90k, VIP 150k)
              </div>
              {savedIds.studioId ? (
                <button onClick={() => setLayoutStudio({ id: savedIds.studioId, name: data.studio.name, rows: data.studio.rows, cols: data.studio.cols })}
                  style={{ padding: "14px 22px", background: "linear-gradient(135deg,#a855f7,#c084fc)", border: "none", borderRadius: 12, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px rgba(168,85,247,0.3)" }}>
                  🪑 Buka Layout Editor
                </button>
              ) : (
                <div style={{ padding: 14, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#fca5a5", fontSize: 12 }}>
                  ⚠ Studio belum ter-save. Kembali ke step sebelumnya & klik Lanjut untuk save dulu.
                </div>
              )}
              {layoutStudio && (
                <CinemaStudioLayoutEditor studio={layoutStudio} onClose={() => setLayoutStudio(null)} onSaved={() => { setLayoutStudio(null); setMsg("✓ Layout tersimpan"); }} />
              )}
              <div style={{ marginTop: 14, fontSize: 11, color: "#7d8590" }}>
                Atau skip step ini → grid default Regular semua dengan harga showtime.price.
              </div>
            </div>
          )}

          {current.key === "branding" && (
            <div style={{ display: "grid", gap: 14 }}>
              <Field label="BACKGROUND IMAGE CDS (TV second display)">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {data.branding.bgUrl && <img src={data.branding.bgUrl.startsWith("/") ? API_HOST + data.branding.bgUrl : data.branding.bgUrl} style={{ width: 60, height: 34, objectFit: "cover", borderRadius: 4, border: "1px solid #30363d" }} />}
                  <label style={{ background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.3)", color: "#22d3ee", borderRadius: 8, padding: "9px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                    📤 Upload
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleUpload(e, "bgUrl")} />
                  </label>
                  <input value={data.branding.bgUrl} onChange={e => update("branding", "bgUrl", e.target.value)}
                    placeholder="atau paste URL" style={{ ...inp, flex: 1 }} />
                </div>
              </Field>
              <Field label="IDLE TEXT (welcome message)">
                <input value={data.branding.idleText} onChange={e => update("branding", "idleText", e.target.value)}
                  placeholder="Selamat datang di Cinema XXI Jakarta!" style={inp} />
              </Field>
              <Field label="HEADER STRUK TIKET">
                <input value={data.branding.ticketBrand} onChange={e => update("branding", "ticketBrand", e.target.value)}
                  placeholder="🎬 CINEMA XXI · Plaza Indonesia" style={inp} />
              </Field>
              <Field label="FOOTER STRUK TIKET">
                <input value={data.branding.ticketFooter} onChange={e => update("branding", "ticketFooter", e.target.value)}
                  placeholder="Datang 15 menit sebelum tayang · No refund" style={inp} />
              </Field>
              <div style={{ fontSize: 11, color: "#7d8590" }}>Skip semua → pakai default karyaOS branding.</div>
            </div>
          )}

          {current.key === "showtime" && (
            <div style={{ display: "grid", gap: 12 }}>
              <Field label="FILM">
                <select value={data.showtime.film_id} onChange={e => update("showtime", "film_id", e.target.value)} style={inp}>
                  <option value="">— Pilih film —</option>
                  {films.filter(f => f.status === "now_showing").map(f => (
                    <option key={f.id} value={f.id}>{f.title}</option>
                  ))}
                </select>
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <Field label="TANGGAL"><input type="date" value={data.showtime.show_date} onChange={e => update("showtime", "show_date", e.target.value)} style={inp} /></Field>
                <Field label="JAM"><input type="time" value={data.showtime.start_time} onChange={e => update("showtime", "start_time", e.target.value)} style={inp} /></Field>
                <Field label="FORMAT">
                  <select value={data.showtime.format} onChange={e => update("showtime", "format", e.target.value)} style={inp}>
                    {["2D", "3D", "IMAX", "4DX"].map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="HARGA (kosongkan untuk auto dari outlet pricing)">
                <input type="number" value={data.showtime.price || ""} onChange={e => update("showtime", "price", parseInt(e.target.value) || 0)}
                  placeholder="50000" style={inp} />
              </Field>
            </div>
          )}

          {current.key === "done" && (
            <div>
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div style={{ fontSize: 64, marginBottom: 8, lineHeight: 1, filter: "drop-shadow(0 0 24px rgba(16,185,129,0.4))" }}>🎉</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#10b981", letterSpacing: -0.5 }}>Outlet {savedIds.outletCode} Siap!</div>
                <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>{data.outlet.name} · {data.outlet.area}</div>
              </div>
              <div style={{ fontSize: 11, color: "#c084fc", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 10 }}>🔗 URL LAUNCH</div>
              <div style={{ display: "grid", gap: 8 }}>
                {launchUrls.map(u => (
                  <div key={u.label} style={{ display: "flex", gap: 10, padding: 12, background: "rgba(255,255,255,0.025)", border: `1px solid ${u.color}33`, borderRadius: 8 }}>
                    <div style={{ minWidth: 180, fontSize: 13, fontWeight: 700, color: u.color }}>{u.label}</div>
                    <input readOnly value={u.url} style={{ ...inp, flex: 1, fontSize: 11, color: "#cbd5e1" }} onFocus={e => e.target.select()} />
                    <button onClick={() => { navigator.clipboard.writeText(u.url); setMsg("✓ Copied"); }}
                      style={{ background: u.color, border: "none", borderRadius: 7, padding: "8px 12px", color: "#0a0e16", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>📋</button>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, padding: 14, background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, fontSize: 12, color: "#cbd5e1", lineHeight: 1.6 }}>
                💡 <b>Setup di outlet:</b> Bookmark URL POS Cinema di laptop kasir, CDS di TV second display (full-screen F11), KDS di tablet F&B station, Cinema Kiosk untuk self-service customer. Print QR per kursi pakai URL In-Studio QR.
              </div>
            </div>
          )}
        </div>

        {/* Message */}
        {msg && (
          <div style={{ marginTop: 14, padding: "8px 12px", background: msg.startsWith("✓") ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${msg.startsWith("✓") ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, borderRadius: 8, fontSize: 12, color: msg.startsWith("✓") ? "#10b981" : "#fca5a5" }}>{msg}</div>
        )}

        {/* Nav */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 22, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={back} disabled={stepIdx === 0 || busy}
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: stepIdx === 0 ? "#5b6470" : "#e6edf3", padding: "10px 18px", fontSize: 12, fontWeight: 700, cursor: stepIdx === 0 ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            ← Kembali
          </button>
          <div style={{ fontSize: 11, color: "#7d8590", fontFamily: "'Geist Mono',monospace" }}>Step {stepIdx + 1} / {STEPS.length}</div>
          {current.key === "done" ? (
            <button onClick={() => { onDone && onDone(); onClose(); }}
              style={{ background: "linear-gradient(135deg,#10b981,#34d399)", border: "none", borderRadius: 8, padding: "10px 22px", color: "#04130c", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 12px rgba(16,185,129,0.3)" }}>
              🚀 Selesai
            </button>
          ) : (
            <button onClick={async () => {
              let ok = true;
              if (current.key === "outlet") ok = await saveOutlet();
              else if (current.key === "studio") ok = await saveStudio();
              else if (current.key === "branding") ok = await saveBranding();
              else if (current.key === "showtime") ok = await saveShowtime();
              if (ok) next();
            }} disabled={busy}
              style={{ background: "linear-gradient(135deg,#a855f7,#c084fc)", border: "none", borderRadius: 8, padding: "10px 22px", color: "#fff", fontSize: 13, fontWeight: 800, cursor: busy ? "wait" : "pointer", fontFamily: "inherit", boxShadow: "0 4px 12px rgba(168,85,247,0.3)" }}>
              {busy ? "⏳ Saving..." : "Lanjut →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#7d8590", letterSpacing: 1.4, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

const inp = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, padding: "10px 14px", color: "#fff",
  fontSize: 13, fontFamily: "inherit", outline: "none",
};
