import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { listAssetLibrary } from "@/lib/assets/market-assets";

export type MarketInsightSource = "STAFF" | "PLUG";
export type RapidResponseReason = "MISINFORMATION" | "CONFUSION" | "MARKET_OPPORTUNITY" | null;
export type MarketKitUsageAction = "VIEWED" | "SHARED" | "PERSONALISED" | "PRINTED" | "USED_IN_CONVERSATION";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN = /(?:\+?254|0)[17]\d{8}\b/;

function assertPrivacySafeText(value: string, field: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} is required.`);
  if (trimmed.length > 3000) throw new Error(`${field} is too long for market-learning intake.`);
  if (EMAIL_PATTERN.test(trimmed) || PHONE_PATTERN.test(trimmed)) {
    throw new Error(`${field} must not contain personal email addresses or phone numbers.`);
  }
  return trimmed;
}

function safeTags(tags: string[]) {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
}

export interface RecordMarketInsightInput {
  source: MarketInsightSource;
  title: string;
  summary: string;
  tags?: string[];
  rapidResponseReason?: RapidResponseReason;
  isDemo?: boolean;
}

/**
 * Market feedback is evidence to review, never an automatically verified fact.
 * Plug identity/contact details are deliberately not persisted here. A Plug can
 * contribute field knowledge without Outreach turning that contribution into a
 * marketing profile, referral record, or financial entitlement.
 */
export async function recordMarketInsight(input: RecordMarketInsightInput, actorUserId?: string | null) {
  const title = assertPrivacySafeText(input.title, "Insight title");
  const summary = assertPrivacySafeText(input.summary, "Insight summary");
  const rapidTag = input.rapidResponseReason ? [`rapid-response:${input.rapidResponseReason.toLowerCase()}`] : [];
  const tags = safeTags([`source:${input.source.toLowerCase()}`, ...rapidTag, ...(input.tags ?? [])]);

  const [signal] = await db
    .insert(schema.marketSignals)
    .values({
      title,
      summary,
      signalType: input.source === "PLUG" ? "CUSTOMER_FEEDBACK" : "INTERNAL_OBSERVATION",
      status: "NEW",
      tags,
      classification: "CONFIDENTIAL",
      isDemo: input.isDemo ?? false,
      createdByUserId: actorUserId ?? null,
    })
    .returning();

  await recordAuditEvent({
    eventType: "MARKET_INSIGHT_RECORDED",
    actorUserId: actorUserId ?? null,
    actorLabel: input.source === "PLUG" ? "privacy-safe-plug-input" : null,
    targetType: "market_signal",
    targetId: signal!.id,
    metadata: {
      source: input.source,
      rapidResponseReason: input.rapidResponseReason ?? null,
      isDemo: input.isDemo ?? false,
    },
  });

  return signal!;
}

export interface RecordMarketKitUsageInput {
  assetId: string;
  action: MarketKitUsageAction;
  source: "PLUG_MARKET_KIT" | "STAFF_ASSET_LIBRARY";
  isDemo?: boolean;
}

/**
 * Records use of an authorised CURRENT market asset as engagement evidence.
 * It does not create a conversion, attribution row, referral, or entitlement.
 */
export async function recordMarketKitUsage(input: RecordMarketKitUsageInput, actorUserId?: string | null) {
  const library = await listAssetLibrary();
  const row = library.find((item) => item.asset.id === input.assetId);
  if (!row) throw new Error("Market asset not found.");
  if (!row.approvedForUse) {
    throw new Error("Only a CURRENT approved Market Asset may be recorded as authorised Market Kit use.");
  }

  await recordAuditEvent({
    eventType: "MARKET_KIT_USAGE_RECORDED",
    actorUserId: actorUserId ?? null,
    actorLabel: input.source === "PLUG_MARKET_KIT" ? "privacy-safe-plug-market-kit" : null,
    targetType: "market_asset",
    targetId: input.assetId,
    metadata: {
      action: input.action,
      source: input.source,
      campaignId: row.asset.campaignId,
      assetKind: row.asset.kind,
      assetVersion: row.asset.version,
      isDemo: input.isDemo ?? false,
    },
  });

  return { recorded: true as const, assetId: input.assetId, campaignId: row.asset.campaignId };
}

export async function getCampaignMarketKitLearning(campaignId: string) {
  const rows = await db
    .select()
    .from(schema.auditEvents)
    .where(eq(schema.auditEvents.eventType, "MARKET_KIT_USAGE_RECORDED"))
    .orderBy(desc(schema.auditEvents.createdAt));

  const relevant = rows.filter((row) => row.metadata?.campaignId === campaignId);
  const byAction: Record<string, number> = {};
  const byAsset: Record<string, number> = {};

  for (const row of relevant) {
    const action = typeof row.metadata?.action === "string" ? row.metadata.action : "UNKNOWN";
    byAction[action] = (byAction[action] ?? 0) + 1;
    if (row.targetId) byAsset[row.targetId] = (byAsset[row.targetId] ?? 0) + 1;
  }

  return {
    campaignId,
    observedUsageEvents: relevant.length,
    byAction,
    byAsset,
    interpretation:
      relevant.length === 0
        ? "No Market Kit usage has been observed for this campaign yet. This is insufficient evidence, not proof that the campaign had no market reach."
        : `${relevant.length} authorised Market Kit usage event(s) were observed. Usage shows market activity, not conversion or financial impact by itself.`,
  };
}
