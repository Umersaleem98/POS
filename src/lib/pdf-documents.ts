import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { ReportFilters } from "./report-filters";
const money = (n: unknown) =>
  `PKR ${Number(n || 0).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const safe = (value: unknown) =>
  String(value ?? "").replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
async function document(title: string, subtitle: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage;
  let y = 0;
  function text(
    value: unknown,
    x: number,
    posY: number,
    size = 10,
    strong = false,
    color = rgb(0.18, 0.24, 0.34),
  ) {
    page.drawText(safe(value), {
      x,
      y: posY,
      size,
      font: strong ? bold : font,
      color,
    });
  }
  function newPage() {
    page = pdf.addPage([595, 842]);
    page.drawRectangle({
      x: 0,
      y: 750,
      width: 595,
      height: 92,
      color: rgb(0.08, 0.14, 0.26),
    });
    text("POS", 40, 804, 22, true, rgb(1, 1, 1));
    text(title, 40, 777, 15, true, rgb(1, 1, 1));
    text(subtitle, 40, 730, 9);
    y = 705;
  }
  function truncate(
    value: unknown,
    width: number,
    useFont: PDFFont = font,
    size = 9,
  ) {
    let s = safe(value);
    if (useFont.widthOfTextAtSize(s, size) <= width) return s;
    while (s.length && useFont.widthOfTextAtSize(s + "...", size) > width)
      s = s.slice(0, -1);
    return s + "...";
  }
  function line(value: unknown, strong = false, size = 10) {
    if (y < 70) newPage();
    text(truncate(value, 510, strong ? bold : font, size), 40, y, size, strong);
    y -= size + 12;
  }
  function space(n = 10) {
    y -= n;
  }
  function table(headers: string[], widths: number[], records: unknown[][]) {
    const header = () => {
      if (y < 85) newPage();
      page.drawRectangle({
        x: 40,
        y: y - 11,
        width: 515,
        height: 27,
        color: rgb(0.93, 0.95, 0.98),
      });
      let x = 47;
      headers.forEach((h, i) => {
        text(truncate(h, widths[i] - 14, bold, 8), x, y, 8, true);
        x += widths[i];
      });
      y -= 29;
    };
    header();
    records.forEach((row, index) => {
      if (y < 75) {
        newPage();
        header();
      }
      if (index % 2 === 0)
        page.drawRectangle({
          x: 40,
          y: y - 10,
          width: 515,
          height: 25,
          color: rgb(0.98, 0.985, 0.995),
        });
      let x = 47;
      row.forEach((v, i) => {
        text(truncate(v, widths[i] - 14), x, y, 9);
        x += widths[i];
      });
      y -= 25;
    });
    y -= 15;
  }
  newPage();
  async function finish() {
    const pages = pdf.getPages();
    pages.forEach((p, i) => {
      p.drawLine({
        start: { x: 40, y: 49 },
        end: { x: 555, y: 49 },
        color: rgb(0.88, 0.9, 0.94),
        thickness: 0.5,
      });
      p.drawText(
        `POS | Generated ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Karachi" })} (Asia/Karachi) | Page ${i + 1} of ${pages.length}`,
        { x: 40, y: 32, size: 8, font, color: rgb(0.5, 0.55, 0.62) },
      );
    });
    return pdf.save();
  }
  return { line, table, space, finish };
}
export async function reportPDF(p: {
  store: string;
  filters: ReportFilters;
  summary: {
    revenue: number;
    profit: number;
    sales: number;
    voided: number;
    average: number;
    discounts: number;
  };
  sales: Record<string, unknown>[];
}) {
  const d = await document(
    "Sales performance report",
    `${p.store} | ${p.filters.from} to ${p.filters.to}`,
  );
  d.line(
    `Net sales: ${money(p.summary.revenue)}    Completed: ${p.summary.sales}    Voided: ${p.summary.voided}`,
    true,
    11,
  );
  d.line(
    `Estimated gross profit: ${money(p.summary.profit)}    Average order: ${money(p.summary.average)}`,
  );
  d.line(`Discounts: ${money(p.summary.discounts)}`);
  d.line(
    `Filters: ${p.filters.status} | ${p.filters.payment} | Search: ${p.filters.q || "Any"} | Amount: ${p.filters.min} - ${p.filters.max}`,
    false,
    8,
  );
  d.line(
    "Profit = completed sale totals minus recorded item cost. Operating expenses are excluded.",
    false,
    8,
  );
  d.space();
  d.table(
    ["Receipt / invoice", "Date", "Customer", "Payment", "Status", "Total"],
    [90, 70, 110, 55, 85, 105],
    p.sales.map((s) => [
      `#${s.id}`,
      new Date(String(s.createdAt)).toLocaleDateString("en-GB", {
        timeZone: "Asia/Karachi",
      }),
      s.customer,
      s.payment,
      s.status,
      money(s.total),
    ]),
  );
  return d.finish();
}
export async function invoicePDF(
  invoice: Record<string, unknown>,
  items: Record<string, unknown>[],
  payments: Record<string, unknown>[],
) {
  const d = await document(
    "INVOICE",
    `${invoice.invoiceNumber} | ${invoice.senderName}`,
  );
  d.line(invoice.senderName, true, 13);
  d.line(invoice.senderAddress);
  d.line(
    `Status: ${invoice.status} | Due: ${invoice.dueDate} | Issued: ${new Date(String(invoice.createdAt)).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi" })}`,
  );
  d.space();
  d.line("BILL TO", true, 10);
  d.line(invoice.customerName, true, 12);
  if (invoice.customerEmail) d.line(invoice.customerEmail);
  if (invoice.customerPhone) d.line(invoice.customerPhone);
  d.space();
  d.table(
    ["Description", "Qty", "Unit price", "Amount"],
    [270, 40, 100, 105],
    items.map((i) => [
      i.description,
      i.quantity,
      money(i.unitPrice),
      money(Number(i.quantity) * Number(i.unitPrice)),
    ]),
  );
  d.line(`Subtotal: ${money(invoice.subtotal)}`);
  d.line(`Discount: ${money(invoice.discount)}`);
  d.line(`Tax (${invoice.taxRate}%): ${money(invoice.tax)}`);
  d.line(`Total: ${money(invoice.total)}`, true, 14);
  d.line(`Amount paid: ${money(invoice.amountPaid)}`);
  d.line(
    `Balance due: ${invoice.status === "CANCELLED" ? money(0) : money(Number(invoice.total) - Number(invoice.amountPaid))}`,
    true,
    12,
  );
  if (invoice.notes) {
    d.space();
    d.line("Notes", true);
    const note = safe(invoice.notes);
    for (let start = 0; start < note.length; start += 90)
      d.line(note.slice(start, start + 90));
  }
  if (payments.length) {
    d.space();
    d.line("Payment history", true);
    d.table(
      ["Date", "Method", "Reference", "Status", "Amount"],
      [85, 70, 170, 80, 110],
      payments.map((p) => [
        new Date(String(p.createdAt)).toLocaleDateString("en-GB", {
          timeZone: "Asia/Karachi",
        }),
        p.method,
        p.reference,
        p.status,
        money(p.amount),
      ]),
    );
  }
  d.space();
  d.line("Thank you for your business.");
  return d.finish();
}
