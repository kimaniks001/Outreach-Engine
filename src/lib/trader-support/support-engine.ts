import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type SupportCaseState = "OPEN" | "WAITING_ON_TRADER" | "WAITING_INTERNAL" | "RESOLVED" | "CLOSED";
export type SupportResolutionKind = "HUMAN" | "AUTHORITATIVE_CONTEXT" | "GUIDED_ACTION";

export interface SupportConversationSummary {
  id: string;
  securepayIdentityRef: string;
  displayLabel: string | null;
  lastMessageAt: Date;
  openCaseCount: number;
}

export interface SupportCaseSummary {
  id: string;
  conversationId: string;
  workItemId: string;
  subject: string;
  state: SupportCaseState;
  ownerName: string | null;
  priority: string;
  workStatus: string;
  slaDueAt: Date | null;
  nextAction: string;
  openedAt: Date;
}

export interface SupportMessage {
  id: string;
  actorType: "TRADER" | "STAFF" | "SYSTEM";
  actorName: string | null;
  body: string;
  sourceKind: string | null;
  sourceRef: string | null;
  createdAt: Date;
}

export async function getOrCreateTraderConversation(input: {
  actorUserId: string;
  securepayIdentityRef: string;
  displayLabel?: string | null;
}): Promise<string> {
  await requireActiveStaff(input.actorUserId);
  const identityRef = cleanRef(input.securepayIdentityRef, "SecurePay identity reference");
  const displayLabel = cleanOptional(input.displayLabel ?? undefined, 120) || null;
  const result = await db.execute(sql`
    INSERT INTO trader_support_conversations (securepay_identity_ref, display_label, created_by_user_id)
    VALUES (${identityRef}, ${displayLabel}, ${input.actorUserId}::uuid)
    ON CONFLICT (securepay_identity_ref) DO UPDATE
      SET display_label = COALESCE(trader_support_conversations.display_label, EXCLUDED.display_label)
    RETURNING id::text
  `);
  const id = rows<{ id: string }>(result)[0]?.id;
  if (!id) throw new Error("Trader support conversation could not be opened");
  return id;
}

export async function recordTraderMessage(conversationId: string, body: string): Promise<string> {
  const clean = cleanText(body, 1, 6000, "Message");
  const result = await db.execute(sql`
    INSERT INTO trader_support_messages (conversation_id, actor_type, body)
    VALUES (${conversationId}::uuid, 'TRADER', ${clean}) RETURNING id::text
  `);
  await touchConversation(conversationId);
  const id = rows<{ id: string }>(result)[0]?.id;
  if (!id) throw new Error("Trader message could not be recorded");
  return id;
}

export async function recordStaffReply(actorUserId: string, conversationId: string, body: string): Promise<string> {
  await requireActiveStaff(actorUserId);
  await requireConversation(conversationId);
  const clean = cleanText(body, 1, 6000, "Reply");
  const result = await db.execute(sql`
    INSERT INTO trader_support_messages (conversation_id, actor_type, actor_user_id, body)
    VALUES (${conversationId}::uuid, 'STAFF', ${actorUserId}::uuid, ${clean}) RETURNING id::text
  `);
  await touchConversation(conversationId);
  const id = rows<{ id: string }>(result)[0]?.id;
  if (!id) throw new Error("Support reply could not be recorded");
  return id;
}

export async function recordGroundedSupportAnswer(input: {
  actorUserId: string;
  conversationId: string;
  body: string;
  sourceKind: "SECUREPAY_AUTHORITATIVE" | "APPROVED_GUIDANCE";
  sourceRef: string;
}): Promise<string> {
  await requireActiveStaff(input.actorUserId);
  await requireConversation(input.conversationId);
  const body = cleanText(input.body, 1, 6000, "Answer");
  const sourceRef = cleanRef(input.sourceRef, "Authority source reference");
  const result = await db.execute(sql`
    INSERT INTO trader_support_messages (conversation_id, actor_type, actor_user_id, body, source_kind, source_ref)
    VALUES (${input.conversationId}::uuid, 'STAFF', ${input.actorUserId}::uuid, ${body}, ${input.sourceKind}, ${sourceRef})
    RETURNING id::text
  `);
  await touchConversation(input.conversationId);
  const id = rows<{ id: string }>(result)[0]?.id;
  if (!id) throw new Error("Grounded support answer could not be recorded");
  return id;
}

