// AdminCustomerImport — Bulk import customer dari CSV
// Flow: upload CSV → preview + auto-mapping → dry-run → confirm commit

import { useState, useRef } from "react";

const COLUMN_HINTS = {
  phone:           ["phone", "hp", "telpon", "telepon", "nomor", "no_hp", "mobile", "whatsapp"],
  name:            ["name", "nama", "fullname", "full_name", "customer_name"],
  points:          ["points", "point", "poin", "saldo_poin", "loyalty_points"],
  tier:            ["tier", "level", "kelas", "membership"],
  lifetime_spend:  ["spend", "total_spend", "lifetime_spend", "total_belanja", "spending"],
  visits:          ["visits", "visit", "transaksi", "kunjungan", "trips"],
  signup_date:     ["signup", "signup_date", "join_date", "register_date", "tgl_daftar", "created_at"],
  external_id:     ["external_id", "old_id", "member_id", "id_member"],
  tags:            ["tags", "label", "kategori"],
};

const FIELDS = [
  { k: "phone",          label: "📱 Phone *",       required: true },
  { k: "name",           label: "👤 Name" },
  { k: "points",         label: "⭐ Points" },
  { k: "tier",           label: "🏆 Tier (bronze/silver/gold)" },
  { k: "lifetime_spend", label: "💰 Lifetime Spend (Rp)" },
  { k: "visits",         label: "🛒 Visit Count" },
  { k: "signup_date",    label: "📅 Signup Date (YYYY-MM-DD)" },
  { k: "external_id",    label: "🆔 External ID" },
  { k: "tags",           label: "🏷 Tags (comma-separated)" },
];

