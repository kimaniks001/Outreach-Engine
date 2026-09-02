import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { SupportCaseSummary, SupportConversationSummary, SupportMessage } from "@/lib/trader-support/support-engine";

export async function listVisibleSupportCases(userId: string): Promise<SupportCaseSummary[]> {
  const role = await requireActiveStaff(userId);
  const result = await db.execute(sql`
    SELECT c.id::text AS id, c.conversation_id::text AS "conversationId", c.work_item_id::text AS "workItemId", c.subject,
           c.state::text AS state, u.name AS "ownerName", w.priority::text AS priority, w.status::text AS "workStatus",
           w.sla_due_at AS "slaDueAt", w.next_action AS "nextAction", c.opened_at AS "openedAt"
      FROM trader_support_cases c
      JOIN work_items w ON w.id = c.work_item_id
      LEFT JOIN users u ON u.id = w.owner_user_id
     WHERE ${role === "OWNER"} = TRUE
        OR w.owner_user_id = ${userId}::uuid
        OR w.created_by_user_id = ${userId}::uuid
        OR EXISTS (SELECT 1 FROM work_collaborators wc WHERE wc.work_item_id = w.id AND wc.user_id = ${userId}::uuid)
        OR w.owner_user_id IS NULL
     ORDER BY CASE w.priority WHEN 'CRITICAL' THEN 0 WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 ELSE 3 END,
              COALESCE(w.sla_due_at, 'infinity'::timestamptz), c.opened_at DESC
  `);
  return rows<SupportCaseSummary>(result).map((item) => ({ ...item, slaDueAt: item.slaDueAt ? toDate(item.slaDueAt) : null, openedAt: toDate(item.openedAt) }));
}

export async function listVisibleSupportConversations(userId: string): Promise<SupportConversationSummary[]> {
  const role = await requireActiveStaff(userId);
  const result = await db.execute(sql`
    SELECT c.id::text AS id, c.securepay_identity_ref AS "securepayIdentityRef", c.display_label AS "displayLabel",
           c.last_message_at AS "lastMessageAt",
           (SELECT count(*)::int FROM trader_support_cases sc WHERE sc.conversation_id = c.id AND sc.state NOT IN ('RESOLVED','CLOSED')) AS "openCaseCount"
      FROM trader_support_conversations c
     WHERE ${role === "OWNER"} = TRUE
        OR c.created_by_user_id = ${userId}::uuid
        OR EXISTS (
          SELECT 1 FROM trader_support_cases sc
          JOIN work_items w ON w.id = sc.work_item_id
          WHERE sc.conversation_id = c.id AND (
            w.owner_user_id = ${userId}::uuid OR w.created_by_user_id = ${userId}::uuid OR w.owner_user_id IS NULL
            OR EXISTS (SELECT 1 FROM work_collaborators wc WHERE wc.work_item_id = w.id AND wc.user_id = ${userId}::uuid)
          )
        )
     ORDER BY c.last_message_at DESC
  `);
  return rows<SupportConversationSummary>(result).map((item) => ({ ...item, lastMessageAt: toDate(item.lastMessageAt), openCaseCount: Number(item.openCaseCount) }));
}

export async function listVisibleConversationMessages(userId: string, conversationId: string): Promise<SupportMessage[]> {
  await requireConversationVisibility(userId, conversationId);
  const result = await db.execute(sql`
    SELECT m.id::text AS id, m.actor_type::text AS "actorType", u.name AS "actorName", m.body,
           m.source_kind AS "sourceKind", m.source_ref AS "sourceRef", m.created_at AS "createdAt"
      FROM trader_support_messages m LEFT JOIN users u ON u.id = m.actor_user_id
     WHERE m.conversation_id = ${conversationId}::uuid ORDER BY m.created_at ASC
  `);
  return rows<SupportMessage>(result).map((message) => ({ ...message, createdAt: toDate(message.createdAt) }));
}

export async function requireSupportCaseVisibility(userId: string, caseId: string): Promise<void> {
  const role = await requireActiveStaff(userId);
  const result = await db.execute(sql`
    SELECT 1 FROM trader_support_cases c JOIN work_items w ON w.id = c.work_item_id
     WHERE c.id = ${caseId}::uuid AND (
       ${role === "OWNER"} = TRUE OR w.owner_user_id = ${userId}::uuid OR w.created_by_user_id = ${userId}::uuid OR w.owner_user_id IS NULL
       OR EXISTS (SELECT 1 FROM work_collaborators wc WHERE wc.work_item_id = w.id AND wc.user_id = ${userId}::uuid)
     ) LIMIT 1
  `);
  if (rows(result).length === 0) throw new Error("Support case is unavailable");
}

async function requireConversationVisibility(userId: string, conversationId: string): Promise<void> {
  const role = await requireActiveStaff(userId);
  const result = await db.execute(sql`
    SELECT 1 FROM trader_support_conversations c
     WHERE c.id = ${conversationId}::uuid AND (
       ${role === "OWNER"} = TRUE OR c.created_by_user_id = ${userId}::uuid OR EXISTS (
         SELECT 1 FROM trader_support_cases sc JOIN work_items w ON w.id = sc.work_item_id
          WHERE sc.conversation_id = c.id AND (
            w.owner_user_id = ${userId}::uuid OR w.created_by_user_id = ${userId}::uuid OR w.owner_user_id IS NULL
            OR EXISTS (SELECT 1 FROM work_collaborators wc WHERE wc.work_item_id = w.id AND wc.user_id = ${userId}::uuid)
          )
       )
     ) LIMIT 1
  `);
  if (rows(result).length === 0) throw new Error("Trader support conversation is unavailable");
}

async function requireActiveStaff(userId: string): Promise<string> {
  const result = await db.execute(sql`SELECT role::text AS role FROM users WHERE id = ${userId}::uuid AND active = TRUE LIMIT 1`);
  const role = rows<{ role: string }>(result)[0]?.role;
  if (!role) throw new Error("Active staff identity required");
  return role;
}
function toDate(value: Date | string): Date { return value instanceof Date ? value : new Date(value); }
function rows<T = Record<string, unknown>>(result: unknown): T[] { return ((result as { rows?: T[] }).rows ?? []); }
