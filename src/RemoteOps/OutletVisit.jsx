// karyaOS — Outlet Visit Check-in (PWA, mobile-first)
// Route: /?visit
// OP Head / QA / Owner: visit outlet → GPS check-in + selfie arrival photo.
// Anti-fraud: GPS validated against outlet pin (haversine, 200m radius).
import { useEffect, useState } from "react";
import CameraCapture from "../components/CameraCapture.jsx";
import API_HOST from "../apiBase.js";
const CYAN = "#22d3ee", GREEN = "#10b981", AMBER = "#f59e0b", RED = "#ef4444";

export default function OutletVisit() {
  const [outlets, setOutlets] = useState([]);
  const [visitorName, setVisitorName] = useState(localStorage.getItem("ro_visitor") || "");
  const [visitorRole, setVisitorRole] = useState(localStorage.getItem("ro_visitor_role") || "op_head");
  const [outletCode, setOutletCode] = useState("");
  const [outletName, setOutletName] = useState("");
  const [photo, setPhoto] = useState(null);
  const [gps, setGps] = useState(null);
  const [gpsErr, setGpsErr] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const root = document.getElementById("root");
    if (root) { root.style.maxWidth = "none"; root.style.width = "100%"; root.style.padding = "0"; }
    return () => { if (root) { root.style.maxWidth = ""; root.style.width = ""; root.style.padding = ""; } };
  }, []);

  useEffect(() => {
    fetch(`${API_HOST}/api/remote-ops/outlets`).then(r => r.json()).then(j => setOutlets(j?.data || []));
  }, []);

  const grabGps = () => {
    setGpsErr("");
    if (!navigator.geolocation) { setGpsErr("Browser tidak support GPS"); return; }
    navigator.geolocation.getCurrentPosition(
      p => setGps({ lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy) }),
      e => setGpsErr("GPS denied: " + e.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(grabGps, []);

  // Photo now comes from live camera (CameraCapture component) — dataUrl direct
  const onPhoto = (dataUrl) => setPhoto(dataUrl);

  const submit = async () => {
    setError("");
    if (!visitorName || !outletCode || !gps || !photo) { setError("Lengkapi nama, outlet, GPS, foto"); return; }
    setSubmitting(true);
    try {
      localStorage.setItem("ro_visitor", visitorName);
      localStorage.setItem("ro_visitor_role", visitorRole);
      const r = await fetch(`${API_HOST}/api/remote-ops/visits/checkin`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitor_name: visitorName, visitor_role: visitorRole,
          outlet_code: outletCode, outlet_name: outletName,
          gps_lat: gps.lat, gps_lon: gps.lon,
          arrival_photo_b64: photo, notes: notes.trim() || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setResult(j);
    } catch (e) { setError(e.message); }
    setSubmitting(false);
  };

  if (result) return <DoneStep result={result} outletName={outletName} onAgain={() => { setResult(null); setPhoto(null); setNotes(""); }} />;

  return (
    <Shell>
      <div style={{ padding: "30px 22px 100px" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 44, marginBottom: 6 }}>📍</div>
          <div style={{ fontSize: 11, color: CYAN, letterSpacing: 3, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>karyaOS / KROC</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginTop: 4 }}>Visit Check-in</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6, lineHeight: 1.5 }}>Selfie arrival + GPS untuk validasi kunjungan</div>
        </div>

        <Field label="👤 NAMA ANDA">
          <input value={visitorName} onChange={e => setVisitorName(e.target.value)} placeholder="Nama lengkap" style={inp} />
        </Field>

        <Field label="🎯 ROLE">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[["op_head","OP Head"],["qa","QA"],["finance","Finance"],["owner","Owner"]].map(([k,lbl]) => (
              <button key={k} onClick={() => setVisitorRole(k)} style={{
                padding: "8px 14px", border: visitorRole === k ? `1px solid ${CYAN}` : "1px solid rgba(255,255,255,0.1)",
                background: visitorRole === k ? `${CYAN}22` : "rgba(0,0,0,0.3)",
                borderRadius: 8, color: visitorRole === k ? CYAN : "#cbd5e1",
                fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", flex: 1,
              }}>{lbl}</button>
            ))}
          </div>
        </Field>

        <Field label="🏪 OUTLET YANG DIKUNJUNGI">
          <select value={outletCode} onChange={e => {
            setOutletCode(e.target.value);
            const o = outlets.find(x => x.code === e.target.value);
            if (o) setOutletName(o.name);
          }} style={inp}>
            <option value="">— Pilih outlet —</option>
            {outlets.map(o => <option key={o.code} value={o.code}>{o.name} ({o.vertical})</option>)}
          </select>
        </Field>

        <Field label="📍 LOKASI GPS">
          <div style={{ padding: 12, background: "rgba(0,0,0,0.3)", border: `1px solid ${gps ? GREEN + "55" : AMBER + "55"}`, borderRadius: 10 }}>
            {gps ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, color: "#fff", fontWeight: 700 }}>✓ GPS Terkunci</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, fontFamily: "'Geist Mono',monospace" }}>{gps.lat.toFixed(5)}, {gps.lon.toFixed(5)}</div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>Akurasi: {gps.acc}m</div>
                </div>
                <button onClick={grabGps} style={{ padding: "6px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", fontSize: 11, cursor: "pointer" }}>↻ Re-locate</button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: gpsErr ? RED : AMBER, fontWeight: 700, marginBottom: 6 }}>
                  {gpsErr ? "📍 Izin lokasi belum diberikan" : "⏳ Mengambil GPS…"}
                </div>
                {gpsErr && (
                  <div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.55, marginBottom: 8 }}>
                    GPS wajib untuk verifikasi visit. Mohon aktifkan:<br/>
                    <b>iPhone:</b> Pengaturan → Safari → Lokasi → <b>Tanya</b><br/>
                    <b>Android:</b> Tap ikon 🔒 di address bar → Izinkan Lokasi<br/>
                    Setelah itu refresh halaman.
                  </div>
                )}
                <button onClick={grabGps} style={{ padding: "8px 14px", background: AMBER, border: "none", borderRadius: 8, color: "#000", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>📡 Aktifkan GPS</button>
              </>
            )}
          </div>
        </Field>

        <Field label="📸 SELFIE ARRIVAL (KAMERA LANGSUNG)">
          {photo ? (
            <div style={{ position: "relative" }}>
              <img src={photo} alt="" style={{ width: "100%", borderRadius: 10, display: "block" }} />
              <button onClick={() => setPhoto(null)} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 16, fontSize: 18, cursor: "pointer" }}>×</button>
              <div style={{ position: "absolute", bottom: 8, left: 8, padding: "4px 10px", background: "rgba(0,0,0,0.7)", borderRadius: 6, fontSize: 10, color: GREEN, fontWeight: 700, fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5 }}>✓ KAMERA LIVE</div>
            </div>
          ) : (
            <CameraCapture facingMode="user" label="Tap untuk Ambil Selfie" onCapture={onPhoto} />
          )}
        </Field>

        <Field label="📝 CATATAN (opsional)">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Tujuan visit, observasi awal…"
            style={{...inp, resize: "vertical", fontFamily: "inherit"}} />
        </Field>

        {error && <div style={errBox}>⚠ {error}</div>}

        <button onClick={submit} disabled={submitting || !visitorName || !outletCode || !gps || !photo} style={primaryBtn(!submitting && visitorName && outletCode && gps && photo)}>
          {submitting ? "⏳ Submitting…" : "✓ Check-in Sekarang"}
        </button>
      </div>
    </Shell>
  );
}

