import { createServer, type Server } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const APP_PORT = 3112;
const AUTHORITY_PORT = 4112;
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const AUTHORITY_URL = `http://127.0.0.1:${AUTHORITY_PORT}`;
const CALLER_COOKIE = "outreach_securepay_access=caller-token; outreach_securepay_ks_hint=KS-TEST-1";

let app: ChildProcess;
let authority: Server;
let member = false;
let posts: Array<Record<string, unknown>> = [];

function json(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function waitForApp(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${APP_URL}/market-login`);
      if (response.status < 500) return;
    } catch {
      // The Next.js process is still compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("Outreach dev server did not become ready");
}

beforeAll(async () => {
  authority = createServer(async (request, response) => {
    if (request.headers.authorization !== "Bearer caller-token") {
      json(response, 401, { error: "unauthorised" });
      return;
    }

    const url = new URL(request.url ?? "/", AUTHORITY_URL);
    if (request.method === "GET" && url.pathname === "/communities") {
      json(response, 200, [communitySummary()]);
      return;
    }
    if (request.method === "GET" && url.pathname === "/communities/me") {
      json(response, 200, {
        memberships: member
          ? [{ communityId: "community-1", role: "MEMBER", status: "ACTIVE", joinedAt: "2026-09-01T10:00:00Z" }]
          : [],
        pendingJoinRequests: [],
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/communities/community-1") {
      json(response, 200, {
        ...communitySummary(),
        rules: "Be useful and respectful.",
        updatedAt: "2026-09-01T10:00:00Z",
        callerRole: member ? "MEMBER" : null,
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/communities/community-1/feed") {
      json(response, 200, posts);
      return;
    }
    if (request.method === "POST" && url.pathname === "/communities/community-1/join") {
      member = true;
      json(response, 201, {
        communityId: "community-1",
        role: "MEMBER",
        status: "ACTIVE",
        joinedAt: "2026-09-01T10:00:00Z",
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/communities/community-1/leave") {
      member = false;
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method === "POST" && url.pathname === "/communities/community-1/feed") {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const input = JSON.parse(raw) as { title: string; body: string; visibility: string };
      const post = {
        id: `post-${posts.length + 1}`,
        communityId: "community-1",
        authorIdentityId: "caller-identity",
        title: input.title,
        body: input.body,
        visibility: input.visibility,
        publishedAt: "2026-09-01T10:01:00Z",
        sourceType: null,
        sourceReferenceId: null,
      };
      posts = [...posts, post];
      json(response, 201, post);
      return;
    }

    json(response, 404, { error: "not found" });
  });

  await new Promise<void>((resolve) => authority.listen(AUTHORITY_PORT, "127.0.0.1", resolve));
  app = spawn("npx", ["next", "dev", "-p", String(APP_PORT), "-H", "127.0.0.1"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: "postgres://unused:unused@127.0.0.1:5999/unused",
      SESSION_SECRET: "community-http-e2e-session-secret",
      SECUREPAY_API_BASE_URL: AUTHORITY_URL,
    },
    stdio: "ignore",
  });
  await waitForApp();
}, 60_000);

afterAll(async () => {
  app?.kill("SIGTERM");
  await new Promise<void>((resolve, reject) =>
    authority.close((error) => (error ? reject(error) : resolve()))
  );
});

describe("Community LIVE HTTP actions", () => {
  it("allows the SecurePay caller session to reach market and readiness handlers", async () => {
    const readiness = await fetch(`${APP_URL}/api/readiness/attempt`, {
      method: "POST",
      headers: { Cookie: CALLER_COOKIE, "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(readiness.status).toBe(422);

    const market = await fetch(`${APP_URL}/api/market-network/opportunities/offer-1/decision`, {
      method: "POST",
      headers: { Cookie: CALLER_COOKIE, "content-type": "application/json" },
      body: JSON.stringify({ decision: "UNKNOWN" }),
    });
    expect(market.status).toBe(422);
  });

  it("persists join, publish and leave through caller-scoped SecurePay authority", async () => {
    const beforeJoin = await communityPage();
    expect(beforeJoin.status).toBe(200);
    expect(await beforeJoin.text()).toContain("Join Community");

    const join = await fetch(`${APP_URL}/api/community/communities/community-1/membership`, {
      method: "POST",
      headers: { Cookie: CALLER_COOKIE, "content-type": "application/json" },
      body: JSON.stringify({ action: "JOIN" }),
    });
    expect(join.status).toBe(201);

    const afterJoin = await communityPage();
    const joinedHtml = await afterJoin.text();
    expect(joinedHtml).toContain("Leave Community");
    expect(joinedHtml).toContain("Write a Community post");

    const publish = await fetch(`${APP_URL}/api/community/communities/community-1/feed`, {
      method: "POST",
      headers: { Cookie: CALLER_COOKIE, "content-type": "application/json" },
      body: JSON.stringify({
        title: "A real market lesson",
        body: "Shared through SecurePay Community authority.",
        visibility: "MEMBER",
      }),
    });
    expect(publish.status).toBe(201);

    const afterPublish = await communityPage();
    expect(await afterPublish.text()).toContain("A real market lesson");

    const leave = await fetch(`${APP_URL}/api/community/communities/community-1/membership`, {
      method: "POST",
      headers: { Cookie: CALLER_COOKIE, "content-type": "application/json" },
      body: JSON.stringify({ action: "LEAVE" }),
    });
    expect(leave.status).toBe(200);

    const afterLeave = await communityPage();
    expect(await afterLeave.text()).toContain("Join Community");
  });
});

function communitySummary() {
  return {
    id: "community-1",
    name: "SecurePay Builders",
    description: "People carrying SecurePay into real trade.",
    visibility: "PUBLIC",
    membershipPolicy: "OPEN",
    status: "ACTIVE",
    memberCount: member ? 11 : 10,
    createdAt: "2026-09-01T09:00:00Z",
  };
}

function communityPage() {
  return fetch(`${APP_URL}/community-live`, {
    headers: { Cookie: CALLER_COOKIE },
    redirect: "manual",
  });
}
