import { NextRequest, NextResponse } from "next/server";
import { rows } from "@/lib/db";
import { requireUser, storeScope, apiError } from "@/lib/server-access";
import { can } from "@/lib/permissions";
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(),
      storeId = storeScope(user, req),
      q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
    if (q.length < 2) return NextResponse.json({ results: [] });
    const like = `%${q}%`;
    const results = await Promise.all([
      can(user, "products.view")
        ? rows(
            "SELECT id,name AS title,sku AS subtitle,'Products' AS destination FROM products WHERE store_id=? AND active=1 AND (name LIKE ? OR sku LIKE ?) LIMIT 5",
            [storeId, like, like],
          )
        : [],
      can(user, "customers.view")
        ? rows(
            "SELECT id,name AS title,email AS subtitle,'Customers' AS destination FROM customers WHERE store_id=? AND (name LIKE ? OR email LIKE ? OR phone LIKE ?) LIMIT 5",
            [storeId, like, like, like],
          )
        : [],
      can(user, "sales.view")
        ? rows(
            "SELECT s.id,CONCAT('Receipt #',s.id) AS title,COALESCE(c.name,'Walk-in customer') AS subtitle,'Sales history' AS destination FROM sales s LEFT JOIN customers c ON c.id=s.customer_id WHERE s.store_id=? AND (CAST(s.id AS CHAR) LIKE ? OR c.name LIKE ?) ORDER BY s.id DESC LIMIT 5",
            [storeId, like, like],
          )
        : [],
      can(user, "invoices.view")
        ? rows(
            "SELECT id,invoice_number AS title,customer_name AS subtitle,'Billing & invoices' AS destination FROM invoices WHERE store_id=? AND (invoice_number LIKE ? OR customer_name LIKE ?) ORDER BY id DESC LIMIT 5",
            [storeId, like, like],
          )
        : [],
      user.role === "SUPER_ADMIN"
        ? rows(
            "SELECT id,name AS title,email AS subtitle,'Team & access' AS destination FROM users WHERE name LIKE ? OR email LIKE ? LIMIT 5",
            [like, like],
          )
        : [],
    ]);
    return NextResponse.json({ results: results.flat() });
  } catch (e) {
    return apiError(e);
  }
}
