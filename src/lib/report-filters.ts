import { z } from "zod";
export const reportFilterSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    q: z.string().max(100).default(""),
    payment: z.enum(["ALL", "Cash", "Card", "Transfer"]).default("ALL"),
    status: z.enum(["ALL", "COMPLETED", "VOID"]).default("ALL"),
    min: z.coerce.number().min(0).max(1000000000000).default(0),
    max: z.coerce.number().min(0).max(1000000000000).default(1000000000000),
    sort: z.enum(["newest", "oldest", "highest", "lowest"]).default("newest"),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
  })
  .refine(
    (p) => p.from <= p.to && p.min <= p.max,
    "Date or amount range is invalid",
  )
  .refine(
    (p) =>
      [p.from, p.to].every(
        (s) =>
          !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s,
      ),
    "Invalid date",
  );
export type ReportFilters = z.infer<typeof reportFilterSchema>;
export function reportWhere(filters: ReportFilters, storeId: number) {
  const start = new Date(`${filters.from}T00:00:00+05:00`)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const end = new Date(Date.parse(`${filters.to}T00:00:00+05:00`) + 86400000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const clauses = [
    "s.store_id=?",
    "s.created_at>=?",
    "s.created_at<?",
    "s.total>=?",
    "s.total<=?",
  ];
  const values: (string | number)[] = [
    storeId,
    start,
    end,
    filters.min,
    filters.max,
  ];
  if (filters.payment !== "ALL") {
    clauses.push("s.payment=?");
    values.push(filters.payment);
  }
  if (filters.status !== "ALL") {
    clauses.push("s.status=?");
    values.push(filters.status);
  }
  if (filters.q) {
    clauses.push(
      "(CAST(s.id AS CHAR) LIKE ? OR COALESCE(c.name,'Walk-in customer') LIKE ? OR u.name LIKE ? OR EXISTS(SELECT 1 FROM sale_items xi JOIN products xp ON xp.id=xi.product_id WHERE xi.sale_id=s.id AND (xi.product_name LIKE ? OR xp.sku LIKE ?)))",
    );
    values.push(...Array(5).fill(`%${filters.q}%`));
  }
  return { sql: clauses.join(" AND "), values };
}
