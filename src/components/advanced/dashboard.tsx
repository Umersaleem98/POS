"use client";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ShoppingBag,
  Package,
  Wallet,
  Activity,
  Receipt,
  Layers,
  Users,
  ShieldCheck,
  ChartNoAxesCombined,
} from "lucide-react";
import type { WorkspaceData } from "@/lib/types";
import type { DashboardData } from "@/lib/advanced-types";
import { can } from "@/lib/permissions";
import { SalesTable, ProductIcon } from "../catalog-ui";
import { money, day, Loading, RevenueChart } from "./shared";
function sample(data: WorkspaceData): DashboardData {
  const sales = data.sales.filter((s) => s.status === "COMPLETED"),
    today = day(new Date()),
    yesterday = day(new Date(Date.now() - 86400000));
  return {
    stats: {
      todayRevenue: sales
        .filter((s) => day(s.createdAt) === today)
        .reduce((n, s) => n + s.total, 0),
      todaySales: sales.filter((s) => day(s.createdAt) === today).length,
      yesterdayRevenue: sales
        .filter((s) => day(s.createdAt) === yesterday)
        .reduce((n, s) => n + s.total, 0),
      totalRevenue: sales.reduce((n, s) => n + s.total, 0),
      totalSales: sales.length,
    },
    daily: Array.from({ length: 30 }, (_, i) => {
      const date = day(new Date(Date.now() - (29 - i) * 86400000)),
        list = sales.filter((s) => day(s.createdAt) === date);
      return {
        date,
        revenue: list.reduce((n, s) => n + s.total, 0),
        sales: list.length,
      };
    }),
    inventory: {
      products: data.products.length,
      units: data.products.reduce((n, p) => n + p.stock, 0),
      stockValue: data.products.reduce((n, p) => n + p.stock * p.cost, 0),
      lowStock: data.products.filter((p) => p.stock <= p.reorderLevel).length,
    },
    billing: { invoices: sales.length, outstanding: 0, overdue: 0 },
    topProducts: [],
    recent: data.sales.slice(0, 5),
  };
}
export default function Dashboard({
  data,
  demo,
  onNavigate,
}: {
  data: WorkspaceData;
  demo: boolean;
  onNavigate: (page: string) => void;
}) {
  const [result, setResult] = useState<DashboardData | null>(null),
    [days, setDays] = useState(7),
    [error, setError] = useState("");
  useEffect(() => {
    if (demo) {
      setResult(sample(data));
      return;
    }
    const controller = new AbortController();
    setResult(null);
    fetch(`/api/dashboard?storeId=${data.storeId}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setResult(j);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [data, demo]);
  if (error) return <div className="error">{error}</div>;
  if (!result) return <Loading />;
  const { stats, inventory, billing } = result;
  const change = stats.yesterdayRevenue
    ? ((stats.todayRevenue - stats.yesterdayRevenue) / stats.yesterdayRevenue) *
      100
    : null;
  const points = Array.from({ length: days }, (_, i) => {
    const date = day(new Date(Date.now() - (days - 1 - i) * 86400000));
    return {
      date,
      revenue: result.daily.find((p) => p.date === date)?.revenue || 0,
    };
  });
  const low = data.products.filter((p) => p.stock <= p.reorderLevel);
  const actions = [
    {
      title: "Start a new sale",
      sub: "Open your checkout",
      page: "Point of sale",
      icon: ShoppingBag,
      permission: "sales.create",
    },
    {
      title: "Create an invoice",
      sub: "Bill a customer",
      page: "Billing & invoices",
      icon: Receipt,
      permission: "invoices.create",
    },
    {
      title: "Manage inventory",
      sub: "Keep stock healthy",
      page: "Inventory",
      icon: Layers,
      permission: "inventory.view",
    },
    {
      title: "Explore reports",
      sub: "Understand your sales",
      page: "Reports",
      icon: ChartNoAxesCombined,
      permission: "reports.view",
    },
  ] as const;
  return (
    <div className="advanced-dashboard">
      <section className="dashboard-hero">
        <div>
          <span className="hero-eyebrow">
            <span className="online-dot" /> YOUR RETAIL COMMAND CENTER
          </span>
          <h2>
            Clear insights.
            <br />
            Confident decisions.
          </h2>
          <p>Sales, stock and cash flow — connected in one workspace.</p>
          <div className="hero-tags">
            <span>
              <ShieldCheck size={13} />{" "}
              {data.user.roleName ||
                data.roles?.find((r) => r.code === data.user.role)?.name ||
                data.user.role.replaceAll("_", " ")}
            </span>
            <span>
              <Activity size={13} /> Live store insights
            </span>
          </div>
        </div>
        <div className="hero-metric">
          <span>REVENUE TODAY</span>
          <strong>{money(stats.todayRevenue)}</strong>
          <div className="hero-change">
            {change !== null ? (
              <>
                <ArrowUpRight size={15} />
                {change >= 0 ? "+" : ""}
                {change.toFixed(1)}% vs. yesterday
              </>
            ) : (
              <>{stats.todaySales} completed transactions today</>
            )}
          </div>
          {can(data.user, "sales.create") && (
            <button onClick={() => onNavigate("Point of sale")}>
              Open checkout <ArrowRight size={16} />
            </button>
          )}
        </div>
        <div className="hero-decoration" />
      </section>
      <div className="advanced-kpis">
        {[
          {
            label: "Total revenue",
            value: money(stats.totalRevenue),
            sub: `${stats.totalSales} completed transactions`,
            icon: Wallet,
            color: "blue",
          },
          {
            label: "Inventory units",
            value: String(inventory.units),
            sub: `${inventory.products} active products`,
            icon: Package,
            color: "purple",
          },
          {
            label: can(data.user, "invoices.view")
              ? "Outstanding invoices"
              : "Active products",
            value: can(data.user, "invoices.view")
              ? money(billing.outstanding)
              : String(inventory.products),
            sub: can(data.user, "invoices.view")
              ? `${billing.overdue} overdue invoices`
              : "Ready for your next sale",
            icon: Receipt,
            color: "teal",
          },
          {
            label: "Stock alerts",
            value: String(inventory.lowStock),
            sub: inventory.lowStock
              ? "Products need replenishment"
              : "Your stock levels look healthy",
            icon: Layers,
            color: "orange",
          },
        ].map((k) => (
          <div className="advanced-kpi" key={k.label}>
            <span className={`kpi-icon ${k.color}`}>
              <k.icon size={21} />
            </span>
            <span className="kpi-label">{k.label}</span>
            <strong>{k.value}</strong>
            <small>{k.sub}</small>
          </div>
        ))}
      </div>
      <div className="advanced-grid">
        <section className="panel revenue-panel">
          <div className="panel-title">
            <div>
              <h2>Revenue performance</h2>
              <p>Every completed sale, across the full database</p>
            </div>
            <div className="segmented">
              {[7, 30].map((n) => (
                <button
                  key={n}
                  className={days === n ? "active" : ""}
                  onClick={() => setDays(n)}
                >
                  {n} days
                </button>
              ))}
            </div>
          </div>
          <div className="chart-summary">
            <strong>{money(points.reduce((n, p) => n + p.revenue, 0))}</strong>
            <span>
              <i />
              Net revenue · Last {days} days
            </span>
          </div>
          <RevenueChart points={points} />
        </section>
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Your next move</h2>
              <p>Quick access to the work that matters</p>
            </div>
          </div>
          {actions
            .filter((a) => can(data.user, a.permission))
            .map((a) => (
              <button
                className="advanced-quick"
                key={a.title}
                onClick={() => onNavigate(a.page)}
              >
                <span className="quick-icon">
                  <a.icon size={21} />
                </span>
                <div>
                  <strong>{a.title}</strong>
                  <small>{a.sub}</small>
                </div>
                <ArrowUpRight size={17} />
              </button>
            ))}
          {data.user.role === "SUPER_ADMIN" && (
            <button
              className="advanced-quick"
              onClick={() => onNavigate("Team & access")}
            >
              <span className="quick-icon">
                <Users size={21} />
              </span>
              <div>
                <strong>Manage your team</strong>
                <small>Accounts, roles and responsibilities</small>
              </div>
              <ArrowUpRight size={17} />
            </button>
          )}
        </section>
      </div>
      <div className="advanced-grid lower">
        {can(data.user, "sales.view") && (
          <section className="panel">
            <div className="panel-title">
              <div>
                <h2>Latest transactions</h2>
                <p>Your store’s latest activity</p>
              </div>
              <button
                className="text-button"
                onClick={() => onNavigate("Sales history")}
              >
                View all <ArrowRight size={14} />
              </button>
            </div>
            <SalesTable sales={result.recent} />
          </section>
        )}
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>
                Inventory health{" "}
                <span className="badge amber">{inventory.lowStock}</span>
              </h2>
              <p>Stay a step ahead of your next stockout</p>
            </div>
          </div>
          {low.length ? (
            low.slice(0, 4).map((p) => (
              <div className="stock-row" key={p.id}>
                <ProductIcon p={p} />
                <div>
                  <strong>{p.name}</strong>
                  <small>Reorder level: {p.reorderLevel}</small>
                </div>
                <span className="badge amber">{p.stock} left</span>
              </div>
            ))
          ) : (
            <div className="healthy-state">
              <ShieldCheck size={32} />
              <strong>Looking good.</strong>
              <p>No low-stock products in this store.</p>
            </div>
          )}
          {can(data.user, "inventory.view") && (
            <button
              className="panel-footer"
              onClick={() => onNavigate("Inventory")}
            >
              View inventory <ArrowRight size={14} />
            </button>
          )}
        </section>
      </div>
      {can(data.user, "reports.view") && result.topProducts.length > 0 && (
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Top performing products</h2>
              <p>Gross item revenue before sale discounts · Last 30 days</p>
            </div>
          </div>
          <div className="top-product-grid">
            {result.topProducts.map((p, i) => (
              <div className="top-product" key={p.name}>
                <span>0{i + 1}</span>
                <div>
                  <strong>{p.name}</strong>
                  <small>{p.quantity} units sold</small>
                </div>
                <b>{money(p.revenue)}</b>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
