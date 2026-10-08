import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { rows } from "./db";
import { type Permission, allPermissions } from "./permissions";
export type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  permissions?: Permission[];
  roleName?: string;
  storeId: number | null;
};
function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith("replace-"))
    throw new Error(
      "Configure SESSION_SECRET in .env (32+ random characters).",
    );
  return new TextEncoder().encode(secret);
}
export async function session(user: User) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(key());
  (await cookies()).set("pos_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 28800,
  });
}
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get("pos_session")?.value;
  if (!token) return null;
  let id: number;
  try {
    const { payload } = await jwtVerify(token, key(), {
      algorithms: ["HS256"],
    });
    id = Number(payload.sub);
  } catch {
    return null;
  }
  const list = await rows<User>(
    "SELECT id, name, email, role, store_id AS storeId FROM users WHERE id = ? AND active = 1",
    [id],
  );
  const user = list[0];
  if (!user) return null;
  if (user.role === "SUPER_ADMIN") {
    user.permissions = allPermissions;
    user.roleName = "Super admin";
  } else {
    const policy = await rows<{
      name: string;
      permissions: string | Permission[];
    }>("SELECT name,permissions FROM role_policies WHERE code=?", [user.role]);
    user.roleName = policy[0]?.name || user.role.replaceAll("_", " ");
    user.permissions = policy[0]
      ? typeof policy[0].permissions === "string"
        ? JSON.parse(policy[0].permissions)
        : policy[0].permissions
      : [];
  }
  return user;
}
