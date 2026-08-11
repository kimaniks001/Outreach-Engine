// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 10 — planning/channel
// types only, matching schema.ts's channelTypeEnum exactly. Do not add
// values here without also updating that enum (requires a migration).
export const CHANNEL_TYPES = [
  "GOOGLE_SEARCH",
  "GOOGLE_DISPLAY",
  "YOUTUBE",
  "META_FACEBOOK",
  "META_INSTAGRAM",
  "TIKTOK",
  "LINKEDIN",
  "X",
  "DIRECT_BUSINESS_OUTREACH",
  "EMAIL",
  "WHATSAPP",
  "IN_APP",
  "PARTNER_PLATFORM",
] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const CHANNEL_LABELS: Record<ChannelType, string> = {
  GOOGLE_SEARCH: "Google Search",
  GOOGLE_DISPLAY: "Google Display",
  YOUTUBE: "YouTube",
  META_FACEBOOK: "Meta — Facebook",
  META_INSTAGRAM: "Meta — Instagram",
  TIKTOK: "TikTok",
  LINKEDIN: "LinkedIn",
  X: "X (Twitter)",
  DIRECT_BUSINESS_OUTREACH: "Direct Business Outreach",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  IN_APP: "In-App",
  PARTNER_PLATFORM: "Partner Platform",
};

// Which adapter, if any, is capable of serving each channel in this phase —
// see src/lib/distribution/adapters. Everything not listed here has no
// adapter at all yet (planning-only channel type).
export const CHANNEL_ADAPTER_KEY: Partial<Record<ChannelType, "google_ads" | "meta_ads">> = {
  GOOGLE_SEARCH: "google_ads",
  GOOGLE_DISPLAY: "google_ads",
  YOUTUBE: "google_ads",
  META_FACEBOOK: "meta_ads",
  META_INSTAGRAM: "meta_ads",
};

export function isChannelType(value: string): value is ChannelType {
  return (CHANNEL_TYPES as readonly string[]).includes(value);
}
