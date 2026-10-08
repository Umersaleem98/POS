import type { NextRequest } from "next/server";
export function sameOrigin(req: NextRequest) {
  const expected =
    process.env.APP_URL ||
    `${req.nextUrl.protocol}//${req.headers.get("host")}`;
  return req.headers.get("origin") === expected;
}
