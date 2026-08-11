import { CHANNEL_TYPES, type ChannelType } from "./channels";

// Deterministic, always-authoritative Channel Recommendation rule engine —
// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 11: "No black-box
// optimization." This ranking can never be changed by AI; optional AI
// enrichment (src/lib/ai/tasks/recommend-channels.ts) may only append
// narrative rationale text, same authority pattern as
// src/lib/brand-guardian/rules.ts.

export const CHANNEL_RULE_ENGINE_VERSION = "phase3-channel-rules-v1";

export interface ChannelRecommendationInput {
  campaignObjective: string;
  audienceSegment: {
    sector: string | null;
    geography: string | null;
    intentCriteria: string | null;
    roleFunctionCriteria: string | null;
    companyCriteria: string | null;
    businessCriteria: string | null;
    channelEligibility: string[];
  };
  conversionGoal?: string | null;
}

export interface ScoredChannel {
  channel: ChannelType;
  score: number;
  reasons: string[];
  risks: string[];
  requiredAssets: string[];
  expectedFunnelRole: string;
}

interface Rule {
  channel: ChannelType;
  base: number;
  expectedFunnelRole: string;
  requiredAssets: string[];
  defaultRisks: string[];
  modifiers: Array<{
    test: (text: string) => boolean;
    points: number;
    reason: string;
  }>;
}

function textBlob(input: ChannelRecommendationInput): string {
  const s = input.audienceSegment;
  return [
    input.campaignObjective,
    s.sector,
    s.geography,
    s.intentCriteria,
    s.roleFunctionCriteria,
    s.companyCriteria,
    s.businessCriteria,
    input.conversionGoal,
  ]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();
}

const HIGH_INTENT_TERMS = /\b(search|looking for|compare|urgent|need|problem|solution|milestone|deposit|payment)\b/;
const B2B_TERMS = /\b(business|company|companies|enterprise|contractor|manager|director|owner|procurement|b2b)\b/;
const AWARENESS_TERMS = /\b(awareness|reach|broad|discover|introduce)\b/;
const LOCAL_CONSUMER_TERMS = /\b(homeowner|household|consumer|family|local|community)\b/;
const KENYA_EA_TERMS = /\b(kenya|nairobi|east africa|kes|whatsapp)\b/;
const DEMO_VIDEO_TERMS = /\b(demo|explainer|walkthrough|tutorial|video)\b/;
const PARTNER_TERMS = /\b(partner|platform|marketplace|integration)\b/;

