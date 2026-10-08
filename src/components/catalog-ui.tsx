import {
  Backpack,
  Coffee,
  Headphones,
  Shirt,
  BookOpen,
  Wine,
  Package,
} from "lucide-react";
import type { Product, WorkspaceData } from "@/lib/types";
const icons = [Backpack, Coffee, Headphones, Shirt, BookOpen, Wine];
const money = (n: number) =>
  `Rs. ${Number(n).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
const date = (s: string) =>
  new Date(s).toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short",
  });
export function ProductIcon({
  p,
  large = false,
}: {
  p: Product;
  large?: boolean;
}) {
  const Icon = icons[(p.id - 1) % icons.length] || Package;
  return (
    <span className={`product-icon ${p.color} ${large ? "large" : ""}`}>
      <Icon size={large ? 68 : 22} strokeWidth={large ? 1.25 : 1.7} />
    </span>
  );
}
export function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Package size={28} />
      <p>{text}</p>
    </div>
  );
}
export function SalesTable({
  sales,
  onVoid,
}: {
  sales: WorkspaceData["sales"];
  onVoid?: (id: number) => void;
}) {
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Transaction</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Status</th>
              {onVoid && (
                <>
                  <th>Date / payment</th>
                  <th>Action</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>#{String(s.id).padStart(5, "0")}</strong>
                  <small>{onVoid ? s.cashier : s.payment}</small>
                </td>
                <td>{s.customer}</td>
                <td>
                  <strong>{money(s.total)}</strong>
                </td>
                <td>
                  <span
                    className={`badge ${s.status === "COMPLETED" ? "green" : "amber"}`}
                  >
                    <span className="status-dot" />
                    {s.status === "COMPLETED" ? "Completed" : "Voided"}
                  </span>
                </td>
                {onVoid && (
                  <>
                    <td>
                      {date(s.createdAt)}
                      <small>{s.payment}</small>
                    </td>
                    <td>
                      {s.status === "COMPLETED" && (
                        <button
                          className="text-button"
                          onClick={() => onVoid(s.id)}
                        >
                          Void sale
                        </button>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!sales.length && (
        <Empty text="No transactions yet. Your first sale will appear here." />
      )}
    </>
  );
}
