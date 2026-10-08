import { NextRequest, NextResponse } from "next/server";
import { rows } from "@/lib/db";
import {
  requireUser,
  storeScope,
  APIError,
  apiError,
} from "@/lib/server-access";
import { reportFilterSchema, reportWhere } from "@/lib/report-filters";
import { csvDocument } from "@/lib/exports";
import { reportPDF } from "@/lib/pdf-documents";
export async function reportResponse(req: NextRequest, history = false) {
  try {
    const format = req.nextUrl.searchParams.get("format") || "json";
    if (!["json", "csv", "pdf"].includes(format))
      throw new APIError("Unknown export format");
    const user = await requireUser(
        format === "json"
          ? history
            ? "sales.view"
            : "reports.view"
          : "reports.export",
      ),
      storeId = storeScope(user, req);
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Karachi",
    });
    const from = new Date(Date.now() - 29 * 86400000).toLocaleDateString(
      "en-CA",
      { timeZone: "Asia/Karachi" },
    );
    const filters = reportFilterSchema.parse({
      from,
      to: today,
      ...Object.fromEntries(req.nextUrl.searchParams),
    });
    const where = reportWhere(filters, storeId);
    const joins =
      "FROM sales s LEFT JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=s.user_id";
    const [summary, daily, topProducts, payments, store] = await Promise.all([
      rows<{
        totalRows: number;
        revenue: number;
        cost: number;
        sales: number;
        voided: number;
        discounts: number;
      }>(
        `SELECT COUNT(*) AS totalRows,COALESCE(SUM(IF(s.status='COMPLETED',s.total,0)),0) AS revenue,COALESCE(SUM(IF(s.status='COMPLETED',(SELECT SUM(si.unit_cost*si.quantity) FROM sale_items si WHERE si.sale_id=s.id),0)),0) AS cost,COALESCE(SUM(s.status='COMPLETED'),0) AS sales,COALESCE(SUM(s.status='VOID'),0) AS voided,COALESCE(SUM(IF(s.status='COMPLETED',s.discount,0)),0) AS discounts ${joins} WHERE ${where.sql}`,
        where.values,
      ),
      rows(
        `SELECT DATE_FORMAT(DATE_ADD(s.created_at,INTERVAL 5 HOUR),'%Y-%m-%d') AS date,COALESCE(SUM(IF(s.status='COMPLETED',s.total,0)),0) AS revenue,SUM(s.status='COMPLETED') AS sales ${joins} WHERE ${where.sql} GROUP BY date ORDER BY date`,
        where.values,
      ),
      rows(
        `SELECT si.product_name AS name,SUM(si.quantity) AS quantity,SUM(si.unit_price*si.quantity) AS grossRevenue ${joins} JOIN sale_items si ON si.sale_id=s.id WHERE ${where.sql} AND s.status='COMPLETED' GROUP BY si.product_id,si.product_name ORDER BY grossRevenue DESC LIMIT 5`,
        where.values,
      ),
      rows(
        `SELECT s.payment AS method,SUM(s.total) AS revenue,COUNT(*) AS sales ${joins} WHERE ${where.sql} AND s.status='COMPLETED' GROUP BY s.payment`,
        where.values,
      ),
      rows<{ name: string; address: string }>(
        "SELECT name,address FROM stores WHERE id=?",
        [storeId],
      ),
    ]);
    if (history) {
      summary[0].cost = 0;
      topProducts.length = 0;
    }
    const stats = {
      ...summary[0],
      profit: history ? 0 : summary[0].revenue - summary[0].cost,
      average: summary[0].sales ? summary[0].revenue / summary[0].sales : 0,
    };
    if (format !== "json" && stats.totalRows > 10000)
      throw new APIError(
        "This export exceeds 10,000 rows. Narrow the date range or filters.",
        422,
      );
    const order = {
      newest: "s.id DESC",
      oldest: "s.id ASC",
      highest: "s.total DESC,s.id DESC",
      lowest: "s.total ASC,s.id DESC",
    }[filters.sort];
    const sales = await rows(
      `SELECT s.id,s.total,s.subtotal,s.discount,s.payment,s.status,s.created_at AS createdAt,COALESCE(c.name,'Walk-in customer') AS customer,u.name AS cashier,inv.id AS invoiceId,inv.invoice_number AS invoiceNumber ${joins} LEFT JOIN invoices inv ON inv.sale_id=s.id WHERE ${where.sql} ORDER BY ${order} LIMIT ${format === "json" ? 25 : 10000} ${format === "json" ? `OFFSET ${(filters.page - 1) * 25}` : ""}`,
      where.values,
    );
    if (format === "csv") {
      const csv = csvDocument([
        ["POS Sales Report", store[0]?.name || "Store"],
        ["Period", filters.from, filters.to],
        [
          "Filters",
          `Search: ${filters.q || "Any"} | Payment: ${filters.payment} | Status: ${filters.status} | Amount: ${filters.min}–${filters.max}`,
        ],
        ["Net sales", stats.revenue],
        ["Estimated gross profit", stats.profit],
        [],
        [
          "Receipt",
          "Invoice",
          "Date (Asia/Karachi)",
          "Customer",
          "Cashier",
          "Payment",
          "Status",
          "Subtotal",
          "Discount",
          "Total",
        ],
        ...sales.map((s) => [
          s.id,
          s.invoiceNumber || "",
          new Date(String(s.createdAt)).toLocaleString("en-GB", {
            timeZone: "Asia/Karachi",
          }),
          s.customer,
          s.cashier,
          s.payment,
          s.status,
          s.subtotal,
          s.discount,
          s.total,
        ]),
      ]);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="POS-report-${filters.from}-${filters.to}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (format === "pdf") {
      const pdf = await reportPDF({
        store: store[0]?.name || "Store",
        filters,
        summary: stats,
        sales,
      });
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="POS-report-${filters.from}-${filters.to}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json({
      filters,
      summary: stats,
      daily,
      topProducts,
      payments,
      sales,
      page: filters.page,
      pageSize: 25,
      total: stats.totalRows,
    });
  } catch (e) {
    if ((e as { name?: string }).name === "ZodError")
      return NextResponse.json(
        { error: "Check your report filters, dates and amounts." },
        { status: 400 },
      );
    return apiError(e);
  }
}
