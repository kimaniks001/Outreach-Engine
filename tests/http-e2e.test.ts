import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// End-to-end HTTP flow against a real running instance of the app (spawned
// via `next dev` on a dedicated port) and the real dev Postgres database.
// This is the closest equivalent available in this environment to a
// browser-driven E2E test (no Playwright/browser tooling is installed —
// see docs/PHASE_1_TEST_AND_VALIDATION_REPORT.md) and covers the exact flow
// requested in the Phase 1 brief Section 29:
//   login as Owner → access Admin → view provider registry → change Safe
//   Mode → logout → login as Content & Engagement → confirm Admin denied →
//   access Engagement → logout.
//
// Requires: `npm run db:migrate` and `npm run db:seed` already run against
// the database pointed to by .env.local, with the standard dev accounts
// present (see scripts/seed.ts). Credentials are read from environment
// variables set by the test runner below (never hard-coded).

const PORT = 3100;
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
    redirect: "manual",
  });
  if (res.status !== 200) {
    throw new Error(`login failed for ${email}: ${res.status}`);
  }
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

describe("HTTP E2E: full Owner and Content & Engagement flow", () => {
  const ownerPassword = process.env.E2E_OWNER_PASSWORD;
  const ceOwnerPassword = process.env.E2E_CONTENT_ENGAGEMENT_PASSWORD;

  // These env vars are set by the validation runner right after
  // `npm run db:seed` prints fresh dev passwords — see
  // docs/PHASE_1_TEST_AND_VALIDATION_REPORT.md for how this is wired for a
  // single local run. If unset, these tests are skipped rather than failed,
  // since the passwords are randomly generated per seed and cannot be
  // hard-coded.
  const shouldRun = Boolean(ownerPassword && ceOwnerPassword);

  it.skipIf(!shouldRun)("unauthenticated request is redirected to /login", async () => {
    const res = await fetch(`${BASE_URL}/today`, { redirect: "manual" });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it.skipIf(!shouldRun)("Owner: login, access Admin, view providers, change Safe Mode, logout", async () => {
    const cookie = await login("owner@dev.local", ownerPassword!);

    const adminPage = await fetch(`${BASE_URL}/admin/providers`, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });
    expect(adminPage.status).toBe(200);

    const providersApi = await fetch(`${BASE_URL}/api/admin/providers`, {
      headers: { Cookie: cookie },
    });
    expect(providersApi.status).toBe(200);
    const providersBody = (await providersApi.json()) as { providers: unknown[] };
    expect(Array.isArray(providersBody.providers)).toBe(true);
    expect(providersBody.providers.length).toBeGreaterThan(0);

    const safeModeOn = await fetch(`${BASE_URL}/api/admin/safe-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ mode: "SAFE_MODE" }),
    });
    expect(safeModeOn.status).toBe(200);

    const safeModeOff = await fetch(`${BASE_URL}/api/admin/safe-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ mode: "NORMAL" }),
    });
    expect(safeModeOff.status).toBe(200);

    const logout = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(logout.status).toBe(200);
  });

  it.skipIf(!shouldRun)(
    "Content & Engagement: login, Admin denied, Engagement allowed, cannot change Safe Mode, logout",
    async () => {
      const cookie = await login("content-engagement@dev.local", ceOwnerPassword!);

      const adminPage = await fetch(`${BASE_URL}/admin/providers`, {
        headers: { Cookie: cookie },
        redirect: "manual",
      });
      expect(adminPage.status).toBe(307); // redirected away, not shown

      const adminApi = await fetch(`${BASE_URL}/api/admin/providers`, {
        headers: { Cookie: cookie },
      });
      expect(adminApi.status).toBe(403);

      const safeModeChange = await fetch(`${BASE_URL}/api/admin/safe-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ mode: "SAFE_MODE" }),
      });
      expect(safeModeChange.status).toBe(403);

      const engagementPage = await fetch(`${BASE_URL}/engagement`, {
        headers: { Cookie: cookie },
        redirect: "manual",
      });
      expect(engagementPage.status).toBe(200);

      const logout = await fetch(`${BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers: { Cookie: cookie },
      });
      expect(logout.status).toBe(200);
    }
  );

  it.skipIf(!shouldRun)("wrong password never succeeds", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@dev.local", password: "definitely-wrong" }),
    });
    expect(res.status).toBe(401);
  });
});