export async function openSupportCase(input: {
  actorUserId: string;
  conversationId: string;
  subject: string;
  context?: string;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT" | "CRITICAL";
  ownerUserId?: string | null;
  nextAction?: string;
}): Promise<string> {
  await requireActiveStaff(input.actorUserId);
  await requireConversation(input.conversationId);
  if (input.ownerUserId) await requireActiveStaff(input.ownerUserId);
  const subject = cleanText(input.subject, 2, 180, "Case subject");
  const context = cleanOptional(input.context, 6000);
  const nextAction = cleanOptional(input.nextAction, 500) || "Understand the trader's need and agree the next action.";
  const priority = input.priority ?? "NORMAL";
  const slaDueAt = defaultSlaDue(priority);

  return db.transaction(async (tx) => {
    const queueResult = await tx.execute(sql`SELECT id::text AS id FROM work_queues WHERE queue_key = 'TRADER_SUPPORT' AND active = TRUE LIMIT 1`);
    const queueId = rows<{ id: string }>(queueResult)[0]?.id;
    if (!queueId) throw new Error("Trader support queue is unavailable");

    const workResult = await tx.execute(sql`
      INSERT INTO work_items (
        work_type, title, context, next_action, queue_id, owner_user_id, priority, status, sla_due_at, created_by_user_id
      ) VALUES (
        'CASE', ${subject}, ${context}, ${nextAction}, ${queueId}::uuid, ${input.ownerUserId ?? null}::uuid,
        ${priority}::work_priority, ${input.ownerUserId ? "READY" : "INBOX"}::work_item_status, ${slaDueAt}, ${input.actorUserId}::uuid
      ) RETURNING id::text
    `);
    const workItemId = rows<{ id: string }>(workResult)[0]?.id;
    if (!workItemId) throw new Error("Case responsibility could not be created");

    const caseResult = await tx.execute(sql`
      INSERT INTO trader_support_cases (conversation_id, work_item_id, subject)
      VALUES (${input.conversationId}::uuid, ${workItemId}::uuid, ${subject}) RETURNING id::text
    `);
    const caseId = rows<{ id: string }>(caseResult)[0]?.id;
    if (!caseId) throw new Error("Support case could not be created");

    await tx.execute(sql`
      INSERT INTO work_history (work_item_id, event_type, actor_user_id, metadata)
      VALUES (${workItemId}::uuid, 'SUPPORT_CASE_OPENED', ${input.actorUserId}::uuid, CAST(${JSON.stringify({ caseId, conversationId: input.conversationId })} AS jsonb))
    `);
    await tx.execute(sql`
      INSERT INTO trader_support_case_history (case_id, event_type, actor_user_id, metadata)
      VALUES (${caseId}::uuid, 'CASE_OPENED', ${input.actorUserId}::uuid, CAST(${JSON.stringify({ workItemId })} AS jsonb))
    `);
    return caseId;
  });
}

