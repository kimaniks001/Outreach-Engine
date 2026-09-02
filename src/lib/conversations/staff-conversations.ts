import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type ConversationType = "DIRECT" | "GROUP" | "STAFF_CIRCLE" | "COMPANY";
export type ConversationActionType = "TASK" | "CASE" | "INCIDENT" | "FOLLOW_UP" | "APPROVAL" | "KNOWLEDGE";
export type ReactionEmoji = "👍" | "❤️" | "🎉" | "👀" | "✅";

const ALLOWED_REACTIONS = new Set<ReactionEmoji>(["👍", "❤️", "🎉", "👀", "✅"]);
const ALLOWED_ACTIONS = new Set<ConversationActionType>([
  "TASK",
  "CASE",
  "INCIDENT",
  "FOLLOW_UP",
  "APPROVAL",
  "KNOWLEDGE",
]);

export interface StaffDirectoryEntry {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface ConversationSummary {
  id: string;
  type: ConversationType;
  title: string;
  updatedAt: Date;
  latestBody: string | null;
  latestAt: Date | null;
  unreadCount: number;
  pinnedCount: number;
}

export interface ConversationParticipant {
  id: string;
  name: string;
  email: string;
  role: string;
  memberRole: "OWNER" | "MEMBER";
}

export interface ConversationDetail {
  id: string;
  type: ConversationType;
  title: string;
  participants: ConversationParticipant[];
}

export interface LinkedAttachment {
  label: string;
  url: string;
}

export interface MessageReactionSummary {
  emoji: ReactionEmoji;
  count: number;
  mine: boolean;
}

export interface StaffMessage {
  id: string;
  conversationId: string;
  authorUserId: string | null;
  authorName: string;
  body: string;
  replyToMessageId: string | null;
  replyBody: string | null;
  replyAuthorName: string | null;
  attachment: LinkedAttachment | null;
  createdAt: Date;
  pinned: boolean;
  reactions: MessageReactionSummary[];
}

export interface MessageSearchResult {
  id: string;
  conversationId: string;
  conversationTitle: string;
  authorName: string;
  body: string;
  createdAt: Date;
}

export interface ActionDraft {
  id: string;
  conversationId: string;
  sourceMessageId: string | null;
  actionType: ConversationActionType;
  createdByName: string;
  createdAt: Date;
}

export async function listStaffDirectory(excludeUserId?: string): Promise<StaffDirectoryEntry[]> {
  const result = await db.execute(sql`
    SELECT id::text, name, email, role::text
      FROM users
     WHERE active = true
       AND (${excludeUserId ?? null}::uuid IS NULL OR id <> ${excludeUserId ?? null}::uuid)
     ORDER BY name ASC, email ASC
  `);
  return rows<StaffDirectoryEntry>(result);
}

export async function ensureCompanyConversation(): Promise<string> {
  return db.transaction(async (tx) => {
    const inserted = await tx.execute(sql`
      INSERT INTO staff_conversations (type, title)
      VALUES ('COMPANY', 'SecurePay Team')
      ON CONFLICT DO NOTHING
      RETURNING id::text
    `);
    let id = rows<{ id: string }>(inserted)[0]?.id;
    if (!id) {
      const existing = await tx.execute(sql`
        SELECT id::text FROM staff_conversations WHERE type = 'COMPANY' LIMIT 1
      `);
      id = rows<{ id: string }>(existing)[0]?.id;
    }
    if (!id) throw new Error("Company conversation could not be resolved");

    await tx.execute(sql`
      INSERT INTO staff_conversation_members (conversation_id, user_id, member_role)
      SELECT ${id}::uuid, u.id, 'MEMBER'::conversation_member_role
        FROM users u
       WHERE u.active = true
      ON CONFLICT (conversation_id, user_id) DO NOTHING
    `);
    return id;
  });
}

export async function listConversationsForUser(userId: string): Promise<ConversationSummary[]> {
  const result = await db.execute(sql`
    SELECT
      c.id::text AS id,
      c.type::text AS type,
      COALESCE(
        c.title,
        (
          SELECT string_agg(u.name, ', ' ORDER BY u.name)
            FROM staff_conversation_members other_member
            JOIN users u ON u.id = other_member.user_id
           WHERE other_member.conversation_id = c.id
             AND other_member.user_id <> ${userId}::uuid
        ),
        'Conversation'
      ) AS title,
      c.updated_at AS "updatedAt",
      latest.body AS "latestBody",
      latest.created_at AS "latestAt",
      (
        SELECT count(*)::int
          FROM staff_messages unread
         WHERE unread.conversation_id = c.id
           AND unread.deleted_at IS NULL
           AND unread.author_user_id IS DISTINCT FROM ${userId}::uuid
           AND unread.created_at > COALESCE(m.last_read_at, m.joined_at)
      ) AS "unreadCount",
      (
        SELECT count(*)::int
          FROM staff_message_pins pin
         WHERE pin.conversation_id = c.id
      ) AS "pinnedCount"
    FROM staff_conversation_members m
    JOIN staff_conversations c ON c.id = m.conversation_id
    LEFT JOIN LATERAL (
      SELECT body, created_at
        FROM staff_messages msg
       WHERE msg.conversation_id = c.id AND msg.deleted_at IS NULL
       ORDER BY msg.created_at DESC
       LIMIT 1
    ) latest ON true
    WHERE m.user_id = ${userId}::uuid
      AND c.archived = false
    ORDER BY COALESCE(latest.created_at, c.updated_at) DESC, c.created_at DESC
  `);
  return rows<ConversationSummary>(result).map((row) => ({ ...row, unreadCount: Number(row.unreadCount), pinnedCount: Number(row.pinnedCount) }));
}

export async function getUnreadConversationCount(userId: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS count
      FROM staff_conversation_members m
      JOIN staff_conversations c ON c.id = m.conversation_id
     WHERE m.user_id = ${userId}::uuid
       AND c.archived = false
       AND EXISTS (
         SELECT 1
           FROM staff_messages msg
          WHERE msg.conversation_id = c.id
            AND msg.deleted_at IS NULL
            AND msg.author_user_id IS DISTINCT FROM ${userId}::uuid
            AND msg.created_at > COALESCE(m.last_read_at, m.joined_at)
       )
  `);
  return Number(rows<{ count: number }>(result)[0]?.count ?? 0);
}

export async function getConversation(userId: string, conversationId: string): Promise<ConversationDetail> {
  await requireMembership(userId, conversationId);
  const result = await db.execute(sql`
    SELECT
      c.id::text AS id,
      c.type::text AS type,
      COALESCE(
        c.title,
        (
          SELECT string_agg(u.name, ', ' ORDER BY u.name)
            FROM staff_conversation_members cm2
            JOIN users u ON u.id = cm2.user_id
           WHERE cm2.conversation_id = c.id
             AND cm2.user_id <> ${userId}::uuid
        ),
        'Conversation'
      ) AS title
      FROM staff_conversations c
     WHERE c.id = ${conversationId}::uuid
       AND c.archived = false
  `);
  const base = rows<{ id: string; type: ConversationType; title: string }>(result)[0];
  if (!base) throw new Error("Conversation is unavailable");

  const participantsResult = await db.execute(sql`
    SELECT
      u.id::text AS id,
      u.name,
      u.email,
      u.role::text AS role,
      cm.member_role::text AS "memberRole"
      FROM staff_conversation_members cm
      JOIN users u ON u.id = cm.user_id
     WHERE cm.conversation_id = ${conversationId}::uuid
     ORDER BY CASE WHEN cm.member_role = 'OWNER' THEN 0 ELSE 1 END, u.name ASC
  `);
  return { ...base, participants: rows<ConversationParticipant>(participantsResult) };
}

export async function listMessages(userId: string, conversationId: string, limit = 100): Promise<StaffMessage[]> {
  await requireMembership(userId, conversationId);
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);
  const result = await db.execute(sql`
    SELECT * FROM (
      SELECT
        msg.id::text AS id,
        msg.conversation_id::text AS "conversationId",
        msg.author_user_id::text AS "authorUserId",
        COALESCE(author.name, 'Former team member') AS "authorName",
        msg.body,
        msg.reply_to_message_id::text AS "replyToMessageId",
        reply.body AS "replyBody",
        reply_author.name AS "replyAuthorName",
        msg.attachment AS attachment,
        msg.created_at AS "createdAt",
        EXISTS (
          SELECT 1 FROM staff_message_pins pin
           WHERE pin.conversation_id = msg.conversation_id AND pin.message_id = msg.id
        ) AS pinned
      FROM staff_messages msg
      LEFT JOIN users author ON author.id = msg.author_user_id
      LEFT JOIN staff_messages reply ON reply.id = msg.reply_to_message_id
      LEFT JOIN users reply_author ON reply_author.id = reply.author_user_id
      WHERE msg.conversation_id = ${conversationId}::uuid
        AND msg.deleted_at IS NULL
      ORDER BY msg.created_at DESC
      LIMIT ${safeLimit}
    ) recent
    ORDER BY "createdAt" ASC
  `);
  const messages = rows<Omit<StaffMessage, "reactions">>(result);
  if (messages.length === 0) return [];

  const reactionResult = await db.execute(sql`
    SELECT
      r.message_id::text AS "messageId",
      r.emoji,
      count(*)::int AS count,
      bool_or(r.user_id = ${userId}::uuid) AS mine
      FROM staff_message_reactions r
      JOIN staff_messages msg ON msg.id = r.message_id
     WHERE msg.conversation_id = ${conversationId}::uuid
     GROUP BY r.message_id, r.emoji
     ORDER BY r.message_id, r.emoji
  `);
  const reactionMap = new Map<string, MessageReactionSummary[]>();
  for (const reaction of rows<{ messageId: string; emoji: ReactionEmoji; count: number; mine: boolean }>(reactionResult)) {
    const list = reactionMap.get(reaction.messageId) ?? [];
    list.push({ emoji: reaction.emoji, count: Number(reaction.count), mine: Boolean(reaction.mine) });
    reactionMap.set(reaction.messageId, list);
  }
  return messages.map((message) => ({ ...message, reactions: reactionMap.get(message.id) ?? [] }));
}

export async function searchMessages(userId: string, query: string): Promise<MessageSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const result = await db.execute(sql`
    SELECT
      msg.id::text AS id,
      msg.conversation_id::text AS "conversationId",
      COALESCE(c.title, 'Conversation') AS "conversationTitle",
      COALESCE(author.name, 'Former team member') AS "authorName",
      msg.body,
      msg.created_at AS "createdAt"
      FROM staff_messages msg
      JOIN staff_conversations c ON c.id = msg.conversation_id
      JOIN staff_conversation_members member_scope
        ON member_scope.conversation_id = msg.conversation_id
       AND member_scope.user_id = ${userId}::uuid
      LEFT JOIN users author ON author.id = msg.author_user_id
     WHERE msg.deleted_at IS NULL
       AND msg.body ILIKE ${`%${q}%`}
     ORDER BY msg.created_at DESC
     LIMIT 50
  `);
  return rows<MessageSearchResult>(result);
}

export async function createDirectConversation(userId: string, otherUserId: string): Promise<string> {
  if (userId === otherUserId) throw new Error("Choose another team member");
  await requireActiveStaff(otherUserId);
  const directKey = [userId, otherUserId].sort().join(":");
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      INSERT INTO staff_conversations (type, direct_key, created_by_user_id)
      VALUES ('DIRECT', ${directKey}, ${userId}::uuid)
      ON CONFLICT (direct_key) DO UPDATE SET updated_at = staff_conversations.updated_at
      RETURNING id::text
    `);
    const conversationId = rows<{ id: string }>(result)[0]?.id;
    if (!conversationId) throw new Error("Direct conversation could not be resolved");
    await tx.execute(sql`
      INSERT INTO staff_conversation_members (conversation_id, user_id, member_role)
      VALUES
        (${conversationId}::uuid, ${userId}::uuid, 'OWNER'),
        (${conversationId}::uuid, ${otherUserId}::uuid, 'MEMBER')
      ON CONFLICT (conversation_id, user_id) DO NOTHING
    `);
    await recordAudit(tx, "CONVERSATION_CREATED", userId, "staff_conversation", conversationId, { type: "DIRECT" });
    return conversationId;
  });
}

