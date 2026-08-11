import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { getProfile, sanitizeProfileForRole } from "@/lib/commercial-memory/profiles";
import { getOrganization } from "@/lib/commercial-memory/organizations";
import { isSuppressed, getConsentHistory } from "@/lib/commercial-memory/consent";
import { listTouchpoints } from "@/lib/commercial-memory/touchpoints";
import { listJourneys } from "@/lib/journeys/journeys";
import { listConversions } from "@/lib/attribution/conversions";
import { getCurrentNextBestAction } from "@/lib/next-best-action/engine";
import { getCurrentRetargetingEligibility } from "@/lib/next-best-action/retargeting";

// Profile detail — Phase 4 brief Section 29. RESTRICTED identifiers are
// stripped for every role but OWNER (sanitizeProfileForRole); everything
// else here is CONFIDENTIAL-level commercial-memory conclusion, which the
// `audience` view grant already covers.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("view", "audience");
  if (response) return response;

  const { id } = await params;
  const profile = await getProfile(id);
  if (!profile) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const [organization, suppressed, consentHistory, touchpoints, journeys, conversions, nextBestAction, retargeting] =
    await Promise.all([
      profile.organizationId ? getOrganization(profile.organizationId) : Promise.resolve(null),
      isSuppressed(id),
      getConsentHistory(id),
      listTouchpoints({ profileId: id }),
      listJourneys({ profileId: id }),
      listConversions({ profileId: id }),
      getCurrentNextBestAction(id),
      getCurrentRetargetingEligibility(id),
    ]);

  return NextResponse.json({
    profile: sanitizeProfileForRole(user!.role, profile),
    organization,
    suppressed,
    consentHistory,
    touchpoints,
    journeys,
    conversions,
    nextBestAction,
    retargetingEligibility: retargeting,
  });
}
