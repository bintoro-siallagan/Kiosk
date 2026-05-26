// karyaOS — KOLR Field Worker Mobile PWA
// Route: /?launch
// Field worker (per dept) buka di HP → pilih project + dept →
// tick checklist + upload foto evidence + sign-off PIN.
import { useCallback, useEffect, useState } from "react";
import CameraCapture from "../components/CameraCapture.jsx";
import API_HOST from "../apiBase.js";
const PURPLE = "#a855f7", GREEN = "#10b981", AMBER = "#f59e0b", RED = "#ef4444", CYAN = "#22d3ee";

export default function LaunchFieldWorker() {
  const [step, setStep] = useState("pick"); // pick → fill → signoff → done
  const [launches, setLaunches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [activeDept, setActiveDept] = useState(localStorage.getItem("kolr_dept") || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [gps, setGps] = useState(null);
  const [deviceId] = useState(() => {
    let id = localStorage.getItem("ro_device_id");
    if (!id) {
      id = "dev_" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
      localStorage.setItem("ro_device_id", id);
    }
    return id;
  });
  const grabGps = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      p => setGps({ lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy) }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);
  useEffect(() => { grabGps(); }, [grabGps]);

  useEffect(() => {
    const root = document.getElementById("root");
    if (root) { root.style.maxWidth = "none"; root.style.width = "100%"; root.style.padding = "0"; }
    return () => { if (root) { root.style.maxWidth = ""; root.style.width = ""; root.style.padding = ""; } };
  }, []);

  // Load active launches — initial + auto-refresh while on pick step
  const loadLaunches = useCallback(() => {
    setErr("");
    fetch(`${API_HOST}/api/launch/launches?status=in_progress`).then(r => r.ok ? r.json() : r.json().then(j => { throw new Error(j?.error); }))
      .then(j => setLaunches(j?.data || []))
      .catch(e => setErr(e.message));
  }, []);
  useEffect(() => { loadLaunches(); }, [loadLaunches]);
  useEffect(() => {
    if (step !== "pick") return;
    const id = setInterval(loadLaunches, 30_000);
    return () => clearInterval(id);
  }, [step, loadLaunches]);

  const loadDetail = useCallback((id) => {
    setBusy(true); setErr("");
    fetch(`${API_HOST}/api/launch/launches/${id}`).then(r => r.json())
      .then(j => { setDetail(j); setStep("fill"); })
      .catch(e => setErr(e.message))
      .finally(() => setBusy(false));
  }, []);

  const updateTask = async (taskId, patch) => {
    try {
      const r = await fetch(`${API_HOST}/api/launch/tasks/${taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...patch, updated_by: "field-worker" }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error);
      loadDetail(selected.id);
    } catch (e) { alert(e.message); }
  };

  const uploadEvidence = async (taskId, dataUrl) => {
    try {
      const r = await fetch(`${API_HOST}/api/launch/tasks/${taskId}/evidence`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photo_b64: dataUrl, uploaded_by: "field-worker",
          gps_lat: gps?.lat, gps_lon: gps?.lon, device_id: deviceId,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error);
      loadDetail(selected.id);
    } catch (e) { alert(e.message); }
  };

  return (
    <Shell>
      {step === "pick" && (
        <PickStep
          launches={launches}
          activeDept={activeDept} setActiveDept={(d) => { setActiveDept(d); localStorage.setItem("kolr_dept", d); }}
          onPick={(l) => { setSelected(l); loadDetail(l.id); }}
          err={err} onRefresh={loadLaunches}
        />
      )}
      {step === "fill" && detail && activeDept && (
        <FillStep
          launch={selected} detail={detail} activeDept={activeDept}
          onUpdate={updateTask} onUpload={uploadEvidence}
          onBack={() => setStep("pick")}
          onSignoff={() => setStep("signoff")}
          busy={busy}
        />
      )}
      {step === "signoff" && detail && activeDept && (
        <SignoffStep
          launch={selected} detail={detail} activeDept={activeDept}
          gps={gps} grabGps={grabGps} deviceId={deviceId}
          onBack={() => setStep("fill")}
          onDone={() => setStep("done")}
        />
      )}
      {step === "done" && (
        <DoneStep launch={selected} dept={activeDept} onAgain={() => { setStep("pick"); setSelected(null); setDetail(null); }} />
      )}
    </Shell>
  );
}

function PickStep({ launches, activeDept, setActiveDept, onPick, err, onRefresh }) {
  const DEPTS = [
    { code: "construction", label: "🏗️ Construction & Fit-Out" },
    { code: "it", label: "💻 IT & Tech" },
    { code: "hr", label: "👥 HR & Training" },
    { code: "operations", label: "⚙️ Operations" },
    { code: "supply_chain", label: "📦 Supply Chain" },
    { code: "marketing", label: "📢 Marketing" },
    { code: "finance", label: "💰 Finance" },
    { code: "compliance", label: "⚖️ Compliance" },
    { code: "qa", label: "🔍 Quality Assurance" },
  ];

  return (
    <div style={{ padding: "max(20px, env(safe-area-inset-top)) clamp(14px, 4vw, 24px) 30px", boxSizing: "border-box" }}>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <div style={{ fontSize: 40, marginBottom: 4 }}>🚀</div>
        <div style={{ fontSize: 10, color: PURPLE, letterSpacing: 2.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>karyaOS / KOLR</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginTop: 4, lineHeight: 1.2 }}>Outlet Launch · Field Worker</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6, lineHeight: 1.5 }}>Pilih departemen lalu pilih project.</div>
      </div>

      <Field label="🎯 DEPARTEMEN ANDA">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 145px), 1fr))", gap: 6 }}>
          {DEPTS.map(d => (
            <button key={d.code} onClick={() => setActiveDept(d.code)} style={{
              padding: "10px 10px", minHeight: 48,
              background: activeDept === d.code ? PURPLE : "rgba(0,0,0,0.3)",
              border: `1px solid ${activeDept === d.code ? PURPLE : "rgba(255,255,255,0.1)"}`,
              borderRadius: 8, color: activeDept === d.code ? "#fff" : "#cbd5e1",
              fontSize: 11, fontWeight: 700, fontFamily: "inherit",
              cursor: "pointer", textAlign: "left", lineHeight: 1.3,
              wordBreak: "break-word",
            }}>{d.label}</button>
          ))}
        </div>
      </Field>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1.3, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>
          🏪 PROJECT OUTLET AKTIF ({launches.length})
        </div>
        <button onClick={onRefresh} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#cbd5e1", fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
          ↻ Refresh
        </button>
      </div>

      {err && <div style={{ padding: 10, background: "rgba(239,68,68,0.1)", border: `1px solid ${RED}55`, borderRadius: 8, color: "#fca5a5", fontSize: 12, marginBottom: 10 }}>⚠ {err}</div>}

      {launches.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 13, marginBottom: 14 }}>Belum ada project outlet aktif</div>
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
            Project dibuat oleh admin via Launch Tracker.<br/>
            Sudah dibuat tapi tidak muncul? Tap Refresh.
          </div>
          <button onClick={onRefresh} style={{ padding: "10px 18px", background: PURPLE, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
            ↻ Refresh Sekarang
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {launches.map(l => {
            const daysToOpen = Math.floor((l.target_open_date - Date.now()/1000) / 86400);
            const myDept = activeDept ? l.readiness.by_department[activeDept] : null;
            return (
              <button key={l.id} onClick={() => activeDept && onPick(l)} disabled={!activeDept}
                style={{
                  padding: 14, background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12,
                  color: "#fff", fontFamily: "inherit", cursor: activeDept ? "pointer" : "not-allowed",
                  textAlign: "left", opacity: activeDept ? 1 : 0.5,
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'Geist Mono',monospace" }}>{l.outlet_code}</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", marginTop: 2 }}>{l.outlet_name}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                      Buka: {new Date(l.target_open_date * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: daysToOpen <= 7 ? RED : daysToOpen <= 14 ? AMBER : GREEN }}>T-{daysToOpen}</div>
                    {myDept && (
                      <div style={{ marginTop: 4, padding: "3px 8px", background: myDept.signed_off ? GREEN : `${myDept.pct >= 75 ? GREEN : myDept.pct >= 50 ? AMBER : RED}33`, color: myDept.signed_off ? "#000" : "#fff", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                        {myDept.signed_off ? "✓ SIGNED" : `${myDept.pct}%`}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!activeDept && (
        <div style={{ marginTop: 16, padding: 12, background: "rgba(245,158,11,0.08)", border: `1px solid ${AMBER}55`, borderRadius: 8, fontSize: 11, color: "#fde68a", textAlign: "center" }}>
          👆 Pilih departemen Anda dulu sebelum lanjut.
        </div>
      )}
    </div>
  );
}

function FillStep({ launch, detail, activeDept, onUpdate, onUpload, onBack, onSignoff, busy }) {
  const dept = detail.departments.find(d => d.code === activeDept);
  const tasks = detail.tasks.filter(t => t.department === activeDept);
  const signoff = detail.signoffs.find(s => s.department === activeDept);
  const readiness = detail.readiness.by_department[activeDept];
  const stages = detail.stages.filter(s => tasks.some(t => t.stage === s.code));

  return (
    <div style={{ padding: "max(16px, env(safe-area-inset-top)) clamp(12px, 4vw, 22px) calc(110px + env(safe-area-inset-bottom))", boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button onClick={onBack} style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: 14, cursor: "pointer", padding: "8px 4px" }}>← Ganti project</button>
      </div>

      <div style={{ padding: 12, background: `${dept.color}11`, border: `1px solid ${dept.color}44`, borderRadius: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: dept.color, fontWeight: 800 }}>{dept.label}</div>
        <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", marginTop: 2 }}>🏪 {launch.outlet_name}</div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
          Target buka: {new Date(launch.target_open_date * 1000).toLocaleDateString("id-ID")}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
          <span>PROGRESS DEPT</span>
          <span style={{ fontWeight: 800, color: readiness?.pct >= 100 ? GREEN : PURPLE, fontFamily: "'Geist Mono',monospace" }}>{readiness?.done || 0}/{readiness?.total || 0} • {readiness?.pct || 0}%</span>
        </div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${readiness?.pct || 0}%`, height: "100%", background: readiness?.pct >= 100 ? GREEN : PURPLE, transition: "width 0.3s" }} />
        </div>
      </div>

      {signoff && (
        <div style={{ padding: 12, background: "rgba(16,185,129,0.08)", border: `1px solid ${GREEN}`, borderRadius: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: GREEN, fontWeight: 800 }}>✓ SUDAH SIGN-OFF</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginTop: 4 }}>{signoff.signed_by_name}</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(signoff.signed_at * 1000).toLocaleString("id-ID")}</div>
        </div>
      )}

      {stages.map(s => {
        const stageTasks = tasks.filter(t => t.stage === s.code);
        return (
          <div key={s.code} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: s.color, letterSpacing: 1.5, fontWeight: 800, fontFamily: "'Geist Mono',monospace", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: s.color }} />
              {s.label} ({stageTasks.filter(t => t.status === "done").length}/{stageTasks.length})
            </div>
            {stageTasks.map(t => <TaskItem key={t.id} task={t} onUpdate={onUpdate} onUpload={onUpload} disabled={!!signoff} />)}
          </div>
        );
      })}

      {!signoff && readiness?.can_signoff && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          padding: `14px clamp(12px, 4vw, 22px) calc(14px + env(safe-area-inset-bottom))`,
          background: "linear-gradient(180deg, transparent, rgba(10,15,28,0.95) 30%)",
          display: "flex", justifyContent: "center", boxSizing: "border-box",
        }}>
          <button onClick={onSignoff} style={{ maxWidth: 460, width: "100%", padding: "16px 24px", background: `linear-gradient(135deg,${GREEN},#059669)`, border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 900, fontFamily: "inherit", cursor: "pointer", boxShadow: "0 8px 24px rgba(16,185,129,0.4)" }}>
            🔏 Lanjut ke Sign-off
          </button>
        </div>
      )}
    </div>
  );
}

