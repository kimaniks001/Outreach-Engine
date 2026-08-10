import { describe, expect, it } from "vitest";
import { can } from "@/lib/rbac/permissions";
import {
  canAccessSection,
  canViewAdminProviders,
  canManageAdminProviders,
  canViewAdminAudit,
  canViewSafeMode,
  canChangeSafeMode,
  canViewCredentials,
} from "@/lib/rbac/sections";
import { ROLES, type Role } from "@/lib/rbac/roles";

// Direct enforcement tests against docs/ACCESS_CONTROL_MODEL.md Section 4
// and the Phase 1 brief Section 10. These are pure functions — no database,
// no Next.js runtime — so they run fast and deterministically.

describe("permissions: docs/ACCESS_CONTROL_MODEL.md Section 4 table", () => {
  it("OWNER has full capability on every resource", () => {
    expect(can("OWNER", "administer", "credentials")).toBe(true);
    expect(can("OWNER", "administer", "doctrine")).toBe(true);
    expect(can("OWNER", "view", "audit")).toBe(true);
  });

  it("GROWTH_DIRECTOR has no secrets access by default", () => {
    expect(can("GROWTH_DIRECTOR", "view", "credentials")).toBe(false);
    expect(can("GROWTH_DIRECTOR", "administer", "credentials")).toBe(false);
  });

  it("GROWTH_DIRECTOR can view model-config and audit (read-only)", () => {
    expect(can("GROWTH_DIRECTOR", "view", "model-config")).toBe(true);
    expect(can("GROWTH_DIRECTOR", "administer", "model-config")).toBe(false);
    expect(can("GROWTH_DIRECTOR", "view", "audit")).toBe(true);
  });

  it("STRATEGIST cannot see raw/unapproved intelligence or model-config", () => {
    expect(can("STRATEGIST", "view", "model-config")).toBe(false);
    expect(can("STRATEGIST", "view", "credentials")).toBe(false);
  });

  it("CONTENT_ENGAGEMENT cannot see doctrine, intelligence, or model-config", () => {
    expect(can("CONTENT_ENGAGEMENT", "view", "doctrine")).toBe(false);
    expect(can("CONTENT_ENGAGEMENT", "view", "intelligence")).toBe(false);
    expect(can("CONTENT_ENGAGEMENT", "view", "model-config")).toBe(false);
    expect(can("CONTENT_ENGAGEMENT", "view", "credentials")).toBe(false);
  });

  it("ANALYST is read-only and cannot mutate anything", () => {
    for (const resource of [
      "doctrine",
      "intelligence",
      "campaigns",
      "content",
      "distribution",
      "analytics",
      "audience",
      "model-config",
      "credentials",
      "audit",
    ] as const) {
      expect(can("ANALYST", "create", resource)).toBe(false);
      expect(can("ANALYST", "edit", resource)).toBe(false);
      expect(can("ANALYST", "approve", resource)).toBe(false);
      expect(can("ANALYST", "publish", resource)).toBe(false);
      expect(can("ANALYST", "administer", resource)).toBe(false);
    }
    expect(can("ANALYST", "view", "analytics")).toBe(true);
  });

  it("no role other than OWNER can administer credentials", () => {
    for (const role of ROLES) {
      if (role === "OWNER") continue;
      expect(can(role, "administer", "credentials")).toBe(false);
    }
  });
});

describe("sections: Phase 1 brief Section 10 navigation access", () => {
  const expectedAccess: Record<Role, string[]> = {
    OWNER: [
      "TODAY",
      "INTELLIGENCE",
      "CAMPAIGNS",
      "AUDIENCES",
      "DISTRIBUTION",
      "ENGAGEMENT",
      "IMPACT",
      "GROWTH_DIRECTOR",
      "ADMIN",
    ],
    GROWTH_DIRECTOR: [
      "TODAY",
      "INTELLIGENCE",
      "CAMPAIGNS",
      "AUDIENCES",
      "DISTRIBUTION",
      "IMPACT",
      "GROWTH_DIRECTOR",
      "ADMIN",
    ],
    STRATEGIST: ["TODAY", "INTELLIGENCE", "CAMPAIGNS", "AUDIENCES"],
    CONTENT_ENGAGEMENT: ["TODAY", "ENGAGEMENT", "CAMPAIGNS"],
    DISTRIBUTION_SALES: ["TODAY", "DISTRIBUTION", "AUDIENCES"],
    ANALYST: ["TODAY", "IMPACT"],
  };

  const ALL_SECTIONS = [
    "TODAY",
    "INTELLIGENCE",
    "CAMPAIGNS",
    "AUDIENCES",
    "DISTRIBUTION",
    "ENGAGEMENT",
    "IMPACT",
    "GROWTH_DIRECTOR",
    "ADMIN",
  ] as const;

  for (const role of ROLES) {
    it(`${role} sees exactly its specified sections`, () => {
      for (const section of ALL_SECTIONS) {
        const expected = expectedAccess[role].includes(section);
        expect(canAccessSection(role, section)).toBe(expected);
      }
    });
  }

  it("every role can access TODAY", () => {
    for (const role of ROLES) {
      expect(canAccessSection(role, "TODAY")).toBe(true);
    }
  });

  it("ADMIN is Owner-only except Growth Director's read-only doctrine-granted subset", () => {
    for (const role of ROLES) {
      if (role === "OWNER" || role === "GROWTH_DIRECTOR") continue;
      expect(canAccessSection(role, "ADMIN")).toBe(false);
    }
  });
});

describe("admin sub-resource gating", () => {
  it("only OWNER can manage providers, view is broader", () => {
    expect(canManageAdminProviders("OWNER")).toBe(true);
    expect(canManageAdminProviders("GROWTH_DIRECTOR")).toBe(false);
    expect(canViewAdminProviders("OWNER")).toBe(true);
    expect(canViewAdminProviders("GROWTH_DIRECTOR")).toBe(true);
    expect(canViewAdminProviders("CONTENT_ENGAGEMENT")).toBe(false);
    expect(canViewAdminProviders("ANALYST")).toBe(false);
  });

  it("audit view matches the Section 4 table (Owner + Growth Director only)", () => {
    expect(canViewAdminAudit("OWNER")).toBe(true);
    expect(canViewAdminAudit("GROWTH_DIRECTOR")).toBe(true);
    expect(canViewAdminAudit("STRATEGIST")).toBe(false);
    expect(canViewAdminAudit("DISTRIBUTION_SALES")).toBe(false);
    expect(canViewAdminAudit("ANALYST")).toBe(false);
  });

  it("Safe Mode is Owner-only for both viewing and changing", () => {
    for (const role of ROLES) {
      const expected = role === "OWNER";
      expect(canViewSafeMode(role)).toBe(expected);
      expect(canChangeSafeMode(role)).toBe(expected);
    }
  });

  it("credential values are never viewable by any role", () => {
    expect(canViewCredentials()).toBe(false);
  });
});
