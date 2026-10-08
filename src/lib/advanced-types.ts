import type { Sale } from "./types";
export type ReportData = {
  summary: {
    totalRows: number;
    revenue: number;
    cost: number;
    sales: number;
    voided: number;
    discounts: number;
    profit: number;
    average: number;
  };
  daily: { date: string; revenue: number; sales: number }[];
  topProducts: { name: string; quantity: number; grossRevenue: number }[];
  payments: { method: string; revenue: number; sales: number }[];
  sales: (Sale & { invoiceId?: number; invoiceNumber?: string })[];
  total: number;
  page: number;
  pageSize: number;
};
export type DashboardData = {
  stats: {
    todayRevenue: number;
    todaySales: number;
    yesterdayRevenue: number;
    totalRevenue: number;
    totalSales: number;
  };
  daily: { date: string; revenue: number; sales: number }[];
  inventory: {
    products: number;
    units: number;
    stockValue: number;
    lowStock: number;
  };
  billing: { invoices: number; outstanding: number; overdue: number };
  topProducts: { name: string; quantity: number; revenue: number }[];
  recent: Sale[];
};
export type InvoiceRecord = {
  id: number;
  saleId: number | null;
  invoiceNumber: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  senderName?: string;
  senderAddress?: string;
  total: number;
  subtotal?: number;
  discount?: number;
  tax?: number;
  taxRate?: number;
  amountPaid: number;
  status: "ISSUED" | "PARTIAL" | "PAID" | "CANCELLED";
  dueDate: string;
  createdAt: string;
  notes?: string;
};
export type InvoiceDetail = {
  invoice: InvoiceRecord;
  items: {
    id?: number;
    description: string;
    quantity: number;
    unitPrice: number;
  }[];
  payments: {
    id?: number;
    amount: number;
    method: string;
    reference: string;
    status: string;
    createdAt: string;
  }[];
};
export type InvoiceList = {
  invoices: InvoiceRecord[];
  total: number;
  page: number;
  summary: {
    billed: number;
    collected: number;
    outstanding: number;
    overdue: number;
  };
};
