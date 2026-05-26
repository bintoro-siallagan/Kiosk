// OnboardingChecklist.jsx — first-login walkthrough untuk tenant baru
// Auto-cek progress: outlet GPS, menu, team, POS test
// Hides itself after all done (dismissed locally) atau >7 hari setelah signup
import { useEffect, useState } from "react";
import API_HOST from "../apiBase.js";

const PURPLE = "#a855f7", GREEN = "#10b981", AMBER_COLOR = "#f59e0b", CYAN = "#22d3ee";
const AMBER = AMBER_COLOR;

export default function OnboardingChecklist({ onNavigate }) {
  const [checks, setChecks] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("karya_onboard_dismissed") === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (dismissed) return;
    let alive = true;
    Promise.all([
      fetch(`${API_HOST}/api/billing/my`).then(r => r.json()).catch(() => null),
      fetch(`${API_HOST}/api/outlet-master`).then(r => r.json()).catch(() => null),
      fetch(`${API_HOST}/api/menu`).then(r => r.json()).catch(() => []),
      fetch(`${API_HOST}/api/auth/users`).then(r => r.json()).catch(() => []),
      fetch(`${API_HOST}/api/orders?limit=1`).then(r => r.json()).catch(() => null),
    ]).then(([billing, outlets, menu, users, orders]) => {
      if (!alive) return;
      // Skip for super-admin
      if (billing?.super_admin) { setDismissed(true); return; }
      const outletList = outlets?.outlets || [];
      const hasGps = outletList.some(o => o.lat && o.lon);
      const menuList = Array.isArray(menu) ? menu : (menu?.data || []);
      const userList = Array.isArray(users) ? users : (users?.users || []);
      const orderList = orders?.data || orders?.orders || [];
      setChecks({
        signup:    { done: true,                     label: "Tenant aktif",            cta: null },
        gps:       { done: hasGps,                   label: "Set lokasi outlet (GPS)",  cta: () => onNavigate?.("outlet_master") },
        menu:      { done: menuList.length > 0,      label: `Upload menu (${menuList.length} item)`, cta: () => onNavigate?.("menu_builder") },
        team:      { done: userList.length > 1,     label: `Invite team (${userList.length} user)`,  cta: () => onNavigate?.("admin_users") },
        firstOrder:{ done: orderList.length > 0,     label: "Test POS — transaksi pertama", cta: null },
      });
    });
    return () => { alive = false; };
  }, [dismissed, onNavigate]);

  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState("");

  if (dismissed || !checks) return null;
  const items = Object.values(checks);
  const doneCount = items.filter(i => i.done).length;
  const total = items.length;
  if (doneCount === total) return null; // semua done, hide

  const dismiss = () => {
    try { localStorage.setItem("karya_onboard_dismissed", "1"); } catch {}
    setDismissed(true);
  };

  const loadSample = async () => {
    if (!confirm("Load sample data (8 menu + 3 customers)?\nBisa di-reset nanti via Admin → Settings.")) return;
    setSeeding(true); setSeedMsg("");
    try {
      const r = await fetch(`${API_HOST}/api/onboarding/seed-sample`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Gagal");
      setSeedMsg(`✓ ${j.menu_added} menu + ${j.customers_added} customer ditambah. Refreshing…`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) { setSeedMsg("⚠ " + e.message); }
    setSeeding(false);
  };

  const pct = Math.round((doneCount / total) * 100);
  // Detect fresh tenant (no menu yet) untuk show "Load sample" CTA
  const noMenu = checks.menu && !checks.menu.done;

  return (
    <div style={{
      padding: 16, margin: "8px 0",
      background: `linear-gradient(135deg, ${PURPLE}22, ${CYAN}11)`,
      border: `1px solid ${PURPLE}44`, borderRadius: 12,
      position: "relative",
    }}>
      <button onClick={dismiss} title="Sembunyikan" style={{
        position: "absolute", top: 8, right: 8,
        background: "transparent", border: "none", color: "#94a3b8",
        fontSize: 18, cursor: "pointer", lineHeight: 1,
      }}>×</button>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 22 }}>🚀</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: -0.3 }}>Setup karyaOS — {doneCount}/{total} langkah selesai</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Selesaikan checklist ini biar outlet kamu siap go-live.</div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: pct === 100 ? GREEN : PURPLE, fontFamily: "'Geist Mono',monospace" }}>{pct}%</div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 6, background: "rgba(0,0,0,0.4)", borderRadius: 3, overflow: "hidden", marginBottom: 12 }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: `linear-gradient(90deg, ${PURPLE}, ${CYAN})`,
          transition: "width 0.4s ease",
        }} />
      </div>

      {/* Items */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 8 }}>
        {items.map((it, i) => (
          <button key={i}
            onClick={it.cta && !it.done ? it.cta : undefined}
            disabled={!it.cta || it.done}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: 10, textAlign: "left",
              background: it.done ? `${GREEN}10` : "rgba(255,255,255,0.04)",
              border: `1px solid ${it.done ? GREEN + "44" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 8, color: "#fff",
              cursor: (it.cta && !it.done) ? "pointer" : "default",
              fontFamily: "inherit",
            }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              background: it.done ? GREEN : "rgba(255,255,255,0.08)",
              border: it.done ? "none" : `1px solid rgba(255,255,255,0.15)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 800, color: it.done ? "#001" : "#94a3b8", flexShrink: 0,
            }}>{it.done ? "✓" : i + 1}</div>
            <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: it.done ? "#94a3b8" : "#fff", textDecoration: it.done ? "line-through" : "none" }}>{it.label}</div>
            {it.cta && !it.done && <span style={{ color: PURPLE, fontSize: 16 }}>→</span>}
          </button>
        ))}
      </div>

      {/* Sample data CTA — visible kalau tenant baru (no menu yet) */}
      {noMenu && (
        <div style={{ marginTop: 12, padding: 12, background: `${AMBER}11`, border: `1px dashed ${AMBER}55`, borderRadius: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 12, color: "#fff", fontWeight: 700 }}>🚀 Mau langsung coba?</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Load 8 menu sample + 3 customer demo, bisa langsung test POS.</div>
            {seedMsg && <div style={{ fontSize: 11, color: seedMsg.startsWith("✓") ? GREEN : "#fca5a5", marginTop: 4, fontWeight: 700 }}>{seedMsg}</div>}
          </div>
          <button onClick={loadSample} disabled={seeding} style={{
            padding: "8px 16px", background: AMBER, border: "none", borderRadius: 8,
            color: "#001", fontWeight: 800, fontSize: 12, cursor: seeding ? "not-allowed" : "pointer",
            fontFamily: "inherit", whiteSpace: "nowrap",
          }}>{seeding ? "⏳ Loading…" : "📦 Load Sample Pack"}</button>
        </div>
      )}
    </div>
  );
}

