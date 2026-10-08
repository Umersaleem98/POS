import { z } from "zod";
export const currencySchema = z
  .number()
  .min(0)
  .max(10000000)
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-7,
    "Use at most two decimal places",
  );
export const passwordSchema = z
  .string()
  .min(10)
  .max(72)
  .refine(
    (s) => new TextEncoder().encode(s).length <= 72,
    "Password must be at most 72 UTF-8 bytes",
  );
export const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().min(1).max(60),
  category: z.string().trim().min(1).max(80),
  price: z.coerce.number().pipe(currencySchema),
  cost: z.coerce.number().pipe(currencySchema),
  stock: z.coerce.number().int().min(0).max(1000000),
  reorderLevel: z.coerce.number().int().min(0).max(1000000),
  color: z.string().max(30).default("blue"),
  storeId: z.coerce.number().int().positive().optional(),
});
export const customerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.union([z.email(), z.literal("")]).default(""),
  phone: z.string().trim().max(30),
  storeId: z.coerce.number().int().positive().optional(),
});
export const userSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email(),
  password: passwordSchema,
  role: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/),
  storeId: z.coerce.number().int().positive().nullable(),
});
export const saleSchema = z
  .object({
    items: z
      .array(
        z.object({
          productId: z.number().int().positive(),
          quantity: z.number().int().positive().max(10000),
        }),
      )
      .min(1)
      .max(100),
    payment: z.enum(["Cash", "Card", "Transfer"]),
    customerId: z.number().int().positive().nullable(),
    discount: currencySchema.default(0),
    requestKey: z.uuid().optional(),
    storeId: z.number().int().positive().optional(),
  })
  .refine(
    (v) => new Set(v.items.map((i) => i.productId)).size === v.items.length,
    "Duplicate products are not allowed",
  );
