import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { addVariant } from "@/lib/experiments/experiments";

const createSchema = z.object({
  variantLabel: z.string().min(1),
  isControl: z.boolean().optional(),
  messagingAngle: z.string().min(1),
  creativeVariantId: z.string().uuid().optional(),
  cta: z.string().min(1),
  distributionPlanId: z.string().uuid().optional(),
  description: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiCapability("edit", "campaigns");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const variant = await addVariant({ experimentId: id, ...parsed.data });
    return NextResponse.json({ variant }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "CREATE_FAILED", message }, { status: 400 });
  }
}