function TaskItem({ task, onUpdate, onUpload, disabled }) {
  const statusColor = (s) => s === "done" ? GREEN : s === "blocked" ? RED : s === "in_progress" ? AMBER : s === "na" ? "#64748b" : "#475569";

  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 12, marginBottom: 8 }}>
      <div style={{ fontSize: 13, color: "#fff", fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>
        {task.item_label}
        {task.requires_photo === 1 && <span style={{ color: AMBER, marginLeft: 6, fontSize: 10 }}>📸 wajib</span>}
      </div>

      {/* Status pills */}
      <div style={{ display: "flex", gap: 4, marginBottom: task.requires_photo === 1 ? 10 : 0, flexWrap: "wrap" }}>
        {[["pending","Pending"],["in_progress","Progress"],["done","Done"],["blocked","Blocked"],["na","N/A"]].map(([k,lbl]) => (
          <button key={k} disabled={disabled} onClick={() => onUpdate(task.id, { status: k })} style={{
            padding: "5px 10px",
            background: task.status === k ? statusColor(k) : "transparent",
            border: `1px solid ${task.status === k ? statusColor(k) : "rgba(255,255,255,0.15)"}`,
            borderRadius: 6,
            color: task.status === k ? (k === "done" || k === "in_progress" ? "#fff" : "#000") : statusColor(k),
            fontSize: 10, fontWeight: 700, fontFamily: "'Geist Mono',monospace",
            cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
            letterSpacing: 0.3,
          }}>{lbl}</button>
        ))}
      </div>

      {task.requires_photo === 1 && (
        <div style={{ marginTop: 8 }}>
          {task.evidence?.length > 0 && (
            <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
              {task.evidence.map(fn => (
                <img key={fn} src={`${API_HOST}/api/launch/evidence/${fn}`} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)" }} />
              ))}
            </div>
          )}
          {!disabled ? (
            <CameraCapture facingMode="environment" label={task.evidence?.length > 0 ? "📸 Tambah Foto Lagi" : "📸 Ambil Foto Bukti"} onCapture={(dataUrl) => onUpload(task.id, dataUrl)} />
          ) : task.evidence?.length === 0 && (
            <div style={{ fontSize: 11, color: AMBER, padding: "8px 12px", background: "rgba(245,158,11,0.08)", border: `1px solid ${AMBER}33`, borderRadius: 8 }}>⚠ Foto bukti belum di-upload</div>
          )}
        </div>
      )}
    </div>
  );
}

