import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applyWhatsAppIdentityBindingAssertion } from "./identity-binding";
import { ingestWhatsAppMessage } from "./intake";
import { processWhatsAppTriageBatch } from "./triage-worker";
import { processWhatsAppOutboxBatch } from "./outbox-worker";
import { queueWhatsAppHumanReply } from "./human-reply";

const describeDb = process.env.DATABASE_URL ? describe.sequential : describe.skip;

describe("WhatsApp binding authority surface", () => {
  it("does not export the legacy direct-binding bypass", async () => {
    const intake = await import("./intake");
    expect("bindVerifiedWhatsAppIdentity" in intake).toBe(false);
  });
});

describeDb("WhatsApp binding epoch consumer hardening", () => {
  it("does not process an A message under B after revoke and rebind", async () => {
    const fixture = makeFixture();
    const providerMessageId = `wamid.${fixture.token}`;

    try {
      await bind(fixture.address, fixture.identityA, 1, `bind-a-${fixture.token}`);
      const intake = await ingestWhatsAppMessage({
        messageId: providerMessageId,
        from: fixture.address,
        sentAt: new Date("2026-09-11T07:00:00Z"),
        kind: "TEXT",
        body: "Where is my agreement?",
        replyToMessageId: null,
        raw: { id: providerMessageId },
      });
      expect(intake.status).toBe("TRIAGE_PENDING");

      await db.execute(sql`
        UPDATE support_triage_jobs
           SET available_at = now() - interval '1 second', created_at = '2000-01-01T00:00:00Z'
         WHERE channel_message_id = (
           SELECT id FROM support_channel_messages
            WHERE channel = 'WHATSAPP' AND channel_message_id = ${providerMessageId}
         )
      `);

      await revoke(fixture.address, fixture.identityA, 2, `revoke-a-${fixture.token}`);
      await bind(fixture.address, fixture.identityB, 3, `bind-b-${fixture.token}`);

      await processWhatsAppTriageBatch(1);

      const state = rows<{ processingStatus: string; decisions: number }>(await db.execute(sql`
        SELECT m.processing_status AS "processingStatus",
               (SELECT count(*)::int FROM support_triage_decisions d WHERE d.channel_message_id = m.id) AS decisions
          FROM support_channel_messages m
         WHERE m.channel = 'WHATSAPP' AND m.channel_message_id = ${providerMessageId}
      `))[0];
      expect(state).toEqual({ processingStatus: "STALE_BINDING", decisions: 0 });
    } finally {
      await cleanupFixture(fixture.address, [fixture.identityA, fixture.identityB]);
    }
  });

  it("cancels queued A output instead of sending it after the address moves to B", async () => {
    const fixture = makeFixture();
    const dedupeKey = `epoch-b-${fixture.token}`;
    const bindAssertionId = `bind-a-${fixture.token}`;

    try {
      await bind(fixture.address, fixture.identityA, 1, bindAssertionId);
      await db.execute(sql`
        INSERT INTO support_channel_outbox (
          dedupe_key, channel, channel_address, body, purpose, status, created_at,
          expected_securepay_identity_ref, expected_binding_authority_sequence, expected_binding_assertion_id
        ) VALUES (
          ${dedupeKey}, 'WHATSAPP', ${fixture.address}, 'Message for A', 'ACKNOWLEDGEMENT', 'PENDING',
          '2000-01-01T00:00:00Z', ${fixture.identityA}, 1, ${bindAssertionId}
        )
      `);

      await revoke(fixture.address, fixture.identityA, 2, `revoke-a-${fixture.token}`);
      await bind(fixture.address, fixture.identityB, 3, `bind-b-${fixture.token}`);

      const result = await processWhatsAppOutboxBatch(1);
      expect(result.cancelled).toBe(1);

      const row = rows<{ status: string; providerMessageId: string | null }>(await db.execute(sql`
        SELECT status, provider_message_id AS "providerMessageId"
          FROM support_channel_outbox
         WHERE dedupe_key = ${dedupeKey}
      `))[0];
      expect(row).toEqual({ status: "CANCELLED", providerMessageId: null });
    } finally {
      await cleanupFixture(fixture.address, [fixture.identityA, fixture.identityB]);
    }
  });

  it("treats revoke and rebind to the same identity as a new epoch", async () => {
    const fixture = makeFixture();
    const dedupeKey = `epoch-same-${fixture.token}`;
    const bindAssertionId = `bind-a-${fixture.token}`;

    try {
      await bind(fixture.address, fixture.identityA, 1, bindAssertionId);
      await db.execute(sql`
        INSERT INTO support_channel_outbox (
          dedupe_key, channel, channel_address, body, purpose, status, created_at,
          expected_securepay_identity_ref, expected_binding_authority_sequence, expected_binding_assertion_id
        ) VALUES (
          ${dedupeKey}, 'WHATSAPP', ${fixture.address}, 'Old epoch message', 'ACKNOWLEDGEMENT', 'PENDING',
          '2000-01-01T00:00:00Z', ${fixture.identityA}, 1, ${bindAssertionId}
        )
      `);

      await revoke(fixture.address, fixture.identityA, 2, `revoke-a-${fixture.token}`);
      await bind(fixture.address, fixture.identityA, 3, `rebind-a-${fixture.token}`);

      const result = await processWhatsAppOutboxBatch(1);
      expect(result.cancelled).toBe(1);

      const status = rows<{ status: string }>(await db.execute(sql`
        SELECT status FROM support_channel_outbox WHERE dedupe_key = ${dedupeKey}
      `))[0]?.status;
      expect(status).toBe("CANCELLED");
    } finally {
      await cleanupFixture(fixture.address, [fixture.identityA]);
    }
  });

  it("refuses a human reply from A's historical conversation after the address moves to B", async () => {
    const fixture = makeFixture();
    const providerMessageId = `wamid.human.${fixture.token}`;

    try {
      const actor = rows<{ id: string }>(await db.execute(sql`
        SELECT id::text AS id FROM users WHERE active = TRUE ORDER BY created_at LIMIT 1
      `))[0];
      expect(actor?.id).toBeTruthy();

      await bind(fixture.address, fixture.identityA, 1, `bind-a-${fixture.token}`);
      const intake = await ingestWhatsAppMessage({
        messageId: providerMessageId,
        from: fixture.address,
        sentAt: new Date("2026-09-11T07:00:00Z"),
        kind: "TEXT",
        body: "Hello support",
        replyToMessageId: null,
        raw: { id: providerMessageId },
      });
      expect(intake.status).toBe("TRIAGE_PENDING");
      if (intake.status !== "TRIAGE_PENDING") throw new Error("Expected bound WhatsApp conversation");

      await revoke(fixture.address, fixture.identityA, 2, `revoke-a-${fixture.token}`);
      await bind(fixture.address, fixture.identityB, 3, `bind-b-${fixture.token}`);

      await expect(queueWhatsAppHumanReply({
        actorUserId: actor!.id,
        conversationId: intake.conversationId,
        body: "Reply that must not leak to B",
      })).rejects.toThrow("no current verified WhatsApp binding");
    } finally {
      await cleanupFixture(fixture.address, [fixture.identityA, fixture.identityB]);
    }
  });
});

