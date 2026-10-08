import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { randomUUID, createHash } from "node:crypto";

test(
  "live MySQL API: permissions, checkout concurrency and void restoration",
  { skip: process.env.POS_INTEGRATION !== "1" },
  async (t) => {
    const origin = process.env.POS_TEST_URL || "http://127.0.0.1:3000";
    const db = await mysql.createConnection({
      host: process.env.MYSQL_HOST || "127.0.0.1",
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE || "pos",
      decimalNumbers: true,
    });
    const marker = randomUUID();
    const email = `test-${marker}@example.com`;
    const ownerEmail = `owner-${marker}@example.com`;
    const password = randomUUID();
    const storeIds = [];
    const userIds = [];
    async function query(sql, values = []) {
      return (await db.execute(sql, values))[0];
    }
    async function api(path, body, cookie, customOrigin = origin) {
      const r = await fetch(`${origin}/api/${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          Origin: customOrigin,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return {
        status: r.status,
        data: await r.json(),
        cookie: r.headers.get("set-cookie")?.split(";")[0],
      };
    }
    try {
      for (const name of ["Integration A", "Integration B"])
        storeIds.push(
          (
            await query("INSERT INTO stores(name) VALUES (?)", [
              `${name} ${marker}`,
            ])
          ).insertId,
        );
      for (const [e, role] of [
        [email, "ADMIN"],
        [ownerEmail, "SUPER_ADMIN"],
      ])
        userIds.push(
          (
            await query(
              "INSERT INTO users(name,email,password_hash,role,store_id) VALUES (?,?,?,?,?)",
              [
                "Integration tester",
                e,
                await bcrypt.hash(password, 12),
                role,
                storeIds[0],
              ],
            )
          ).insertId,
        );
      const productId = (
        await query(
          "INSERT INTO products(store_id,name,sku,category,price,cost,stock) VALUES (?,?,?,?,?,?,?)",
          [storeIds[0], "Integration item", marker, "Test", 123.45, 50, 3],
        )
      ).insertId;
      const foreignId = (
        await query(
          "INSERT INTO products(store_id,name,sku,category,price,cost,stock) VALUES (?,?,?,?,?,?,?)",
          [storeIds[1], "Foreign item", marker, "Test", 50, 20, 10],
        )
      ).insertId;
      const login = await api("auth", { email, password });
      assert.equal(login.status, 200);
      assert.ok(login.cookie);
      const cookie = login.cookie;
      await t.test("unauthenticated reads are rejected", async () =>
        assert.equal((await api("workspace")).status, 401),
      );
      await t.test("admin reads ignore forged store scope", async () => {
        const r = await api(`workspace?storeId=${storeIds[1]}`, null, cookie);
        assert.equal(r.status, 200);
        assert.equal(r.data.storeId, storeIds[0]);
        assert.ok(r.data.products.every((p) => p.id !== foreignId));
        assert.equal(r.data.users.length, 0);
      });
      await t.test("admin cannot create stores or users", async () => {
        assert.equal(
          (
            await api(
              "workspace",
              { action: "store", name: "Unauthorized", address: "" },
              cookie,
            )
          ).status,
          403,
        );
        assert.equal(
          (await api("workspace", { action: "user" }, cookie)).status,
          403,
        );
      });
      await t.test("mutating requests reject foreign origins", async () =>
        assert.equal(
          (
            await api(
              "workspace",
              { action: "stock", productId, quantity: 1, reason: "Test" },
              cookie,
              "https://foreign.example",
            )
          ).status,
          403,
        ),
      );
      await t.test("admin cannot sell another store’s product", async () =>
        assert.equal(
          (
            await api(
              "workspace",
              {
                action: "sale",
                items: [{ productId: foreignId, quantity: 1 }],
                payment: "Cash",
                customerId: null,
                discount: 0,
                storeId: storeIds[1],
              },
              cookie,
            )
          ).status,
          400,
        ),
      );
      await t.test("duplicate sale lines are rejected", async () =>
        assert.equal(
          (
            await api(
              "workspace",
              {
                action: "sale",
                items: [
                  { productId, quantity: 1 },
                  { productId, quantity: 1 },
                ],
                payment: "Cash",
                customerId: null,
                discount: 0,
              },
              cookie,
            )
          ).status,
          400,
        ),
      );
      let saleId;
      await t.test(
        "concurrent checkouts cannot oversell and ignore supplied totals",
        async () => {
          const body = {
            action: "sale",
            items: [{ productId, quantity: 2 }],
            payment: "Cash",
            customerId: null,
            discount: 0,
            total: 0,
          };
          const results = await Promise.all([
            api("workspace", body, cookie),
            api("workspace", body, cookie),
          ]);
          assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
          const sale = results.find((r) => r.status === 200).data.result;
          saleId = sale.id;
          assert.equal(sale.total, 246.9);
          assert.equal(
            (
              await query("SELECT stock FROM products WHERE id=?", [productId])
            )[0].stock,
            1,
          );
        },
      );
      await t.test("void restores stock exactly once", async () => {
        assert.equal(
          (await api("workspace", { action: "void", id: saleId }, cookie))
            .status,
          200,
        );
        assert.equal(
          (await query("SELECT stock FROM products WHERE id=?", [productId]))[0]
            .stock,
          3,
        );
        assert.equal(
          (await api("workspace", { action: "void", id: saleId }, cookie))
            .status,
          400,
        );
        assert.equal(
          (await query("SELECT stock FROM products WHERE id=?", [productId]))[0]
            .stock,
          3,
        );
      });
      await t.test(
        "stock adjustment cannot make inventory negative",
        async () =>
          assert.equal(
            (
              await api(
                "workspace",
                {
                  action: "stock",
                  productId,
                  quantity: -4,
                  reason: "Test count",
                },
                cookie,
              )
            ).status,
            400,
          ),
      );
      await t.test("super admin sees both stores", async () => {
        const r = await api("auth", { email: ownerEmail, password });
        const workspace = await api(
          `workspace?storeId=${storeIds[1]}`,
          null,
          r.cookie,
        );
        assert.equal(workspace.status, 200);
        assert.equal(workspace.data.storeId, storeIds[1]);
        assert.ok(workspace.data.products.some((p) => p.id === foreignId));
      });
      await t.test(
        "deactivated admin loses access with an existing session",
        async () => {
          await query("UPDATE users SET active=0 WHERE id=?", [userIds[0]]);
          assert.equal((await api("workspace", null, cookie)).status, 401);
        },
      );
    } finally {
      // Delete only this run's uniquely identified fixtures, preserving all user data.
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
      for (const id of storeIds)
        await query("DELETE FROM stores WHERE id=?", [id]);
      for (const e of [email, ownerEmail])
        await query("DELETE FROM login_limits WHERE limit_key=?", [
          createHash("sha256").update(e.toLowerCase()).digest("hex"),
        ]);
      await db.end();
    }
  },
);
