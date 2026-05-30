// karyaOS — Service Staff Mobile PWA (?service)
// Staff buka di HP → ketik nama → lihat tiket assigned untuk dia →
// pilih tiket → checklist + foto + selfie + GPS verified → submit.
import { useCallback, useEffect, useState } from "react";
import CameraCapture from "../components/CameraCapture.jsx";
import API_HOST from "../apiBase.js";

const PURPLE = "#a855f7", GREEN = "#10b981", AMBER = "#f59e0b", RED = "#ef4444", CYAN = "#22d3ee";

export default function ServiceStaff() {
  const [step, setStep] = useState("login"); // login | tickets | start | work | finish | done
  const [staffName, setStaffName] = useState(localStorage.getItem("kfs_staff") || "");
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [gps, setGps] = useState(null);
  const [gpsErr, setGpsErr] = useState("");
  const [deviceId] = useState(() => {
    let id = localStorage.getItem("ro_device_id");
    if (!id) {
      id = "dev_" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
      localStorage.setItem("ro_device_id", id);
    }
    return id;
  });
  const [startSelfie, setStartSelfie] = useState(null);
  const [finishSelfie, setFinishSelfie] = useState(null);
  const [finishSummary, setFinishSummary] = useState("");
  // Airplane mode — bypass GPS dengan manager approval (audit logged)
  const [gpsBypass, setGpsBypass] = useState(false);
  const [gpsBypassReason, setGpsBypassReason] = useState("");
  const [gpsBypassApprover, setGpsBypassApprover] = useState("");

  useEffect(() => {
    const root = document.getElementById("root");
    if (root) { root.style.maxWidth = "none"; root.style.width = "100%"; root.style.padding = "0"; }
    return () => { if (root) { root.style.maxWidth = ""; root.style.width = ""; root.style.padding = ""; } };
  }, []);

  const grabGps = useCallback(() => {
    setGpsErr("");
    if (!navigator.geolocation) { setGpsErr("Browser tidak support GPS"); return; }
    navigator.geolocation.getCurrentPosition(
      p => setGps({ lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy) }),
      e => setGpsErr(e.code === 1 ? "Izin lokasi belum diberikan" : "GPS belum bisa diakses"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => { if (step !== "login" && step !== "done") grabGps(); }, [step, grabGps]);

  const loadTickets = useCallback(() => {
    if (!staffName) return;
    setBusy(true); setErr("");
    fetch(`${API_HOST}/api/service/tickets?assigned_to_name=${encodeURIComponent(staffName)}`)
      .then(r => r.json())
      .then(j => setTickets((j?.data || []).filter(t => t.status === "open" || t.status === "in_progress")))
      .catch(e => setErr(e.message))
      .finally(() => setBusy(false));
  }, [staffName]);

  const loginContinue = () => {
    if (!staffName.trim()) { setErr("Nama wajib diisi"); return; }
    localStorage.setItem("kfs_staff", staffName.trim());
    setErr("");
    setStep("tickets");
    loadTickets();
  };

  const pickTicket = async (t) => {
    setSelectedTicket(t);
    setBusy(true);
    try {
      const j = await fetch(`${API_HOST}/api/service/tickets/${t.id}`).then(r => r.json());
      setDetail(j);
      if (t.status === "in_progress") setStep("work");
      else setStep("start");
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const startTicket = async () => {
    setErr("");
    if (!startSelfie) { setErr("Selfie kerja wajib"); return; }
    if (!gps && !gpsBypass) { setErr("GPS wajib di-aktifkan (atau pakai Mode Pesawat dengan approval manager)"); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API_HOST}/api/service/tickets/${selectedTicket.id}/start`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selfie_b64: startSelfie,
          gps_lat: gps?.lat ?? null, gps_lon: gps?.lon ?? null,
          device_id: deviceId,
          gps_bypass: gpsBypass ? 1 : 0,
          gps_bypass_reason: gpsBypassReason || null,
          gps_bypass_approver: gpsBypassApprover || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error);
      const detailRes = await fetch(`${API_HOST}/api/service/tickets/${selectedTicket.id}`).then(r => r.json());
      setDetail(detailRes);
      setStep("work");
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const updateItemStatus = async (itemId, status, note) => {
    try {
      const body = {};
      if (status !== undefined) body.status = status;
      if (note !== undefined) body.note = note;
      await fetch(`${API_HOST}/api/service/tickets/${selectedTicket.id}/items/${itemId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await fetch(`${API_HOST}/api/service/tickets/${selectedTicket.id}`).then(r => r.json());
      setDetail(j);
    } catch (e) { alert(e.message); }
  };

  const uploadItemPhoto = async (itemId, dataUrl) => {
    try {
      const r = await fetch(`${API_HOST}/api/service/tickets/${selectedTicket.id}/items/${itemId}/photo`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_b64: dataUrl, gps_lat: gps?.lat, gps_lon: gps?.lon }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error);
      const detailRes = await fetch(`${API_HOST}/api/service/tickets/${selectedTicket.id}`).then(r => r.json());
      setDetail(detailRes);
    } catch (e) { alert(e.message); }
  };

  const finishTicket = async () => {
    setErr("");
    if (!finishSelfie) { setErr("Selfie penutup wajib"); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API_HOST}/api/service/tickets/${selectedTicket.id}/finish`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selfie_b64: finishSelfie, summary: finishSummary, gps_lat: gps?.lat, gps_lon: gps?.lon }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error);
      setStep("done");
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <Shell>
      {step === "login" && <LoginStep staffName={staffName} setStaffName={setStaffName} err={err} onContinue={loginContinue} />}
      {step === "tickets" && <TicketsStep staffName={staffName} tickets={tickets} busy={busy} err={err} onPick={pickTicket} onRefresh={loadTickets} onLogout={() => { setStaffName(""); setStep("login"); }} />}
      {step === "start" && selectedTicket && (
        <StartStep ticket={selectedTicket} detail={detail} gps={gps} gpsErr={gpsErr} grabGps={grabGps}
          selfie={startSelfie} setSelfie={setStartSelfie} busy={busy} err={err}
          gpsBypass={gpsBypass} setGpsBypass={setGpsBypass}
          gpsBypassReason={gpsBypassReason} setGpsBypassReason={setGpsBypassReason}
          gpsBypassApprover={gpsBypassApprover} setGpsBypassApprover={setGpsBypassApprover}
          onStart={startTicket} onBack={() => setStep("tickets")} />
      )}
      {step === "work" && detail && (
        <WorkStep ticket={selectedTicket} detail={detail} gps={gps}
          onUpdate={updateItemStatus} onUpload={uploadItemPhoto}
          onRefresh={async () => {
            const j = await fetch(`${API_HOST}/api/service/tickets/${selectedTicket.id}`).then(r => r.json());
            setDetail(j);
          }}
          onFinish={() => setStep("finish")} onBack={() => setStep("tickets")} />
      )}
      {step === "finish" && (
        <FinishStep ticket={selectedTicket} selfie={finishSelfie} setSelfie={setFinishSelfie}
          summary={finishSummary} setSummary={setFinishSummary} busy={busy} err={err}
          onFinish={finishTicket} onBack={() => setStep("work")} />
      )}
      {step === "done" && <DoneStep ticket={selectedTicket} onAgain={() => { setSelectedTicket(null); setDetail(null); setStartSelfie(null); setFinishSelfie(null); setFinishSummary(""); setStep("tickets"); loadTickets(); }} />}
    </Shell>
  );
}

function LoginStep({ staffName, setStaffName, err, onContinue }) {
  return (
    <div style={{ padding: "max(30px, env(safe-area-inset-top)) clamp(14px, 4vw, 24px) 30px" }}>
      <div style={{ textAlign: "center", marginBottom: 26 }}>
        <div style={{ fontSize: 44, marginBottom: 6 }}>🔧</div>
        <div style={{ fontSize: 10, color: PURPLE, letterSpacing: 2.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>karyaOS / KFS</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginTop: 4 }}>Service Field Staff</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6, lineHeight: 1.5 }}>Ketik nama Anda untuk melihat tiket yang ditugaskan.</div>
      </div>
      <Field label="👤 NAMA ANDA">
        <input value={staffName} onChange={e => setStaffName(e.target.value)} onKeyDown={e => e.key === "Enter" && onContinue()} placeholder="Nama lengkap (sama dengan assignment)" style={inp} />
      </Field>
      {err && <div style={errBox}>⚠ {err}</div>}
      <button onClick={onContinue} disabled={!staffName.trim()} style={primaryBtn(!!staffName.trim())}>Lihat Tiket Saya →</button>
    </div>
  );
}

function TicketsStep({ staffName, tickets, busy, err, onPick, onRefresh, onLogout }) {
  return (
    <div style={{ padding: "max(16px, env(safe-area-inset-top)) clamp(12px, 4vw, 22px) 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'Geist Mono',monospace" }}>KFS · {tickets.length} TIKET AKTIF</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>👤 {staffName}</div>
        </div>
        <button onClick={onLogout} style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: 12, cursor: "pointer" }}>Ganti</button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button onClick={onRefresh} disabled={busy} style={{ flex: 1, padding: 10, background: PURPLE, border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>{busy ? "⏳ Loading…" : "↻ Refresh"}</button>
      </div>
      {err && <div style={errBox}>⚠ {err}</div>}
      {tickets.length === 0 && !busy ? (
        <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 13 }}>Tidak ada tiket aktif untuk Anda</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tickets.map(t => (
            <button key={t.id} onClick={() => onPick(t)} style={{
              padding: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12, color: "#fff", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
              borderLeft: `4px solid ${priColor(t.priority)}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{t.ticket_no}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginTop: 2 }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 4 }}>🏪 {t.outlet_name || t.outlet_code}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={chip(t.status === "in_progress" ? CYAN : AMBER)}>{t.status === "in_progress" ? "WORKING" : "READY"}</span>
                  <div style={{ marginTop: 4 }}><span style={chip(priColor(t.priority))}>{t.priority.toUpperCase()}</span></div>
                </div>
              </div>
              {t.due_at && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>📅 SLA: {new Date(t.due_at * 1000).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StartStep({ ticket, detail, gps, gpsErr, grabGps, selfie, setSelfie, busy, err, onStart, onBack, gpsBypass, setGpsBypass, gpsBypassReason, setGpsBypassReason, gpsBypassApprover, setGpsBypassApprover }) {
  return (
    <div style={{ padding: "max(16px, env(safe-area-inset-top)) clamp(12px, 4vw, 22px) 30px" }}>
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: 13, cursor: "pointer", marginBottom: 10 }}>← Kembali</button>

      <div style={{ padding: 14, background: PURPLE + "11", border: `1px solid ${PURPLE}55`, borderRadius: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: PURPLE, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>{ticket.ticket_no}</div>
        <div style={{ fontSize: 17, fontWeight: 900, color: "#fff", marginTop: 4 }}>{ticket.title}</div>
        <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 4 }}>🏪 {ticket.outlet_name || ticket.outlet_code}</div>
        {ticket.description && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6, lineHeight: 1.5 }}>{ticket.description}</div>}
      </div>

      {/* Checklist preview BEFORE start — biar staff persiapan (foto sebelum dll) */}
      {detail?.items?.length > 0 && (
        <div style={{ marginBottom: 16, padding: 14, background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#22d3ee", letterSpacing: 1, fontFamily: "'Geist Mono',monospace" }}>
              📋 PREVIEW CHECKLIST ({detail.items.length} item)
            </div>
            <div style={{ fontSize: 10, color: "#7d8590" }}>Persiapan dulu sebelum mulai</div>
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto", borderRadius: 8, background: "rgba(0,0,0,0.2)" }}>
            {detail.items.map((it, idx) => (
              <div key={it.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", borderBottom: idx < detail.items.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <span style={{ fontSize: 11, color: "#22d3ee", fontFamily: "'Geist Mono',monospace", fontWeight: 700, minWidth: 22 }}>{String(idx + 1).padStart(2, "0")}</span>
                <span style={{ fontSize: 12, color: "#cbd5e1", flex: 1, lineHeight: 1.4 }}>{it.item_label}</span>
                {it.requires_photo === 1 && <span style={{ fontSize: 10, color: AMBER, fontWeight: 700, whiteSpace: "nowrap" }}>📸</span>}
              </div>
            ))}
          </div>
          {detail.items.filter(i => i.requires_photo === 1).length > 0 && (
            <div style={{ marginTop: 8, fontSize: 10.5, color: AMBER, fontFamily: "'Geist Mono',monospace" }}>
              📸 {detail.items.filter(i => i.requires_photo === 1).length} item butuh foto bukti
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", marginBottom: 10 }}>📍 1. AKTIFKAN GPS</div>
      <div style={{ marginBottom: 14, padding: 12, background: "rgba(0,0,0,0.3)", border: `1px solid ${gps ? GREEN+'55' : gpsBypass ? "#a855f755" : AMBER+'55'}`, borderRadius: 10 }}>
        {gps ? (
          <div style={{ fontSize: 12, color: GREEN, fontFamily: "'Geist Mono',monospace" }}>✓ GPS Terkunci ({gps.acc}m)</div>
        ) : gpsBypass ? (
          <div>
            <div style={{ fontSize: 12, color: "#c084fc", fontWeight: 700, fontFamily: "'Geist Mono',monospace" }}>✈️ MODE PESAWAT AKTIF — GPS di-bypass</div>
            <div style={{ fontSize: 11, color: "#a855f7", marginTop: 4 }}>Approver: {gpsBypassApprover || "?"} · Alasan: {gpsBypassReason || "-"}</div>
            <button onClick={() => { setGpsBypass(false); setGpsBypassReason(""); setGpsBypassApprover(""); }} style={{ marginTop: 6, padding: "5px 10px", background: "transparent", border: "1px solid rgba(168,85,247,0.4)", borderRadius: 6, color: "#c084fc", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>↺ Nyalakan GPS lagi</button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: AMBER, marginBottom: 6 }}>{gpsErr || "Mengambil GPS…"}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button onClick={grabGps} style={{ padding: "6px 12px", background: AMBER, border: "none", borderRadius: 6, color: "#000", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>📡 Coba Lagi</button>
              <button onClick={async () => {
                const reason = window.prompt("⚠️ Mode pesawat butuh manager approval.\n\nAlasan bypass GPS (indoor / signal lemah / dll):");
                if (!reason || !reason.trim()) return;
                const pin = window.prompt("Manager PIN (audit log):");
                if (!pin || !pin.trim()) return;
                setGpsBypass(true);
                setGpsBypassReason(reason.trim());
                setGpsBypassApprover(`PIN:${pin.trim().slice(0, 4)}***`);
              }} style={{ padding: "6px 12px", background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.4)", borderRadius: 6, color: "#c084fc", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✈️ Mode Pesawat</button>
            </div>
          </>
        )}
      </div>

      <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", marginBottom: 10 }}>🤳 2. SELFIE KERJA (ANTI-NITIP-ID)</div>
      <div style={{ marginBottom: 14 }}>
        {selfie ? (
          <div style={{ position: "relative" }}>
            <img src={selfie} alt="" style={{ width: "100%", borderRadius: 10, maxHeight: 280, objectFit: "cover" }} />
            <button onClick={() => setSelfie(null)} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 16, fontSize: 18, cursor: "pointer" }}>×</button>
          </div>
        ) : <CameraCapture facingMode="user" label="🤳 Ambil Selfie Kerja" onCapture={setSelfie} />}
      </div>

      {err && <div style={errBox}>⚠ {err}</div>}

      <button onClick={onStart} disabled={busy || !selfie || (!gps && !gpsBypass)} style={primaryBtn(!busy && selfie && (gps || gpsBypass))}>
        {busy ? "⏳ Starting…" : gpsBypass ? "▶ Mulai (Mode Pesawat)" : "▶ Mulai Tiket"}
      </button>
    </div>
  );
}

function WorkStep({ ticket, detail, gps, onUpdate, onUpload, onRefresh, onFinish, onBack }) {
  const allDone = detail.items?.every(i => i.status !== "pending");
  // Auto-poll setiap 20s biar item baru dari admin muncul live tanpa staff harus refresh manual
  useEffect(() => {
    if (!onRefresh) return;
    const t = setInterval(() => { onRefresh(); }, 20000);
    return () => clearInterval(t);
  }, [onRefresh]);
  return (
    <div style={{ padding: "max(16px, env(safe-area-inset-top)) clamp(12px, 4vw, 22px) calc(100px + env(safe-area-inset-bottom))" }}>
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: 13, cursor: "pointer", marginBottom: 10 }}>← Tiket lain</button>

      <div style={{ padding: 12, background: CYAN + "11", border: `1px solid ${CYAN}55`, borderRadius: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: CYAN, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>{ticket.ticket_no} · IN PROGRESS</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginTop: 2 }}>{ticket.title}</div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1.5, fontWeight: 700, fontFamily: "'Geist Mono',monospace" }}>📋 CHECKLIST ({detail.items?.filter(i => i.status !== "pending").length}/{detail.items?.length})</div>
        <button onClick={onRefresh} title="Refresh checklist (admin bisa tambah item live)" style={{ padding: "4px 10px", background: "transparent", border: "1px solid rgba(34,211,238,0.4)", borderRadius: 6, color: CYAN, fontSize: 10, fontWeight: 700, fontFamily: "'Geist Mono',monospace", cursor: "pointer" }}>↻ Sync</button>
      </div>

      {detail.items?.map(it => (
        <div key={it.id} style={{ padding: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 13, color: "#fff", fontWeight: 600, marginBottom: 8 }}>
            {it.item_label}
            {it.requires_photo === 1 && <span style={{ color: AMBER, marginLeft: 6, fontSize: 10 }}>📸 wajib</span>}
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: it.requires_photo === 1 ? 10 : 0, flexWrap: "wrap" }}>
            {/* Tombol "Skip" dihapus — semua task WAJIB done (anti shortcut). Manager waiver via admin tracker untuk emergency. */}
            {[["pending","Pending"],["done","Done"]].map(([k,lbl]) => (
              <button key={k} onClick={() => onUpdate(it.id, k)} style={{
                padding: "6px 12px",
                background: it.status === k ? statusColor(k) : "transparent",
                border: `1px solid ${it.status === k ? statusColor(k) : "rgba(255,255,255,0.15)"}`,
                borderRadius: 6, color: it.status === k ? (k === "done" ? "#fff" : "#000") : statusColor(k),
                fontSize: 11, fontWeight: 700, fontFamily: "'Geist Mono',monospace", cursor: "pointer",
              }}>{lbl}</button>
            ))}
          </div>
          {it.requires_photo === 1 && (
            <>
              {it.photos?.length > 0 && (
                <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
                  {it.photos.map(p => <img key={p} src={`${API_HOST}/api/service/photo/${p}`} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)" }} />)}
                </div>
              )}
              <CameraCapture facingMode="environment" label={it.photos?.length > 0 ? "📸 Tambah Foto" : "📸 Ambil Foto Bukti"} onCapture={(d) => onUpload(it.id, d)} />
            </>
          )}
          {/* Catatan staff per item — opsional, simpan via PATCH note */}
          <NoteEditor itemId={it.id} initial={it.note} onSave={(note) => onUpdate(it.id, undefined, note)} />
          {/* Signature staff per item — digital sign as proof of work */}
          <SignaturePad ticketId={ticket.id} itemId={it.id} initial={it.signature_filename} onSaved={onRefresh} />
        </div>
      ))}

      {allDone && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: `14px clamp(12px, 4vw, 22px) calc(14px + env(safe-area-inset-bottom))`, background: "linear-gradient(180deg, transparent, rgba(10,15,28,0.95) 30%)" }}>
          <button onClick={onFinish} style={{ width: "100%", maxWidth: 500, margin: "0 auto", display: "block", padding: "16px 24px", background: `linear-gradient(135deg,${GREEN},#059669)`, border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 900, fontFamily: "inherit", cursor: "pointer", boxShadow: "0 8px 24px rgba(16,185,129,0.4)" }}>
            ✓ Lanjut ke Finish
          </button>
        </div>
      )}
    </div>
  );
}

