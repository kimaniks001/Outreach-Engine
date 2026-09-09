import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export function authorizeSupportWorker(req: NextRequest): boolean {
  const configured = process.env.SUPPORT_WORKER_SECRET?.trim() ?? "";
  if (!configured) return false;
  const authorization = req.headers.get("authorization")?.trim() ?? "";
  if (!authorization.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length).trim();
  if (!supplied) return false;
  return constantTimeEqual(supplied, configured);
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
