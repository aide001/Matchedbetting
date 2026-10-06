/* Minimal RFC 4180 CSV helpers, exposed as window.MBCsv (or module.exports in Node). */
(function (root) {
  'use strict';

  var FORMULA_START = /^[=+\-@\t\r]/;

  function escapeCell(value) {
    var s = value == null ? '' : String(value);
    // Stop spreadsheet apps treating text as a formula; plain numbers are left alone.
    if (FORMULA_START.test(s) && isNaN(Number(s))) s = "'" + s;
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCSV(rows, columns) {
    var lines = [columns.map(escapeCell).join(',')];
    rows.forEach(function (row) {
      lines.push(columns.map(function (c) { return escapeCell(row[c]); }).join(','));
    });
    return lines.join('\r\n');
  }

  function parseRows(text) {
    var rows = [];
    var row = [];
    var cell = '';
    var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else { inQuotes = false; }
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell); cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else {
        cell += ch;
      }
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c !== ''; }); });
  }

  function unescapeCell(s) {
    return s.length > 1 && s[0] === "'" && FORMULA_START.test(s.slice(1)) ? s.slice(1) : s;
  }

  /* Parses CSV text with a header row into an array of objects keyed by header. */
  function parseCSV(text) {
    var rows = parseRows(text.replace(/^﻿/, ''));
    if (!rows.length) return [];
    var header = rows[0].map(function (h) { return h.trim(); });
    return rows.slice(1).map(function (r) {
      var obj = {};
      header.forEach(function (h, i) { obj[h] = unescapeCell(r[i] != null ? r[i] : ''); });
      return obj;
    });
  }

  var MBCsv = { toCSV: toCSV, parseCSV: parseCSV };
  if (typeof module !== 'undefined' && module.exports) module.exports = MBCsv;
  else root.MBCsv = MBCsv;
})(typeof window !== 'undefined' ? window : this);
