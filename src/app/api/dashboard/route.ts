import { NextRequest, NextResponse } from "next/server";
import { rows } from "@/lib/db";
import { requireUser, storeScope, apiError } from "@/lib/server-access";
import { can } from "@/lib/permissions";
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser("overview.view"),
      storeId = storeScope(user, req);
    const today = "DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 HOUR))";
    const localDate = "DATE(DATE_ADD(s.created_at,INTERVAL 5 HOUR))";
    const [stats, daily, inventory, billing, topProducts, recent] =
      await Promise.all([
        rows(
          `SELECT COALESCE(SUM(IF(${localDate}=${today} AND s.status='COMPLETED',s.total,0)),0) AS todayRevenue,COALESCE(SUM(${localDate}=${today} AND s.status='COMPLETED'),0) AS todaySales,COALESCE(SUM(IF(${localDate}=DATE_SUB(${today},INTERVAL 1 DAY) AND s.status='COMPLETED',s.total,0)),0) AS yesterdayRevenue,COALESCE(SUM(IF(s.status='COMPLETED',s.total,0)),0) AS totalRevenue,COALESCE(SUM(s.status='COMPLETED'),0) AS totalSales FROM sales s WHERE s.store_id=?`,
          [storeId],
        ),
        rows(
          `SELECT DATE_FORMAT(DATE_ADD(s.created_at,INTERVAL 5 HOUR),'%Y-%m-%d') AS date,SUM(s.total) AS revenue,COUNT(*) AS sales FROM sales s WHERE s.store_id=? AND s.status='COMPLETED' AND s.created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY) GROUP BY date ORDER BY date`,
          [storeId],
        ),
        rows(
          "SELECT COUNT(*) AS products,COALESCE(SUM(stock),0) AS units,COALESCE(SUM(stock*cost),0) AS stockValue,COALESCE(SUM(stock<=reorder_level),0) AS lowStock FROM products WHERE store_id=? AND active=1",
          [storeId],
        ),
        can(user, "invoices.view")
          ? rows(
              `SELECT COUNT(*) AS invoices,COALESCE(SUM(IF(status IN ('ISSUED','PARTIAL'),total-amount_paid,0)),0) AS outstanding,COALESCE(SUM(status IN ('ISSUED','PARTIAL') AND due_date<${today}),0) AS overdue FROM invoices WHERE store_id=?`,
              [storeId],
            )
          : Promise.resolve([{ invoices: 0, outstanding: 0, overdue: 0 }]),
        can(user, "reports.view")
          ? rows(
              "SELECT si.product_name AS name,SUM(si.quantity) AS quantity,SUM(si.quantity*si.unit_price) AS revenue FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.store_id=? AND s.status='COMPLETED' AND s.created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY) GROUP BY si.product_id,si.product_name ORDER BY revenue DESC LIMIT 4",
              [storeId],
            )
          : Promise.resolve([]),
        can(user, "sales.view")
          ? rows(
              "SELECT s.id,s.total,s.payment,s.status,s.created_at AS createdAt,COALESCE(c.name,'Walk-in customer') AS customer,u.name AS cashier FROM sales s LEFT JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=s.user_id WHERE s.store_id=? ORDER BY s.id DESC LIMIT 5",
              [storeId],
            )
          : Promise.resolve([]),
      ]);
    return NextResponse.json({
      stats: stats[0],
      daily,
      inventory: {
        ...inventory[0],
        stockValue:
          can(user, "inventory.view") || can(user, "reports.view")
            ? inventory[0].stockValue
            : 0,
      },
      billing: billing[0],
      topProducts,
      recent,
    });
  } catch (e) {
    return apiError(e);
  }
}
