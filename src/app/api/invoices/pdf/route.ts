import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rows } from "@/lib/db";
import {
  requireUser,
  storeScope,
  apiError,
  APIError,
} from "@/lib/server-access";
import { invoicePDF } from "@/lib/pdf-documents";
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser("invoices.view"),
      storeId = storeScope(user, req),
      id = z.coerce
        .number()
        .int()
        .positive()
        .parse(req.nextUrl.searchParams.get("id"));
    const invoice = (
      await rows(
        "SELECT id,invoice_number AS invoiceNumber,customer_name AS customerName,customer_email AS customerEmail,customer_phone AS customerPhone,sender_name AS senderName,sender_address AS senderAddress,subtotal,discount,tax_rate AS taxRate,tax,total,amount_paid AS amountPaid,status,DATE_FORMAT(due_date,'%Y-%m-%d') AS dueDate,notes,created_at AS createdAt FROM invoices WHERE id=? AND store_id=?",
        [id, storeId],
      )
    )[0];
    if (!invoice) throw new APIError("Invoice not found", 404);
    const [items, payments] = await Promise.all([
      rows(
        "SELECT description,quantity,unit_price AS unitPrice FROM invoice_items WHERE invoice_id=?",
        [id],
      ),
      rows(
        "SELECT amount,method,reference,status,created_at AS createdAt FROM invoice_payments WHERE invoice_id=? ORDER BY id",
        [id],
      ),
    ]);
    const bytes = await invoicePDF(invoice, items, payments);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
