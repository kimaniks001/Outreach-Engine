import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Role } from "@/lib/rbac/roles";
import { recordAuditEvent } from "@/lib/audit/log";
import { checkText, resultFromFindings } from "@/lib/brand-guardian/rules";
import {
  campaignClaimSources,
  claimSources,
  marketReleaseRecords,
  marketReviewDecisions,
  type ClaimSourceSnapshot,
  type ClaimSource,
} from "./schema";
import { creativeSnapshot, fingerprintCampaignBundle } from "./fingerprint";

export type ClaimSourceType =
  | "DOCTRINE"
  | "TERMS"
  | "PRICING"
  | "PRODUCT_AUTHORITY"
  | "LEGAL_APPROVAL"
  | "POLICY"
  | "OTHER";

export type ClaimSourceStatus = "CURRENT" | "SUPERSEDED" | "RETIRED";
export type ReviewAction = "APPROVE" | "REJECT" | "REVISION_REQUIRED";

export interface CreateClaimSourceInput {
  sourceKey: string;
  title: string;
  sourceType: ClaimSourceType;
  version: string;
  sourceReference: string;
  contentDigest?: string | null;
  effectiveFrom?: Date | null;
  effectiveUntil?: Date | null;
}

export async function createClaimSource(input: CreateClaimSourceInput, actorUserId: string, actorRole: Role) {
  requireOwner(actorRole, "Only the Owner may register an authoritative claim source in this phase.");
  const [row] = await db
    .insert(claimSources)
    .values({
      ...input,
      contentDigest: input.contentDigest ?? null,
      effectiveFrom: input.effectiveFrom ?? null,
      effectiveUntil: input.effectiveUntil ?? null,
      createdByUserId: actorUserId,
    })
    .returning();

  await recordAuditEvent({
    eventType: "CLAIM_SOURCE_REGISTERED",
    actorUserId,
    targetType: "claim_source",
    targetId: row!.id,
    metadata: { sourceKey: row!.sourceKey, version: row!.version, sourceType: row!.sourceType },
  });
  return row!;
}

export async function setClaimSourceStatus(
  sourceId: string,
  status: ClaimSourceStatus,
  actorUserId: string,
  actorRole: Role
) {
  requireOwner(actorRole, "Only the Owner may change claim-source status in this phase.");
  const [row] = await db
    .update(claimSources)
    .set({ status, updatedAt: new Date() })
    .where(eq(claimSources.id, sourceId))
    .returning();
  if (!row) throw new Error("Claim source not found.");

  await recordAuditEvent({
    eventType: "CLAIM_SOURCE_STATUS_CHANGED",
    actorUserId,
    targetType: "claim_source",
    targetId: sourceId,
    metadata: { status },
  });
  return row;
}

export async function listClaimSources(): Promise<ClaimSource[]> {
  return db.select().from(claimSources).orderBy(desc(claimSources.createdAt));
}

export async function attachClaimSource(
  campaignId: string,
  claimSourceId: string,
  actorUserId: string,
  actorRole: Role,
  note?: string
) {
  if (actorRole !== "OWNER" && actorRole !== "GROWTH_DIRECTOR" && actorRole !== "STRATEGIST") {
    throw new Error("Your role cannot attach claim sources to a campaign.");
  }
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found.");
  const [source] = await db.select().from(claimSources).where(eq(claimSources.id, claimSourceId)).limit(1);
  if (!source) throw new Error("Claim source not found.");
  if (!isSourceCurrent(source)) throw new Error("Only a CURRENT, effective claim source may be attached.");

  const [row] = await db
    .insert(campaignClaimSources)
    .values({ campaignId, claimSourceId, note: note ?? null, attachedByUserId: actorUserId })
    .onConflictDoNothing()
    .returning();

  await recordAuditEvent({
    eventType: "CLAIM_SOURCE_ATTACHED",
    actorUserId,
    targetType: "campaign",
    targetId: campaignId,
    metadata: { claimSourceId, sourceKey: source.sourceKey, version: source.version },
  });
  return row ?? null;
}

export async function listCampaignSources(campaignId: string) {
  const rows = await db
    .select({ source: claimSources, note: campaignClaimSources.note })
    .from(campaignClaimSources)
    .innerJoin(claimSources, eq(campaignClaimSources.claimSourceId, claimSources.id))
    .where(eq(campaignClaimSources.campaignId, campaignId))
    .orderBy(desc(campaignClaimSources.createdAt));
  return rows;
}

