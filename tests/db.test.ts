import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/lib/db";
import { recordAuditEvent, listRecentAuditEvents } from "@/lib/audit/log";
import { getSafeMode, setSafeMode } from "@/lib/safe-mode/state";
import { listProviders } from "@/lib/ai/registry";
import { hashPassword } from "@/lib/auth/password";
import { authenticateUser } from "@/lib/auth/authenticate";

// Integration tests against a real Postgres instance (DATABASE_URL from
// .env.local, migrated via `npm run db:migrate`). Requires the dev database
// to be running — see docker-compose.yml.

describe("audit log: append-only", () => {
  it("recordAuditEvent persists and is readable back", async () => {
    const marker = randomUUID();
    await recordAuditEvent({
      eventType: "LOGIN_SUCCESS",
      actorLabel: marker,
      targetType: "test",
      metadata: { marker },
    });

    const events = await listRecentAuditEvents(500);
    const found = events.find((e) => e.actorLabel === marker);
    expect(found).toBeDefined();
    expect(found?.eventType).toBe("LOGIN_SUCCESS");
  });

  it("never stores a password/credential value under a password-like key", async () => {
    // The log itself doesn't redact — callers must not pass secrets. This
    // checks for an actual secret *value* (e.g. {"password": "hunter2"}),
    // not the presence of the word "password" in a reason code such as
    // {"reason": "bad_password"}, which is expected and fine.
    const events = await listRecentAuditEvents(1000);
    for (const event of events) {
      const serialized = JSON.stringify(event.metadata);
      expect(serialized).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
      expect(serialized).not.toMatch(/"(password|apiKey|secret|token)"\s*:\s*"[^"]{3,}"/i);
    }
  });
});

describe("safe mode", () => {
  afterAll(async () => {
    // Leave the shared dev database in its default state for anyone else
    // using it locally.
    await setSafeMode("NORMAL", await getOwnerId());
  });

  it("defaults to NORMAL and round-trips via setSafeMode", async () => {
    const ownerId = await getOwnerId();
    const before = await getSafeMode();
    expect(["NORMAL", "SAFE_MODE"]).toContain(before);

    await setSafeMode("SAFE_MODE", ownerId);
    expect(await getSafeMode()).toBe("SAFE_MODE");

    await setSafeMode("NORMAL", ownerId);
    expect(await getSafeMode()).toBe("NORMAL");
  });

  it("records a SAFE_MODE_CHANGED audit event on every change", async () => {
    const ownerId = await getOwnerId();
    await setSafeMode("SAFE_MODE", ownerId);
    const events = await listRecentAuditEvents(20);
    expect(events[0]?.eventType).toBe("SAFE_MODE_CHANGED");
    await setSafeMode("NORMAL", ownerId);
  });
});

describe("AI provider registry: honesty", () => {
  it("never returns a raw credential value, only booleans/status", async () => {
    const providers = await listProviders();
    expect(providers.length).toBeGreaterThan(0);
    for (const provider of providers) {
      const keys = Object.keys(provider);
      expect(keys).not.toContain("apiKey");
      expect(keys).not.toContain("secret");
      expect(keys).not.toContain("credentials");
      expect(typeof provider.credentialsConfigured).toBe("boolean");
    }
  });

  it("without ANTHROPIC_API_KEY set, anthropic never shows AVAILABLE", async () => {
    expect(process.env.ANTHROPIC_API_KEY).toBeFalsy();
    const providers = await listProviders();
    const anthropic = providers.find((p) => p.key === "anthropic");
    expect(anthropic).toBeDefined();
    expect(anthropic?.status).not.toBe("AVAILABLE");
  });
});

describe("authenticateUser", () => {
  const email = `test-${randomUUID()}@dev.local`;
  const password = "correct horse battery staple 42!";

  beforeAll(async () => {
    const passwordHash = await hashPassword(password);
    await db.insert(schema.users).values({
      email,
      name: "Test User",
      role: "ANALYST",
      passwordHash,
      active: true,
    });
  });

  afterAll(async () => {
    await db.delete(schema.users).where(eq(schema.users.email, email));
  });

  it("succeeds with correct credentials", async () => {
    const result = await authenticateUser(email, password);
    expect(result.ok).toBe(true);
  });

  it("fails with wrong password without revealing which part was wrong", async () => {
    const result = await authenticateUser(email, "not the password");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INVALID_CREDENTIALS");
  });

  it("fails identically for a non-existent email", async () => {
    const result = await authenticateUser("nobody-here@dev.local", password);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INVALID_CREDENTIALS");
  });

  it("rejects a deactivated account even with the correct password", async () => {
    await db.update(schema.users).set({ active: false }).where(eq(schema.users.email, email));
    const result = await authenticateUser(email, password);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("ACCOUNT_INACTIVE");
    await db.update(schema.users).set({ active: true }).where(eq(schema.users.email, email));
  });
});

async function getOwnerId(): Promise<string> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.role, "OWNER")).limit(1);
  const owner = rows[0];
  if (!owner) throw new Error("No OWNER seeded — run `npm run db:seed` first.");
  return owner.id;
}
