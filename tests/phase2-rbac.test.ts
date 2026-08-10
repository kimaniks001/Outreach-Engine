import { describe, expect, it } from "vitest";
import { can, scopeFor } from "@/lib/rbac/permissions";
import { ROLES } from "@/lib/rbac/roles";

// Phase 2 RBAC — see docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md RBAC
// section for the full reasoning behind these literal Phase 0 grant-table
// applications (no doctrine was expanded to build these).

describe("intelligence resource: raw vs approved scope", () => {
  it("only OWNER and GROWTH_DIRECTOR can see raw signals/evidence", () => {
    expect(scopeFor("OWNER", "intelligence")).toBe("full");
    expect(scopeFor("GROWTH_DIRECTOR", "intelligence")).toBe("raw");
    expect(scopeFor("STRATEGIST", "intelligence")).toBe("approved");
    expect(scopeFor("CONTENT_ENGAGEMENT", "intelligence")).toBe("none");
    expect(scopeFor("DISTRIBUTION_SALES", "intelligence")).toBe("none");
    expect(scopeFor("ANALYST", "intelligence")).toBe("none");
  });

  it("only OWNER can create signals/evidence or analyze them into opportunities", () => {
    for (const role of ROLES) {
      const expected = role === "OWNER";
      expect(can(role, "create", "intelligence")).toBe(expected);
    }
  });

  it("only OWNER can approve/reject/archive opportunities or verify evidence", () => {
    for (const role of ROLES) {
      const expected = role === "OWNER";
      expect(can(role, "approve", "intelligence")).toBe(expected);
    }
  });
});

describe("campaigns resource", () => {
  it("OWNER and STRATEGIST can create campaign drafts", () => {
    expect(can("OWNER", "create", "campaigns")).toBe(true);
    expect(can("STRATEGIST", "create", "campaigns")).toBe(true);
    expect(can("GROWTH_DIRECTOR", "create", "campaigns")).toBe(false);
    expect(can("CONTENT_ENGAGEMENT", "create", "campaigns")).toBe(false);
    expect(can("DISTRIBUTION_SALES", "create", "campaigns")).toBe(false);
    expect(can("ANALYST", "create", "campaigns")).toBe(false);
  });

  it("STRATEGIST can edit campaign drafts", () => {
    expect(can("STRATEGIST", "edit", "campaigns")).toBe(true);
  });

  it("OWNER and GROWTH_DIRECTOR (and only they) can approve campaigns", () => {
    for (const role of ROLES) {
      const expected = role === "OWNER" || role === "GROWTH_DIRECTOR";
      expect(can(role, "approve", "campaigns")).toBe(expected);
    }
  });

  it("ANALYST cannot view or create campaigns at all", () => {
    expect(can("ANALYST", "view", "campaigns")).toBe(false);
    expect(can("ANALYST", "create", "campaigns")).toBe(false);
  });

  it("CONTENT_ENGAGEMENT has no access via the campaigns resource (reaches work via content instead)", () => {
    expect(can("CONTENT_ENGAGEMENT", "view", "campaigns")).toBe(false);
    expect(can("CONTENT_ENGAGEMENT", "create", "campaigns")).toBe(false);
  });
});

describe("content resource (creative variant copy)", () => {
  it("only OWNER and CONTENT_ENGAGEMENT can edit creative copy", () => {
    for (const role of ROLES) {
      const expected = role === "OWNER" || role === "CONTENT_ENGAGEMENT";
      expect(can(role, "edit", "content")).toBe(expected);
    }
  });

  it("STRATEGIST can view content but not edit it (drafts strategy, not creative copy)", () => {
    expect(can("STRATEGIST", "view", "content")).toBe(true);
    expect(can("STRATEGIST", "edit", "content")).toBe(false);
  });

  it("DISTRIBUTION_SALES and ANALYST have no content access", () => {
    expect(can("DISTRIBUTION_SALES", "view", "content")).toBe(false);
    expect(can("ANALYST", "view", "content")).toBe(false);
  });
});

describe("model-config / credentials remain protected in Phase 2", () => {
  it("no role except OWNER can administer model-config", () => {
    for (const role of ROLES) {
      const expected = role === "OWNER";
      expect(can(role, "administer", "model-config")).toBe(expected);
    }
  });

  it("no role can view credentials except OWNER", () => {
    for (const role of ROLES) {
      const expected = role === "OWNER";
      expect(can(role, "view", "credentials")).toBe(expected);
    }
  });
});
