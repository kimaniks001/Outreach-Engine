import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { reviewModelRecommendation } from "@/lib/model-evaluation/recommendations";

const bodySchema = z.object({ action: z.enum(["APPROVE", "REJECT"]) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("approve", "model-config");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  const recommendation = await reviewModelRecommendation(id, parsed.data.action, user!.id);
  if (!recommendation) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ recommendation });
}
