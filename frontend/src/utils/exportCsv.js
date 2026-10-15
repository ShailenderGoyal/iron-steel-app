// Zero-dependency CSV export. Files open directly in Excel / Google Sheets.
// A UTF-8 BOM is prepended so Excel renders Hindi (Devanagari) correctly.

import { isAndroid, shareOrDownload, downloadBlob } from './deliverFile';

function escapeCell(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * @param {string} filename  e.g. "coils.csv"
 * @param {Array<{label: string, value: (row) => any}>} columns
 * @param {Array<object>} rows
 */
export function exportToCsv(filename, columns, rows) {
  const header = columns.map(c => escapeCell(c.label)).join(',');
  const body = (rows || [])
    .map(row => columns.map(c => escapeCell(c.value(row))).join(','))
    .join('\r\n');
  const csv = '﻿' + header + '\r\n' + body;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  if (isAndroid) shareOrDownload(blob, filename, filename);
  else downloadBlob(blob, filename);
}

// Adds a date stamp to an export filename: coils -> coils_2026-07-01.csv
export function stampedName(base) {
  return `${base}_${new Date().toISOString().slice(0, 10)}.csv`;
}
