"use client";

import type { CallInEvent, CallInRow } from "@/lib/call-in";
import { RSVP, type RsvpStatus } from "@/lib/status";
import { formatPhone } from "@/lib/phone";
import { fmt } from "@/lib/time";

/** One exported line: Name, Division, Phone, then a status per selected event. */
function lines(rows: CallInRow[], events: CallInEvent[]) {
  return rows.map((r) => ({
    name: `${r.first_name} ${r.last_name}`,
    division: r.division != null ? `Div ${r.division}` : "",
    phone: formatPhone(r.phone),
    statuses: events.map((e) => (r.cells[e.id] ? r.cells[e.id].status : null)),
  }));
}

// No record for an event means No Data, same as in the app.
const statusLabel = (s: RsvpStatus | null) => RSVP[s ?? "no_data"].label;
const fileStem = () => `call-in-${new Date().toISOString().slice(0, 10)}`;
const eventHeader = (e: CallInEvent) => `${e.name} (${fmt(e.start_at, e.time_zone, "MMM d")})`;

export async function exportExcel(rows: CallInRow[], events: CallInEvent[]) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const header = ["Name", "Division", "Phone", ...events.map(eventHeader)].map((value) => ({
    value,
    fontWeight: "bold" as const,
    backgroundColor: "#F5F5F4",
  }));
  const data = lines(rows, events).map((l) => [l.name, l.division, l.phone, ...l.statuses.map(statusLabel)]);
  await writeXlsxFile([header, ...data], {
    sheet: "Call In",
    stickyRowsCount: 1,
    columns: [{ width: 28 }, { width: 10 }, { width: 16 }, ...events.map(() => ({ width: 26 }))],
  }).toFile(`${fileStem()}.xlsx`);
}

// Status text colors in the PDF, matching the app's chips.
const PDF_COLOR: Record<RsvpStatus, [number, number, number]> = {
  no_data: [120, 113, 108],
  tentative: [180, 83, 9],
  confirmed: [4, 120, 87],
  reconfirmed: [3, 105, 161],
  declined: [190, 18, 60],
};

export async function exportPdf(rows: CallInRow[], events: CallInEvent[], filterSummary: string) {
  const [{ default: jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: events.length > 2 ? "landscape" : "portrait", unit: "pt", format: "letter" });
  const data = lines(rows, events);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Call In", 40, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  const meta = [
    `${data.length} ${data.length === 1 ? "person" : "people"} · exported ${new Date().toLocaleString()}`,
    filterSummary,
  ].filter(Boolean);
  meta.forEach((line, i) => doc.text(line, 40, 60 + i * 12));

  autoTable(doc, {
    startY: 60 + meta.length * 12 + 8,
    head: [["Name", "Division", "Phone", ...events.map(eventHeader)]],
    body: data.map((l) => [l.name, l.division, l.phone, ...l.statuses.map(statusLabel)]),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, lineColor: [231, 229, 228], lineWidth: 0.5 },
    headStyles: { fillColor: [245, 245, 244], textColor: [28, 25, 23], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 249] },
    margin: { left: 40, right: 40 },
    didParseCell: (hook) => {
      const col = hook.column.index - 3;
      if (hook.section !== "body" || col < 0) return;
      const status = data[hook.row.index]?.statuses[col];
      if (status) {
        hook.cell.styles.textColor = PDF_COLOR[status];
        if (status === "declined") hook.cell.styles.fontStyle = "bold";
      } else {
        hook.cell.styles.textColor = [168, 162, 158];
      }
    },
  });
  doc.save(`${fileStem()}.pdf`);
}