function SignoffStep({ launch, detail, activeDept, gps, grabGps, deviceId, onBack, onDone }) {
  const dept = detail.departments.find(d => d.code === activeDept);
  const [name, setName] = useState(localStorage.getItem("kolr_signer") || "");
  const [pin, setPin] = useState("");
  const [comment, setComment] = useState("");
  const [selfie, setSelfie] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    if (!name || !pin) { setErr("Nama + PIN wajib"); return; }
    if (!selfie) { setErr("Selfie kerja wajib (anti-nitip-PIN)"); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API_HOST}/api/launch/launches/${launch.id}/signoff`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department: activeDept, signed_by_name: name, pin, comment,
          selfie_b64: selfie, gps_lat: gps?.lat, gps_lon: gps?.lon, device_id: deviceId,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error);
      localStorage.setItem("kolr_signer", name);
      onDone();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div style={{ padding: "30px 22px" }}>
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: 14, cursor: "pointer", marginBottom: 10 }}>← Kembali</button>

      <div style={{ padding: 14, background: `${dept.color}11`, border: `1px solid ${dept.color}55`, borderRadius: 12, marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: dept.color, letterSpacing: 1.5, fontWeight: 800 }}>SIGN-OFF DEPARTEMEN</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", marginTop: 4 }}>{dept.label}</div>
        <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 6 }}>{launch.outlet_name} — {launch.outlet_code}</div>
      </div>

      <div style={{ padding: 12, background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 10, marginBottom: 18, fontSize: 12, color: "#cbd5e1", lineHeight: 1.55 }}>
        ⚠ <b>Setelah sign-off:</b> task departemen ini akan <b>terkunci</b>. Untuk edit task, dept lead lain harus revoke signoff via admin panel.
      </div>

      <Field label="👤 NAMA DEPT LEAD"><input value={name} onChange={e => setName(e.target.value)} placeholder="Nama lengkap" style={inp} /></Field>
      <Field label="🔒 PIN DEPT LEAD (4-6 digit)">
        <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,"").slice(0,6))}
          type="password" inputMode="numeric" placeholder="••••"
          style={{...inp, letterSpacing: 8, fontSize: 22, textAlign: "center"}} />
      </Field>

      {/* Selfie kerja wajib */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1.3, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 6 }}>🤳 SELFIE KERJA (WAJIB)</div>
        {selfie ? (
          <div style={{ position: "relative" }}>
            <img src={selfie} alt="" style={{ width: "100%", borderRadius: 10, display: "block", maxHeight: 280, objectFit: "cover" }} />
            <button onClick={() => setSelfie(null)} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 16, fontSize: 18, cursor: "pointer" }}>×</button>
            <div style={{ position: "absolute", bottom: 6, left: 6, padding: "3px 8px", background: "rgba(0,0,0,0.7)", borderRadius: 4, fontSize: 9, color: GREEN, fontWeight: 700, fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5 }}>✓ SELFIE LIVE</div>
          </div>
        ) : (
          <CameraCapture facingMode="user" label="🤳 Ambil Selfie Sekarang" onCapture={setSelfie} />
        )}
      </div>

      {gps ? (
        <div style={{ marginBottom: 12, padding: 10, background: "rgba(16,185,129,0.06)", border: `1px solid ${GREEN}33`, borderRadius: 8, fontSize: 11, color: "#86efac", fontFamily: "'Geist Mono',monospace" }}>
          📍 GPS terkunci ({gps.acc}m) — {gps.lat.toFixed(4)}, {gps.lon.toFixed(4)}
        </div>
      ) : (
        <button onClick={grabGps} style={{ marginBottom: 12, padding: "8px 12px", background: AMBER, border: "none", borderRadius: 8, color: "#000", fontSize: 12, fontWeight: 700, cursor: "pointer", width: "100%" }}>📡 Aktifkan GPS (opsional)</button>
      )}

      <Field label="💬 KOMENTAR (opsional)"><textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} placeholder="Catatan untuk audit trail…" style={{...inp, fontFamily: "inherit", resize: "vertical"}} /></Field>

      {err && <div style={{ padding: 10, background: "rgba(239,68,68,0.1)", border: `1px solid ${RED}55`, borderRadius: 8, color: "#fca5a5", fontSize: 12, marginBottom: 10 }}>⚠ {err}</div>}

      <button onClick={submit} disabled={busy || !name || !pin} style={{
        width: "100%", padding: "16px 24px",
        background: name && pin && !busy ? `linear-gradient(135deg,${GREEN},#059669)` : "rgba(255,255,255,0.06)",
        border: "none", borderRadius: 12, color: name && pin && !busy ? "#fff" : "rgba(255,255,255,0.35)",
        fontSize: 15, fontWeight: 900, fontFamily: "inherit", letterSpacing: 0.5,
        cursor: name && pin && !busy ? "pointer" : "not-allowed",
        boxShadow: name && pin && !busy ? "0 8px 24px rgba(16,185,129,0.35)" : "none",
      }}>
        {busy ? "⏳ Submitting…" : "🔏 Konfirmasi Sign-off"}
      </button>
    </div>
  );
}

