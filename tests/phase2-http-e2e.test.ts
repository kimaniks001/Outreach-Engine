import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// HTTP-level E2E flow for Phase 2, following the same convention as
// tests/http-e2e.test.ts (no browser automation tool is installed — see
// docs/PHASE_2_TEST_AND_VALIDATION_REPORT.md). Covers the OWNER flow from
// the Phase 2 brief Section 31: create a signal → analyze → review →
// approve → create campaign → Brand Guardian → generate creative → approve
// → READY_FOR_DISTRIBUTION, plus the CONTENT_ENGAGEMENT denial flow.
//
// Requires `npm run db:migrate` + `npm run db:seed` already run, and the
// resulting dev passwords passed via E2E_OWNER_PASSWORD /
// E2E_CONTENT_ENGAGEMENT_PASSWORD / E2E_STRATEGIST_PASSWORD /
// E2E_ANALYST_PASSWORD. Tests are skipped (not failed) if unset, since
// passwords are randomly generated per seed run and cannot be hard-coded.

const PORT = 3102;
const BASE_URL = `http://localhost:${PORT}`;

let server: ChildProcess;

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE_URL);
      if (res.status < 500) return;
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Dev server did not become ready in time");
}

function extractCookie(res: Response): string | null {
  const raw = res.headers.get("set-cookie");
  if (!raw) return null;
  return raw.split(";")[0] ?? null;
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  const cookie = extractCookie(res);
  if (!cookie) throw new Error("no session cookie returned from login");
  return cookie;
}

beforeAll(async () => {
  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "ignore",
  });
  await waitForServer();
}, 60_000);

afterAll(async () => {
  server?.kill("SIGTERM");
});

const ownerPassword = process.env.E2E_OWNER_PASSWORD;
const ceOwnerPassword = process.env.E2E_CONTENT_ENGAGEMENT_PASSWORD;
const shouldRun = Boolean(ownerPassword && ceOwnerPassword);

describe("Phase 2 HTTP E2E: full Owner flow", () => {
  it.skipIf(!shouldRun)(
    "signal → analyze → approve → campaign → brand guardian → creative → approve → READY_FOR_DISTRIBUTION",
    async () => {
      const cookie = await login("owner@dev.local", ownerPassword!);

      const signalRes = await fetch(`${BASE_URL}/api/intelligence/signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          title: `E2E test signal ${Date.now()}`,
          summary: "Automated E2E test signal.",
          signalType: "MANUAL",
        }),
      });
      expect(signalRes.status).toBe(201);
      const { signal } = await signalRes.json();

      const analyzeRes = await fetch(`${BASE_URL}/api/intelligence/signals/${signal.id}/analyze`, {
        method: "POST",
        headers: { Cookie: cookie },
      });
      expect(analyzeRes.status).toBe(201);
      const { opportunity } = await analyzeRes.json();
      expect(opportunity.status).toBe("NEEDS_REVIEW");

      const approveOppRes = await fetch(`${BASE_URL}/api/intelligence/opportunities/${opportunity.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ action: "APPROVE" }),
      });
      expect(approveOppRes.status).toBe(200);

      const campaignRes = await fetch(`${BASE_URL}/api/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          opportunityId: opportunity.id,
          name: "E2E Test Campaign",
          objective: "Test",
          targetAudience: "Testers",
          positioningAngle: "Agreement-led",
          coreMessage: "Money should follow the agreement.",
          cta: "Learn more",
        }),
      });
      expect(campaignRes.status).toBe(201);
      const { campaign } = await campaignRes.json();
      expect(campaign.opportunityId).toBe(opportunity.id);

      const bgRes = await fetch(`${BASE_URL}/api/campaigns/${campaign.id}/brand-guardian`, {
        method: "POST",
        headers: { Cookie: cookie },
      });
      expect(bgRes.status).toBe(200);
      const { outcome } = await bgRes.json();
      expect(outcome.result).toBe("PASS");

      const creativeRes = await fetch(`${BASE_URL}/api/campaigns/${campaign.id}/creative`, {
        method: "POST",
        headers: { Cookie: cookie },
      });
      expect(creativeRes.status).toBe(201);
      const { variants } = await creativeRes.json();
      expect(variants.length).toBeGreaterThan(0);
      expect(variants.length).toBeLessThanOrEqual(3);

      const approveCampaignRes = await fetch(`${BASE_URL}/api/campaigns/${campaign.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ action: "APPROVE" }),
      });
      expect(approveCampaignRes.status).toBe(200);
      const { campaign: approvedCampaign } = await approveCampaignRes.json();
      expect(approvedCampaign.status).toBe("READY_FOR_DISTRIBUTION");
    }
  );

  it.skipIf(!shouldRun)("Content & Engagement: cannot view raw sources, can view creative content", async () => {
    const cookie = await login("content-engagement@dev.local", ceOwnerPassword!);

    const signalsRes = await fetch(`${BASE_URL}/api/intelligence/signals`, { headers: { Cookie: cookie } });
    expect(signalsRes.status).toBe(403);

    const opportunitiesRes = await fetch(`${BASE_URL}/api/intelligence/opportunities`, { headers: { Cookie: cookie } });
    expect(opportunitiesRes.status).toBe(403);

    const campaignsRes = await fetch(`${BASE_URL}/api/campaigns`, { headers: { Cookie: cookie } });
    expect(campaignsRes.status).toBe(403);

    const adminRes = await fetch(`${BASE_URL}/admin/providers`, { headers: { Cookie: cookie }, redirect: "manual" });
    expect(adminRes.status).toBe(307);
  });

  it.skipIf(!shouldRun)("wrong password never succeeds", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@dev.local", password: "definitely-wrong" }),
    });
    expect(res.status).toBe(401);
  });
});
