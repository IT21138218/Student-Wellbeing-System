// Shared CSV export helpers — extracted from what used to be two
// near-identical copies (RiskClassification.jsx's downloadRiskHistoryCSV,
// CopingRecommendation.jsx's downloadCopingHistoryCSV). Client-side only,
// no backend export endpoint: builds a CSV string in the browser and
// triggers a download via a temporary <a download> + Blob URL.

export function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * rows: array of arrays (each inner array = one row's cell values, in
 * header order). header: array of column names. filename: e.g. 'foo.csv'.
 */
export function downloadCSV(header, rows, filename) {
  const lines = [header.map(csvEscape).join(',')];
  rows.forEach(row => lines.push(row.map(csvEscape).join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
