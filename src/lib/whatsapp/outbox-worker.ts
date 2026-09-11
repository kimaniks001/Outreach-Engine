import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { sendWhatsAppText } from "./client";

interface ClaimedOutboxItem {
  id: string;
  attempts: number;
  channelAddress: string;
  sourceChannelMessageId: string | null;
  supportConversationId: string | null;
  traderSupportMessageId: string | null;
  body: string;
  replyToChannelMessageId: string | null;
  purpose: "AUTO_GUIDANCE" | "AUTO_CONTEXT" | "ACKNOWLEDGEMENT" | "HUMAN_REPLY";
  expectedSecurepayIdentityRef: string;
  expectedBindingAuthoritySequence: number;
  expectedBindingAssertionId: string;
}

export async function processWhatsAppOutboxBatch(limit = 50): Promise<{
  claimed: number;
  sent: number;
  failed: number;
  cancelled: number;
}> {
  const claimed = await claimOutbox(Math.max(1, Math.min(limit, 200)));
  let sent = 0;
  let failed = 0;
  let cancelled = 0;

  await mapWithConcurrency(claimed, 12, async (item) => {
    try {
      // Delivery authority is the exact binding epoch captured when the response was
      // queued. Never send merely because the same phone number is currently bound
      // to somebody (or even to the same identity under a later epoch).
      if (!(await bindingSnapshotStillCurrent(item))) {
        await markCancelled(item, "WhatsApp binding changed before delivery; stale response suppressed.");
        cancelled += 1;
        return;
      }

      const result = await sendWhatsAppText({
        to: item.channelAddress,
        body: item.body,
        replyToMessageId: item.replyToChannelMessageId,
      });
      await markSent(item, result.messageId);
      sent += 1;
    } catch (error) {
      await markFailed(item, error);
      failed += 1;
    }
  });

  return { claimed: claimed.length, sent, failed, cancelled };
}

async function claimOutbox(limit: number): Promise<ClaimedOutboxItem[]> {
  // Rows created before binding-epoch snapshots existed cannot be safely mapped to
  // current authority after the fact. Suppress them rather than guessing.
  await db.execute(sql`
    UPDATE support_channel_outbox
       SET status = 'CANCELLED', locked_at = NULL,
           last_error = 'No authoritative WhatsApp binding snapshot was captured when this response was queued.',
           updated_at = now()
     WHERE status IN ('PENDING','FAILED')
       AND (
         expected_securepay_identity_ref IS NULL OR
         expected_binding_authority_sequence IS NULL OR
         expected_binding_assertion_id IS NULL
       )
  `);

  const result = await db.execute(sql`
    WITH picked AS (
      SELECT id
        FROM support_channel_outbox
       WHERE status IN ('PENDING','FAILED')
         AND available_at <= now()
         AND attempts < 5
         AND expected_securepay_identity_ref IS NOT NULL
         AND expected_binding_authority_sequence IS NOT NULL
         AND expected_binding_assertion_id IS NOT NULL
       ORDER BY created_at
       LIMIT ${limit}
       FOR UPDATE SKIP LOCKED
    )
    UPDATE support_channel_outbox o
       SET status = 'SENDING', attempts = attempts + 1, locked_at = now(), updated_at = now(), last_error = NULL
      FROM picked p
     WHERE o.id = p.id
     RETURNING o.id::text AS id, o.attempts,
       o.channel_address AS "channelAddress",
       o.source_channel_message_id::text AS "sourceChannelMessageId",
       o.support_conversation_id::text AS "supportConversationId",
       o.trader_support_message_id::text AS "traderSupportMessageId",
       o.body, o.reply_to_channel_message_id AS "replyToChannelMessageId",
       o.purpose,
       o.expected_securepay_identity_ref AS "expectedSecurepayIdentityRef",
       o.expected_binding_authority_sequence AS "expectedBindingAuthoritySequence",
       o.expected_binding_assertion_id AS "expectedBindingAssertionId"
  `);
  return rows<Omit<ClaimedOutboxItem, "expectedBindingAuthoritySequence"> & {
    expectedBindingAuthoritySequence: string | number;
  }>(result).map((item) => ({
    ...item,
    expectedBindingAuthoritySequence: Number(item.expectedBindingAuthoritySequence),
  }));
}

async function bindingSnapshotStillCurrent(item: ClaimedOutboxItem): Promise<boolean> {
  const current = rows<{ current: number }>(await db.execute(sql`
    SELECT 1 AS current
      FROM support_channel_identities
     WHERE channel = 'WHATSAPP'
       AND channel_address = ${item.channelAddress}
       AND securepay_identity_ref = ${item.expectedSecurepayIdentityRef}
       AND binding_authority_sequence = ${item.expectedBindingAuthoritySequence}
       AND binding_assertion_id = ${item.expectedBindingAssertionId}
       AND revoked_at IS NULL
     LIMIT 1
  `));
  return current.length === 1;
}

async function markSent(item: ClaimedOutboxItem, providerMessageId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE support_channel_outbox
         SET status = 'SENT', provider_message_id = ${providerMessageId},
             sent_at = now(), locked_at = NULL, updated_at = now()
       WHERE id = ${item.id}::uuid
    `);

    if (item.supportConversationId && !item.traderSupportMessageId) {
      await tx.execute(sql`
        INSERT INTO trader_support_messages (
          conversation_id, actor_type, body, source_kind, source_ref
        ) VALUES (
          ${item.supportConversationId}::uuid, 'SYSTEM', ${item.body}, 'WHATSAPP_OUTBOUND', ${providerMessageId}
        )
      `);
      await tx.execute(sql`
        UPDATE trader_support_conversations SET last_message_at = now()
         WHERE id = ${item.supportConversationId}::uuid
      `);
    }

    if (item.sourceChannelMessageId && (item.purpose === 'AUTO_GUIDANCE' || item.purpose === 'AUTO_CONTEXT')) {
      await tx.execute(sql`
        UPDATE support_channel_messages
           SET processing_status = 'ANSWERED', processed_at = now()
         WHERE id = ${item.sourceChannelMessageId}::uuid
      `);
    }
  });
}

async function markCancelled(item: ClaimedOutboxItem, reason: string): Promise<void> {
  await db.execute(sql`
    UPDATE support_channel_outbox
       SET status = 'CANCELLED', locked_at = NULL, last_error = ${reason}, updated_at = now()
     WHERE id = ${item.id}::uuid
       AND status = 'SENDING'
  `);
}

async function markFailed(item: ClaimedOutboxItem, error: unknown): Promise<void> {
  const message = safeError(error);
  await db.execute(sql`
    UPDATE support_channel_outbox
       SET status = 'FAILED', locked_at = NULL, last_error = ${message},
           available_at = now() + (least(attempts, 5) * interval '30 seconds'), updated_at = now()
     WHERE id = ${item.id}::uuid
  `);
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown WhatsApp transport error";
  return message.replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]").slice(0, 500);
}

function rows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? []);
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      const item = items[index];
      if (item === undefined) return;
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}
