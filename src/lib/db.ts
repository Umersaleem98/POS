import mysql from "mysql2/promise";
const globalDB = globalThis as unknown as { posPoolV2?: mysql.Pool };
export const db =
  globalDB.posPoolV2 ??
  mysql.createPool({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "pos",
    connectionLimit: 10,
    decimalNumbers: true,
    timezone: "Z",
  });
if (!globalDB.posPoolV2)
  db.pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'");
  });
if (process.env.NODE_ENV !== "production") globalDB.posPoolV2 = db;
export type SqlValue = string | number | boolean | null | Date;
export async function rows<T = Record<string, unknown>>(
  sql: string,
  values: SqlValue[] = [],
): Promise<T[]> {
  const [result] = await db.execute(sql, values);
  return result as T[];
}