function FinishStep({ ticket, selfie, setSelfie, summary, setSummary, busy, err, onFinish, onBack }) {
  return (
    <div style={{ padding: "max(20px, env(safe-area-inset-top)) clamp(14px, 4vw, 24px) 30px" }}>
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: 13, cursor: "pointer", marginBottom: 10 }}>← Kembali ke checklist</button>

      <div style={{ padding: 14, background: GREEN + "11", border: `1px solid ${GREEN}55`, borderRadius: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: GREEN, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>SIAP FINISH</div>
        <div style={{ fontSize: 17, fontWeight: 900, color: "#fff", marginTop: 4 }}>{ticket.title}</div>
        <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 4 }}>Semua item checklist done. Finalize sekarang.</div>
      </div>

      <Field label="🤳 SELFIE PENUTUP (WAJIB)">
        {selfie ? (
          <div style={{ position: "relative" }}>
            <img src={selfie} alt="" style={{ width: "100%", borderRadius: 10, maxHeight: 280, objectFit: "cover" }} />
            <button onClick={() => setSelfie(null)} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 16, fontSize: 18, cursor: "pointer" }}>×</button>
          </div>
        ) : <CameraCapture facingMode="user" label="🤳 Ambil Selfie Penutup" onCapture={setSelfie} />}
      </Field>

      <Field label="📝 SUMMARY / CATATAN">
        <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={4} placeholder="Apa yang dikerjakan, masalah ditemukan, rekomendasi lanjutan…" style={{...inp, fontFamily: "inherit", resize: "vertical"}} />
      </Field>

      {err && <div style={errBox}>⚠ {err}</div>}

      <button onClick={onFinish} disabled={busy || !selfie} style={primaryBtn(!busy && selfie)}>
        {busy ? "⏳ Finalizing…" : "✓ Submit Finish"}
      </button>
    </div>
  );
}

