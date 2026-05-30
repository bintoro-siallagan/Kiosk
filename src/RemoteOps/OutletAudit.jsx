// karyaOS — Outlet Daily Self-Audit (PWA, mobile-first)
// Route: /?audit
// Outlet manager: login (outlet code + PIN) → checklist with photo + GPS → submit.
// Anti-fraud: PIN sha256, GPS auto-tagged, timestamp embed, one submission per day.
import { useEffect, useRef, useState } from "react";
import CameraCapture from "../components/CameraCapture.jsx";
import API_HOST from "../apiBase.js";
const PURPLE = "#a855f7", GREEN = "#10b981", AMBER = "#f59e0b", RED = "#ef4444";

export default function OutletAudit() {
  // Step machine: login → fetch templates → fill → submit → done
  const [step, setStep] = useState("login");
  const [outletCode, setOutletCode] = useState(localStorage.getItem("ro_outlet") || "");
  const [outletName, setOutletName] = useState(localStorage.getItem("ro_outlet_name") || "");
  const [managerName, setManagerName] = useState(localStorage.getItem("ro_manager") || "");
  const [vertical, setVertical] = useState(localStorage.getItem("ro_vertical") || "fnb");
  const [pin, setPin] = useState("");
  const [outlets, setOutlets] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [items, setItems] = useState({}); // { code: { rating, photo_b64, note } }
  const [gps, setGps] = useState(null);
  const [gpsErr, setGpsErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [alreadySubmitted, setAlreadySubmitted] = useState(null); // existing audit
  const [submitterSelfie, setSubmitterSelfie] = useState(null); // anti-nitip-PIN
  // Device ID — disimpan di localStorage, anti-pakai-PIN-orang-lain (kalau PIN sama
  // dipakai dari device baru, backend log anomaly).
  const [deviceId] = useState(() => {
    let id = localStorage.getItem("ro_device_id");
    if (!id) {
      id = "dev_" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
      localStorage.setItem("ro_device_id", id);
    }
    return id;
  });

  // Reset root width
  useEffect(() => {
    const root = document.getElementById("root");
    if (root) { root.style.maxWidth = "none"; root.style.width = "100%"; root.style.padding = "0"; }
    return () => { if (root) { root.style.maxWidth = ""; root.style.width = ""; root.style.padding = ""; } };
  }, []);

  // Load outlets list once
  useEffect(() => {
    fetch(`${API_HOST}/api/remote-ops/outlets`).then(r => r.json()).then(j => setOutlets(j?.data || []))
      .catch(() => setOutlets([]));
  }, []);

  // GPS auto — show clear error & retry instruction if denied
  const grabGps = () => {
    setGpsErr("");
    if (!navigator.geolocation) { setGpsErr("Browser belum mendukung GPS."); return; }
    navigator.geolocation.getCurrentPosition(
      p => { setGps({ lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy) }); setGpsErr(""); },
      e => setGpsErr(e?.code === 1 ? "Izin lokasi belum diberikan" : "GPS belum bisa diakses (sinyal lemah)"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  useEffect(() => { if (step === "fill") grabGps(); }, [step]);

  const startAudit = async () => {
    if (!outletCode || !pin) { setError("Pilih outlet + isi PIN"); return; }
    setError(""); setSubmitting(true);
    try {
      // Check if already submitted today
      const aR = await fetch(`${API_HOST}/api/remote-ops/audit/today?outlet=${encodeURIComponent(outletCode)}`).then(r => r.json());
      if (aR?.submitted) {
        setAlreadySubmitted(aR);
      }
      const tR = await fetch(`${API_HOST}/api/remote-ops/audit/templates?vertical=${vertical}`).then(r => r.json());
      const tpls = tR?.data || [];
      setTemplates(tpls);
      // Pre-fill with empty
      const init = {};
      tpls.forEach(t => { init[t.code] = { rating: 0, photo_b64: null, note: "" }; });
      // If existing, populate
      if (aR?.submitted && aR.items) {
        aR.items.forEach(it => { if (init[it.item_code]) init[it.item_code] = { rating: it.rating, photo_b64: it.photo_filename ? `__existing__${it.photo_filename}` : null, note: it.note || "" }; });
      }
      setItems(init);
      localStorage.setItem("ro_outlet", outletCode);
      localStorage.setItem("ro_outlet_name", outletName);
      localStorage.setItem("ro_manager", managerName);
      localStorage.setItem("ro_vertical", vertical);
      setStep("fill");
    } catch (e) { setError(e.message); }
    setSubmitting(false);
  };

  const updateItem = (code, patch) => setItems(prev => ({ ...prev, [code]: { ...prev[code], ...patch } }));

  // Photo: live camera only (via CameraCapture component) — no gallery upload.
  const onPhoto = (code, dataUrl) => updateItem(code, { photo_b64: dataUrl });

  const completion = (() => {
    const total = templates.length;
    const done = templates.filter(t => (items[t.code]?.rating || 0) > 0 && (!t.requires_photo || items[t.code]?.photo_b64)).length;
    return { total, done, pct: total ? Math.round(done / total * 100) : 0 };
  })();

  const submit = async () => {
    setError("");
    // Validate required photos
    const missing = templates.filter(t => (items[t.code]?.rating || 0) === 0);
    if (missing.length > 0) { setError(`${missing.length} item belum di-rating`); return; }
    const missingPhoto = templates.filter(t => t.requires_photo && !items[t.code]?.photo_b64);
    if (missingPhoto.length > 0) { setError(`${missingPhoto.length} item wajib foto: ${missingPhoto.map(t=>t.label.replace(/^.\s/, "")).slice(0,3).join(", ")}…`); return; }
    if (!submitterSelfie) { setError("Selfie kerja wajib diisi sebelum submit (anti-nitip-PIN)."); return; }
    setSubmitting(true);
    try {
      const payload = {
        outlet_code: outletCode,
        outlet_name: outletName,
        vertical,
        manager_name: managerName || null,
        manager_pin: pin,
        gps_lat: gps?.lat, gps_lon: gps?.lon,
        device_info: navigator.userAgent.slice(0, 200),
        device_id: deviceId,
        submitter_selfie_b64: submitterSelfie,
        notes: notes.trim() || null,
        items: templates.map(t => ({
          code: t.code, label: t.label, rating: items[t.code].rating,
          photo_b64: items[t.code].photo_b64 && !String(items[t.code].photo_b64).startsWith("__existing__") ? items[t.code].photo_b64 : null,
          note: items[t.code].note || null,
        })),
      };
      const r = await fetch(`${API_HOST}/api/remote-ops/audit/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setStep("done");
      setAlreadySubmitted({ audit: { overall_score: j.overall_score }, submitted: true });
    } catch (e) { setError(e.message); }
    setSubmitting(false);
  };

  return (
    <Shell>
      {step === "login" && (
        <LoginStep
          outlets={outlets} outletCode={outletCode} setOutletCode={setOutletCode}
          outletName={outletName} setOutletName={setOutletName}
          managerName={managerName} setManagerName={setManagerName}
          vertical={vertical} setVertical={setVertical}
          pin={pin} setPin={setPin}
          error={error} submitting={submitting} onContinue={startAudit}
        />
      )}
      {step === "fill" && (
        <FillStep
          outletName={outletName} managerName={managerName}
          templates={templates} items={items} updateItem={updateItem} onPhoto={onPhoto}
          gps={gps} gpsErr={gpsErr} grabGps={grabGps} completion={completion} notes={notes} setNotes={setNotes}
          submitterSelfie={submitterSelfie} setSubmitterSelfie={setSubmitterSelfie}
          alreadySubmitted={alreadySubmitted}
          error={error} submitting={submitting} onSubmit={submit}
          onBack={() => setStep("login")}
        />
      )}
      {step === "done" && (
        <DoneStep outletName={outletName} score={alreadySubmitted?.audit?.overall_score} onAgain={() => { setStep("login"); setPin(""); }} />
      )}
    </Shell>
  );
}

// ───────── steps ─────────
function LoginStep({ outlets, outletCode, setOutletCode, outletName, setOutletName, managerName, setManagerName, vertical, setVertical, pin, setPin, error, submitting, onContinue }) {
  return (
    <div style={{ padding: "30px 22px" }}>
      <div style={{ textAlign: "center", marginBottom: 26 }}>
        <div style={{ fontSize: 44, marginBottom: 6 }}>🛰️</div>
        <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 3, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>karyaOS / KROC</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginTop: 4 }}>Daily Outlet Audit</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6, lineHeight: 1.5 }}>Submit foto kondisi outlet pagi ini.<br/>Wajib dari lokasi outlet (GPS).</div>
      </div>

      <Field label="🏪 OUTLET">
        <select value={outletCode} onChange={e => {
          setOutletCode(e.target.value);
          const o = outlets.find(x => x.code === e.target.value);
          if (o) { setOutletName(o.name); setVertical(o.vertical || "fnb"); }
        }} style={inp}>
          <option value="">— Pilih outlet —</option>
          {outlets.map(o => <option key={o.code} value={o.code}>{o.name} ({o.vertical})</option>)}
        </select>
      </Field>
      {!outlets.length && (
        <Field label="Manual Input (Outlet Code)">
          <input value={outletCode} onChange={e => setOutletCode(e.target.value)} placeholder="MIS: KEMANG_01" style={inp} />
          <input value={outletName} onChange={e => setOutletName(e.target.value)} placeholder="Nama outlet" style={{...inp, marginTop:8}} />
          <select value={vertical} onChange={e => setVertical(e.target.value)} style={{...inp, marginTop:8}}>
            <option value="fnb">F&B</option><option value="cinema">Cinema</option>
          </select>
        </Field>
      )}

      <Field label="👤 NAMA MANAGER">
        <input value={managerName} onChange={e => setManagerName(e.target.value)} placeholder="Nama Anda" style={inp} />
      </Field>

      <Field label="🔒 PIN MANAGER (4-6 digit)">
        <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,"").slice(0,6))}
          type="password" inputMode="numeric" pattern="[0-9]*" placeholder="••••"
          style={{...inp, letterSpacing: 8, fontSize: 22, textAlign: "center"}} />
        <div style={{ fontSize: 10, color: "#64748b", marginTop: 6 }}>Default outlet baru: PIN <b>1234</b> (admin bisa ubah)</div>
      </Field>

      {error && <div style={errBox}>⚠ {error}</div>}

      <button onClick={onContinue} disabled={!outletCode || !pin || submitting} style={primaryBtn(!!outletCode && !!pin && !submitting)}>
        {submitting ? "⏳ Loading…" : "Mulai Audit →"}
      </button>
    </div>
  );
}

function FillStep({ outletName, managerName, templates, items, updateItem, onPhoto, gps, gpsErr, grabGps, completion, notes, setNotes, alreadySubmitted, error, submitting, onSubmit, onBack, submitterSelfie, setSubmitterSelfie }) {
  // Group by category
  const groups = templates.reduce((acc, t) => { (acc[t.category || "Lain"] = acc[t.category || "Lain"] || []).push(t); return acc; }, {});
  return (
    <div style={{ padding: "20px 18px 100px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button onClick={onBack} style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: 14, cursor: "pointer" }}>← Ganti outlet</button>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'Geist Mono',monospace" }}>{new Date().toLocaleDateString("id-ID", { weekday:"long", day:"numeric", month:"long" })}</div>
        </div>
      </div>

      <div style={{ padding: 12, background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>🏪 {outletName}</div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Manager: {managerName || "—"}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap", fontSize: 11, color: "#cbd5e1", alignItems: "center" }}>
          {gps ? <span style={{ color: GREEN }}>📍 GPS terkunci ({gps.acc}m)</span> : (
            <button onClick={grabGps} style={{ padding: "4px 10px", background: RED, border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              📍 {gpsErr || "GPS belum tersedia"} — Tap aktifkan
            </button>
          )}
          {alreadySubmitted && <span style={{ color: AMBER }}>⚠ Sudah submit today, submission akan replace</span>}
        </div>
        {gpsErr && !gps && (
          <div style={{ marginTop: 8, padding: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: 11, color: "#fca5a5", lineHeight: 1.55 }}>
            <b>iPhone:</b> Settings → Safari → Lokasi → <b>Tanya</b><br/>
            <b>Android:</b> Tap ikon 🔒 di address bar → Izinkan Lokasi<br/>
            Lalu refresh halaman atau tap tombol di atas.
          </div>
        )}
      </div>

      {/* Completion progress */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
          <span>PROGRESS</span><span>{completion.done}/{completion.total} ({completion.pct}%)</span>
        </div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${completion.pct}%`, height: "100%", background: completion.pct === 100 ? GREEN : PURPLE, transition: "width 0.3s ease" }} />
        </div>
      </div>

      {Object.entries(groups).map(([cat, ts]) => (
        <div key={cat} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 8 }}>{cat.toUpperCase()}</div>
          {ts.map(t => {
            const it = items[t.code] || {};
            return (
              <div key={t.code} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 8 }}>{t.label}{t.requires_photo && <span style={{ color: AMBER, marginLeft: 6, fontSize: 11 }}>📸 wajib</span>}</div>
                {/* Rating */}
                <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 8 }}>
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => updateItem(t.code, { rating: n })} style={{
                      background: "transparent", border: "none", fontSize: 36, cursor: "pointer", lineHeight: 1, padding: 4,
                      color: n <= (it.rating || 0) ? (n >= 4 ? GREEN : n >= 3 ? AMBER : RED) : "rgba(255,255,255,0.18)",
                      transform: n <= (it.rating || 0) ? "scale(1.05)" : "scale(1)", transition: "all 0.15s",
                    }}>★</button>
                  ))}
                </div>
                {/* Photo */}
                {t.requires_photo && (
                  <div>
                    {it.photo_b64 ? (
                      <div style={{ position: "relative" }}>
                        {String(it.photo_b64).startsWith("__existing__") ? (
                          <img src={`${API_HOST}/api/remote-ops/audit/photos/${String(it.photo_b64).replace("__existing__","")}`}
                            alt="" style={{ width: "100%", borderRadius: 8, display: "block" }} />
                        ) : (
                          <img src={it.photo_b64} alt="" style={{ width: "100%", borderRadius: 8, display: "block" }} />
                        )}
                        <button onClick={() => updateItem(t.code, { photo_b64: null })} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 16, fontSize: 18, cursor: "pointer" }}>×</button>
                        <div style={{ position: "absolute", bottom: 6, left: 6, padding: "3px 8px", background: "rgba(0,0,0,0.7)", borderRadius: 4, fontSize: 9, color: GREEN, fontWeight: 700, fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5 }}>✓ LIVE</div>
                      </div>
                    ) : (
                      <CameraCapture facingMode="environment" label="Tap to Ambil Foto" onCapture={(dataUrl) => onPhoto(t.code, dataUrl)} />
                    )}
                  </div>
                )}
                {/* Note */}
                <input value={it.note || ""} onChange={e => updateItem(t.code, { note: e.target.value })}
                  placeholder="Catatan (opsional)" style={{...inp, marginTop: 8, fontSize: 12, padding: "8px 12px"}} />
              </div>
            );
          })}
        </div>
      ))}

      {/* Selfie Kerja — anti-nitip-PIN */}
      <div style={{ marginBottom: 14, padding: 12, background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 12 }}>
        <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 6 }}>🤳 SELFIE KERJA (WAJIB)</div>
        <div style={{ fontSize: 11, color: "#cbd5e1", marginBottom: 10, lineHeight: 1.55 }}>
          Anti-nitip-PIN. Selfie ini menjadi bukti bahwa <b>Anda sendiri</b> yang submit audit, bukan dititipkan ke orang lain.
        </div>
        {submitterSelfie ? (
          <div style={{ position: "relative" }}>
            <img src={submitterSelfie} alt="" style={{ width: "100%", borderRadius: 10, display: "block", maxHeight: 280, objectFit: "cover" }} />
            <button onClick={() => setSubmitterSelfie(null)} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 16, fontSize: 18, cursor: "pointer" }}>×</button>
            <div style={{ position: "absolute", bottom: 6, left: 6, padding: "3px 8px", background: "rgba(0,0,0,0.7)", borderRadius: 4, fontSize: 9, color: GREEN, fontWeight: 700, fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5 }}>✓ SELFIE LIVE</div>
          </div>
        ) : (
          <CameraCapture facingMode="user" label="🤳 Ambil Selfie Kerja Sekarang" onCapture={setSubmitterSelfie} />
        )}
      </div>

      {/* Final notes */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 6 }}>CATATAN UMUM (opsional)</div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Issue atau highlight today…"
          style={{...inp, resize: "vertical", fontFamily: "inherit"}} />
      </div>

      {error && <div style={errBox}>⚠ {error}</div>}

      {/* Fixed submit bar */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: 14, background: "linear-gradient(180deg, rgba(10,15,28,0) 0%, rgba(10,15,28,0.95) 30%)", display: "flex", justifyContent: "center" }}>
        <button onClick={onSubmit} disabled={submitting || completion.pct < 100 || !submitterSelfie} style={{...primaryBtn(!submitting && completion.pct === 100 && !!submitterSelfie), maxWidth: 460, width: "100%"}}>
          {submitting ? "⏳ Submitting…"
           : !submitterSelfie ? "🤳 Selfie kerja wajib"
           : completion.pct < 100 ? `Lengkapi dulu (${completion.done}/${completion.total})`
           : `✓ Submit Audit`}
        </button>
      </div>
    </div>
  );
}

