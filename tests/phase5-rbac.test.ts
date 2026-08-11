import { describe, expect, it } from "vitest";
import { can, scopeFor } from "@/lib/rbac/permissions";
import { ROLES } from "@/lib/rbac/roles";

// Phase 5 RBAC — literal application of the existing grant table, no new
// resource/grant. See docs/PHASE_5_IMPACT_GROWTH_DIRECTOR_SCALE.md's RBAC
// section: `campaigns` gates experiments/learnings, `analytics` gates
// Growth Director recommendations/impact, `model-config` gates model
// performance/recommendations/benchmark/AI budget, `audience` gates
// retention.

describe("experiments/learnings gated by `campaigns` (same as Phase 2 campaign work)", () => {
  it("only OWNER and STRATEGIST can create experiments", () => {
    for (const role of ROLES) {
      const expected = role === "OWNER" || role === "STRATEGIST";
      expect(can(role, "create", "campaigns")).toBe(expected);
    }
  });

  it("GROWTH_DIRECTOR can view and approve experiments but never create them", () => {
    expect(can("GROWTH_DIRECTOR", "view", "campaigns")).toBe(true);
    expect(can("GROWTH_DIRECTOR", "approve", "campaigns")).toBe(true);
    expect(can("GROWTH_DIRECTOR", "create", "campaigns")).toBe(false);
  });

  it("CONTENT_ENGAGEMENT and ANALYST have no campaigns access — no raw experiment data", () => {
    expect(can("CONTENT_ENGAGEMENT", "view", "campaigns")).toBe(false);
    expect(can("ANALYST", "view", "campaigns")).toBe(false);
  });
});

describe("Growth Director recommendations gated by `analytics`", () => {
  it("only OWNER can generate (create) recommendations — Growth Director the role never holds `create` on any resource in doctrine", () => {
    for (const role of ROLES) {
      const expected = role === "OWNER";
      expect(can(role, "create", "analytics")).toBe(expected);
    }
  });

  it("CONTENT_ENGAGEMENT sees only basic-scope recommendations — never confidential reasoning at full scope", () => {
    expect(can("CONTENT_ENGAGEMENT", "view", "analytics")).toBe(true);
    expect(scopeFor("CONTENT_ENGAGEMENT", "analytics")).toBe("basic");
  });

  it("ANALYST is read-only approved analytics — no create/edit/approve anywhere on analytics", () => {
    expect(can("ANALYST", "view", "analytics")).toBe(true);
    expect(scopeFor("ANALYST", "analytics")).toBe("approved");
    expect(can("ANALYST", "create", "analytics")).toBe(false);
    expect(can("ANALYST", "edit", "analytics")).toBe(false);
    expect(can("ANALYST", "approve", "analytics")).toBe(false);
  });

  it("GROWTH_DIRECTOR follows doctrine: full view, but no create — matches its supervisory (not executive) role", () => {
    expect(can("GROWTH_DIRECTOR", "view", "analytics")).toBe(true);
    expect(scopeFor("GROWTH_DIRECTOR", "analytics")).toBe("full");
    expect(can("GROWTH_DIRECTOR", "create", "analytics")).toBe(false);
  });
});

describe("Model performance/recommendations/benchmark/AI budget gated by `model-config`", () => {
  it("only OWNER can mutate model-config (refresh performance, generate/apply recommendations, run benchmark, set budget)", () => {
    for (const role of ROLES) {
      const expected = role === "OWNER";
      expect(can(role, "create", "model-config")).toBe(expected);
      expect(can(role, "approve", "model-config")).toBe(expected);
    }
  });

  it("GROWTH_DIRECTOR can view model-config but cannot approve a routing change — model/cost controls stay Owner-only", () => {
    expect(can("GROWTH_DIRECTOR", "view", "model-config")).toBe(true);
    expect(can("GROWTH_DIRECTOR", "approve", "model-config")).toBe(false);
  });

  it("CONTENT_ENGAGEMENT cannot see model-config at all", () => {
    expect(can("CONTENT_ENGAGEMENT", "view", "model-config")).toBe(false);
  });
});

describe("Retention gated by `audience` (same as Phase 4 suppression/consent)", () => {
  it("only OWNER can edit (review/anonymize)", () => {
    for (const role of ROLES) {
      const expected = role === "OWNER";
      expect(can(role, "edit", "audience")).toBe(expected);
    }
  });
});