function DoneStep({ ticket, onAgain }) {
  return (
    <div style={{ padding: "60px 24px", textAlign: "center", display:"flex",flexDirection:"column",alignItems:"center",gap:10 }}>
      <div style={{ fontSize: 72, lineHeight:1, margin:0, filter: `drop-shadow(0 0 28px ${GREEN}55)` }}>✓</div>
      <div style={{ fontSize: 12, color: PURPLE, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>TIKET COMPLETED</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginTop: 8 }}>{ticket.title}</div>
      <div style={{ padding: 14, background: GREEN + "11", border: `1px solid ${GREEN}33`, borderRadius: 12, marginTop: 24, fontSize: 12, color: "#86efac", lineHeight: 1.55 }}>
        Tiket {ticket.ticket_no} sudah tercatat selesai. KPI Anda di-update otomatis.
      </div>
      <button onClick={onAgain} style={{ marginTop: 18, width: "100%", padding: "14px 24px", background: PURPLE, border: "none", borderRadius: 12, color: "#fff", fontWeight: 800, fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>↩ Tiket Lain</button>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)", color: "#e6edf3", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif", overflowY: "auto", overflowX: "hidden" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, background: "radial-gradient(700px 500px at 50% 0%, rgba(168,85,247,0.1), transparent 60%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", width: "min(100%, 560px)", margin: "0 auto", boxSizing: "border-box" }}>{children}</div>
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

const inp = { width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none" };
const errBox = { padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: `1px solid ${RED}55`, borderRadius: 10, color: "#fca5a5", fontSize: 13, marginBottom: 12 };
const primaryBtn = (enabled) => ({ width: "100%", padding: "16px 24px", background: enabled ? `linear-gradient(135deg,${PURPLE},#7c3aed)` : "rgba(255,255,255,0.06)", border: "none", borderRadius: 12, color: enabled ? "#fff" : "rgba(255,255,255,0.35)", fontSize: 15, fontWeight: 900, fontFamily: "inherit", letterSpacing: 0.5, cursor: enabled ? "pointer" : "not-allowed", boxShadow: enabled ? "0 8px 24px rgba(168,85,247,0.35)" : "none" });

function chip(color) { return { padding: "3px 8px", background: `${color}22`, border: `1px solid ${color}55`, borderRadius: 6, fontSize: 10, color, fontWeight: 700, fontFamily: "'Geist Mono',monospace", letterSpacing: 0.3 }; }
function priColor(p) { return p === "urgent" ? RED : p === "high" ? AMBER : p === "low" ? "#64748b" : CYAN; }
function statusColor(s) { return s === "done" ? GREEN : s === "skipped" ? "#64748b" : AMBER; }

// SignaturePad — canvas drawing, save as base64 PNG via POST /signature endpoint.
function SignaturePad({ ticketId, itemId, initial, onSaved }) {
  const [open, setOpen] = useState(false);
  const [hasSig, setHasSig] = useState(Boolean(initial));
  const [saving, setSaving] = useState(false);
  const canvasRef = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => { setHasSig(Boolean(initial)); }, [initial]);

  if (hasSig && !open) {
    return (
      <div style={{ marginTop: 8, padding: 10, background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
        <img src={`${API_HOST}/api/service/photo/${initial}`} alt="signature" style={{ height: 40, background: "#fff", borderRadius: 4, padding: 2 }} />
        <div style={{ flex: 1, fontSize: 11, color: "#c084fc", fontFamily: "'Geist Mono',monospace" }}>✍️ SIGNED</div>
        <button onClick={() => { setHasSig(false); setOpen(true); }} style={{ padding: "4px 10px", background: "transparent", border: "1px solid rgba(168,85,247,0.4)", borderRadius: 5, color: "#c084fc", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>↻ Sign ulang</button>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ marginTop: 8, padding: "6px 10px", background: "transparent", border: "1px dashed rgba(168,85,247,0.3)", borderRadius: 6, color: "#a78bfa", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
        ✍️ Tambah signature
      </button>
    );
  }

  // Canvas drawing handlers
  const setupCanvas = (ref) => {
    if (!ref) return;
    canvasRef[1](ref);
    const ctx = ref.getContext("2d");
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };
  const getCoords = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    return { x: x * (canvas.width / rect.width), y: y * (canvas.height / rect.height) };
  };
  const startDraw = (e) => {
    e.preventDefault();
    setDrawing(true); setEmpty(false);
    const canvas = canvasRef[0]; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { x, y } = getCoords(e, canvas);
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  const draw = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const canvas = canvasRef[0]; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { x, y } = getCoords(e, canvas);
    ctx.lineTo(x, y); ctx.stroke();
  };
  const endDraw = () => setDrawing(false);
  const clearCanvas = () => {
    const canvas = canvasRef[0]; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
  };
  const saveSignature = async () => {
    const canvas = canvasRef[0]; if (!canvas) return;
    if (empty) { alert("Belum ada tanda tangan"); return; }
    setSaving(true);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      const r = await fetch(`${API_HOST}/api/service/tickets/${ticketId}/items/${itemId}/signature`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature_b64: dataUrl, signature_by: localStorage.getItem("ro_staff_name") || "staff" }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Gagal save");
      setHasSig(true); setOpen(false);
      if (typeof onSaved === "function") await onSaved();
    } catch (e) { alert("Error: " + e.message); }
    setSaving(false);
  };

  return (
    <div style={{ marginTop: 8, padding: 10, background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 10, color: "#a78bfa", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>✍️ TANDA TANGAN STAFF</div>
        <button onClick={clearCanvas} style={{ padding: "3px 8px", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 5, color: "#94a3b8", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>🗑️ Clear</button>
      </div>
      <canvas
        ref={setupCanvas}
        width={600} height={150}
        style={{ width: "100%", height: 150, background: "#0a0e16", border: "1px dashed rgba(168,85,247,0.4)", borderRadius: 6, touchAction: "none", cursor: "crosshair" }}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
      />
      <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
        <button onClick={() => setOpen(false)} style={{ padding: "5px 10px", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, color: "#94a3b8", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        <button onClick={saveSignature} disabled={saving || empty}
          style={{ padding: "5px 14px", background: saving || empty ? "rgba(168,85,247,0.3)" : "linear-gradient(135deg,#a855f7,#c084fc)", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 800, cursor: saving || empty ? "not-allowed" : "pointer", fontFamily: "inherit" }}>{saving ? "⏳" : "💾 Simpan Tanda Tangan"}</button>
      </div>
    </div>
  );
}

// NoteEditor — catatan per checklist item. Click '📝 Tambah catatan' → expand textarea + Save.
function NoteEditor({ itemId, initial, onSave }) {
  const [text, setText] = useState(initial || "");
  const [open, setOpen] = useState(Boolean(initial));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setText(initial || ""); setOpen(Boolean(initial)); }, [initial, itemId]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ marginTop: 8, padding: "6px 10px", background: "transparent", border: "1px dashed rgba(255,255,255,0.15)", borderRadius: 6, color: "#94a3b8", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
        📝 Tambah catatan
      </button>
    );
  }
  return (
    <div style={{ marginTop: 8, padding: 10, background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 8 }}>
      <div style={{ fontSize: 10, color: "#22d3ee", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 6 }}>📝 CATATAN STAFF</div>
      <textarea value={text} onChange={e => setText(e.target.value)}
        placeholder="Catatan untuk admin (kondisi sebelum/sesudah, part diganti, dll)…"
        style={{ width: "100%", boxSizing: "border-box", padding: 8, background: "#0a0e16", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#fff", fontSize: 12, fontFamily: "inherit", resize: "vertical", minHeight: 50, outline: "none" }} />
      <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
        {initial && !text.trim() && (
          <button onClick={async () => { setSaving(true); await onSave(""); setSaving(false); setOpen(false); }}
            style={{ padding: "5px 10px", background: "transparent", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 6, color: "#fca5a5", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
        )}
        <button onClick={() => { setText(initial || ""); if (!initial) setOpen(false); }}
          style={{ padding: "5px 10px", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, color: "#94a3b8", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        <button onClick={async () => { setSaving(true); await onSave(text); setSaving(false); }} disabled={saving || text === (initial || "")}
          style={{ padding: "5px 14px", background: saving || text === (initial || "") ? "rgba(34,211,238,0.3)" : "#22d3ee", border: "none", borderRadius: 6, color: "#04303a", fontSize: 11, fontWeight: 800, cursor: saving || text === (initial || "") ? "not-allowed" : "pointer", fontFamily: "inherit" }}>{saving ? "⏳" : "💾 Simpan"}</button>
      </div>
    </div>
  );
}
