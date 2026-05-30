// src/Admin/OutletSetupWizard.jsx
//
// One-location end-to-end setup wizard untuk F&B outlet baru.
// Guide owner langkah demi langkah: outlet → tim → menu → printer → devices →
// digital signage → smoke test. State resumable via localStorage.
//
// Filosofi: setiap step terasa membantu, bukan birokrasi. Tidak ada step yang
// memaksa data lengkap di awal — owner bisa skip menu, isi printer nanti, dll.
// Yang penting: pulang dari wizard, ada 1 lokasi F&B yang BISA jualan hari itu.

import { useState, useEffect, useMemo, useCallback } from "react";
import API_HOST from "../apiBase.js";

const LS_KEY = "karyaos:setup-wizard:state";

const STEPS = [
  { key: "outlet",   icon: "🏢", label: "Outlet",        desc: "Nama, area, kota" },
  { key: "team",     icon: "👥", label: "Tim & Akses",    desc: "Kasir + manager" },
  { key: "menu",     icon: "🍽️", label: "Menu",           desc: "Kategori + item" },
  { key: "printer",  icon: "🖨️", label: "Printer",        desc: "Cashier + dapur" },
  { key: "devices",  icon: "🖥️", label: "Device URL",     desc: "POS, Kiosk, KDS" },
  { key: "signage",  icon: "📺", label: "Digital Signage", desc: "5 TV per outlet" },
  { key: "done",     icon: "✅", label: "Selesai",         desc: "Smoke test" },
];

const SAMPLE_CATEGORIES = [
  { id: "kategori-utama",   name: "Menu Utama",    emoji: "🍔" },
  { id: "kategori-minuman", name: "Minuman",       emoji: "🥤" },
  { id: "kategori-snack",   name: "Snack & Side",  emoji: "🍟" },
];

const SAMPLE_MENU = [
  { id: "m-burger",   category_id: "kategori-utama",   emoji: "🍔", name: "Beef Burger",     price: 38000, is_popular: 1 },
  { id: "m-rice-bowl", category_id: "kategori-utama",  emoji: "🍱", name: "Chicken Rice Bowl", price: 32000 },
  { id: "m-pasta",    category_id: "kategori-utama",   emoji: "🍝", name: "Creamy Pasta",    price: 42000, is_popular: 1 },
  { id: "m-tea",      category_id: "kategori-minuman", emoji: "🧋", name: "Lemon Tea",       price: 15000 },
  { id: "m-coffee",   category_id: "kategori-minuman", emoji: "☕", name: "Iced Coffee",     price: 22000, is_popular: 1 },
  { id: "m-juice",    category_id: "kategori-minuman", emoji: "🥤", name: "Fresh Juice",     price: 18000 },
  { id: "m-fries",    category_id: "kategori-snack",   emoji: "🍟", name: "French Fries",    price: 18000, is_popular: 1 },
  { id: "m-wings",    category_id: "kategori-snack",   emoji: "🍗", name: "Chicken Wings",   price: 28000 },
];

function defaultState() {
  return {
    outlet:  { code: "", name: "", area: "", city: "", vertical: "fnb", status: "active" },
    team:    { manager_name: "", manager_pin: "", kasir_name: "", kasir_pin: "" },
    menu:    { mode: "sample", customCategories: [], customItems: [] },
    printer: { customer_ip: "", customer_port: 9100, kitchen_ip: "", kitchen_port: 9100, debug: true },
    signage: { devicesCreated: false, devices: [] },
  };
}

