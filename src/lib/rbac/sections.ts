import type { Role } from "./roles";
import { can } from "./permissions";

// Primary Outreach navigation. Human work surfaces are top-level; technical
// configuration remains under Admin.
export const SECTIONS = [
  "TODAY",
  "COMMUNITY_LIVE",
  "INTELLIGENCE",
  "CAMPAIGNS",
  "STUDIO",
  "APPROVALS",
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
  STUDIO: "Studio",
  APPROVALS: "Approval Desk",
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
  STUDIO: "/studio",
  APPROVALS: "/approvals",
  AUDIENCES: "/audiences",
  DISTRIBUTION: "/distribution",
  ENGAGEMENT: "/engagement",
  IMPACT: "/impact",
  GROWTH_DIRECTOR: "/growth-director",
  ADMIN: "/admin",
};

const SECTION_ACCESS: Record<Role, readonly Section[]> = {
  OWNER: SECTIONS,
  GROWTH_DIRECTOR: [
    "TODAY",
    "COMMUNITY_LIVE",
    "INTELLIGENCE",
    "CAMPAIGNS",
    "STUDIO",
    "APPROVALS",
    "AUDIENCES",
    "DISTRIBUTION",
    "IMPACT",
    "GROWTH_DIRECTOR",
    "ADMIN",
  ],
  STRATEGIST: ["TODAY", "COMMUNITY_LIVE", "INTELLIGENCE", "CAMPAIGNS", "STUDIO", "AUDIENCES"],
  CONTENT_ENGAGEMENT: ["TODAY", "COMMUNITY_LIVE", "ENGAGEMENT", "CAMPAIGNS", "STUDIO"],
  DISTRIBUTION_SALES: ["TODAY", "COMMUNITY_LIVE", "DISTRIBUTION", "AUDIENCES"],
  ANALYST: ["TODAY", "IMPACT"],
};

export function canAccessSection(role: Role, section: Section): boolean {
  return SECTION_ACCESS[role].includes(section);
}

export function sectionsForRole(role: Role): readonly Section[] {
  return SECTION_ACCESS[role];
}

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
  return false;
}
