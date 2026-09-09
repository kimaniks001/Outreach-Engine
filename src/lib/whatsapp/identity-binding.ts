import { createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";

const assertionSchema = z.object({
  assertionId: z.string().trim().min(8).max(180),
  channel: z.literal("WHATSAPP"),
  channelAddress: z.string().trim().min(5).max(80),
  securepayIdentityRef: z.string().trim().min(3).max(120),
  action: z.enum(["BIND", "REVOKE"]),
  authoritySequence: z.number().int().positive().safe(),
  occurredAt: z.string().datetime({ offset: true }),
}).strict();

export type WhatsAppIdentityBindingAssertion = z.infer<typeof assertionSchema>;

export type ApplyBindingResult =
  | { status: "APPLIED"; action: "BIND" | "REVOKE"; wokeMessages: number }
  | { status: "DUPLICATE"; action: "BIND" | "REVOKE"; wokeMessages: 0 }
  | { status: "STALE"; action: "BIND" | "REVOKE"; wokeMessages: 0; currentSequence: number }
  | { status: "IDENTITY_MISMATCH"; action: "REVOKE"; wokeMessages: 0; currentSequence: number }
  | { status: "REBIND_REQUIRES_REVOKE"; action: "BIND"; wokeMessages: 0; currentSequence: number };

export function parseWhatsAppIdentityBindingAssertion(payload: unknown): WhatsAppIdentityBindingAssertion {
  const parsed = assertionSchema.parse(payload);
  return {
    ...parsed,
    channelAddress: normalizeWhatsAppAddress(parsed.channelAddress),
  };
}

export function normalizeWhatsAppAddress(value: string): string {
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length < 5 || digits.length > 80) throw new Error("Invalid WhatsApp address");
  return digits;
}

