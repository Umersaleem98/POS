import { currencySchema } from "@/lib/schemas";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ResultSetHeader } from "mysql2";
import { db, rows, type SqlValue } from "@/lib/db";
import {
  requireUser,
  storeScope,
  APIError,
  apiError,
} from "@/lib/server-access";
import { sameOrigin } from "@/lib/request-security";
import { invoiceTotals, paymentState } from "@/lib/billing";
import { insertInvoice } from "@/lib/invoice-service";
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s,
    "Invalid date",
  );
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser("invoices.view"),
      storeId = storeScope(user, req),
      id = req.nextUrl.searchParams.get("id");
    if (id) {
      const invoice = (
        await rows(
          "SELECT id,store_id AS storeId,sale_id AS saleId,invoice_number AS invoiceNumber,customer_name AS customerName,customer_email AS customerEmail,customer_phone AS customerPhone,sender_name AS senderName,sender_address AS senderAddress,subtotal,discount,tax_rate AS taxRate,tax,total,amount_paid AS amountPaid,status,DATE_FORMAT(due_date,'%Y-%m-%d') AS dueDate,notes,created_at AS createdAt FROM invoices WHERE id=? AND store_id=?",
          [z.coerce.number().int().positive().parse(id), storeId],
        )
      )[0];
      if (!invoice) throw new APIError("Invoice not found", 404);
      const [items, payments] = await Promise.all([
        rows(
          "SELECT id,description,quantity,unit_price AS unitPrice FROM invoice_items WHERE invoice_id=?",
          [Number(id)],
        ),
        rows(
          "SELECT id,amount,method,reference,status,created_at AS createdAt FROM invoice_payments WHERE invoice_id=? ORDER BY id DESC",
          [Number(id)],
        ),
      ]);
      return NextResponse.json({ invoice, items, payments });
    }
    const q = (req.nextUrl.searchParams.get("q") || "").slice(0, 100),
      status = req.nextUrl.searchParams.get("status") || "ALL",
      page = z.coerce
        .number()
        .int()
        .min(1)
        .max(1000000)
        .parse(req.nextUrl.searchParams.get("page") || 1);
    const filters = ["store_id=?"];
    const values: SqlValue[] = [storeId];
    if (q) {
      filters.push("(invoice_number LIKE ? OR customer_name LIKE ?)");
      values.push(`%${q}%`, `%${q}%`);
    }
    if (status === "OVERDUE")
      filters.push(
        "status IN ('ISSUED','PARTIAL') AND due_date < DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 HOUR))",
      );
    else if (status !== "ALL") {
      filters.push("status=?");
      values.push(
        z.enum(["ISSUED", "PARTIAL", "PAID", "CANCELLED"]).parse(status),
      );
    }
    const where = filters.join(" AND ");
    const [invoices, count, summary] = await Promise.all([
      rows(
        `SELECT id,sale_id AS saleId,invoice_number AS invoiceNumber,customer_name AS customerName,total,amount_paid AS amountPaid,status,DATE_FORMAT(due_date,'%Y-%m-%d') AS dueDate,created_at AS createdAt FROM invoices WHERE ${where} ORDER BY id DESC LIMIT 20 OFFSET ${(page - 1) * 20}`,
        values,
      ),
      rows<{ total: number }>(
        `SELECT COUNT(*) AS total FROM invoices WHERE ${where}`,
        values,
      ),
      rows(
        "SELECT COALESCE(SUM(IF(status!='CANCELLED',total,0)),0) AS billed,COALESCE(SUM(IF(status!='CANCELLED',amount_paid,0)),0) AS collected,COALESCE(SUM(IF(status IN ('ISSUED','PARTIAL'),total-amount_paid,0)),0) AS outstanding,COALESCE(SUM(IF(status IN ('ISSUED','PARTIAL') AND due_date < DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 HOUR)),total-amount_paid,0)),0) AS overdue FROM invoices WHERE store_id=?",
        [storeId],
      ),
    ]);
    return NextResponse.json({
      invoices,
      total: count[0].total,
      page,
      summary: summary[0],
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: NextRequest) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  let body, action, user;
  try {
    body = await req.json();
    action = z
      .enum(["invoice", "invoicePayment", "cancelInvoice"])
      .parse(body.action);
    user = await requireUser(
      action === "invoice"
        ? "invoices.create"
        : action === "invoicePayment"
          ? "invoices.pay"
          : "invoices.create",
    );
  } catch (e) {
    if (e instanceof z.ZodError)
      return NextResponse.json(
        { error: "Invalid invoice action" },
        { status: 400 },
      );
    return apiError(e);
  }
  const connection = await db.getConnection().catch(() => null);
  if (!connection)
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 503 },
    );
  try {
    const storeId =
      user.role === "SUPER_ADMIN"
        ? z.coerce
            .number()
            .int()
            .positive()
            .parse(body.storeId || user.storeId)
        : user.storeId;
    if (!storeId) throw new APIError("Select a store");
    await connection.beginTransaction();
    const exec = async (sql: string, values: SqlValue[]) =>
      (await connection.execute<ResultSetHeader>(sql, values))[0];
    let result: unknown = null;
    if (action === "invoice") {
      const p = z
        .object({
          customerId: z.number().int().positive().nullable(),
          customerName: z.string().trim().min(2).max(120),
          customerEmail: z
            .union([z.email().max(190), z.literal("")])
            .default(""),
          customerPhone: z.string().max(30).default(""),
          dueDate: day,
          notes: z.string().max(2000).default(""),
          discount: currencySchema.default(0),
          taxRate: z
            .number()
            .min(0)
            .max(100)
            .refine(
              (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-7,
              "Use at most two decimal places",
            )
            .default(0),
          items: z
            .array(
              z.object({
                description: z.string().trim().min(1).max(255),
                quantity: z.number().int().positive().max(10000),
                unitPrice: currencySchema,
              }),
            )
            .min(1)
            .max(100),
        })
        .parse(body);
      if (p.customerId) {
        const [c] = await connection.execute(
          "SELECT id FROM customers WHERE id=? AND store_id=?",
          [p.customerId, storeId],
        );
        if (!(c as unknown[]).length) throw new APIError("Customer not found");
      }
      const totals = invoiceTotals(p.items, p.discount, p.taxRate);
      if (totals.total > 999999999999.99)
        throw new APIError("Invoice total is too large");
      const [stores] = await connection.execute(
        "SELECT name,address FROM stores WHERE id=?",
        [storeId],
      );
      const store = (stores as { name: string; address: string }[])[0];
      if (!store) throw new APIError("Store not found");
      result = await insertInvoice(connection, {
        ...p,
        ...totals,
        storeId,
        senderName: store.name,
        senderAddress: store.address,
        userId: user.id,
      });
    } else {
      const id = z.number().int().positive().parse(body.id);
      const [matches] = await connection.execute(
        "SELECT id,status,total,amount_paid AS amountPaid,sale_id AS saleId FROM invoices WHERE id=? AND store_id=? FOR UPDATE",
        [id, storeId],
      );
      const invoice = (
        matches as {
          id: number;
          status: string;
          total: number;
          amountPaid: number;
          saleId: number | null;
        }[]
      )[0];
      if (!invoice) throw new APIError("Invoice not found", 404);
      if (action === "cancelInvoice") {
        if (invoice.saleId)
          throw new APIError("Void the linked sale to cancel its invoice");
        if (invoice.amountPaid > 0 || invoice.status === "CANCELLED")
          throw new APIError("Only an unpaid, open invoice can be cancelled");
        await exec("UPDATE invoices SET status='CANCELLED' WHERE id=?", [id]);
      } else {
        const p = z
          .object({
            amount: currencySchema.refine((n) => n > 0),
            method: z.enum(["Cash", "Card", "Transfer"]),
            reference: z.string().max(120).default(""),
            requestKey: z.uuid(),
          })
          .parse(body);
        const [prior] = await connection.execute(
          "SELECT id,invoice_id FROM invoice_payments WHERE request_key=?",
          [p.requestKey],
        );
        if ((prior as { id: number; invoice_id: number }[]).length) {
          if ((prior as { invoice_id: number }[])[0].invoice_id !== id)
            throw new APIError(
              "Payment request key belongs to another invoice",
            );
          await connection.commit();
          return NextResponse.json({ success: true, replayed: true });
        }
        if (invoice.status === "CANCELLED" || invoice.status === "PAID")
          throw new APIError("This invoice cannot accept another payment");
        const state = paymentState(invoice.total, invoice.amountPaid, p.amount);
        await exec(
          "INSERT INTO invoice_payments(invoice_id,amount,method,reference,request_key,user_id) VALUES (?,?,?,?,?,?)",
          [
            id,
            Math.round(p.amount * 100) / 100,
            p.method,
            p.reference,
            p.requestKey,
            user.id,
          ],
        );
        await exec("UPDATE invoices SET amount_paid=?,status=? WHERE id=?", [
          state.amountPaid,
          state.status,
          id,
        ]);
      }
    }
    await exec("INSERT INTO audit_logs(user_id,action) VALUES (?,?)", [
      user.id,
      `${action} · store ${storeId}`,
    ]);
    await connection.commit();
    return NextResponse.json({ success: true, result });
  } catch (e) {
    await connection.rollback();
    if (e instanceof z.ZodError)
      return NextResponse.json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    if (
      e instanceof Error &&
      !(e instanceof APIError) &&
      /Discount exceeds|Payment must/.test(e.message)
    )
      return NextResponse.json({ error: e.message }, { status: 400 });
    return apiError(e);
  } finally {
    connection.release();
  }
}
