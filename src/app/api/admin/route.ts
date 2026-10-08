import { passwordSchema } from "@/lib/schemas";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { ResultSetHeader } from "mysql2";
import { db, rows, type SqlValue } from "@/lib/db";
import { requireUser, APIError, apiError } from "@/lib/server-access";
import { sameOrigin } from "@/lib/request-security";
import {
  allPermissions,
  type Permission,
  type RolePolicy,
} from "@/lib/permissions";
const roleCode = z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/);
const account = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(190),
  role: roleCode,
  assignedStoreId: z.coerce.number().int().positive().nullable(),
  active: z.boolean().default(true),
});
export async function GET() {
  try {
    const user = await requireUser();
    if (user.role !== "SUPER_ADMIN")
      throw new APIError("Super admin access required", 403);
    const [users, policies] = await Promise.all([
      rows(
        "SELECT u.id,u.name,u.email,u.role,u.active,u.store_id AS storeId,COALESCE(s.name,'All stores') AS store FROM users u LEFT JOIN stores s ON s.id=u.store_id ORDER BY u.id DESC",
      ),
      rows<RolePolicy & { permissions: Permission[] | string }>(
        "SELECT code,name,description,permissions,locked FROM role_policies ORDER BY locked DESC,name",
      ),
    ]);
    return NextResponse.json({
      users,
      roles: policies.map((p) => ({
        ...p,
        locked: !!p.locked,
        permissions:
          typeof p.permissions === "string"
            ? JSON.parse(p.permissions)
            : p.permissions,
      })),
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: NextRequest) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  let user;
  try {
    user = await requireUser();
    if (user.role !== "SUPER_ADMIN")
      throw new APIError("Super admin access required", 403);
  } catch (e) {
    return apiError(e);
  }
  const connection = await db.getConnection().catch(() => null);
  if (!connection)
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 503 },
    );
  try {
    const body = await req.json();
    const action = z
      .enum(["user", "editUser", "toggleUser", "role"])
      .parse(body.action);
    await connection.beginTransaction();
    const exec = async (sql: string, values: SqlValue[]) =>
      (await connection.execute<ResultSetHeader>(sql, values))[0];
    let result: unknown = null;
    if (action === "role") {
      const p = z
        .object({
          code: roleCode,
          name: z.string().trim().min(2).max(80),
          description: z.string().trim().max(255),
          permissions: z
            .array(z.enum(allPermissions as [Permission, ...Permission[]]))
            .max(allPermissions.length),
        })
        .parse(body);
      if (p.code === "SUPER_ADMIN")
        throw new APIError("Super admin permissions are protected");
      // Enforce coherent view/write pairs so a role cannot write to invisible modules.
      const grants = new Set(p.permissions);
      for (const [write, view] of [
        ["products.write", "products.view"],
        ["inventory.write", "inventory.view"],
        ["customers.write", "customers.view"],
        ["sales.create", "products.view"],
        ["sales.void", "sales.view"],
        ["reports.export", "reports.view"],
        ["invoices.create", "invoices.view"],
        ["invoices.pay", "invoices.view"],
      ] as [Permission, Permission][])
        if (grants.has(write) && !grants.has(view))
          throw new APIError(`${write} also requires ${view}`);
      await exec(
        body.create
          ? "INSERT INTO role_policies(code,name,description,permissions,locked) VALUES (?,?,?,?,0)"
          : "INSERT INTO role_policies(code,name,description,permissions,locked) VALUES (?,?,?,?,0) ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),permissions=VALUES(permissions)",
        [p.code, p.name, p.description, JSON.stringify([...grants])],
      );
    }
    if (action === "user" || action === "editUser") {
      const p = account.parse(body);
      const [roles] = await connection.execute(
        "SELECT code FROM role_policies WHERE code=?",
        [p.role],
      );
      if (!(roles as unknown[]).length)
        throw new APIError("Select an existing role");
      if (p.role !== "SUPER_ADMIN" && !p.assignedStoreId)
        throw new APIError("This role requires an assigned store");
      if (p.assignedStoreId) {
        const [stores] = await connection.execute(
          "SELECT id FROM stores WHERE id=?",
          [p.assignedStoreId],
        );
        if (!(stores as unknown[]).length)
          throw new APIError("Select an existing store");
      }
      if (action === "user") {
        const password = passwordSchema.parse(body.password);
        const r = await exec(
          "INSERT INTO users(name,email,password_hash,role,store_id,active) VALUES (?,?,?,?,?,?)",
          [
            p.name,
            p.email,
            await bcrypt.hash(password, 12),
            p.role,
            p.assignedStoreId,
            p.active,
          ],
        );
        result = { id: r.insertId };
      } else {
        const id = z.number().int().positive().parse(body.id);
        const [owners] = await connection.execute(
          "SELECT id FROM users WHERE role='SUPER_ADMIN' AND active=1 ORDER BY id FOR UPDATE",
        );
        const [matches] = await connection.execute(
          "SELECT id,role,store_id AS storeId FROM users WHERE id=? FOR UPDATE",
          [id],
        );
        const target = (
          matches as { id: number; role: string; storeId: number | null }[]
        )[0];
        if (!target) throw new APIError("Account not found", 404);
        if (
          id === user.id &&
          (p.role !== user.role ||
            !p.active ||
            p.assignedStoreId !== user.storeId)
        )
          throw new APIError(
            "You cannot change your own role, assigned store or active status",
          );
        if (
          target.role === "SUPER_ADMIN" &&
          (p.role !== "SUPER_ADMIN" || !p.active) &&
          (owners as unknown[]).length <= 1
        )
          throw new APIError("At least one active super admin must remain");
        await exec(
          "UPDATE users SET name=?,email=?,role=?,store_id=?,active=? WHERE id=?",
          [p.name, p.email, p.role, p.assignedStoreId, p.active, id],
        );
      }
    }
    if (action === "toggleUser") {
      const id = z.number().int().positive().parse(body.id);
      if (id === user.id)
        throw new APIError("You cannot deactivate your own account");
      const [owners] = await connection.execute(
        "SELECT id FROM users WHERE role='SUPER_ADMIN' AND active=1 ORDER BY id FOR UPDATE",
      );
      const [matches] = await connection.execute(
        "SELECT role,active FROM users WHERE id=? FOR UPDATE",
        [id],
      );
      const target = (matches as { role: string; active: number }[])[0];
      if (!target) throw new APIError("Account not found", 404);
      if (
        target.role === "SUPER_ADMIN" &&
        target.active &&
        (owners as unknown[]).length <= 1
      )
        throw new APIError("At least one active super admin must remain");
      await exec("UPDATE users SET active=NOT active WHERE id=?", [id]);
    }
    await exec("INSERT INTO audit_logs(user_id,action) VALUES (?,?)", [
      user.id,
      `${action}: ${body.code || body.email || body.id}`,
    ]);
    await connection.commit();
    return NextResponse.json({ success: true, result });
  } catch (e) {
    await connection.rollback();
    if (e instanceof z.ZodError)
      return NextResponse.json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    if ((e as { code?: string }).code === "ER_DUP_ENTRY")
      return NextResponse.json(
        { error: "This email or role code is already in use" },
        { status: 400 },
      );
    return apiError(e);
  } finally {
    connection.release();
  }
}