export async function reviewBrandClaims(
  campaignId: string,
  action: ReviewAction,
  actorUserId: string,
  actorRole: Role,
  notes?: string
) {
  if (actorRole !== "OWNER" && actorRole !== "GROWTH_DIRECTOR") {
    throw new Error("Your role cannot approve Brand & Claims.");
  }

  const bundle = await getCampaignBundle(campaignId);
  if (!bundle) throw new Error("Campaign not found.");
  const { campaign, variants } = bundle;
  const fingerprint = fingerprintCampaignBundle(campaign, variants);
  const sources = await currentSourceSnapshot(campaignId);

  if (action === "APPROVE") {
    if (campaign.brandGuardianStatus !== "PASS") {
      throw new Error("Brand & Claims approval requires a passing Brand Guardian review.");
    }
    if (campaign.status !== "AWAITING_APPROVAL" && campaign.status !== "APPROVED") {
      throw new Error(`Campaign is not awaiting Brand & Claims approval (current status: ${campaign.status}).`);
    }
    if (sources.length === 0) {
      throw new Error("Brand & Claims approval requires at least one CURRENT authoritative claim source.");
    }
    const findings = bundleFindings(campaign, variants);
    if (resultFromFindings(findings) !== "PASS") {
      throw new Error("Current campaign or creative copy contains Brand Guardian findings and cannot be approved.");
    }
  }

  const [decision] = await db
    .insert(marketReviewDecisions)
    .values({
      campaignId,
      lane: "BRAND_CLAIMS",
      action,
      contentFingerprint: fingerprint,
      sourceSnapshot: sources,
      notes: notes ?? null,
      actorUserId,
    })
    .returning();

  const nextStatus = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "NEEDS_REVISION";
  const [updated] = await db
    .update(schema.campaigns)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(schema.campaigns.id, campaignId))
    .returning();

  await db.insert(schema.approvalEvents).values({
    subjectType: "campaign",
    subjectId: campaignId,
    action: action === "REVISION_REQUIRED" ? "REVISION_REQUESTED" : action,
    actorUserId,
    notes: notes ?? null,
  });

  await recordAuditEvent({
    eventType: "CAMPAIGN_MARKET_REVIEWED",
    actorUserId,
    targetType: "campaign",
    targetId: campaignId,
    metadata: { lane: "BRAND_CLAIMS", action, fingerprint },
  });

  return { campaign: updated!, decision: decision! };
}

export async function reviewComplianceLegal(
  campaignId: string,
  action: ReviewAction,
  actorUserId: string,
  actorRole: Role,
  notes?: string
) {
  requireOwner(actorRole, "Compliance/Legal clearance is Owner-only until dedicated authority roles are introduced.");
  const bundle = await getCampaignBundle(campaignId);
  if (!bundle) throw new Error("Campaign not found.");
  const { campaign, variants } = bundle;
  if (campaign.status !== "APPROVED" && action === "APPROVE") {
    throw new Error("Compliance/Legal approval requires current Brand & Claims approval first.");
  }

  const fingerprint = fingerprintCampaignBundle(campaign, variants);
  const sources = await currentSourceSnapshot(campaignId);
  if (action === "APPROVE") {
    if (sources.length === 0) throw new Error("Compliance/Legal approval requires authoritative claim sources.");
    await requireCurrentDecision(campaignId, "BRAND_CLAIMS", fingerprint, sources);
  }

  const [decision] = await db
    .insert(marketReviewDecisions)
    .values({
      campaignId,
      lane: "COMPLIANCE_LEGAL",
      action,
      contentFingerprint: fingerprint,
      sourceSnapshot: sources,
      notes: notes ?? null,
      actorUserId,
    })
    .returning();

  if (action !== "APPROVE") {
    await db
      .update(schema.campaigns)
      .set({ status: action === "REJECT" ? "REJECTED" : "NEEDS_REVISION", updatedAt: new Date() })
      .where(eq(schema.campaigns.id, campaignId));
  }

  await recordAuditEvent({
    eventType: "CAMPAIGN_MARKET_REVIEWED",
    actorUserId,
    targetType: "campaign",
    targetId: campaignId,
    metadata: { lane: "COMPLIANCE_LEGAL", action, fingerprint },
  });
  return decision!;
}