export async function createStaffCircle(
  creatorUserId: string,
  title: string,
  memberUserIds: string[],
  type: "GROUP" | "STAFF_CIRCLE" = "STAFF_CIRCLE"
): Promise<string> {
  const cleanTitle = title.trim();
  if (cleanTitle.length < 2 || cleanTitle.length > 80) throw new Error("Circle name must be between 2 and 80 characters");
  const memberIds = Array.from(new Set([creatorUserId, ...memberUserIds.filter(Boolean)]));
  if (memberIds.length > 100) throw new Error("A staff Circle can contain at most 100 members in this phase");
  for (const memberId of memberIds) await requireActiveStaff(memberId);

  return db.transaction(async (tx) => {
    const inserted = await tx.execute(sql`
      INSERT INTO staff_conversations (type, title, created_by_user_id)
      VALUES (${type}::staff_conversation_type, ${cleanTitle}, ${creatorUserId}::uuid)
      RETURNING id::text
    `);
    const conversationId = rows<{ id: string }>(inserted)[0]?.id;
    if (!conversationId) throw new Error("Staff Circle could not be created");
    for (const memberId of memberIds) {
      await tx.execute(sql`
        INSERT INTO staff_conversation_members (conversation_id, user_id, member_role)
        VALUES (${conversationId}::uuid, ${memberId}::uuid, ${memberId === creatorUserId ? "OWNER" : "MEMBER"}::conversation_member_role)
        ON CONFLICT (conversation_id, user_id) DO NOTHING
      `);
    }
    await recordAudit(tx, "CONVERSATION_CREATED", creatorUserId, "staff_conversation", conversationId, { type, title: cleanTitle, memberCount: memberIds.length });
    return conversationId;
  });
}

