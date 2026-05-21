// src/Admin/AdminPettyCash.jsx
// Petty Cash — kas kecil per outlet + budget bulanan.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#d97706";
const ST = { ok: "#10b981", warning: "#f59e0b", over: "#ef4444" };
const ago = (ts) => {
  if (!ts) return "—";
  const h = Math.floor((Date.now() / 1000 - ts) / 3600);
  if (h < 1) return "baru saja";
  if (h < 24) return h + " jam lalu";
  return Math.floor(h / 24) + " hari lalu";
};

export default function AdminPettyCash({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/petty-cash`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const act = (path, body, okMsg) => {
    fetch(`${apiBase}/api/petty-cash/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(okMsg); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };
  const topup = (o) => {
    const a = window.prompt(`Top-up kas — ${o.outlet}\nSaldo: ${fmtRp(o.balance)}\n\nJumlah top-up:`, "1000000");
    if (a == null) return;
    act("topup", { outlet: o.outlet, amount: Number(a), by: "Finance" }, `✓ Top-up ${o.outlet} ${fmtRp(Number(a))}`);
  };
  const expense = (o) => {
    const a = window.prompt(`Pengeluaran kas — ${o.outlet}\nSaldo: ${fmtRp(o.balance)}\n\nJumlah:`, "");
    if (a == null || !(Number(a) > 0)) return;
    const desc = window.prompt("Keterangan pengeluaran:", "") || "Pengeluaran";
    act("expense", { outlet: o.outlet, amount: Number(a), description: desc, by: "Outlet Manager" }, `✓ Pengeluaran ${o.outlet} dicatat`);
  };
  const setBudget = (o) => {
    const a = window.prompt(`Set budget bulanan — ${o.outlet}\nSaat ini: ${fmtRp(o.monthly_budget)}\n\nBudget baru:`, String(o.monthly_budget));
    if (a == null) return;
    act("budget", { outlet: o.outlet, monthly_budget: Number(a) }, `✓ Budget ${o.outlet} di-set ${fmtRp(Number(a))}`);
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Petty Cash…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        💵 <b style={{ color: "#fbbf24" }}>PETTY CASH &amp; BUDGET</b> — kas kecil per outlet dengan budget
        bulanan. Top-up, pengeluaran, saldo realtime &amp; kontrol budget. Simple Purchase via Petty Cash auto-tercatat.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Saldo Kas" v={fmtRp(s.total_balance)} c={AC} />
        <Kpi label="Total Budget /Bln" v={fmtRp(s.total_budget)} c="#3b82f6" />
        <Kpi label="Belanja Bulan Ini" v={fmtRp(s.month_expense)} c="#f59e0b" />
        <Kpi label="Over Budget" v={String(s.over_budget)} c={s.over_budget > 0 ? "#ef4444" : "#10b981"} sub="outlet" />
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      {/* Outlet cards */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🏪 KAS KECIL PER OUTLET</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 12, marginTop: 10 }}>
          {d.outlets.map(o => (
            <div key={o.outlet} style={{ background: "#0a0e16", border: "1px solid #161b22", borderTop: `2px solid ${ST[o.status]}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#e6edf3" }}>{o.outlet}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: ST[o.status], fontFamily: "'Space Mono',monospace" }}>{o.status.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: AC, fontFamily: "'Space Mono',monospace", margin: "5px 0 2px" }}>{fmtRp(o.balance)}</div>
              <div style={{ fontSize: 10, color: "#5b6470" }}>saldo kas tersedia</div>
              <div style={{ marginTop: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#5b6470", marginBottom: 3 }}>
                  <span>Budget kepakai</span>
                  <span style={{ fontFamily: "'Space Mono',monospace", color: ST[o.status] }}>{fmtRp(o.month_expense)} / {fmtRp(o.monthly_budget)} · {o.budget_used_pct}%</span>
                </div>
                <div style={{ height: 8, background: "#161b22", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: Math.min(100, o.budget_used_pct) + "%", background: ST[o.status] }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <button onClick={() => topup(o)} style={S.btn("#10b981")}>+ Top-up</button>
                <button onClick={() => expense(o)} style={S.btn("#ef4444")}>− Expense</button>
                <button onClick={() => setBudget(o)} style={S.btn("#3b82f6")}>🎯 Budget</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction log */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📜 TRANSAKSI KAS — 20 terbaru</div>
        {d.transactions.map((t, i) => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? "1px solid #161b22" : "none", fontSize: 12 }}>
            <span style={{ fontSize: 15 }}>{t.txn_type === "topup" ? "⬆️" : "⬇️"}</span>
            <span style={{ width: 90, color: "#e6edf3", fontWeight: 600 }}>{t.outlet}</span>
            <span style={{ flex: 1, color: "#9da7b3" }}>{t.description}</span>
            <span style={{ color: "#5b6470", fontSize: 10 }}>{t.by_who} · {ago(t.at)}</span>
            <span style={{ width: 110, textAlign: "right", fontFamily: "'Space Mono',monospace", fontWeight: 700, color: t.txn_type === "topup" ? "#10b981" : "#f87171" }}>
              {t.txn_type === "topup" ? "+" : "−"}{fmtRp(t.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, v, c, sub }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Space Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace", margin: "4px 0 2px" }}>{v}</div>
      <div style={{ fontSize: 10, color: "#5b6470" }}>{sub || " "}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  btn: (c) => ({ flex: 1, background: c + "1f", border: `1px solid ${c}55`, color: c, fontSize: 11, fontWeight: 700, padding: "6px 8px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }),
};
