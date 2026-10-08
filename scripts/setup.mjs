import "dotenv/config";
import { migrate } from "./migrate.mjs";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { readFile } from "node:fs/promises";
const name = process.env.MYSQL_DATABASE || "pos";
if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error("Invalid database name");
if (!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD.length < 10)
  throw new Error("Set SEED_PASSWORD to at least 10 characters in .env");
const db = await mysql.createConnection({
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  multipleStatements: true,
  timezone: "Z",
});
try {
  await db.query(
    `CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await db.query(`USE \`${name}\``);
  await db.query("SET time_zone='+00:00'");
  await db.query(
    await readFile(new URL("../database/schema.sql", import.meta.url), "utf8"),
  );
  await migrate(db);
  const [stores] = await db.execute(
    "SELECT id FROM stores ORDER BY id LIMIT 1",
  );
  const storeId = stores.length
    ? stores[0].id
    : (
        await db.execute("INSERT INTO stores(name,address) VALUES (?,?)", [
          "Main store",
          "Karachi, Pakistan",
        ])
      )[0].insertId;
  await db.execute(
    "INSERT IGNORE INTO users(name,email,password_hash,role,store_id) VALUES (?,?,?,?,?)",
    [
      "Store owner",
      process.env.SEED_EMAIL || "owner@pos.local",
      await bcrypt.hash(process.env.SEED_PASSWORD, 12),
      "SUPER_ADMIN",
      storeId,
    ],
  );
  const [count] = await db.execute("SELECT COUNT(*) AS count FROM products");
  if (!count[0].count)
    for (const p of [
      ["Everyday backpack", "ACC-001", "Accessories", 4500, 2800, 24, "blue"],
      [
        "Ceramic coffee mug",
        "HOM-001",
        "Home & living",
        850,
        400,
        48,
        "orange",
      ],
      [
        "Wireless headphones",
        "TEC-001",
        "Electronics",
        8900,
        6200,
        16,
        "purple",
      ],
      ["Classic cotton tee", "APP-001", "Apparel", 1800, 950, 36, "green"],
      ["Desk notebook", "STA-001", "Stationery", 650, 280, 8, "yellow"],
      ["Steel water bottle", "ACC-002", "Accessories", 2200, 1200, 4, "teal"],
    ])
      await db.execute(
        "INSERT INTO products(store_id,name,sku,category,price,cost,stock,color) VALUES (?,?,?,?,?,?,?,?)",
        [storeId, ...p],
      );
  console.log(
    "POS database ready. Sign in using SEED_EMAIL and SEED_PASSWORD from .env.",
  );
} finally {
  await db.end();
}
