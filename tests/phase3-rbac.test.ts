import { describe, expect, it } from "vitest";
import { can, scopeFor } from "@/lib/rbac/permissions";
import { ROLES } from "@/lib/rbac/roles";

// Phase 3 RBAC — literal application of the existing
// docs/ACCESS_CONTROL_MODEL.md Section 4 grant table, same discipline as
// Phase 2. See docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md's RBAC
// reading-decision section for the full reasoning.

describe("audience resource", () => {
  it("only OWNER can create/edit/approve audience segments", () => {
    for (const role of ROLES) {
      const expected = role === "OWNER";
      expect(can(role, "create", "audience")).toBe(expected);
      expect(can(role, "edit", "audience")).toBe(expected);
      expect(can(role, "approve", "audience")).toBe(expected);
    }
  });

  it("GROWTH_DIRECTOR sees the full audience scope; STRATEGIST/DISTRIBUTION_SALES see approved only", () => {
    expect(scopeFor("OWNER", "audience")).toBe("full");
    expect(scopeFor("GROWTH_DIRECTOR", "audience")).toBe("full");
    expect(scopeFor("STRATEGIST", "audience")).toBe("approved");
    expect(scopeFor("DISTRIBUTION_SALES", "audience")).toBe("approved");
  });

  it("CONTENT_ENGAGEMENT and ANALYST have no audience access at all", () => {
    expect(can("CONTENT_ENGAGEMENT", "view", "audience")).toBe(false);
    expect(can("ANALYST", "view", "audience")).toBe(false);
  });
});

describe("distribution resource: budget/execution approval is Owner-only", () => {
  it("only OWNER can approve distribution plans or budgets — GROWTH_DIRECTOR is view-only here, unlike campaigns", () => {
    for (const role of ROLES) {
      const expected = role === "OWNER";
      expect(can(role, "approve", "distribution")).toBe(expected);
    }
    // The contrast that motivates this reading decision: GROWTH_DIRECTOR
    // *can* approve campaigns but *cannot* approve distribution.
    expect(can("GROWTH_DIRECTOR", "approve", "campaigns")).toBe(true);
    expect(can("GROWTH_DIRECTOR", "approve", "distribution")).toBe(false);
  });

  it("OWNER and DISTRIBUTION_SALES can create/edit distribution plans", () => {
    for (const role of ROLES) {
      const expected = role === "OWNER" || role === "DISTRIBUTION_SALES";
      expect(can(role, "create", "distribution")).toBe(expected);
      expect(can(role, "edit", "distribution")).toBe(expected);
    }
  });

  it("STRATEGIST and GROWTH_DIRECTOR can view but not create distribution plans", () => {
    expect(can("STRATEGIST", "view", "distribution")).toBe(true);
    expect(can("STRATEGIST", "create", "distribution")).toBe(false);
    expect(can("GROWTH_DIRECTOR", "view", "distribution")).toBe(true);
    expect(can("GROWTH_DIRECTOR", "create", "distribution")).toBe(false);
  });

  it("CONTENT_ENGAGEMENT has no distribution access — no distribution-control access leak from content work", () => {
    expect(can("CONTENT_ENGAGEMENT", "view", "distribution")).toBe(false);
    expect(can("CONTENT_ENGAGEMENT", "create", "distribution")).toBe(false);
    expect(can("CONTENT_ENGAGEMENT", "approve", "distribution")).toBe(false);
  });

  it("ANALYST has read-only access to nothing on distribution (no mutation, no view grant)", () => {
    expect(can("ANALYST", "view", "distribution")).toBe(false);
    expect(can("ANALYST", "create", "distribution")).toBe(false);
    expect(can("ANALYST", "approve", "distribution")).toBe(false);
  });
});
