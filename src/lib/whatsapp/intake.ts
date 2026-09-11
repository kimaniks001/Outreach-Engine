import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { SUPPORT_FRAGMENT_CONTEXT_MS, SUPPORT_FRAGMENT_SETTLE_MS } from "./fragment-window";
import type { NormalizedWhatsAppMessage } from "./protocol";

export type WhatsAppIntakeOutcome =
  | { status: "DUPLICATE"; channelMessageId: string }
  | { status: "WAITING_IDENTITY"; channelMessageId: string }
  | { status: "TRIAGE_PENDING"; channelMessageId: string; conversationId: string }
  | { status: "IGNORED"; channelMessageId: string };

export async function ingestWhatsAppMessage(message: NormalizedWhatsAppMessage): Promise<WhatsAppIntakeOutcome> {
  return db.transaction(async (tx) => {
    const inserted = await tx.execute(sql`
      INSERT INTO support_channel_messages (
        channel, channel_message_id, channel_address, message_type, body,
        reply_to_channel_message_id, payload, received_at
      ) VALUES (
        'WHATSAPP', ${message.messageId}, ${message.from}, ${message.kind}, ${message.body},
        ${message.replyToMessageId}, CAST(${JSON.stringify(message.raw)} AS jsonb), ${message.sentAt}
      )
      ON CONFLICT (channel, channel_message_id) DO NOTHING
      RETURNING id::text AS id
    `);
    const channelMessage = rows<{ id: string }>(inserted)[0];
    if (!channelMessage) {
      return { status: "DUPLICATE", channelMessageId: message.messageId };
    }

    await tx.execute(sql`
      INSERT INTO support_channel_identities (channel, channel_address, last_seen_at)
      VALUES ('WHATSAPP', ${message.from}, now())
      ON CONFLICT (channel, channel_address) DO UPDATE
        SET last_seen_at = now(), updated_at = now()
    `);

    if (message.kind === "UNSUPPORTED" || !message.body) {
      await tx.execute(sql`
        UPDATE support_channel_messages
           SET processing_status = 'IGNORED', processed_at = now()
         WHERE id = ${channelMessage.id}::uuid
      `);
      return { status: "IGNORED", channelMessageId: message.messageId };
    }

    const identity = rows<{
      securepayIdentityRef: string | null;
      bindingAuthoritySequence: string | number | null;
      bindingAssertionId: string | null;
    }>(await tx.execute(sql`
      SELECT securepay_identity_ref AS "securepayIdentityRef",
             binding_authority_sequence AS "bindingAuthoritySequence",
             binding_assertion_id AS "bindingAssertionId"
        FROM support_channel_identities
       WHERE channel = 'WHATSAPP' AND channel_address = ${message.from}
       LIMIT 1
    `))[0];

    // A phone number is a communication address, never proof of SecurePay identity.
    // Only a complete signed-binding snapshot may move a message into triage. Legacy
    // or partially populated mappings fail closed in WAITING_IDENTITY.
    if (
      !identity?.securepayIdentityRef ||
      !identity.bindingAssertionId ||
      Number(identity.bindingAuthoritySequence ?? 0) <= 0
    ) {
      await tx.execute(sql`
        UPDATE support_channel_messages
           SET processing_status = 'WAITING_IDENTITY'
         WHERE id = ${channelMessage.id}::uuid
      `);
      return { status: "WAITING_IDENTITY", channelMessageId: message.messageId };
    }

    const bindingAuthoritySequence = Number(identity.bindingAuthoritySequence);
    const conversation = rows<{ id: string }>(await tx.execute(sql`
      INSERT INTO trader_support_conversations (securepay_identity_ref)
      VALUES (${identity.securepayIdentityRef})
      ON CONFLICT (securepay_identity_ref) DO UPDATE SET last_message_at = now()
      RETURNING id::text AS id
    `))[0];
    if (!conversation) throw new Error("WhatsApp support conversation could not be opened");

    const supportMessage = rows<{ id: string }>(await tx.execute(sql`
      INSERT INTO trader_support_messages (conversation_id, actor_type, body, source_kind, source_ref, created_at)
      VALUES (${conversation.id}::uuid, 'TRADER', ${message.body}, 'WHATSAPP', ${message.messageId}, ${message.sentAt})
      RETURNING id::text AS id
    `))[0];
    if (!supportMessage) throw new Error("WhatsApp trader message could not be recorded");

    await tx.execute(sql`
      UPDATE support_channel_messages
         SET processing_status = 'TRIAGE_PENDING',
             support_conversation_id = ${conversation.id}::uuid,
             trader_support_message_id = ${supportMessage.id}::uuid,
             binding_securepay_identity_ref = ${identity.securepayIdentityRef},
             binding_authority_sequence = ${bindingAuthoritySequence},
             binding_assertion_id = ${identity.bindingAssertionId}
       WHERE id = ${channelMessage.id}::uuid
    `);

    // WhatsApp is naturally fragmented: "Where is my payment?" / "The one to John" /
    // "for the laptop" is one customer turn, not three tickets. Keep every inbound
    // message for audit, but supersede older not-yet-started triage jobs in the same
    // recent conversation window. A short settle delay lets the newest fragment become
    // the single processing leader. Jobs already PROCESSING are never stolen.
    await tx.execute(sql`
      WITH superseded AS (
        UPDATE support_triage_jobs j
           SET status = 'DONE', locked_at = NULL, updated_at = now(),
               last_error = 'Superseded by a newer WhatsApp fragment in the same customer turn.'
          FROM support_channel_messages prior
         WHERE j.channel_message_id = prior.id
           AND prior.support_conversation_id = ${conversation.id}::uuid
           AND prior.id <> ${channelMessage.id}::uuid
           AND prior.received_at >= now() - (${SUPPORT_FRAGMENT_CONTEXT_MS} * interval '1 millisecond')
           AND j.status IN ('PENDING','FAILED')
        RETURNING prior.id
      )
      UPDATE support_channel_messages m
         SET processing_status = 'TRIAGED', processed_at = now()
        FROM superseded s
       WHERE m.id = s.id
         AND m.processing_status = 'TRIAGE_PENDING'
    `);

    await tx.execute(sql`
      INSERT INTO support_triage_jobs (channel_message_id, available_at)
      VALUES (${channelMessage.id}::uuid, now() + (${SUPPORT_FRAGMENT_SETTLE_MS} * interval '1 millisecond'))
      ON CONFLICT (channel_message_id) DO NOTHING
    `);

    return { status: "TRIAGE_PENDING", channelMessageId: message.messageId, conversationId: conversation.id };
  });
}

function rows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? []);
}
