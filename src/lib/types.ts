import type { User } from "./auth";
export type Product = {
  id: number;
  name: string;
  sku: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  reorderLevel: number;
  color: string;
};
export type Customer = {
  id: number;
  name: string;
  email: string;
  phone: string;
};
export type Sale = {
  id: number;
  total: number;
  subtotal: number;
  discount: number;
  payment: string;
  status: string;
  createdAt: string;
  customer: string;
  cashier: string;
};
export type Store = { id: number; name: string; address: string };
export type WorkspaceData = {
  user: User;
  storeId: number;
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  movements: {
    id: number;
    product: string;
    quantity: number;
    reason: string;
    createdAt: string;
    user: string;
  }[];
  stores: Store[];
  users: (User & { active: number; store: string })[];
  roles?: import("./permissions").RolePolicy[];
  audit: { id: number; user: string; action: string; createdAt: string }[];
};