export async function transitionSupportCase(actorUserId: string, caseId: string, nextState: SupportCaseState): Promise<void> {
  await requireActiveStaff(actorUserId);
  await db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      SELECT c.state::text AS state, c.work_item_id::text AS "workItemId"
      FROM trader_support_cases c WHERE c.id = ${caseId}::uuid FOR UPDATE
    `);
    const current = rows<{ state: SupportCaseState; workItemId: string }>(result)[0];
    if (!current) throw new Error("Support case is unavailable");
    assertCaseTransition(current.state, nextState);

    const workStatus = nextState === "RESOLVED" ? "DONE" : nextState === "CLOSED" ? "DONE" : nextState === "WAITING_ON_TRADER" || nextState === "WAITING_INTERNAL" ? "WAITING" : "IN_PROGRESS";
    await tx.execute(sql`
      UPDATE trader_support_cases
         SET state = ${nextState}::support_case_state,
             resolved_at = CASE WHEN ${nextState} = 'RESOLVED' THEN now() ELSE resolved_at END,
             closed_at = CASE WHEN ${nextState} = 'CLOSED' THEN now() ELSE closed_at END
       WHERE id = ${caseId}::uuid
    `);
    await tx.execute(sql`
      UPDATE work_items SET status = ${workStatus}::work_item_status,
        completed_at = CASE WHEN ${workStatus} = 'DONE' THEN COALESCE(completed_at, now()) ELSE completed_at END,
        updated_at = now()
      WHERE id = ${current.workItemId}::uuid
    `);
    await tx.execute(sql`INSERT INTO trader_support_case_history (case_id, event_type, actor_user_id, metadata) VALUES (${caseId}::uuid, 'STATE_CHANGED', ${actorUserId}::uuid, CAST(${JSON.stringify({ from: current.state, to: nextState })} AS jsonb))`);
    await tx.execute(sql`INSERT INTO work_history (work_item_id, event_type, actor_user_id, metadata) VALUES (${current.workItemId}::uuid, 'SUPPORT_CASE_STATE_CHANGED', ${actorUserId}::uuid, CAST(${JSON.stringify({ caseId, from: current.state, to: nextState })} AS jsonb))`);
  });
}

export async function resolveSupportCase(input: {
  actorUserId: string;
  caseId: string;
  summary: string;
  kind: SupportResolutionKind;
  authoritativeSourceRef?: string | null;
}): Promise<void> {
  await requireActiveStaff(input.actorUserId);
  const summary = cleanText(input.summary, 2, 2000, "Resolution summary");
  const sourceRef = input.authoritativeSourceRef ? cleanRef(input.authoritativeSourceRef, "Authority source reference") : null;
  if (input.kind === "AUTHORITATIVE_CONTEXT" && !sourceRef) throw new Error("Authoritative context resolution requires a SecurePay source reference");
  await db.execute(sql`
    UPDATE trader_support_cases
       SET resolution_summary = ${summary}, resolution_kind = ${input.kind}::support_resolution_kind,
           authoritative_source_ref = ${sourceRef}
     WHERE id = ${input.caseId}::uuid
  `);
  await transitionSupportCase(input.actorUserId, input.caseId, "RESOLVED");
}

export async function recordTraderFriction(actorUserId: string, caseId: string, category: string, detail: string): Promise<void> {
  await requireActiveStaff(actorUserId);
  const caseResult = await db.execute(sql`SELECT 1 FROM trader_support_cases WHERE id = ${caseId}::uuid LIMIT 1`);
  if (rows(caseResult).length === 0) throw new Error("Support case is unavailable");
  const cleanCategory = cleanText(category, 2, 80, "Friction category").toUpperCase().replace(/\s+/g, "_");
  const cleanDetail = cleanText(detail, 2, 500, "Friction detail");
  await db.execute(sql`INSERT INTO trader_friction_events (case_id, category, detail) VALUES (${caseId}::uuid, ${cleanCategory}, ${cleanDetail})`);
  await db.execute(sql`INSERT INTO trader_support_case_history (case_id, event_type, actor_user_id, metadata) VALUES (${caseId}::uuid, 'FRICTION_RECORDED', ${actorUserId}::uuid, CAST(${JSON.stringify({ category: cleanCategory })} AS jsonb))`);
}

export async function listSupportConversations(): Promise<SupportConversationSummary[]> {
  const result = await db.execute(sql`
    SELECT c.id::text AS id, c.securepay_identity_ref AS "securepayIdentityRef", c.display_label AS "displayLabel",
           c.last_message_at AS "lastMessageAt",
           (SELECT count(*)::int FROM trader_support_cases sc WHERE sc.conversation_id = c.id AND sc.state NOT IN ('RESOLVED','CLOSED')) AS "openCaseCount"
      FROM trader_support_conversations c
     ORDER BY c.last_message_at DESC
  `);
  return rows<SupportConversationSummary>(result).map((item) => ({ ...item, lastMessageAt: toDate(item.lastMessageAt), openCaseCount: Number(item.openCaseCount) }));
}

export async function listSupportCases(): Promise<SupportCaseSummary[]> {
  const result = await db.execute(sql`
    SELECT c.id::text AS id, c.conversation_id::text AS "conversationId", c.work_item_id::text AS "workItemId", c.subject,
           c.state::text AS state, u.name AS "ownerName", w.priority::text AS priority, w.status::text AS "workStatus",
           w.sla_due_at AS "slaDueAt", w.next_action AS "nextAction", c.opened_at AS "openedAt"
      FROM trader_support_cases c
      JOIN work_items w ON w.id = c.work_item_id
      LEFT JOIN users u ON u.id = w.owner_user_id
     ORDER BY CASE w.priority WHEN 'CRITICAL' THEN 0 WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 ELSE 3 END,
              COALESCE(w.sla_due_at, 'infinity'::timestamptz), c.opened_at DESC
  `);
  return rows<SupportCaseSummary>(result).map((item) => ({ ...item, slaDueAt: item.slaDueAt ? toDate(item.slaDueAt) : null, openedAt: toDate(item.openedAt) }));
}

export async function listConversationMessages(conversationId: string): Promise<SupportMessage[]> {
  await requireConversation(conversationId);
  const result = await db.execute(sql`
    SELECT m.id::text AS id, m.actor_type::text AS "actorType", u.name AS "actorName", m.body,
           m.source_kind AS "sourceKind", m.source_ref AS "sourceRef", m.created_at AS "createdAt"
      FROM trader_support_messages m LEFT JOIN users u ON u.id = m.actor_user_id
     WHERE m.conversation_id = ${conversationId}::uuid ORDER BY m.created_at ASC
  `);
  return rows<SupportMessage>(result).map((message) => ({ ...message, createdAt: toDate(message.createdAt) }));
}

export async function listFrictionSummary(): Promise<Array<{ category: string; count: number }>> {
  const result = await db.execute(sql`
    SELECT category, count(*)::int AS count FROM trader_friction_events
     GROUP BY category ORDER BY count(*) DESC, category ASC
  `);
  return rows<{ category: string; count: number }>(result).map((item) => ({ ...item, count: Number(item.count) }));
}

async function requireActiveStaff(userId: string): Promise<void> {
  const result = await db.execute(sql`SELECT 1 FROM users WHERE id = ${userId}::uuid AND active = TRUE LIMIT 1`);
  if (rows(result).length === 0) throw new Error("Active staff identity required");
}

async function requireConversation(conversationId: string): Promise<void> {
  const result = await db.execute(sql`SELECT 1 FROM trader_support_conversations WHERE id = ${conversationId}::uuid AND closed_at IS NULL LIMIT 1`);
  if (rows(result).length === 0) throw new Error("Trader support conversation is unavailable");
}

async function touchConversation(conversationId: string): Promise<void> {
  await db.execute(sql`UPDATE trader_support_conversations SET last_message_at = now() WHERE id = ${conversationId}::uuid`);
}

function assertCaseTransition(from: SupportCaseState, to: SupportCaseState): void {
  const allowed: Record<SupportCaseState, SupportCaseState[]> = {
    OPEN: ["WAITING_ON_TRADER", "WAITING_INTERNAL", "RESOLVED"],
    WAITING_ON_TRADER: ["OPEN", "WAITING_INTERNAL", "RESOLVED"],
    WAITING_INTERNAL: ["OPEN", "WAITING_ON_TRADER", "RESOLVED"],
    RESOLVED: ["OPEN", "CLOSED"],
    CLOSED: [],
  };
  if (from === to) return;
  if (!allowed[from].includes(to)) throw new Error(`Invalid support-case transition: ${from} -> ${to}`);
}

function defaultSlaDue(priority: "LOW" | "NORMAL" | "HIGH" | "URGENT" | "CRITICAL"): Date {
  const hours = priority === "CRITICAL" ? 1 : priority === "URGENT" ? 4 : priority === "HIGH" ? 24 : priority === "NORMAL" ? 72 : 168;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function cleanText(value: string, min: number, max: number, label: string): string {
  const clean = value.trim();
  if (clean.length < min || clean.length > max) throw new Error(`${label} must be between ${min} and ${max} characters`);
  return clean;
}
function cleanOptional(value: string | undefined, max: number): string { const clean = (value ?? "").trim(); if (clean.length > max) throw new Error(`Text is too long (max ${max})`); return clean; }
function cleanRef(value: string, label: string): string { const clean = value.trim(); if (clean.length < 2 || clean.length > 180 || /\s/.test(clean)) throw new Error(`${label} is invalid`); return clean; }
function toDate(value: Date | string): Date { return value instanceof Date ? value : new Date(value); }
function rows<T = Record<string, unknown>>(result: unknown): T[] { return ((result as { rows?: T[] }).rows ?? []); }
