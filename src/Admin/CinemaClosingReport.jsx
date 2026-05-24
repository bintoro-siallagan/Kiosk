// karyaOS — Daily Closing Z-Report Cinema
// End of day summary per outlet/date: revenue, occupancy, payment breakdown,
// F&B, vouchers, promos, incidents, cashier sales. Print-friendly + email HQ.
import { useState, useEffect, useCallback } from "react";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtTs = (s) => s ? new Date(s * 1000).toLocaleString("id-ID") : "—";

export default function CinemaClosingReport({ apiBase = "" }) {
  const base = `${apiBase || ""}/api/cinema`;
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [outlet, setOutlet] = useState("");
  const [outlets, setOutlets] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${apiBase}/api/outlet-master`).then(r => r.json())
      .then(d => setOutlets((d.outlets || d.data || []).filter(o => o.status === "active")))
      .catch(() => {});
  }, [apiBase]);

  const load = useCallback(() => {
    setLoading(true);
    const q = new URLSearchParams({ date }); if (outlet) q.set("outlet", outlet);
    fetch(`${base}/closing-report?${q}`).then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, [base, date, outlet]);

  useEffect(() => { load(); }, [load]);

  const emailHQ = async () => {
    if (!data) return;
    const email = prompt("Email HQ untuk kirim Z-report:", "owner@example.com");
    if (!email) return;
    try {
      const r = await fetch(`${apiBase}/api/notification/email`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          subject: `📊 Cinema Z-Report ${data.date} ${data.outlet ? "· " + data.outlet : "ALL"}`,
          html: buildHtmlReport(data),
        }),
      });
      if (r.ok) alert("✓ Email dikirim ke " + email);
      else alert("⚠ Gagal kirim email (cek SMTP config admin)");
    } catch (e) { alert("⚠ " + e.message); }
  };

  if (loading && !data) return <div style={{ padding: 40, textAlign: "center", color: C.sub }}>⏳ Loading report...</div>;

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3", padding: 20 }}>
      {/* Toolbar (no print) */}
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: "#a855f7", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>📊 CINEMA Z-REPORT</div>
          <div style={{ fontSize: 19, fontWeight: 800, marginTop: 4 }}>Daily Closing Report</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ background: "#0a0e16", border: "1px solid #30363d", color: "#fff", borderRadius: 8, padding: "8px 12px", fontFamily: "inherit", fontSize: 12 }} />
          <select value={outlet} onChange={e => setOutlet(e.target.value)} style={{ background: "#0a0e16", border: "1px solid #30363d", color: "#fff", borderRadius: 8, padding: "8px 12px", fontFamily: "inherit", fontSize: 12 }}>
            <option value="">🌐 All Outlets</option>
            {outlets.map(o => <option key={o.code} value={o.code}>{o.code} · {o.name}</option>)}
          </select>
          <button onClick={() => window.print()} style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)", border: "none", color: "#1a1205", borderRadius: 8, padding: "9px 18px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>🖨️ Print</button>
          <button onClick={emailHQ} style={{ background: "rgba(34,211,238,0.15)", border: "1px solid #22d3ee", color: "#22d3ee", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>📧 Email HQ</button>
        </div>
      </div>

      {/* Report — print-friendly */}
      {data && (
        <div className="report-print" style={{ background: "#fff", color: "#000", padding: 28, borderRadius: 10, fontFamily: "'Geist Mono',monospace" }}>
          <style>{`
            @media print {
              @page { size: A4 portrait; margin: 10mm; }
              body { background: #fff !important; color: #000 !important; }
              .no-print { display: none !important; }
              .report-print { box-shadow: none !important; padding: 12mm !important; max-width: none !important; }
              .report-print, .report-print * { color: #000 !important; }
            }
          `}</style>

          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 20, borderBottom: "2px solid #000", paddingBottom: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5 }}>🎬 CINEMA Z-REPORT</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Daily Closing · {data.date} {data.outlet ? `· ${data.outlet}` : "· ALL OUTLETS"}</div>
            <div style={{ fontSize: 11, marginTop: 4, color: "#555" }}>Generated: {fmtTs(data.generated_at)}</div>
          </div>

          {/* KPI Summary */}
          <Section title="📊 SUMMARY">
            <Table rows={[
              ["TIKET TERJUAL", data.summary.tickets_sold || 0],
              ["TRANSAKSI", data.summary.transactions || 0],
              ["GROSS TIKET", rp(data.summary.gross_revenue)],
              ["GROSS F&B BUNDLE", rp(data.summary.fb_revenue)],
              ["TOTAL REVENUE (gross)", rp(data.summary.total_revenue)],
              ["REFUNDED", `${data.summary.refunded_tickets} tiket · ${rp(data.summary.refunded_amount)}`],
              ["VOUCHER DIPAKAI", `${data.vouchers.used.count}× · ${rp(data.vouchers.used.amount)}`],
              ["PROMO DIPAKAI", `${data.promos.count}× · ${rp(data.promos.amount)}`],
              ["📈 NET REVENUE", rp(data.summary.net_revenue), true],
              ["SHOWTIMES", data.summary.showtimes_count || 0],
              ["AVG OCCUPANCY", `${data.summary.avg_occupancy_pct}%`],
            ]} />
          </Section>

          {/* Payment Methods */}
          <Section title="💳 PAYMENT METHODS">
            {data.payment_methods.length === 0 ? <Empty /> : (
              <Table rows={data.payment_methods.map(m => [
                m.method.toUpperCase(), `${m.count}× · ${rp(m.amount)}`,
              ])} />
            )}
          </Section>

          {/* Showtime Occupancy */}
          <Section title="🎬 PER SHOWTIME OCCUPANCY">
            {data.showtimes.length === 0 ? <Empty /> : (
              <table style={tbl}>
                <thead>
                  <tr style={tblHdr}>
                    <th style={th}>JAM</th><th style={th}>FILM</th><th style={th}>STUDIO</th>
                    <th style={{ ...th, textAlign: "right" }}>SOLD/CAP</th>
                    <th style={{ ...th, textAlign: "right" }}>OCC%</th>
                    <th style={{ ...th, textAlign: "right" }}>REVENUE</th>
                  </tr>
                </thead>
                <tbody>
                  {data.showtimes.map(s => {
                    const pct = s.capacity > 0 ? Math.round((s.sold / s.capacity) * 100) : 0;
                    return (
                      <tr key={s.id}>
                        <td style={td}>{s.start_time}</td>
                        <td style={td}>{s.film_title || "—"}</td>
                        <td style={td}>{s.studio_name || "—"}{s.outlet ? ` · ${s.outlet}` : ""}</td>
                        <td style={{ ...td, textAlign: "right" }}>{s.sold}/{s.capacity}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{pct}%</td>
                        <td style={{ ...td, textAlign: "right" }}>{rp(s.revenue)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Section>

          {/* F&B Bundles */}
          <Section title="🍿 F&B BUNDLES SOLD">
            {data.bundles.length === 0 ? <Empty /> : (
              <Table rows={data.bundles.map(b => [
                `${b.sold}× ${b.bundle_name}`, rp(b.revenue),
              ])} />
            )}
          </Section>

          {/* Cashiers */}
          <Section title="👤 PER CASHIER">
            {data.cashiers.length === 0 ? <Empty /> : (
              <Table rows={data.cashiers.map(c => [
                c.name, `${c.tickets} tiket · ${rp(c.revenue)}`,
              ])} />
            )}
          </Section>

          {/* Incidents */}
          {data.incidents.length > 0 && (
            <Section title={`🚨 INCIDENTS (${data.incidents.length})`}>
              {data.incidents.map(i => (
                <div key={i.id} style={{ padding: "6px 8px", marginBottom: 4, border: "1px solid #ccc", borderRadius: 4, fontSize: 11 }}>
                  <b>[{(i.severity || "").toUpperCase()}] {i.type}</b> · {i.outlet || "—"} · {fmtTs(i.created_at)}
                  <br/>"{i.reason}" · {i.tickets_affected} tiket affected · by {i.reported_by}
                </div>
              ))}
            </Section>
          )}

          {/* Vouchers Issued */}
          {data.vouchers.issued.count > 0 && (
            <Section title={`🎟️ VOUCHER ISSUED HARI INI (${data.vouchers.issued.count})`}>
              <Table rows={[
                ["TOTAL VOUCHER", `${data.vouchers.issued.count}×`],
                ["TOTAL VALUE", rp(data.vouchers.issued.amount)],
                ["⚠ LIABILITY", "Future redemption — track di Voucher list"],
              ]} />
            </Section>
          )}

          {/* Sign-off */}
          <div style={{ marginTop: 30, paddingTop: 14, borderTop: "1px dashed #000", fontSize: 11, display: "flex", justifyContent: "space-between", gap: 20 }}>
            <div>
              <div style={{ borderBottom: "1px solid #000", width: 180, marginBottom: 4, marginTop: 30 }}></div>
              Manager Outlet
            </div>
            <div>
              <div style={{ borderBottom: "1px solid #000", width: 180, marginBottom: 4, marginTop: 30 }}></div>
              HQ Reviewer
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.5, marginBottom: 6, borderBottom: "1px solid #333", paddingBottom: 3 }}>{title}</div>
      {children}
    </div>
  );
}
function Table({ rows }) {
  return (
    <table style={tbl}>
      <tbody>
        {rows.map(([k, v, bold], i) => (
          <tr key={i} style={bold ? { background: "#f5f5f5", fontWeight: 900 } : {}}>
            <td style={td}>{k}</td>
            <td style={{ ...td, textAlign: "right" }}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function Empty() { return <div style={{ fontSize: 11, color: "#555", padding: 6, fontStyle: "italic" }}>(no data)</div>; }

const tbl = { width: "100%", borderCollapse: "collapse", fontSize: 11 };
const tblHdr = { background: "#f0f0f0", fontWeight: 800 };
const th = { border: "1px solid #333", padding: "5px 8px", textAlign: "left", fontWeight: 800 };
const td = { border: "1px solid #ccc", padding: "5px 8px" };

function buildHtmlReport(data) {
  return `
    <h1 style="font-family:monospace;">🎬 Cinema Z-Report · ${data.date} ${data.outlet || "ALL"}</h1>
    <p>Generated: ${fmtTs(data.generated_at)}</p>
    <h2>Summary</h2>
    <table border="1" cellpadding="6" style="border-collapse:collapse;font-family:monospace">
      <tr><td>Tiket Terjual</td><td>${data.summary.tickets_sold || 0}</td></tr>
      <tr><td>Gross Tiket</td><td>${rp(data.summary.gross_revenue)}</td></tr>
      <tr><td>Gross F&amp;B</td><td>${rp(data.summary.fb_revenue)}</td></tr>
      <tr><td>Refunded</td><td>${rp(data.summary.refunded_amount)}</td></tr>
      <tr><td>Voucher Used</td><td>${rp(data.vouchers.used.amount)}</td></tr>
      <tr><td>Promo Used</td><td>${rp(data.promos.amount)}</td></tr>
      <tr style="background:#ff9;font-weight:bold"><td>NET REVENUE</td><td>${rp(data.summary.net_revenue)}</td></tr>
      <tr><td>Avg Occupancy</td><td>${data.summary.avg_occupancy_pct}%</td></tr>
      <tr><td>Incidents</td><td>${data.incidents.length}</td></tr>
    </table>
  `;
}
