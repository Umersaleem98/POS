"use client";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Layers,
  Users,
  Receipt,
  ChartNoAxesCombined,
  ShieldCheck,
  Store,
  Search,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Bell,
  LogOut,
  X,
  Minus,
  CreditCard,
  Banknote,
  ArrowRight,
  Check,
  Menu,
  Printer,
  Download,
  Pencil,
  Trash2,
} from "lucide-react";
import type { Product, WorkspaceData } from "@/lib/types";
import { demoData } from "@/lib/demo";
import { ProductIcon, Empty, SalesTable } from "./catalog-ui";
import Login from "./login";
import Dashboard from "./advanced/dashboard";
import Reports from "./advanced/reports";
import TeamAccess from "./advanced/team-access";
import Billing from "./advanced/billing";
import GlobalSearch from "./advanced/global-search";
import { can, pagePermission, defaultRoles } from "@/lib/permissions";
const money = (n: number) =>
  `Rs. ${Number(n).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
const date = (s: string) =>
  new Date(s).toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short",
  });
const businessDay = (value: string | Date) =>
  new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
const nav = [
  ["Overview", LayoutDashboard],
  ["Point of sale", ShoppingBag],
  ["Products", Package],
  ["Inventory", Layers],
  ["Customers", Users],
  ["Sales history", Receipt],
  ["Reports", ChartNoAxesCombined],
  ["Billing & invoices", Receipt],
] as const;

type ReceiptData = {
  id: number;
  invoiceId?: number;
  invoiceNumber?: string;
  items: { name: string; quantity: number; price: number }[];
  subtotal: number;
  discount: number;
  total: number;
  payment: string;
};
export default function Workspace() {
  const [data, setData] = useState<WorkspaceData | null>(null),
    [demo, setDemo] = useState(false),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState("Overview"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("All products"),
    [stockFilter, setStockFilter] = useState("ALL"),
    [modal, setModal] = useState<string | null>(null),
    [edit, setEdit] = useState<Product | null>(null),
    [busy, setBusy] = useState(false),
    [cart, setCart] = useState<{ productId: number; quantity: number }[]>([]),
    [checkoutKey, setCheckoutKey] = useState(() => crypto.randomUUID()),
    [discount, setDiscount] = useState(0),
    [customer, setCustomer] = useState(""),
    [payment, setPayment] = useState("Cash"),
    [receipt, setReceipt] = useState<ReceiptData | null>(null),
    [mobile, setMobile] = useState(false),
    [selectedInvoice, setSelectedInvoice] = useState<number | null>(null);
  async function load(storeId?: number) {
    const r = await fetch(
      `/api/workspace${storeId ? `?storeId=${storeId}` : ""}`,
    );
    const json = await r.json();
    if (!r.ok) throw new Error(json.error);
    setData(json);
    setPage((current) => {
      const needed = pagePermission[current];
      if (
        (needed && !can(json.user, needed)) ||
        (["Stores", "Team & access", "Activity log"].includes(current) &&
          json.user.role !== "SUPER_ADMIN")
      )
        return (
          nav.find(([name]) => can(json.user, pagePermission[name]))?.[0] ||
          "My access"
        );
      return current;
    });
  }
  useEffect(() => {
    load()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  const orderIdentity = JSON.stringify({
    cart,
    discount,
    customer,
    payment,
    storeId: data?.storeId,
  });
  useEffect(() => {
    setCheckoutKey(crypto.randomUUID());
  }, [orderIdentity]);
  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(""), 4000);
  }
  async function mutate(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      if (demo) {
        if (body.action === "stock") {
          const p = data?.products.find((x) => x.id === body.productId);
          const qty = Number(body.quantity);
          if (!p || !Number.isInteger(qty) || !qty || p.stock + qty < 0)
            throw new Error("Invalid quantity or insufficient stock");
        }
        setData((previous) => {
          if (!previous) return previous;
          const d = structuredClone(previous);
          const id = Date.now();
          if (body.action === "product") {
            const p = {
              ...body,
              id: body.id || id,
              price: Number(body.price),
              cost: Number(body.cost),
              stock: Number(body.stock),
              reorderLevel: Number(body.reorderLevel),
            } as unknown as Product;
            if (body.id)
              d.products = d.products.map((x) =>
                x.id === body.id ? { ...p, stock: x.stock } : x,
              );
            else d.products.unshift(p);
          }
          if (body.action === "archive")
            d.products = d.products.filter((x) => x.id !== body.id);
          if (body.action === "stock") {
            const p = d.products.find((x) => x.id === body.productId);
            const qty = Number(body.quantity);
            if (!p) return d;
            p.stock += qty;
            d.movements.unshift({
              id,
              product: p.name,
              quantity: qty,
              reason: String(body.reason),
              createdAt: new Date().toISOString(),
              user: d.user.name,
            });
          }
          if (body.action === "customer")
            d.customers.unshift({
              id,
              name: String(body.name),
              email: String(body.email),
              phone: String(body.phone),
            });
          if (body.action === "store")
            d.stores.push({
              id,
              name: String(body.name),
              address: String(body.address),
            });
          if (body.action === "user")
            d.users.push({
              id,
              name: String(body.name),
              email: String(body.email),
              role: String(body.role),
              storeId: Number(body.assignedStoreId),
              active: 1,
              store:
                d.stores.find((s) => s.id === Number(body.assignedStoreId))
                  ?.name || "All stores",
            });
          if (body.action === "toggleUser")
            d.users = d.users.map((u) =>
              u.id === body.id ? { ...u, active: u.active ? 0 : 1 } : u,
            );
          if (body.action === "void")
            d.sales = d.sales.map((s) =>
              s.id === body.id ? { ...s, status: "VOID" } : s,
            );
          if (body.action === "editUser")
            d.users = d.users.map((u) =>
              u.id === body.id
                ? {
                    ...u,
                    name: String(body.name),
                    email: String(body.email),
                    role: String(body.role),
                    storeId: Number(body.assignedStoreId),
                    active: body.active ? 1 : 0,
                    store:
                      d.stores.find(
                        (s) => s.id === Number(body.assignedStoreId),
                      )?.name || "All stores",
                  }
                : u,
            );
          if (body.action === "role") {
            const role = {
              code: String(body.code),
              name: String(body.name),
              description: String(body.description),
              permissions:
                body.permissions as import("@/lib/permissions").Permission[],
              locked: false,
            };
            d.roles = [
              ...(d.roles || defaultRoles).filter((r) => r.code !== role.code),
              role,
            ];
          }
          return d;
        });
        flash("Demo updated · changes reset on reload");
        setModal(null);
        return null;
      }
      const target = ["user", "editUser", "toggleUser", "role"].includes(
        String(body.action),
      )
        ? "/api/admin"
        : "/api/workspace";
      const r = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, storeId: data?.storeId }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      try {
        await load(data?.storeId);
      } catch {
        flash("Saved. Refresh the page to reload your workspace.");
      }
      setModal(null);
      flash("Changes saved");
      return json.result;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const body: Record<string, unknown> = { ...f, action: modal };
    if (modal === "product") {
      body.id = edit?.id;
      body.color = edit?.color || "blue";
    }
    if (modal === "stock") body.productId = Number(f.productId);
    if (modal === "user")
      body.assignedStoreId = f.assignedStoreId
        ? Number(f.assignedStoreId)
        : null;
    try {
      await mutate(body);
    } catch {}
  }
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function go(p: string) {
    if (data && pagePermission[p] && !can(data.user, pagePermission[p])) {
      flash("Your role does not have access to this module");
      return;
    }
    if (
      data &&
      ["Stores", "Team & access", "Activity log"].includes(p) &&
      data.user.role !== "SUPER_ADMIN"
    )
      return;
    if (p !== "Billing & invoices") setSelectedInvoice(null);
    setCategory("All products");
    setStockFilter("ALL");
    setPage(p);
    setSearch("");
    setMobile(false);
    setError("");
  }
  const products = data?.products || [],
    sales = data?.sales || [],
    completed = sales.filter((s) => s.status === "COMPLETED"),
    today = businessDay(new Date()),
    todaySales = completed.filter((s) => businessDay(s.createdAt) === today),
    low = products.filter((p) => p.stock <= p.reorderLevel),
    total = completed.reduce((n, s) => n + s.total, 0),
    todayTotal = todaySales.reduce((n, s) => n + s.total, 0);
  const cartItems = cart
      .map((c) => ({
        ...c,
        product: products.find((p) => p.id === c.productId)!,
      }))
      .filter((c) => c.product),
    subtotal =
      cartItems.reduce(
        (n, c) => n + Math.round(c.product.price * 100) * c.quantity,
        0,
      ) / 100;
  function add(p: Product) {
    if (!p.stock) {
      flash("This product is out of stock");
      return;
    }
    setCart((c) => {
      const x = c.find((i) => i.productId === p.id);
      if (x && x.quantity >= p.stock) {
        flash("Maximum available stock reached");
        return c;
      }
      return x
        ? c.map((i) =>
            i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i,
          )
        : [...c, { productId: p.id, quantity: 1 }];
    });
  }
  async function checkout() {
    if (!cart.length || discount < 0 || discount > subtotal) {
      setError("Add items and enter a valid discount");
      return;
    }
    const base = {
      id: Date.now(),
      items: cartItems.map((i) => ({
        name: i.product.name,
        quantity: i.quantity,
        price: i.product.price,
      })),
      subtotal,
      discount,
      total: subtotal - discount,
      payment,
    };
    try {
      if (demo) {
        if (cartItems.some((i) => i.quantity > i.product.stock))
          throw new Error("Insufficient stock");
        setData((d) =>
          d
            ? {
                ...d,
                products: d.products.map((p) => ({
                  ...p,
                  stock:
                    p.stock -
                    (cart.find((i) => i.productId === p.id)?.quantity || 0),
                })),
                sales: [
                  {
                    ...base,
                    status: "COMPLETED",
                    createdAt: new Date().toISOString(),
                    customer:
                      d.customers.find((c) => c.id === Number(customer))
                        ?.name || "Walk-in customer",
                    cashier: d.user.name,
                  },
                  ...d.sales,
                ],
              }
            : d,
        );
        setReceipt(base);
      } else {
        const result = await mutate({
          action: "sale",
          requestKey: checkoutKey,
          items: cart,
          customerId: customer ? Number(customer) : null,
          discount,
          payment,
        });
        setReceipt(result as ReceiptData);
      }
      setCart([]);
      setDiscount(0);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (loading)
    return (
      <div className="loading">
        <div className="brand-icon">P</div>
        <p>Opening your workspace…</p>
      </div>
    );
  if (!data)
    return (
      <Login
        error={error}
        busy={busy}
        onSubmit={login}
        onDemo={() => {
          setDemo(true);
          setData(demoData());
          setError("");
        }}
      />
    );
  const store =
    data.stores.find((s) => s.id === data.storeId) || data.stores[0];
  const filtered = products.filter(
    (p) =>
      `${p.name} ${p.sku}`.toLowerCase().includes(search.toLowerCase()) &&
      (category === "All products" || p.category === category) &&
      (stockFilter === "ALL" ||
        (stockFilter === "LOW"
          ? p.stock <= p.reorderLevel
          : stockFilter === "OUT"
            ? p.stock === 0
            : p.stock > p.reorderLevel)),
  );
  return (
    <div className="app">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-icon">P</span>POS
          <span className="brand-tag">WORKSPACE</span>
        </div>
        <div className="store-switch">
          <div className="store-icon">
            <Store size={19} />
          </div>
          <div>
            <small>CURRENT STORE</small>
            <select
              value={data.storeId}
              onChange={(e) => {
                setCart([]);
                if (demo) {
                  setData({
                    ...data,
                    storeId: Number(e.target.value),
                    products: [],
                    customers: [],
                    sales: [],
                    movements: [],
                  });
                } else
                  load(Number(e.target.value)).catch((e) =>
                    setError(e.message),
                  );
              }}
            >
              {data.stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {nav
            .filter(([label]) => can(data.user, pagePermission[label]))
            .map(([label, Icon]) => (
              <button
                key={label}
                className={page === label ? "active" : ""}
                onClick={() => go(label)}
              >
                <Icon size={19} />
                {label}
                {label === "Inventory" && low.length > 0 && (
                  <span className="count">{low.length}</span>
                )}
              </button>
            ))}
        </nav>
        {data.user.role === "SUPER_ADMIN" && (
          <>
            <span className="nav-label">ADMINISTRATION</span>
            <nav>
              {[
                ["Stores", Store],
                ["Team & access", ShieldCheck],
                ["Activity log", Receipt],
              ].map(([label, Icon]) => {
                const I = Icon as typeof Store;
                return (
                  <button
                    key={String(label)}
                    className={page === label ? "active" : ""}
                    onClick={() => go(String(label))}
                  >
                    <I size={19} />
                    {String(label)}
                  </button>
                );
              })}
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="plan-card">
            <span className="online-dot" />
            {demo ? "Demo workspace" : "MySQL connected"}
            <small>
              {demo
                ? "Try the full workflow. No database changes."
                : "Your store data, in one place."}
            </small>
          </div>
          <button
            className="profile"
            onClick={() => {
              if (demo) {
                setData(null);
                setDemo(false);
              } else
                fetch("/api/auth", { method: "DELETE" }).then(() =>
                  setData(null),
                );
            }}
          >
            <span className="avatar">{data.user.name.slice(0, 1)}</span>
            <span>
              <strong>{data.user.name}</strong>
              <small>
                {data.user.roleName ||
                  data.roles?.find((r) => r.code === data.user.role)?.name ||
                  data.user.role.replaceAll("_", " ")}
              </small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobile(!mobile)}
              aria-label="Toggle navigation"
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <GlobalSearch
            data={data}
            demo={demo}
            onSelect={(r) => {
              if (r.destination === "Billing & invoices")
                setSelectedInvoice(r.id);
              go(r.destination);
              setSearch(
                r.destination === "Sales history" ? String(r.id) : r.title,
              );
            }}
          />
          <div className="top-actions">
            <span className="live">
              <span className="online-dot" />
              {demo ? "Demo mode" : "Store online"}
            </span>
            <button
              className="icon-button"
              onClick={() => go("Inventory")}
              aria-label="Stock alerts"
            >
              <Bell size={20} />
              {low.length > 0 && <i />}
            </button>
            <span className="avatar small">{data.user.name[0]}</span>
          </div>
        </header>
        <div className="content">
          {demo && (
            <div className="demo-banner">
              <ShieldCheck size={15} />
              <span>
                Interactive demo · Sample data · Changes reset on reload
              </span>
              <button
                onClick={() => {
                  setData(null);
                  setDemo(false);
                  setCart([]);
                }}
              >
                Connect your store <ArrowRight size={13} />
              </button>
            </div>
          )}
          {notice && (
            <div className="toast">
              <Check size={17} />
              {notice}
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={15} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "Overview"
                  ? "YOUR BUSINESS AT A GLANCE"
                  : store?.name?.toUpperCase()}
              </div>
              <h1>
                {page === "Overview"
                  ? `Good ${Number(new Date().toLocaleString("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", hourCycle: "h23" })) < 12 ? "morning" : "afternoon"}, ${data.user.name.split(" ")[0]}.`
                  : page}
              </h1>
              <p>
                {
                  (
                    {
                      Overview: "Here’s what’s happening in your store today.",
                      "Point of sale": "A smooth checkout starts here.",
                      Products:
                        "Keep your catalog organized and ready to sell.",
                      Inventory: "The right stock, at the right time.",
                      Customers:
                        "Build stronger relationships with every visit.",
                      "Sales history": "Every transaction, all in one place.",
                      Reports:
                        "Filter, explore and download complete sales reports.",
                      "Billing & invoices":
                        "Professional invoices, payment tracking and customer balances.",
                      "My access":
                        "Your account currently has no workspace modules assigned.",
                      Stores: "Manage your retail locations.",
                      "Team & access":
                        "The right people. The right permissions.",
                      "Activity log":
                        "A clear record of changes across your workspace.",
                    } as Record<string, string>
                  )[page]
                }
              </p>
            </div>
            <div className="heading-actions">
              {page === "Overview" ? (
                <>
                  <span className="date-label">
                    {new Date().toLocaleDateString("en-PK", {
                      timeZone: "Asia/Karachi",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  <button
                    className="primary"
                    disabled={!can(data.user, "sales.create")}
                    onClick={() => go("Point of sale")}
                  >
                    <Plus size={17} />
                    New sale
                  </button>
                </>
              ) : page === "Products" && can(data.user, "products.write") ? (
                <button
                  className="primary"
                  onClick={() => {
                    setEdit(null);
                    setModal("product");
                  }}
                >
                  <Plus size={17} />
                  Add product
                </button>
              ) : page === "Inventory" && can(data.user, "inventory.write") ? (
                <button className="primary" onClick={() => setModal("stock")}>
                  <Plus size={17} />
                  Adjust stock
                </button>
              ) : page === "Customers" && can(data.user, "customers.write") ? (
                <button
                  className="primary"
                  onClick={() => setModal("customer")}
                >
                  <Plus size={17} />
                  Add customer
                </button>
              ) : page === "Stores" ? (
                <button className="primary" onClick={() => setModal("store")}>
                  <Plus size={17} />
                  Add store
                </button>
              ) : null}
            </div>
          </div>
          {page === "Overview" && can(data.user, "overview.view") && (
            <Dashboard data={data} demo={demo} onNavigate={go} />
          )}
          {page === "My access" && (
            <section className="panel empty">
              <ShieldCheck size={32} />
              <h2>Your account is active.</h2>
              <p>
                A super admin can assign modules and responsibilities to your
                role.
              </p>
            </section>
          )}
          {page === "Point of sale" && (
            <div className="pos-grid">
              <section>
                <div className="toolbar">
                  <div className="search">
                    <Search size={18} />
                    <input
                      placeholder="Search products or scan SKU…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <span className="muted">{filtered.length} products</span>
                </div>
                <div className="categories">
                  {[
                    "All products",
                    ...new Set(products.map((p) => p.category)),
                  ].map((c) => (
                    <button
                      className={c === category ? "active" : ""}
                      onClick={() => setCategory(c)}
                      key={c}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="product-grid">
                  {filtered.map((p) => (
                    <button
                      className="product-card"
                      onClick={() => add(p)}
                      disabled={!p.stock}
                      key={p.id}
                    >
                      <div className={`product-art ${p.color}`}>
                        <ProductIcon p={p} large />
                        <span
                          className={`badge ${p.stock <= p.reorderLevel ? "amber" : "white"}`}
                        >
                          {p.stock} in stock
                        </span>
                      </div>
                      <small>{p.category}</small>
                      <h3>{p.name}</h3>
                      <div>
                        <strong>{money(p.price)}</strong>
                        <span className="add-icon">
                          <Plus size={16} />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                {!filtered.length && (
                  <Empty text="No products found. Add products to start selling." />
                )}
              </section>
              <section className="panel checkout">
                <div className="panel-title">
                  <h2>
                    Current order{" "}
                    <span className="badge neutral">
                      {cart.reduce((n, i) => n + i.quantity, 0)}
                    </span>
                  </h2>
                  <button className="text-button" onClick={() => setCart([])}>
                    Clear
                  </button>
                </div>
                <label>
                  Customer
                  <select
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value)}
                  >
                    <option value="">Walk-in customer</option>
                    {data.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="cart-items">
                  {cartItems.length ? (
                    cartItems.map((c) => (
                      <div className="cart-item" key={c.productId}>
                        <ProductIcon p={c.product} />
                        <div>
                          <strong>{c.product.name}</strong>
                          <small>{money(c.product.price)}</small>
                          <div className="quantity">
                            <button
                              aria-label="Decrease quantity"
                              onClick={() =>
                                setCart((items) =>
                                  items
                                    .map((i) =>
                                      i.productId === c.productId
                                        ? { ...i, quantity: i.quantity - 1 }
                                        : i,
                                    )
                                    .filter((i) => i.quantity > 0),
                                )
                              }
                            >
                              <Minus size={12} />
                            </button>
                            <span>{c.quantity}</span>
                            <button
                              aria-label="Increase quantity"
                              onClick={() => add(c.product)}
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        </div>
                        <strong>{money(c.quantity * c.product.price)}</strong>
                      </div>
                    ))
                  ) : (
                    <div className="empty-cart">
                      <ShoppingBag size={40} />
                      <h3>Your order starts here</h3>
                      <p>Select a product to add it to the cart.</p>
                    </div>
                  )}
                </div>
                <div className="order-summary">
                  <div>
                    <span>Subtotal</span>
                    <strong>{money(subtotal)}</strong>
                  </div>
                  <div>
                    <span>Discount (Rs.)</span>
                    <input
                      type="number"
                      min="0"
                      max={subtotal}
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value))}
                    />
                  </div>
                  <div className="order-total">
                    <span>Total</span>
                    <strong>{money(subtotal - discount)}</strong>
                  </div>
                </div>
                <label>Payment method</label>
                <div className="payment-options">
                  {["Cash", "Card", "Transfer"].map((p) => (
                    <button
                      key={p}
                      className={payment === p ? "active" : ""}
                      onClick={() => setPayment(p)}
                    >
                      {p === "Cash" ? (
                        <Banknote size={17} />
                      ) : (
                        <CreditCard size={17} />
                      )}{" "}
                      {p}
                    </button>
                  ))}
                </div>
                <button
                  className="primary wide"
                  disabled={!cart.length || busy}
                  onClick={checkout}
                >
                  {busy ? "Processing…" : "Complete sale"}
                  <ArrowRight size={18} />
                </button>
                <small className="checkout-note">
                  Prices include any applicable tax. No additional tax is added.
                </small>
              </section>
            </div>
          )}
          {page === "Products" && (
            <section className="panel">
              <div className="toolbar">
                <div className="search">
                  <Search size={18} />
                  <input
                    placeholder="Search by product name or SKU"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filter products by category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option>All products</option>
                  {[...new Set(products.map((p) => p.category))].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <select
                  aria-label="Filter products by stock"
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value)}
                >
                  <option value="ALL">All stock levels</option>
                  <option value="LOW">Low stock</option>
                  <option value="OUT">Out of stock</option>
                  <option value="HEALTHY">Healthy stock</option>
                </select>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Category</th>
                      <th>Price / cost</th>
                      <th>Stock</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="cell-product">
                            <ProductIcon p={p} />
                            <strong>{p.name}</strong>
                          </div>
                        </td>
                        <td>{p.sku}</td>
                        <td>{p.category}</td>
                        <td>
                          <strong>{money(p.price)}</strong>
                          {(can(data.user, "products.write") ||
                            can(data.user, "inventory.view") ||
                            can(data.user, "reports.view")) && (
                            <small>{money(p.cost)} cost</small>
                          )}
                        </td>
                        <td>
                          <span
                            className={`badge ${p.stock <= p.reorderLevel ? "amber" : "green"}`}
                          >
                            {p.stock} units
                          </span>
                        </td>
                        <td>
                          <div
                            className="row-actions"
                            style={{
                              display: can(data.user, "products.write")
                                ? undefined
                                : "none",
                            }}
                          >
                            <button
                              className="icon-button"
                              aria-label={`Edit ${p.name}`}
                              onClick={() => {
                                setEdit(p);
                                setModal("product");
                              }}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Archive ${p.name}`}
                              onClick={() => {
                                setEdit(p);
                                setModal("archive");
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!filtered.length && <Empty text="No products found." />}
            </section>
          )}
          {page === "Inventory" && (
            <>
              <div className="inventory-summary">
                <div className="panel">
                  <span>Total stock units</span>
                  <h2>{products.reduce((n, p) => n + p.stock, 0)}</h2>
                </div>
                <div className="panel">
                  <span>Stock value at cost</span>
                  <h2>
                    {money(products.reduce((n, p) => n + p.stock * p.cost, 0))}
                  </h2>
                </div>
                <div className="panel">
                  <span>Products to reorder</span>
                  <h2>{low.length}</h2>
                </div>
              </div>
              <section className="panel">
                <div className="panel-title">
                  <h2>Stock levels</h2>
                  <span className="muted">Updates after every sale</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Available</th>
                        <th>Reorder at</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.name}</strong>
                            <small>{p.sku}</small>
                          </td>
                          <td>{p.stock}</td>
                          <td>{p.reorderLevel}</td>
                          <td>
                            <span
                              className={`badge ${p.stock <= p.reorderLevel ? "amber" : "green"}`}
                            >
                              {p.stock === 0
                                ? "Out of stock"
                                : p.stock <= p.reorderLevel
                                  ? "Low stock"
                                  : "Healthy"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="panel spaced">
                <div className="panel-title">
                  <h2>Stock movement history</h2>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Change</th>
                        <th>Reason</th>
                        <th>Updated by</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.movements.map((m) => (
                        <tr key={m.id}>
                          <td>{m.product}</td>
                          <td
                            className={
                              m.quantity > 0 ? "green-text" : "orange-text"
                            }
                          >
                            {m.quantity > 0 ? "+" : ""}
                            {m.quantity}
                          </td>
                          <td>{m.reason}</td>
                          <td>{m.user}</td>
                          <td>{date(m.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {page === "Customers" && (
            <section className="panel">
              <div className="toolbar">
                <div className="search">
                  <Search size={18} />
                  <input
                    placeholder="Search customers"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Email</th>
                      <th>Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.customers
                      .filter((c) =>
                        `${c.name} ${c.email} ${c.phone}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((c) => (
                        <tr key={c.id}>
                          <td>
                            <div className="cell-product">
                              <span className="avatar">{c.name[0]}</span>
                              <strong>{c.name}</strong>
                            </div>
                          </td>
                          <td>{c.email || "—"}</td>
                          <td>{c.phone || "—"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!data.customers.length && (
                <Empty text="Your customer list starts with your next connection." />
              )}
            </section>
          )}
          {page === "Sales history" && can(data.user, "sales.view") && (
            <Reports
              data={data}
              demo={demo}
              initialQuery={search}
              history
              onVoid={(id) => {
                setEdit(null);
                setModal(`void:${id}`);
              }}
              onInvoice={(id) => {
                setSelectedInvoice(id);
                go("Billing & invoices");
              }}
            />
          )}
          {page === "Reports" && can(data.user, "reports.view") && (
            <Reports
              data={data}
              demo={demo}
              onInvoice={(id) => {
                setSelectedInvoice(id);
                go("Billing & invoices");
              }}
            />
          )}
          {page === "Billing & invoices" && can(data.user, "invoices.view") && (
            <Billing
              data={data}
              demo={demo}
              initialId={selectedInvoice}
              onSelectedConsumed={() => setSelectedInvoice(null)}
              onChanged={() => {
                if (!demo) load(data.storeId).catch((e) => setError(e.message));
              }}
            />
          )}
          {page === "Stores" && (
            <div className="store-grid">
              {data.stores.map((s) => (
                <section className="panel store-card" key={s.id}>
                  <span className="quick-icon">
                    <Store size={28} />
                  </span>
                  <h2>{s.name}</h2>
                  <p>{s.address || "No address provided"}</p>
                  <span className="badge green">Active location</span>
                  <button
                    className="secondary wide"
                    onClick={() => {
                      go("Overview");
                      setCart([]);
                      if (demo) setData({ ...data, storeId: s.id });
                      else load(s.id).catch((e) => setError(e.message));
                    }}
                  >
                    Open store <ArrowRight size={16} />
                  </button>
                </section>
              ))}
            </div>
          )}
          {page === "Team & access" && data.user.role === "SUPER_ADMIN" && (
            <TeamAccess data={data} initialQuery={search} onMutate={mutate} />
          )}
          {page === "Activity log" && (
            <section className="panel">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Team member</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.audit.map((a) => (
                      <tr key={a.id}>
                        <td>{a.action}</td>
                        <td>{a.user}</td>
                        <td>{date(a.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <footer className="app-footer">
            <span>
              POS <span>·</span> A little more clarity. Every day.
            </span>
            <span>
              {store?.name} <span className="online-dot" />
            </span>
          </footer>
        </div>
      </main>
      {modal && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal}
          >
            <div className="panel-title">
              <h2>
                {modal === "product"
                  ? edit
                    ? "Edit product"
                    : "Add a product"
                  : modal === "stock"
                    ? "Adjust stock"
                    : modal === "customer"
                      ? "Add a customer"
                      : modal === "store"
                        ? "Add a store"
                        : modal === "user"
                          ? "Create an account"
                          : modal === "archive"
                            ? "Archive product"
                            : "Void this sale?"}
              </h2>
              <button
                className="icon-button"
                onClick={() => {
                  setModal(null);
                  setError("");
                }}
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            </div>
            {error && <div className="error">{error}</div>}
            {modal === "archive" || modal.startsWith("void:") ? (
              <>
                <p>
                  {modal === "archive"
                    ? `Archive ${edit?.name}? It will disappear from the catalog while historical sales remain.`
                    : "This will mark the transaction as void and restore its stock. Confirm only after handling any customer refund separately."}
                </p>
                {demo && modal.startsWith("void:") && (
                  <p className="help">
                    Demo history is synthetic; voiding those sample transactions
                    updates the status only.
                  </p>
                )}
                <button
                  className="primary wide"
                  disabled={busy}
                  onClick={() =>
                    mutate({
                      action: modal === "archive" ? "archive" : "void",
                      id:
                        modal === "archive"
                          ? edit?.id
                          : Number(modal.split(":")[1]),
                    }).catch(() => {})
                  }
                >
                  Confirm {modal === "archive" ? "archive" : "void"}
                </button>
              </>
            ) : (
              <form onSubmit={submit} key={`${modal}-${edit?.id}`}>
                {modal === "product" && (
                  <>
                    <label>
                      Product name
                      <input
                        name="name"
                        defaultValue={edit?.name}
                        required
                        maxLength={120}
                      />
                    </label>
                    <div className="form-grid">
                      <label>
                        SKU / barcode
                        <input
                          name="sku"
                          defaultValue={edit?.sku}
                          required
                          maxLength={60}
                        />
                      </label>
                      <label>
                        Category
                        <input
                          name="category"
                          defaultValue={edit?.category}
                          required
                          list="category-list"
                        />
                        <datalist id="category-list">
                          {[...new Set(products.map((p) => p.category))].map(
                            (c) => (
                              <option key={c}>{c}</option>
                            ),
                          )}
                        </datalist>
                      </label>
                      <label>
                        Selling price (Rs.)
                        <input
                          name="price"
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={edit?.price}
                          required
                        />
                      </label>
                      <label>
                        Cost price (Rs.)
                        <input
                          name="cost"
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={edit?.cost}
                          required
                        />
                      </label>
                      <label>
                        {edit
                          ? "Current stock (use Adjust stock)"
                          : "Opening stock"}
                        <input
                          name="stock"
                          type="number"
                          min="0"
                          defaultValue={edit?.stock ?? 0}
                          readOnly={!!edit}
                          required
                        />
                      </label>
                      <label>
                        Reorder level
                        <input
                          name="reorderLevel"
                          type="number"
                          min="0"
                          defaultValue={edit?.reorderLevel ?? 5}
                          required
                        />
                      </label>
                    </div>
                  </>
                )}
                {modal === "stock" && (
                  <>
                    <label>
                      Product
                      <select name="productId" required>
                        {products.map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.name} · {p.stock} available
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Quantity change
                      <input
                        name="quantity"
                        type="number"
                        required
                        placeholder="e.g. 20 to add, -3 to remove"
                      />
                    </label>
                    <label>
                      Reason
                      <input
                        name="reason"
                        required
                        minLength={3}
                        maxLength={255}
                        placeholder="Delivery, damage, stock count…"
                      />
                    </label>
                  </>
                )}
                {modal === "customer" && (
                  <>
                    <label>
                      Full name
                      <input name="name" required maxLength={120} />
                    </label>
                    <label>
                      Email
                      <input name="email" type="email" />
                    </label>
                    <label>
                      Phone
                      <input name="phone" maxLength={30} />
                    </label>
                  </>
                )}
                {modal === "store" && (
                  <>
                    <label>
                      Store name
                      <input name="name" required maxLength={120} />
                    </label>
                    <label>
                      Address
                      <input name="address" maxLength={255} />
                    </label>
                  </>
                )}
                {modal === "user" && (
                  <>
                    <label>
                      Full name
                      <input name="name" required />
                    </label>
                    <label>
                      Email
                      <input name="email" type="email" required />
                    </label>
                    <label>
                      Initial password
                      <input
                        name="password"
                        type="password"
                        minLength={10}
                        maxLength={72}
                        required
                        autoComplete="new-password"
                      />
                    </label>
                    <label>
                      Role
                      <select name="role">
                        <option value="ADMIN">Store admin</option>
                        <option value="SUPER_ADMIN">Super admin</option>
                      </select>
                    </label>
                    <label>
                      Assigned store
                      <select name="assignedStoreId">
                        {data.stores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <button className="primary wide" disabled={busy}>
                  {busy ? "Saving…" : "Save changes"}
                  <Check size={17} />
                </button>
              </form>
            )}
          </div>
        </div>
      )}
      {receipt && (
        <div className="modal-backdrop">
          <div
            className="modal receipt"
            role="dialog"
            aria-modal="true"
            aria-label="Sale receipt"
          >
            <div className="receipt-header">
              <span className="brand-icon">P</span>
              <h2>{store?.name}</h2>
              <p>{store?.address}</p>
              <span className="badge green">Sale completed</span>
              <p>
                Receipt #{receipt.id}
                <br />
                {new Date().toLocaleString("en-PK", {
                  timeZone: "Asia/Karachi",
                })}
              </p>
            </div>
            {receipt.items.map((i, index) => (
              <div className="receipt-line" key={index}>
                <span>
                  {i.name}
                  <small>
                    {i.quantity} × {money(i.price)}
                  </small>
                </span>
                <strong>{money(i.price * i.quantity)}</strong>
              </div>
            ))}
            <div className="order-summary">
              <div>
                <span>Subtotal</span>
                {money(receipt.subtotal)}
              </div>
              <div>
                <span>Discount</span>
                {money(receipt.discount)}
              </div>
              <div className="order-total">
                <span>Total</span>
                <strong>{money(receipt.total)}</strong>
              </div>
              <div>
                <span>Paid by</span>
                {receipt.payment}
              </div>
            </div>
            {receipt.invoiceId && can(data.user, "invoices.view") && (
              <button
                className="secondary wide"
                onClick={() => {
                  setSelectedInvoice(receipt.invoiceId!);
                  setReceipt(null);
                  go("Billing & invoices");
                }}
              >
                View invoice {receipt.invoiceNumber}
                <Receipt size={16} />
              </button>
            )}
            <p className="receipt-thanks">Thank you for shopping with us.</p>
            <div className="receipt-buttons">
              <button className="secondary" onClick={() => window.print()}>
                <Printer size={17} />
                Print receipt
              </button>
              <button className="primary" onClick={() => setReceipt(null)}>
                Next sale
                <ArrowRight size={17} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