function DoneStep({ launch, dept, onAgain }) {
  return (
    <div style={{ padding: "60px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 72, marginBottom: 14, filter: `drop-shadow(0 0 28px ${GREEN}55)` }}>✓</div>
      <div style={{ fontSize: 12, color: PURPLE, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>SIGN-OFF TERSIMPAN</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginTop: 8 }}>{launch.outlet_name}</div>
      <div style={{ fontSize: 13, color: "#cbd5e1", marginTop: 6 }}>Departemen <b>{dept}</b> sudah resmi sign-off</div>
      <div style={{ padding: 14, background: "rgba(16,185,129,0.08)", border: `1px solid ${GREEN}33`, borderRadius: 12, marginTop: 24, fontSize: 12, color: "#86efac", lineHeight: 1.55 }}>
        Audit trail tercatat. Admin & GM dapat melihat sign-off ini di Launch Tracker.<br/>Project lanjut menunggu sign-off dept lain.
      </div>
      <button onClick={onAgain} style={{ marginTop: 18, width: "100%", padding: "14px 24px", background: PURPLE, border: "none", borderRadius: 12, color: "#fff", fontWeight: 800, fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>↩ Kembali ke awal</button>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "linear-gradient(160deg,#0a1428 0%,#152348 50%,#1e3a8a 100%)",
      color: "#e6edf3", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
      overflowY: "auto", overflowX: "hidden",
      WebkitOverflowScrolling: "touch",
    }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, background: "radial-gradient(700px 500px at 50% 0%, rgba(168,85,247,0.1), transparent 60%)", pointerEvents: "none" }} />
      <div style={{
        position: "relative",
        width: "min(100%, 560px)",
        margin: "0 auto",
        boxSizing: "border-box",
      }}>{children}</div>
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