export async function sendMessage(input: {
  userId: string;
  conversationId: string;
  body: string;
  replyToMessageId?: string | null;
  attachment?: LinkedAttachment | null;
}): Promise<string> {
  await requireMembership(input.userId, input.conversationId);
  const body = input.body.trim();
  if (body.length > 8000) throw new Error("Message is too long");
  const attachment = normalizeAttachment(input.attachment ?? null);
  if (!body && !attachment) throw new Error("Write a message or attach a secure link");
  if (input.replyToMessageId) await requireMessageInConversation(input.replyToMessageId, input.conversationId);
  const attachmentSql = attachment ? sql`CAST(${JSON.stringify(attachment)} AS jsonb)` : sql`NULL`;

  const inserted = await db.execute(sql`
    INSERT INTO staff_messages (conversation_id, author_user_id, body, reply_to_message_id, attachment)
    VALUES (
      ${input.conversationId}::uuid,
      ${input.userId}::uuid,
      ${body},
      ${input.replyToMessageId ?? null}::uuid,
      ${attachmentSql}
    )
    RETURNING id::text
  `);
  const messageId = rows<{ id: string }>(inserted)[0]?.id;
  if (!messageId) throw new Error("Message could not be sent");
  await db.execute(sql`UPDATE staff_conversations SET updated_at = now() WHERE id = ${input.conversationId}::uuid`);
  await db.execute(sql`
    UPDATE staff_conversation_members
       SET last_read_at = now()
     WHERE conversation_id = ${input.conversationId}::uuid AND user_id = ${input.userId}::uuid
  `);
  return messageId;
}

