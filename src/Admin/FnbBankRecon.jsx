// karyaOS — Banking Auto-Recon (CSV import + auto-match settlement)
import { useState, useEffect, useCallback } from "react";
import { useUiKit, TooltipButton } from "../components/uiKit.jsx";
const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtTs = (s) => s ? new Date(s * 1000).toLocaleDateString("id-ID") : "—";

export default function FnbBankRecon({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/fnb";
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [filter, setFilter] = useState("unmatched");
  const [csvText, setCsvText] = useState("");
  const [bankName, setBankName] = useState("");
  const [toast, setToast] = useState(null);
  const showToast = (m, k = "ok") => { setToast({ m, k }); setTimeout(() => setToast(null), 2200); };
  const load = useCallback(async () => {
    const p = filter ? `?status=${filter}` : "";
    const d = await fetch(`${base}/bank-transactions${p}`).then(r => r.json());
    setRows(d.transactions || []); setSummary(d.summary || {});
  }, [base, filter]);
  useEffect(() => { load(); }, [load]);
  const parseCSV = () => {
    const lines = csvText.trim().split("\n").filter(Boolean);
    if (!lines.length) return [];
    const header = lines[0].toLowerCase().split(",").map(h => h.trim());
    const di = header.indexOf("date") >= 0 ? header.indexOf("date") : header.findIndex(h => h.includes("tanggal"));
    const ai = header.indexOf("amount") >= 0 ? header.indexOf("amount") : header.findIndex(h => h.includes("jumlah") || h.includes("nominal"));
    const desci = header.indexOf("description") >= 0 ? header.indexOf("description") : header.findIndex(h => h.includes("keterangan") || h.includes("uraian"));
    const refi = header.findIndex(h => h.includes("ref") || h.includes("no."));
    if (di < 0 || ai < 0) return null;
    return lines.slice(1).map(l => {
      const cols = l.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
      return { txn_date: cols[di], amount: parseInt(cols[ai].replace(/[^\d-]/g, ""), 10) || 0, description: cols[desci] || "", reference_no: cols[refi] || "" };
    }).filter(r => r.txn_date && r.amount);
  };
  const importCSV = async () => {
    const parsed = parseCSV();
    if (!parsed) { showToast("Format header CSV invalid (butuh: date, amount, description)", "err"); return; }
    if (!parsed.length) { showToast("None baris valid", "err"); return; }
    const r = await fetch(`${base}/bank-transactions/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: parsed, bank_name: bankName }) });
    const d = await r.json(); if (!d.ok) { showToast(d.error, "err"); return; }
    showToast(`${d.imported} transaksi di-import`); setCsvText(""); load();
  };
  const { prompt } = useUiKit();
  const match = async (t) => {
    const sid = await prompt({ title: "Match ke Settlement", label: `Transaksi ${rp(t.amount)} · ${t.txn_date}`, placeholder: "Settlement ID (numeric)", type: "number" });
    if (!sid) return;
    await fetch(`${base}/bank-transactions/${t.id}/match`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settlement_id: parseInt(sid, 10), confidence: 1.0 }) });
    showToast("Matched"); load();
  };
  const unmatch = async (t) => { await fetch(`${base}/bank-transactions/${t.id}/unmatch`, { method: "POST" }); load(); };
  const { confirm } = useUiKit();
  const [editing, setEditing] = useState(null);
  const saveEdit = async () => {
    const r = await fetch(`${base}/bank-transactions/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) });
    const d = await r.json(); if (!d.ok) { showToast(d.error || "Gagal", "err"); return; }
    showToast("Transaksi diupdate"); setEditing(null); load();
  };
  const removeTxn = async (t) => {
    const ok = await confirm({ title: "Hapus transaksi bank?", message: `${t.txn_date} · ${rp(t.amount)} · ${t.description || ""}\n\nTidak bisa dibatalkan.`, danger: true, okLabel: "Delete" });
    if (!ok) return;
    await fetch(`${base}/bank-transactions/${t.id}`, { method: "DELETE" });
    showToast("Transaksi dihapus"); load();
  };
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🏦 Banking Auto-Recon</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Import bank statement CSV → auto-match settlement berdasarkan amount + date.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Stat label="Total" value={summary.total || 0} color="#22d3ee" />
          <Stat label="Unmatched" value={summary.unmatched || 0} color="#ef4444" />
          <Stat label="Matched" value={summary.matched || 0} color="#10b981" />
          <Stat label="Total amount" value={rp(summary.total_amount)} color="#fbbf24" />
        </div>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>📤 IMPORT CSV BANK STATEMENT</div>
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr auto", gap: 8, marginBottom: 8 }}>
          <input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Nama bank (BCA / Mandiri)" style={inp} />
          <input placeholder="CSV: paste di textarea bawah →" disabled style={{ ...inp, opacity: 0.6 }} />
          <button onClick={importCSV} disabled={!csvText.trim()} style={{ ...B.save, opacity: csvText.trim() ? 1 : 0.5 }}>📤 Import</button>
        </div>
        <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={6} placeholder="date,amount,description,reference_no
