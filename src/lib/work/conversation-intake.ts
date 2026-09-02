import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export interface ConversationWorkDraft {
  id: string;
  actionType: "TASK" | "CASE" | "INCIDENT" | "FOLLOW_UP" | "APPROVAL" | "KNOWLEDGE";
  conversationId: string;
  conversationTitle: string;
  sourceMessageId: string | null;
  sourceBody: string | null;
  createdByName: string | null;
  createdAt: Date;
}

export async function listConversationWorkDrafts(userId: string): Promise<ConversationWorkDraft[]> {
  const result = await db.execute(sql`
    SELECT
      d.id::text AS id,
      d.action_type::text AS "actionType",
      d.conversation_id::text AS "conversationId",
      COALESCE(c.title, 'Conversation') AS "conversationTitle",
      d.source_message_id::text AS "sourceMessageId",
      msg.body AS "sourceBody",
      creator.name AS "createdByName",
      d.created_at AS "createdAt"
    FROM conversation_action_drafts d
    JOIN staff_conversation_members member
      ON member.conversation_id = d.conversation_id
     AND member.user_id = ${userId}::uuid
    JOIN staff_conversations c ON c.id = d.conversation_id
    LEFT JOIN staff_messages msg ON msg.id = d.source_message_id
    LEFT JOIN users creator ON creator.id = d.created_by_user_id
    WHERE d.status = 'DRAFT'
    ORDER BY d.created_at DESC
    LIMIT 100
  `);
  return ((result as unknown as { rows?: ConversationWorkDraft[] }).rows ?? []);
}
