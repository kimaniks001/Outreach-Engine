import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { requireApiCapability } from "@/lib/rbac/guard";
import { db, schema } from "@/lib/db";

// Aggregate attribution weight by channel + model only — never a raw
// touchpoint/profile-level row list.
export async function GET() {
  const { response } = await requireApiCapability("view", "analytics");
  if (response) return response;

  const rows = await db
    .select({
      channel: schema.attributionRecords.channel,
      attributionModel: schema.attributionRecords.attributionModel,
      totalWeight: sql<string>`sum(${schema.attributionRecords.weight})`,
      touchCount: sql<number>`count(*)::int`,
    })
    .from(schema.attributionRecords)
    .groupBy(schema.attributionRecords.channel, schema.attributionRecords.attributionModel);

  return NextResponse.json({ attribution: rows.map((r) => ({ ...r, totalWeight: Number(r.totalWeight) })) });
}
