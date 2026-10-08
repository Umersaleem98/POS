import { test } from "node:test";
import assert from "node:assert/strict";
import { productSchema, saleSchema, userSchema } from "../src/lib/schemas.ts";

test("sale rejects duplicate product lines instead of overselling through duplicates", () => {
  assert.equal(
    saleSchema.safeParse({
      items: [
        { productId: 1, quantity: 4 },
        { productId: 1, quantity: 4 },
      ],
      customerId: null,
      payment: "Cash",
    }).success,
    false,
  );
});
test("sale rejects negative discount, fractional stock and unknown tender", () => {
  const base = {
    items: [{ productId: 1, quantity: 1 }],
    customerId: null,
    payment: "Cash",
  };
  for (const patch of [
    { discount: -1 },
    { items: [{ productId: 1, quantity: 1.5 }] },
    { payment: "Bitcoin" },
  ])
    assert.equal(saleSchema.safeParse({ ...base, ...patch }).success, false);
});
test("product rejects negative stock and invalid monetary inputs", () => {
  const base = {
    name: "Test item",
    sku: "TEST-1",
    category: "General",
    price: 100,
    cost: 50,
    stock: 5,
    reorderLevel: 2,
  };
  for (const patch of [
    { stock: -1 },
    { price: "NaN" },
    { stock: 1.2 },
    { price: 10000001 },
  ])
    assert.equal(productSchema.safeParse({ ...base, ...patch }).success, false);
  assert.equal(productSchema.parse({ ...base, price: "120.50" }).price, 120.5);
});
test("account creation requires a strong-length password and a valid role code", () => {
  const base = {
    name: "Test admin",
    email: "admin@example.com",
    password: "LongPassword123!",
    role: "ADMIN",
    storeId: 1,
  };
  assert.equal(
    userSchema.safeParse({ ...base, password: "short" }).success,
    false,
  );
  assert.equal(
    userSchema.safeParse({ ...base, role: "invalid role" }).success,
    false,
  );
  assert.equal(userSchema.safeParse(base).success, true);
});
