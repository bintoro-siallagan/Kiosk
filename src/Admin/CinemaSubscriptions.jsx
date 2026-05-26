// karyaOS — Cinema Subscription Pass Admin (CULTPASS-style)
// Plans CRUD (Monthly/N-ticket) + active subscriptions list.

import { useState, useEffect, useCallback } from "react";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const STATUS_COLOR = { active: "#10b981", expired: "#6b7280", cancelled: "#ef4444", paused: "#fbbf24" };

const emptyPlan = {
  code: "", name: "", description: "",
  plan_type: "unlimited", duration_days: 30, ticket_quota: 0, price: 250000,
  studio_types: [], blackout_days: [], max_per_day: 1, auto_renew: false,
};

export default function CinemaSubscriptions({ apiBase = "" }) {
  const base = `${apiBase}/api/cinema`;
  const [tab, setTab] = useState("plans");
  const [plans, setPlans] = useState([]);
  const [subs, setSubs] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyPlan);
  const [msg, setMsg] = useState(null);

  const showMsg = (m, kind = "ok") => { setMsg({ m, kind }); setTimeout(() => setMsg(null), 2500); };
  const reload = useCallback(() => {
    fetch(`${base}/subscription-plans`).then(r => r.json()).then(d => setPlans(d.plans || [])).catch(() => {});
    fetch(`${base}/subscriptions`).then(r => r.json()).then(d => setSubs(d.subscriptions || [])).catch(() => {});
  }, [base]);
  useEffect(reload, [reload]);

  const startNew = () => { setEditing("new"); setForm(emptyPlan); };
  const cancel = () => { setEditing(null); setForm(emptyPlan); };

  const savePlan = async () => {
    if (!form.code || !form.name || !form.price) { showMsg("Code, name, price wajib", "err"); return; }
    try {
      const r = await fetch(`${base}/subscription-plans`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Gagal");
      showMsg("✓ Plan created"); cancel(); reload();
    } catch (e) { showMsg("⚠ " + e.message, "err"); }
  };

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🎟️ Subscription Pass (CULTPASS)</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>
            Monthly unlimited atau N-ticket bundle · Auto-deduct saat checkout · Blackout days + studio_type rules · Auto-renew opsional.
          </div>
        </div>
        {tab === "plans" && !editing && <button onClick={startNew} style={B.add}>＋ Plan baru</button>}
      </div>

      <div style={{ display: "inline-flex", gap: 4, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 10, padding: 3, marginBottom: 14 }}>
        {[
          { v: "plans", l: `📦 Plans (${plans.length})` },
          { v: "subs", l: `👥 Subscribers (${subs.length})` },
        ].map(t => (
          <button key={t.v} onClick={() => setTab(t.v)} style={{
            padding: "8px 16px", background: tab === t.v ? "rgba(168,85,247,0.15)" : "transparent",
            color: tab === t.v ? "#a855f7" : C.sub, border: "none", borderRadius: 8,
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>{t.l}</button>
        ))}
      </div>

      {tab === "plans" && editing && (
        <div style={{ background: C.card, border: `1px solid #a855f766`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#c084fc", marginBottom: 10 }}>＋ Plan Baru</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
            <Field label="Code* (uppercase)"><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="CULT_MONTHLY" style={{ ...inp, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }} /></Field>
            <Field label="Nama plan*"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="🎟️ CULTPASS Monthly Unlimited" style={inp} /></Field>
            <Field label="Type">
              <select value={form.plan_type} onChange={e => setForm({ ...form, plan_type: e.target.value })} style={inp}>
                <option value="unlimited">♾️ Unlimited</option>
                <option value="n_ticket">🎟️ N-Ticket Bundle</option>
              </select>
            </Field>
            <Field label="Price (Rp)*"><input type="number" step={50000} value={form.price} onChange={e => setForm({ ...form, price: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="Duration (days)"><input type="number" value={form.duration_days} onChange={e => setForm({ ...form, duration_days: parseInt(e.target.value, 10) || 30 })} style={inp} /></Field>
            {form.plan_type === "n_ticket" && (
              <Field label="Ticket quota"><input type="number" value={form.ticket_quota} onChange={e => setForm({ ...form, ticket_quota: parseInt(e.target.value, 10) || 5 })} style={inp} /></Field>
            )}
            <Field label="Max per hari"><input type="number" value={form.max_per_day} onChange={e => setForm({ ...form, max_per_day: parseInt(e.target.value, 10) || 1 })} style={inp} /></Field>
            <Field label="Studio types allowed (comma-sep)">
              <input value={form.studio_types?.join(",") || ""}
                onChange={e => setForm({ ...form, studio_types: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                placeholder="Regular,Deluxe (kosong = semua)" style={inp} />
            </Field>
            <Field label="Blackout days (comma)">
              <input value={form.blackout_days?.join(",") || ""}
                onChange={e => setForm({ ...form, blackout_days: e.target.value.split(",").map(s => s.trim().toLowerCase()).filter(Boolean) })}
                placeholder="saturday,sunday (kosong = no blackout)" style={inp} />
            </Field>
            <Field label="Description" wide style={{ gridColumn: "span 2" }}><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ ...inp, minHeight: 50, resize: "vertical" }} /></Field>
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 12, alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={form.auto_renew} onChange={e => setForm({ ...form, auto_renew: e.target.checked })} /> 🔄 Auto-renew
            </label>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={savePlan} style={B.save}>Buat Plan</button>
            <button onClick={cancel} style={B.cancel}>Cancel</button>
          </div>
        </div>
      )}

      {tab === "plans" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
          {plans.length === 0 ? <div style={{ gridColumn: "1/-1", padding: 30, textAlign: "center", color: C.sub, background: C.card, border: `1px dashed ${C.border}`, borderRadius: 12 }}>No plan. Klik ＋ Plan baru.</div>
            : plans.map(p => (
              <div key={p.id} style={{ background: C.card, border: `1px solid ${p.plan_type === "unlimited" ? "#a855f755" : "#22d3ee55"}`, borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 11, color: p.plan_type === "unlimited" ? "#c084fc" : "#22d3ee", fontFamily: "'Geist Mono',monospace", letterSpacing: 1.5, fontWeight: 800, marginBottom: 6 }}>
                  {p.plan_type === "unlimited" ? "♾️ UNLIMITED" : `🎟️ ${p.ticket_quota}-TICKET BUNDLE`}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: C.sub, fontFamily: "'Geist Mono',monospace", marginBottom: 10 }}>{p.code}</div>
                {p.description && <div style={{ fontSize: 12, color: C.sub, marginBottom: 10, lineHeight: 1.4 }}>{p.description}</div>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  <span style={pillTag}>📅 {p.duration_days} hari</span>
                  <span style={pillTag}>🎫 {p.max_per_day}/hari max</span>
                  {p.studio_types?.length > 0 && <span style={pillTag}>🎬 {p.studio_types.join("/")}</span>}
                  {p.blackout_days?.length > 0 && <span style={{ ...pillTag, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5" }}>❌ {p.blackout_days.join("/")}</span>}
                  {p.auto_renew ? <span style={pillTag}>🔄 Auto-renew</span> : null}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div>
                    <div style={{ fontSize: 10, color: C.dim }}>Harga</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: p.plan_type === "unlimited" ? "#c084fc" : "#22d3ee", fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5 }}>{rp(p.price)}</div>
                    <div style={{ fontSize: 11, color: C.sub }}>/{p.duration_days === 30 ? "bulan" : `${p.duration_days}d`}</div>
                  </div>
                  <div style={{ fontSize: 11, color: C.sub, fontFamily: "'Geist Mono',monospace" }}>≈ {rp(p.price / p.duration_days)}/hari</div>
                </div>
              </div>
            ))}
        </div>
      )}

      {tab === "subs" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          {subs.length === 0 ? <div style={{ padding: 30, textAlign: "center", color: C.sub }}>No subscriber.</div>
            : subs.map(s => {
              const daysLeft = Math.max(0, Math.ceil((s.expires_at - Date.now() / 1000) / 86400));
              return (
                <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 1fr 0.8fr 0.8fr 0.5fr", padding: "12px 16px", borderBottom: `1px solid ${C.border}`, gap: 10, alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{s.customer_name || "(no name)"}</div>
                    <div style={{ fontSize: 11, color: C.sub, fontFamily: "'Geist Mono',monospace" }}>{s.customer_phone}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: "#c084fc", fontWeight: 700 }}>{s.plan_name || s.plan_code}</div>
                    <div style={{ fontSize: 11, color: C.sub, fontFamily: "'Geist Mono',monospace" }}>{s.plan_code}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontFamily: "'Geist Mono',monospace", color: daysLeft > 7 ? "#10b981" : daysLeft > 0 ? "#fbbf24" : "#ef4444" }}>
                      {new Date(s.expires_at * 1000).toLocaleDateString("id-ID")}
                    </div>
                    <div style={{ fontSize: 10, color: C.dim }}>{daysLeft} hari lagi</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", fontFamily: "'Geist Mono',monospace" }}>{s.tickets_used}</div>
                    <div style={{ fontSize: 10, color: C.dim }}>tiket dipakai</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    {s.tickets_remaining < 999999 && (
                      <>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#22d3ee", fontFamily: "'Geist Mono',monospace" }}>{s.tickets_remaining}</div>
                        <div style={{ fontSize: 10, color: C.dim }}>sisa</div>
                      </>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: STATUS_COLOR[s.status], background: STATUS_COLOR[s.status] + "22", border: `1px solid ${STATUS_COLOR[s.status]}55`, padding: "3px 10px", borderRadius: 999, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase" }}>{s.status}</span>
                    {s.auto_renew ? <div style={{ fontSize: 9, color: "#10b981", marginTop: 3 }}>🔄 auto-renew</div> : null}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {msg && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: msg.kind === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${msg.kind === "err" ? "#ef4444" : "#22c55e"}`, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{msg.m}</div>}
    </div>
  );
}

function Field({ label, children, wide, style }) {
  return (
    <div style={{ gridColumn: wide ? "span 1" : "auto", ...style }}>
      <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
const inp = { padding: "9px 11px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none", width: "100%" };
const pillTag = { fontSize: 10, fontWeight: 700, padding: "3px 8px", background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.3)", color: "#c084fc", borderRadius: 999, fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5 };
const B = {
  add:    { background: "#a855f722", border: "1px solid #a855f766", color: "#c084fc", padding: "9px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  save:   { background: "#10b981", border: "none", color: "#04130c", padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
  cancel: { background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, color: C.sub, padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
};
