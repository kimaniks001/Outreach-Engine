import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { listRecentAuditEvents } from "@/lib/audit/log";

export async function GET() {
  const { response } = await requireApiCapability("view", "audit");
  if (response) return response;

  const events = await listRecentAuditEvents(100);
  return NextResponse.json({ events });
}
