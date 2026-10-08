export type InvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
};
export function invoiceTotals(
  items: InvoiceLine[],
  discount: number,
  taxRate: number,
) {
  const subtotal = items.reduce(
    (sum, i) => sum + Math.round(i.unitPrice * 100) * i.quantity,
    0,
  );
  const discountCents = Math.round(discount * 100);
  if (discountCents < 0 || discountCents > subtotal)
    throw new Error("Discount exceeds subtotal");
  const tax = Math.round(((subtotal - discountCents) * taxRate) / 100);
  return {
    subtotal: subtotal / 100,
    discount: discountCents / 100,
    tax: tax / 100,
    total: (subtotal - discountCents + tax) / 100,
  };
}
export function paymentState(total: number, paid: number, amount: number) {
  const totalCents = Math.round(total * 100),
    paidCents = Math.round(paid * 100),
    amountCents = Math.round(amount * 100);
  if (amountCents <= 0 || amountCents > totalCents - paidCents)
    throw new Error(
      "Payment must be positive and cannot exceed the outstanding balance",
    );
  const amountPaid = (paidCents + amountCents) / 100;
  return {
    amountPaid,
    status: paidCents + amountCents === totalCents ? "PAID" : "PARTIAL",
  };
}
