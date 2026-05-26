import React, { useState, useEffect } from "react";

export default function FlowQRGen() {
  const [host, setHost] = useState("");
  const [mode, setMode] = useState("tables"); // tables | single | bulk
  const [tableCount, setTableCount] = useState(10);
  const [tablePrefix, setTablePrefix] = useState("T");
  const [singleTable, setSingleTable] = useState("");
  const [bulkInput, setBulkInput] = useState("T01\nT02\nT03\nT04\nT05");
  const [showPrint, setShowPrint] = useState(false);

  useEffect(() => {
    // Default to LAN URL for production use (so phone can scan from QR)
    const proto = window.location.protocol;
    const lanHint = "192.168.1.8"; // common LAN, user can edit
    setHost(`${proto}//${window.location.hostname === "localhost" ? lanHint : window.location.hostname}:${window.location.port}${window.location.pathname}`);
  }, []);

  function buildUrl(table) {
    if (table) return `${host}?flow=1&table=${table}`;
    return `${host}?flow=1`;
  }

  function qrSrc(url, size = 400) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&data=${encodeURIComponent(url)}`;
  }

  function getTables() {
    if (mode === "single") return singleTable ? [singleTable] : [""];
    if (mode === "bulk") {
      return bulkInput.split("\n").map(l => l.trim()).filter(Boolean);
    }
    // tables mode: T01, T02, ...
    return Array.from({ length: tableCount }, (_, i) =>
      `${tablePrefix}${String(i + 1).padStart(2, "0")}`
    );
  }

  const tables = getTables();

  if (showPrint) {
    return (
      <div style={P.printContainer}>
        <style>{`
          @media print {
            body { background: white !important; }
            .no-print { display: none !important; }
            .print-card { page-break-inside: avoid; }
          }
          @page { margin: 1cm; }
        `}</style>

        <div className="no-print" style={P.printControls}>
          <button onClick={() => setShowPrint(false)} style={P.backBtn}>← Edit</button>
          <button onClick={() => window.print()} style={P.printBtn}>🖨️ Print</button>
        </div>

        <div style={P.cardsGrid}>
          {tables.map(table => (
            <div key={table || "general"} className="print-card" style={P.card}>
              <div style={P.cardHeader}>
                <div style={P.cardLogo}>KaryaOS</div>
                <div style={P.cardTagline}>Scan untuk order</div>
              </div>

              <img
                src={qrSrc(buildUrl(table), 400)}
                alt={`QR ${table}`}
                style={P.cardQR}
              />

              {table ? (
                <div style={P.cardTable}>
                  <div style={P.cardTableLabel}>MEJA</div>
                  <div style={P.cardTableId}>{table}</div>
                </div>
              ) : (
                <div style={P.cardTable}>
                  <div style={P.cardTableLabel}>BAWA PULANG</div>
                  <div style={P.cardTableId}>—</div>
                </div>
              )}

              <div style={P.cardFooter}>
                <div style={P.cardStep}>1. Scan QR ini</div>
                <div style={P.cardStep}>2. Pilih menu di HP</div>
                <div style={P.cardStep}>3. Bayar QRIS / GoPay</div>
                <div style={P.cardStep}>4. Tunggu pesanan datang</div>
              </div>

              <div style={P.cardUrl}>{buildUrl(table)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={S.container}>
      <header style={S.header}>
        <div>
          <div style={S.title}>QR Generator</div>
          <div style={S.subtitle}>Generate table QR untuk KaryaOS</div>
        </div>
      </header>

      <div style={S.section}>
        <div style={S.fieldLabel}>Host URL</div>
        <input
          type="text"
          value={host}
          onChange={e => setHost(e.target.value)}
          style={S.input}
          placeholder="https://kiosk.karys.tech/"
        />
        <div style={S.hint}>
          💡 Pakai LAN IP atau domain production. Customer scan QR pakai HP — gak bisa pakai "localhost".
        </div>
      </div>

      <div style={S.section}>
        <div style={S.fieldLabel}>Mode</div>
        <div style={S.modeRow}>
          <button
            onClick={() => setMode("tables")}
            style={{...S.modeBtn, ...(mode === "tables" ? S.modeBtnActive : {})}}
          >
            🍽️ Auto Tables
          </button>
          <button
            onClick={() => setMode("bulk")}
            style={{...S.modeBtn, ...(mode === "bulk" ? S.modeBtnActive : {})}}
          >
            📋 Custom List
          </button>
          <button
            onClick={() => setMode("single")}
            style={{...S.modeBtn, ...(mode === "single" ? S.modeBtnActive : {})}}
          >
            🎯 Single
          </button>
        </div>
      </div>

      {mode === "tables" && (
        <div style={S.section}>
          <div style={S.fieldRow}>
            <div style={{flex: 1}}>
              <div style={S.fieldLabel}>Prefix</div>
              <input
                type="text"
                value={tablePrefix}
                onChange={e => setTablePrefix(e.target.value)}
                style={S.input}
                placeholder="T"
              />
            </div>
            <div style={{flex: 1}}>
              <div style={S.fieldLabel}>Quantity Meja</div>
              <input
                type="number"
                min="1" max="100"
                value={tableCount}
                onChange={e => setTableCount(parseInt(e.target.value) || 1)}
                style={S.input}
              />
            </div>
          </div>
          <div style={S.hint}>
            Generate: {tablePrefix}01, {tablePrefix}02, ... {tablePrefix}{String(tableCount).padStart(2,"0")}
          </div>
        </div>
      )}

      {mode === "bulk" && (
        <div style={S.section}>
          <div style={S.fieldLabel}>List Table (1 per baris)</div>
          <textarea
            value={bulkInput}
            onChange={e => setBulkInput(e.target.value)}
            style={{...S.input, minHeight: 140, resize: "vertical", fontFamily: "monospace"}}
            placeholder="T01&#10;T02&#10;VIP01"
          />
        </div>
      )}

      {mode === "single" && (
        <div style={S.section}>
          <div style={S.fieldLabel}>Table ID (kosong = general/takeaway)</div>
          <input
            type="text"
            value={singleTable}
            onChange={e => setSingleTable(e.target.value)}
            style={S.input}
            placeholder="T05 atau kosong"
          />
        </div>
      )}

      <div style={S.previewSection}>
        <div style={S.fieldLabel}>Preview ({tables.length} QR)</div>
        <div style={S.previewGrid}>
          {tables.slice(0, 6).map(table => (
            <div key={table || "g"} style={S.previewCard}>
              <img src={qrSrc(buildUrl(table), 200)} alt={table} style={S.previewQR} />
              <div style={S.previewLabel}>{table || "General"}</div>
            </div>
          ))}
          {tables.length > 6 && (
            <div style={S.previewMore}>+{tables.length - 6} more</div>
          )}
        </div>
      </div>

      <button onClick={() => setShowPrint(true)} style={S.printBtn}>
        🖨️ Buka Print View ({tables.length} cards)
      </button>

      <div style={S.urlPreview}>
        <div style={S.urlLabel}>Sample URL:</div>
        <code style={S.urlCode}>{buildUrl(tables[0] || "")}</code>
      </div>
    </div>
  );
}

const S = {
  container: { width: "min(560px, 100%)", minHeight: "100vh", padding: "32px 20px", display: "flex", flexDirection: "column", gap: 18, color: "white", fontFamily: "'Inter', sans-serif", background: "#0a0a0a" },
  header: { borderBottom: "1px solid #2a2a2a", paddingBottom: 14 },
  title: { fontFamily: "'Inter', sans-serif", fontSize: 36, color: "#FF6B35", letterSpacing: 2 },
  subtitle: { fontSize: 12, color: "#9CA3AF", marginTop: 4 },
  section: { display: "flex", flexDirection: "column", gap: 8 },
  fieldLabel: { fontSize: 11, color: "#FF6B35", letterSpacing: 1.5, fontWeight: 700 },
  fieldRow: { display: "flex", gap: 10 },
  input: { padding: "12px 14px", background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 10, color: "white", fontSize: 14, fontFamily: "inherit", outline: "none", width: "100%" },
  hint: { fontSize: 11, color: "#6B7280", lineHeight: 1.5 },
  modeRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 },
  modeBtn: { padding: "10px", borderRadius: 10, background: "#0d0d0d", border: "1px solid #2a2a2a", color: "#9CA3AF", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  modeBtnActive: { background: "rgba(245,158,11,0.10)", borderColor: "rgba(245,158,11,0.5)", color: "#FF6B35" },
  previewSection: { display: "flex", flexDirection: "column", gap: 10 },
  previewGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 },
  previewCard: { padding: 12, borderRadius: 10, background: "#0d0d0d", border: "1px solid #2a2a2a", textAlign: "center" },
  previewQR: { width: "100%", maxWidth: 140, background: "white", padding: 6, borderRadius: 6 },
  previewLabel: { fontSize: 12, fontWeight: 700, marginTop: 6, color: "#FF6B35" },
  previewMore: { display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280", fontSize: 12 },
  printBtn: { padding: "14px", borderRadius: 12, background: "linear-gradient(135deg, #FF6B35, #D97706)", border: "none", color: "#111", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
  urlPreview: { padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid #2a2a2a" },
  urlLabel: { fontSize: 10, color: "#9CA3AF", marginBottom: 4 },
  urlCode: { fontSize: 11, color: "#10B981", fontFamily: "monospace", wordBreak: "break-all" },
};

const P = {
  printContainer: { background: "#f5f5f5", minHeight: "100vh", padding: 20, fontFamily: "'Inter', sans-serif" },
  printControls: { display: "flex", gap: 10, marginBottom: 20, justifyContent: "center" },
  backBtn: { padding: "10px 18px", borderRadius: 8, background: "#fff", border: "1px solid #ccc", color: "#333", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  printBtn: { padding: "10px 18px", borderRadius: 8, background: "#FF6B35", border: "none", color: "#111", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
  cardsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, maxWidth: 1200, margin: "0 auto" },
  card: { background: "white", borderRadius: 12, padding: 20, textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", gap: 10, color: "#111" },
  cardHeader: { borderBottom: "2px dashed #FF6B35", paddingBottom: 8 },
  cardLogo: { fontFamily: "'Inter', sans-serif", fontSize: 28, color: "#FF6B35", letterSpacing: 2 },
  cardTagline: { fontSize: 10, color: "#666", letterSpacing: 1, marginTop: 2 },
  cardQR: { width: "100%", maxWidth: 200, margin: "10px auto", display: "block" },
  cardTable: { padding: "8px 12px", background: "#FF6B35", color: "#111", borderRadius: 8 },
  cardTableLabel: { fontSize: 9, letterSpacing: 1.5, fontWeight: 700 },
  cardTableId: { fontFamily: "'Inter', sans-serif", fontSize: 28, letterSpacing: 1, lineHeight: 1.1 },
  cardFooter: { textAlign: "left", paddingTop: 6, borderTop: "1px solid #eee" },
  cardStep: { fontSize: 10, color: "#666", padding: "2px 0" },
  cardUrl: { fontSize: 7, color: "#999", fontFamily: "monospace", wordBreak: "break-all", marginTop: 4 },
};
