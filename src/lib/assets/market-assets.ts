import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getCurrentMarketRelease } from "@/lib/approvals/market-release";
import { recordAuditEvent } from "@/lib/audit/log";
import type { Role } from "@/lib/rbac/roles";
import { canRepresentMarket, type PlugMarketAuthorityResult } from "@/lib/market-network/plug-market-authority";
import {
  marketAssets,
  marketAssetStateEvents,
  type ApprovedAssetContent,
  type MarketAsset,
} from "./schema";

export type MarketAssetKind =
  | "SOCIAL_POST"
  | "WHATSAPP_MESSAGE"
  | "POSTER_COPY"
  | "FLYER_COPY"
  | "VIDEO_SCRIPT"
  | "TALKING_POINTS";

export interface ReleaseMarketAssetInput {
  campaignId: string;
  creativeVariantId: string;
  kind: MarketAssetKind;
  locale?: string;
  usageGuidance?: string | null;
}

export interface PlugMarketKitItem {
  id: string;
  assetKey: string;
  version: number;
  kind: MarketAssetKind;
  title: string;
  locale: string;
  campaignName: string;
  headline: string;
  body: string;
  cta: string;
  imageConcept: string;
  usageGuidance: string | null;
  approvedForUse: true;
  releasedAt: Date;
}

function requireAssetReleaseRole(role: Role) {
  if (role !== "OWNER" && role !== "GROWTH_DIRECTOR") {
    throw new Error("Only Owner or Growth Director may release an approved market asset.");
  }
}

function assetKey(input: ReleaseMarketAssetInput) {
  return `${input.campaignId}:${input.creativeVariantId}:${input.kind}:${input.locale ?? "en-KE"}`;
}

function approvedContentOf(variant: schema.CreativeVariant): ApprovedAssetContent {
  return {
    headline: variant.headline,
    body: variant.body,
    cta: variant.cta,
    imageConcept: variant.imageConcept,
    angle: variant.angle,
    rationale: variant.rationale,
  };
}

/**
 * Mint one immutable market asset from the exact creative currently covered
 * by a valid final Market Release. No public copy is accepted as input here.
 */
export async function releaseMarketAsset(
  input: ReleaseMarketAssetInput,
  actorUserId: string,
  actorRole: Role
) {
  requireAssetReleaseRole(actorRole);

  const currentRelease = await getCurrentMarketRelease(input.campaignId);
  if (!currentRelease) {
    throw new Error("A current final Market Release is required before an asset can be released.");
  }

  const [variant] = await db
    .select()
    .from(schema.creativeVariants)
    .where(eq(schema.creativeVariants.id, input.creativeVariantId))
    .limit(1);
  if (!variant || variant.campaignId !== input.campaignId) {
    throw new Error("Creative variant does not belong to this campaign.");
  }
  if (!currentRelease.creativeSnapshot.some((snapshot) => snapshot.id === variant.id)) {
    throw new Error("Creative variant is not part of the current Market Release proof.");
  }

  const [campaign] = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.id, input.campaignId))
    .limit(1);
  if (!campaign) throw new Error("Campaign not found.");

  const key = assetKey(input);
  const [versionRow] = await db
    .select({ nextVersion: sql<number>`coalesce(max(${marketAssets.version}), 0)::int + 1` })
    .from(marketAssets)
    .where(eq(marketAssets.assetKey, key));

  const previous = await db.select().from(marketAssets).where(eq(marketAssets.assetKey, key));
  for (const oldAsset of previous) {
    if ((await getLatestAssetState(oldAsset.id)) === "RELEASED") {
      await db.insert(marketAssetStateEvents).values({
        assetId: oldAsset.id,
        action: "SUPERSEDED",
        reason: "A newer approved version was released for the same market-kit slot.",
        actorUserId,
      });
    }
  }

  const [asset] = await db
    .insert(marketAssets)
    .values({
      assetKey: key,
      version: versionRow?.nextVersion ?? 1,
      campaignId: input.campaignId,
      creativeVariantId: variant.id,
      marketReleaseId: currentRelease.id,
      kind: input.kind,
      title: `${campaign.name} · ${variant.variantLabel}`,
      locale: input.locale ?? "en-KE",
      approvedContent: approvedContentOf(variant),
      usageGuidance: input.usageGuidance ?? null,
      releasedByUserId: actorUserId,
    })
    .returning();

  await db.insert(marketAssetStateEvents).values({
    assetId: asset!.id,
    action: "RELEASED",
    reason: `Released from Market Release v${currentRelease.releaseVersion}.`,
    actorUserId,
  });

  await recordAuditEvent({
    eventType: "MARKET_ASSET_RELEASED",
    actorUserId,
    targetType: "market_asset",
    targetId: asset!.id,
    metadata: {
      campaignId: input.campaignId,
      creativeVariantId: variant.id,
      marketReleaseId: currentRelease.id,
      kind: input.kind,
      version: asset!.version,
    },
  });

  return asset!;
}

