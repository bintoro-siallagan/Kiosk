// AdminBilling.jsx — Billing & subscription management
// Super-admin: MRR/ARR dashboard + tenant list + invoice management
// Tenant admin: own plan + invoice history + upgrade CTA
import { useCallback, useEffect, useMemo, useState } from "react";

const PURPLE = "#a855f7", GREEN = "#10b981", AMBER = "#f59e0b", RED = "#ef4444", CYAN = "#22d3ee", PINK = "#ec4899", BLUE = "#3b82f6";
const CARD_BG = "rgba(255,255,255,0.04)";
const BORDER  = "1px solid rgba(255,255,255,0.08)";

const STATUS_COLOR = { open: AMBER, paid: GREEN, overdue: RED, void: "#64748b" };

const fmtIDR = (n) => "Rp " + (Number(n) || 0).toLocaleString("id-ID");
const fmtIDRShort = (n) => {
  n = Number(n) || 0;
  if (n >= 1_000_000_000) return "Rp " + (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return "Rp " + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "Rp " + (n / 1_000).toFixed(0) + "K";
  return "Rp " + n;
};
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (ts) => ts ? new Date(ts * 1000).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export default function AdminBilling({ apiBase = "" }) {
  const API = apiBase || (typeof window !== "undefined" && window.location.origin) || "";
  const [my, setMy] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [plans, setPlans] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [mrr, setMrr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [view, setView] = useState("dashboard"); // dashboard | tenants | invoices | plans
  const [editingTenant, setEditingTenant] = useState(null);

  const isSuperAdmin = my?.super_admin === true;

  const load = useCallback(() => {
    setLoading(true); setErr("");
    fetch(`${API}/api/billing/my`).then(r => r.json()).then(myData => {
      setMy(myData);
      if (myData?.super_admin) {
        // Super-admin: load all
        Promise.all([
          fetch(`${API}/api/billing/tenant`).then(r => r.json()),
          fetch(`${API}/api/billing/plans`).then(r => r.json()),
          fetch(`${API}/api/billing/invoices`).then(r => r.json()),
          fetch(`${API}/api/billing/mrr`).then(r => r.json()),
        ]).then(([t, p, i, m]) => {
          setTenants(t?.data || []);
          setPlans(p?.data || []);
          setInvoices(i?.data || []);
          setMrr(m);
        }).catch(e => setErr(e.message)).finally(() => setLoading(false));
      } else {
        // Tenant: just own invoices + plans
        fetch(`${API}/api/billing/plans`).then(r => r.json()).then(p => setPlans(p?.data || []));
        setLoading(false);
      }
    }).catch(e => { setErr(e.message); setLoading(false); });
  }, [API]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>⏳ Loading billing…</div>;

  return (
    <div style={{ padding: 20, color: "#e6edf3", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif" }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>
          karyaOS / BILLING — {isSuperAdmin ? "KARYS PLATFORM" : "TENANT VIEW"}
        </div>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginTop: 4, letterSpacing: -0.5 }}>
          💳 Billing & Subscription
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
          {isSuperAdmin ? "MRR/ARR, churn, invoice management cross-tenant" : "Plan kamu + invoice history + upgrade"}
        </div>
      </header>

      {err && <div style={{ padding: 12, background: "rgba(239,68,68,0.1)", border: `1px solid ${RED}55`, borderRadius: 8, color: "#fca5a5", marginBottom: 14 }}>⚠ {err}</div>}

      {isSuperAdmin ? (
        <SuperAdminView
          view={view} setView={setView}
          mrr={mrr} tenants={tenants} plans={plans} invoices={invoices}
          editingTenant={editingTenant} setEditingTenant={setEditingTenant}
          onReload={load} API={API}
        />
      ) : (
        <TenantView my={my} plans={plans} API={API} />
      )}
    </div>
  );
}

// ─── SUPER ADMIN VIEW ───
function SuperAdminView({ view, setView, mrr, tenants, plans, invoices, editingTenant, setEditingTenant, onReload, API }) {
  return (
    <>
      {/* KPI cards */}
      {mrr && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%, 160px),1fr))", gap: 10, marginBottom: 18 }}>
          <Kpi icon="📈" label="MRR"             value={fmtIDRShort(mrr.mrr)} sub={`${mrr.active_tenants} active`} color={GREEN} />
          <Kpi icon="💎" label="ARR"             value={fmtIDRShort(mrr.arr)} color={CYAN} />
          <Kpi icon="🆓" label="ON TRIAL"        value={mrr.trial_tenants} color={AMBER} />
          <Kpi icon="📉" label="CHURN RATE"      value={mrr.churn_rate_pct + "%"} sub={`${mrr.churned} cancelled`} color={mrr.churn_rate_pct > 5 ? RED : "#64748b"} />
          <Kpi icon="📬" label="OPEN INV"        value={mrr.open_invoices.count} sub={fmtIDRShort(mrr.open_invoices.amount)} color={AMBER} />
          <Kpi icon="🚨" label="OVERDUE"         value={mrr.overdue_invoices.count} sub={fmtIDRShort(mrr.overdue_invoices.amount)} color={mrr.overdue_invoices.count > 0 ? RED : "#64748b"} />
          <Kpi icon="💰" label="COLLECTED 30D"   value={fmtIDRShort(mrr.collected_30d)} color={GREEN} />
        </div>
      )}

      {/* View tabs */}
      <div style={{ display: "flex", gap: 4, padding: 4, background: CARD_BG, border: BORDER, borderRadius: 10, marginBottom: 14, flexWrap: "wrap" }}>
        {[["dashboard", "📊 Dashboard"], ["tenants", "🏢 Tenants"], ["invoices", "🧾 Invoices"], ["plans", "📋 Plan Catalog"]].map(([k, lbl]) => (
          <button key={k} onClick={() => setView(k)} style={{
            padding: "8px 14px", background: view === k ? PURPLE : "transparent",
            border: "none", borderRadius: 7, color: view === k ? "#fff" : "#94a3b8",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>{lbl}</button>
        ))}
      </div>

      {view === "dashboard" && mrr && <DashboardView mrr={mrr} />}
      {view === "tenants" && <TenantsView tenants={tenants} plans={plans} onEdit={setEditingTenant} />}
      {view === "invoices" && <InvoicesView invoices={invoices} onReload={onReload} API={API} />}
      {view === "plans" && <PlansCatalog plans={plans} />}

      {editingTenant && <EditTenantModal tenant={editingTenant} plans={plans} onClose={() => setEditingTenant(null)} onSaved={() => { setEditingTenant(null); onReload(); }} API={API} />}
    </>
  );
}

function DashboardView({ mrr }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <div style={{ padding: 16, background: CARD_BG, border: BORDER, borderRadius: 10 }}>
        <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1.5, fontWeight: 700, fontFamily: "'Geist Mono',monospace", marginBottom: 12 }}>📊 MRR BY PLAN</div>
        {mrr.by_plan.length === 0 && <div style={{ color: "#64748b", fontSize: 12 }}>Belum ada subscriber aktif</div>}
        {mrr.by_plan.map((p, i) => (
          <BreakdownBar key={p.plan} label={p.plan} value={p.mrr} count={p.count} total={mrr.mrr} color={[PURPLE, CYAN, PINK, BLUE][i % 4]} />
        ))}
      </div>
      <div style={{ padding: 16, background: CARD_BG, border: BORDER, borderRadius: 10 }}>
        <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1.5, fontWeight: 700, fontFamily: "'Geist Mono',monospace", marginBottom: 12 }}>🎯 MRR BY VERTICAL</div>
        {mrr.by_vertical.length === 0 && <div style={{ color: "#64748b", fontSize: 12 }}>Belum ada data</div>}
        {mrr.by_vertical.map((v, i) => (
          <BreakdownBar key={v.vertical} label={v.vertical.toUpperCase()} value={v.mrr} count={v.count} total={mrr.mrr} color={v.vertical === "cinema" ? PINK : v.vertical === "fnb" ? CYAN : PURPLE} />
        ))}
      </div>
    </div>
  );
}

