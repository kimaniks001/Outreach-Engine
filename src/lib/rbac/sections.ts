import type { Role } from "./roles";
import { can } from "./permissions";

// Primary Outreach navigation. The original Phase 1 sections remain intact;
// COMMUNITY_LIVE is a post-roadmap foundation slice. It is intentionally
// limited to current staff roles until Plug/Master/Board become real
// authenticated principals rather than prototype lenses.
export const SECTIONS = [
  "TODAY",
  "COMMUNITY_LIVE",
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
  COMMUNITY_LIVE: "Community LIVE",
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
  COMMUNITY_LIVE: "/community-live",
  INTELLIGENCE: "/intelligence",
  CAMPAIGNS: "/campaigns",
  AUDIENCES: "/audiences",
  DISTRIBUTION: "/distribution",
  ENGAGEMENT: "/engagement",
  IMPACT: "/impact",
  GROWTH_DIRECTOR: "/growth-director",
  ADMIN: "/admin",
};

// Explicit per-role section access. Community LIVE is currently a staff-side
// preview only. ANALYST remains on governed outcome views and is deliberately
// excluded from the social/community surface in this foundation slice.
const SECTION_ACCESS: Record<Role, readonly Section[]> = {
  OWNER: SECTIONS,
  GROWTH_DIRECTOR: [
    "TODAY",
    "COMMUNITY_LIVE",
    "INTELLIGENCE",
    "CAMPAIGNS",
    "AUDIENCES",
    "DISTRIBUTION",
    "IMPACT",
    "GROWTH_DIRECTOR",
    "ADMIN", // read-only subset only — see admin layout guard
  ],
  STRATEGIST: ["TODAY", "COMMUNITY_LIVE", "INTELLIGENCE", "CAMPAIGNS", "AUDIENCES"],
  CONTENT_ENGAGEMENT: ["TODAY", "COMMUNITY_LIVE", "ENGAGEMENT", "CAMPAIGNS"],
  DISTRIBUTION_SALES: ["TODAY", "COMMUNITY_LIVE", "DISTRIBUTION", "AUDIENCES"],
  ANALYST: ["TODAY", "IMPACT"],
};

export function canAccessSection(role: Role, section: Section): boolean {
  return SECTION_ACCESS[role].includes(section);
}

export function sectionsForRole(role: Role): readonly Section[] {
  return SECTION_ACCESS[role];
}

// Fine-grained Admin capability, independent of top-level section access.
// OWNER: everything. GROWTH_DIRECTOR: read-only model-config + audit only.
// Everyone else: none.
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
  // Credential values are never viewable by any role, including OWNER, in the UI.
  return false;
}
