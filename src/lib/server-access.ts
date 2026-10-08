import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { currentUser, type User } from "./auth";
import { can, type Permission } from "./permissions";
export class APIError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function requireUser(permission?: Permission) {
  const user = await currentUser();
  if (!user) throw new APIError("Please sign in", 401);
  if (permission && !can(user, permission))
    throw new APIError("Your role does not allow this operation", 403);
  return user;
}
export function storeScope(user: User, req: NextRequest) {
  const id =
    user.role === "SUPER_ADMIN"
      ? Number(req.nextUrl.searchParams.get("storeId") || user.storeId || 1)
      : user.storeId;
  if (!id || !Number.isInteger(id) || id < 1)
    throw new APIError("Select a valid store");
  return id;
}
export function apiError(e: unknown) {
  return NextResponse.json(
    {
      error:
        e instanceof APIError
          ? e.message
          : "Unable to complete this request. Please check your inputs and connection.",
    },
    { status: e instanceof APIError ? e.status : 500 },
  );
}
