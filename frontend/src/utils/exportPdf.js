// Generates a clean, properly-paginated A4 PDF. Browsers with an inline PDF viewer (Chrome,
// Edge, Firefox, Safari — desktop and mobile) open it in a new tab, where the user can view,
// print, or save it; browsers without one download it directly. Either way this produces a
// much better result than relying on @media print CSS to lay out an HTML page for paper.
//
// jsPDF + jspdf-autotable are dynamically imported so their ~250KB doesn't bloat the main
// bundle; it's only fetched when a PDF is actually requested.

const BUSINESS_NAME = 'Rohini Ispat';

// jsPDF's built-in fonts (Helvetica etc.) only support Latin/WinAnsi glyphs — anything
// outside that (Devanagari, e.g. "माल") renders as garbled symbols instead of failing
// cleanly. Normalize common "smart" punctuation to plain ASCII, then strip anything else
// unsupported so no text can ever come out corrupted, regardless of what's typed into a
// title or a notes field.
function pdfSafe(v) {
  if (v == null) return '';
  return String(v)
    .replace(/[‒-―]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/•/g, '-')
    .replace(/×/g, 'x')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

export async function exportPdf({ title, subtitle, columns, rows, landscape }) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 40;
  const marginRight = 40;

  const safeTitle = pdfSafe(title) || 'Report';
  const safeSubtitle = pdfSafe(subtitle);
  const generatedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  // Full header, drawn once on page 1: business name, what this document is, when it was made.
  let y = 44;
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text(BUSINESS_NAME, marginLeft, y);

  y += 24;
  doc.setFontSize(13);
  doc.setFont(undefined, 'bold');
  doc.text(safeTitle, marginLeft, y);

  if (safeSubtitle) {
    y += 17;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(90);
    doc.text(safeSubtitle, marginLeft, y);
    doc.setTextColor(0);
  }

  y += 15;
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(`Generated: ${generatedAt}`, marginLeft, y);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: y + 14,
    head: [columns.map(c => pdfSafe(c.label))],
    body: rows.map(r => columns.map(c => {
      const v = c.value ? c.value(r) : r[c.key];
      if (v == null || v === '') return '-';
      return pdfSafe(v) || '-';
    })),
    styles: { fontSize: 10, cellPadding: 6, valign: 'middle' },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: marginLeft, right: marginRight, top: 60 },
    // Compact repeating header on page 2+ so a document is still identifiable if pages get
    // separated — page 1 already has the full header drawn above, so skip it there.
    didDrawPage: (data) => {
      if (data.pageNumber === 1) return;
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(30);
      doc.text(BUSINESS_NAME, marginLeft, 30);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(90);
      doc.text(safeTitle, marginLeft, 42);
      doc.setTextColor(0);
    },
  });

  // Footer on every page — date + "Page X of Y" needs the final page count, which is only
  // known once the whole table has been laid out, so this runs as a second pass.
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Generated: ${generatedAt}`, marginLeft, pageHeight - 20);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - marginRight, pageHeight - 20, { align: 'right' });
    doc.setTextColor(0);
  }

  // A pre-opened window + deferred `location.href` assignment (the usual popup-blocker
  // workaround) turns out to be unreliable here — Chrome can swap the blank tab to a new
  // process before the async PDF build finishes, silently dropping the navigation. A
  // synthetic click on a real <a target="_blank"> element opens the tab fresh instead, and
  // is not treated as a blocked popup since it's still inside the click handler's call chain.
  const blobUrl = String(doc.output('bloburl'));
  const a = document.createElement('a');
  a.href = blobUrl;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