export async function revokeMarketAsset(assetId: string, actorUserId: string, actorRole: Role, reason: string) {
  requireAssetReleaseRole(actorRole);
  const [asset] = await db.select().from(marketAssets).where(eq(marketAssets.id, assetId)).limit(1);
  if (!asset) throw new Error("Market asset not found.");
  const state = await getLatestAssetState(assetId);
  if (state === "REVOKED") return asset;

  await db.insert(marketAssetStateEvents).values({ assetId, action: "REVOKED", reason, actorUserId });
  await recordAuditEvent({
    eventType: "MARKET_ASSET_STATE_CHANGED",
    actorUserId,
    targetType: "market_asset",
    targetId: assetId,
    metadata: { action: "REVOKED", reason },
  });
  return asset;
}

export async function getLatestAssetState(assetId: string) {
  const [event] = await db
    .select()
    .from(marketAssetStateEvents)
    .where(eq(marketAssetStateEvents.assetId, assetId))
    .orderBy(desc(marketAssetStateEvents.createdAt))
    .limit(1);
  return event?.action ?? null;
}

export async function listAssetLibrary() {
  const rows = await db
    .select({ asset: marketAssets, campaignName: schema.campaigns.name })
    .from(marketAssets)
    .innerJoin(schema.campaigns, eq(marketAssets.campaignId, schema.campaigns.id))
    .orderBy(desc(marketAssets.releasedAt));

  return Promise.all(
    rows.map(async ({ asset, campaignName }) => {
      const [state, currentRelease] = await Promise.all([
        getLatestAssetState(asset.id),
        getCurrentMarketRelease(asset.campaignId),
      ]);
      return {
        asset,
        campaignName,
        state,
        parentReleaseCurrent: currentRelease?.id === asset.marketReleaseId,
        approvedForUse: state === "RELEASED" && currentRelease?.id === asset.marketReleaseId,
      };
    })
  );
}

export async function listReleasableCreative() {
  const campaigns = await db.select().from(schema.campaigns).orderBy(desc(schema.campaigns.updatedAt));
  const result: Array<{
    campaignId: string;
    campaignName: string;
    releaseVersion: number;
    variants: Array<{ id: string; label: string; headline: string }>;
  }> = [];

  for (const campaign of campaigns) {
    const release = await getCurrentMarketRelease(campaign.id);
    if (!release) continue;
    const variants = await db
      .select()
      .from(schema.creativeVariants)
      .where(eq(schema.creativeVariants.campaignId, campaign.id));
    const releasedIds = new Set(release.creativeSnapshot.map((snapshot) => snapshot.id));
    result.push({
      campaignId: campaign.id,
      campaignName: campaign.name,
      releaseVersion: release.releaseVersion,
      variants: variants
        .filter((variant) => releasedIds.has(variant.id))
        .map((variant) => ({ id: variant.id, label: variant.variantLabel, headline: variant.headline })),
    });
  }
  return result;
}

/**
 * Safe external projection. No claim-source references, internal approval
 * notes, reviewer identities, strategy fields or financial data leave here.
 */
export async function listPlugMarketKit(authority: PlugMarketAuthorityResult): Promise<PlugMarketKitItem[]> {
  if (!canRepresentMarket(authority)) return [];
  const library = await listAssetLibrary();
  return library
    .filter((row) => row.approvedForUse)
    .map(({ asset, campaignName }) => ({
      id: asset.id,
      assetKey: asset.assetKey,
      version: asset.version,
      kind: asset.kind as MarketAssetKind,
      title: asset.title,
      locale: asset.locale,
      campaignName,
      headline: asset.approvedContent.headline,
      body: asset.approvedContent.body,
      cta: asset.approvedContent.cta,
      imageConcept: asset.approvedContent.imageConcept,
      usageGuidance: asset.usageGuidance,
      approvedForUse: true as const,
      releasedAt: asset.releasedAt,
    }));
}

export async function getMarketAsset(assetId: string): Promise<MarketAsset | null> {
  const [asset] = await db.select().from(marketAssets).where(eq(marketAssets.id, assetId)).limit(1);
  return asset ?? null;
}
