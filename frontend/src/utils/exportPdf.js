// Generates a clean, properly-paginated PDF. Browsers with an inline PDF viewer (Chrome,
// Edge, Firefox, Safari — desktop and mobile) open it in a new tab, where the user can view,
// print, or save it; browsers without one download it directly. Either way this produces a
// much better result than relying on @media print CSS to lay out an HTML page for paper.
//
// jsPDF + jspdf-autotable are dynamically imported so their ~250KB doesn't bloat the main
// bundle; it's only fetched when a PDF is actually requested.
export async function exportPdf({ title, subtitle, columns, rows, landscape }) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt' });
  const marginLeft = 40;
  let y = 44;

  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('Rohini Ispat', marginLeft, y);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(120);
  doc.text('रोहिणी इस्पात', marginLeft + 105, y);
  doc.setTextColor(0);

  y += 26;
  doc.setFontSize(13);
  doc.setFont(undefined, 'bold');
  doc.text(title, marginLeft, y);

  if (subtitle) {
    y += 17;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(90);
    doc.text(subtitle, marginLeft, y);
    doc.setTextColor(0);
  }

  y += 14;
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(`Generated ${new Date().toLocaleString('en-IN')}`, marginLeft, y);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: y + 12,
    head: [columns.map(c => c.label)],
    body: rows.map(r => columns.map(c => {
      const v = c.value ? c.value(r) : r[c.key];
      return v == null || v === '' ? '—' : String(v);
    })),
    styles: { fontSize: 10, cellPadding: 6, valign: 'middle' },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: marginLeft, right: marginLeft },
  });

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
