import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applyWhatsAppIdentityBindingAssertion } from "./identity-binding";

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb("WhatsApp trusted identity binding integration", () => {
  it("binds an attested identity, wakes waiting messages once, then honors revoke ordering", async () => {
    const token = randomUUID().replaceAll("-", "");
    const address = `2547${token.replace(/[^0-9]/g, "").padEnd(12, "7").slice(0, 8)}`;
    const securepayIdentityRef = `KS-TEST-${token.slice(0, 12)}`;
    const providerMessageId = `wamid.${token}`;
    const bindAssertionId = `bind-${token}`;
    const revokeAssertionId = `revoke-${token}`;
    const staleAssertionId = `stale-${token}`;

    try {
      await db.execute(sql`
        INSERT INTO support_channel_messages (
          channel, channel_message_id, channel_address, message_type, body, processing_status
        ) VALUES (
          'WHATSAPP', ${providerMessageId}, ${address}, 'text', 'Where is my agreement?', 'WAITING_IDENTITY'
        )
      `);

      const bind = await applyWhatsAppIdentityBindingAssertion({
        assertionId: bindAssertionId,
        channel: "WHATSAPP",
        channelAddress: address,
        securepayIdentityRef,
        action: "BIND",
        authoritySequence: 1,
        occurredAt: "2026-09-09T15:30:00+03:00",
      });
      expect(bind).toEqual({ status: "APPLIED", action: "BIND", wokeMessages: 1 });

      const duplicate = await applyWhatsAppIdentityBindingAssertion({
        assertionId: bindAssertionId,
        channel: "WHATSAPP",
        channelAddress: address,
        securepayIdentityRef,
        action: "BIND",
        authoritySequence: 1,
        occurredAt: "2026-09-09T15:30:00+03:00",
      });
      expect(duplicate).toEqual({ status: "DUPLICATE", action: "BIND", wokeMessages: 0 });

      const wakeState = rows<{
        processingStatus: string;
        supportConversationId: string | null;
        traderSupportMessageId: string | null;
        triageJobs: number;
      }>(await db.execute(sql`
        SELECT m.processing_status AS "processingStatus",
               m.support_conversation_id::text AS "supportConversationId",
               m.trader_support_message_id::text AS "traderSupportMessageId",
               (SELECT count(*)::int FROM support_triage_jobs j WHERE j.channel_message_id = m.id) AS "triageJobs"
          FROM support_channel_messages m
         WHERE m.channel = 'WHATSAPP' AND m.channel_message_id = ${providerMessageId}
      `))[0];
      expect(wakeState).toMatchObject({
        processingStatus: "TRIAGE_PENDING",
        triageJobs: 1,
      });
      expect(wakeState?.supportConversationId).toBeTruthy();
      expect(wakeState?.traderSupportMessageId).toBeTruthy();

      const revoke = await applyWhatsAppIdentityBindingAssertion({
        assertionId: revokeAssertionId,
        channel: "WHATSAPP",
        channelAddress: address,
        securepayIdentityRef,
        action: "REVOKE",
        authoritySequence: 2,
        occurredAt: "2026-09-09T15:31:00+03:00",
      });
      expect(revoke).toEqual({ status: "APPLIED", action: "REVOKE", wokeMessages: 0 });

      const stale = await applyWhatsAppIdentityBindingAssertion({
        assertionId: staleAssertionId,
        channel: "WHATSAPP",
        channelAddress: address,
        securepayIdentityRef,
        action: "BIND",
        authoritySequence: 1,
        occurredAt: "2026-09-09T15:29:00+03:00",
      });
      expect(stale).toEqual({
        status: "STALE",
        action: "BIND",
        wokeMessages: 0,
        currentSequence: 2,
      });

      const mapping = rows<{ securepayIdentityRef: string | null; sequence: number }>(await db.execute(sql`
        SELECT securepay_identity_ref AS "securepayIdentityRef",
               binding_authority_sequence::int AS sequence
          FROM support_channel_identities
         WHERE channel = 'WHATSAPP' AND channel_address = ${address}
      `))[0];
      expect(mapping).toEqual({ securepayIdentityRef: null, sequence: 2 });
    } finally {
      await db.execute(sql`
        DELETE FROM support_triage_jobs
         WHERE channel_message_id IN (
           SELECT id FROM support_channel_messages
            WHERE channel = 'WHATSAPP' AND channel_address = ${address}
         )
      `);
      await db.execute(sql`
        DELETE FROM support_channel_messages
         WHERE channel = 'WHATSAPP' AND channel_address = ${address}
      `);
      await db.execute(sql`
        DELETE FROM trader_support_messages
         WHERE source_kind = 'WHATSAPP' AND source_ref = ${providerMessageId}
      `);
      await db.execute(sql`
        DELETE FROM trader_support_conversations
         WHERE securepay_identity_ref = ${securepayIdentityRef}
      `);
      await db.execute(sql`
        DELETE FROM support_channel_identity_assertions
         WHERE channel = 'WHATSAPP' AND channel_address = ${address}
      `);
      await db.execute(sql`
        DELETE FROM support_channel_identities
         WHERE channel = 'WHATSAPP' AND channel_address = ${address}
      `);
    }
  });
});

function rows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? []);
}