export async function markConversationRead(userId: string, conversationId: string): Promise<void> {
  await requireMembership(userId, conversationId);
  await db.execute(sql`
    UPDATE staff_conversation_members SET last_read_at = now()
     WHERE conversation_id = ${conversationId}::uuid AND user_id = ${userId}::uuid
  `);
}

export async function toggleReaction(userId: string, conversationId: string, messageId: string, emoji: string): Promise<void> {
  await requireMembership(userId, conversationId);
  await requireMessageInConversation(messageId, conversationId);
  if (!ALLOWED_REACTIONS.has(emoji as ReactionEmoji)) throw new Error("Unsupported reaction");
  const removed = await db.execute(sql`
    DELETE FROM staff_message_reactions
     WHERE message_id = ${messageId}::uuid AND user_id = ${userId}::uuid AND emoji = ${emoji}
     RETURNING message_id
  `);
  if (rows(removed).length === 0) {
    await db.execute(sql`
      INSERT INTO staff_message_reactions (message_id, user_id, emoji)
      VALUES (${messageId}::uuid, ${userId}::uuid, ${emoji})
      ON CONFLICT (message_id, user_id, emoji) DO NOTHING
    `);
  }
}

export async function togglePin(userId: string, conversationId: string, messageId: string): Promise<void> {
  await requireMembership(userId, conversationId);
  await requireMessageInConversation(messageId, conversationId);
  const removed = await db.execute(sql`
    DELETE FROM staff_message_pins
     WHERE conversation_id = ${conversationId}::uuid AND message_id = ${messageId}::uuid
     RETURNING message_id
  `);
  if (rows(removed).length === 0) {
    await db.execute(sql`
      INSERT INTO staff_message_pins (conversation_id, message_id, pinned_by_user_id)
      VALUES (${conversationId}::uuid, ${messageId}::uuid, ${userId}::uuid)
      ON CONFLICT (conversation_id, message_id) DO NOTHING
    `);
  }
}

