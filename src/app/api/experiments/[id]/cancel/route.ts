import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { cancelExperiment } from "@/lib/experiments/experiments";

const bodySchema = z.object({ reason: z.string().optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("edit", "campaigns");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  const experiment = await cancelExperiment(id, user!.id, parsed.data.reason);
  if (!experiment) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ experiment });
}
