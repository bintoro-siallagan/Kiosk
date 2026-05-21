// src/Admin/ReportActions.jsx
// Toolbar mungil — tombol Export Excel & Print buat modul laporan.
// Props: { title, subtitle, columns:[...], rows:[[...]] }

import { exportCSV, printReport } from "../reportUtil.js";

const btn = (c) => ({
  background: c + "1f", border: `1px solid ${c}55`, color: c,
  fontSize: 12, fontWeight: 700, padding: "7px 13px", borderRadius: 7,
  cursor: "pointer", fontFamily: "'Space Mono',monospace",
});

export default function ReportActions({ title, subtitle = "", columns = [], rows = [] }) {
  const empty = !rows.length;
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 12 }}>
      <button onClick={() => !empty && exportCSV(title, columns, rows)}
        disabled={empty} style={{ ...btn("#10b981"), opacity: empty ? 0.4 : 1 }}>📥 Export Excel</button>
      <button onClick={() => !empty && printReport(title, subtitle, columns, rows)}
        disabled={empty} style={{ ...btn("#3b82f6"), opacity: empty ? 0.4 : 1 }}>🖨 Print</button>
    </div>
  );
}
