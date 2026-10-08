import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { PDFDocument } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
test(
  "advanced live API: configurable roles, full reports and billing integrity",
  { skip: process.env.POS_INTEGRATION !== "1" },
  async (t) => {
    const origin = process.env.POS_TEST_URL || "http://127.0.0.1:3000";
    const marker = randomUUID();
    const customRole = `TEST_${marker.replaceAll("-", "").slice(0, 20).toUpperCase()}`;
    const db = await mysql.createConnection({
      host: process.env.MYSQL_HOST || "127.0.0.1",
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE || "pos",
      decimalNumbers: true,
      timezone: "Z",
    });
    const storeIds = [],
      userIds = [],
      emails = [];
    const password = randomUUID();
    const query = async (sql, values = []) =>
      (await db.execute(sql, values))[0];
    async function api(path, body, cookie) {
      const r = await fetch(`${origin}/api/${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (
        r.headers.get("content-type")?.includes("application/pdf") ||
        r.headers.get("content-type")?.includes("text/csv")
      )
        return {
          status: r.status,
          bytes: new Uint8Array(await r.arrayBuffer()),
        };
      return {
        status: r.status,
        data: await r.json(),
        cookie: r.headers.get("set-cookie")?.split(";")[0],
      };
    }
    try {
      await query("SET time_zone='+00:00'");
      for (const name of ["Billing tests", "Foreign store"])
        storeIds.push(
          (
            await query("INSERT INTO stores(name,address) VALUES (?,?)", [
              `${name} ${marker}`,
              "Karachi, Pakistan",
            ])
          ).insertId,
        );
      for (const role of ["SUPER_ADMIN", "USER"]) {
        const email = `${role.toLowerCase()}-${marker}@example.com`;
        emails.push(email);
        userIds.push(
          (
            await query(
              "INSERT INTO users(name,email,password_hash,role,store_id) VALUES (?,?,?,?,?)",
              [
                "QA member",
                email,
                await bcrypt.hash(password, 12),
                role,
                storeIds[0],
              ],
            )
          ).insertId,
        );
      }
      const owner = (await api("auth", { email: emails[0], password })).cookie,
        worker = (await api("auth", { email: emails[1], password })).cookie;
      const productId = (
        await query(
          "INSERT INTO products(store_id,name,sku,category,price,cost,stock) VALUES (?,?,?,?,?,?,?)",
          [storeIds[0], "Report item", marker, "Test", 100, 60, 0],
        )
      ).insertId;
      await t.test(
        "USER sees no cost data, cannot adjust inventory and cannot view or export reports",
        async () => {
          const workspace = await api("workspace", null, worker);
          assert.equal(workspace.status, 200);
          assert.equal(workspace.data.products[0].cost, 0);
          assert.equal(workspace.data.movements.length, 0);
          assert.equal(
            (
              await api(
                "workspace",
                { action: "stock", productId, quantity: 1, reason: "Denied" },
                worker,
              )
            ).status,
            403,
          );
          assert.equal(
            (await api(`reports?storeId=${storeIds[0]}`, null, worker)).status,
            403,
          );
          assert.equal((await api("admin", null, worker)).status, 403);
        },
      );
      await t.test(
        "concurrent permission checks do not exhaust the database connection pool",
        async () => {
          const responses = await Promise.all(
            Array.from({ length: 20 }, () =>
              api(
                "workspace",
                {
                  action: "stock",
                  productId,
                  quantity: 1,
                  reason: "Denied write",
                },
                worker,
              ),
            ),
          );
          assert.ok(responses.every((r) => r.status === 403));
        },
      );
      let memberId;
      await t.test(
        "super admin creates a custom role and assigns a new user to another store",
        async () => {
          assert.equal(
            (
              await api(
                "admin",
                {
                  action: "role",
                  code: customRole,
                  name: "QA report viewer",
                  description: "Read reports only",
                  permissions: ["reports.view"],
                },
                owner,
              )
            ).status,
            200,
          );
          const email = `created-${marker}@example.com`;
          emails.push(email);
          const r = await api(
            "admin",
            {
              action: "user",
              name: "Created user",
              email,
              password,
              role: customRole,
              assignedStoreId: storeIds[1],
              active: true,
            },
            owner,
          );
          assert.equal(r.status, 200);
          memberId = r.data.result.id;
          userIds.push(memberId);
          const account = (
            await query("SELECT role,store_id FROM users WHERE id=?", [
              memberId,
            ])
          )[0];
          assert.equal(account.store_id, storeIds[1]);
          assert.equal(account.role, customRole);
        },
      );
      await t.test(
        "role changes take effect on existing sessions and protected super admin policy stays locked",
        async () => {
          const login = await api("auth", { email: emails[2], password });
          assert.equal(
            (await api("reports?format=csv", null, login.cookie)).status,
            403,
          );
          assert.equal(
            (
              await api(
                "admin",
                {
                  action: "role",
                  code: customRole,
                  name: "QA report viewer",
                  description: "Reports and export",
                  permissions: ["reports.view", "reports.export"],
                },
                owner,
              )
            ).status,
            200,
          );
          assert.equal(
            (await api("reports?format=csv", null, login.cookie)).status,
            200,
          );
          assert.equal(
            (
              await api(
                "admin",
                {
                  action: "role",
                  code: "SUPER_ADMIN",
                  name: "Denied edit",
                  description: "",
                  permissions: [],
                },
                owner,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await api(
                "admin",
                {
                  action: "editUser",
                  id: userIds[0],
                  name: "QA member",
                  email: emails[0],
                  role: "USER",
                  assignedStoreId: storeIds[0],
                  active: true,
                },
                owner,
              )
            ).status,
            400,
          );
        },
      );
      let invoiceId;
      await t.test(
        "invoice validates customer scope and calculates discounts and tax on the server",
        async () => {
          const foreignCustomer = (
            await query("INSERT INTO customers(store_id,name) VALUES (?,?)", [
              storeIds[1],
              "Foreign customer",
            ])
          ).insertId;
          const body = {
            action: "invoice",
            storeId: storeIds[0],
            customerId: null,
            customerName: "Invoice Test Customer",
            customerEmail: "qa@example.com",
            customerPhone: "03001234567",
            dueDate: "2026-11-09",
            discount: 10.28,
            taxRate: 10,
            notes: "Payment due in 30 days.",
            items: [
              {
                description: "Professional services",
                quantity: 3,
                unitPrice: 100.1,
              },
              { description: "Delivery", quantity: 2, unitPrice: 19.99 },
            ],
            total: 1,
          };
          assert.equal(
            (
              await api(
                "invoices",
                { ...body, customerId: foreignCustomer },
                owner,
              )
            ).status,
            400,
          );
          const r = await api("invoices", body, owner);
          assert.equal(r.status, 200);
          invoiceId = r.data.result.id;
          const full = await api(
            `invoices?id=${invoiceId}&storeId=${storeIds[0]}`,
            null,
            owner,
          );
          assert.equal(full.data.invoice.total, 363);
          assert.equal(full.data.invoice.tax, 33);
          assert.equal(full.data.invoice.status, "ISSUED");
        },
      );
      await t.test(
        "invoice payment is idempotent and concurrent payments cannot overpay",
        async () => {
          const requestKey = randomUUID(),
            body = {
              action: "invoicePayment",
              id: invoiceId,
              storeId: storeIds[0],
              amount: 100.55,
              method: "Transfer",
              reference: "TEST-REFERENCE",
              requestKey,
            };
          assert.equal((await api("invoices", body, owner)).status, 200);
          const retry = await api("invoices", body, owner);
          assert.equal(retry.status, 200);
          assert.equal(retry.data.replayed, true);
          const responses = await Promise.all(
            [1, 2].map(() =>
              api(
                "invoices",
                { ...body, amount: 200, requestKey: randomUUID() },
                owner,
              ),
            ),
          );
          assert.deepEqual(responses.map((r) => r.status).sort(), [200, 400]);
          assert.equal(
            (
              await query("SELECT amount_paid FROM invoices WHERE id=?", [
                invoiceId,
              ])
            )[0].amount_paid,
            300.55,
          );
          assert.equal(
            (
              await api(
                "invoices",
                {
                  action: "cancelInvoice",
                  id: invoiceId,
                  storeId: storeIds[0],
                },
                owner,
              )
            ).status,
            400,
          );
        },
      );
      await t.test(
        "invoice PDF downloads are valid documents and cross-store access is rejected",
        async () => {
          const r = await api(
            `invoices/pdf?id=${invoiceId}&storeId=${storeIds[0]}`,
            null,
            owner,
          );
          assert.equal(r.status, 200);
          const pdf = await PDFDocument.load(r.bytes);
          assert.ok(pdf.getPageCount() >= 1);
          await mkdir("tmp/qa", { recursive: true });
          await writeFile("tmp/qa/invoice.pdf", r.bytes);
          const foreignLogin = await api("auth", {
            email: emails[2],
            password,
          });
          assert.equal(
            (
              await api(
                `invoices?id=${invoiceId}&storeId=${storeIds[0]}`,
                null,
                foreignLogin.cookie,
              )
            ).status,
            403,
          );
        },
      );
      const reportDay = new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Karachi",
      });
      const date = `${reportDay} 08:00:00`;
      const values = Array.from({ length: 520 }, (_, i) => [
        storeIds[0],
        userIds[0],
        100,
        0,
        100,
        i % 2 ? "Cash" : "Card",
        i >= 500 ? "VOID" : "COMPLETED",
        date,
      ]).flat();
      await query(
        `INSERT INTO sales(store_id,user_id,subtotal,discount,total,payment,status,created_at) VALUES ${Array(520).fill("(?,?,?,?,?,?,?,?)").join(",")}`,
        values,
      );
      await query(
        "INSERT INTO sale_items(sale_id,product_id,product_name,quantity,unit_price,unit_cost) SELECT id,?,'Report item',1,100,60 FROM sales WHERE store_id=?",
        [productId, storeIds[0]],
      );
      await t.test(
        "reports aggregate more than 500 sales, paginate and filter without truncation",
        async () => {
          const r = await api(
            `reports?storeId=${storeIds[0]}&from=${reportDay}&to=${reportDay}`,
            null,
            owner,
          );
          assert.equal(r.status, 200);
          assert.equal(r.data.total, 520);
          assert.equal(r.data.sales.length, 25);
          assert.equal(r.data.summary.revenue, 50000);
          assert.equal(r.data.summary.profit, 20000);
          const filter = await api(
            `reports?storeId=${storeIds[0]}&from=${reportDay}&to=${reportDay}&payment=Cash&status=COMPLETED&q=Report%20item&page=2`,
            null,
            owner,
          );
          assert.equal(filter.data.total, 250);
          assert.equal(filter.data.sales.length, 25);
          assert.ok(
            filter.data.sales.every(
              (s) => s.payment === "Cash" && s.status === "COMPLETED",
            ),
          );
        },
      );
      await t.test(
        "CSV export contains every filtered row and PDF report is a valid multipage document",
        async () => {
          const query = `storeId=${storeIds[0]}&from=${reportDay}&to=${reportDay}`;
          const csv = await api(`reports?${query}&format=csv`, null, owner);
          assert.equal(csv.status, 200);
          assert.equal(
            new TextDecoder().decode(csv.bytes).split("\r\n").length,
            527,
          );
          const r = await api(`reports?${query}&format=pdf`, null, owner);
          assert.equal(r.status, 200);
          const pdf = await PDFDocument.load(r.bytes);
          assert.ok(pdf.getPageCount() > 10);
          await writeFile("tmp/qa/report.pdf", r.bytes);
        },
      );
      await t.test(
        "checkout retries create one paid invoice and void preserves a reversed payment ledger",
        async () => {
          await query("UPDATE products SET stock=1 WHERE id=?", [productId]);
          const body = {
            action: "sale",
            requestKey: randomUUID(),
            items: [{ productId, quantity: 1 }],
            payment: "Cash",
            customerId: null,
            discount: 0,
          };
          const first = await api("workspace", body, worker),
            retry = await api("workspace", body, worker);
          assert.equal(first.status, 200);
          assert.equal(retry.status, 200);
          assert.equal(retry.data.replayed, true);
          assert.equal(first.data.result.id, retry.data.result.id);
          assert.ok(!("cost" in first.data.result.items[0]));
          assert.equal(
            (
              await query("SELECT stock FROM products WHERE id=?", [productId])
            )[0].stock,
            0,
          );
          const invoiceId = first.data.result.invoiceId;
          assert.equal(
            (
              await query("SELECT status FROM invoices WHERE id=?", [invoiceId])
            )[0].status,
            "PAID",
          );
          assert.equal(
            (
              await api(
                "workspace",
                {
                  action: "void",
                  id: first.data.result.id,
                  storeId: storeIds[0],
                },
                owner,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await query(
                "SELECT status,amount_paid FROM invoices WHERE id=?",
                [invoiceId],
              )
            )[0].status,
            "CANCELLED",
          );
          assert.equal(
            (
              await query(
                "SELECT status FROM invoice_payments WHERE invoice_id=?",
                [invoiceId],
              )
            )[0].status,
            "REVERSED",
          );
        },
      );
      await t.test(
        "search respects permissions and assigned stores",
        async () => {
          const r = await api(
            `search?q=Report&storeId=${storeIds[1]}`,
            null,
            worker,
          );
          assert.equal(r.status, 200);
          assert.ok(r.data.results.some((r) => r.id === productId));
          assert.ok(
            r.data.results.every((r) => r.destination !== "Team & access"),
          );
        },
      );
    } finally {
      for (const id of storeIds) {
        await query(
          "DELETE p FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id WHERE i.store_id=?",
          [id],
        );
        await query(
          "DELETE x FROM invoice_items x JOIN invoices i ON i.id=x.invoice_id WHERE i.store_id=?",
          [id],
        );
        await query("DELETE FROM invoices WHERE store_id=?", [id]);
        await query(
          "DELETE si FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.store_id=?",
          [id],
        );
        await query("DELETE FROM stock_movements WHERE store_id=?", [id]);
        await query("DELETE FROM sales WHERE store_id=?", [id]);
        await query("DELETE FROM products WHERE store_id=?", [id]);
        await query("DELETE FROM customers WHERE store_id=?", [id]);
      }
      for (const id of userIds) {
        await query("DELETE FROM audit_logs WHERE user_id=?", [id]);
        await query("DELETE FROM users WHERE id=?", [id]);
      }
      await query("DELETE FROM role_policies WHERE code=?", [customRole]);
      for (const id of storeIds)
        await query("DELETE FROM stores WHERE id=?", [id]);
      for (const e of emails)
        await query("DELETE FROM login_limits WHERE limit_key=?", [
          createHash("sha256").update(e.toLowerCase()).digest("hex"),
        ]);
      await db.end();
    }
  },
);