function makeFixture(): { token: string; address: string; identityA: string; identityB: string } {
  const token = randomUUID().replaceAll("-", "");
  const digits = token.replace(/[^0-9]/g, "").padEnd(12, "7").slice(0, 8);
  return {
    token,
    address: `2547${digits}`,
    identityA: `KS-EPOCH-A-${token.slice(0, 12)}`,
    identityB: `KS-EPOCH-B-${token.slice(12, 24)}`,
  };
}

async function bind(address: string, identity: string, sequence: number, assertionId: string): Promise<void> {
  const result = await applyWhatsAppIdentityBindingAssertion({
    assertionId,
    channel: "WHATSAPP",
    channelAddress: address,
    securepayIdentityRef: identity,
    action: "BIND",
    authoritySequence: sequence,
    occurredAt: new Date(Date.UTC(2026, 8, 11, 7, sequence, 0)).toISOString(),
  });
  expect(result.status).toBe("APPLIED");
}

async function revoke(address: string, identity: string, sequence: number, assertionId: string): Promise<void> {
  const result = await applyWhatsAppIdentityBindingAssertion({
    assertionId,
    channel: "WHATSAPP",
    channelAddress: address,
    securepayIdentityRef: identity,
    action: "REVOKE",
    authoritySequence: sequence,
    occurredAt: new Date(Date.UTC(2026, 8, 11, 7, sequence, 30)).toISOString(),
  });
  expect(result.status).toBe("APPLIED");
}

async function cleanupFixture(address: string, identities: string[]): Promise<void> {
  await db.execute(sql`DELETE FROM support_channel_outbox WHERE channel = 'WHATSAPP' AND channel_address = ${address}`);
  await db.execute(sql`
    DELETE FROM support_triage_decisions
     WHERE channel_message_id IN (
       SELECT id FROM support_channel_messages WHERE channel = 'WHATSAPP' AND channel_address = ${address}
     )
  `);
  await db.execute(sql`
    DELETE FROM support_triage_jobs
     WHERE channel_message_id IN (
       SELECT id FROM support_channel_messages WHERE channel = 'WHATSAPP' AND channel_address = ${address}
     )
  `);
  await db.execute(sql`DELETE FROM support_channel_messages WHERE channel = 'WHATSAPP' AND channel_address = ${address}`);
  await db.execute(sql`
    DELETE FROM trader_support_messages
     WHERE conversation_id IN (
       SELECT id FROM trader_support_conversations WHERE securepay_identity_ref = ANY(${identities}::text[])
     )
  `);
  await db.execute(sql`DELETE FROM trader_support_conversations WHERE securepay_identity_ref = ANY(${identities}::text[])`);
  await db.execute(sql`DELETE FROM support_channel_identity_assertions WHERE channel = 'WHATSAPP' AND channel_address = ${address}`);
  await db.execute(sql`DELETE FROM support_channel_identities WHERE channel = 'WHATSAPP' AND channel_address = ${address}`);
}

function rows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? []);
}
