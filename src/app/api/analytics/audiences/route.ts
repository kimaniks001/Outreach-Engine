import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { requireApiCapability } from "@/lib/rbac/guard";
import { db, schema } from "@/lib/db";

// Aggregate lifecycle-state distribution only — never a raw profile list
// or any RESTRICTED identifier (Section 39/40).
export async function GET() {
  const { response } = await requireApiCapability("view", "analytics");
  if (response) return response;

  const rows = await db
    .select({ lifecycleState: schema.audienceProfiles.lifecycleState, count: sql<number>`count(*)::int` })
    .from(schema.audienceProfiles)
    .groupBy(schema.audienceProfiles.lifecycleState);

  return NextResponse.json({ lifecycleDistribution: rows });
}