export async function releaseCampaignToMarket(
  campaignId: string,
  actorUserId: string,
  actorRole: Role,
  notes?: string
) {
  requireOwner(actorRole, "Final market release is Owner-only in this phase.");
  const bundle = await getCampaignBundle(campaignId);
  if (!bundle) throw new Error("Campaign not found.");
  const { campaign, variants } = bundle;
  if (campaign.status !== "APPROVED" && campaign.status !== "READY_FOR_DISTRIBUTION") {
    throw new Error(`Campaign is not approved for release (current status: ${campaign.status}).`);
  }

  const fingerprint = fingerprintCampaignBundle(campaign, variants);
  const sources = await currentSourceSnapshot(campaignId);
  if (sources.length === 0) throw new Error("Final market release requires at least one CURRENT authoritative claim source.");

  const brandDecision = await requireCurrentDecision(campaignId, "BRAND_CLAIMS", fingerprint, sources);
  const complianceDecision =
    campaign.riskLevel === "HIGH"
      ? await requireCurrentDecision(campaignId, "COMPLIANCE_LEGAL", fingerprint, sources)
      : await latestMatchingApproval(campaignId, "COMPLIANCE_LEGAL", fingerprint, sources);

  const findings = bundleFindings(campaign, variants);
  if (resultFromFindings(findings) !== "PASS") {
    throw new Error("Current market content no longer passes deterministic Brand Guardian rules.");
  }

  const [finalDecision] = await db
    .insert(marketReviewDecisions)
    .values({
      campaignId,
      lane: "FINAL_MARKET_RELEASE",
      action: "APPROVE",
      contentFingerprint: fingerprint,
      sourceSnapshot: sources,
      notes: notes ?? null,
      actorUserId,
    })
    .returning();

  const [versionRow] = await db
    .select({ nextVersion: sql<number>`coalesce(max(${marketReleaseRecords.releaseVersion}), 0)::int + 1` })
    .from(marketReleaseRecords)
    .where(eq(marketReleaseRecords.campaignId, campaignId));

  const [release] = await db
    .insert(marketReleaseRecords)
    .values({
      campaignId,
      releaseVersion: versionRow?.nextVersion ?? 1,
      contentFingerprint: fingerprint,
      sourceSnapshot: sources,
      creativeSnapshot: creativeSnapshot(variants),
      brandDecisionId: brandDecision.id,
      complianceDecisionId: complianceDecision?.id ?? null,
      finalReleaseDecisionId: finalDecision!.id,
      releasedByUserId: actorUserId,
    })
    .returning();

  const [updated] = await db
    .update(schema.campaigns)
    .set({ status: "READY_FOR_DISTRIBUTION", updatedAt: new Date() })
    .where(eq(schema.campaigns.id, campaignId))
    .returning();

  await recordAuditEvent({
    eventType: "CAMPAIGN_RELEASED_TO_MARKET",
    actorUserId,
    targetType: "campaign",
    targetId: campaignId,
    metadata: { releaseId: release!.id, releaseVersion: release!.releaseVersion, fingerprint },
  });
  return { campaign: updated!, release: release! };
}

export async function getCurrentMarketRelease(campaignId: string) {
  const bundle = await getCampaignBundle(campaignId);
  if (!bundle) return null;
  const fingerprint = fingerprintCampaignBundle(bundle.campaign, bundle.variants);
  const sources = await currentSourceSnapshot(campaignId);
  const [release] = await db
    .select()
    .from(marketReleaseRecords)
    .where(eq(marketReleaseRecords.campaignId, campaignId))
    .orderBy(desc(marketReleaseRecords.releaseVersion))
    .limit(1);
  if (!release) return null;
  if (release.contentFingerprint !== fingerprint) return null;
  if (!sameSources(release.sourceSnapshot, sources)) return null;
  return release;
}

export async function listMarketReviewDecisions(campaignId: string) {
  return db
    .select()
    .from(marketReviewDecisions)
    .where(eq(marketReviewDecisions.campaignId, campaignId))
    .orderBy(desc(marketReviewDecisions.createdAt));
}

export async function listApprovalQueue() {
  const campaigns = await db.select().from(schema.campaigns).orderBy(desc(schema.campaigns.updatedAt));
  return Promise.all(
    campaigns.map(async (campaign) => {
      const [decisions, sources, release] = await Promise.all([
        listMarketReviewDecisions(campaign.id),
        currentSourceSnapshot(campaign.id),
        getCurrentMarketRelease(campaign.id),
      ]);
      return {
        campaign,
        sourceCount: sources.length,
        brandDecision: decisions.find((d) => d.lane === "BRAND_CLAIMS") ?? null,
        complianceDecision: decisions.find((d) => d.lane === "COMPLIANCE_LEGAL") ?? null,
        finalDecision: decisions.find((d) => d.lane === "FINAL_MARKET_RELEASE") ?? null,
        currentRelease: release,
      };
    })
  );
}