function DoneStep({ result, outletName, onAgain }) {
  const within = result.within_radius;
  const color = within ? GREEN : RED;
  return (
    <Shell>
      <div style={{ padding: "60px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 72, marginBottom: 14, filter: `drop-shadow(0 0 28px ${color}55)` }}>{within ? "✅" : "⚠️"}</div>
        <div style={{ fontSize: 12, color: CYAN, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>CHECK-IN TERSIMPAN</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginTop: 8 }}>{outletName}</div>
        {result.distance_m != null && (
          <div style={{ fontSize: 48, fontWeight: 900, color, marginTop: 14, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{result.distance_m}m</div>
        )}
        <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 6 }}>
          {within ? "Dalam radius outlet (≤200m) ✓" : result.distance_m != null ? "Di luar radius outlet (>200m)" : "Outlet belum punya pin GPS"}
        </div>
        <div style={{ padding: 16, background: `${color}11`, border: `1px solid ${color}33`, borderRadius: 12, marginTop: 24, fontSize: 12, color: color, lineHeight: 1.5 }}>
          Visit tercatat di Command Center. {within ? "Bisa lanjut audit fisik." : "Anomali GPS akan di-review oleh HQ."}
        </div>
        <button onClick={onAgain} style={{...primaryBtn(true), marginTop: 18}}>↩ Check-in lagi</button>
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "linear-gradient(160deg,#050810 0%,#0c0f1a 50%,#08090f 100%)", color: "#e6edf3", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif", overflowY: "auto" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, background: "radial-gradient(700px 500px at 50% 0%, rgba(34,211,238,0.1), transparent 60%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", maxWidth: 500, margin: "0 auto" }}>{children}</div>
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
  background: enabled ? `linear-gradient(135deg,${CYAN},#0891b2)` : "rgba(255,255,255,0.06)",
  border: "none", borderRadius: 12, color: enabled ? "#001620" : "rgba(255,255,255,0.35)",
  fontSize: 15, fontWeight: 900, fontFamily: "inherit", letterSpacing: 0.5,
  cursor: enabled ? "pointer" : "not-allowed",
  boxShadow: enabled ? "0 8px 24px rgba(34,211,238,0.35), inset 0 1px 0 rgba(255,255,255,0.2)" : "none",
});

async function resizeImage(file, maxDim, quality) {
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
