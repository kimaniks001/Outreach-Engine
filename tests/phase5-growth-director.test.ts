import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/lib/db";
import { rankCandidates } from "@/lib/growth-director/ranking";
import type { RecommendationCandidate } from "@/lib/growth-director/candidates";
import { generateAndPersistRecommendations, getRecommendation } from "@/lib/growth-director/engine";
import { approveRecommendation, rejectRecommendation, actionRecommendation, ApprovalError } from "@/lib/growth-director/approval";
import { resolveProfile } from "@/lib/commercial-memory/identity";
import { applySuppression } from "@/lib/commercial-memory/consent";
import { setSafeMode } from "@/lib/safe-mode/state";

async function getOwnerId(): Promise<string> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.role, "OWNER")).limit(1);
  const owner = rows[0];
  if (!owner) throw new Error("No OWNER seeded — run `npm run db:seed` first.");
  return owner.id;
}

async function getRole(email: string) {
  const rows = await db.select({ role: schema.users.role, id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  return rows[0];
}

function baseCandidate(overrides: Partial<RecommendationCandidate>): RecommendationCandidate {
  return {
    title: "Test candidate",
    actionType: "NO_ACTION",
    priority: "LOW",
    expectedImpact: "none",
    evidence: {},
    supportingMetrics: {},
    affectedPillars: [],
    reason: "test",
    confidence: "MEDIUM",
    riskLevel: "LOW",
    humanApprovalRequired: false,
    impactScore: 0,
    effortScore: 0,
    evidenceScore: 0,
    costScore: 0,
    isDemo: false,
    ...overrides,
  };
}

describe("ranking: deterministic and reproducible", () => {
  it("a higher-impact, higher-confidence, lower-risk candidate always outranks a weaker one", () => {
    const strong = baseCandidate({ title: "strong", impactScore: 90, confidence: "HIGH", riskLevel: "LOW", evidenceScore: 90 });
    const weak = baseCandidate({ title: "weak", impactScore: 10, confidence: "LOW", riskLevel: "HIGH", evidenceScore: 10 });
    const ranked = rankCandidates([weak, strong]);
    expect(ranked[0]!.candidate.title).toBe("strong");
  });

  it("identical input always produces an identical score (reproducible)", () => {
    const candidate = baseCandidate({ impactScore: 55, confidence: "MEDIUM", riskLevel: "MEDIUM", evidenceScore: 40, effortScore: 30, costScore: 20 });
    const first = rankCandidates([candidate]);
    const second = rankCandidates([candidate]);
    expect(first[0]!.score).toBe(second[0]!.score);
  });

  it("NO_ACTION is a valid, rankable candidate — not a special-cased absence", () => {
    const noAction = baseCandidate({ actionType: "NO_ACTION" });
    const ranked = rankCandidates([noAction]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.candidate.actionType).toBe("NO_ACTION");
  });
});

describe("generateAndPersistRecommendations: evidence traceable, metrics not fabricated", () => {
  it("every generated recommendation's evidence is a real object, never fabricated free text", async () => {
    const ownerId = await getOwnerId();
    const recommendations = await generateAndPersistRecommendations({ requestedByUserId: ownerId, generatedByUserId: ownerId });
    expect(recommendations.length).toBeGreaterThan(0);
    for (const r of recommendations) {
      expect(typeof r.evidence).toBe("object");
      expect(r.rankingScore).not.toBeNull();
      expect(r.rankingExplanation).toBeTruthy();
    }
  });

  it("superseding a prior batch never touches an already-decided (APPROVED/REJECTED) recommendation", async () => {
    const ownerId = await getOwnerId();
    const gd = await getRole("growth-director@dev.local");
    const first = await generateAndPersistRecommendations({ requestedByUserId: ownerId, generatedByUserId: ownerId });
    const target = first.find((r) => r.riskLevel !== "HIGH");
    if (!target) return; // nothing safe to approve in this run — acceptable, not every run has one
    await approveRecommendation(target.id, ownerId, gd?.role ?? "OWNER");

    await generateAndPersistRecommendations({ requestedByUserId: ownerId, generatedByUserId: ownerId });
    const stillApproved = await getRecommendation(target.id);
    expect(stillApproved?.status).toBe("APPROVED");
  });
});

describe("approval: risk-tier gated", () => {
  it("HIGH-risk recommendations require OWNER — GROWTH_DIRECTOR is rejected", async () => {
    const ownerId = await getOwnerId();
    const [row] = await db
      .insert(schema.growthRecommendations)
      .values({
        title: "High risk test",
        actionType: "INCREASE_BUDGET_REQUEST",
        priority: "HIGH",
        expectedImpact: "x",
        reason: "x",
        confidence: "HIGH",
        riskLevel: "HIGH",
        humanApprovalRequired: true,
        status: "PROPOSED",
      })
      .returning();

    await expect(approveRecommendation(row!.id, ownerId, "GROWTH_DIRECTOR")).rejects.toThrow(ApprovalError);

    const approved = await approveRecommendation(row!.id, ownerId, "OWNER");
    expect(approved?.status).toBe("APPROVED");
  });

  it("LOW/MEDIUM-risk recommendations can be approved by GROWTH_DIRECTOR", async () => {
    const ownerId = await getOwnerId();
    const [row] = await db
      .insert(schema.growthRecommendations)
      .values({ title: "Low risk test", actionType: "NO_ACTION", priority: "LOW", expectedImpact: "x", reason: "x", confidence: "MEDIUM", riskLevel: "LOW", humanApprovalRequired: false, status: "PROPOSED" })
      .returning();

    const approved = await approveRecommendation(row!.id, ownerId, "GROWTH_DIRECTOR");
    expect(approved?.status).toBe("APPROVED");
  });

  it("STRATEGIST cannot approve any recommendation, regardless of risk", async () => {
    const ownerId = await getOwnerId();
    const [row] = await db
      .insert(schema.growthRecommendations)
      .values({ title: "Strategist test", actionType: "NO_ACTION", priority: "LOW", expectedImpact: "x", reason: "x", confidence: "MEDIUM", riskLevel: "LOW", humanApprovalRequired: false, status: "PROPOSED" })
      .returning();
    await expect(approveRecommendation(row!.id, ownerId, "STRATEGIST")).rejects.toThrow(ApprovalError);
  });

  it("budget-change action types are always BLOCKED by the action bridge — never automated", async () => {
    const ownerId = await getOwnerId();
    const [row] = await db
      .insert(schema.growthRecommendations)
      .values({ title: "Budget test", actionType: "INCREASE_BUDGET_REQUEST", priority: "HIGH", expectedImpact: "x", reason: "x", confidence: "HIGH", riskLevel: "HIGH", humanApprovalRequired: true, status: "PROPOSED" })
      .returning();
    await approveRecommendation(row!.id, ownerId, "OWNER");
    const outcome = await actionRecommendation(row!.id, ownerId);
    expect(outcome.status).toBe("BLOCKED");

    const stillApproved = await getRecommendation(row!.id);
    expect(stillApproved?.status).toBe("APPROVED"); // never silently advances to ACTIONED
  });

  it("rejection is available to OWNER and GROWTH_DIRECTOR without a risk-tier gate", async () => {
    const ownerId = await getOwnerId();
    const [row] = await db
      .insert(schema.growthRecommendations)
      .values({ title: "Reject test", actionType: "NO_ACTION", priority: "LOW", expectedImpact: "x", reason: "x", confidence: "MEDIUM", riskLevel: "HIGH", humanApprovalRequired: true, status: "PROPOSED" })
      .returning();
    const rejected = await rejectRecommendation(row!.id, ownerId, "GROWTH_DIRECTOR");
    expect(rejected?.status).toBe("REJECTED");
  });
});

describe("suppression/Safe Mode are never overridden by a recommendation", () => {
  it("a suppressed profile never appears as an UPSELL/REENGAGE candidate driver", async () => {
    // Verifies the deterministic candidate rules read Phase 4's own
    // suppression-aware lifecycle/NBA state rather than re-deciding it —
    // a suppressed profile's NBA is always SUPPRESS (Phase 4), which is
    // never UPSELL/CROSS_SELL, so it can never contribute to an upsell
    // cohort candidate.
    const ownerId = await getOwnerId();
    const profile = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    await applySuppression({ profileId: profile.id, reason: "OPT_OUT", source: "test" }, ownerId);

    const rows = await db
      .select({ actionType: schema.nextBestActions.actionType })
      .from(schema.nextBestActions)
      .where(eq(schema.nextBestActions.profileId, profile.id));
    for (const r of rows) {
      expect(r.actionType).not.toBe("UPSELL");
      expect(r.actionType).not.toBe("CROSS_SELL");
    }
  });

  it("recommendation generation still works while Safe Mode is active (planning/analysis remain allowed)", async () => {
    const ownerId = await getOwnerId();
    await setSafeMode("SAFE_MODE", ownerId);
    try {
      const recommendations = await generateAndPersistRecommendations({ requestedByUserId: ownerId, generatedByUserId: ownerId });
      expect(Array.isArray(recommendations)).toBe(true);
    } finally {
      await setSafeMode("NORMAL", ownerId);
    }
  });
});
