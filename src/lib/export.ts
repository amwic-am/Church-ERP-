// Excel, PDF and QR — the three things the parish actually takes out of the
// system: a fee list for the treasurer, a printable report for the church
// board, and a QR code on the student ID card.

import * as XLSX from 'xlsx';
import QRCode from 'qrcode';
import { dateBoth, toCsv } from './format.ts';

export type ExportColumn = { header: string; key: string };

export type ExportSheet = {
  name: string;
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
};

/** Amharic headers survive because SheetJS writes UTF-8 XML inside the workbook. */
export function exportExcel(sheets: ExportSheet[], filename: string): void {
  const book = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const data = sheet.rows.map((row) => {
      const line: Record<string, unknown> = {};
      for (const col of sheet.columns) {
        const value = row[col.key];
        line[col.header] = value === null || value === undefined ? '' : value;
      }
      return line;
    });
    const ws = XLSX.utils.json_to_sheet(data, { header: sheet.columns.map((c) => c.header) });
    ws['!cols'] = sheet.columns.map((c) => ({
      wch: Math.min(60, Math.max(c.header.length + 2, ...data.map((d) => String(d[c.header] ?? '').length + 2))),
    }));
    XLSX.utils.book_append_sheet(book, ws, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(book, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export function exportCsv(columns: ExportColumn[], rows: Record<string, unknown>[], filename: string): void {
  const mapped = rows.map((r) => Object.fromEntries(columns.map((c) => [c.header, r[c.key] ?? ''])));
  downloadTextFile(`${filename}.csv`, toCsv(mapped, columns.map((c) => c.header)));
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Releasing the blob only after the click keeps Safari from dropping the file.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type PrintDocument = {
  title: string;
  subtitle?: string;
  meta?: { label: string; value: string }[];
  /** Either a table or pre-rendered HTML — reports use the table, receipts the HTML. */
  table?: { columns: string[]; rows: (string | number)[][] };
  html?: string;
  footerNote?: string;
};

const PRINT_STYLE = `
  * { box-sizing: border-box; }
  body { font-family: 'Noto Sans Ethiopic', 'Abyssinica SIL', 'Nyala', sans-serif; margin: 0; color: #14211c; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; border-bottom: 2px solid #1f6b4f; padding-bottom: .5rem; }
  h1 { font-family: 'Noto Serif Ethiopic', serif; font-size: 1.35rem; margin: 0 0 .25rem; }
  .sub { color: #4b5a54; font-size: .85rem; }
  .meta { display: flex; flex-wrap: wrap; gap: .35rem 1.5rem; font-size: .8rem; margin: .75rem 0 1rem; }
  .meta b { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: .85rem; }
  th, td { border: 1px solid #cfd8d4; padding: .4rem .5rem; text-align: right; }
  th:first-child, td:first-child { text-align: right; }
  thead th { background: #eef3f1; }
  tbody tr:nth-child(even) { background: #f7faf8; }
  .foot { margin-top: 1rem; font-size: .75rem; color: #5c6b66; }
  @page { margin: 14mm; }
  @media print { .no-print { display: none; } }
`;

/**
 * Opens the browser print dialog with a print-ready document; "Save as PDF"
 * produces the file. A server-side PDF renderer would be one more moving part,
 * and the church board prints these on paper anyway.
 */
export function printDocument(doc: PrintDocument): void {
  const win = window.open('', '_blank', 'width=1000,height=720');
  if (!win) {
    alert('የማተሚያ ገጹ በአዳራሽ ተከልክሏል። እባክዎ ለዚህ ገጽ ፒድ-ፖፕ አገልግሎቱን ይፍቁት።');
    return;
  }
  const meta = doc.meta?.map((m) => `<span><b>${escapeHtml(m.label)}:</b> ${escapeHtml(m.value)}</span>`).join('') ?? '';
  const table = doc.table
    ? `<table><thead><tr>${doc.table.columns
        .map((c) => `<th>${escapeHtml(c)}</th>`)
        .join('')}</tr></thead><tbody>${doc.table.rows
        .map((r) => `<tr>${r.map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`
    : '';
  win.document.write(
    `<!doctype html><html lang="am"><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title>` +
      `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
      `<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Ethiopic:wght@400;600&family=Noto+Serif+Ethiopic:wght@600&display=swap" rel="stylesheet">` +
      `<style>${PRINT_STYLE}</style></head><body>` +
      `<header><div><h1>${escapeHtml(doc.title)}</h1>${doc.subtitle ? `<div class="sub">${escapeHtml(doc.subtitle)}</div>` : ''}</div>` +
      `<div class="sub">${escapeHtml(dateBoth(new Date()))}</div></header>` +
      `<div class="meta">${meta}</div>${table}${doc.html ?? ''}` +
      `<div class="foot">${escapeHtml(doc.footerNote ?? 'ተክለቴዎፍሎስ ሰንበት ት/ቤት — በስርዓቱ የተዘጋጀ')}</div>` +
      `<script>window.onload = () => { setTimeout(() => { window.focus(); window.print(); }, 350); };<\/script>` +
      `</body></html>`
  );
  win.document.close();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** QR for ID cards and certificate verification links. */
export async function qrDataUrl(text: string, size = 240): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#14211cff', light: '#ffffffff' },
  });
}

