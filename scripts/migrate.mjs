import "dotenv/config";
import { insertInvoice } from "../src/lib/invoice-service.ts";
import mysql from "mysql2/promise";
import { defaultRoles } from "../src/lib/permissions.ts";
export async function migrate(db) {
  await db.query("ALTER TABLE users MODIFY role VARCHAR(32) NOT NULL");
  await db.query(
    "CREATE TABLE IF NOT EXISTS role_policies (code VARCHAR(32) PRIMARY KEY, name VARCHAR(80) NOT NULL, description VARCHAR(255) NOT NULL DEFAULT '', permissions JSON NOT NULL, locked BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)",
  );
  for (const role of defaultRoles)
    await db.execute(
      "INSERT IGNORE INTO role_policies(code,name,description,permissions,locked) VALUES (?,?,?,?,?)",
      [
        role.code,
        role.name,
        role.description,
        JSON.stringify(role.permissions),
        role.locked,
      ],
    );
  await db.query(`CREATE TABLE IF NOT EXISTS invoices (
 id INT AUTO_INCREMENT PRIMARY KEY, store_id INT NOT NULL, sale_id INT NULL UNIQUE, customer_id INT NULL,
 invoice_number VARCHAR(40) NOT NULL UNIQUE, customer_name VARCHAR(120) NOT NULL, customer_email VARCHAR(190) NOT NULL DEFAULT '', customer_phone VARCHAR(30) NOT NULL DEFAULT '',
 sender_name VARCHAR(120) NOT NULL, sender_address VARCHAR(255) NOT NULL DEFAULT '',
 subtotal DECIMAL(14,2) NOT NULL, discount DECIMAL(14,2) NOT NULL DEFAULT 0, tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0, tax DECIMAL(14,2) NOT NULL DEFAULT 0, total DECIMAL(14,2) NOT NULL,
 amount_paid DECIMAL(14,2) NOT NULL DEFAULT 0, status ENUM('ISSUED','PARTIAL','PAID','CANCELLED') NOT NULL DEFAULT 'ISSUED',
 due_date DATE NOT NULL, notes TEXT NULL, created_by INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(store_id) REFERENCES stores(id), FOREIGN KEY(sale_id) REFERENCES sales(id), FOREIGN KEY(customer_id) REFERENCES customers(id), FOREIGN KEY(created_by) REFERENCES users(id), INDEX(store_id,created_at), INDEX(store_id,status,due_date)
 ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS invoice_items (
 id INT AUTO_INCREMENT PRIMARY KEY, invoice_id INT NOT NULL, description VARCHAR(255) NOT NULL, quantity INT NOT NULL, unit_price DECIMAL(14,2) NOT NULL,
 FOREIGN KEY(invoice_id) REFERENCES invoices(id)
 ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS invoice_payments (
 id INT AUTO_INCREMENT PRIMARY KEY, invoice_id INT NOT NULL, amount DECIMAL(14,2) NOT NULL, method ENUM('Cash','Card','Transfer') NOT NULL,
 reference VARCHAR(120) NOT NULL DEFAULT '', request_key CHAR(36) NOT NULL UNIQUE, status ENUM('RECORDED','REVERSED') NOT NULL DEFAULT 'RECORDED', user_id INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(invoice_id) REFERENCES invoices(id), FOREIGN KEY(user_id) REFERENCES users(id)
 ) ENGINE=InnoDB`);
  const [columns] = await db.execute(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sales'",
  );
  if (!columns.some((c) => c.COLUMN_NAME === "request_key"))
    await db.query(
      "ALTER TABLE sales ADD COLUMN request_key CHAR(36) NULL, ADD COLUMN request_fingerprint CHAR(64) NULL, ADD UNIQUE KEY sales_request_key(request_key)",
    );
  // Backfill old receipts without changing stock or recording any new money movement.
  const [missing] = await db.query(
    "SELECT s.id FROM sales s LEFT JOIN invoices i ON i.sale_id=s.id WHERE i.id IS NULL ORDER BY s.id",
  );
  for (const entry of missing) {
    await db.beginTransaction();
    try {
      const [sales] = await db.execute(
        "SELECT s.*,st.name AS senderName,st.address AS senderAddress,COALESCE(c.name,'Walk-in customer') AS customerName,COALESCE(c.email,'') AS customerEmail,COALESCE(c.phone,'') AS customerPhone FROM sales s JOIN stores st ON st.id=s.store_id LEFT JOIN customers c ON c.id=s.customer_id WHERE s.id=? FOR UPDATE",
        [entry.id],
      );
      const sale = sales[0];
      const [exists] = await db.execute(
        "SELECT id FROM invoices WHERE sale_id=?",
        [sale.id],
      );
      if (exists.length) {
        await db.commit();
        continue;
      }
      const [lines] = await db.execute(
        "SELECT product_name,quantity,unit_price FROM sale_items WHERE sale_id=? ORDER BY id",
        [sale.id],
      );
      const dueDate = new Date(sale.created_at).toLocaleDateString("en-CA", {
        timeZone: "Asia/Karachi",
      });
      const invoice = await insertInvoice(db, {
        storeId: sale.store_id,
        saleId: sale.id,
        customerId: sale.customer_id,
        customerName: sale.customerName,
        customerEmail: sale.customerEmail,
        customerPhone: sale.customerPhone,
        senderName: sale.senderName,
        senderAddress: sale.senderAddress,
        subtotal: Number(sale.subtotal),
        discount: Number(sale.discount),
        total: Number(sale.total),
        amountPaid: Number(sale.total),
        payment: sale.payment,
        dueDate,
        userId: sale.user_id,
        items: lines.map((i) => ({
          description: i.product_name,
          quantity: i.quantity,
          unitPrice: Number(i.unit_price),
        })),
        notes:
          "Generated from an existing sale record. Store and customer contact details reflect migration-time records.",
      });
      await db.execute("UPDATE invoices SET created_at=? WHERE id=?", [
        sale.created_at,
        invoice.id,
      ]);
      if (sale.status === "VOID") {
        await db.execute(
          "UPDATE invoices SET status='CANCELLED',amount_paid=0 WHERE id=?",
          [invoice.id],
        );
        await db.execute(
          "UPDATE invoice_payments SET status='REVERSED' WHERE invoice_id=?",
          [invoice.id],
        );
      }
      await db.commit();
    } catch (e) {
      await db.rollback();
      throw e;
    }
  }
  // The invoice series uses the database ID: safe across stores and concurrent checkouts.
}
if (process.argv[1]?.endsWith("migrate.mjs")) {
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "pos",
    decimalNumbers: true,
    timezone: "Z",
  });
  try {
    await db.query("SET time_zone='+00:00'");
    await migrate(db);
    console.log(
      "Advanced POS migration complete. Existing users, passwords, sales and stock preserved.",
    );
  } finally {
    await db.end();
  }
}
