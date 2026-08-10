import type { Role } from "./roles";
import { can } from "./permissions";

// Matches the Phase 1 brief's primary navigation and Section 10 access
// requirements. This is page/route-level gating; src/lib/rbac/permissions.ts
// is the underlying capability model these access rules are derived from.
export const SECTIONS = [
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
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  TODAY: "Today",
  INTELLIGENCE: "Intelligence",
  CAMPAIGNS: "Campaigns",
  AUDIENCES: "Audiences",
  DISTRIBUTION: "Distribution",
  ENGAGEMENT: "Engagement",
  IMPACT: "Impact",
  GROWTH_DIRECTOR: "Growth Director",
  ADMIN: "Admin",
};

export const SECTION_PATHS: Record<Section, string> = {
  TODAY: "/today",
  INTELLIGENCE: "/intelligence",
  CAMPAIGNS: "/campaigns",
  AUDIENCES: "/audiences",
  DISTRIBUTION: "/distribution",
  ENGAGEMENT: "/engagement",
  IMPACT: "/impact",
  GROWTH_DIRECTOR: "/growth-director",
  ADMIN: "/admin",
};

// Explicit per-role section access, matching the Phase 1 brief Section 10
// verbatim. OWNER always has full access. ADMIN is Owner-only, per the
// brief's default rule, EXTENDED only where docs/ACCESS_CONTROL_MODEL.md
// Section 4 clearly grants a read-only view (Growth Director has `view` on
// `model-config` and `audit`) — see docs/PHASE_1_COMMAND_CENTRE_AND_AI_CORE.md
// for the reasoning. Growth Director's Admin access is further restricted at
// the sub-page level (src/app/(dashboard)/admin) to exactly those two
// resources: no credentials, no Safe Mode control, no mutation.
const SECTION_ACCESS: Record<Role, readonly Section[]> = {
  OWNER: SECTIONS,
  GROWTH_DIRECTOR: [
    "TODAY",
    "INTELLIGENCE",
    "CAMPAIGNS",
    "AUDIENCES",
    "DISTRIBUTION",
    "IMPACT",
    "GROWTH_DIRECTOR",
    "ADMIN", // read-only subset only — see admin layout guard
  ],
  STRATEGIST: ["TODAY", "INTELLIGENCE", "CAMPAIGNS", "AUDIENCES"],
  CONTENT_ENGAGEMENT: ["TODAY", "ENGAGEMENT", "CAMPAIGNS"],
  DISTRIBUTION_SALES: ["TODAY", "DISTRIBUTION", "AUDIENCES"],
  ANALYST: ["TODAY", "IMPACT"],
};

export function canAccessSection(role: Role, section: Section): boolean {
  return SECTION_ACCESS[role].includes(section);
}

export function sectionsForRole(role: Role): readonly Section[] {
  return SECTION_ACCESS[role];
}

// Fine-grained Admin capability, independent of top-level section access.
// OWNER: everything. GROWTH_DIRECTOR: read-only model-config + audit only
// (docs/ACCESS_CONTROL_MODEL.md Section 4). Everyone else: none.
export function canViewAdminProviders(role: Role): boolean {
  return can(role, "view", "model-config");
}
export function canManageAdminProviders(role: Role): boolean {
  return role === "OWNER";
}
export function canViewAdminAudit(role: Role): boolean {
  return can(role, "view", "audit");
}
export function canViewSafeMode(role: Role): boolean {
  return role === "OWNER";
}
export function canChangeSafeMode(role: Role): boolean {
  return role === "OWNER";
}
export function canViewCredentials(): boolean {
  // Credential *values* are never viewable by any role, including OWNER, in
  // the UI. See docs/MODEL_CONTROL_PLANE.md Section 4 and the Phase 1
  // brief's credential architecture section.
  return false;
}
