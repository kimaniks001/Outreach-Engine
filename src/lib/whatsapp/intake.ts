import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { NormalizedWhatsAppMessage } from "./protocol";

export type WhatsAppIntakeOutcome =
  | { status: "DUPLICATE"; channelMessageId: string }
  | { status: "WAITING_IDENTITY"; channelMessageId: string }
  | { status: "ROUTED"; channelMessageId: string; conversationId: string }
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
    if (rows<{ id: string }>(inserted).length === 0) {
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
         WHERE channel = 'WHATSAPP' AND channel_message_id = ${message.messageId}
      `);
      return { status: "IGNORED", channelMessageId: message.messageId };
    }

    const identity = rows<{ securepayIdentityRef: string | null }>(await tx.execute(sql`
      SELECT securepay_identity_ref AS "securepayIdentityRef"
        FROM support_channel_identities
       WHERE channel = 'WHATSAPP' AND channel_address = ${message.from}
       LIMIT 1
    `))[0];

    // A phone number is a communication address, never proof of SecurePay identity.
    // Until a trusted workflow binds it, keep the message visible to intake without
    // exposing or guessing any SecurePay account context.
    if (!identity?.securepayIdentityRef) {
      await tx.execute(sql`
        UPDATE support_channel_messages
           SET processing_status = 'WAITING_IDENTITY'
         WHERE channel = 'WHATSAPP' AND channel_message_id = ${message.messageId}
      `);
      return { status: "WAITING_IDENTITY", channelMessageId: message.messageId };
    }

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
         SET processing_status = 'ROUTED', support_conversation_id = ${conversation.id}::uuid,
             trader_support_message_id = ${supportMessage.id}::uuid, processed_at = now()
       WHERE channel = 'WHATSAPP' AND channel_message_id = ${message.messageId}
    `);

    return { status: "ROUTED", channelMessageId: message.messageId, conversationId: conversation.id };
  });
}

/**
 * Binds WhatsApp to SecurePay only after a trusted upstream identity workflow has
 * independently established the relationship. This function deliberately does
 * not perform phone-number-to-account discovery.
 */
export async function bindVerifiedWhatsAppIdentity(input: {
  channelAddress: string;
  securepayIdentityRef: string;
}): Promise<void> {
  const address = input.channelAddress.replace(/[^0-9]/g, "");
  const identityRef = input.securepayIdentityRef.trim();
  if (address.length < 5 || address.length > 80) throw new Error("Invalid WhatsApp address");
  if (identityRef.length < 3 || identityRef.length > 120) throw new Error("Invalid SecurePay identity reference");

  await db.execute(sql`
    INSERT INTO support_channel_identities (
      channel, channel_address, securepay_identity_ref, verified_at, last_seen_at
    ) VALUES ('WHATSAPP', ${address}, ${identityRef}, now(), now())
    ON CONFLICT (channel, channel_address) DO UPDATE
      SET securepay_identity_ref = EXCLUDED.securepay_identity_ref,
          verified_at = now(), updated_at = now()
  `);
}

function rows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? []);
}