export default function OutletSetupWizard({ onClose, onDone }) {
  const apiBase = API_HOST;
  const [stepIdx, setStepIdx] = useState(0);
  const [data, setData] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...defaultState(), ...parsed.data };
      }
    } catch {}
    return defaultState();
  });
  const [savedFlags, setSavedFlags] = useState({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // Persist progress
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ data, stepIdx })); } catch {}
  }, [data, stepIdx]);

  const step = STEPS[stepIdx];
  const update = (section, patch) => setData(d => ({ ...d, [section]: { ...d[section], ...patch } }));
  const next = () => setStepIdx(i => Math.min(STEPS.length - 1, i + 1));
  const back = () => setStepIdx(i => Math.max(0, i - 1));

  const authHeaders = () => {
    const t = localStorage.getItem("adminToken") || "";
    return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
  };

  // ───────────────────────────────────────────────────────
  // Step actions
  // ───────────────────────────────────────────────────────
  const saveOutlet = async () => {
    const o = data.outlet;
    if (!o.code || !o.name) { setMsg("⚠ Kode + Nama outlet wajib diisi"); return false; }
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`${apiBase}/api/outlet-master`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ ...o, vertical: "fnb" }),
      });
      const j = await r.json();
      if (!r.ok && !j.ok && !j.id) throw new Error(j.error || "Gagal save outlet");
      setSavedFlags(s => ({ ...s, outlet: true }));
      setMsg("✓ Outlet tersimpan");
      return true;
    } catch (e) {
      // 409 conflict = outlet already exists, treat as OK (resumable)
      if (String(e.message).toLowerCase().includes("exist")) {
        setSavedFlags(s => ({ ...s, outlet: true }));
        setMsg("✓ Outlet sudah ada — lanjutkan");
        return true;
      }
      setMsg("⚠ " + e.message);
      return false;
    } finally { setBusy(false); }
  };

  const saveTeam = async () => {
    const t = data.team;
    if (!t.manager_name || !t.manager_pin || !t.kasir_name || !t.kasir_pin) {
      setMsg("⚠ Lengkapi nama + PIN untuk manager dan kasir"); return false;
    }
    if (t.manager_pin.length !== 6 || t.kasir_pin.length !== 6) {
      setMsg("⚠ PIN harus 6 digit"); return false;
    }
    setBusy(true); setMsg("");
    try {
      const reqs = [
        fetch(`${apiBase}/api/auth/users`, {
          method: "POST", headers: authHeaders(),
          body: JSON.stringify({ name: t.manager_name, pin: t.manager_pin, role: "manager", vertical: "fnb", outlet_code: data.outlet.code }),
        }),
        fetch(`${apiBase}/api/auth/users`, {
          method: "POST", headers: authHeaders(),
          body: JSON.stringify({ name: t.kasir_name, pin: t.kasir_pin, role: "kasir", vertical: "fnb", outlet_code: data.outlet.code }),
        }),
      ];
      const results = await Promise.all(reqs);
      let okCount = 0;
      for (const r of results) {
        if (r.ok || r.status === 201) okCount++;
        else {
          try { const e = await r.json(); console.warn("user create:", e); } catch {}
        }
      }
      if (okCount === 0) throw new Error("Gagal membuat user (cek nama belum dipakai?)");
      setSavedFlags(s => ({ ...s, team: true }));
      setMsg(`✓ ${okCount}/2 user dibuat`);
      return true;
    } catch (e) { setMsg("⚠ " + e.message); return false; }
    finally { setBusy(false); }
  };

  const saveMenu = async () => {
    if (data.menu.mode === "skip") {
      setSavedFlags(s => ({ ...s, menu: true }));
      setMsg("✓ Menu di-skip — bisa ditambahkan via Master Items");
      return true;
    }
    if (data.menu.mode !== "sample") {
      setSavedFlags(s => ({ ...s, menu: true }));
      return true;
    }
    setBusy(true); setMsg("");
    try {
      let created = 0, skipped = 0;
      for (const c of SAMPLE_CATEGORIES) {
        const r = await fetch(`${apiBase}/api/master-items/categories`, {
          method: "POST", headers: authHeaders(), body: JSON.stringify(c),
        });
        if (r.ok) created++; else skipped++;
      }
      for (const m of SAMPLE_MENU) {
        const r = await fetch(`${apiBase}/api/master-items/menus`, {
          method: "POST", headers: authHeaders(),
          body: JSON.stringify({ ...m, outlet_ids: [data.outlet.code] }),
        });
        if (r.ok) created++; else skipped++;
      }
      setSavedFlags(s => ({ ...s, menu: true }));
      setMsg(`✓ Sample menu seeded — ${created} baru, ${skipped} sudah ada`);
      return true;
    } catch (e) { setMsg("⚠ " + e.message); return false; }
    finally { setBusy(false); }
  };

  const savePrinter = async () => {
    setBusy(true); setMsg("");
    try {
      const p = data.printer;
      const r = await fetch(`${apiBase}/api/printer/config`, {
        method: "PATCH", headers: authHeaders(),
        body: JSON.stringify({
          debug: p.debug,
          kitchen:  { ip: p.kitchen_ip,  port: p.kitchen_port },
          customer: { ip: p.customer_ip, port: p.customer_port },
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Gagal save printer config");
      setSavedFlags(s => ({ ...s, printer: true }));
      setMsg("✓ Printer config tersimpan");
      return true;
    } catch (e) { setMsg("⚠ " + e.message); return false; }
    finally { setBusy(false); }
  };

  const seedSignage = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`${apiBase}/api/signage/devices/seed`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ outlets: [data.outlet.code], vertical: "fnb" }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Gagal seed signage");
      // Fetch devices to display URLs
      const dr = await fetch(`${apiBase}/api/signage/devices`, { headers: authHeaders() });
      const dj = await dr.json();
      const myDevices = (dj.devices || []).filter(d => d.outlet === data.outlet.code);
      update("signage", { devicesCreated: true, devices: myDevices });
      setSavedFlags(s => ({ ...s, signage: true }));
      setMsg(`✓ ${j.summary.created} device baru, ${j.summary.skipped} sudah ada`);
      return true;
    } catch (e) { setMsg("⚠ " + e.message); return false; }
    finally { setBusy(false); }
  };

  // ───────────────────────────────────────────────────────
  // Step → handler map
  // ───────────────────────────────────────────────────────
  const stepHandlers = {
    outlet:  saveOutlet,
    team:    saveTeam,
    menu:    saveMenu,
    printer: savePrinter,
    devices: async () => { setSavedFlags(s => ({ ...s, devices: true })); return true; },
    signage: seedSignage,
    done:    async () => { onDone?.(data); return true; },
  };

  const goNext = async () => {
    const handler = stepHandlers[step.key];
    if (handler) {
      const ok = await handler();
      if (ok && stepIdx < STEPS.length - 1) next();
      else if (ok && step.key === "done") { localStorage.removeItem(LS_KEY); onClose?.(); }
    } else { next(); }
  };

  const resetWizard = () => {
    if (!window.confirm("Reset semua progress wizard? Data outlet yg sudah tersimpan tetap ada di sistem.")) return;
    localStorage.removeItem(LS_KEY);
    setData(defaultState());
    setStepIdx(0);
    setSavedFlags({});
    setMsg("");
  };

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={S.eyebrow}>SETUP WIZARD · F&B</div>
            <div style={S.title}>Buka 1 Lokasi F&B Lengkap</div>
            <div style={S.subtitle}>POS · Kiosk · KDS · Digital Signage — semua dalam satu alur</div>
          </div>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>

        {/* Stepper */}
        <div style={S.stepper}>
          {STEPS.map((s, i) => (
            <div key={s.key} onClick={() => savedFlags[s.key] && setStepIdx(i)}
              style={{ ...S.stepPill, ...(i === stepIdx ? S.stepActive : savedFlags[s.key] ? S.stepDone : {}), cursor: savedFlags[s.key] ? "pointer" : "default" }}>
              <span style={S.stepIcon}>{savedFlags[s.key] ? "✓" : s.icon}</span>
              <span style={S.stepLabel}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={S.body}>
          <div style={S.stepHead}>
            <div style={{ fontSize: 32 }}>{step.icon}</div>
            <div>
              <div style={S.stepTitle}>{step.label}</div>
              <div style={S.stepDesc}>{step.desc}</div>
            </div>
          </div>

          {step.key === "outlet" && (
            <StepOutlet data={data.outlet} update={(p) => update("outlet", p)} />
          )}
          {step.key === "team" && (
            <StepTeam data={data.team} update={(p) => update("team", p)} outletCode={data.outlet.code} />
          )}
          {step.key === "menu" && (
            <StepMenu data={data.menu} update={(p) => update("menu", p)} />
          )}
          {step.key === "printer" && (
            <StepPrinter data={data.printer} update={(p) => update("printer", p)} apiBase={apiBase} />
          )}
          {step.key === "devices" && (
            <StepDevices outletCode={data.outlet.code} />
          )}
          {step.key === "signage" && (
            <StepSignage data={data.signage} outletCode={data.outlet.code} />
          )}
          {step.key === "done" && (
            <StepDone data={data} savedFlags={savedFlags} />
          )}

          {msg && (
            <div style={{ ...S.msg, color: msg.startsWith("✓") ? "#10b981" : msg.startsWith("⚠") ? "#fbbf24" : "#9da7b3", borderColor: msg.startsWith("✓") ? "#10b98144" : msg.startsWith("⚠") ? "#fbbf2444" : "#21262d" }}>
              {msg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <button onClick={resetWizard} style={S.resetBtn} title="Reset progress wizard">↺ Reset</button>
          <div style={{ flex: 1 }} />
          <button onClick={back} disabled={stepIdx === 0 || busy} style={{ ...S.btnGhost, opacity: stepIdx === 0 ? 0.4 : 1 }}>← Kembali</button>
          <button onClick={goNext} disabled={busy} style={{ ...S.btnPrimary, opacity: busy ? 0.5 : 1 }}>
            {busy ? "⏳ Sebentar..." : step.key === "done" ? "🎉 Selesai" : "Lanjut →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STEP COMPONENTS
// ═══════════════════════════════════════════════════════════════

function StepOutlet({ data, update }) {
  const autoCode = () => {
    const slug = (data.area || data.city || "OTL").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "OTL";
    const rand = String(Math.floor(Math.random() * 900) + 100);
    update({ code: `OTL-${slug}-${rand}` });
  };
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Field label="Nama Outlet" hint="Yang ditampilkan ke customer (struk, kiosk, signage)">
        <input value={data.name} onChange={e => update({ name: e.target.value })} placeholder="Karya Bites Paskal" style={S.input} />
      </Field>
      <Field label="Area / Mall" hint="Nama mall atau area">
        <input value={data.area} onChange={e => update({ area: e.target.value })} placeholder="Paskal 23" style={S.input} />
      </Field>
      <Field label="Kota">
        <input value={data.city} onChange={e => update({ city: e.target.value })} placeholder="Bandung" style={S.input} />
      </Field>
      <Field label="Kode Outlet" hint="Identifier internal — dipakai di URL kiosk, KDS, signage device">
        <div style={{ display: "flex", gap: 8 }}>
          <input value={data.code} onChange={e => update({ code: e.target.value.toUpperCase() })} placeholder="OTL-PSK-001" style={{ ...S.input, flex: 1, fontFamily: "'Geist Mono',monospace" }} />
          <button onClick={autoCode} style={S.smallBtn}>✨ Generate</button>
        </div>
      </Field>
      <div style={S.infoBox}>
        💡 <b>Vertikal: F&B</b> sudah otomatis. Outlet ini akan punya menu makanan, kasir POS, dan kitchen display.
      </div>
    </div>
  );
}

function StepTeam({ data, update, outletCode }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={S.infoBox}>
        👥 Buat <b>2 user</b> minimal: <b>Manager</b> (akses void, refund, laporan) dan <b>Kasir</b> (transaksi harian).
        Bisa tambah user lain nanti via Admin → User Management.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={S.subCard}>
          <div style={S.subCardHead}>👔 Manager</div>
          <Field label="Nama">
            <input value={data.manager_name} onChange={e => update({ manager_name: e.target.value })} placeholder="Budi Manager" style={S.input} />
          </Field>
          <Field label="PIN (6 digit)" hint="Hindari 999999, 123456, atau angka berulang">
            <input value={data.manager_pin} onChange={e => update({ manager_pin: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="•••••• " inputMode="numeric" style={{ ...S.input, fontFamily: "'Geist Mono',monospace", letterSpacing: 6, textAlign: "center" }} />
          </Field>
        </div>
        <div style={S.subCard}>
          <div style={S.subCardHead}>💁 Kasir</div>
          <Field label="Nama">
            <input value={data.kasir_name} onChange={e => update({ kasir_name: e.target.value })} placeholder="Sari Kasir" style={S.input} />
          </Field>
          <Field label="PIN (6 digit)">
            <input value={data.kasir_pin} onChange={e => update({ kasir_pin: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="••••••" inputMode="numeric" style={{ ...S.input, fontFamily: "'Geist Mono',monospace", letterSpacing: 6, textAlign: "center" }} />
          </Field>
        </div>
      </div>
      {outletCode && (
        <div style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>
          User di-tag ke outlet: <b style={{ color: "#fbbf24" }}>{outletCode}</b>
        </div>
      )}
    </div>
  );
}

function StepMenu({ data, update }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={S.infoBox}>
        🍽️ Pilih cara isi menu. Bisa diubah/diperluas nanti via <b>Admin → Master Items</b>.
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        <ModeOption checked={data.mode === "sample"} onClick={() => update({ mode: "sample" })}
          icon="📦" title="Pakai Menu Starter (rekomen)" desc={`${SAMPLE_CATEGORIES.length} kategori, ${SAMPLE_MENU.length} item — burger, rice bowl, minuman, snack. Bisa edit nanti.`} />
        <ModeOption checked={data.mode === "skip"} onClick={() => update({ mode: "skip" })}
          icon="⏭️" title="Skip — saya akan tambah menu sendiri" desc="Buka outlet dulu, menu disusulkan via Master Items. POS akan kosong sampai menu dibuat." />
      </div>
      {data.mode === "sample" && (
        <div style={S.subCard}>
          <div style={{ fontSize: 11, color: "#9da7b3", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>PREVIEW MENU STARTER</div>
          <div style={{ display: "grid", gap: 4, fontSize: 12 }}>
            {SAMPLE_CATEGORIES.map(c => (
              <div key={c.id}>
                <div style={{ color: "#fbbf24", fontWeight: 700, marginTop: 6 }}>{c.emoji} {c.name}</div>
                {SAMPLE_MENU.filter(m => m.category_id === c.id).map(m => (
                  <div key={m.id} style={{ display: "flex", color: "#9da7b3", paddingLeft: 18 }}>
                    <span>{m.emoji} {m.name}</span>
                    <span style={{ flex: 1, borderBottom: "1px dotted #21262d", margin: "0 6px", transform: "translateY(-3px)" }}></span>
                    <span style={{ fontFamily: "'Geist Mono',monospace", color: "#10b981" }}>Rp {m.price.toLocaleString("id-ID")}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StepPrinter({ data, update, apiBase }) {
  const [testing, setTesting] = useState({ kitchen: false, customer: false });
  const [testMsg, setTestMsg] = useState("");
  const [bridgeStatus, setBridgeStatus] = useState({ checking: true, online: false, version: null });
  const [bridgeLatest, setBridgeLatest] = useState(null);

  // Detect bridge running di PC kasir (this browser's localhost)
  // + fetch latest version dari backend untuk download link
  useEffect(() => {
    fetch("http://localhost:9101/", { signal: AbortSignal.timeout(2000) })
      .then(r => r.ok ? r.json() : null)
      .then(d => setBridgeStatus({ checking: false, online: !!d, version: d?.version || null }))
      .catch(() => setBridgeStatus({ checking: false, online: false, version: null }));
    fetch(`${apiBase}/api/bridge/latest-version`)
      .then(r => r.ok ? r.json() : null)
      .then(setBridgeLatest)
      .catch(() => {});
  }, [apiBase]);

  const recheckBridge = () => {
    setBridgeStatus({ checking: true, online: false, version: null });
    fetch("http://localhost:9101/", { signal: AbortSignal.timeout(2000) })
      .then(r => r.ok ? r.json() : null)
      .then(d => setBridgeStatus({ checking: false, online: !!d, version: d?.version || null }))
      .catch(() => setBridgeStatus({ checking: false, online: false, version: null }));
  };

  const testPrint = async (kind) => {
    const ip = kind === "kitchen" ? data.kitchen_ip : data.customer_ip;
    const port = kind === "kitchen" ? data.kitchen_port : data.customer_port;
    if (!ip) { setTestMsg(`⚠ IP ${kind} belum diisi`); return; }
    setTesting(t => ({ ...t, [kind]: true })); setTestMsg("");
    try {
      const r = await fetch(`${apiBase}/api/print/test`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, port }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || `Test gagal (${r.status})`);
      setTestMsg(`✓ ${j.message || `Test ${kind} terkirim`}`);
    } catch (e) { setTestMsg("⚠ " + e.message); }
    finally { setTesting(t => ({ ...t, [kind]: false })); }
  };

  const bridgeBg = bridgeStatus.online
    ? "linear-gradient(135deg, rgba(16,185,129,0.10), rgba(16,185,129,0.04))"
    : "linear-gradient(135deg, rgba(245,158,11,0.10), rgba(245,158,11,0.04))";
  const bridgeBorder = bridgeStatus.online ? "rgba(16,185,129,0.40)" : "rgba(245,158,11,0.35)";
  const bridgeColor  = bridgeStatus.online ? "#10b981" : "#fbbf24";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Print Bridge Status + Download */}
      <div style={{ background: bridgeBg, border: `1px solid ${bridgeBorder}`, borderRadius: 12, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div style={{ fontSize: 32, lineHeight: 1 }}>
              {bridgeStatus.checking ? "⏳" : bridgeStatus.online ? "✅" : "🔌"}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: bridgeColor, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>
                PRINT BRIDGE
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>
                {bridgeStatus.checking ? "Mengecek koneksi..." :
                 bridgeStatus.online ? `Terhubung · v${bridgeStatus.version || "?"}` :
                 "Belum terdeteksi di PC ini"}
              </div>
              <div style={{ fontSize: 11, color: "#9da7b3", marginTop: 2 }}>
                {bridgeStatus.online
                  ? "Localhost agent jalan — siap forward print job ke printer LAN."
                  : "Tanpa bridge, struk gak bisa cetak ke printer fisik (cuma mode DEBUG file)."}
              </div>
            </div>
          </div>
          <button onClick={recheckBridge} disabled={bridgeStatus.checking} style={{ ...S.smallBtn, flexShrink: 0 }}>
            ↻ Recheck
          </button>
        </div>

        {!bridgeStatus.online && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <a href={bridgeLatest?.download_url || "/downloads/print-bridge.zip"} download
              style={{ flex: 1, minWidth: 200, padding: "12px 16px", background: "linear-gradient(135deg,#a855f7,#fbbf24)", color: "#0d1117", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", textDecoration: "none", textAlign: "center", letterSpacing: 0.3 }}>
              ⬇ Download Print Bridge {bridgeLatest?.version ? `v${bridgeLatest.version}` : "(Windows)"}
            </a>
            <details style={{ flex: 1, minWidth: 200, padding: "10px 14px", background: "#0a0e16", border: "1px solid #21262d", borderRadius: 10, cursor: "pointer" }}>
              <summary style={{ fontSize: 12, color: "#fbbf24", fontWeight: 700, cursor: "pointer", outline: "none" }}>
                📖 Cara install (3 langkah)
              </summary>
              <ol style={{ fontSize: 11, color: "#9da7b3", lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 0" }}>
                <li>Install <a href="https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi" target="_blank" rel="noreferrer" style={{ color: "#fbbf24" }}>Node.js LTS</a> di PC kasir</li>
                <li>Extract zip ke <code style={{ color: "#fbbf24" }}>C:\karyaos\print-bridge\</code></li>
                <li>Right-click <code style={{ color: "#fbbf24" }}>install-windows-service.bat</code> → <b>Run as administrator</b></li>
              </ol>
              <div style={{ fontSize: 10, color: "#5b6470", fontStyle: "italic", marginTop: 6 }}>
                Service auto-start saat Windows boot. Setelah install, klik <b>Recheck</b> di atas.
              </div>
            </details>
          </div>
        )}

        {bridgeStatus.online && bridgeLatest && bridgeStatus.version && bridgeLatest.version !== bridgeStatus.version && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.30)", borderRadius: 8, fontSize: 11, color: "#fbbf24" }}>
            🆕 Update tersedia: v{bridgeLatest.version}. Download + re-install untuk dapatkan fitur terbaru.
            <a href={bridgeLatest.download_url} download style={{ color: "#fbbf24", marginLeft: 6, fontWeight: 700 }}>⬇ Download</a>
          </div>
        )}
      </div>

      <div style={S.infoBox}>
        🖨️ Konfigurasi printer LAN (TCP/IP, port 9100). Mode <b>DEBUG</b> menulis ke file (tanpa printer fisik) —
        cocok untuk testing. Matikan saat siap produksi.
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 12, background: "#0a0e16", borderRadius: 8, border: "1px solid #21262d" }}>
        <input type="checkbox" checked={data.debug} onChange={e => update({ debug: e.target.checked })} id="debug" />
        <label htmlFor="debug" style={{ fontSize: 13, color: "#fff", fontWeight: 700, cursor: "pointer" }}>Mode DEBUG (tulis ke file, tidak ke printer fisik)</label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={S.subCard}>
          <div style={S.subCardHead}>💁 Cashier Printer</div>
          <Field label="IP Address">
            <input value={data.customer_ip} onChange={e => update({ customer_ip: e.target.value })} placeholder="192.168.1.100" style={{ ...S.input, fontFamily: "'Geist Mono',monospace" }} />
          </Field>
          <Field label="Port">
            <input type="number" value={data.customer_port} onChange={e => update({ customer_port: Number(e.target.value) })} style={{ ...S.input, fontFamily: "'Geist Mono',monospace" }} />
          </Field>
          <button onClick={() => testPrint("customer")} disabled={testing.customer} style={{ ...S.smallBtn, width: "100%", marginTop: 8 }}>
            {testing.customer ? "⏳ Testing..." : "🖨️ Test Print"}
          </button>
        </div>
        <div style={S.subCard}>
          <div style={S.subCardHead}>🍳 Kitchen Printer</div>
          <Field label="IP Address">
            <input value={data.kitchen_ip} onChange={e => update({ kitchen_ip: e.target.value })} placeholder="192.168.1.101" style={{ ...S.input, fontFamily: "'Geist Mono',monospace" }} />
          </Field>
          <Field label="Port">
            <input type="number" value={data.kitchen_port} onChange={e => update({ kitchen_port: Number(e.target.value) })} style={{ ...S.input, fontFamily: "'Geist Mono',monospace" }} />
          </Field>
          <button onClick={() => testPrint("kitchen")} disabled={testing.kitchen} style={{ ...S.smallBtn, width: "100%", marginTop: 8 }}>
            {testing.kitchen ? "⏳ Testing..." : "🖨️ Test Print"}
          </button>
        </div>
      </div>

      {testMsg && <div style={{ fontSize: 12, color: testMsg.startsWith("✓") ? "#10b981" : "#fbbf24" }}>{testMsg}</div>}

      <div style={{ fontSize: 11, color: "#5b6470", fontStyle: "italic", lineHeight: 1.6 }}>
        💡 IP bisa diisi nanti dari Admin → Tools → Printer Config. Wizard ini cuma shortcut.
      </div>
    </div>
  );
}

function StepDevices({ outletCode }) {
  const baseHost = typeof window !== "undefined" ? window.location.origin : "";
  const urls = [
    { icon: "💁", label: "POS Cashier",       url: `${baseHost}/?pos&outlet=${outletCode}`,     desc: "Kasir di outlet. Bookmark di Chrome." },
    { icon: "📱", label: "Self-Order Kiosk",  url: `${baseHost}/?kiosk&outlet=${outletCode}`,   desc: "Tablet self-order. Fullscreen + bookmark." },
    { icon: "🍳", label: "KDS Kitchen",       url: `${baseHost}/?kds&outlet=${outletCode}`,     desc: "TV/tablet dapur — order masuk auto, chime." },
    { icon: "📺", label: "Customer Display",  url: `${baseHost}/?cds&outlet=${outletCode}`,     desc: "Second monitor di counter — tampilan belanja." },
  ];
  const copy = (u) => navigator.clipboard?.writeText(u);
  if (!outletCode) {
    return <div style={S.infoBox}>⚠ Kode outlet belum di-set. Selesaikan step Outlet dulu.</div>;
  }
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={S.infoBox}>
        🖥️ URL device sudah <b>siap pakai</b>. Buka di browser device target, lalu bookmark/fullscreen.
        Auto-bind ke outlet <b>{outletCode}</b> tanpa setup tambahan.
      </div>
      {urls.map(u => (
        <div key={u.label} style={{ ...S.subCard, display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ fontSize: 32 }}>{u.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{u.label}</div>
            <div style={{ fontSize: 11, color: "#9da7b3", marginBottom: 6 }}>{u.desc}</div>
            <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: "#fbbf24", wordBreak: "break-all", padding: "6px 10px", background: "#0a0e16", borderRadius: 6, border: "1px solid #21262d" }}>{u.url}</div>
          </div>
          <button onClick={() => copy(u.url)} style={S.smallBtn}>📋 Copy</button>
          <a href={u.url} target="_blank" rel="noreferrer" style={{ ...S.smallBtn, textDecoration: "none" }}>🔗 Buka</a>
        </div>
      ))}
    </div>
  );
}

function StepSignage({ data, outletCode }) {
  const baseHost = typeof window !== "undefined" ? window.location.origin : "";
  const ZONE_LABELS = {
    "menu-board":   { icon: "🍔", label: "Menu Board",    desc: "TV besar di atas counter — menu + harga" },
    "counter-side": { icon: "🏪", label: "Counter Side",  desc: "Promo + combo carousel" },
    "dining-area":  { icon: "🪑", label: "Dining Area",   desc: "Favorit + brand story" },
    "pickup":       { icon: "🛒", label: "Order Pickup",  desc: "Antrian pesanan siap" },
    "window":       { icon: "🪟", label: "Window",        desc: "Walk-in attractor" },
  };
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={S.infoBox}>
        📺 Sekali klik <b>Lanjut →</b>, kami buat 5 device TV (1 per zone). Tiap device dapat URL unik —
        buka di TV/tablet, fullscreen, beres. Auto-refresh tiap 60 detik.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>
        {Object.entries(ZONE_LABELS).map(([k, z]) => {
          const dev = (data.devices || []).find(d => d.zone === k);
          const url = dev?.player_url ? `${baseHost}${dev.player_url}` : null;
          return (
            <div key={k} style={{ ...S.subCard, opacity: dev ? 1 : 0.85 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{ fontSize: 24 }}>{z.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{z.label}</div>
                  <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{dev?.device_id || `TV-${outletCode}-${k.toUpperCase().replace(/-/g, "_")}`}</div>
                </div>
                {dev && <span style={{ fontSize: 10, color: "#10b981", fontWeight: 800, fontFamily: "'Geist Mono',monospace" }}>● READY</span>}
              </div>
              <div style={{ fontSize: 11, color: "#9da7b3", marginBottom: 8 }}>{z.desc}</div>
              {url && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => navigator.clipboard?.writeText(url)} style={{ ...S.smallBtn, flex: 1 }}>📋 Copy URL</button>
                  <a href={url} target="_blank" rel="noreferrer" style={{ ...S.smallBtn, textDecoration: "none" }}>👁️</a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepDone({ data, savedFlags }) {
  const apiBase = API_HOST;
  const [smoke, setSmoke] = useState({ running: false, results: [], orderId: null });

  const authHeaders = () => {
    const t = localStorage.getItem("adminToken") || "";
    return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
  };

  const checks = [
    { key: "outlet",  label: "Outlet master tersimpan",     done: savedFlags.outlet },
    { key: "team",    label: "Manager + Kasir dibuat",      done: savedFlags.team },
    { key: "menu",    label: "Menu seeded / di-skip",       done: savedFlags.menu },
    { key: "printer", label: "Printer config tersimpan",    done: savedFlags.printer },
    { key: "devices", label: "URL device dicatat",          done: savedFlags.devices },
    { key: "signage", label: "5 Signage device dibuat",     done: savedFlags.signage },
  ];
  const completed = checks.filter(c => c.done).length;

  const pushResult = (label, status, detail) => {
    setSmoke(s => ({ ...s, results: [...s.results, { label, status, detail, at: Date.now() }] }));
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const runSmokeTest = async () => {
    setSmoke({ running: true, results: [], orderId: null });
    const t0 = Date.now();
    const tag = (s) => `${s} (${Date.now() - t0}ms)`;

    // 1. Create test order
    let orderId = null;
    try {
      const orderPayload = {
        type: "takeaway",
        items: [{ id: "smoke-test", n: "🧪 Smoke Test Item", p: 10000, q: 1, addonTotal: 0 }],
        pay: "CASH",
        kasir: "SETUP-WIZARD",
        source: "smoke-test",
        customerName: "Smoke Test",
        cashReceived: 10000,
        cashChange: 0,
      };
      const r = await fetch(`${apiBase}/api/orders`, { method: "POST", headers: authHeaders(), body: JSON.stringify(orderPayload) });
      const j = await r.json();
      if (!r.ok || !j.id) throw new Error(j.error || "Order create gagal");
      orderId = j.id;
      setSmoke(s => ({ ...s, orderId }));
      pushResult("📝 Order test dibuat", "ok", tag(`#${orderId}`));
    } catch (e) {
      pushResult("📝 Order test dibuat", "fail", e.message);
      setSmoke(s => ({ ...s, running: false }));
      return;
    }

    // 2. Verify order back
    try {
      await sleep(400);
      const r = await fetch(`${apiBase}/api/orders/${orderId}`, { headers: authHeaders() });
      if (!r.ok) throw new Error(`GET gagal (${r.status})`);
      const o = await r.json();
      if (!o.id) throw new Error("Order tidak ditemukan saat readback");
      pushResult("🔍 Order readback OK", "ok", tag(`total Rp ${o.total?.toLocaleString("id-ID") || "—"}`));
    } catch (e) {
      pushResult("🔍 Order readback", "fail", e.message);
    }

    // 3. Verify KDS ticket auto-created
    try {
      await sleep(400);
      const r = await fetch(`${apiBase}/api/kds/tickets?order_ref=${orderId}&status=queued,preparing,ready`, { headers: authHeaders() });
      if (!r.ok) throw new Error(`GET KDS gagal (${r.status})`);
      const tickets = await r.json();
      if (!tickets.length) throw new Error("Tidak ada KDS ticket dibuat — cek backend hook");
      pushResult("🍳 KDS ticket auto-created", "ok", tag(`${tickets.length} ticket(s)`));
    } catch (e) {
      pushResult("🍳 KDS ticket auto-created", "warn", e.message);
    }

    // 4. Update order: preparing → ready → completed
    for (const [emoji, status] of [["⏳", "preparing"], ["✅", "ready"], ["💚", "completed"]]) {
      try {
        await sleep(300);
        const r = await fetch(`${apiBase}/api/orders/${orderId}/status`, {
          method: "PATCH", headers: authHeaders(), body: JSON.stringify({ status }),
        });
        if (!r.ok) throw new Error(`PATCH ${status} gagal (${r.status})`);
        pushResult(`${emoji} Status → ${status}`, "ok", tag("OK"));
      } catch (e) {
        pushResult(`${emoji} Status → ${status}`, "fail", e.message);
      }
    }

    // 5. Verify signage pickup zone akan tampil ticker (cek by querying ready orders count)
    try {
      await sleep(300);
      const dev = (data.signage?.devices || []).find(d => d.zone === "pickup");
      if (dev?.device_id) {
        const r = await fetch(`${apiBase}/api/signage/player/${encodeURIComponent(dev.device_id)}`);
        if (!r.ok) throw new Error(`Signage player gagal (${r.status})`);
        const j = await r.json();
        const pickupItem = (j.items || []).find(i => i.type === "fnb_pickup_queue");
        const readyCount = pickupItem?.data?.ready_orders?.length || 0;
        pushResult("📺 Signage pickup zone responding", "ok", tag(`${readyCount} order siap`));
      } else {
        pushResult("📺 Signage pickup zone", "skip", "Device pickup belum di-seed");
      }
    } catch (e) {
      pushResult("📺 Signage pickup zone", "warn", e.message);
    }

    setSmoke(s => ({ ...s, running: false }));
  };

  const cleanupTestOrder = async () => {
    if (!smoke.orderId) return;
    if (!window.confirm(`Cancel & hapus order test #${smoke.orderId}? Ini akan menghilangkannya dari laporan.`)) return;
    try {
      await fetch(`${apiBase}/api/orders/${smoke.orderId}/cancel`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ reason: "smoke-test cleanup" }) });
      pushResult("🧹 Order test di-cancel", "ok", `#${smoke.orderId}`);
      setSmoke(s => ({ ...s, orderId: null }));
    } catch (e) {
      pushResult("🧹 Cleanup", "fail", e.message);
    }
  };

  const resultColor = (s) => s === "ok" ? "#10b981" : s === "warn" ? "#fbbf24" : s === "skip" ? "#5b6470" : "#ef4444";
  const resultIcon = (s) => s === "ok" ? "✓" : s === "warn" ? "⚠" : s === "skip" ? "⊝" : "✗";

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ textAlign: "center", padding: 20 }}>
        <div style={{ fontSize: 80, marginBottom: 12 }}>🎉</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24", marginBottom: 6 }}>
          Outlet <span style={{ fontFamily: "'Geist Mono',monospace" }}>{data.outlet.code}</span> siap!
        </div>
        <div style={{ fontSize: 14, color: "#9da7b3" }}>{completed}/{checks.length} langkah selesai</div>
      </div>

      <div style={S.subCard}>
        <div style={{ fontSize: 11, color: "#9da7b3", fontFamily: "'Geist Mono',monospace", letterSpacing: 1.5, marginBottom: 12 }}>✅ CHECKLIST</div>
        {checks.map(c => (
          <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontSize: 13 }}>
            <span style={{ fontSize: 16, color: c.done ? "#10b981" : "#5b6470" }}>{c.done ? "✓" : "○"}</span>
            <span style={{ color: c.done ? "#e6edf3" : "#9da7b3" }}>{c.label}</span>
          </div>
        ))}
      </div>

      <div style={S.subCard}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#fbbf24", fontFamily: "'Geist Mono',monospace", letterSpacing: 1.5 }}>🧪 SMOKE TEST OTOMATIS</div>
          <div style={{ display: "flex", gap: 6 }}>
            {smoke.orderId && !smoke.running && (
              <button onClick={cleanupTestOrder} style={{ ...S.smallBtn, color: "#ef4444", borderColor: "#ef444444" }}>
                🧹 Cleanup #{smoke.orderId}
              </button>
            )}
            <button onClick={runSmokeTest} disabled={smoke.running} style={{ ...S.smallBtn, background: smoke.running ? "#161b22" : "rgba(16,185,129,0.15)", borderColor: "rgba(16,185,129,0.40)", color: "#10b981" }}>
              {smoke.running ? "⏳ Berjalan..." : smoke.results.length ? "🔁 Run lagi" : "▶ Jalankan Test"}
            </button>
          </div>
        </div>

        <div style={{ fontSize: 11, color: "#9da7b3", lineHeight: 1.6, marginBottom: 10 }}>
          Test order Rp 10.000 → KDS ticket → status transitions → signage update.
          Order ditag <code style={{ color: "#fbbf24" }}>source=smoke-test</code> biar bisa di-cleanup.
        </div>

        {smoke.results.length > 0 && (
          <div style={{ background: "#000", borderRadius: 8, padding: 12, fontFamily: "'Geist Mono',monospace", fontSize: 11, lineHeight: 1.8 }}>
            {smoke.results.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8 }}>
                <span style={{ color: resultColor(r.status), fontWeight: 800, width: 16 }}>{resultIcon(r.status)}</span>
                <span style={{ flex: 1, color: "#e6edf3" }}>{r.label}</span>
                <span style={{ color: resultColor(r.status), fontStyle: r.status === "ok" ? "normal" : "italic" }}>{r.detail}</span>
              </div>
            ))}
            {smoke.running && (
              <div style={{ color: "#fbbf24", marginTop: 4, fontStyle: "italic" }}>▌ Sebentar ya...</div>
            )}
          </div>
        )}
      </div>

      <div style={S.subCard}>
        <div style={{ fontSize: 11, color: "#9da7b3", fontFamily: "'Geist Mono',monospace", letterSpacing: 1.5, marginBottom: 10 }}>📱 SMOKE TEST MANUAL (di device fisik)</div>
        <ol style={{ paddingLeft: 20, color: "#9da7b3", fontSize: 12, lineHeight: 1.8, margin: 0 }}>
          <li>Buka POS Cashier di tablet → login PIN kasir → buat order test (1 item)</li>
          <li>Cek KDS dapur → order test muncul → klik "Ready"</li>
          <li>Cek printer cashier → struk keluar (atau file kalau DEBUG mode)</li>
          <li>Buka Kiosk URL di tablet customer → buat order self-order</li>
          <li>Buka 1 signage URL di TV besar → playlist auto-rotate</li>
        </ol>
      </div>

      <div style={S.infoBox}>
        💡 Klik <b>🎉 Selesai</b> di bawah — wizard close, progress dihapus.
        Bisa kembali kapan saja untuk buka outlet lain.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PRIMITIVES
// ═══════════════════════════════════════════════════════════════

function Field({ label, hint, children }) {
  return (
    <div>
      <label style={S.label}>{label}</label>
      {children}
      {hint && <div style={S.hint}>{hint}</div>}
    </div>
  );
}

function ModeOption({ checked, onClick, icon, title, desc }) {
  return (
    <div onClick={onClick} style={{ display: "flex", gap: 14, padding: "14px 16px", borderRadius: 10, cursor: "pointer", background: checked ? "rgba(16,185,129,0.10)" : "#0a0e16", border: `1px solid ${checked ? "rgba(16,185,129,0.40)" : "#21262d"}`, transition: "all 0.15s ease" }}>
      <div style={{ fontSize: 26 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: "#9da7b3", lineHeight: 1.5 }}>{desc}</div>
      </div>
      <div style={{ fontSize: 20, color: checked ? "#10b981" : "#5b6470" }}>{checked ? "●" : "○"}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════

const S = {
  backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 },
  modal: { background: "#0d1117", border: "1px solid #30363d", borderRadius: 16, width: "100%", maxWidth: 920, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "inherit" },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "20px 24px 16px", borderBottom: "1px solid #161b22" },
  eyebrow: { fontSize: 10, color: "#10b981", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 4 },
  title: { fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: "#9da7b3", marginTop: 4 },
  closeBtn: { background: "transparent", border: "1px solid #30363d", color: "#9da7b3", width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 14, fontFamily: "inherit" },
  stepper: { display: "flex", gap: 6, padding: "12px 24px", borderBottom: "1px solid #161b22", overflowX: "auto" },
  stepPill: { display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: "#0a0e16", border: "1px solid #21262d", fontSize: 12, color: "#5b6470", whiteSpace: "nowrap" },
  stepActive: { background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.45)", color: "#c084fc", fontWeight: 700 },
  stepDone: { background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.30)", color: "#10b981" },
  stepIcon: { fontSize: 14 },
  stepLabel: { fontSize: 11, fontWeight: 600 },
  body: { padding: 24, overflowY: "auto", flex: 1 },
  stepHead: { display: "flex", alignItems: "center", gap: 14, marginBottom: 20, padding: "0 0 16px", borderBottom: "1px solid #161b22" },
  stepTitle: { fontSize: 18, fontWeight: 800, color: "#fff" },
  stepDesc: { fontSize: 12, color: "#9da7b3", marginTop: 2 },
  footer: { display: "flex", gap: 10, padding: "14px 24px", borderTop: "1px solid #161b22", alignItems: "center" },
  resetBtn: { background: "transparent", border: "1px solid #30363d", color: "#5b6470", padding: "8px 12px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontFamily: "inherit" },
  btnGhost: { background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "10px 18px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13 },
  btnPrimary: { background: "linear-gradient(90deg,#a855f7,#fbbf24)", color: "#0d1117", border: "none", padding: "10px 22px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 13 },
  smallBtn: { background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 12 },
  label: { fontSize: 11, color: "#9ca3af", fontFamily: "'Geist Mono',monospace", letterSpacing: 0.4, display: "block", marginBottom: 6, fontWeight: 700 },
  hint: { fontSize: 10, color: "#5b6470", marginTop: 4, fontStyle: "italic" },
  input: { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 8, padding: "10px 12px", color: "#e6edf3", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" },
  infoBox: { padding: "12px 16px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10, fontSize: 12, color: "#9da7b3", lineHeight: 1.6 },
  subCard: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 10, padding: 14, display: "grid", gap: 10 },
  subCardHead: { fontSize: 13, fontWeight: 800, color: "#fff", marginBottom: 4 },
  msg: { fontSize: 12, padding: "10px 14px", borderRadius: 8, marginTop: 14, border: "1px solid", background: "rgba(255,255,255,0.02)" },
};
