import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { listProfiles, sanitizeProfileForRole, createManualProfile } from "@/lib/commercial-memory/profiles";
import { schema } from "@/lib/db";

// `audience` already covers commercial memory per
// docs/ACCESS_CONTROL_MODEL.md Section 3 — see
// docs/PHASE_4_AUDIENCE_MEMORY_ATTRIBUTION_CONVERSION.md's RBAC section.
export async function GET(req: NextRequest) {
  const { user, response } = await requireApiCapability("view", "audience");
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const profiles = await listProfiles({
    profileType: (searchParams.get("profileType") as (typeof schema.profileTypeEnum.enumValues)[number]) || undefined,
    lifecycleState:
      (searchParams.get("lifecycleState") as (typeof schema.lifecycleStateEnum.enumValues)[number]) || undefined,
    organizationId: searchParams.get("organizationId") || undefined,
  });

  return NextResponse.json({ profiles: profiles.map((p) => sanitizeProfileForRole(user!.role, p)) });
}

const createSchema = z.object({
  profileType: z.enum(schema.profileTypeEnum.enumValues),
  displayName: z.string().optional(),
  organizationId: z.string().uuid().optional(),
  eligibleChannels: z.array(z.string()).optional(),
  isDemo: z.boolean().optional(),
});

// create on `audience` = OWNER only, per the literal grant table — same
// precedent as audience segments (docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md).
export async function POST(req: NextRequest) {
  const { user, response } = await requireApiCapability("create", "audience");
  if (response) return response;

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const profile = await createManualProfile(parsed.data, user!.id);
    return NextResponse.json({ profile: sanitizeProfileForRole(user!.role, profile) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "CREATE_FAILED", message }, { status: 400 });
  }
}