async function getCampaign(campaignId: string) {
  const [campaign] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId)).limit(1);
  return campaign ?? null;
}

async function getCampaignBundle(campaignId: string) {
  const campaign = await getCampaign(campaignId);
  if (!campaign) return null;
  const variants = await db
    .select()
    .from(schema.creativeVariants)
    .where(eq(schema.creativeVariants.campaignId, campaignId));
  return { campaign, variants };
}

function bundleFindings(campaign: schema.Campaign, variants: schema.CreativeVariant[]) {
  const fields: Array<[string, string]> = [
    ["Campaign core message", campaign.coreMessage],
    ["Campaign positioning", campaign.positioningAngle],
    ["Campaign CTA", campaign.cta],
    ["Campaign creative brief", campaign.creativeBrief ?? ""],
  ];
  for (const variant of variants) {
    fields.push(
      [`Variant ${variant.variantLabel} headline`, variant.headline],
      [`Variant ${variant.variantLabel} body`, variant.body],
      [`Variant ${variant.variantLabel} CTA`, variant.cta],
      [`Variant ${variant.variantLabel} image concept`, variant.imageConcept]
    );
  }
  return fields.flatMap(([label, value]) => checkText(value, label));
}

async function currentSourceSnapshot(campaignId: string): Promise<ClaimSourceSnapshot[]> {
  const rows = await db
    .select({ source: claimSources })
    .from(campaignClaimSources)
    .innerJoin(claimSources, eq(campaignClaimSources.claimSourceId, claimSources.id))
    .where(and(eq(campaignClaimSources.campaignId, campaignId), eq(claimSources.status, "CURRENT")));

  return rows
    .map(({ source }) => source)
    .filter(isSourceCurrent)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((source) => ({
      id: source.id,
      sourceKey: source.sourceKey,
      title: source.title,
      sourceType: source.sourceType,
      version: source.version,
      sourceReference: source.sourceReference,
      contentDigest: source.contentDigest,
      status: source.status,
    }));
}

function isSourceCurrent(source: ClaimSource): boolean {
  if (source.status !== "CURRENT") return false;
  const now = Date.now();
  if (source.effectiveFrom && source.effectiveFrom.getTime() > now) return false;
  if (source.effectiveUntil && source.effectiveUntil.getTime() <= now) return false;
  return true;
}

async function requireCurrentDecision(
  campaignId: string,
  lane: "BRAND_CLAIMS" | "COMPLIANCE_LEGAL",
  fingerprint: string,
  sources: ClaimSourceSnapshot[]
) {
  const decision = await latestMatchingApproval(campaignId, lane, fingerprint, sources);
  if (!decision) {
    throw new Error(`${lane === "BRAND_CLAIMS" ? "Brand & Claims" : "Compliance/Legal"} approval is missing or stale for the current content/source versions.`);
  }
  return decision;
}

async function latestMatchingApproval(
  campaignId: string,
  lane: "BRAND_CLAIMS" | "COMPLIANCE_LEGAL",
  fingerprint: string,
  sources: ClaimSourceSnapshot[]
) {
  const rows = await db
    .select()
    .from(marketReviewDecisions)
    .where(and(eq(marketReviewDecisions.campaignId, campaignId), eq(marketReviewDecisions.lane, lane)))
    .orderBy(desc(marketReviewDecisions.createdAt));
  const latest = rows[0];
  if (!latest || latest.action !== "APPROVE") return null;
  if (latest.contentFingerprint !== fingerprint) return null;
  if (!sameSources(latest.sourceSnapshot, sources)) return null;
  return latest;
}

function sameSources(a: ClaimSourceSnapshot[], b: ClaimSourceSnapshot[]): boolean {
  const normalize = (rows: ClaimSourceSnapshot[]) =>
    [...rows]
      .sort((x, y) => x.id.localeCompare(y.id))
      .map(({ id, sourceKey, version, contentDigest, status }) => ({ id, sourceKey, version, contentDigest, status }));
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function requireOwner(role: Role, message: string) {
  if (role !== "OWNER") throw new Error(message);
}
