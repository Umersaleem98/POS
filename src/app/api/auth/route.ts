import { sameOrigin } from "@/lib/request-security";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { currentUser, session, type User } from "@/lib/auth";
import { db, rows } from "@/lib/db";
import { allowLogin } from "@/lib/rate-limit";
export async function GET() {
  try {
    return NextResponse.json({ user: await currentUser() });
  } catch {
    return NextResponse.json(
      {
        error:
          "Database unavailable. Start XAMPP MySQL and run npm run db:setup.",
      },
      { status: 503 },
    );
  }
}
export async function POST(req: NextRequest) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const { email, password } = z
      .object({ email: z.email(), password: z.string().max(72) })
      .parse(await req.json());
    if (!(await allowLogin(email)))
      return NextResponse.json(
        { error: "Too many sign-in attempts. Try again in 15 minutes." },
        { status: 429, headers: { "Retry-After": "900" } },
      );
    const users = await rows<User & { password_hash: string }>(
      "SELECT id,name,email,role,store_id AS storeId,password_hash FROM users WHERE email = ? AND active = 1",
      [email],
    );
    const user = users[0];
    // A fixed bcrypt hash also makes unknown-account requests perform password hashing work.
    const valid = await bcrypt.compare(
      password,
      user?.password_hash ||
        "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxgKVnxM.c9XG29./EzDzH.B0Wu",
    );
    if (!user || !valid)
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    await session(user);
    await db.execute("INSERT INTO audit_logs(user_id,action) VALUES (?,?)", [
      user.id,
      "Signed in",
    ]);
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        storeId: user.storeId,
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Enter a valid email and password"
            : "Sign-in unavailable. Check the database and SESSION_SECRET configuration.",
      },
      { status: 400 },
    );
  }
}
export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  (await cookies()).delete("pos_session");
  return NextResponse.json({ success: true });
}
