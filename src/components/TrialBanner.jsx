// TrialBanner.jsx — shows trial countdown / suspension warning at top of admin
// Reads /api/billing/my which is auto-scoped to tenant via x-company-id header
import { useEffect, useState } from "react";
import API_HOST from "../apiBase.js";

const AMBER = "#f59e0b", RED = "#ef4444", GREEN = "#10b981", CYAN = "#22d3ee";

export default function TrialBanner({ onUpgrade }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch(`${API_HOST}/api/billing/my`).then(r => r.json()).then(j => { if (alive) setData(j); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!data || data.super_admin || data.no_billing || !data.tenant) return null;
  const t = data.tenant;
  const isTrial = t.plan_code === "TRIAL";
  const now = Date.now() / 1000;
  const daysLeft = isTrial && t.trial_until ? Math.max(0, Math.ceil((t.trial_until - now) / 86400)) : null;

  // Suspended / paused — block usage
  if (t.status === "paused" || t.status === "cancelled") {
    return (
      <Banner color={RED}>
        🚫 <b>Akun dijeda — {t.notes || "Subscription expired"}</b>. Hubungi admin Karys atau lunasi invoice untuk re-aktifasi.
      </Banner>
    );
  }

  // Trial soon-to-expire
  if (isTrial && daysLeft != null && daysLeft <= 5) {
    return (
      <Banner color={daysLeft <= 1 ? RED : AMBER}>
        ⏰ Trial tersisa <b>{daysLeft} hari</b>. Upgrade sekarang biar gak putus akses.
        <button onClick={onUpgrade} style={btn(daysLeft <= 1 ? RED : AMBER)}>Lihat Plan →</button>
      </Banner>
    );
  }

  // Unpaid invoice alert
  if (data.unpaid_count > 0) {
    return (
      <Banner color={RED}>
        🧾 <b>{data.unpaid_count} invoice belum dibayar</b> · Total Rp {data.unpaid_total.toLocaleString("id-ID")}. Segera lunasi via transfer.
        <button onClick={onUpgrade} style={btn(RED)}>Lihat Invoice →</button>
      </Banner>
    );
  }

  return null;
}

function Banner({ color, children }) {
  return (
    <div style={{
      padding: "10px 14px", background: `${color}15`, border: `1px solid ${color}55`,
      borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 500,
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      margin: "8px 0",
    }}>
      {children}
    </div>
  );
}

const btn = (c) => ({
  marginLeft: "auto",
  padding: "6px 12px", background: c,
  border: "none", borderRadius: 6, color: "#fff",
  fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
});