function BreakdownBar({ label, value, count, total, color }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 600 }}>{label} · {count}</span>
        <span style={{ fontSize: 12, color: "#fff", fontWeight: 700, fontFamily: "'Geist Mono',monospace" }}>{fmtIDRShort(value)} ({pct.toFixed(0)}%)</span>
      </div>
      <div style={{ width: "100%", height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

function TenantsView({ tenants, plans, onEdit }) {
  return (
    <div style={{ background: CARD_BG, border: BORDER, borderRadius: 10, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "rgba(0,0,0,0.3)", color: "#94a3b8", fontSize: 10, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>
            <th style={th}>COMPANY</th><th style={th}>VERTICAL</th><th style={th}>PLAN</th><th style={th}>CYCLE</th><th style={th}>AMOUNT</th><th style={th}>NEXT DUE</th><th style={th}>STATUS</th><th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {tenants.length === 0 && <tr><td colSpan={8} style={{ padding: 20, textAlign: "center", color: "#64748b" }}>No tenants</td></tr>}
          {tenants.map(t => {
            const isTrial = t.plan_code === "TRIAL";
            const trialDaysLeft = isTrial && t.trial_until ? Math.max(0, Math.ceil((t.trial_until - Date.now()/1000) / 86400)) : null;
            return (
              <tr key={t.id} style={{ borderTop: BORDER }}>
                <td style={td}>
                  <div style={{ color: "#fff", fontWeight: 700 }}>{t.company_name}</div>
                  <div style={{ color: "#64748b", fontSize: 10, fontFamily: "'Geist Mono',monospace" }}>{t.company_code}</div>
                </td>
                <td style={td}><span style={chip(t.primary_vertical === "cinema" ? PINK : t.primary_vertical === "fnb" ? CYAN : PURPLE)}>{t.primary_vertical}</span></td>
                <td style={td}>
                  <div style={{ color: "#fff" }}>{t.plan_name || t.plan_code}</div>
                  {trialDaysLeft != null && <div style={{ color: AMBER, fontSize: 10, fontWeight: 700 }}>⏰ Trial {trialDaysLeft}d left</div>}
                </td>
                <td style={td}>{t.billing_cycle}</td>
                <td style={{ ...td, fontFamily: "'Geist Mono',monospace", color: "#fff" }}>{fmtIDR(t.amount_idr)}</td>
                <td style={td}>{fmtDate(t.next_due_at)}</td>
                <td style={td}><span style={chip(t.status === "active" ? GREEN : t.status === "cancelled" ? RED : "#64748b")}>{t.status}</span></td>
                <td style={td}><button onClick={() => onEdit(t)} style={btnSmall(PURPLE)}>Edit</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InvoicesView({ invoices, onReload, API }) {
  const [filter, setFilter] = useState("");
  const filtered = invoices.filter(i => !filter || i.status === filter);

  const markPaid = async (id) => {
    const ref = prompt("Payment reference (no. transfer / order id) — kosongkan kalau gak ada:");
    if (ref === null) return;
    const r = await fetch(`${API}/api/billing/invoices/${id}/mark-paid`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_ref: ref || null, method: "transfer", recorded_by: "super-admin" }),
    });
    const j = await r.json();
    if (!r.ok) alert("Gagal: " + (j?.error || "unknown"));
    else { alert("✓ Invoice marked paid"); onReload(); }
  };

  const voidInv = async (id) => {
    if (!confirm("Void invoice ini?")) return;
    const r = await fetch(`${API}/api/billing/invoices/${id}/void`, { method: "POST" });
    if (r.ok) { alert("✓ Voided"); onReload(); }
  };

  return (
    <>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {["", "open", "paid", "overdue", "void"].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: "6px 12px", background: filter === s ? PURPLE : "transparent",
            border: `1px solid ${filter === s ? PURPLE : "rgba(255,255,255,0.1)"}`,
            borderRadius: 6, color: filter === s ? "#fff" : "#94a3b8", fontSize: 11, fontWeight: 700, cursor: "pointer",
          }}>{s || "ALL"} ({filtered.length})</button>
        ))}
      </div>
      <div style={{ background: CARD_BG, border: BORDER, borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "rgba(0,0,0,0.3)", color: "#94a3b8", fontSize: 10, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>
              <th style={th}>INV NO</th><th style={th}>COMPANY</th><th style={th}>PERIOD</th><th style={th}>AMOUNT</th><th style={th}>DUE</th><th style={th}>STATUS</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#64748b" }}>No invoices</td></tr>}
            {filtered.map(i => (
              <tr key={i.id} style={{ borderTop: BORDER }}>
                <td style={{ ...td, fontFamily: "'Geist Mono',monospace", color: "#fff", fontWeight: 700 }}>{i.invoice_no}</td>
                <td style={td}><div style={{ color: "#fff" }}>{i.company_name}</div><div style={{ color: "#64748b", fontSize: 10, fontFamily: "'Geist Mono',monospace" }}>{i.company_code}</div></td>
                <td style={td}>{fmtDate(i.period_start)} → {fmtDate(i.period_end)}</td>
                <td style={{ ...td, fontFamily: "'Geist Mono',monospace", color: "#fff" }}>{fmtIDR(i.total_idr)}<div style={{ color: "#64748b", fontSize: 10 }}>+{fmtIDRShort(i.ppn_idr)} PPN</div></td>
                <td style={td}>{fmtDate(i.due_at)}{i.paid_at && <div style={{ color: GREEN, fontSize: 10 }}>✓ {fmtDate(i.paid_at)}</div>}</td>
                <td style={td}><span style={chip(STATUS_COLOR[i.status])}>{i.status.toUpperCase()}</span></td>
                <td style={td}>
                  {i.status === "open" || i.status === "overdue" ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => markPaid(i.id)} style={btnSmall(GREEN)}>✓ Paid</button>
                      <button onClick={() => voidInv(i.id)} style={btnSmall("#64748b")}>Void</button>
                    </div>
                  ) : (i.payment_ref && <span style={{ fontSize: 10, color: "#64748b", fontFamily: "'Geist Mono',monospace" }}>{i.payment_ref}</span>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PlansCatalog({ plans, currentPlan, onUpgrade }) {
  const PLAN_ORDER = { TRIAL: 0, STARTER: 1, GROWTH: 2, PRO: 3, ENTERPRISE: 4 };
  const curIdx = PLAN_ORDER[currentPlan] ?? -1;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%, 280px),1fr))", gap: 14 }}>
      {plans.filter(p => p.code !== "TRIAL").map(p => {
        const isCurrent = currentPlan === p.code;
        const isDowngrade = (PLAN_ORDER[p.code] ?? 99) < curIdx;
        const isUpgrade = !isCurrent && !isDowngrade;
        const planColor = p.tier === "enterprise" ? "#fbbf24" : p.tier === "growth" ? "#22d3ee" : "#10b981";
        return (
          <div key={p.code} style={{
            padding: 18, background: isCurrent ? `linear-gradient(135deg, ${planColor}22, rgba(0,0,0,0.4))` : CARD_BG,
            border: isCurrent ? `2px solid ${planColor}` : BORDER, borderRadius: 12,
            position: "relative",
          }}>
            {isCurrent && (
              <div style={{ position: "absolute", top: -10, right: 14, padding: "3px 10px", background: planColor, color: "#000", fontSize: 10, fontWeight: 800, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", borderRadius: 5 }}>CURRENT</div>
            )}
            <div style={{ fontSize: 10, color: planColor, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>{p.vertical.toUpperCase()} · {p.tier.toUpperCase()}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", marginTop: 4, marginBottom: 2 }}>{p.name}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 14 }}>{p.description}</div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: "'Geist Mono',monospace" }}>{fmtIDR(p.monthly_price_idr)}<span style={{ fontSize: 12, color: "#64748b", fontWeight: 400 }}> / bulan</span></div>
              <div style={{ fontSize: 11, color: GREEN, marginTop: 2 }}>atau {fmtIDR(p.annual_price_idr)}/tahun (hemat 2 bulan)</div>
            </div>

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 6 }}>FITUR</div>
            <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 12, color: "#cbd5e1", lineHeight: 1.7 }}>
              {p.features?.map((f, i) => <li key={i}>{typeof f === "string" ? f : f.label || f.feature || JSON.stringify(f)}</li>)}
            </ul>

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: BORDER, fontSize: 11, color: "#94a3b8" }}>
              🏪 {p.max_outlets === null ? "Unlimited" : p.max_outlets} outlet · 👥 {p.max_users === null ? "Unlimited" : p.max_users} user
            </div>

            {/* Upgrade CTA — only shows for tenant view (onUpgrade prop set) */}
            {onUpgrade && (
              <div style={{ marginTop: 14 }}>
                {isCurrent ? (
                  <div style={{ padding: 10, textAlign: "center", fontSize: 12, color: planColor, fontWeight: 700, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, background: `${planColor}11`, borderRadius: 8 }}>✓ AKTIF</div>
                ) : isDowngrade ? (
                  <button disabled style={{ width: "100%", padding: 12, background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.15)", borderRadius: 8, color: "#64748b", fontWeight: 700, fontSize: 12, cursor: "not-allowed", fontFamily: "inherit" }}>
                    Downgrade — hubungi support
                  </button>
                ) : (
                  <button onClick={() => onUpgrade(p)} style={{
                    width: "100%", padding: 12,
                    background: `linear-gradient(135deg, ${planColor}, ${planColor}cc)`,
                    border: "none", borderRadius: 8, color: "#000",
                    fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.3,
                  }}>🚀 Upgrade ke {p.name.replace(/^[^\w]+/, "").trim()}</button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── TENANT VIEW ───
function TenantView({ my, plans, API }) {
  if (my?.no_billing) return <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>⚠ Belum ada subscription. Hubungi admin Karys.</div>;
  const t = my.tenant;
  const isTrial = t?.plan_code === "TRIAL";
  const trialDaysLeft = isTrial && t?.trial_until ? Math.max(0, Math.ceil((t.trial_until - Date.now()/1000) / 86400)) : null;
  const [upgrading, setUpgrading] = useState(null); // { plan } during confirmation
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(null);
  const [cycleChoice, setCycleChoice] = useState("monthly");

  const confirmUpgrade = async () => {
    if (!upgrading) return;
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/billing/self-upgrade`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_code: upgrading.code, billing_cycle: cycleChoice }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Gagal");
      setSuccess(j);
      setUpgrading(null);
      // Reload after 2s so user sees new plan
      setTimeout(() => window.location.reload(), 2500);
    } catch (e) { alert("⚠ " + e.message); }
    setBusy(false);
  };

  return (
    <>
      {/* Current plan card */}
      <div style={{ padding: 20, background: `linear-gradient(135deg, ${PURPLE}22, rgba(0,0,0,0.4))`, border: `1px solid ${PURPLE}55`, borderRadius: 14, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: PURPLE, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>CURRENT PLAN</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginTop: 4 }}>{t.plan_name || t.plan_code}</div>
            {isTrial && trialDaysLeft != null && <div style={{ fontSize: 13, color: AMBER, marginTop: 4, fontWeight: 700 }}>⏰ Trial sisa {trialDaysLeft} hari</div>}
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>Cycle: {t.billing_cycle} · Next due: {fmtDate(t.next_due_at)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", fontFamily: "'Geist Mono',monospace" }}>{fmtIDR(t.amount_idr)}</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>per {t.billing_cycle === "annual" ? "tahun" : "bulan"}</div>
          </div>
        </div>

        {my.unpaid_count > 0 && (
          <div style={{ marginTop: 14, padding: 12, background: "rgba(239,68,68,0.15)", border: `1px solid ${RED}55`, borderRadius: 8 }}>
            🚨 <b>{my.unpaid_count} invoice belum dibayar</b> total {fmtIDR(my.unpaid_total)} — segera lunasi via transfer bank Karys.
          </div>
        )}
      </div>

      {/* Invoice history */}
      <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1.5, fontWeight: 700, fontFamily: "'Geist Mono',monospace", marginBottom: 10 }}>🧾 RIWAYAT INVOICE</div>
      {my.invoices.length === 0 ? (
        <div style={{ padding: 30, textAlign: "center", color: "#64748b", background: CARD_BG, border: BORDER, borderRadius: 10 }}>Belum ada invoice</div>
      ) : (
        <div style={{ background: CARD_BG, border: BORDER, borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "rgba(0,0,0,0.3)", color: "#94a3b8", fontSize: 10, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>
                <th style={th}>INV NO</th><th style={th}>PERIOD</th><th style={th}>AMOUNT</th><th style={th}>DUE</th><th style={th}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {my.invoices.map(i => (
                <tr key={i.id} style={{ borderTop: BORDER }}>
                  <td style={{ ...td, fontFamily: "'Geist Mono',monospace", color: "#fff", fontWeight: 700 }}>{i.invoice_no}</td>
                  <td style={td}>{fmtDate(i.period_start)} → {fmtDate(i.period_end)}</td>
                  <td style={{ ...td, fontFamily: "'Geist Mono',monospace", color: "#fff" }}>{fmtIDR(i.total_idr)}</td>
                  <td style={td}>{fmtDate(i.due_at)}</td>
                  <td style={td}><span style={chip(STATUS_COLOR[i.status])}>{i.status.toUpperCase()}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upgrade CTA */}
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1.5, fontWeight: 700, fontFamily: "'Geist Mono',monospace", marginBottom: 10 }}>🚀 UPGRADE PLAN</div>
        <PlansCatalog plans={plans} currentPlan={t?.plan_code} onUpgrade={(plan) => { setUpgrading(plan); setCycleChoice("monthly"); }} />
      </div>

      {/* Upgrade Confirm Modal */}
      {upgrading && (
        <div onClick={() => !busy && setUpgrading(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20, backdropFilter: "blur(6px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "min(480px, 100%)", background: "rgba(10,15,28,0.96)", border: `1px solid ${PURPLE}55`, borderRadius: 16, padding: 26 }}>
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 48, marginBottom: 6 }}>🚀</div>
              <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>UPGRADE CONFIRMATION</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginTop: 6 }}>{upgrading.name}</div>
            </div>
            <div style={{ padding: 14, background: "rgba(168,85,247,0.08)", border: `1px solid ${PURPLE}33`, borderRadius: 10, marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                <span style={{ color: "#94a3b8" }}>Plan saat ini:</span>
                <span style={{ color: "#fff", fontWeight: 600 }}>{t.plan_name || t.plan_code}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "#94a3b8" }}>Plan baru:</span>
                <span style={{ color: PURPLE, fontWeight: 800 }}>{upgrading.name}</span>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 1.5, fontWeight: 700, fontFamily: "'Geist Mono',monospace", marginBottom: 6 }}>SIKLUS PEMBAYARAN</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setCycleChoice("monthly")} style={{ flex: 1, padding: 10, background: cycleChoice === "monthly" ? PURPLE : "transparent", border: `1px solid ${cycleChoice === "monthly" ? PURPLE : "rgba(255,255,255,0.15)"}`, borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  Bulanan<br /><span style={{ fontSize: 14, fontFamily: "'Geist Mono',monospace" }}>{fmtIDR(upgrading.monthly_price_idr)}</span>
                </button>
                <button onClick={() => setCycleChoice("annual")} style={{ flex: 1, padding: 10, background: cycleChoice === "annual" ? PURPLE : "transparent", border: `1px solid ${cycleChoice === "annual" ? PURPLE : "rgba(255,255,255,0.15)"}`, borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", position: "relative" }}>
                  Tahunan<br /><span style={{ fontSize: 14, fontFamily: "'Geist Mono',monospace" }}>{fmtIDR(upgrading.annual_price_idr)}</span>
                  <span style={{ position: "absolute", top: -8, right: -8, padding: "2px 6px", background: GREEN, color: "#001", fontSize: 9, fontWeight: 800, borderRadius: 4 }}>HEMAT</span>
                </button>
              </div>
            </div>
            <div style={{ padding: 12, background: "rgba(245,158,11,0.08)", border: `1px solid ${AMBER}33`, borderRadius: 8, fontSize: 11, color: "#cbd5e1", marginBottom: 14, lineHeight: 1.6 }}>
              💡 Setelah konfirmasi: invoice langsung dibuat. Transfer ke <b style={{ color: "#fff" }}>BCA 5430-1100-22 a.n. Karys Indonesia</b>, lalu submit bukti via chat WA. Plan aktif setelah pembayaran diverifikasi.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setUpgrading(null)} disabled={busy} style={{ flex: 1, padding: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>Batal</button>
              <button onClick={confirmUpgrade} disabled={busy} style={{ flex: 2, padding: 12, background: `linear-gradient(135deg, ${PURPLE}, #7c3aed)`, border: "none", borderRadius: 10, color: "#fff", fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                {busy ? "⏳ Memproses…" : "✅ Konfirmasi Upgrade"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {success && (
        <div onClick={() => setSuccess(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "min(440px, 100%)", background: "rgba(10,15,28,0.96)", border: `1px solid ${GREEN}55`, borderRadius: 16, padding: 28, textAlign: "center" }}>
            <div style={{ fontSize: 64 }}>🎉</div>
            <div style={{ fontSize: 11, color: GREEN, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginTop: 6 }}>UPGRADE BERHASIL</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginTop: 6 }}>{success.old_plan} → {success.new_plan}</div>
            {success.invoice_no && (
              <div style={{ marginTop: 14, padding: 12, background: "rgba(0,0,0,0.4)", border: `1px dashed ${AMBER}55`, borderRadius: 10 }}>
                <div style={{ fontSize: 10, color: AMBER, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>INVOICE</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", marginTop: 4, fontFamily: "'Geist Mono',monospace" }}>{success.invoice_no}</div>
                <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 4 }}>{fmtIDR(success.amount_idr)} · transfer ke BCA</div>
              </div>
            )}
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 14, lineHeight: 1.6 }}>{success.message}</div>
            <button onClick={() => window.location.reload()} style={{ marginTop: 18, padding: "12px 24px", background: GREEN, border: "none", borderRadius: 10, color: "#001", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>OK</button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── EDIT TENANT MODAL (super-admin) ───
function EditTenantModal({ tenant, plans, onClose, onSaved, API }) {
  const [planCode, setPlanCode] = useState(tenant.plan_code);
  const [cycle, setCycle] = useState(tenant.billing_cycle);
  const [status, setStatus] = useState(tenant.status);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`${API}/api/billing/tenant`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: tenant.company_id, plan_code: planCode, billing_cycle: cycle, status }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error);
      onSaved();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(520px, 100%)", background: "#0a0f1c", border: BORDER, borderRadius: 14, padding: 22 }}>
        <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>EDIT TENANT BILLING</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginTop: 4, marginBottom: 14 }}>{tenant.company_name}</div>

        <Field label="📋 PLAN">
          <select value={planCode} onChange={e => setPlanCode(e.target.value)} style={inp}>
            {plans.map(p => <option key={p.code} value={p.code}>{p.name} — {fmtIDR(p.monthly_price_idr)}/mo</option>)}
          </select>
        </Field>
        <Field label="🔄 BILLING CYCLE">
          <select value={cycle} onChange={e => setCycle(e.target.value)} style={inp}>
            <option value="monthly">Monthly</option>
            <option value="annual">Annual (hemat 2 bulan)</option>
          </select>
        </Field>
        <Field label="📊 STATUS">
          <select value={status} onChange={e => setStatus(e.target.value)} style={inp}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="cancelled">Cancelled (churn)</option>
          </select>
        </Field>

        {err && <div style={{ padding: 10, background: "rgba(239,68,68,0.1)", border: `1px solid ${RED}55`, borderRadius: 8, color: "#fca5a5", fontSize: 12, marginBottom: 10 }}>⚠ {err}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, background: "rgba(255,255,255,0.06)", border: BORDER, borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer" }}>Batal</button>
          <button onClick={submit} disabled={busy} style={{ flex: 2, padding: 12, background: `linear-gradient(135deg,${PURPLE},#7c3aed)`, border: "none", borderRadius: 10, color: "#fff", fontWeight: 800, cursor: busy ? "not-allowed" : "pointer" }}>{busy ? "⏳" : "💾 Simpan"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── UI helpers ───
function Kpi({ icon, label, value, sub, color }) {
  return (
    <div style={{ padding: 14, background: CARD_BG, border: `1px solid ${color}33`, borderRadius: 10 }}>
      <div style={{ fontSize: 18 }}>{icon}</div>
      <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginTop: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color, marginTop: 4, fontFamily: "'Geist Mono',monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const inp = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(0,0,0,0.35)", border: BORDER,
  borderRadius: 8, padding: "10px 12px", color: "#fff",
  fontSize: 13, fontFamily: "inherit", outline: "none",
};
const th = { padding: "10px 12px", textAlign: "left", fontWeight: 700 };
const td = { padding: "10px 12px", verticalAlign: "top" };
const chip = (c) => ({ padding: "2px 8px", background: c + "22", border: `1px solid ${c}55`, borderRadius: 4, color: c, fontSize: 10, fontWeight: 700, fontFamily: "'Geist Mono',monospace", display: "inline-block" });
const btnSmall = (c) => ({ padding: "4px 10px", background: c, border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" });
