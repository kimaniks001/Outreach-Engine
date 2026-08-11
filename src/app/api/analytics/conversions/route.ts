import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { requireApiCapability } from "@/lib/rbac/guard";
import { db, schema } from "@/lib/db";

// Aggregate-only — counts by conversion type, never a raw per-profile row
// list (Section 39: no profile-level restricted data).
export async function GET() {
  const { response } = await requireApiCapability("view", "analytics");
  if (response) return response;

  const rows = await db
    .select({ conversionType: schema.conversionEvents.conversionType, count: sql<number>`count(*)::int` })
    .from(schema.conversionEvents)
    .groupBy(schema.conversionEvents.conversionType);

  return NextResponse.json({ conversions: rows });
}
