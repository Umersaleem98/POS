"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Download,
  FileText,
  SlidersHorizontal,
  RotateCcw,
  Wallet,
  ShoppingBag,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
} from "lucide-react";
import type { WorkspaceData } from "@/lib/types";
import type { ReportData } from "@/lib/advanced-types";
import { can } from "@/lib/permissions";
import { csvDocument } from "@/lib/exports";
import {
  day,
  date,
  money,
  SearchInput,
  Pagination,
  Loading,
  RevenueChart,
  useDebounced,
  downloadBlob,
  downloadFrom,
} from "./shared";
type Filters = {
  from: string;
  to: string;
  q: string;
  payment: string;
  status: string;
  min: string;
  max: string;
  sort: string;
};
function defaults(): Filters {
  return {
    from: day(new Date(Date.now() - 29 * 86400000)),
    to: day(new Date()),
    q: "",
    payment: "ALL",
    status: "ALL",
    min: "",
    max: "",
    sort: "newest",
  };
}
function sample(
  data: WorkspaceData,
  filters: Filters,
  page: number,
): ReportData {
  const all = data.sales
    .filter(
      (s) =>
        day(s.createdAt) >= filters.from &&
        day(s.createdAt) <= filters.to &&
        (filters.payment === "ALL" || s.payment === filters.payment) &&
        (filters.status === "ALL" || s.status === filters.status) &&
        s.total >= Number(filters.min || 0) &&
        s.total <= Number(filters.max || 1e12) &&
        `${s.id} ${s.customer} ${s.cashier}`
          .toLowerCase()
          .includes(filters.q.toLowerCase()),
    )
    .sort((a, b) =>
      filters.sort === "highest"
        ? b.total - a.total
        : filters.sort === "lowest"
          ? a.total - b.total
          : filters.sort === "oldest"
            ? a.id - b.id
            : b.id - a.id,
    );
  const completed = all.filter((s) => s.status === "COMPLETED"),
    revenue = completed.reduce((n, s) => n + s.total, 0);
  return {
    summary: {
      totalRows: all.length,
      revenue,
      cost: 0,
      sales: completed.length,
      voided: all.length - completed.length,
      discounts: completed.reduce((n, s) => n + s.discount, 0),
      profit: 0,
      average: completed.length ? revenue / completed.length : 0,
    },
    daily: [...new Set(all.map((s) => day(s.createdAt)))].sort().map((d) => ({
      date: d,
      revenue: completed
        .filter((s) => day(s.createdAt) === d)
        .reduce((n, s) => n + s.total, 0),
      sales: completed.filter((s) => day(s.createdAt) === d).length,
    })),
    topProducts: [],
    payments: ["Cash", "Card", "Transfer"].map((method) => ({
      method,
      revenue: completed
        .filter((s) => s.payment === method)
        .reduce((n, s) => n + s.total, 0),
      sales: completed.filter((s) => s.payment === method).length,
    })),
    sales: page === 0 ? all : all.slice((page - 1) * 25, page * 25),
    total: all.length,
    page,
    pageSize: 25,
  };
}
export default function Reports({
  data,
  demo,
  history = false,
  onVoid,
  onInvoice,
  initialQuery = "",
}: {
  initialQuery?: string;
  data: WorkspaceData;
  demo: boolean;
  history?: boolean;
  onVoid?: (id: number) => void;
  onInvoice?: (id: number) => void;
}) {
  const [filters, setFilters] = useState<Filters>(defaults),
    [page, setPage] = useState(1),
    [result, setResult] = useState<ReportData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [downloading, setDownloading] = useState(false),
    [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setFilters((f) => ({ ...f, q: initialQuery }));
    setPage(1);
  }, [initialQuery]);
  const queryText = useDebounced(filters.q),
    effective = useMemo(
      () => ({ ...filters, q: queryText }),
      [filters, queryText],
    );
  const query = new URLSearchParams({
    storeId: String(data.storeId),
    from: effective.from,
    to: effective.to,
    q: effective.q,
    payment: effective.payment,
    status: effective.status,
    sort: effective.sort,
    page: String(page),
    ...(effective.min ? { min: effective.min } : {}),
    ...(effective.max ? { max: effective.max } : {}),
  }).toString();
  useEffect(() => {
    if (demo) {
      setResult(sample(data, effective, page));
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/${history ? "sales" : "reports"}?${query}`, {
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
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, data, demo, history, effective, page]);
  function change(key: keyof Filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }
  function preset(days: number) {
    setFilters((f) => ({
      ...f,
      from: day(new Date(Date.now() - (days - 1) * 86400000)),
      to: day(new Date()),
    }));
    setPage(1);
  }
  async function download(format: "csv" | "pdf") {
    if (!result) return;
    setDownloading(true);
    setError("");
    try {
      if (demo) {
        const all = sample(data, effective, 0),
          sales = all.sales; // Demo history stays below the page limit.
        if (format === "csv")
          downloadBlob(
            new Blob(
              [
                csvDocument([
                  ["POS sales report", "Demo"],
                  ["Period", filters.from, filters.to],
                  [
                    "Receipt",
                    "Date",
                    "Customer",
                    "Cashier",
                    "Payment",
                    "Status",
                    "Total",
                  ],
                  ...sales.map((s) => [
                    s.id,
                    date(s.createdAt),
                    s.customer,
                    s.cashier,
                    s.payment,
                    s.status,
                    s.total,
                  ]),
                ]),
              ],
              { type: "text/csv;charset=utf-8" },
            ),
            "POS-demo-report.csv",
          );
        else {
          const { reportPDF } = await import("@/lib/pdf-documents");
          const pdf = await reportPDF({
            store: "Demo store",
            filters: {
              ...effective,
              payment: effective.payment as "ALL",
              status: effective.status as "ALL",
              sort: effective.sort as "newest",
              min: Number(effective.min || 0),
              max: Number(effective.max || 1e12),
              page: 1,
            },
            summary: all.summary,
            sales: sales as unknown as Record<string, unknown>[],
          });
          downloadBlob(
            new Blob([new Uint8Array(pdf)], { type: "application/pdf" }),
            "POS-demo-report.pdf",
          );
        }
      } else
        await downloadFrom(
          `/api/reports?${query}&format=${format}`,
          `POS-report-${filters.from}-${filters.to}.${format}`,
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }
  return (
    <div className="report-workspace">
      <div className="report-actions">
        <div className="preset-buttons">
          <button onClick={() => preset(1)}>Today</button>
          <button onClick={() => preset(7)}>Last 7 days</button>
          <button onClick={() => preset(30)}>Last 30 days</button>
          <button onClick={() => preset(90)}>Last 90 days</button>
        </div>
        {can(data.user, "reports.export") && (
          <div>
            <button
              className="secondary"
              disabled={downloading || loading}
              onClick={() => download("csv")}
            >
              <Download size={15} />
              CSV report
            </button>
            <button
              className="primary"
              disabled={downloading || loading}
              onClick={() => download("pdf")}
            >
              <FileText size={15} />
              {downloading ? "Preparing…" : "Download PDF"}
            </button>
          </div>
        )}
      </div>
      <section className="panel report-filters">
        <div className="filter-toolbar">
          <SearchInput
            value={filters.q}
            onChange={(v) => change("q", v)}
            placeholder="Search receipt, customer, cashier, product or SKU"
          />
          <div className="date-range">
            <input
              aria-label="Report start date"
              type="date"
              value={filters.from}
              onChange={(e) => change("from", e.target.value)}
            />
            <span>to</span>
            <input
              aria-label="Report end date"
              type="date"
              value={filters.to}
              onChange={(e) => change("to", e.target.value)}
            />
          </div>
          <button
            className={`secondary ${expanded ? "filter-active" : ""}`}
            onClick={() => setExpanded(!expanded)}
          >
            <SlidersHorizontal size={16} />
            Filters
            {[filters.payment, filters.status].filter((v) => v !== "ALL")
              .length +
              Number(!!filters.min) +
              Number(!!filters.max) >
              0 && (
              <span className="badge neutral">
                {[filters.payment, filters.status].filter((v) => v !== "ALL")
                  .length +
                  Number(!!filters.min) +
                  Number(!!filters.max)}
              </span>
            )}
          </button>
        </div>
        {expanded && (
          <div className="expanded-filters">
            <label>
              Payment method
              <select
                value={filters.payment}
                onChange={(e) => change("payment", e.target.value)}
              >
                <option value="ALL">All methods</option>
                <option>Cash</option>
                <option>Card</option>
                <option>Transfer</option>
              </select>
            </label>
            <label>
              Transaction status
              <select
                value={filters.status}
                onChange={(e) => change("status", e.target.value)}
              >
                <option value="ALL">All statuses</option>
                <option value="COMPLETED">Completed</option>
                <option value="VOID">Voided</option>
              </select>
            </label>
            <label>
              Minimum amount
              <input
                type="number"
                min="0"
                placeholder="No minimum"
                value={filters.min}
                onChange={(e) => change("min", e.target.value)}
              />
            </label>
            <label>
              Maximum amount
              <input
                type="number"
                min="0"
                placeholder="No maximum"
                value={filters.max}
                onChange={(e) => change("max", e.target.value)}
              />
            </label>
            <label>
              Sort results
              <select
                value={filters.sort}
                onChange={(e) => change("sort", e.target.value)}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="highest">Highest amount</option>
                <option value="lowest">Lowest amount</option>
              </select>
            </label>
            <button
              className="text-button"
              onClick={() => {
                setFilters(defaults());
                setPage(1);
              }}
            >
              <RotateCcw size={14} />
              Reset filters
            </button>
          </div>
        )}
      </section>
      {error && <div className="error">{error}</div>}
      {loading ? (
        <Loading />
      ) : (
        result && (
          <>
            {!history && (
              <>
                <div className="advanced-kpis report-kpis">
                  {[
                    {
                      label: "Net sales",
                      value: money(result.summary.revenue),
                      sub: "Completed transactions after discounts",
                      icon: Wallet,
                    },
                    {
                      label: "Completed sales",
                      value: String(result.summary.sales),
                      sub: `${result.summary.voided} voided transactions excluded`,
                      icon: ShoppingBag,
                    },
                    {
                      label: "Estimated gross profit",
                      value: demo ? "—" : money(result.summary.profit),
                      sub: demo
                        ? "Demo item costs are unavailable"
                        : "Revenue less recorded item cost",
                      icon: TrendingUp,
                    },
                    {
                      label: "Average order",
                      value: money(result.summary.average),
                      sub: `${money(result.summary.discounts)} in discounts`,
                      icon: ArrowUpRight,
                    },
                  ].map((k) => (
                    <div className="advanced-kpi" key={k.label}>
                      <span className="kpi-icon blue">
                        <k.icon size={21} />
                      </span>
                      <span className="kpi-label">{k.label}</span>
                      <strong>{k.value}</strong>
                      <small>{k.sub}</small>
                    </div>
                  ))}
                </div>
                <div className="advanced-grid report-chart-grid">
                  <section className="panel">
                    <div className="panel-title">
                      <div>
                        <h2>Revenue over time</h2>
                        <p>Daily completed revenue · Asia/Karachi</p>
                      </div>
                    </div>
                    {result.daily.length ? (
                      <RevenueChart points={result.daily} />
                    ) : (
                      <div className="empty">No revenue in this period.</div>
                    )}
                  </section>
                  <section className="panel">
                    <div className="panel-title">
                      <div>
                        <h2>Payment mix</h2>
                        <p>How customers pay</p>
                      </div>
                    </div>
                    {result.payments.map((p) => (
                      <div className="payment-mix" key={p.method}>
                        <div>
                          <strong>{p.method}</strong>
                          <span>{money(p.revenue)}</span>
                        </div>
                        <div className="progress">
                          <i
                            style={{
                              width: `${result.summary.revenue ? (p.revenue / result.summary.revenue) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <small>{p.sales} completed sales</small>
                      </div>
                    ))}
                    {!result.payments.length && (
                      <div className="empty">No completed transactions.</div>
                    )}
                  </section>
                </div>
              </>
            )}
            <section className="panel">
              <div className="panel-title">
                <div>
                  <h2>
                    {history ? "Transaction history" : "Detailed sales report"}
                  </h2>
                  <p>
                    {result.total.toLocaleString()} matching transactions · Full
                    database results
                  </p>
                </div>
                <span className="badge neutral">
                  {filters.from} → {filters.to}
                </span>
              </div>
              <div className="table-wrap">
                <table className="advanced-table">
                  <thead>
                    <tr>
                      <th>Receipt / invoice</th>
                      <th>Customer</th>
                      <th>Date & cashier</th>
                      <th>Payment</th>
                      <th>Status</th>
                      <th>Amount</th>
                      {history && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {result.sales.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <strong>#{String(s.id).padStart(5, "0")}</strong>
                          {s.invoiceId ? (
                            <button
                              className="invoice-link"
                              onClick={() => onInvoice?.(s.invoiceId!)}
                            >
                              {s.invoiceNumber}
                              <ChevronRight size={11} />
                            </button>
                          ) : (
                            <small>Receipt record</small>
                          )}
                        </td>
                        <td>{s.customer}</td>
                        <td>
                          {date(s.createdAt)}
                          <small>{s.cashier}</small>
                        </td>
                        <td>
                          <span className="badge neutral">{s.payment}</span>
                        </td>
                        <td>
                          <span
                            className={`badge ${s.status === "COMPLETED" ? "green" : "amber"}`}
                          >
                            <span className="status-dot" />
                            {s.status === "COMPLETED" ? "Completed" : "Voided"}
                          </span>
                        </td>
                        <td>
                          <strong>{money(s.total)}</strong>
                          {s.discount > 0 && (
                            <small>{money(s.discount)} discount</small>
                          )}
                        </td>
                        {history && (
                          <td>
                            {s.status === "COMPLETED" &&
                              can(data.user, "sales.void") && (
                                <button
                                  className="text-button"
                                  onClick={() => onVoid?.(s.id)}
                                >
                                  Void sale
                                </button>
                              )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!result.sales.length && (
                <div className="empty">
                  <FileText size={30} />
                  <p>No transactions match these filters.</p>
                </div>
              )}
              <Pagination
                page={page}
                total={result.total}
                size={25}
                onChange={setPage}
              />
            </section>
            {!history && result.topProducts.length > 0 && (
              <section className="panel spaced">
                <div className="panel-title">
                  <div>
                    <h2>Best-selling products</h2>
                    <p>Gross item revenue before discounts</p>
                  </div>
                </div>
                <div className="top-product-grid">
                  {result.topProducts.map((p, i) => (
                    <div className="top-product" key={p.name}>
                      <span>0{i + 1}</span>
                      <div>
                        <strong>{p.name}</strong>
                        <small>{p.quantity} units</small>
                      </div>
                      <b>{money(p.grossRevenue)}</b>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )
      )}
    </div>
  );
}