function DoneStep({ outletName, score, onAgain }) {
  const color = score >= 90 ? GREEN : score >= 75 ? "#22d3ee" : score >= 60 ? AMBER : RED;
  return (
    <div style={{ padding: "60px 24px", textAlign: "center", display:"flex",flexDirection:"column",alignItems:"center",gap:10 }}>
      <div style={{ fontSize: 72, lineHeight:1, margin:0, filter: `drop-shadow(0 0 28px ${color}55)` }}>{score >= 75 ? "🎉" : score >= 60 ? "👍" : "⚠️"}</div>
      <div style={{ fontSize: 12, color: PURPLE, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>AUDIT TERSIMPAN</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginTop: 8 }}>{outletName}</div>
      <div style={{ fontSize: 64, fontWeight: 900, color, marginTop: 14, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{score}</div>
      <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 6 }}>dari 100 · Grade {score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : "D"}</div>
      <div style={{ padding: 16, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 12, marginTop: 24, fontSize: 12, color: "#86efac", lineHeight: 1.5 }}>
        Submission ter-broadcast ke Command Center.<br/>OP Head sudah bisa lihat dari dashboard.
      </div>
      <button onClick={onAgain} style={{...primaryBtn(true), marginTop: 18}}>↩ Kembali ke login</button>
    </div>
  );
}

// ───────── shared ─────────
function Shell({ children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)", color: "#e6edf3", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif", overflowY: "auto" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, background: "radial-gradient(700px 500px at 50% 0%, rgba(168,85,247,0.1), transparent 60%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", width: "min(100%, 560px)", margin: "0 auto" }}>{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1.3, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const inp = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10, padding: "12px 14px", color: "#fff",
  fontSize: 14, fontFamily: "inherit", outline: "none",
};

const errBox = { padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, color: "#fca5a5", fontSize: 13, marginBottom: 12 };

const primaryBtn = (enabled) => ({
  width: "100%", padding: "16px 24px",
  background: enabled ? `linear-gradient(135deg,${PURPLE},#7c3aed)` : "rgba(255,255,255,0.06)",
  border: "none", borderRadius: 12, color: enabled ? "#fff" : "rgba(255,255,255,0.35)",
  fontSize: 15, fontWeight: 900, fontFamily: "inherit", letterSpacing: 0.5,
  cursor: enabled ? "pointer" : "not-allowed",
  boxShadow: enabled ? "0 8px 24px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.2)" : "none",
});

// Resize image to max dim, quality
async function resizeImage(file, maxDim = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}
