// server/csv-util.js — CSV builder dengan escaping + UTF-8 BOM
// (BOM biar Excel baca teks Indonesia dengan benar).

function csvField(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(headers, rows) {
  return '﻿' + [headers, ...rows].map(r => r.map(csvField).join(',')).join('\r\n');
}

module.exports = { csvField, toCsv };
