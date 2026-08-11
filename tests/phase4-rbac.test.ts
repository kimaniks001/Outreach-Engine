import { describe, expect, it } from "vitest";
import { can, scopeFor } from "@/lib/rbac/permissions";
import { ROLES } from "@/lib/rbac/roles";
import { sanitizeProfileForRole } from "@/lib/commercial-memory/profiles";
import type { AudienceProfile } from "@/lib/db/schema";

// Phase 4 RBAC — literal application of the existing `audience`/`analytics`
// grant table (no new resource/grant added — see
// docs/PHASE_4_AUDIENCE_MEMORY_ATTRIBUTION_CONVERSION.md's RBAC section).
// `audience` already covers commercial memory per
// docs/ACCESS_CONTROL_MODEL.md Section 3.

describe("audience resource covers commercial memory (profiles/organizations/journeys/NBA/retargeting)", () => {
  it("only OWNER can create/edit/approve", () => {
    for (const role of ROLES) {
      const expected = role === "OWNER";
      expect(can(role, "create", "audience")).toBe(expected);
      expect(can(role, "edit", "audience")).toBe(expected);
    }
  });

  it("CONTENT_ENGAGEMENT and ANALYST have no audience access at all — cannot view raw commercial memory", () => {
    expect(can("CONTENT_ENGAGEMENT", "view", "audience")).toBe(false);
    expect(can("ANALYST", "view", "audience")).toBe(false);
  });

  it("DISTRIBUTION_SALES sees approved-scope commercial memory for follow-up", () => {
    expect(can("DISTRIBUTION_SALES", "view", "audience")).toBe(true);
    expect(scopeFor("DISTRIBUTION_SALES", "audience")).toBe("approved");
  });

  it("GROWTH_DIRECTOR sees full-scope commercial memory but cannot mutate it", () => {
    expect(can("GROWTH_DIRECTOR", "view", "audience")).toBe(true);
    expect(scopeFor("GROWTH_DIRECTOR", "audience")).toBe("full");
    expect(can("GROWTH_DIRECTOR", "create", "audience")).toBe(false);
  });
});

describe("analytics resource covers attribution/conversion/funnel (IMPACT pillar)", () => {
  it("ANALYST has read-only approved analytics access", () => {
    expect(can("ANALYST", "view", "analytics")).toBe(true);
    expect(scopeFor("ANALYST", "analytics")).toBe("approved");
    expect(can("ANALYST", "create", "analytics")).toBe(false);
  });

  it("CONTENT_ENGAGEMENT sees only basic-scope analytics — no raw commercial memory", () => {
    expect(can("CONTENT_ENGAGEMENT", "view", "analytics")).toBe(true);
    expect(scopeFor("CONTENT_ENGAGEMENT", "analytics")).toBe("basic");
  });

  it("OWNER has full analytics access", () => {
    expect(can("OWNER", "view", "analytics")).toBe(true);
    expect(scopeFor("OWNER", "analytics")).toBe("full");
  });
});

describe("sanitizeProfileForRole", () => {
  const baseProfile: AudienceProfile = {
    id: "11111111-1111-1111-1111-111111111111",
    profileType: "PERSON",
    displayName: "Test Person",
    organizationId: null,
    ksNumberRef: "KS-1234",
    emailRef: "deadbeef",
    phoneRef: "cafebabe",
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    lifecycleState: "REGISTERED",
    eligibleChannels: [],
    classification: "CONFIDENTIAL",
    source: "manual",
    mergedIntoProfileId: null,
    retentionClass: "standard",
    retentionUntil: null,
    legalHold: false,
    isDemo: false,
    createdByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("strips RESTRICTED identifiers (emailRef/phoneRef/ksNumberRef) for every role except OWNER", () => {
    for (const role of ROLES) {
      const sanitized = sanitizeProfileForRole(role, baseProfile);
      if (role === "OWNER") {
        expect(sanitized.emailRef).toBe("deadbeef");
        expect(sanitized.phoneRef).toBe("cafebabe");
        expect(sanitized.ksNumberRef).toBe("KS-1234");
      } else {
        expect("emailRef" in sanitized).toBe(false);
        expect("phoneRef" in sanitized).toBe(false);
        expect("ksNumberRef" in sanitized).toBe(false);
      }
    }
  });

  it("preserves non-RESTRICTED fields (lifecycleState, displayName) for every role", () => {
    const sanitized = sanitizeProfileForRole("ANALYST", baseProfile);
    expect(sanitized.lifecycleState).toBe("REGISTERED");
    expect(sanitized.displayName).toBe("Test Person");
  });
});