export async function createActionDraft(
  userId: string,
  conversationId: string,
  sourceMessageId: string,
  actionType: string
): Promise<string> {
  await requireMembership(userId, conversationId);
  await requireMessageInConversation(sourceMessageId, conversationId);
  if (!ALLOWED_ACTIONS.has(actionType as ConversationActionType)) throw new Error("Unsupported action draft type");
  const result = await db.execute(sql`
    INSERT INTO conversation_action_drafts (conversation_id, source_message_id, action_type, created_by_user_id)
    VALUES (${conversationId}::uuid, ${sourceMessageId}::uuid, ${actionType}::conversation_action_type, ${userId}::uuid)
    RETURNING id::text
  `);
  const id = rows<{ id: string }>(result)[0]?.id;
  if (!id) throw new Error("Action draft could not be created");
  await recordAudit(db, "CONVERSATION_ACTION_DRAFTED", userId, "conversation_action_draft", id, { conversationId, sourceMessageId, actionType, executesAuthority: false });
  return id;
}

export async function listActionDrafts(userId: string, conversationId: string): Promise<ActionDraft[]> {
  await requireMembership(userId, conversationId);
  const result = await db.execute(sql`
    SELECT
      d.id::text AS id,
      d.conversation_id::text AS "conversationId",
      d.source_message_id::text AS "sourceMessageId",
      d.action_type::text AS "actionType",
      COALESCE(u.name, 'Former team member') AS "createdByName",
      d.created_at AS "createdAt"
      FROM conversation_action_drafts d
      LEFT JOIN users u ON u.id = d.created_by_user_id
     WHERE d.conversation_id = ${conversationId}::uuid
       AND d.status = 'DRAFT'
     ORDER BY d.created_at DESC
     LIMIT 30
  `);
  return rows<ActionDraft>(result);
}

async function requireMembership(userId: string, conversationId: string): Promise<void> {
  const result = await db.execute(sql`
    SELECT 1
      FROM staff_conversation_members m
      JOIN staff_conversations c ON c.id = m.conversation_id
     WHERE m.user_id = ${userId}::uuid
       AND m.conversation_id = ${conversationId}::uuid
       AND c.archived = false
     LIMIT 1
  `);
  if (rows(result).length === 0) throw new Error("Conversation is unavailable");
}

async function requireMessageInConversation(messageId: string, conversationId: string): Promise<void> {
  const result = await db.execute(sql`
    SELECT 1 FROM staff_messages
     WHERE id = ${messageId}::uuid
       AND conversation_id = ${conversationId}::uuid
       AND deleted_at IS NULL
     LIMIT 1
  `);
  if (rows(result).length === 0) throw new Error("Message is unavailable");
}

async function requireActiveStaff(userId: string): Promise<void> {
  const result = await db.execute(sql`SELECT 1 FROM users WHERE id = ${userId}::uuid AND active = true LIMIT 1`);
  if (rows(result).length === 0) throw new Error("Team member is unavailable");
}

function normalizeAttachment(attachment: LinkedAttachment | null): LinkedAttachment | null {
  if (!attachment) return null;
  const label = attachment.label.trim();
  const url = attachment.url.trim();
  if (!label || label.length > 120) throw new Error("Attachment label must be between 1 and 120 characters");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Attachment URL is invalid");
  }
  if (parsed.protocol !== "https:") throw new Error("Attachment links must use HTTPS");
  return { label, url: parsed.toString() };
}

async function recordAudit(
  executor: { execute: typeof db.execute },
  eventType: string,
  actorUserId: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await executor.execute(sql`
    INSERT INTO audit_events (event_type, actor_user_id, target_type, target_id, metadata)
    VALUES (${eventType}, ${actorUserId}::uuid, ${targetType}, ${targetId}, CAST(${JSON.stringify(metadata)} AS jsonb))
  `);
}

function rows<T = Record<string, unknown>>(result: unknown): T[] {
  return ((result as { rows?: T[] } | null)?.rows ?? []) as T[];
}
