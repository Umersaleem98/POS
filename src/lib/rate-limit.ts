import { createHash } from "node:crypto";
import { db, rows } from "./db";
// Stored in MySQL so the limit survives app restarts and applies across workers.
export async function allowLogin(email: string) {
  const key = createHash("sha256").update(email.toLowerCase()).digest("hex");
  await db.execute(
    "INSERT INTO login_limits (limit_key, attempts, window_start) VALUES (?,1,NOW()) ON DUPLICATE KEY UPDATE attempts=IF(window_start < DATE_SUB(NOW(),INTERVAL 15 MINUTE),1,attempts+1),window_start=IF(window_start < DATE_SUB(NOW(),INTERVAL 15 MINUTE),NOW(),window_start)",
    [key],
  );
  const [limit] = await rows<{ attempts: number }>(
    "SELECT attempts FROM login_limits WHERE limit_key=?",
    [key],
  );
  return limit.attempts <= 10;
}
