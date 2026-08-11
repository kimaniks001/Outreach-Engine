import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { simulateProductEvent } from "@/lib/product-events/simulator";
import { schema } from "@/lib/db";

const profileRefSchema = z
  .object({
    profileId: z.string().uuid().optional(),
    ksNumber: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    sessionToken: z.string().optional(),
    campaignClickRef: z.string().optional(),
    partnerRef: z.string().optional(),
  })
  .refine((ref) => Object.values(ref).some((v) => v !== undefined), {
    message: "profileRef must include at least one identifier.",
  });

const simulateSchema = z.object({
  productEventType: z.enum(schema.productEventTypeEnum.enumValues),
  profileRef: profileRefSchema,
  campaignId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

// Deterministic demo/test adapter — Phase 4 brief Section 31. Every event
// produced here is forced isDemo: true (src/lib/product-events/simulator.ts)
// and clearly labeled SIMULATED / DEMO in the UI. create on `audience` =
// OWNER only.
export async function POST(req: NextRequest) {
  const { response } = await requireApiCapability("create", "audience");
  if (response) return response;

  const json = await req.json().catch(() => null);
  const parsed = simulateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  const outcome = await simulateProductEvent(parsed.data);
  return NextResponse.json({ outcome, simulated: true }, { status: outcome.status === "PROCESSED" ? 201 : 200 });
}
