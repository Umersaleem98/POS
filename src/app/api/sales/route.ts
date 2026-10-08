import type { NextRequest } from "next/server";
import { reportResponse } from "@/lib/report-service";
export async function GET(req: NextRequest) {
  return reportResponse(req, true);
}
