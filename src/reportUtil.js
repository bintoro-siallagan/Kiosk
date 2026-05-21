// src/reportUtil.js
// Util shared — export laporan ke Excel (CSV, kebuka di Excel) & print.

// Export ke file CSV (Excel bisa buka langsung). BOM ﻿ biar Excel
// baca UTF-8 dengan benar.
export function exportCSV(filename, columns, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [columns.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (filename || 'laporan').replace(/[^\w.-]+/g, '_') + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Print — buka window bersih berisi tabel laporan, auto window.print().
export function printReport(title, subtitle, columns, rows) {
  const w = window.open('', '_blank', 'width=960,height=720');
  if (!w) { alert('Pop-up diblokir — izinkan pop-up untuk print.'); return; }
  const cell = (v) => (v == null ? '' : String(v));
  const thead = columns.map(c => `<th>${cell(c)}</th>`).join('');
  const tbody = rows.map(r => '<tr>' + r.map(c => `<td>${cell(c)}</td>`).join('') + '</tr>').join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${cell(title)}</title>
  <style>
    body{font-family:system-ui,-apple-system,Arial,sans-serif;padding:28px;color:#111}
    h1{font-size:17px;margin:0}
    .sub{color:#666;font-size:11px;margin:3px 0 16px}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th,td{border:1px solid #ccc;padding:6px 9px;text-align:left;vertical-align:top}
    th{background:#f2f2f2;font-weight:700}
    tr:nth-child(even) td{background:#fafafa}
    .ft{margin-top:18px;color:#999;font-size:10px}
  </style></head><body>
    <h1>${cell(title)}</h1>
    <div class="sub">${cell(subtitle)} &middot; dicetak ${new Date().toLocaleString('id-ID')}</div>
    <table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
    <div class="ft">BINTORO POS — karyaOS</div>
    <script>window.onload=function(){window.print();}<\/script>
  </body></html>`);
  w.document.close();
}
