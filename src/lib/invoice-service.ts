import { randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader } from "mysql2";
import type { SqlValue } from "./db";
import type { InvoiceLine } from "./billing";
export type InvoiceInput = {
  storeId: number;
  saleId?: number;
  customerId: number | null;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  senderName: string;
  senderAddress: string;
  subtotal: number;
  discount: number;
  taxRate?: number;
  tax?: number;
  total: number;
  amountPaid?: number;
  dueDate: string;
  notes?: string;
  userId: number;
  items: InvoiceLine[];
  payment?: string;
};
export async function insertInvoice(
  connection: PoolConnection,
  p: InvoiceInput,
) {
  const exec = async (sql: string, values: SqlValue[]) =>
    (await connection.execute<ResultSetHeader>(sql, values))[0];
  const r = await exec(
    "INSERT INTO invoices(store_id,sale_id,customer_id,invoice_number,customer_name,customer_email,customer_phone,sender_name,sender_address,subtotal,discount,tax_rate,tax,total,amount_paid,status,due_date,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      p.storeId,
      p.saleId || null,
      p.customerId,
      `PENDING-${randomUUID().slice(0, 24)}`,
      p.customerName,
      p.customerEmail || "",
      p.customerPhone || "",
      p.senderName,
      p.senderAddress,
      p.subtotal,
      p.discount,
      p.taxRate || 0,
      p.tax || 0,
      p.total,
      p.amountPaid || 0,
      (p.amountPaid || 0) >= p.total ? "PAID" : "ISSUED",
      p.dueDate,
      p.notes || "",
      p.userId,
    ],
  );
  const invoiceNumber = `INV-${new Date().getUTCFullYear()}-${String(r.insertId).padStart(6, "0")}`;
  await exec("UPDATE invoices SET invoice_number=? WHERE id=?", [
    invoiceNumber,
    r.insertId,
  ]);
  for (const i of p.items)
    await exec(
      "INSERT INTO invoice_items(invoice_id,description,quantity,unit_price) VALUES (?,?,?,?)",
      [r.insertId, i.description, i.quantity, i.unitPrice],
    );
  if (p.amountPaid && p.payment)
    await exec(
      "INSERT INTO invoice_payments(invoice_id,amount,method,request_key,user_id) VALUES (?,?,?,?,?)",
      [r.insertId, p.amountPaid, p.payment, randomUUID(), p.userId],
    );
  return { id: r.insertId, invoiceNumber };
}
