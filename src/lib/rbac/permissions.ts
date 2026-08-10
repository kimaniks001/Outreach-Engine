import type { Role } from "./roles";

// Matches docs/ACCESS_CONTROL_MODEL.md Section 3.
export const CAPABILITIES = [
  "view",
  "create",
  "edit",
  "approve",
  "publish",
  "administer",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

// Matches docs/ACCESS_CONTROL_MODEL.md Section 3. "audience" here covers the
// future commercial-memory resource too, per that document.
export const RESOURCES = [
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
] as const;
export type Resource = (typeof RESOURCES)[number];

export type Scope = "none" | "approved" | "raw" | "basic" | "full";

interface Grant {
  capabilities: readonly Capability[];
  scope: Scope;
}

type GrantTable = Record<Role, Partial<Record<Resource, Grant>>>;

const full: Grant = { capabilities: CAPABILITIES, scope: "full" };
const none: Grant = { capabilities: [], scope: "none" };

// Direct transcription of docs/ACCESS_CONTROL_MODEL.md Section 4's
// role-to-capability table. Do not hand-tune this without updating that
// document first — this is the enforcement point the doctrine describes.
export const ROLE_GRANTS: GrantTable = {
  OWNER: {
    doctrine: full,
    intelligence: full,
    campaigns: full,
    content: full,
    distribution: full,
    analytics: full,
    audience: full,
    "model-config": full,
    credentials: full,
    audit: full,
  },
  GROWTH_DIRECTOR: {
    doctrine: { capabilities: ["view"], scope: "full" },
    intelligence: { capabilities: ["view"], scope: "raw" }, // approved + raw
    campaigns: { capabilities: ["view", "approve"], scope: "full" },
    content: { capabilities: ["view"], scope: "full" },
    distribution: { capabilities: ["view"], scope: "full" },
    analytics: { capabilities: ["view"], scope: "full" },
    audience: { capabilities: ["view"], scope: "full" },
    "model-config": { capabilities: ["view"], scope: "full" },
    credentials: none,
    audit: { capabilities: ["view"], scope: "full" },
  },
  STRATEGIST: {
    doctrine: none,
    intelligence: { capabilities: ["view"], scope: "approved" },
    campaigns: { capabilities: ["view", "create", "edit"], scope: "full" },
    content: { capabilities: ["view"], scope: "full" },
    distribution: { capabilities: ["view"], scope: "full" },
    analytics: { capabilities: ["view"], scope: "approved" },
    audience: { capabilities: ["view"], scope: "approved" },
    "model-config": none,
    credentials: none,
    audit: none,
  },
  CONTENT_ENGAGEMENT: {
    doctrine: none,
    intelligence: none,
    campaigns: none,
    content: { capabilities: ["view", "create", "edit"], scope: "approved" },
    distribution: none,
    analytics: { capabilities: ["view"], scope: "basic" },
    audience: none,
    "model-config": none,
    credentials: none,
    audit: none,
  },
  DISTRIBUTION_SALES: {
    doctrine: none,
    intelligence: none,
    campaigns: { capabilities: ["view"], scope: "approved" },
    content: none,
    distribution: { capabilities: ["view", "create", "edit"], scope: "approved" },
    analytics: { capabilities: ["view"], scope: "approved" },
    audience: { capabilities: ["view"], scope: "approved" },
    "model-config": none,
    credentials: none,
    audit: none,
  },
  ANALYST: {
    doctrine: none,
    intelligence: none,
    campaigns: none,
    content: none,
    distribution: none,
    analytics: { capabilities: ["view"], scope: "approved" },
    audience: none,
    "model-config": none,
    credentials: none,
    audit: none,
  },
};

export function can(role: Role, capability: Capability, resource: Resource): boolean {
  const grant = ROLE_GRANTS[role]?.[resource];
  if (!grant) return false;
  return grant.capabilities.includes(capability);
}

export function scopeFor(role: Role, resource: Resource): Scope {
  return ROLE_GRANTS[role]?.[resource]?.scope ?? "none";
}