const RULES: Rule[] = [
  {
    channel: "GOOGLE_SEARCH",
    base: 45,
    expectedFunnelRole: "Capture high-intent, problem-aware searchers at the moment of need.",
    requiredAssets: ["Headline set", "Description set", "Landing destination"],
    defaultRisks: ["Requires ongoing keyword/negative-keyword management to control spend."],
    modifiers: [
      { test: (t) => HIGH_INTENT_TERMS.test(t), points: 35, reason: "Commercial intent language detected — search ranks high for problem-aware audiences." },
      { test: (t) => B2B_TERMS.test(t), points: 10, reason: "B2B/company-shaped audience also searches directly for solutions." },
    ],
  },
  {
    channel: "GOOGLE_DISPLAY",
    base: 25,
    expectedFunnelRole: "Broad-reach awareness and later-stage remarketing (remarketing itself is Phase 4).",
    requiredAssets: ["Display image set (multiple aspect ratios)", "Landing destination"],
    defaultRisks: ["Lower intent than search — better as a supporting channel than primary."],
    modifiers: [
      { test: (t) => AWARENESS_TERMS.test(t), points: 20, reason: "Awareness-shaped objective fits broad display reach." },
    ],
  },
  {
    channel: "YOUTUBE",
    base: 15,
    expectedFunnelRole: "Awareness and explainer/demo content for a considered purchase.",
    requiredAssets: ["Video creative (not produced by Phase 2 Creative Studio, which is image-first)"],
    defaultRisks: ["No video creative pipeline exists yet — Phase 2 Creative Studio is image-first, not image-only."],
    modifiers: [
      { test: (t) => DEMO_VIDEO_TERMS.test(t), points: 30, reason: "Objective references a demo/explainer format that fits video." },
    ],
  },
  {
    channel: "META_FACEBOOK",
    base: 35,
    expectedFunnelRole: "Broad problem-awareness and local/community reach with image-first creative.",
    requiredAssets: ["Image creative set", "Primary text", "Headline", "CTA"],
    defaultRisks: ["Lower default intent than search — pair with a clear, specific CTA."],
    modifiers: [
      { test: (t) => LOCAL_CONSUMER_TERMS.test(t), points: 25, reason: "Local/consumer-shaped audience fits Meta's broad, image-first reach." },
      { test: (t) => AWARENESS_TERMS.test(t), points: 10, reason: "Awareness-shaped objective." },
    ],
  },
  {
    channel: "META_INSTAGRAM",
    base: 25,
    expectedFunnelRole: "Visual awareness for a consumer/local audience.",
    requiredAssets: ["Image creative set (square/portrait)", "Caption", "CTA"],
    defaultRisks: ["Skews toward a younger consumer audience — verify audience fit before relying on it."],
    modifiers: [
      { test: (t) => LOCAL_CONSUMER_TERMS.test(t), points: 15, reason: "Local/consumer-shaped audience." },
    ],
  },
  {
    channel: "TIKTOK",
    base: 5,
    expectedFunnelRole: "Awareness with a younger, consumer audience.",
    requiredAssets: ["Short-form video creative (not produced by Phase 2 Creative Studio)"],
    defaultRisks: ["No video creative pipeline exists yet.", "Weak fit for B2B or considered-purchase audiences."],
    modifiers: [
      { test: (t) => LOCAL_CONSUMER_TERMS.test(t) && !B2B_TERMS.test(t), points: 10, reason: "Consumer-only audience with no B2B signal." },
    ],
  },
  {
    channel: "LINKEDIN",
    base: 10,
    expectedFunnelRole: "Reach B2B decision-makers with a professional framing.",
    requiredAssets: ["Business-framed copy", "Concise professional creative"],
    defaultRisks: ["Higher cost per click than most channels — budget-sensitive."],
    modifiers: [
      { test: (t) => B2B_TERMS.test(t), points: 40, reason: "Role/company-shaped B2B audience is exactly LinkedIn's strength." },
    ],
  },
  {
    channel: "X",
    base: 10,
    expectedFunnelRole: "Real-time awareness and professional/industry conversation.",
    requiredAssets: ["Short copy", "Image or link card"],
    defaultRisks: ["Smaller reach in this market than Meta/Google."],
    modifiers: [
      { test: (t) => B2B_TERMS.test(t), points: 10, reason: "Some professional-audience fit." },
    ],
  },
  {
    channel: "DIRECT_BUSINESS_OUTREACH",
    base: 15,
    expectedFunnelRole: "Direct, approved outreach to named businesses/prospects.",
    requiredAssets: ["Approved outreach message", "Assigned owner"],
    defaultRisks: ["Requires an approved, human-reviewed message per contact — not a bulk-send channel."],
    modifiers: [
      { test: (t) => B2B_TERMS.test(t), points: 30, reason: "Company-shaped criteria supports named-account outreach." },
    ],
  },
  {
    channel: "EMAIL",
    base: 10,
    expectedFunnelRole: "Direct, planned outreach to a known, reachable audience.",
    requiredAssets: ["Subject line", "Message body", "CTA"],
    defaultRisks: ["No live send adapter in this phase — plan/simulate only."],
    modifiers: [
      { test: (t) => B2B_TERMS.test(t), points: 20, reason: "Company/role-shaped audience is typically reachable by email." },
    ],
  },
  {
    channel: "WHATSAPP",
    base: 10,
    expectedFunnelRole: "Direct, high-open-rate outreach in markets where WhatsApp is dominant.",
    requiredAssets: ["Message template", "CTA"],
    defaultRisks: ["No live send adapter in this phase — plan/simulate only."],
    modifiers: [
      { test: (t) => KENYA_EA_TERMS.test(t), points: 35, reason: "Geography/market signal fits WhatsApp's dominance in this region." },
    ],
  },
  {
    channel: "IN_APP",
    base: 5,
    expectedFunnelRole: "In-product messaging to existing SecurePay users.",
    requiredAssets: ["In-app message copy"],
    defaultRisks: ["Requires a SecurePay product-event integration this phase does not build (Phase 4)."],
    modifiers: [],
  },
  {
    channel: "PARTNER_PLATFORM",
    base: 5,
    expectedFunnelRole: "Distribution through an approved third-party platform partner.",
    requiredAssets: ["Approved message", "Partner-specific creative/format"],
    defaultRisks: ["No partner distribution API exists yet — planning only (docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 23)."],
    modifiers: [
      { test: (t) => PARTNER_TERMS.test(t), points: 25, reason: "Objective/audience references a partner or platform relationship." },
    ],
  },
];

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function scoreChannels(input: ChannelRecommendationInput): ScoredChannel[] {
  const text = textBlob(input);
  const eligibility = new Set(input.audienceSegment.channelEligibility);

  return RULES.map((rule) => {
    const reasons: string[] = [];
    let score = rule.base;
    for (const modifier of rule.modifiers) {
      if (modifier.test(text)) {
        score += modifier.points;
        reasons.push(modifier.reason);
      }
    }
    if (eligibility.size > 0 && eligibility.has(rule.channel)) {
      score += 15;
      reasons.push("Audience segment explicitly lists this channel as eligible.");
    }
    if (reasons.length === 0) {
      reasons.push("Baseline fit only — no specific signal in the campaign/audience text favored this channel.");
    }
    return {
      channel: rule.channel,
      score: clamp(score),
      reasons,
      risks: [...rule.defaultRisks],
      requiredAssets: [...rule.requiredAssets],
      expectedFunnelRole: rule.expectedFunnelRole,
    };
  }).sort((a, b) => b.score - a.score || a.channel.localeCompare(b.channel));
}

// Every channel type is scored (for transparency/debuggability), but only
// those clearing the threshold are surfaced as "recommended" — keeps the
// output focused rather than dumping all 13 channel types on a reviewer.
export const RECOMMENDATION_THRESHOLD = 30;

export interface RankedChannelRecommendation extends ScoredChannel {
  priority: number;
}

export function rankRecommendedChannels(input: ChannelRecommendationInput): RankedChannelRecommendation[] {
  return scoreChannels(input)
    .filter((c) => c.score >= RECOMMENDATION_THRESHOLD)
    .map((c, i) => ({ ...c, priority: i + 1 }));
}

export function allChannelTypesScored(input: ChannelRecommendationInput): ScoredChannel[] {
  return scoreChannels(input);
}

export const _CHANNEL_TYPES_FOR_TEST = CHANNEL_TYPES;
