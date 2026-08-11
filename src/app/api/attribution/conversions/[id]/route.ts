import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { getAttributionForConversion } from "@/lib/attribution/conversions";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiCapability("view", "analytics");
  if (response) return response;

  const { id } = await params;
  const [conversion] = await db.select().from(schema.conversionEvents).where(eq(schema.conversionEvents.id, id)).limit(1);
  if (!conversion) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const attribution = await getAttributionForConversion(id);
  return NextResponse.json({ conversion, attribution });
}
