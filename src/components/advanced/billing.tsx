"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  FileText,
  Download,
  Printer,
  Wallet,
  Clock,
  Check,
  ArrowUpRight,
  Trash2,
  X,
  Receipt,
  Banknote,
} from "lucide-react";
import type { WorkspaceData } from "@/lib/types";
import type {
  InvoiceRecord,
  InvoiceDetail,
  InvoiceList,
} from "@/lib/advanced-types";
import { can } from "@/lib/permissions";
import { invoiceTotals, paymentState } from "@/lib/billing";
import {
  SearchInput,
  Pagination,
  Dialog,
  Loading,
  day,
  date,
  money,
  useDebounced,
  downloadBlob,
  downloadFrom,
} from "./shared";
type Draft = {
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  dueDate: string;
  discount: string;
  taxRate: string;
  notes: string;
  items: { description: string; quantity: number; unitPrice: number }[];
};
const blank = (): Draft => ({
  customerId: "",
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  dueDate: day(new Date(Date.now() + 7 * 86400000)),
  discount: "0",
  taxRate: "0",
  notes: "",
  items: [{ description: "", quantity: 1, unitPrice: 0 }],
});
export default function Billing({
  data,
  demo,
  initialId,
  onChanged,
  onSelectedConsumed,
}: {
  data: WorkspaceData;
  demo: boolean;
  initialId?: number | null;
  onChanged: () => void;
  onSelectedConsumed?: () => void;
}) {
  const [q, setQ] = useState(""),
    [status, setStatus] = useState("ALL"),
    [page, setPage] = useState(1),
    [list, setList] = useState<InvoiceList | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState<Draft | null>(null),
    [detail, setDetail] = useState<InvoiceDetail | null>(null),
    [payment, setPayment] = useState<{
      invoice: InvoiceRecord;
      requestKey: string;
    } | null>(null),
    [confirm, setConfirm] = useState<InvoiceRecord | null>(null),
    [version, setVersion] = useState(0),
    [demoEntries, setDemoEntries] = useState<Record<number, InvoiceDetail>>({});
  const query = useDebounced(q);
  const store =
    data.stores.find((s) => s.id === data.storeId) || data.stores[0];
  const demoList = useMemo(() => {
    const historical = data.sales.map(
      (s) =>
        ({
          id: s.id,
          saleId: s.id,
          invoiceNumber: `DEMO-${s.id}`,
          customerName: s.customer,
          total: s.total,
          subtotal: s.subtotal,
          discount: s.discount,
          tax: 0,
          taxRate: 0,
          amountPaid: s.status === "VOID" ? 0 : s.total,
          status: s.status === "VOID" ? "CANCELLED" : "PAID",
          dueDate: day(s.createdAt),
          createdAt: s.createdAt,
        }) as InvoiceRecord,
    );
    const entries = [
      ...Object.values(demoEntries).map((d) => d.invoice),
      ...historical.filter((s) => !demoEntries[s.id]),
    ];
    return entries;
  }, [data.sales, demoEntries]);
  useEffect(() => {
    if (demo) {
      const filtered = demoList.filter(
        (i) =>
          `${i.invoiceNumber} ${i.customerName}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (status === "ALL" ||
            (status === "OVERDUE"
              ? ["ISSUED", "PARTIAL"].includes(i.status) &&
                i.dueDate < day(new Date())
              : i.status === status)),
      );
      setList({
        invoices: filtered.slice((page - 1) * 20, page * 20),
        total: filtered.length,
        page,
        summary: {
          billed: demoList
            .filter((i) => i.status !== "CANCELLED")
            .reduce((n, i) => n + i.total, 0),
          collected: demoList
            .filter((i) => i.status !== "CANCELLED")
            .reduce((n, i) => n + i.amountPaid, 0),
          outstanding: demoList
            .filter((i) => ["ISSUED", "PARTIAL"].includes(i.status))
            .reduce((n, i) => n + i.total - i.amountPaid, 0),
          overdue: demoList
            .filter(
              (i) =>
                ["ISSUED", "PARTIAL"].includes(i.status) &&
                i.dueDate < day(new Date()),
            )
            .reduce((n, i) => n + i.total - i.amountPaid, 0),
        },
      });
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(
      `/api/invoices?${new URLSearchParams({ storeId: String(data.storeId), q: query, status, page: String(page) })}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setList(j);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [data.storeId, demo, demoList, query, status, page, version]);
  useEffect(() => {
    if (initialId) {
      open(initialId);
      onSelectedConsumed?.();
    }
  }, [initialId, data.storeId]);
  async function open(id: number) {
    setError("");
    if (demo) {
      const saved = demoEntries[id];
      if (saved) {
        setDetail(saved);
        return;
      }
      const invoice = demoList.find((i) => i.id === id);
      if (!invoice) return;
      setDetail({
        invoice: {
          ...invoice,
          senderName: store?.name,
          senderAddress: store?.address,
        },
        items: [
          {
            description: "Demo sale total",
            quantity: 1,
            unitPrice: invoice.subtotal || invoice.total,
          },
        ],
        payments:
          invoice.status === "PAID"
            ? [
                {
                  amount: invoice.amountPaid,
                  method: "Cash",
                  reference: "Demo record",
                  status: "RECORDED",
                  createdAt: invoice.createdAt,
                },
              ]
            : [],
      });
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/invoices?id=${id}&storeId=${data.storeId}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setDetail(j);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function saved(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(""), 4000);
    setVersion((v) => v + 1);
    onChanged();
  }
  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, storeId: data.storeId }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    return j.result;
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setError("");
    setBusy(true);
    try {
      const values = {
        ...draft,
        customerId: draft.customerId ? Number(draft.customerId) : null,
        discount: Number(draft.discount),
        taxRate: Number(draft.taxRate),
      };
      const totals = invoiceTotals(
        values.items,
        values.discount,
        values.taxRate,
      );
      if (demo) {
        const id = Date.now(),
          invoice: InvoiceRecord = {
            id,
            saleId: null,
            invoiceNumber: `DEMO-INV-${id}`,
            customerName: values.customerName,
            customerEmail: values.customerEmail,
            customerPhone: values.customerPhone,
            senderName: store?.name,
            senderAddress: store?.address,
            ...totals,
            taxRate: values.taxRate,
            amountPaid: 0,
            status: totals.total === 0 ? "PAID" : "ISSUED",
            dueDate: values.dueDate,
            notes: values.notes,
            createdAt: new Date().toISOString(),
          };
        const full = { invoice, items: values.items, payments: [] };
        setDemoEntries((d) => ({ ...d, [id]: full }));
        setDetail(full);
      } else {
        const result = await post({ ...values, action: "invoice" });
        await open(result.id);
      }
      setDraft(null);
      saved("Invoice created");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function recordPayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!payment) return;
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    try {
      if (demo) {
        const full = demoEntries[payment.invoice.id] || detail;
        if (!full) throw new Error("Open the invoice first");
        const state = paymentState(
          full.invoice.total,
          full.invoice.amountPaid,
          Number(f.amount),
        );
        const updated = {
          ...full,
          invoice: {
            ...full.invoice,
            amountPaid: state.amountPaid,
            status: state.status as InvoiceRecord["status"],
          },
          payments: [
            {
              amount: Number(f.amount),
              method: String(f.method),
              reference: String(f.reference),
              status: "RECORDED",
              createdAt: new Date().toISOString(),
            },
            ...full.payments,
          ],
        };
        setDemoEntries((d) => ({ ...d, [updated.invoice.id]: updated }));
        setDetail(updated);
      } else {
        await post({
          action: "invoicePayment",
          id: payment.invoice.id,
          amount: Number(f.amount),
          method: f.method,
          reference: f.reference,
          requestKey: payment.requestKey,
        });
        await open(payment.invoice.id);
      }
      setPayment(null);
      saved("Payment recorded");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!confirm) return;
    setBusy(true);
    setError("");
    try {
      if (demo) {
        const full = demoEntries[confirm.id] || detail;
        if (!full) throw new Error("Open the invoice first");
        const updated = {
          ...full,
          invoice: { ...full.invoice, status: "CANCELLED" as const },
        };
        setDemoEntries((d) => ({ ...d, [confirm.id]: updated }));
        setDetail(updated);
      } else {
        await post({ action: "cancelInvoice", id: confirm.id });
        await open(confirm.id);
      }
      setConfirm(null);
      saved("Invoice cancelled");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function pdf() {
    if (!detail) return;
    setBusy(true);
    setError("");
    try {
      if (demo) {
        const { invoicePDF } = await import("@/lib/pdf-documents");
        const bytes = await invoicePDF(
          detail.invoice as unknown as Record<string, unknown>,
          detail.items,
          detail.payments,
        );
        downloadBlob(
          new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
          `${detail.invoice.invoiceNumber}.pdf`,
        );
      } else
        await downloadFrom(
          `/api/invoices/pdf?id=${detail.invoice.id}&storeId=${data.storeId}`,
          `${detail.invoice.invoiceNumber}.pdf`,
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const totals = (() => {
    try {
      return draft
        ? invoiceTotals(
            draft.items,
            Number(draft.discount),
            Number(draft.taxRate),
          )
        : null;
    } catch {
      return null;
    }
  })();
  return (
    <div className="billing-workspace">
      {notice && (
        <div className="inline-success">
          <Check size={16} />
          {notice}
        </div>
      )}
      <div className="advanced-kpis">
        {[
          {
            label: "Total billed",
            value: list?.summary.billed || 0,
            icon: Receipt,
            color: "blue",
          },
          {
            label: "Collected",
            value: list?.summary.collected || 0,
            icon: Wallet,
            color: "teal",
          },
          {
            label: "Outstanding",
            value: list?.summary.outstanding || 0,
            icon: Banknote,
            color: "purple",
          },
          {
            label: "Overdue balance",
            value: list?.summary.overdue || 0,
            icon: Clock,
            color: "orange",
          },
        ].map((k) => (
          <div className="advanced-kpi" key={k.label}>
            <span className={`kpi-icon ${k.color}`}>
              <k.icon size={21} />
            </span>
            <span className="kpi-label">{k.label}</span>
            <strong>{money(k.value)}</strong>
            <small>All invoices in this store</small>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="filter-toolbar">
          <SearchInput
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Search invoice number or customer"
          />
          <select
            aria-label="Filter invoices by status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">All invoices</option>
            <option value="ISSUED">Unpaid</option>
            <option value="PARTIAL">Partially paid</option>
            <option value="PAID">Paid</option>
            <option value="OVERDUE">Overdue</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          {can(data.user, "invoices.create") && (
            <button
              className="primary"
              onClick={() => {
                setError("");
                setDraft(blank());
              }}
            >
              <Plus size={16} />
              Create invoice
            </button>
          )}
        </div>
        {error && !draft && !payment && !confirm && (
          <div className="error">{error}</div>
        )}
        {loading ? (
          <Loading />
        ) : (
          <>
            <div className="table-wrap">
              <table className="advanced-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Due date</th>
                    <th>Total</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>Document</th>
                  </tr>
                </thead>
                <tbody>
                  {list?.invoices.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <strong>{i.invoiceNumber}</strong>
                        <small>
                          {i.saleId
                            ? `Sale #${i.saleId}`
                            : "Standalone invoice"}
                        </small>
                      </td>
                      <td>{i.customerName}</td>
                      <td>
                        {i.dueDate}
                        {["ISSUED", "PARTIAL"].includes(i.status) &&
                          i.dueDate < day(new Date()) && (
                            <small className="orange-text">Overdue</small>
                          )}
                      </td>
                      <td>
                        <strong>{money(i.total)}</strong>
                      </td>
                      <td>
                        {money(
                          i.status === "CANCELLED" ? 0 : i.total - i.amountPaid,
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge ${i.status === "PAID" ? "green" : i.status === "CANCELLED" ? "neutral" : "amber"}`}
                        >
                          {i.status === "ISSUED"
                            ? "Unpaid"
                            : i.status === "PARTIAL"
                              ? "Partial"
                              : i.status === "PAID"
                                ? "Paid"
                                : "Cancelled"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => open(i.id)}
                        >
                          <FileText size={14} />
                          View invoice
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!list?.invoices.length && (
              <div className="empty">
                <Receipt size={30} />
                <p>
                  No invoices found. A completed checkout generates a paid
                  invoice automatically.
                </p>
              </div>
            )}
            <Pagination
              page={page}
              total={list?.total || 0}
              size={20}
              onChange={setPage}
            />
          </>
        )}
      </section>
      <div className="form-note">
        <FileText size={17} />
        <span>
          Checkout invoices are linked to sales. Standalone invoices track
          billing and payments without changing stock. Card and bank transfer
          payments are recorded here after you receive them externally.
        </span>
      </div>
      {draft && (
        <Dialog
          title="Create a customer invoice"
          onClose={() => setDraft(null)}
          wide
        >
          {error && <div className="error">{error}</div>}
          <form onSubmit={create}>
            <div className="form-grid">
              <label>
                Existing customer
                <select
                  value={draft.customerId}
                  onChange={(e) => {
                    const c = data.customers.find(
                      (c) => c.id === Number(e.target.value),
                    );
                    setDraft({
                      ...draft,
                      customerId: e.target.value,
                      customerName: c?.name || "",
                      customerEmail: c?.email || "",
                      customerPhone: c?.phone || "",
                    });
                  }}
                >
                  <option value="">Enter customer details</option>
                  {data.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Payment due date
                <input
                  type="date"
                  value={draft.dueDate}
                  onChange={(e) =>
                    setDraft({ ...draft, dueDate: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                Customer name
                <input
                  value={draft.customerName}
                  onChange={(e) =>
                    setDraft({ ...draft, customerName: e.target.value })
                  }
                  required
                  minLength={2}
                  maxLength={120}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={draft.customerEmail}
                  onChange={(e) =>
                    setDraft({ ...draft, customerEmail: e.target.value })
                  }
                  maxLength={190}
                />
              </label>
            </div>
            <label>
              Phone
              <input
                value={draft.customerPhone}
                onChange={(e) =>
                  setDraft({ ...draft, customerPhone: e.target.value })
                }
                maxLength={30}
              />
            </label>
            <div className="invoice-line-heading">
              <h3>Invoice items</h3>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    items: [
                      ...draft.items,
                      { description: "", quantity: 1, unitPrice: 0 },
                    ],
                  })
                }
              >
                <Plus size={14} />
                Add line
              </button>
            </div>
            <div className="invoice-draft-items">
              {draft.items.map((item, index) => (
                <div className="invoice-draft-line" key={index}>
                  <label>
                    Description
                    <input
                      aria-label={`Item ${index + 1} description`}
                      value={item.description}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          items: draft.items.map((i, n) =>
                            n === index
                              ? { ...i, description: e.target.value }
                              : i,
                          ),
                        })
                      }
                      required
                      maxLength={255}
                    />
                  </label>
                  <label>
                    Qty
                    <input
                      aria-label={`Item ${index + 1} quantity`}
                      type="number"
                      min="1"
                      max="10000"
                      value={item.quantity}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          items: draft.items.map((i, n) =>
                            n === index
                              ? { ...i, quantity: Number(e.target.value) }
                              : i,
                          ),
                        })
                      }
                      required
                    />
                  </label>
                  <label>
                    Rate (Rs.)
                    <input
                      aria-label={`Item ${index + 1} rate`}
                      type="number"
                      min="0"
                      max="10000000"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          items: draft.items.map((i, n) =>
                            n === index
                              ? { ...i, unitPrice: Number(e.target.value) }
                              : i,
                          ),
                        })
                      }
                      required
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove item ${index + 1}`}
                    disabled={draft.items.length === 1}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        items: draft.items.filter((_, n) => n !== index),
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="form-grid">
              <label>
                Discount (Rs.)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.discount}
                  onChange={(e) =>
                    setDraft({ ...draft, discount: e.target.value })
                  }
                />
              </label>
              <label>
                Tax rate (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={draft.taxRate}
                  onChange={(e) =>
                    setDraft({ ...draft, taxRate: e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              Notes
              <textarea
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                maxLength={2000}
                placeholder="Payment terms, delivery information…"
              />
            </label>
            <div className="draft-total">
              <span>
                Invoice total
                {totals && <small>{money(totals.tax)} tax included</small>}
              </span>
              <strong>{totals ? money(totals.total) : "Check discount"}</strong>
            </div>
            <button className="primary wide" disabled={busy || !totals}>
              {busy ? "Creating…" : "Issue invoice"}
              <ArrowUpRight size={17} />
            </button>
          </form>
        </Dialog>
      )}
      {detail && !draft && !payment && !confirm && (
        <Dialog title="Invoice details" onClose={() => setDetail(null)} wide>
          <div className="invoice-tools">
            <button className="secondary" disabled={busy} onClick={pdf}>
              <Download size={15} />
              Download PDF
            </button>
            <button className="secondary" onClick={() => window.print()}>
              <Printer size={15} />
              Print
            </button>
            {["ISSUED", "PARTIAL"].includes(detail.invoice.status) &&
              can(data.user, "invoices.pay") && (
                <button
                  className="primary"
                  onClick={() => {
                    setError("");
                    setPayment({
                      invoice: detail.invoice,
                      requestKey: crypto.randomUUID(),
                    });
                  }}
                >
                  <Plus size={15} />
                  Record payment
                </button>
              )}
            {detail.invoice.status === "ISSUED" &&
              !detail.invoice.saleId &&
              detail.invoice.amountPaid === 0 &&
              can(data.user, "invoices.create") && (
                <button
                  className="text-button"
                  onClick={() => {
                    setError("");
                    setConfirm(detail.invoice);
                  }}
                >
                  Cancel invoice
                </button>
              )}
          </div>
          {error && <div className="error">{error}</div>}
          <div className="invoice-document">
            <div className="invoice-document-header">
              <div>
                <span className="brand-icon">P</span>
                <h2>{detail.invoice.senderName || store?.name}</h2>
                <p>{detail.invoice.senderAddress || store?.address}</p>
              </div>
              <div>
                <span className="invoice-title">INVOICE</span>
                <strong>{detail.invoice.invoiceNumber}</strong>
                <span
                  className={`badge ${detail.invoice.status === "PAID" ? "green" : detail.invoice.status === "CANCELLED" ? "neutral" : "amber"}`}
                >
                  {detail.invoice.status}
                </span>
              </div>
            </div>
            <div className="invoice-meta">
              <div>
                <small>BILL TO</small>
                <h3>{detail.invoice.customerName}</h3>
                <p>
                  {detail.invoice.customerEmail}
                  <br />
                  {detail.invoice.customerPhone}
                </p>
              </div>
              <div>
                <p>
                  <span>Issued</span>
                  {date(detail.invoice.createdAt)}
                </p>
                <p>
                  <span>Due date</span>
                  {detail.invoice.dueDate}
                </p>
                {detail.invoice.saleId && (
                  <p>
                    <span>Sale reference</span>#{detail.invoice.saleId}
                  </p>
                )}
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Unit price</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((i, n) => (
                    <tr key={n}>
                      <td>{i.description}</td>
                      <td>{i.quantity}</td>
                      <td>{money(i.unitPrice)}</td>
                      <td>
                        <strong>{money(i.quantity * i.unitPrice)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="invoice-totals">
              <div>
                <span>Subtotal</span>
                {money(detail.invoice.subtotal || 0)}
              </div>
              <div>
                <span>Discount</span>− {money(detail.invoice.discount || 0)}
              </div>
              <div>
                <span>Tax ({detail.invoice.taxRate || 0}%)</span>
                {money(detail.invoice.tax || 0)}
              </div>
              <div className="invoice-grand-total">
                <strong>Total</strong>
                <strong>{money(detail.invoice.total)}</strong>
              </div>
              <div>
                <span>Paid</span>
                {money(detail.invoice.amountPaid)}
              </div>
              <div className="invoice-balance">
                <strong>Balance due</strong>
                <strong>
                  {money(
                    detail.invoice.status === "CANCELLED"
                      ? 0
                      : detail.invoice.total - detail.invoice.amountPaid,
                  )}
                </strong>
              </div>
            </div>
            {detail.invoice.notes && (
              <div className="invoice-notes">
                <strong>Notes & terms</strong>
                <p>{detail.invoice.notes}</p>
              </div>
            )}
            <div className="invoice-thanks">
              Thank you for your business.<span>Generated by POS</span>
            </div>
          </div>
          {detail.payments.length > 0 && (
            <div className="invoice-ledger">
              <h3>Payment history</h3>
              {detail.payments.map((p, i) => (
                <div key={i}>
                  <div>
                    <strong>
                      {p.method} · {money(p.amount)}
                    </strong>
                    <small>
                      {date(p.createdAt)} {p.reference && `· ${p.reference}`}
                    </small>
                  </div>
                  <span
                    className={`badge ${p.status === "RECORDED" ? "green" : "amber"}`}
                  >
                    {p.status === "RECORDED" ? "Recorded" : "Reversed"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Dialog>
      )}
      {payment && (
        <Dialog title="Record invoice payment" onClose={() => setPayment(null)}>
          {error && <div className="error">{error}</div>}
          <div className="payment-balance">
            <small>{payment.invoice.invoiceNumber}</small>
            <strong>
              {money(payment.invoice.total - payment.invoice.amountPaid)}
            </strong>
            <span>Outstanding balance</span>
          </div>
          <form onSubmit={recordPayment}>
            <label>
              Amount received (Rs.)
              <input
                name="amount"
                type="number"
                min="0.01"
                max={payment.invoice.total - payment.invoice.amountPaid}
                step="0.01"
                defaultValue={
                  payment.invoice.total - payment.invoice.amountPaid
                }
                required
              />
            </label>
            <label>
              Payment method
              <select name="method">
                <option>Cash</option>
                <option>Card</option>
                <option>Transfer</option>
              </select>
            </label>
            <label>
              Reference
              <input
                name="reference"
                maxLength={120}
                placeholder="Bank reference or payment note"
              />
            </label>
            <button className="primary wide" disabled={busy}>
              {busy ? "Recording…" : "Record payment"}
              <Check size={16} />
            </button>
          </form>
        </Dialog>
      )}
      {confirm && (
        <Dialog title="Cancel this invoice?" onClose={() => setConfirm(null)}>
          {error && <div className="error">{error}</div>}
          <p className="dialog-description">
            {confirm.invoiceNumber} will remain in the records with a cancelled
            status. No inventory or payments will change.
          </p>
          <button className="primary wide" disabled={busy} onClick={cancel}>
            Confirm cancellation
          </button>
        </Dialog>
      )}
    </div>
  );
}
