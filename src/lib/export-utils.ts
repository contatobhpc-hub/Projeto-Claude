import Papa from "papaparse";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type ExportRow = Record<string, string | number>;

export function exportCSV(filename: string, rows: ExportRow[]) {
  const csv = Papa.unparse(rows);
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `${filename}.csv`);
}

export function exportExcel(filename: string, sheets: Record<string, ExportRow[]>) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportPDF(
  filename: string,
  title: string,
  sections: { heading: string; rows: ExportRow[] }[],
) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(title, 14, 18);
  doc.setFontSize(10);
  doc.text(new Date().toLocaleString("pt-BR"), 14, 25);
  let cursor = 32;
  for (const section of sections) {
    if (!section.rows.length) continue;
    doc.setFontSize(12);
    doc.text(section.heading, 14, cursor);
    const head = [Object.keys(section.rows[0])];
    const body = section.rows.map((r) => Object.values(r).map((v) => String(v)));
    autoTable(doc, {
      head,
      body,
      startY: cursor + 3,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [99, 102, 241] },
    });
    // @ts-expect-error lastAutoTable injected by plugin
    cursor = (doc.lastAutoTable?.finalY ?? cursor + 30) + 10;
    if (cursor > 260) {
      doc.addPage();
      cursor = 20;
    }
  }
  doc.save(`${filename}.pdf`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
