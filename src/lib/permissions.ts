export const permissionGroups = {
  Dashboard: ["overview.view"],
  Products: ["products.view", "products.write"],
  Inventory: ["inventory.view", "inventory.write"],
  Customers: ["customers.view", "customers.write"],
  Sales: ["sales.view", "sales.create", "sales.void"],
  Reporting: ["reports.view", "reports.export"],
  Billing: ["invoices.view", "invoices.create", "invoices.pay"],
} as const;
export type Permission =
  (typeof permissionGroups)[keyof typeof permissionGroups][number];
export const allPermissions: Permission[] =
  Object.values(permissionGroups).flat();
export type RolePolicy = {
  code: string;
  name: string;
  description: string;
  permissions: Permission[];
  locked: boolean;
};
export const defaultRoles: RolePolicy[] = [
  {
    code: "SUPER_ADMIN",
    name: "Super admin",
    description: "All stores, accounts, role policies and business operations.",
    permissions: allPermissions,
    locked: true,
  },
  {
    code: "ADMIN",
    name: "Store admin",
    description: "Full operational control of the assigned store.",
    permissions: allPermissions,
    locked: false,
  },
  {
    code: "USER",
    name: "User",
    description: "Checkout, customer service, sales and invoice viewing.",
    permissions: [
      "overview.view",
      "products.view",
      "customers.view",
      "customers.write",
      "sales.view",
      "sales.create",
      "invoices.view",
    ],
    locked: false,
  },
  {
    code: "CASHIER",
    name: "Cashier",
    description:
      "Checkout and customer service, without inventory or reporting access.",
    permissions: [
      "products.view",
      "customers.view",
      "customers.write",
      "sales.view",
      "sales.create",
      "invoices.view",
    ],
    locked: false,
  },
  {
    code: "INVENTORY_MANAGER",
    name: "Inventory manager",
    description: "Product catalog, stock levels and stock movements.",
    permissions: [
      "overview.view",
      "products.view",
      "products.write",
      "inventory.view",
      "inventory.write",
    ],
    locked: false,
  },
  {
    code: "ACCOUNTANT",
    name: "Accountant",
    description:
      "Sales reports, invoice management and payment reconciliation.",
    permissions: [
      "overview.view",
      "sales.view",
      "customers.view",
      "reports.view",
      "reports.export",
      "invoices.view",
      "invoices.create",
      "invoices.pay",
    ],
    locked: false,
  },
];
export function can(
  user: { role: string; permissions?: Permission[] },
  permission: Permission,
) {
  return (
    user.role === "SUPER_ADMIN" || !!user.permissions?.includes(permission)
  );
}
export const pagePermission: Record<string, Permission> = {
  Overview: "overview.view",
  "Point of sale": "sales.create",
  Products: "products.view",
  Inventory: "inventory.view",
  Customers: "customers.view",
  "Sales history": "sales.view",
  Reports: "reports.view",
  "Billing & invoices": "invoices.view",
};
