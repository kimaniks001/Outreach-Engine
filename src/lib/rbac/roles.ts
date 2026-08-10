// Matches docs/ACCESS_CONTROL_MODEL.md Section 2 and src/lib/db/schema.ts
// roleEnum. Changing this list is a doctrine change — see
// docs/ACCESS_CONTROL_MODEL.md and the Phase 1 brief's instruction to stop
// and report rather than silently change doctrine.
export const ROLES = [
  "OWNER",
  "GROWTH_DIRECTOR",
  "STRATEGIST",
  "CONTENT_ENGAGEMENT",
  "DISTRIBUTION_SALES",
  "ANALYST",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner / Super Admin",
  GROWTH_DIRECTOR: "Growth Director",
  STRATEGIST: "Strategist",
  CONTENT_ENGAGEMENT: "Content & Engagement",
  DISTRIBUTION_SALES: "Distribution / Sales",
  ANALYST: "Analyst",
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