export function verifySecurePayBindingSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!secret || !signatureHeader?.startsWith("sha256=")) return false;
  const providedHex = signatureHeader.slice("sha256=".length).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(providedHex)) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody, "utf8").digest("hex"), "hex");
  const provided = Buffer.from(providedHex, "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function applyWhatsAppIdentityBindingAssertion(
  assertion: WhatsAppIdentityBindingAssertion
): Promise<ApplyBindingResult> {
  const normalized = { ...assertion, channelAddress: normalizeWhatsAppAddress(assertion.channelAddress) };

  return db.transaction(async (tx) => {
    // Serialize authority for one communication address. Assertion IDs still provide
    // global transport idempotency, while the sequence protects against reordering.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'WHATSAPP:' + normalized.channelAddress}))`);

    const inserted = rows<{ assertionId: string }>(await tx.execute(sql`
      INSERT INTO support_channel_identity_assertions (
        assertion_id, channel, channel_address, securepay_identity_ref,
        action, authority_sequence, occurred_at
      ) VALUES (
        ${normalized.assertionId}, 'WHATSAPP', ${normalized.channelAddress},
        ${normalized.securepayIdentityRef}, ${normalized.action},
        ${normalized.authoritySequence}, ${new Date(normalized.occurredAt)}
      )
      ON CONFLICT (assertion_id) DO NOTHING
      RETURNING assertion_id AS "assertionId"
    `));

    if (inserted.length === 0) {
      return { status: "DUPLICATE", action: normalized.action, wokeMessages: 0 } as const;
    }

    await tx.execute(sql`
      INSERT INTO support_channel_identities (channel, channel_address, last_seen_at)
      VALUES ('WHATSAPP', ${normalized.channelAddress}, now())
      ON CONFLICT (channel, channel_address) DO NOTHING
    `);

    const current = rows<{ securepayIdentityRef: string | null; authoritySequence: string | number }>(await tx.execute(sql`
      SELECT securepay_identity_ref AS "securepayIdentityRef",
             binding_authority_sequence AS "authoritySequence"
        FROM support_channel_identities
       WHERE channel = 'WHATSAPP' AND channel_address = ${normalized.channelAddress}
       FOR UPDATE
    `))[0];
    if (!current) throw new Error("WhatsApp channel identity row could not be locked");

    const currentSequence = Number(current.authoritySequence ?? 0);
    if (normalized.authoritySequence <= currentSequence) {
      await markAssertion(tx, normalized.assertionId, false, `STALE_SEQUENCE:${currentSequence}`);
      return { status: "STALE", action: normalized.action, wokeMessages: 0, currentSequence } as const;
    }

    if (
      normalized.action === "REVOKE" &&
      current.securepayIdentityRef !== null &&
      current.securepayIdentityRef !== normalized.securepayIdentityRef
    ) {
      await markAssertion(tx, normalized.assertionId, false, `IDENTITY_MISMATCH:${current.securepayIdentityRef}`);
      return { status: "IDENTITY_MISMATCH", action: "REVOKE", wokeMessages: 0, currentSequence } as const;
    }

    if (
      normalized.action === "BIND" &&
      current.securepayIdentityRef !== null &&
      current.securepayIdentityRef !== normalized.securepayIdentityRef
    ) {
      await markAssertion(tx, normalized.assertionId, false, `REBIND_REQUIRES_REVOKE:${current.securepayIdentityRef}`);
      return { status: "REBIND_REQUIRES_REVOKE", action: "BIND", wokeMessages: 0, currentSequence } as const;
    }

    if (normalized.action === "REVOKE") {
      await tx.execute(sql`
        UPDATE support_channel_identities
           SET securepay_identity_ref = NULL,
               verified_at = NULL,
               binding_authority_sequence = ${normalized.authoritySequence},
               binding_assertion_id = ${normalized.assertionId},
               binding_occurred_at = ${new Date(normalized.occurredAt)},
               revoked_at = ${new Date(normalized.occurredAt)},
               updated_at = now()
         WHERE channel = 'WHATSAPP' AND channel_address = ${normalized.channelAddress}
      `);
      await markAssertion(tx, normalized.assertionId, true, "APPLIED_REVOKE");
      return { status: "APPLIED", action: "REVOKE", wokeMessages: 0 } as const;
    }

    await tx.execute(sql`
      UPDATE support_channel_identities
         SET securepay_identity_ref = ${normalized.securepayIdentityRef},
             verified_at = ${new Date(normalized.occurredAt)},
             binding_authority_sequence = ${normalized.authoritySequence},
             binding_assertion_id = ${normalized.assertionId},
             binding_occurred_at = ${new Date(normalized.occurredAt)},
             revoked_at = NULL,
             updated_at = now()
       WHERE channel = 'WHATSAPP' AND channel_address = ${normalized.channelAddress}
    `);

    const conversation = rows<{ id: string }>(await tx.execute(sql`
      INSERT INTO trader_support_conversations (securepay_identity_ref)
      VALUES (${normalized.securepayIdentityRef})
      ON CONFLICT (securepay_identity_ref) DO UPDATE SET last_message_at = now()
      RETURNING id::text AS id
    `))[0];
    if (!conversation) throw new Error("WhatsApp support conversation could not be resolved after binding");

    const waiting = rows<{ id: string; providerMessageId: string; body: string; receivedAt: Date }>(await tx.execute(sql`
      SELECT id::text AS id, channel_message_id AS "providerMessageId", body, received_at AS "receivedAt"
        FROM support_channel_messages
       WHERE channel = 'WHATSAPP'
         AND channel_address = ${normalized.channelAddress}
         AND processing_status = 'WAITING_IDENTITY'
         AND trader_support_message_id IS NULL
         AND body IS NOT NULL
       ORDER BY received_at ASC, id ASC
       FOR UPDATE
    `));

    let wokeMessages = 0;
    for (const message of waiting) {
      const supportMessage = rows<{ id: string }>(await tx.execute(sql`
        INSERT INTO trader_support_messages (
          conversation_id, actor_type, body, source_kind, source_ref, created_at
        ) VALUES (
          ${conversation.id}::uuid, 'TRADER', ${message.body}, 'WHATSAPP',
          ${message.providerMessageId}, ${message.receivedAt}
        )
        ON CONFLICT (source_kind, source_ref) WHERE source_kind = 'WHATSAPP' DO NOTHING
        RETURNING id::text AS id
      `))[0] ?? rows<{ id: string }>(await tx.execute(sql`
        SELECT id::text AS id FROM trader_support_messages
         WHERE source_kind = 'WHATSAPP' AND source_ref = ${message.providerMessageId}
         LIMIT 1
      `))[0];
      if (!supportMessage) throw new Error("Waiting WhatsApp support message could not be attached");

      const updated = await tx.execute(sql`
        UPDATE support_channel_messages
           SET processing_status = 'TRIAGE_PENDING',
               support_conversation_id = ${conversation.id}::uuid,
               trader_support_message_id = ${supportMessage.id}::uuid,
               processed_at = NULL
         WHERE id = ${message.id}::uuid
           AND processing_status = 'WAITING_IDENTITY'
      `);
      if (rowCount(updated) === 0) continue;

      await tx.execute(sql`
        INSERT INTO support_triage_jobs (channel_message_id, available_at)
        VALUES (${message.id}::uuid, now() + interval '1500 milliseconds')
        ON CONFLICT (channel_message_id) DO NOTHING
      `);
      wokeMessages += 1;
    }

    await markAssertion(tx, normalized.assertionId, true, `APPLIED_BIND:WOKE_${wokeMessages}`);
    return { status: "APPLIED", action: "BIND", wokeMessages } as const;
  });
}

async function markAssertion(
  tx: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> },
  assertionId: string,
  applied: boolean,
  reason: string
): Promise<void> {
  await tx.execute(sql`
    UPDATE support_channel_identity_assertions
       SET applied = ${applied}, apply_reason = ${reason}
     WHERE assertion_id = ${assertionId}
  `);
}

function rowCount(result: unknown): number {
  return Number((result as { rowCount?: number }).rowCount ?? 0);
}

function rows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? []);
}
