import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type WorkType = "TASK" | "CASE" | "INCIDENT" | "FOLLOW_UP" | "APPROVAL" | "KNOWLEDGE" | "SCHEDULE" | "PROJECT";
export type WorkStatus = "INBOX" | "READY" | "IN_PROGRESS" | "WAITING" | "BLOCKED" | "DONE" | "CANCELLED";
export type WorkPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT" | "CRITICAL";
export type RecurrenceRule = "DAILY" | "WEEKLY" | "MONTHLY";

export interface WorkQueue {
  id: string;
  queueKey: string;
  name: string;
  description: string;
  defaultRole: string | null;
}

export interface WorkItem {
  id: string;
  workType: WorkType;
  title: string;
  context: string;
  nextAction: string;
  queueId: string;
  queueKey: string;
  queueName: string;
  ownerUserId: string | null;
  ownerName: string | null;
  priority: WorkPriority;
  status: WorkStatus;
  dueAt: Date | null;
  slaDueAt: Date | null;
  scheduledFor: Date | null;
  recurrenceRule: RecurrenceRule | null;
  requiredRole: string | null;
  requiredLanguage: string | null;
  preferredTimezone: string | null;
  routingReason: string | null;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  sourceActionDraftId: string | null;
  collaboratorCount: number;
  blockedByCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkHistoryEntry {
  id: string;
  eventType: string;
  actorName: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface RoutingProfile {
  userId: string;
  name: string;
  role: string;
  timezone: string;
  languages: string[];
  available: boolean;
  maxActiveWork: number;
  activeWork: number;
}

export async function listWorkQueues(): Promise<WorkQueue[]> {
  const result = await db.execute(sql`
    SELECT id::text AS id, queue_key AS "queueKey", name, description, default_role::text AS "defaultRole"
      FROM work_queues
     WHERE active = TRUE
     ORDER BY name ASC
  `);
  return rows<WorkQueue>(result);
}

export async function listWorkItems(userId: string, includeAll = false): Promise<WorkItem[]> {
  const actor = await requireActiveStaff(userId);
  const maySeeAll = includeAll && actor.role === "OWNER";
  const result = await db.execute(sql`
    SELECT
      w.id::text AS id,
      w.work_type::text AS "workType",
      w.title,
      w.context,
      w.next_action AS "nextAction",
      q.id::text AS "queueId",
      q.queue_key AS "queueKey",
      q.name AS "queueName",
      w.owner_user_id::text AS "ownerUserId",
      owner.name AS "ownerName",
      w.priority::text AS priority,
      w.status::text AS status,
      w.due_at AS "dueAt",
      w.sla_due_at AS "slaDueAt",
      w.scheduled_for AS "scheduledFor",
      w.recurrence_rule AS "recurrenceRule",
      w.required_role::text AS "requiredRole",
      w.required_language AS "requiredLanguage",
      w.preferred_timezone AS "preferredTimezone",
      w.routing_reason AS "routingReason",
      w.source_conversation_id::text AS "sourceConversationId",
      w.source_message_id::text AS "sourceMessageId",
      w.source_action_draft_id::text AS "sourceActionDraftId",
      (SELECT count(*)::int FROM work_collaborators wc WHERE wc.work_item_id = w.id) AS "collaboratorCount",
      (SELECT count(*)::int
         FROM work_dependencies wd
         JOIN work_items dependency ON dependency.id = wd.depends_on_work_item_id
        WHERE wd.work_item_id = w.id AND dependency.status NOT IN ('DONE', 'CANCELLED')) AS "blockedByCount",
      w.created_at AS "createdAt",
      w.updated_at AS "updatedAt"
    FROM work_items w
    JOIN work_queues q ON q.id = w.queue_id
    LEFT JOIN users owner ON owner.id = w.owner_user_id
    WHERE ${maySeeAll} = TRUE
       OR w.owner_user_id = ${userId}::uuid
       OR w.created_by_user_id = ${userId}::uuid
       OR EXISTS (SELECT 1 FROM work_collaborators wc WHERE wc.work_item_id = w.id AND wc.user_id = ${userId}::uuid)
       OR (w.owner_user_id IS NULL AND w.status NOT IN ('DONE', 'CANCELLED'))
    ORDER BY
      CASE w.priority WHEN 'CRITICAL' THEN 0 WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END,
      COALESCE(w.sla_due_at, w.due_at, w.scheduled_for, 'infinity'::timestamptz) ASC,
      w.updated_at DESC
  `);
  return rows<WorkItem>(result).map(normalizeWorkItem);
}

export async function getWorkItem(userId: string, workItemId: string): Promise<WorkItem> {
  await requireWorkVisibility(userId, workItemId);
  const result = await db.execute(sql`
    SELECT
      w.id::text AS id, w.work_type::text AS "workType", w.title, w.context, w.next_action AS "nextAction",
      q.id::text AS "queueId", q.queue_key AS "queueKey", q.name AS "queueName",
      w.owner_user_id::text AS "ownerUserId", owner.name AS "ownerName", w.priority::text AS priority,
      w.status::text AS status, w.due_at AS "dueAt", w.sla_due_at AS "slaDueAt", w.scheduled_for AS "scheduledFor",
      w.recurrence_rule AS "recurrenceRule", w.required_role::text AS "requiredRole",
      w.required_language AS "requiredLanguage", w.preferred_timezone AS "preferredTimezone",
      w.routing_reason AS "routingReason", w.source_conversation_id::text AS "sourceConversationId",
      w.source_message_id::text AS "sourceMessageId", w.source_action_draft_id::text AS "sourceActionDraftId",
      (SELECT count(*)::int FROM work_collaborators wc WHERE wc.work_item_id = w.id) AS "collaboratorCount",
      (SELECT count(*)::int FROM work_dependencies wd JOIN work_items d ON d.id = wd.depends_on_work_item_id WHERE wd.work_item_id = w.id AND d.status NOT IN ('DONE','CANCELLED')) AS "blockedByCount",
      w.created_at AS "createdAt", w.updated_at AS "updatedAt"
    FROM work_items w JOIN work_queues q ON q.id = w.queue_id LEFT JOIN users owner ON owner.id = w.owner_user_id
    WHERE w.id = ${workItemId}::uuid
  `);
  const item = rows<WorkItem>(result)[0];
  if (!item) throw new Error("Work item is unavailable");
  return normalizeWorkItem(item);
}

export async function createWorkItem(input: {
  actorUserId: string;
  workType: WorkType;
  title: string;
  context?: string;
  nextAction?: string;
  queueKey?: string;
  ownerUserId?: string | null;
  priority?: WorkPriority;
  dueAt?: Date | null;
  slaDueAt?: Date | null;
  scheduledFor?: Date | null;
  recurrenceRule?: RecurrenceRule | null;
  requiredRole?: string | null;
  requiredLanguage?: string | null;
  preferredTimezone?: string | null;
  sourceConversationId?: string | null;
  sourceMessageId?: string | null;
}): Promise<string> {
  await requireActiveStaff(input.actorUserId);
  const title = cleanText(input.title, 2, 180, "Work title");
  const context = cleanOptional(input.context, 6000);
  const nextAction = cleanOptional(input.nextAction, 500);
  if (input.ownerUserId) await requireActiveStaff(input.ownerUserId);
  if (input.sourceConversationId) await requireConversationMembership(input.actorUserId, input.sourceConversationId);
  if (input.sourceMessageId && input.sourceConversationId) await requireMessageInConversation(input.sourceMessageId, input.sourceConversationId);
  const queue = await resolveQueue(input.queueKey ?? queueForType(input.workType));
  const priority = input.priority ?? "NORMAL";
  const slaDueAt = input.slaDueAt ?? defaultSlaDue(priority);

  const inserted = await db.execute(sql`
    INSERT INTO work_items (
      work_type, title, context, next_action, queue_id, owner_user_id, priority, status,
      due_at, sla_due_at, scheduled_for, recurrence_rule, required_role, required_language,
      preferred_timezone, source_conversation_id, source_message_id, created_by_user_id
    ) VALUES (
      ${input.workType}::work_item_type, ${title}, ${context}, ${nextAction}, ${queue.id}::uuid,
      ${input.ownerUserId ?? null}::uuid, ${priority}::work_priority,
      ${input.ownerUserId ? "READY" : "INBOX"}::work_item_status,
      ${input.dueAt ?? null}, ${slaDueAt}, ${input.scheduledFor ?? null}, ${input.recurrenceRule ?? null},
      ${input.requiredRole ?? null}::role, ${normalizeLanguage(input.requiredLanguage)}, ${normalizeTimezone(input.preferredTimezone)},
      ${input.sourceConversationId ?? null}::uuid, ${input.sourceMessageId ?? null}::uuid, ${input.actorUserId}::uuid
    ) RETURNING id::text
  `);
  const id = rows<{ id: string }>(inserted)[0]?.id;
  if (!id) throw new Error("Work item could not be created");
  await appendHistory(id, "WORK_CREATED", input.actorUserId, { queueKey: queue.queueKey, priority, ownerUserId: input.ownerUserId ?? null });
  return id;
}

export async function convertConversationDraftToWork(actorUserId: string, draftId: string): Promise<string> {
  await requireActiveStaff(actorUserId);
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      SELECT d.id::text AS id, d.status, d.action_type::text AS "actionType", d.conversation_id::text AS "conversationId",
             d.source_message_id::text AS "sourceMessageId", msg.body, d.converted_work_item_id::text AS "convertedWorkItemId"
        FROM conversation_action_drafts d
        JOIN staff_conversation_members member ON member.conversation_id = d.conversation_id AND member.user_id = ${actorUserId}::uuid
        LEFT JOIN staff_messages msg ON msg.id = d.source_message_id
       WHERE d.id = ${draftId}::uuid
       FOR UPDATE OF d
    `);
    const draft = rows<{ id: string; status: string; actionType: string; conversationId: string; sourceMessageId: string | null; body: string | null; convertedWorkItemId: string | null }>(result)[0];
    if (!draft) throw new Error("Conversation action draft is unavailable");
    if (draft.status === "CONVERTED" && draft.convertedWorkItemId) return draft.convertedWorkItemId;
    if (draft.status !== "DRAFT") throw new Error("Conversation action draft is no longer convertible");

    const type = workTypeFromDraft(draft.actionType);
    const queue = await resolveQueueTx(tx, queueForType(type));
    const fallbackTitle = `${labelForType(type)} from conversation`;
    const sourceTitle = (draft.body || fallbackTitle).trim();
    const title = (sourceTitle.length >= 2 ? sourceTitle : fallbackTitle).slice(0, 180);
    const priority: WorkPriority = type === "INCIDENT" ? "URGENT" : "NORMAL";
    const inserted = await tx.execute(sql`
      INSERT INTO work_items (
        work_type, title, context, next_action, queue_id, priority, status, sla_due_at,
        source_conversation_id, source_message_id, source_action_draft_id, created_by_user_id
      ) VALUES (
        ${type}::work_item_type, ${title}, 'Created from a staff conversation action draft.',
        'Assign an owner and agree the next action.', ${queue.id}::uuid, ${priority}::work_priority, 'INBOX',
        ${defaultSlaDue(priority)}, ${draft.conversationId}::uuid, ${draft.sourceMessageId}::uuid, ${draft.id}::uuid, ${actorUserId}::uuid
      ) RETURNING id::text
    `);
    const workItemId = rows<{ id: string }>(inserted)[0]?.id;
    if (!workItemId) throw new Error("Work item could not be created from conversation");
    await tx.execute(sql`
      UPDATE conversation_action_drafts
         SET status = 'CONVERTED', converted_work_item_id = ${workItemId}::uuid, converted_at = now()
       WHERE id = ${draft.id}::uuid
    `);
    await appendHistoryTx(tx, workItemId, "CONVERSATION_DRAFT_CONVERTED", actorUserId, { draftId: draft.id, conversationId: draft.conversationId });
    return workItemId;
  });
}

export async function claimWorkItem(actorUserId: string, workItemId: string): Promise<void> {
  await requireActiveStaff(actorUserId);
  await db.transaction(async (tx) => {
    const locked = await tx.execute(sql`SELECT owner_user_id::text AS "ownerUserId", status::text AS status FROM work_items WHERE id = ${workItemId}::uuid FOR UPDATE`);
    const item = rows<{ ownerUserId: string | null; status: WorkStatus }>(locked)[0];
    if (!item || ["DONE", "CANCELLED"].includes(item.status)) throw new Error("Work item is unavailable");
    if (item.ownerUserId && item.ownerUserId !== actorUserId) throw new Error("Work item already has an owner");
    await tx.execute(sql`UPDATE work_items SET owner_user_id = ${actorUserId}::uuid, status = CASE WHEN status = 'INBOX' THEN 'READY'::work_item_status ELSE status END, routing_reason = 'Claimed by team member', updated_at = now() WHERE id = ${workItemId}::uuid`);
    await appendHistoryTx(tx, workItemId, "WORK_CLAIMED", actorUserId, {});
  });
}

export async function routeWorkItem(actorUserId: string, workItemId: string): Promise<string> {
  await requireManageAccess(actorUserId, workItemId);
  return db.transaction(async (tx) => {
    const itemResult = await tx.execute(sql`
      SELECT w.id::text AS id, w.required_role::text AS "requiredRole", w.required_language AS "requiredLanguage",
             w.preferred_timezone AS "preferredTimezone", q.default_role::text AS "defaultRole", w.status::text AS status
        FROM work_items w JOIN work_queues q ON q.id = w.queue_id
       WHERE w.id = ${workItemId}::uuid FOR UPDATE
    `);
    const item = rows<{ id: string; requiredRole: string | null; requiredLanguage: string | null; preferredTimezone: string | null; defaultRole: string | null; status: WorkStatus }>(itemResult)[0];
    if (!item || ["DONE", "CANCELLED"].includes(item.status)) throw new Error("Work item is unavailable");
    const role = item.requiredRole ?? item.defaultRole;
    const candidatesResult = await tx.execute(sql`
      SELECT u.id::text AS "userId", u.name, u.role::text AS role, rp.timezone, rp.languages, rp.max_active_work AS "maxActiveWork",
             (SELECT count(*)::int FROM work_items active WHERE active.owner_user_id = u.id AND active.status NOT IN ('DONE','CANCELLED')) AS "activeWork"
        FROM users u
        JOIN work_routing_profiles rp ON rp.user_id = u.id
       WHERE u.active = TRUE AND rp.available = TRUE
         AND (${role}::role IS NULL OR u.role = ${role}::role)
         AND (${item.requiredLanguage}::text IS NULL OR rp.languages @> ARRAY[${item.requiredLanguage}]::text[])
       ORDER BY
         CASE WHEN ${item.preferredTimezone}::text IS NOT NULL AND rp.timezone = ${item.preferredTimezone} THEN 0 ELSE 1 END,
         (SELECT count(*) FROM work_items active WHERE active.owner_user_id = u.id AND active.status NOT IN ('DONE','CANCELLED')) ASC,
         u.name ASC
    `);
    const candidates = rows<RoutingProfile>(candidatesResult).filter((candidate) => Number(candidate.activeWork) < Number(candidate.maxActiveWork));
    const selected = candidates[0];
    if (!selected) throw new Error("No currently available team member matches this work item. Leave it in queue or adjust routing requirements.");
    const reason = `Routed to ${selected.name}: available; role ${selected.role}; active load ${selected.activeWork}/${selected.maxActiveWork}${item.requiredLanguage ? `; language ${item.requiredLanguage}` : ""}${item.preferredTimezone && selected.timezone === item.preferredTimezone ? `; timezone ${item.preferredTimezone}` : ""}.`;
    await tx.execute(sql`UPDATE work_items SET owner_user_id = ${selected.userId}::uuid, status = CASE WHEN status = 'INBOX' THEN 'READY'::work_item_status ELSE status END, routing_reason = ${reason}, updated_at = now() WHERE id = ${workItemId}::uuid`);
    await appendHistoryTx(tx, workItemId, "WORK_ROUTED", actorUserId, { ownerUserId: selected.userId, reason });
    return selected.userId;
  });
}

export async function updateWorkStatus(actorUserId: string, workItemId: string, nextStatus: WorkStatus): Promise<void> {
  await requireManageAccess(actorUserId, workItemId);
  await db.transaction(async (tx) => {
    const currentResult = await tx.execute(sql`SELECT status::text AS status, recurrence_rule AS "recurrenceRule", scheduled_for AS "scheduledFor", due_at AS "dueAt", sla_due_at AS "slaDueAt" FROM work_items WHERE id = ${workItemId}::uuid FOR UPDATE`);
    const current = rows<{ status: WorkStatus; recurrenceRule: RecurrenceRule | null; scheduledFor: Date | string | null; dueAt: Date | string | null; slaDueAt: Date | string | null }>(currentResult)[0];
    if (!current) throw new Error("Work item is unavailable");
    assertTransition(current.status, nextStatus);
    if (["IN_PROGRESS", "DONE"].includes(nextStatus)) {
      const blockers = await tx.execute(sql`SELECT count(*)::int AS count FROM work_dependencies wd JOIN work_items d ON d.id = wd.depends_on_work_item_id WHERE wd.work_item_id = ${workItemId}::uuid AND d.status NOT IN ('DONE','CANCELLED')`);
      if (Number(rows<{ count: number }>(blockers)[0]?.count ?? 0) > 0) throw new Error("Complete or cancel blocking dependencies before progressing this work");
    }
    await tx.execute(sql`
      UPDATE work_items SET status = ${nextStatus}::work_item_status,
        completed_at = CASE WHEN ${nextStatus} = 'DONE' THEN now() ELSE completed_at END,
        cancelled_at = CASE WHEN ${nextStatus} = 'CANCELLED' THEN now() ELSE cancelled_at END,
        updated_at = now()
      WHERE id = ${workItemId}::uuid
    `);
    await appendHistoryTx(tx, workItemId, "STATUS_CHANGED", actorUserId, { from: current.status, to: nextStatus });
    if (nextStatus === "DONE" && current.recurrenceRule) await createNextRecurrenceTx(tx, workItemId, actorUserId, current);
  });
}

export async function assignWorkOwner(actorUserId: string, workItemId: string, ownerUserId: string | null): Promise<void> {
  await requireManageAccess(actorUserId, workItemId);
  if (ownerUserId) await requireActiveStaff(ownerUserId);
  await db.execute(sql`UPDATE work_items SET owner_user_id = ${ownerUserId}::uuid, status = CASE WHEN ${ownerUserId}::uuid IS NOT NULL AND status = 'INBOX' THEN 'READY'::work_item_status ELSE status END, routing_reason = ${ownerUserId ? "Assigned by team member" : "Returned to queue"}, updated_at = now() WHERE id = ${workItemId}::uuid`);
  await appendHistory(workItemId, ownerUserId ? "OWNER_ASSIGNED" : "RETURNED_TO_QUEUE", actorUserId, { ownerUserId });
}

export async function addCollaborator(actorUserId: string, workItemId: string, collaboratorUserId: string): Promise<void> {
  await requireManageAccess(actorUserId, workItemId);
  await requireActiveStaff(collaboratorUserId);
  await db.execute(sql`INSERT INTO work_collaborators (work_item_id, user_id, added_by_user_id) VALUES (${workItemId}::uuid, ${collaboratorUserId}::uuid, ${actorUserId}::uuid) ON CONFLICT DO NOTHING`);
  await appendHistory(workItemId, "COLLABORATOR_ADDED", actorUserId, { collaboratorUserId });
}

export async function addDependency(actorUserId: string, workItemId: string, dependsOnWorkItemId: string): Promise<void> {
  await requireManageAccess(actorUserId, workItemId);
  if (workItemId === dependsOnWorkItemId) throw new Error("Work cannot depend on itself");
  await requireWorkVisibility(actorUserId, dependsOnWorkItemId);
  const cycle = await db.execute(sql`
    WITH RECURSIVE chain(id) AS (
      SELECT ${dependsOnWorkItemId}::uuid
      UNION
      SELECT wd.depends_on_work_item_id FROM work_dependencies wd JOIN chain c ON wd.work_item_id = c.id
    ) SELECT EXISTS(SELECT 1 FROM chain WHERE id = ${workItemId}::uuid) AS cycle
  `);
  if (Boolean(rows<{ cycle: boolean }>(cycle)[0]?.cycle)) throw new Error("This dependency would create a cycle");
  await db.execute(sql`INSERT INTO work_dependencies (work_item_id, depends_on_work_item_id, created_by_user_id) VALUES (${workItemId}::uuid, ${dependsOnWorkItemId}::uuid, ${actorUserId}::uuid) ON CONFLICT DO NOTHING`);
  await appendHistory(workItemId, "DEPENDENCY_ADDED", actorUserId, { dependsOnWorkItemId });
}

export async function updateRoutingProfile(userId: string, input: { timezone?: string; languages?: string[]; available?: boolean; maxActiveWork?: number }): Promise<void> {
  await requireActiveStaff(userId);
  const timezone = normalizeTimezone(input.timezone) ?? "UTC";
  const languages = Array.from(new Set((input.languages ?? ["en"]).map((v) => normalizeLanguage(v)).filter((v): v is string => Boolean(v))));
  if (languages.length === 0) languages.push("en");
  const maxActiveWork = Math.min(Math.max(Math.trunc(input.maxActiveWork ?? 20), 1), 200);
  await db.execute(sql`
    INSERT INTO work_routing_profiles (user_id, timezone, languages, available, max_active_work, updated_at)
    VALUES (${userId}::uuid, ${timezone}, string_to_array(${languages.join(",")}, ','), ${input.available ?? true}, ${maxActiveWork}, now())
    ON CONFLICT (user_id) DO UPDATE SET timezone = EXCLUDED.timezone, languages = EXCLUDED.languages, available = EXCLUDED.available, max_active_work = EXCLUDED.max_active_work, updated_at = now()
  `);
}

export async function listRoutingProfiles(): Promise<RoutingProfile[]> {
  const result = await db.execute(sql`
    SELECT u.id::text AS "userId", u.name, u.role::text AS role, COALESCE(rp.timezone,'UTC') AS timezone,
           COALESCE(rp.languages, ARRAY['en']::text[]) AS languages, COALESCE(rp.available, TRUE) AS available,
           COALESCE(rp.max_active_work,20)::int AS "maxActiveWork",
           (SELECT count(*)::int FROM work_items w WHERE w.owner_user_id = u.id AND w.status NOT IN ('DONE','CANCELLED')) AS "activeWork"
      FROM users u LEFT JOIN work_routing_profiles rp ON rp.user_id = u.id WHERE u.active = TRUE ORDER BY u.name
  `);
  return rows<RoutingProfile>(result).map((p) => ({ ...p, activeWork: Number(p.activeWork), maxActiveWork: Number(p.maxActiveWork) }));
}

export async function listWorkHistory(userId: string, workItemId: string): Promise<WorkHistoryEntry[]> {
  await requireWorkVisibility(userId, workItemId);
  const result = await db.execute(sql`
    SELECT h.id::text AS id, h.event_type AS "eventType", u.name AS "actorName", h.metadata, h.created_at AS "createdAt"
      FROM work_history h LEFT JOIN users u ON u.id = h.actor_user_id
     WHERE h.work_item_id = ${workItemId}::uuid ORDER BY h.created_at DESC
  `);
  return rows<WorkHistoryEntry>(result).map((entry) => ({ ...entry, createdAt: toDate(entry.createdAt)! }));
}

export async function getMyWorkAttentionCount(userId: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS count FROM work_items w
     WHERE w.owner_user_id = ${userId}::uuid AND w.status NOT IN ('DONE','CANCELLED')
       AND (w.priority IN ('URGENT','CRITICAL') OR w.sla_due_at <= now() + interval '8 hours' OR w.due_at <= now() + interval '24 hours')
  `);
  return Number(rows<{ count: number }>(result)[0]?.count ?? 0);
}

async function requireWorkVisibility(userId: string, workItemId: string): Promise<void> {
  const actor = await requireActiveStaff(userId);
  const result = await db.execute(sql`
    SELECT 1 FROM work_items w WHERE w.id = ${workItemId}::uuid AND (
      ${actor.role === "OWNER"} = TRUE OR w.owner_user_id = ${userId}::uuid OR w.created_by_user_id = ${userId}::uuid OR
      w.owner_user_id IS NULL OR EXISTS (SELECT 1 FROM work_collaborators wc WHERE wc.work_item_id = w.id AND wc.user_id = ${userId}::uuid)
    ) LIMIT 1
  `);
  if (rows(result).length === 0) throw new Error("Work item is unavailable");
}

async function requireManageAccess(userId: string, workItemId: string): Promise<void> {
  const actor = await requireActiveStaff(userId);
  const result = await db.execute(sql`
    SELECT 1 FROM work_items w WHERE w.id = ${workItemId}::uuid AND (
      ${actor.role === "OWNER"} = TRUE OR w.owner_user_id = ${userId}::uuid OR w.created_by_user_id = ${userId}::uuid OR
      EXISTS (SELECT 1 FROM work_collaborators wc WHERE wc.work_item_id = w.id AND wc.user_id = ${userId}::uuid)
    ) LIMIT 1
  `);
  if (rows(result).length === 0) throw new Error("Work item is unavailable");
}

async function requireActiveStaff(userId: string): Promise<{ id: string; role: string }> {
  const result = await db.execute(sql`SELECT id::text AS id, role::text AS role FROM users WHERE id = ${userId}::uuid AND active = TRUE LIMIT 1`);
  const actor = rows<{ id: string; role: string }>(result)[0];
  if (!actor) throw new Error("Active staff identity required");
  await db.execute(sql`INSERT INTO work_routing_profiles (user_id) VALUES (${userId}::uuid) ON CONFLICT (user_id) DO NOTHING`);
  return actor;
}

async function requireConversationMembership(userId: string, conversationId: string): Promise<void> {
  const result = await db.execute(sql`SELECT 1 FROM staff_conversation_members WHERE conversation_id = ${conversationId}::uuid AND user_id = ${userId}::uuid LIMIT 1`);
  if (rows(result).length === 0) throw new Error("Conversation is unavailable");
}

async function requireMessageInConversation(messageId: string, conversationId: string): Promise<void> {
  const result = await db.execute(sql`SELECT 1 FROM staff_messages WHERE id = ${messageId}::uuid AND conversation_id = ${conversationId}::uuid AND deleted_at IS NULL LIMIT 1`);
  if (rows(result).length === 0) throw new Error("Message is unavailable");
}

async function resolveQueue(queueKey: string): Promise<WorkQueue> {
  const result = await db.execute(sql`SELECT id::text AS id, queue_key AS "queueKey", name, description, default_role::text AS "defaultRole" FROM work_queues WHERE queue_key = ${queueKey} AND active = TRUE LIMIT 1`);
  const queue = rows<WorkQueue>(result)[0];
  if (!queue) throw new Error("Work queue is unavailable");
  return queue;
}

async function resolveQueueTx(tx: any, queueKey: string): Promise<WorkQueue> {
  const result = await tx.execute(sql`SELECT id::text AS id, queue_key AS "queueKey", name, description, default_role::text AS "defaultRole" FROM work_queues WHERE queue_key = ${queueKey} AND active = TRUE LIMIT 1`);
  const queue = rows<WorkQueue>(result)[0];
  if (!queue) throw new Error("Work queue is unavailable");
  return queue;
}

async function appendHistory(workItemId: string, eventType: string, actorUserId: string | null, metadata: Record<string, unknown>): Promise<void> {
  await db.execute(sql`INSERT INTO work_history (work_item_id, event_type, actor_user_id, metadata) VALUES (${workItemId}::uuid, ${eventType}, ${actorUserId}::uuid, CAST(${JSON.stringify(metadata)} AS jsonb))`);
}

async function appendHistoryTx(tx: any, workItemId: string, eventType: string, actorUserId: string | null, metadata: Record<string, unknown>): Promise<void> {
  await tx.execute(sql`INSERT INTO work_history (work_item_id, event_type, actor_user_id, metadata) VALUES (${workItemId}::uuid, ${eventType}, ${actorUserId}::uuid, CAST(${JSON.stringify(metadata)} AS jsonb))`);
}

async function createNextRecurrenceTx(tx: any, completedId: string, actorUserId: string, current: { recurrenceRule: RecurrenceRule | null; scheduledFor: Date | string | null; dueAt: Date | string | null; slaDueAt: Date | string | null }): Promise<void> {
  if (!current.recurrenceRule) return;
  const interval = current.recurrenceRule === "DAILY" ? "1 day" : current.recurrenceRule === "WEEKLY" ? "7 days" : "1 month";
  const inserted = await tx.execute(sql`
    INSERT INTO work_items (work_type, title, context, next_action, queue_id, owner_user_id, priority, status, due_at, sla_due_at, scheduled_for, recurrence_rule, required_role, required_language, preferred_timezone, routing_reason, source_conversation_id, source_message_id, created_by_user_id)
    SELECT work_type, title, context, next_action, queue_id, owner_user_id, priority, 'READY',
           CASE WHEN due_at IS NULL THEN NULL ELSE due_at + ${interval}::interval END,
           CASE WHEN sla_due_at IS NULL THEN NULL ELSE sla_due_at + ${interval}::interval END,
           COALESCE(scheduled_for, now()) + ${interval}::interval, recurrence_rule, required_role, required_language, preferred_timezone,
           'Created from recurring work item ' || ${completedId}, source_conversation_id, source_message_id, ${actorUserId}::uuid
      FROM work_items WHERE id = ${completedId}::uuid RETURNING id::text
  `);
  const nextId = rows<{ id: string }>(inserted)[0]?.id;
  if (nextId) await appendHistoryTx(tx, nextId, "RECURRENCE_CREATED", actorUserId, { previousWorkItemId: completedId });
}

function assertTransition(from: WorkStatus, to: WorkStatus): void {
  const allowed: Record<WorkStatus, WorkStatus[]> = {
    INBOX: ["READY", "CANCELLED"], READY: ["IN_PROGRESS", "WAITING", "BLOCKED", "CANCELLED"],
    IN_PROGRESS: ["WAITING", "BLOCKED", "DONE", "CANCELLED"], WAITING: ["READY", "IN_PROGRESS", "CANCELLED"],
    BLOCKED: ["READY", "IN_PROGRESS", "CANCELLED"], DONE: [], CANCELLED: [],
  };
  if (from === to) return;
  if (!allowed[from].includes(to)) throw new Error(`Invalid work transition: ${from} -> ${to}`);
}

function workTypeFromDraft(actionType: string): WorkType {
  const mapping: Record<string, WorkType> = { TASK: "TASK", CASE: "CASE", INCIDENT: "INCIDENT", FOLLOW_UP: "FOLLOW_UP", APPROVAL: "APPROVAL", KNOWLEDGE: "KNOWLEDGE" };
  const type = mapping[actionType];
  if (!type) throw new Error("Unsupported conversation action type");
  return type;
}

function queueForType(type: WorkType): string {
  if (type === "INCIDENT") return "OPERATIONS";
  if (type === "APPROVAL") return "APPROVALS";
  if (type === "CASE") return "TRADER_SUPPORT";
  if (type === "PROJECT") return "GROWTH";
  return "GENERAL";
}

function labelForType(type: WorkType): string { return type.replaceAll("_", " ").toLowerCase(); }

function defaultSlaDue(priority: WorkPriority): Date {
  const hours = priority === "CRITICAL" ? 1 : priority === "URGENT" ? 4 : priority === "HIGH" ? 24 : priority === "NORMAL" ? 72 : 168;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function cleanText(value: string, min: number, max: number, label: string): string {
  const clean = value.trim();
  if (clean.length < min || clean.length > max) throw new Error(`${label} must be between ${min} and ${max} characters`);
  return clean;
}
function cleanOptional(value: string | undefined, max: number): string { const clean = (value ?? "").trim(); if (clean.length > max) throw new Error(`Text is too long (max ${max})`); return clean; }
function normalizeLanguage(value: string | null | undefined): string | null { const clean = value?.trim().toLowerCase(); if (!clean) return null; if (!/^[a-z]{2,8}(-[a-z0-9]{2,8})?$/.test(clean)) throw new Error("Language must be a short language code such as en or sw"); return clean; }
function normalizeTimezone(value: string | null | undefined): string | null { const clean = value?.trim(); if (!clean) return null; if (clean.length > 80 || !/^[A-Za-z0-9_+\-/]+$/.test(clean)) throw new Error("Timezone is invalid"); return clean; }
function normalizeWorkItem(item: WorkItem): WorkItem {
  return {
    ...item,
    dueAt: toDate(item.dueAt),
    slaDueAt: toDate(item.slaDueAt),
    scheduledFor: toDate(item.scheduledFor),
    createdAt: toDate(item.createdAt)!,
    updatedAt: toDate(item.updatedAt)!,
    collaboratorCount: Number(item.collaboratorCount),
    blockedByCount: Number(item.blockedByCount),
  };
}
function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new Error("Invalid timestamp returned from work persistence");
  return parsed;
}
function rows<T = Record<string, unknown>>(result: unknown): T[] { return ((result as unknown as { rows?: T[] }).rows ?? []); }