export default function AdminCustomerImport({ onBack }) {
  const [step, setStep] = useState("upload"); // upload | mapping | dryrun | commit | done
  const [csvText, setCsvText] = useState("");
  const [headers, setHeaders] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [mapping, setMapping] = useState({}); // field_key -> column_index | null
  const [dedup, setDedup] = useState("skip");
  const [dryRunResult, setDryRunResult] = useState(null);
  const [commitResult, setCommitResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  function parseCSV(text) {
    // Simple CSV parser — handle quoted fields + comma
    const rows = [];
    let cur = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i], next = text[i + 1];
      if (inQuotes) {
        if (ch === '"' && next === '"') { field += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else field += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ",") { cur.push(field); field = ""; }
        else if (ch === "\n") { cur.push(field); field = ""; rows.push(cur); cur = []; }
        else if (ch === "\r") {/* skip */}
        else field += ch;
      }
    }
    if (field || cur.length) { cur.push(field); rows.push(cur); }
    return rows.filter(r => r.some(c => c?.trim()));
  }

  function autoMap(headers) {
    const m = {};
    headers.forEach((h, idx) => {
      const norm = h.toLowerCase().replace(/[^a-z0-9_]/g, "_");
      for (const [field, hints] of Object.entries(COLUMN_HINTS)) {
        if (m[field] != null) continue;
        if (hints.some(hint => norm.includes(hint))) { m[field] = idx; break; }
      }
    });
    return m;
  }

  const handleFile = (file) => {
    if (!file) return;
    setError(""); setLoading(true);
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target.result;
        setCsvText(text);
        const rows = parseCSV(text);
        if (rows.length < 2) throw new Error("CSV harus minimal 2 baris (header + data)");
        const hdrs = rows[0].map(h => h.trim());
        const data = rows.slice(1);
        setHeaders(hdrs);
        setAllRows(data);
        setPreviewRows(data.slice(0, 10));
        setMapping(autoMap(hdrs));
        setStep("mapping");
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    };
    reader.onerror = () => { setError("Failed to read file"); setLoading(false); };
    reader.readAsText(file);
  };

  function rowsToObjects() {
    return allRows.map(row => {
      const obj = {};
      Object.entries(mapping).forEach(([field, colIdx]) => {
        if (colIdx != null && row[colIdx] != null) obj[field] = row[colIdx];
      });
      return obj;
    });
  }

  const runDryRun = async () => {
    if (mapping.phone == null) { setError("Kolom Phone wajib di-mapping"); return; }
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/customers/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rowsToObjects(), mode: "dry_run", dedup_strategy: dedup }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setDryRunResult(d);
      setStep("dryrun");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const runCommit = async () => {
    if (!confirm(`COMMIT import ${allRows.length} rows? Action ini tidak bisa di-undo dari UI (tapi audit log tersimpan).`)) return;
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/customers/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rowsToObjects(), mode: "commit", dedup_strategy: dedup }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setCommitResult(d);
      setStep("done");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const reset = () => {
    setStep("upload");
    setCsvText(""); setHeaders([]); setAllRows([]); setPreviewRows([]);
    setMapping({}); setDryRunResult(null); setCommitResult(null);
    setError("");
  };

  return (
    <div style={{ padding: "20px 24px", color: "#e5e7eb", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
        {onBack && <button onClick={onBack} style={btn("ghost")}>← Kembali</button>}
        <h1 style={{ display: "inline-block", marginLeft: 16, fontSize: 22, fontWeight: 800, color: "#fff" }}>
          📥 Customer Import (Bulk CSV)
        </h1>
      </div>

      <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
        Import member existing dari system lama ke KaryaOS. Upload CSV → preview → mapping → dry-run preview → commit.
        <strong style={{ color: "#fb923c" }}> Maksimal 10,000 baris per import.</strong>
      </p>

      {/* STEPPER */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { k: "upload",  l: "1. Upload CSV" },
          { k: "mapping", l: "2. Column Mapping" },
          { k: "dryrun",  l: "3. Preview Dry-Run" },
          { k: "done",    l: "4. Done" },
        ].map((s, i) => {
          const active = step === s.k;
          const passed = ["upload", "mapping", "dryrun", "done"].indexOf(step) > i;
          return (
            <div key={s.k} style={{
              padding: "6px 14px", borderRadius: 999, fontSize: 11.5, fontWeight: 700,
              background: active ? "#fb923c" : passed ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.04)",
              color: active ? "#fff" : passed ? "#10b981" : "#9ca3af",
              border: `1px solid ${active ? "#fb923c" : passed ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.1)"}`,
            }}>{passed ? "✓ " : ""}{s.l}</div>
          );
        })}
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#fca5a5" }}>
          ⚠️ {error}
        </div>
      )}

      {/* STEP: UPLOAD */}
      {step === "upload" && (
        <div style={{ background: "#0f172a", border: "2px dashed rgba(255,255,255,0.1)", borderRadius: 14, padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>📄</div>
          <h3 style={{ margin: 0, marginBottom: 8, color: "#fff", fontSize: 16, fontWeight: 700 }}>Upload File CSV</h3>
          <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 16, lineHeight: 1.6 }}>
            Format: header di baris 1, data dari baris 2.<br/>
            Kolom yg di-detect otomatis: phone, name, points, tier, lifetime_spend, visits, signup_date, tags
          </p>
          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={e => handleFile(e.target.files?.[0])} style={{ display: "none" }} />
          <button onClick={() => fileRef.current?.click()} disabled={loading} style={btn("primary", loading)}>
            {loading ? "Reading…" : "📤 Pilih File CSV"}
          </button>

          <div style={{ marginTop: 24, padding: 14, background: "rgba(0,0,0,0.3)", borderRadius: 8, textAlign: "left" }}>
            <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "'JetBrains Mono',monospace", marginBottom: 6 }}>
              CONTOH FORMAT CSV:
            </div>
            <pre style={{ margin: 0, fontSize: 11, color: "#a3e635", fontFamily: "'JetBrains Mono',monospace", overflowX: "auto" }}>
{`phone,name,points,tier,lifetime_spend,signup_date
081234567890,Bintoro Siallagan,1250,gold,15000000,2023-05-10
081298765432,Sample Member,300,silver,2500000,2024-01-15`}
            </pre>
          </div>
        </div>
      )}

      {/* STEP: MAPPING */}
      {step === "mapping" && (
        <div>
          <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 12.5, color: "#e5e7eb" }}>
            ✓ File berhasil di-parse. <strong>{allRows.length} rows</strong> terdeteksi · <strong>{headers.length} kolom</strong>.
            Mapping otomatis di-isi — review + adjust kalau perlu.
          </div>

          <h3 style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: "0 0 12px" }}>Column Mapping</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
            {FIELDS.map(f => (
              <label key={f.k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, color: f.required ? "#fb923c" : "#9ca3af", fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 0.5 }}>{f.label}</span>
                <select value={mapping[f.k] ?? ""} onChange={e => setMapping(m => ({ ...m, [f.k]: e.target.value === "" ? null : parseInt(e.target.value, 10) }))}
                  style={{ ...inputStyle, borderColor: f.required && mapping[f.k] == null ? "#fb923c" : "rgba(255,255,255,0.08)" }}>
                  <option value="">— Tidak di-import —</option>
                  {headers.map((h, idx) => <option key={idx} value={idx}>{h} (kolom {idx + 1})</option>)}
                </select>
              </label>
            ))}
          </div>

          <h3 style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: "0 0 8px" }}>Strategy: Duplicate Phone</h3>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {[
              { k: "skip",      l: "Skip duplicate", d: "Phone yg sudah ada di DB → di-skip" },
              { k: "merge",     l: "Merge (max value)", d: "Update kalau import points/spend lebih besar dari existing" },
              { k: "overwrite", l: "Overwrite (replace)", d: "Replace semua field dari import" },
            ].map(o => (
              <button key={o.k} onClick={() => setDedup(o.k)} style={{
                flex: 1, padding: 14, background: dedup === o.k ? "rgba(251,146,60,0.1)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${dedup === o.k ? "#fb923c" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 10, color: "#e5e7eb", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: dedup === o.k ? "#fb923c" : "#fff", marginBottom: 4 }}>{o.l}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>{o.d}</div>
              </button>
            ))}
          </div>

          <h3 style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: "0 0 8px" }}>Preview (10 row pertama)</h3>
          <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, overflow: "auto", marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                  {headers.map((h, i) => <th key={i} style={{ padding: "8px 10px", textAlign: "left", color: "#9ca3af", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    {row.map((c, j) => <td key={j} style={{ padding: "8px 10px", color: "#fff", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
            <button onClick={reset} style={btn("ghost")}>← Ulang Upload</button>
            <button onClick={runDryRun} disabled={loading || mapping.phone == null} style={btn("primary", loading)}>
              {loading ? "Validating…" : "▶ Run Dry-Run Preview"}
            </button>
          </div>
        </div>
      )}

      {/* STEP: DRY-RUN RESULT */}
      {step === "dryrun" && dryRunResult && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: "0 0 12px" }}>Dry-Run Result</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 12, marginBottom: 18 }}>
            <StatCard label="Total Rows" value={dryRunResult.summary.total} color="#3b82f6" />
            <StatCard label="New Customers" value={dryRunResult.summary.new} color="#10b981" />
            <StatCard label="Updates" value={dryRunResult.summary.update} color="#fbbf24" />
            <StatCard label="Skipped" value={dryRunResult.summary.skip} color="#9ca3af" />
            <StatCard label="Errors" value={dryRunResult.summary.error.length} color={dryRunResult.summary.error.length > 0 ? "#ef4444" : "#9ca3af"} />
          </div>

          {dryRunResult.summary.error.length > 0 && (
            <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fca5a5", marginBottom: 8 }}>⚠️ {dryRunResult.summary.error.length} Error(s):</div>
              <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 12 }}>
                {dryRunResult.summary.error.slice(0, 50).map((e, i) => (
                  <div key={i} style={{ padding: "4px 0", color: "rgba(252,165,165,0.85)", fontFamily: "'JetBrains Mono',monospace" }}>
                    Row {e.row} (phone: {e.phone || "—"}): {e.error}
                  </div>
                ))}
                {dryRunResult.summary.error.length > 50 && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>... +{dryRunResult.summary.error.length - 50} more</div>}
              </div>
            </div>
          )}

          <div style={{ background: "rgba(251,146,60,0.06)", border: "1px solid rgba(251,146,60,0.3)", borderRadius: 10, padding: 14, marginBottom: 18, fontSize: 13, color: "#e5e7eb", lineHeight: 1.6 }}>
            💡 Ini cuma <strong>dry-run preview</strong> — belum ada perubahan di DB. Klik <strong style={{ color: "#fb923c" }}>Confirm Commit</strong> untuk eksekusi import beneran.
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
            <button onClick={() => setStep("mapping")} style={btn("ghost")}>← Adjust Mapping</button>
            <button onClick={runCommit} disabled={loading} style={btn("primary", loading)}>
              {loading ? "Importing…" : `✓ Confirm Commit — Import ${dryRunResult.summary.new + dryRunResult.summary.update} customers`}
            </button>
          </div>
        </div>
      )}

      {/* STEP: DONE */}
      {step === "done" && commitResult && (
        <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.4)", borderRadius: 14, padding: 30, textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 14 }}>✅</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#10b981", margin: 0, marginBottom: 10 }}>Import Selesai!</h2>
          <p style={{ fontSize: 14, color: "#e5e7eb", marginBottom: 24 }}>
            <strong>{commitResult.summary.new}</strong> customer baru ditambahkan ·{" "}
            <strong>{commitResult.summary.update}</strong> di-update ·{" "}
            <strong>{commitResult.summary.skip}</strong> skipped
            {commitResult.summary.error.length > 0 && <> · <strong style={{ color: "#fca5a5" }}>{commitResult.summary.error.length}</strong> error</>}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={reset} style={btn("ghost")}>Import Lagi</button>
            <button onClick={onBack} style={btn("primary")}>Selesai</button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 14, borderTop: `2px solid ${color}` }}>
      <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{value}</div>
    </div>
  );
}

const inputStyle = {
  padding: "8px 12px", background: "#1e293b", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none",
};

function btn(variant, disabled) {
  const base = {
    padding: "10px 18px", borderRadius: 8, border: "none",
    fontSize: 13, fontWeight: 700, fontFamily: "inherit",
    cursor: disabled ? "wait" : "pointer", opacity: disabled ? 0.6 : 1,
    transition: "all 0.15s",
  };
  if (variant === "primary") return { ...base, background: "#fb923c", color: "#fff" };
  if (variant === "ghost") return { ...base, background: "transparent", color: "#e5e7eb", border: "1px solid rgba(255,255,255,0.12)" };
  return base;
}
