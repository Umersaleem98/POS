import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceTotals, paymentState } from "../src/lib/billing.ts";
import { reportFilterSchema, reportWhere } from "../src/lib/report-filters.ts";
import { can, defaultRoles } from "../src/lib/permissions.ts";
import { csvDocument } from "../src/lib/exports.ts";
test("invoice calculations round currency consistently after discounts and tax", () => {
  assert.deepEqual(
    invoiceTotals(
      [
        { description: "A", quantity: 3, unitPrice: 100.1 },
        { description: "B", quantity: 2, unitPrice: 19.99 },
      ],
      10.28,
      10,
    ),
    { subtotal: 340.28, discount: 10.28, tax: 33, total: 363 },
  );
  assert.throws(() =>
    invoiceTotals([{ description: "A", quantity: 1, unitPrice: 1 }], 2, 0),
  );
});
test("payment state prevents overpayment and tracks exact partial and full balances", () => {
  assert.deepEqual(paymentState(363, 0, 100.55), {
    amountPaid: 100.55,
    status: "PARTIAL",
  });
  assert.deepEqual(paymentState(363, 100.55, 262.45), {
    amountPaid: 363,
    status: "PAID",
  });
  assert.throws(() => paymentState(363, 100, 264));
  assert.throws(() => paymentState(363, 100, 0));
});
test("cashier and user roles cannot mutate stock, void sales or read reports", () => {
  for (const code of ["USER", "CASHIER"]) {
    const role = defaultRoles.find((r) => r.code === code);
    const user = { role: code, permissions: role.permissions };
    assert.ok(can(user, "sales.create"));
    for (const permission of ["inventory.write", "sales.void", "reports.view"])
      assert.equal(can(user, permission), false);
  }
});
test("report date boundaries respect the Karachi business day and reject invalid ranges", () => {
  const filters = reportFilterSchema.parse({
    from: "2026-10-09",
    to: "2026-10-09",
    q: "test",
  });
  const query = reportWhere(filters, 7);
  assert.deepEqual(query.values.slice(0, 3), [
    7,
    "2026-10-08 19:00:00",
    "2026-10-09 19:00:00",
  ]);
  assert.equal(
    reportFilterSchema.safeParse({ from: "2026-02-30", to: "2026-03-01" })
      .success,
    false,
  );
  assert.equal(
    reportFilterSchema.safeParse({ from: "2026-10-10", to: "2026-10-09" })
      .success,
    false,
  );
});
test("CSV exports quote values and prevent formula injection after whitespace", () => {
  const csv = csvDocument([
    ['  =HYPERLINK("bad")', "Hello, world", "line\nbreak"],
  ]);
  assert.ok(csv.includes('"\'  =HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"Hello, world"'));
});

test("money validation rejects sub-cent values rather than storing a price inconsistent with a bill", async () => {
  const { currencySchema } = await import("../src/lib/schemas.ts");
  assert.equal(currencySchema.safeParse(10.001).success, false);
  assert.equal(currencySchema.safeParse(10.01).success, true);
});
