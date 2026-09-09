import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export interface QueuedWhatsAppHumanReply {
  supportMessageId: string;
  outboxId: string;
}

/**
 * Persist a staff/Plug reply and its WhatsApp delivery atomically.
 * The caller must already have passed Outreach's staff/work-item authorization.
 * This function re-checks that the actor is active and that the conversation is open.
 */
export async function queueWhatsAppHumanReply(input: {
  actorUserId: string;
  conversationId: string;
  body: string;
}): Promise<QueuedWhatsAppHumanReply> {
  const body = cleanText(input.body, 1, 4096, "Reply");

  return db.transaction(async (tx) => {
    const actor = rows<{ id: string }>(await tx.execute(sql`
      SELECT id::text AS id FROM users
       WHERE id = ${input.actorUserId}::uuid AND active = TRUE
       LIMIT 1
    `))[0];
    if (!actor) throw new Error("Active Outreach staff identity required");

    const conversation = rows<{ id: string; channelAddress: string; providerMessageId: string | null; sourceChannelMessageId: string | null }>(
      await tx.execute(sql`
        SELECT c.id::text AS id,
               m.channel_address AS "channelAddress",
               m.channel_message_id AS "providerMessageId",
               m.id::text AS "sourceChannelMessageId"
          FROM trader_support_conversations c
          LEFT JOIN LATERAL (
            SELECT scm.id, scm.channel_address, scm.channel_message_id
              FROM support_channel_messages scm
             WHERE scm.support_conversation_id = c.id
               AND scm.channel = 'WHATSAPP'
             ORDER BY scm.received_at DESC, scm.created_at DESC
             LIMIT 1
          ) m ON TRUE
         WHERE c.id = ${input.conversationId}::uuid
           AND c.closed_at IS NULL
         LIMIT 1
      `)
    )[0];
    if (!conversation) throw new Error("Trader support conversation is unavailable");
    if (!conversation.channelAddress) throw new Error("This support conversation has no verified WhatsApp channel history");

    const supportMessage = rows<{ id: string }>(await tx.execute(sql`
      INSERT INTO trader_support_messages (
        conversation_id, actor_type, actor_user_id, body, source_kind
      ) VALUES (
        ${input.conversationId}::uuid, 'STAFF', ${input.actorUserId}::uuid, ${body}, 'OUTREACH_WHATSAPP_REPLY'
      ) RETURNING id::text AS id
    `))[0];
    if (!supportMessage) throw new Error("Support reply could not be recorded");

    const dedupeKey = `HUMAN:${supportMessage.id}`;
    const outbox = rows<{ id: string }>(await tx.execute(sql`
      INSERT INTO support_channel_outbox (
        dedupe_key, channel, channel_address, source_channel_message_id,
        support_conversation_id, trader_support_message_id, body,
        reply_to_channel_message_id, purpose
      ) VALUES (
        ${dedupeKey}, 'WHATSAPP', ${conversation.channelAddress},
        ${conversation.sourceChannelMessageId}::uuid, ${input.conversationId}::uuid,
        ${supportMessage.id}::uuid, ${body}, ${conversation.providerMessageId}, 'HUMAN_REPLY'
      )
      ON CONFLICT (dedupe_key) DO UPDATE SET updated_at = support_channel_outbox.updated_at
      RETURNING id::text AS id
    `))[0];
    if (!outbox) throw new Error("WhatsApp reply could not be queued");

    await tx.execute(sql`
      UPDATE trader_support_conversations SET last_message_at = now()
       WHERE id = ${input.conversationId}::uuid
    `);

    await tx.execute(sql`
      INSERT INTO work_history (work_item_id, event_type, actor_user_id, metadata)
      SELECT c.work_item_id, 'WHATSAPP_HUMAN_REPLY_QUEUED', ${input.actorUserId}::uuid,
             CAST(${JSON.stringify({ conversationId: input.conversationId, supportMessageId: supportMessage.id })} AS jsonb)
        FROM trader_support_cases c
       WHERE c.conversation_id = ${input.conversationId}::uuid
         AND c.state NOT IN ('RESOLVED','CLOSED')
       ORDER BY c.opened_at DESC
       LIMIT 1
    `);

    return { supportMessageId: supportMessage.id, outboxId: outbox.id };
  });
}

function cleanText(value: string, min: number, max: number, label: string): string {
  const clean = value.trim();
  if (clean.length < min || clean.length > max) throw new Error(`${label} must be between ${min} and ${max} characters`);
  return clean;
}

function rows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? []);
}
