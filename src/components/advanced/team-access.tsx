"use client";
import { useEffect, useState } from "react";
import {
  Plus,
  ShieldCheck,
  Users,
  Pencil,
  LockKeyhole,
  Check,
  UserRound,
  SlidersHorizontal,
} from "lucide-react";
import { type WorkspaceData } from "@/lib/types";
import {
  type Permission,
  type RolePolicy,
  permissionGroups,
  defaultRoles,
} from "@/lib/permissions";
import { SearchInput, Pagination, Dialog } from "./shared";
type Account = WorkspaceData["users"][number];
const permissionLabel: Record<string, string> = {
  "overview.view": "View dashboard",
  "products.view": "View catalog",
  "products.write": "Create, edit and archive products",
  "inventory.view": "View stock and movement history",
  "inventory.write": "Adjust stock",
  "customers.view": "View customers",
  "customers.write": "Create customers",
  "sales.view": "View sales history",
  "sales.create": "Complete checkout sales",
  "sales.void": "Void sales and restore stock",
  "reports.view": "View financial reports",
  "reports.export": "Download PDF and CSV reports",
  "invoices.view": "View and download invoices",
  "invoices.create": "Create and cancel unpaid invoices",
  "invoices.pay": "Record invoice payments",
};
const dependencies: Partial<Record<Permission, Permission>> = {
  "products.write": "products.view",
  "inventory.write": "inventory.view",
  "customers.write": "customers.view",
  "sales.create": "products.view",
  "sales.void": "sales.view",
  "reports.export": "reports.view",
  "invoices.create": "invoices.view",
  "invoices.pay": "invoices.view",
};
export default function TeamAccess({
  data,
  onMutate,
  initialQuery = "",
}: {
  initialQuery?: string;
  data: WorkspaceData;
  onMutate: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const roles = data.roles || defaultRoles;
  const [tab, setTab] = useState("users"),
    [q, setQ] = useState(initialQuery),
    [roleFilter, setRoleFilter] = useState("ALL"),
    [status, setStatus] = useState("ALL"),
    [page, setPage] = useState(1),
    [account, setAccount] = useState<Account | null | undefined>(undefined),
    [policy, setPolicy] = useState<RolePolicy | null>(null),
    [editingPolicy, setEditingPolicy] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setQ(initialQuery);
    setPage(1);
  }, [initialQuery]);
  const list = data.users.filter(
    (u) =>
      `${u.name} ${u.email} ${u.store}`
        .toLowerCase()
        .includes(q.toLowerCase()) &&
      (roleFilter === "ALL" || u.role === roleFilter) &&
      (status === "ALL" || (status === "ACTIVE" ? !!u.active : !u.active)),
  );
  function openAccount(u: Account | null) {
    setError("");
    setAccount(u);
  }
  async function saveAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    try {
      await onMutate({
        ...f,
        action: account ? "editUser" : "user",
        id: account?.id,
        assignedStoreId: f.assignedStoreId ? Number(f.assignedStoreId) : null,
        active: f.active === "1",
      });
      setAccount(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function savePolicy(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!policy) return;
    setBusy(true);
    setError("");
    try {
      if (!editingPolicy && roles.some((r) => r.code === policy.code))
        throw new Error(
          "This role code already exists. Edit its existing card instead.",
        );
      await onMutate({ ...policy, action: "role", create: !editingPolicy });
      setPolicy(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function grant(permission: Permission, enabled: boolean) {
    if (!policy) return;
    const grants = new Set(policy.permissions);
    if (enabled) {
      grants.add(permission);
      if (dependencies[permission]) grants.add(dependencies[permission]!);
    } else {
      grants.delete(permission);
      for (const [child, parent] of Object.entries(dependencies))
        if (parent === permission) grants.delete(child as Permission);
    }
    setPolicy({ ...policy, permissions: [...grants] });
  }
  return (
    <div>
      <div className="team-summary">
        <div>
          <span className="quick-icon">
            <Users size={23} />
          </span>
          <strong>
            {data.users.length}
            <small>Team members</small>
          </strong>
        </div>
        <div>
          <span className="quick-icon">
            <ShieldCheck size={23} />
          </span>
          <strong>
            {roles.length}
            <small>Access roles</small>
          </strong>
        </div>
        <div>
          <span className="quick-icon">
            <UserRound size={23} />
          </span>
          <strong>
            {data.users.filter((u) => u.active).length}
            <small>Active accounts</small>
          </strong>
        </div>
      </div>
      <div className="section-tabs">
        <button
          className={tab === "users" ? "active" : ""}
          onClick={() => setTab("users")}
        >
          <Users size={17} />
          Team members
        </button>
        <button
          className={tab === "roles" ? "active" : ""}
          onClick={() => setTab("roles")}
        >
          <ShieldCheck size={17} />
          Roles & responsibilities
        </button>
        <button
          className="primary"
          onClick={() => {
            if (tab === "users") openAccount(null);
            else {
              setError("");
              setEditingPolicy(false);
              setPolicy({
                code: "",
                name: "",
                description: "",
                permissions: [],
                locked: false,
              });
            }
          }}
        >
          <Plus size={16} />
          {tab === "users" ? "Add user" : "Create role"}
        </button>
      </div>
      {tab === "users" ? (
        <section className="panel">
          <div className="filter-toolbar">
            <SearchInput
              value={q}
              onChange={(v) => {
                setQ(v);
                setPage(1);
              }}
              placeholder="Search team by name, email or store"
            />
            <select
              aria-label="Filter team by role"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">All roles</option>
              {roles.map((r) => (
                <option value={r.code} key={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter team by status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Disabled</option>
            </select>
          </div>
          <div className="table-wrap">
            <table className="advanced-table">
              <thead>
                <tr>
                  <th>Team member</th>
                  <th>Role</th>
                  <th>Assigned store</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.slice((page - 1) * 10, page * 10).map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="cell-product">
                        <span className="avatar">{u.name[0]}</span>
                        <div>
                          <strong>
                            {u.name}
                            {u.id === data.user.id && (
                              <span className="you-label">You</span>
                            )}
                          </strong>
                          <small>{u.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`role-badge ${u.role === "SUPER_ADMIN" ? "owner" : ""}`}
                      >
                        <ShieldCheck size={12} />
                        {roles.find((r) => r.code === u.role)?.name || u.role}
                      </span>
                    </td>
                    <td>{u.role === "SUPER_ADMIN" ? "All stores" : u.store}</td>
                    <td>
                      <span
                        className={`badge ${u.active ? "green" : "neutral"}`}
                      >
                        <span className="status-dot" />
                        {u.active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => openAccount(u)}
                      >
                        <Pencil size={13} />
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!list.length && (
            <div className="empty">No team members match your filters.</div>
          )}
          <Pagination
            page={page}
            total={list.length}
            size={10}
            onChange={setPage}
          />
        </section>
      ) : (
        <>
          <div className="permissions-explainer">
            <LockKeyhole size={21} />
            <div>
              <strong>
                Permissions follow the role, store access follows the account.
              </strong>
              <p>
                Changes apply on the next server request. Administration and
                access to all stores are reserved for Super Admin.
              </p>
            </div>
          </div>
          <div className="role-grid">
            {roles.map((r) => (
              <section className="panel role-card" key={r.code}>
                <div className="role-card-heading">
                  <span className={`quick-icon ${r.locked ? "navy" : ""}`}>
                    <ShieldCheck size={23} />
                  </span>
                  <span className="badge neutral">
                    {data.users.filter((u) => u.role === r.code).length} members
                  </span>
                </div>
                <h2>{r.name}</h2>
                <p>{r.description}</p>
                <div className="role-module-tags">
                  {Object.entries(permissionGroups)
                    .filter(([, list]) =>
                      list.some((p) => r.permissions.includes(p)),
                    )
                    .map(([group]) => (
                      <span key={group}>{group}</span>
                    ))}
                </div>
                <button
                  className="secondary wide"
                  onClick={() => {
                    setError("");
                    setEditingPolicy(true);
                    setPolicy(structuredClone(r));
                  }}
                >
                  {r.locked ? (
                    <LockKeyhole size={14} />
                  ) : (
                    <SlidersHorizontal size={14} />
                  )}{" "}
                  {r.locked
                    ? "View protected permissions"
                    : "Edit responsibilities"}
                </button>
              </section>
            ))}
          </div>
        </>
      )}
      {account !== undefined && (
        <Dialog
          title={account ? "Manage team member" : "Add a team member"}
          onClose={() => setAccount(undefined)}
        >
          {error && <div className="error">{error}</div>}
          <form onSubmit={saveAccount}>
            <div className="form-grid">
              <label>
                Full name
                <input
                  name="name"
                  defaultValue={account?.name}
                  required
                  maxLength={120}
                />
              </label>
              <label>
                Email address
                <input
                  type="email"
                  name="email"
                  defaultValue={account?.email}
                  required
                  maxLength={190}
                />
              </label>
            </div>
            {!account && (
              <label>
                Initial password
                <input
                  type="password"
                  name="password"
                  minLength={10}
                  maxLength={72}
                  required
                  autoComplete="new-password"
                />
                <small>
                  At least 10 characters. Share credentials with the user
                  directly.
                </small>
              </label>
            )}
            <div className="form-grid">
              <label>
                Role
                <select name="role" defaultValue={account?.role || "USER"}>
                  {roles.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assigned store
                <select
                  name="assignedStoreId"
                  defaultValue={
                    account ? (account.storeId ?? "") : data.storeId
                  }
                >
                  <option value="">All stores (super admin only)</option>
                  {data.stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Account status
              <select
                name="active"
                defaultValue={account?.active === 0 ? "0" : "1"}
              >
                <option value="1">Active</option>
                <option value="0">Disabled</option>
              </select>
            </label>
            <div className="form-note">
              <ShieldCheck size={16} />
              <span>
                You can update any account. Your own role and active status are
                protected to prevent accidental lockout.
              </span>
            </div>
            <button className="primary wide" disabled={busy}>
              {busy
                ? "Saving…"
                : account
                  ? "Save account changes"
                  : "Create account"}
              <Check size={16} />
            </button>
          </form>
        </Dialog>
      )}
      {policy && (
        <Dialog
          title={
            policy.locked
              ? "Protected super admin role"
              : policy.code
                ? "Edit role responsibilities"
                : "Create a role"
          }
          onClose={() => setPolicy(null)}
          wide
        >
          {error && <div className="error">{error}</div>}
          <form onSubmit={savePolicy}>
            <div className="form-grid">
              <label>
                Role name
                <input
                  value={policy.name}
                  readOnly={policy.locked}
                  onChange={(e) =>
                    setPolicy({ ...policy, name: e.target.value })
                  }
                  required
                  maxLength={80}
                />
              </label>
              <label>
                Role code
                <input
                  value={policy.code}
                  readOnly={policy.locked || editingPolicy}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      code: e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9_]/g, ""),
                    })
                  }
                  placeholder="e.g. STORE_SUPERVISOR"
                  required
                  pattern="[A-Z][A-Z0-9_]{1,31}"
                  maxLength={32}
                />
              </label>
            </div>
            <label>
              Responsibilities
              <input
                value={policy.description}
                readOnly={policy.locked}
                onChange={(e) =>
                  setPolicy({ ...policy, description: e.target.value })
                }
                maxLength={255}
              />
            </label>
            <div className="permission-grid">
              {Object.entries(permissionGroups).map(([group, permissions]) => (
                <section className="permission-group" key={group}>
                  <h3>{group}</h3>
                  {permissions.map((p) => (
                    <label className="check-label" key={p}>
                      <input
                        type="checkbox"
                        checked={policy.permissions.includes(p)}
                        disabled={policy.locked}
                        onChange={(e) => grant(p, e.target.checked)}
                      />
                      <span>{permissionLabel[p]}</span>
                    </label>
                  ))}
                </section>
              ))}
            </div>
            {policy.locked ? (
              <div className="form-note">
                <LockKeyhole size={17} />
                <span>
                  Super admin always retains full operational, user management
                  and role management access.
                </span>
              </div>
            ) : (
              <button className="primary wide" disabled={busy}>
                {busy ? "Saving…" : "Save role & permissions"}
                <Check size={16} />
              </button>
            )}
          </form>
        </Dialog>
      )}
    </div>
  );
}