2026-05-23,1250000,Settlement Midtrans,REF-001
2026-05-23,890000,Cash deposit,DEP-002" style={{ ...inp, resize: "vertical", fontFamily: "monospace", fontSize: 11.5 }} />
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[["", "Semua"], ["unmatched", "Belum match"], ["matched", "Sudah match"]].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{ background: filter === v ? "#a855f72a" : "transparent", border: `1px solid ${filter === v ? "#a855f766" : C.border}`, borderRadius: 8, padding: "7px 14px", color: filter === v ? "#fff" : C.sub, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
        ))}
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, color: C.dim, fontSize: 11, letterSpacing: 1, gap: 10 }}>
          <span style={{ width: 110 }}>DATE</span><span style={{ flex: 1.6 }}>DESKRIPSI</span><span style={{ width: 110 }}>REF</span><span style={{ width: 110 }}>BANK</span><span style={{ width: 130, textAlign: "right" }}>AMOUNT</span><span style={{ width: 130 }}>SETTLEMENT</span><span style={{ width: 180, textAlign: "right" }}>ACTIONS</span>
        </div>
        {rows.length === 0 ? <Empty>No transaksi.</Empty> : rows.map(t => {
          const matched = !!t.matched_settlement_id;
          return (
            <div key={t.id} style={{ display: "flex", padding: "9px 14px", borderBottom: `1px solid ${C.border}`, gap: 10, alignItems: "center" }}>
              <span style={{ width: 110, fontFamily: "'Geist Mono',monospace", fontSize: 12 }}>{t.txn_date}</span>
              <span style={{ flex: 1.6, fontSize: 12, color: C.sub }}>{t.description}</span>
              <span style={{ width: 110, fontFamily: "'Geist Mono',monospace", fontSize: 11, color: C.dim }}>{t.reference_no}</span>
              <span style={{ width: 110, fontSize: 11.5, color: C.sub }}>{t.bank_name || "—"}</span>
              <span style={{ width: 130, textAlign: "right", fontFamily: "'Geist Mono',monospace", color: t.amount >= 0 ? "#10b981" : "#ef4444", fontWeight: 700 }}>{rp(t.amount)}</span>
              <span style={{ width: 130, fontSize: 11.5, color: matched ? "#10b981" : "#ef4444", fontWeight: 700 }}>{matched ? `✓ #${t.matched_settlement_id}` : "✕ unmatched"}</span>
              <span style={{ width: 180, display: "flex", gap: 4, justifyContent: "flex-end" }}>
                {!matched ? <button onClick={() => match(t)} style={Ba("#10b981")}>Match</button> : <button onClick={() => unmatch(t)} style={Ba("#ef4444")}>Unmatch</button>}
                <button onClick={() => setEditing({ ...t })} style={Ba("#f59e0b")} title="Edit">✏️</button>
                <button onClick={() => removeTxn(t)} style={Ba("#ef4444")} title="Delete">🗑️</button>
              </span>
            </div>
          );
        })}
      </div>
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: toast.k === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.k === "err" ? "#ef4444" : "#22c55e"}`, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast.m}</div>}

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9998, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 520, width: "100%" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit Transaksi Bank</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><div style={{ fontSize: 10, color: C.dim, letterSpacing: 1, marginBottom: 4 }}>TANGGAL</div><input type="date" value={editing.txn_date || ""} onChange={e => setEditing({ ...editing, txn_date: e.target.value })} style={inp} /></div>
              <div><div style={{ fontSize: 10, color: C.dim, letterSpacing: 1, marginBottom: 4 }}>AMOUNT</div><input type="number" value={editing.amount || ""} onChange={e => setEditing({ ...editing, amount: e.target.value })} style={inp} /></div>
              <div><div style={{ fontSize: 10, color: C.dim, letterSpacing: 1, marginBottom: 4 }}>BANK</div><input value={editing.bank_name || ""} onChange={e => setEditing({ ...editing, bank_name: e.target.value })} style={inp} /></div>
              <div><div style={{ fontSize: 10, color: C.dim, letterSpacing: 1, marginBottom: 4 }}>NO. REKENING</div><input value={editing.account_number || ""} onChange={e => setEditing({ ...editing, account_number: e.target.value })} style={inp} /></div>
            </div>
            <div style={{ marginTop: 8 }}><div style={{ fontSize: 10, color: C.dim, letterSpacing: 1, marginBottom: 4 }}>DESKRIPSI</div><input value={editing.description || ""} onChange={e => setEditing({ ...editing, description: e.target.value })} style={inp} /></div>
            <div style={{ marginTop: 8 }}><div style={{ fontSize: 10, color: C.dim, letterSpacing: 1, marginBottom: 4 }}>REFERENCE NO</div><input value={editing.reference_no || ""} onChange={e => setEditing({ ...editing, reference_no: e.target.value })} style={inp} /></div>
            <div style={{ marginTop: 8 }}><div style={{ fontSize: 10, color: C.dim, letterSpacing: 1, marginBottom: 4 }}>CATATAN</div><input value={editing.notes || ""} onChange={e => setEditing({ ...editing, notes: e.target.value })} style={inp} /></div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Cancel</button>
              <button onClick={saveEdit} style={B.save}>💾 Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function Stat({ label, value, color }) { return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 12px", textAlign: "center", minWidth: 100 }}><div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 14, fontWeight: 700, color }}>{value}</div><div style={{ fontSize: 10, color: C.dim, letterSpacing: 0.5 }}>{label}</div></div>; }
function Empty({ children }) { return <div style={{ padding: "30px 18px", textAlign: "center", color: C.sub, fontSize: 13 }}>{children}</div>; }
const inp = { width: "100%", padding: "8px 11px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const B = { save: { background: "#10b981", border: "none", color: "#04130c", padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" } };
const Ba = (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
