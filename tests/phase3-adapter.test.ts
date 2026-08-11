import { describe, expect, it } from "vitest";
import { simulatedAdapter, SIMULATE_FAILURE_MARKER } from "@/lib/distribution/adapters/simulated";
import { googleAdsAdapter } from "@/lib/distribution/adapters/google-ads";
import { metaAdsAdapter } from "@/lib/distribution/adapters/meta-ads";
import { listDistributionProviders } from "@/lib/distribution/providers";
import { routeDistribution } from "@/lib/distribution/router";

describe("simulated adapter: proves the execution architecture without spending money", () => {
  it("launch produces a simulated, prefixed external execution id, never a bare id that could pass as real", async () => {
    const result = await simulatedAdapter.launch({
      distributionPlanId: "plan-1",
      channel: "GOOGLE_SEARCH",
      approvedBudget: 100,
      currency: "USD",
      destination: null,
      cta: "Learn more",
    });
    expect(result.externalExecutionId).toMatch(/^sim_/);
    expect(result.status).toBe("RUNNING");
  });

  it("status/spendSnapshot are deterministic — repeated calls for the same id+budget return the same figures, with no remembered state", async () => {
    const launch = await simulatedAdapter.launch({
      distributionPlanId: "plan-2",
      channel: "META_FACEBOOK",
      approvedBudget: 200,
      currency: "USD",
      destination: null,
      cta: "Learn more",
    });
    const context = { approvedBudget: 200 };
    const first = await simulatedAdapter.status(launch.externalExecutionId, context);
    const second = await simulatedAdapter.status(launch.externalExecutionId, context);
    expect(first).toEqual(second);
    expect(first.reportedSpend).toBeGreaterThan(0);
    expect(first.reportedSpend).toBeLessThanOrEqual(200);
  });

  it("pause always succeeds deterministically — the DB record, not adapter memory, is the source of truth for lifecycle state", async () => {
    const launch = await simulatedAdapter.launch({
      distributionPlanId: "plan-3",
      channel: "LINKEDIN",
      approvedBudget: 50,
      currency: "USD",
      destination: null,
      cta: "Learn more",
    });
    const paused = await simulatedAdapter.pause(launch.externalExecutionId);
    expect(paused.status).toBe("PAUSED");
  });

  it("status/spendSnapshot never depend on in-process memory from a prior launch call (survives a fresh module instance)", async () => {
    // Deliberately does NOT call launch() first — proves the adapter derives
    // its figures purely from (externalExecutionId, context), never from a
    // remembered Map, which is exactly the bug this design fixes (dev-mode
    // route compilation and serverless invocations don't share memory).
    const fabricatedId = "sim_00000000-0000-0000-0000-000000000000";
    const status = await simulatedAdapter.status(fabricatedId, { approvedBudget: 100 });
    expect(status.status).toBe("RUNNING");
    expect(status.reportedSpend).toBeGreaterThan(0);
  });

  it("has a deterministic failure case for testing, via an explicit test-only marker (never a real CTA)", async () => {
    await expect(
      simulatedAdapter.launch({
        distributionPlanId: "plan-4",
        channel: "GOOGLE_SEARCH",
        approvedBudget: 100,
        currency: "USD",
        destination: null,
        cta: SIMULATE_FAILURE_MARKER,
      })
    ).rejects.toThrow();
  });

  it("never requires credentials and is always available", () => {
    expect(simulatedAdapter.validateConfiguration().ok).toBe(true);
  });
});

describe("provider readiness: never falsely reports AVAILABLE", () => {
  it("Google Ads and Meta Ads adapters always report not-configured — no credentials exist in this codebase", () => {
    expect(googleAdsAdapter.validateConfiguration().ok).toBe(false);
    expect(metaAdsAdapter.validateConfiguration().ok).toBe(false);
  });

  it("listDistributionProviders reports the simulated adapter AVAILABLE and Google/Meta NOT_CONFIGURED", () => {
    const providers = listDistributionProviders();
    const simulated = providers.find((p) => p.key === "simulated")!;
    const google = providers.find((p) => p.key === "google_ads")!;
    const meta = providers.find((p) => p.key === "meta_ads")!;

    expect(simulated.status).toBe("AVAILABLE");
    expect(simulated.isSimulated).toBe(true);
    expect(google.status).toBe("NOT_CONFIGURED");
    expect(meta.status).toBe("NOT_CONFIGURED");
  });
});

describe("distribution router: business logic never calls an adapter directly", () => {
  it("PLAN_ONLY mode never routes to any adapter", () => {
    const decision = routeDistribution("GOOGLE_SEARCH", "PLAN_ONLY");
    expect(decision.outcome).toBe("NOT_AVAILABLE");
  });

  it("SIMULATED mode always routes to the simulated adapter, for any channel", () => {
    const decision = routeDistribution("WHATSAPP", "SIMULATED");
    expect(decision.outcome).toBe("ROUTED");
    if (decision.outcome === "ROUTED") {
      expect(decision.adapterKey).toBe("simulated");
    }
  });

  it("LIVE mode for a Google-mapped channel routes to google_ads, which is not configured", () => {
    const decision = routeDistribution("GOOGLE_SEARCH", "LIVE");
    expect(decision.outcome).toBe("NOT_AVAILABLE");
  });

  it("LIVE mode never silently falls back to the simulated adapter", () => {
    const decision = routeDistribution("META_FACEBOOK", "LIVE");
    expect(decision.outcome).toBe("NOT_AVAILABLE");
    if (decision.outcome === "NOT_AVAILABLE") {
      expect(decision.reason).not.toMatch(/simulated/i);
    }
  });
});
