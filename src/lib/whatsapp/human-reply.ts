import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export interface QueuedWhatsAppHumanReply {
  supportMessageId: string;
  outboxId: string;
}

/**
 * Persist a staff/Plug reply and its WhatsApp delivery atomically.
 * The caller must already have passed Outreach's staff/work-item authorization.
 * This function re-checks that the actor is active, the conversation is open, and
 * exactly one current signed WhatsApp binding still belongs to that conversation's
 * SecurePay identity. Historical channel messages are threading evidence only; they
 * are never delivery authority.
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

    const bindings = rows<{
      id: string;
      channelAddress: string;
      providerMessageId: string | null;
      securepayIdentityRef: string;
      bindingAuthoritySequence: string | number;
      bindingAssertionId: string;
    }>(await tx.execute(sql`
      SELECT c.id::text AS id,
             i.channel_address AS "channelAddress",
             m.channel_message_id AS "providerMessageId",
             i.securepay_identity_ref AS "securepayIdentityRef",
             i.binding_authority_sequence AS "bindingAuthoritySequence",
             i.binding_assertion_id AS "bindingAssertionId"
        FROM trader_support_conversations c
        JOIN support_channel_identities i
          ON i.channel = 'WHATSAPP'
         AND i.securepay_identity_ref = c.securepay_identity_ref
         AND i.revoked_at IS NULL
         AND i.binding_authority_sequence > 0
         AND i.binding_assertion_id IS NOT NULL
        LEFT JOIN LATERAL (
          SELECT scm.channel_message_id
            FROM support_channel_messages scm
           WHERE scm.support_conversation_id = c.id
             AND scm.channel = 'WHATSAPP'
             AND scm.channel_address = i.channel_address
           ORDER BY scm.received_at DESC, scm.created_at DESC
           LIMIT 1
        ) m ON TRUE
       WHERE c.id = ${input.conversationId}::uuid
         AND c.closed_at IS NULL
       LIMIT 2
    `));
    if (bindings.length === 0) {
      throw new Error("This support conversation has no current verified WhatsApp binding");
    }
    if (bindings.length !== 1) {
      throw new Error("This support conversation has ambiguous WhatsApp delivery authority");
    }
    const conversation = bindings[0]!;
    const bindingAuthoritySequence = Number(conversation.bindingAuthoritySequence);

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
        reply_to_channel_message_id, purpose,
        expected_securepay_identity_ref, expected_binding_authority_sequence, expected_binding_assertion_id
      ) VALUES (
        ${dedupeKey}, 'WHATSAPP', ${conversation.channelAddress},
        NULL, ${input.conversationId}::uuid,
        ${supportMessage.id}::uuid, ${body}, ${conversation.providerMessageId}, 'HUMAN_REPLY',
        ${conversation.securepayIdentityRef}, ${bindingAuthoritySequence}, ${conversation.bindingAssertionId}
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
