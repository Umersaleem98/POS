import { createHash } from "node:crypto";
import { can, type Permission } from "@/lib/permissions";
import { insertInvoice } from "@/lib/invoice-service";
import { POST as adminPost } from "../admin/route";
import { sameOrigin } from "@/lib/request-security";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ResultSetHeader } from "mysql2";
import { currentUser } from "@/lib/auth";
import { db, rows, type SqlValue } from "@/lib/db";
import { productSchema, customerSchema, saleSchema } from "@/lib/schemas";
class ActionError extends Error {}
export async function GET(req: NextRequest) {
  try {
    const user = await currentUser();
    if (!user)
      return NextResponse.json({ error: "Please sign in" }, { status: 401 });
    const storeId =
      user.role === "SUPER_ADMIN"
        ? Number(req.nextUrl.searchParams.get("storeId") || user.storeId || 1)
        : user.storeId;
    const [products, customers, sales, movements, stores, users, audit] =
      await Promise.all([
        can(user, "products.view") ||
        can(user, "inventory.view") ||
        can(user, "sales.create")
          ? rows(
              `SELECT id,name,sku,category,price,${can(user, "products.write") || can(user, "inventory.view") || can(user, "reports.view") ? "cost" : "0 AS cost"},stock,reorder_level AS reorderLevel,color FROM products WHERE store_id=? AND active=1 ORDER BY id DESC`,
              [storeId],
            )
          : Promise.resolve([]),
        can(user, "customers.view") || can(user, "sales.create")
          ? rows(
              "SELECT id,name,email,phone FROM customers WHERE store_id=? ORDER BY id DESC",
              [storeId],
            )
          : Promise.resolve([]),
        can(user, "sales.view")
          ? rows(
              "SELECT s.id,s.total,s.subtotal,s.discount,s.payment,s.status,s.created_at AS createdAt,COALESCE(c.name,'Walk-in customer') AS customer,u.name AS cashier FROM sales s LEFT JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=s.user_id WHERE s.store_id=? ORDER BY s.id DESC LIMIT 500",
              [storeId],
            )
          : Promise.resolve([]),
        can(user, "inventory.view")
          ? rows(
              "SELECT m.id,p.name AS product,m.quantity,m.reason,m.created_at AS createdAt,u.name AS user FROM stock_movements m JOIN products p ON p.id=m.product_id JOIN users u ON u.id=m.user_id WHERE m.store_id=? ORDER BY m.id DESC LIMIT 100",
              [storeId],
            )
          : Promise.resolve([]),
        user.role === "SUPER_ADMIN"
          ? rows("SELECT id,name,address FROM stores ORDER BY id")
          : rows("SELECT id,name,address FROM stores WHERE id=?", [storeId]),
        user.role === "SUPER_ADMIN"
          ? rows(
              "SELECT u.id,u.name,u.email,u.role,u.active,u.store_id AS storeId,COALESCE(s.name,'All stores') AS store FROM users u LEFT JOIN stores s ON s.id=u.store_id",
            )
          : Promise.resolve([]),
        user.role === "SUPER_ADMIN"
          ? rows(
              "SELECT a.id,u.name AS user,a.action,a.created_at AS createdAt FROM audit_logs a JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 100",
            )
          : Promise.resolve([]),
      ]);
    const policies =
      user.role === "SUPER_ADMIN"
        ? await rows(
            "SELECT code,name,description,permissions,locked FROM role_policies ORDER BY locked DESC,name",
          )
        : [];
    const roles = policies.map((p) => ({
      ...p,
      locked: !!p.locked,
      permissions:
        typeof p.permissions === "string"
          ? JSON.parse(p.permissions)
          : p.permissions,
    }));
    return NextResponse.json({
      roles,
      user,
      storeId,
      products,
      customers,
      sales,
      movements,
      stores,
      users,
      audit,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Database unavailable. Start XAMPP MySQL and initialize the database.",
      },
      { status: 503 },
    );
  }
}
export async function POST(req: NextRequest) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body)
    return NextResponse.json(
      { error: "Invalid JSON request" },
      { status: 400 },
    );
  if (["user", "editUser", "toggleUser", "role"].includes(body.action))
    return adminPost(
      new NextRequest(req.url, {
        method: "POST",
        headers: req.headers,
        body: JSON.stringify(body),
      }),
    );
  let user;
  try {
    user = await currentUser();
  } catch {
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 503 },
    );
  }
  if (!user)
    return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const connection = await db.getConnection().catch(() => null);
  if (!connection)
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 503 },
    );
  try {
    const action = z
      .enum([
        "product",
        "archive",
        "stock",
        "customer",
        "sale",
        "void",
        "store",
      ])
      .parse(body.action);
    const storeId =
      user.role === "SUPER_ADMIN"
        ? z.coerce
            .number()
            .int()
            .positive()
            .parse(body.storeId || user.storeId || 1)
        : user.storeId;
    if (!storeId) throw new ActionError("Account has no store assigned");
    if (action === "store" && user.role !== "SUPER_ADMIN")
      return NextResponse.json(
        { error: "Super admin access required" },
        { status: 403 },
      );
    const needed: Record<string, Permission> = {
      product: "products.write",
      archive: "products.write",
      stock: "inventory.write",
      customer: "customers.write",
      sale: "sales.create",
      void: "sales.void",
    };
    if (needed[action] && !can(user, needed[action]))
      return NextResponse.json(
        { error: "Your role does not allow this operation" },
        { status: 403 },
      );
    await connection.beginTransaction();
    let result: unknown = null;
    const exec = async (sql: string, values: SqlValue[]) =>
      (await connection.execute<ResultSetHeader>(sql, values))[0];
    if (action === "product") {
      const p = productSchema.parse(body);
      const values = [
        p.name,
        p.sku,
        p.category,
        p.price,
        p.cost,
        p.reorderLevel,
        p.color,
      ];
      if (body.id) {
        const id = z.number().int().positive().parse(body.id);
        const r = await exec(
          "UPDATE products SET name=?,sku=?,category=?,price=?,cost=?,reorder_level=?,color=? WHERE id=? AND store_id=? AND active=1",
          [...values, id, storeId],
        );
        if (!r.affectedRows) throw new ActionError("Product not found");
      } else {
        const r = await exec(
          "INSERT INTO products(name,sku,category,price,cost,reorder_level,color,stock,store_id) VALUES (?,?,?,?,?,?,?,?,?)",
          [...values, p.stock, storeId],
        );
        await exec(
          "INSERT INTO stock_movements(store_id,product_id,user_id,quantity,reason) VALUES (?,?,?,?,?)",
          [storeId, r.insertId, user.id, p.stock, "Opening stock"],
        );
      }
    }
    if (action === "archive") {
      const id = z.number().int().positive().parse(body.id);
      const r = await exec(
        "UPDATE products SET active=0 WHERE id=? AND store_id=?",
        [id, storeId],
      );
      if (!r.affectedRows) throw new ActionError("Product not found");
    }
    if (action === "stock") {
      const p = z
        .object({
          productId: z.number().int().positive(),
          quantity: z.coerce
            .number()
            .int()
            .min(-1000000)
            .max(1000000)
            .refine((n) => n !== 0),
          reason: z.string().trim().min(3).max(255),
        })
        .parse(body);
      const r = await exec(
        "UPDATE products SET stock=stock+? WHERE id=? AND store_id=? AND active=1 AND stock+? >= 0",
        [p.quantity, p.productId, storeId, p.quantity],
      );
      if (!r.affectedRows)
        throw new ActionError("Product not found or insufficient stock");
      await exec(
        "INSERT INTO stock_movements(store_id,product_id,user_id,quantity,reason) VALUES (?,?,?,?,?)",
        [storeId, p.productId, user.id, p.quantity, p.reason],
      );
    }
    if (action === "customer") {
      const p = customerSchema.parse(body);
      await exec(
        "INSERT INTO customers(store_id,name,email,phone) VALUES (?,?,?,?)",
        [storeId, p.name, p.email, p.phone],
      );
    }
    if (action === "store") {
      const p = z
        .object({
          name: z.string().trim().min(2).max(120),
          address: z.string().max(255),
        })
        .parse(body);
      await exec("INSERT INTO stores(name,address) VALUES (?,?)", [
        p.name,
        p.address,
      ]);
    }
    if (action === "sale") {
      const p = saleSchema.parse(body);
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify({
            items: [...p.items].sort((a, b) => a.productId - b.productId),
            discount: Math.round(p.discount * 100),
            payment: p.payment,
            customerId: p.customerId,
            storeId,
            userId: user.id,
          }),
        )
        .digest("hex");
      if (p.requestKey) {
        const [priorRows] = await connection.execute(
          "SELECT id,store_id,request_fingerprint,status,subtotal,discount,total,payment FROM sales WHERE request_key=?",
          [p.requestKey],
        );
        const prior = (
          priorRows as {
            id: number;
            store_id: number;
            request_fingerprint: string;
            status: string;
            subtotal: number;
            discount: number;
            total: number;
            payment: string;
          }[]
        )[0];
        if (prior) {
          if (
            prior.store_id !== storeId ||
            prior.request_fingerprint !== fingerprint ||
            prior.status !== "COMPLETED"
          )
            throw new ActionError(
              "This checkout request is already completed. Reload your workspace before starting a different order.",
            );
          const [priorItems] = await connection.execute(
            "SELECT product_id AS id,product_name AS name,quantity,unit_price AS price FROM sale_items WHERE sale_id=?",
            [prior.id],
          );
          const [priorInvoices] = await connection.execute(
            "SELECT id AS invoiceId,invoice_number AS invoiceNumber FROM invoices WHERE sale_id=?",
            [prior.id],
          );
          await connection.commit();
          return NextResponse.json({
            success: true,
            replayed: true,
            result: {
              id: prior.id,
              subtotal: prior.subtotal,
              discount: prior.discount,
              total: prior.total,
              payment: prior.payment,
              items: priorItems,
              ...(priorInvoices as object[])[0],
            },
          });
        }
      }
      let subtotal = 0;
      const items: {
        id: number;
        name: string;
        price: number;
        cost: number;
        quantity: number;
      }[] = [];
      if (p.customerId) {
        const [c] = await connection.execute(
          "SELECT id FROM customers WHERE id=? AND store_id=?",
          [p.customerId, storeId],
        );
        if (!(c as unknown[]).length)
          throw new ActionError("Customer not found");
      }
      for (const item of [...p.items].sort(
        (a, b) => a.productId - b.productId,
      )) {
        const [data] = await connection.execute(
          "SELECT id,name,price,cost,stock FROM products WHERE id=? AND store_id=? AND active=1 FOR UPDATE",
          [item.productId, storeId],
        );
        const product = (
          data as {
            id: number;
            name: string;
            price: number;
            cost: number;
            stock: number;
          }[]
        )[0];
        if (!product || product.stock < item.quantity)
          throw new ActionError("Insufficient stock for one or more products");
        subtotal += Math.round(product.price * 100) * item.quantity;
        items.push({ ...product, quantity: item.quantity });
      }
      const discount = Math.round(p.discount * 100);
      if (discount > subtotal)
        throw new ActionError("Discount exceeds subtotal");
      const sale = await exec(
        "INSERT INTO sales(store_id,user_id,customer_id,subtotal,discount,total,payment,request_key,request_fingerprint) VALUES (?,?,?,?,?,?,?,?,?)",
        [
          storeId,
          user.id,
          p.customerId,
          subtotal / 100,
          discount / 100,
          (subtotal - discount) / 100,
          p.payment,
          p.requestKey || null,
          fingerprint,
        ],
      );
      for (const item of items) {
        await exec("UPDATE products SET stock=stock-? WHERE id=?", [
          item.quantity,
          item.id,
        ]);
        await exec(
          "INSERT INTO sale_items(sale_id,product_id,product_name,quantity,unit_price,unit_cost) VALUES (?,?,?,?,?,?)",
          [
            sale.insertId,
            item.id,
            item.name,
            item.quantity,
            item.price,
            item.cost,
          ],
        );
        await exec(
          "INSERT INTO stock_movements(store_id,product_id,user_id,quantity,reason) VALUES (?,?,?,?,?)",
          [storeId, item.id, user.id, -item.quantity, `Sale #${sale.insertId}`],
        );
      }
      const [storeRows] = await connection.execute(
        "SELECT name,address FROM stores WHERE id=?",
        [storeId],
      );
      const store = (storeRows as { name: string; address: string }[])[0];
      const [customerRows] = p.customerId
        ? await connection.execute(
            "SELECT name,email,phone FROM customers WHERE id=? AND store_id=?",
            [p.customerId, storeId],
          )
        : [[]];
      const customer = (
        customerRows as { name: string; email: string; phone: string }[]
      )[0];
      const invoice = await insertInvoice(connection, {
        storeId,
        saleId: sale.insertId,
        customerId: p.customerId,
        customerName: customer?.name || "Walk-in customer",
        customerEmail: customer?.email,
        customerPhone: customer?.phone,
        senderName: store.name,
        senderAddress: store.address,
        subtotal: subtotal / 100,
        discount: discount / 100,
        total: (subtotal - discount) / 100,
        amountPaid: (subtotal - discount) / 100,
        payment: p.payment,
        dueDate: new Date().toLocaleDateString("en-CA", {
          timeZone: "Asia/Karachi",
        }),
        userId: user.id,
        items: items.map((i) => ({
          description: i.name,
          quantity: i.quantity,
          unitPrice: i.price,
        })),
      });
      result = {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        id: sale.insertId,
        items: items.map((i) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
        })),
        subtotal: subtotal / 100,
        discount: discount / 100,
        total: (subtotal - discount) / 100,
        payment: p.payment,
      };
    }
    if (action === "void") {
      const id = z.number().int().positive().parse(body.id);
      const [data] = await connection.execute(
        "SELECT id,status FROM sales WHERE id=? AND store_id=? FOR UPDATE",
        [id, storeId],
      );
      const sale = (data as { id: number; status: string }[])[0];
      if (!sale || sale.status !== "COMPLETED")
        throw new ActionError("Sale not found or already voided");
      const [items] = await connection.execute(
        "SELECT product_id,quantity FROM sale_items WHERE sale_id=? ORDER BY product_id",
        [id],
      );
      for (const item of items as { product_id: number; quantity: number }[]) {
        await exec(
          "UPDATE products SET stock=stock+? WHERE id=? AND store_id=?",
          [item.quantity, item.product_id, storeId],
        );
        await exec(
          "INSERT INTO stock_movements(store_id,product_id,user_id,quantity,reason) VALUES (?,?,?,?,?)",
          [
            storeId,
            item.product_id,
            user.id,
            item.quantity,
            `Void sale #${id}`,
          ],
        );
      }
      await exec("UPDATE sales SET status='VOID' WHERE id=?", [id]);
      await exec(
        "UPDATE invoice_payments p JOIN invoices i ON i.id=p.invoice_id SET p.status='REVERSED' WHERE i.sale_id=? AND i.store_id=?",
        [id, storeId],
      );
      await exec(
        "UPDATE invoices SET status='CANCELLED',amount_paid=0 WHERE sale_id=? AND store_id=?",
        [id, storeId],
      );
    }
    await exec("INSERT INTO audit_logs(user_id,action) VALUES (?,?)", [
      user.id,
      `${action} · store ${storeId}`,
    ]);
    await connection.commit();
    return NextResponse.json({ success: true, result });
  } catch (e) {
    await connection.rollback();
    const code = (e as { code?: string }).code;
    const message =
      e instanceof z.ZodError
        ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : e instanceof ActionError
          ? e.message
          : code === "ER_DUP_ENTRY"
            ? body.action === "sale"
              ? "This checkout request is already completed. Retry to view its receipt."
              : "This SKU or email already exists"
            : "Operation failed. Check the submitted data and database connection.";
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    connection.release();
  }
}
