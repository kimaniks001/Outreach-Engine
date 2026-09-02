import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type IncidentSeverity = "SEV1" | "SEV2" | "SEV3" | "SEV4";
export type IncidentState = "DETECTED" | "INVESTIGATING" | "MITIGATING" | "MONITORING" | "RESOLVED" | "CLOSED";
export type IncidentCommunicationState = "INTERNAL_ONLY" | "DRAFTED" | "AWAITING_APPROVAL" | "RELEASED";

export interface IncidentSummary {
  id: string;
  title: string;
  summary: string;
  severity: IncidentSeverity;
  state: IncidentState;
  commanderUserId: string;
  commanderName: string;
  affectedService: string;
  affectedTraderCount: number;
  communicationState: IncidentCommunicationState;
  detectedAt: Date;
  resolvedAt: Date | null;
  workItemId: string;
  conversationId: string;
  linkedCaseCount: number;
  responderCount: number;
}

export interface IncidentChronologyEntry {
  id: string;
  eventType: string;
  actorName: string | null;
  note: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface ServiceSignal {
  id: string;
  signalKey: string;
  serviceKey: string;
  signalKind: string;
  severityHint: IncidentSeverity | null;
  observedCount: number;
  firstObservedAt: Date;
  lastObservedAt: Date;
  evidenceRef: string;
  proposedIncidentId: string | null;
}

export async function openIncident(input: {
  actorUserId: string;
  title: string;
  summary?: string;
  severity: IncidentSeverity;
  affectedService: string;
  commanderUserId?: string;
  affectedTraderCount?: number;
}): Promise<string> {
  const actor = await requireActiveStaff(input.actorUserId);
  const commanderId = input.commanderUserId ?? input.actorUserId;
  await requireActiveStaff(commanderId);
  const title = clean(input.title, 2, 180, "Incident title");
  const summary = cleanOptional(input.summary, 4000);
  const affectedService = clean(input.affectedService, 2, 120, "Affected service");
  const affectedTraderCount = Math.max(0, Math.trunc(input.affectedTraderCount ?? 0));
  const priority = priorityForSeverity(input.severity);

  return db.transaction(async (tx) => {
    const conversationResult = await tx.execute(sql`
      INSERT INTO staff_conversations (type, title, created_by_user_id)
      VALUES ('GROUP', ${`Incident · ${title}`}, ${input.actorUserId}::uuid)
      RETURNING id::text
    `);
    const conversationId = rows<{ id: string }>(conversationResult)[0]?.id;
    if (!conversationId) throw new Error("Incident room could not be created");

    const members = Array.from(new Set([input.actorUserId, commanderId]));
    for (const memberId of members) {
      await tx.execute(sql`
        INSERT INTO staff_conversation_members (conversation_id, user_id, member_role)
        VALUES (${conversationId}::uuid, ${memberId}::uuid, ${memberId === commanderId ? "OWNER" : "MEMBER"}::conversation_member_role)
        ON CONFLICT (conversation_id, user_id) DO NOTHING
      `);
    }

    const queueResult = await tx.execute(sql`SELECT id::text AS id FROM work_queues WHERE queue_key = 'OPERATIONS' AND active = TRUE LIMIT 1`);
    const queueId = rows<{ id: string }>(queueResult)[0]?.id;
    if (!queueId) throw new Error("Operations queue is unavailable");

    const workResult = await tx.execute(sql`
      INSERT INTO work_items (
        work_type, title, context, next_action, queue_id, owner_user_id, priority, status,
        sla_due_at, source_conversation_id, created_by_user_id, routing_reason
      ) VALUES (
        'INCIDENT', ${title}, ${summary}, 'Coordinate the incident and keep chronology current.', ${queueId}::uuid,
        ${commanderId}::uuid, ${priority}::work_priority, 'IN_PROGRESS', ${defaultSla(input.severity)},
        ${conversationId}::uuid, ${input.actorUserId}::uuid, 'Incident commander selected explicitly at declaration.'
      ) RETURNING id::text
    `);
    const workItemId = rows<{ id: string }>(workResult)[0]?.id;
    if (!workItemId) throw new Error("Incident work item could not be created");

    if (input.actorUserId !== commanderId) {
      await tx.execute(sql`
        INSERT INTO work_collaborators (work_item_id, user_id, added_by_user_id)
        VALUES (${workItemId}::uuid, ${input.actorUserId}::uuid, ${input.actorUserId}::uuid)
        ON CONFLICT DO NOTHING
      `);
    }

    const incidentResult = await tx.execute(sql`
      INSERT INTO operations_incidents (
        work_item_id, conversation_id, title, summary, severity, state, commander_user_id,
        affected_service, affected_trader_count, created_by_user_id
      ) VALUES (
        ${workItemId}::uuid, ${conversationId}::uuid, ${title}, ${summary}, ${input.severity}::incident_severity,
        'DETECTED', ${commanderId}::uuid, ${affectedService}, ${affectedTraderCount}, ${input.actorUserId}::uuid
      ) RETURNING id::text
    `);
    const incidentId = rows<{ id: string }>(incidentResult)[0]?.id;
    if (!incidentId) throw new Error("Incident could not be created");

    for (const memberId of members) {
      await tx.execute(sql`
        INSERT INTO operations_incident_responders (incident_id, user_id, added_by_user_id)
        VALUES (${incidentId}::uuid, ${memberId}::uuid, ${input.actorUserId}::uuid)
        ON CONFLICT DO NOTHING
      `);
    }

    await appendChronologyTx(tx, incidentId, "INCIDENT_DETECTED", input.actorUserId, "Incident declared in Outreach.", {
      severity: input.severity,
      affectedService,
      affectedTraderCount,
      commanderUserId: commanderId,
    });
    await appendWorkHistoryTx(tx, workItemId, "INCIDENT_DECLARED", input.actorUserId, { incidentId, severity: input.severity });
    await auditTx(tx, "INCIDENT_DECLARED", input.actorUserId, incidentId, { severity: input.severity, affectedService, actorRole: actor.role });
    return incidentId;
  });
}

export async function listVisibleIncidents(userId: string): Promise<IncidentSummary[]> {
  const actor = await requireActiveStaff(userId);
  const result = await db.execute(sql`
    SELECT i.id::text AS id, i.title, i.summary, i.severity::text AS severity, i.state::text AS state,
           i.commander_user_id::text AS "commanderUserId", commander.name AS "commanderName",
           i.affected_service AS "affectedService", i.affected_trader_count AS "affectedTraderCount",
           i.communication_state::text AS "communicationState", i.detected_at AS "detectedAt", i.resolved_at AS "resolvedAt",
           i.work_item_id::text AS "workItemId", i.conversation_id::text AS "conversationId",
           (SELECT count(*)::int FROM operations_incident_case_links l WHERE l.incident_id = i.id) AS "linkedCaseCount",
           (SELECT count(*)::int FROM operations_incident_responders r WHERE r.incident_id = i.id) AS "responderCount"
      FROM operations_incidents i
      JOIN users commander ON commander.id = i.commander_user_id
     WHERE ${actor.role === "OWNER"} = TRUE
        OR i.commander_user_id = ${userId}::uuid
        OR EXISTS (SELECT 1 FROM operations_incident_responders r WHERE r.incident_id = i.id AND r.user_id = ${userId}::uuid)
        OR EXISTS (SELECT 1 FROM work_collaborators wc WHERE wc.work_item_id = i.work_item_id AND wc.user_id = ${userId}::uuid)
     ORDER BY CASE i.severity WHEN 'SEV1' THEN 0 WHEN 'SEV2' THEN 1 WHEN 'SEV3' THEN 2 ELSE 3 END,
              CASE WHEN i.state IN ('RESOLVED','CLOSED') THEN 1 ELSE 0 END,
              i.detected_at DESC
  `);
  return rows<IncidentSummary>(result).map(normalizeIncident);
}

export async function getIncident(userId: string, incidentId: string): Promise<IncidentSummary> {
  await requireIncidentVisibility(userId, incidentId);
  const incident = (await listVisibleIncidents(userId)).find((item) => item.id === incidentId);
  if (!incident) throw new Error("Incident is unavailable");
  return incident;
}

export async function listIncidentChronology(userId: string, incidentId: string): Promise<IncidentChronologyEntry[]> {
  await requireIncidentVisibility(userId, incidentId);
  const result = await db.execute(sql`
    SELECT c.id::text AS id, c.event_type AS "eventType", u.name AS "actorName", c.note,
           c.metadata, c.created_at AS "createdAt"
      FROM operations_incident_chronology c
      LEFT JOIN users u ON u.id = c.actor_user_id
     WHERE c.incident_id = ${incidentId}::uuid
     ORDER BY c.created_at ASC, c.id ASC
  `);
  return rows<IncidentChronologyEntry>(result).map((entry) => ({ ...entry, metadata: entry.metadata ?? {} }));
}

export async function addIncidentNote(userId: string, incidentId: string, note: string): Promise<void> {
  await requireIncidentVisibility(userId, incidentId);
  await appendChronology(incidentId, "NOTE", userId, clean(note, 1, 4000, "Chronology note"), {});
}

export async function addIncidentResponder(actorUserId: string, incidentId: string, responderUserId: string): Promise<void> {
  await requireIncidentCommander(actorUserId, incidentId);
  await requireActiveStaff(responderUserId);
  await db.transaction(async (tx) => {
    const locked = await lockIncidentTx(tx, incidentId);
    await tx.execute(sql`
      INSERT INTO operations_incident_responders (incident_id, user_id, added_by_user_id)
      VALUES (${incidentId}::uuid, ${responderUserId}::uuid, ${actorUserId}::uuid)
      ON CONFLICT DO NOTHING
    `);
    await tx.execute(sql`
      INSERT INTO staff_conversation_members (conversation_id, user_id, member_role)
      VALUES (${locked.conversationId}::uuid, ${responderUserId}::uuid, 'MEMBER')
      ON CONFLICT DO NOTHING
    `);
    await tx.execute(sql`
      INSERT INTO work_collaborators (work_item_id, user_id, added_by_user_id)
      VALUES (${locked.workItemId}::uuid, ${responderUserId}::uuid, ${actorUserId}::uuid)
      ON CONFLICT DO NOTHING
    `);
    await appendChronologyTx(tx, incidentId, "RESPONDER_ADDED", actorUserId, "Responder joined the incident room.", { responderUserId });
  });
}

export async function transitionIncident(input: {
  actorUserId: string;
  incidentId: string;
  state: IncidentState;
  note?: string;
  resolutionSummary?: string;
  rootCauseSummary?: string;
}): Promise<void> {
  await requireIncidentCommander(input.actorUserId, input.incidentId);
  const note = cleanOptional(input.note, 4000);
  const resolutionSummary = cleanOptional(input.resolutionSummary, 4000);
  const rootCauseSummary = cleanOptional(input.rootCauseSummary, 4000);
  if ((input.state === "RESOLVED" || input.state === "CLOSED") && !resolutionSummary) {
    throw new Error("A resolution summary is required before resolving an incident");
  }

  await db.transaction(async (tx) => {
    const current = await lockIncidentTx(tx, input.incidentId);
    if (!isAllowedTransition(current.state as IncidentState, input.state)) throw new Error("Incident transition is not allowed");
    const terminal = input.state === "RESOLVED" || input.state === "CLOSED";
    await tx.execute(sql`
      UPDATE operations_incidents
         SET state = ${input.state}::incident_state,
             resolution_summary = CASE WHEN ${terminal} THEN ${resolutionSummary} ELSE resolution_summary END,
             root_cause_summary = CASE WHEN ${terminal} THEN NULLIF(${rootCauseSummary}, '') ELSE root_cause_summary END,
             resolved_at = CASE WHEN ${terminal} THEN COALESCE(resolved_at, now()) ELSE resolved_at END,
             closed_at = CASE WHEN ${input.state === "CLOSED"} THEN now() ELSE closed_at END,
             updated_at = now()
       WHERE id = ${input.incidentId}::uuid
    `);
    const workStatus = terminal ? "DONE" : input.state === "DETECTED" ? "IN_PROGRESS" : "IN_PROGRESS";
    await tx.execute(sql`
      UPDATE work_items
         SET status = ${workStatus}::work_item_status,
             completed_at = CASE WHEN ${terminal} THEN COALESCE(completed_at, now()) ELSE NULL END,
             updated_at = now()
       WHERE id = ${current.workItemId}::uuid
    `);
    await appendChronologyTx(tx, input.incidentId, `STATE_${input.state}`, input.actorUserId, note || resolutionSummary || `Incident moved to ${input.state}.`, {
      previousState: current.state,
      nextState: input.state,
      rootCauseRecorded: Boolean(rootCauseSummary),
    });
    await appendWorkHistoryTx(tx, current.workItemId, "INCIDENT_STATE_CHANGED", input.actorUserId, { incidentId: input.incidentId, previousState: current.state, nextState: input.state });
  });
}

export async function updateIncidentImpact(actorUserId: string, incidentId: string, affectedTraderCount: number): Promise<void> {
  await requireIncidentCommander(actorUserId, incidentId);
  const count = Math.max(0, Math.trunc(affectedTraderCount));
  await db.transaction(async (tx) => {
    await lockIncidentTx(tx, incidentId);
    await tx.execute(sql`UPDATE operations_incidents SET affected_trader_count = ${count}, updated_at = now() WHERE id = ${incidentId}::uuid`);
    await appendChronologyTx(tx, incidentId, "IMPACT_UPDATED", actorUserId, "Affected trader estimate updated.", { affectedTraderCount: count });
  });
}

export async function setIncidentCommunicationState(input: {
  actorUserId: string;
  incidentId: string;
  state: IncidentCommunicationState;
  releaseEvidenceRef?: string | null;
}): Promise<void> {
  const actor = await requireActiveStaff(input.actorUserId);
  await requireIncidentCommander(input.actorUserId, input.incidentId);
  const evidence = cleanOptional(input.releaseEvidenceRef, 500);
  if (input.state === "RELEASED" && actor.role !== "OWNER") throw new Error("Only Owner oversight may record externally released incident communication");
  if (input.state === "RELEASED" && !evidence) throw new Error("Released communication requires external release evidence");
  await db.transaction(async (tx) => {
    await lockIncidentTx(tx, input.incidentId);
    await tx.execute(sql`
      UPDATE operations_incidents
         SET communication_state = ${input.state}::incident_communication_state,
             communication_release_evidence_ref = CASE WHEN ${input.state === "RELEASED"} THEN ${evidence} ELSE NULL END,
             updated_at = now()
       WHERE id = ${input.incidentId}::uuid
    `);
    await appendChronologyTx(tx, input.incidentId, "COMMUNICATION_STATE_CHANGED", input.actorUserId, "Incident communication state changed.", {
      state: input.state,
      releaseEvidenceRef: input.state === "RELEASED" ? evidence : null,
    });
  });
}

export async function linkSupportCase(actorUserId: string, incidentId: string, caseId: string): Promise<void> {
  await requireIncidentVisibility(actorUserId, incidentId);
  await db.transaction(async (tx) => {
    await lockIncidentTx(tx, incidentId);
    await requireSupportCaseVisibilityTx(tx, actorUserId, caseId);
    await tx.execute(sql`
      INSERT INTO operations_incident_case_links (incident_id, case_id, linked_by_user_id)
      VALUES (${incidentId}::uuid, ${caseId}::uuid, ${actorUserId}::uuid)
      ON CONFLICT DO NOTHING
    `);
    await appendChronologyTx(tx, incidentId, "SUPPORT_CASE_LINKED", actorUserId, "A related trader support case was linked.", { caseId });
  });
}

export async function createPreventionAction(input: {
  actorUserId: string;
  incidentId: string;
  title: string;
  nextAction: string;
  ownerUserId?: string | null;
  dueAt?: Date | null;
}): Promise<string> {
  await requireIncidentCommander(input.actorUserId, input.incidentId);
  if (input.ownerUserId) await requireActiveStaff(input.ownerUserId);
  const title = clean(input.title, 2, 180, "Prevention action title");
  const nextAction = clean(input.nextAction, 2, 500, "Next action");
  return db.transaction(async (tx) => {
    const incident = await lockIncidentTx(tx, input.incidentId);
    const queueResult = await tx.execute(sql`SELECT id::text AS id FROM work_queues WHERE queue_key = 'OPERATIONS' AND active = TRUE LIMIT 1`);
    const queueId = rows<{ id: string }>(queueResult)[0]?.id;
    if (!queueId) throw new Error("Operations queue is unavailable");
    const result = await tx.execute(sql`
      INSERT INTO work_items (work_type, title, context, next_action, queue_id, owner_user_id, priority, status, due_at, source_conversation_id, created_by_user_id)
      VALUES ('TASK', ${title}, ${`Prevention action from incident ${input.incidentId}`}, ${nextAction}, ${queueId}::uuid,
              ${input.ownerUserId ?? null}::uuid, 'HIGH', ${input.ownerUserId ? "READY" : "INBOX"}::work_item_status,
              ${input.dueAt ?? null}, ${incident.conversationId}::uuid, ${input.actorUserId}::uuid)
      RETURNING id::text
    `);
    const workItemId = rows<{ id: string }>(result)[0]?.id;
    if (!workItemId) throw new Error("Prevention action could not be created");
    await appendWorkHistoryTx(tx, workItemId, "PREVENTION_ACTION_CREATED", input.actorUserId, { incidentId: input.incidentId });
    await appendChronologyTx(tx, input.incidentId, "PREVENTION_ACTION_CREATED", input.actorUserId, "A prevention action was created in Work.", { workItemId });
    return workItemId;
  });
}

export async function recordServiceSignal(input: {
  actorUserId: string;
  signalKey: string;
  serviceKey: string;
  signalKind: string;
  severityHint?: IncidentSeverity | null;
  evidenceRef: string;
  observedCount?: number;
}): Promise<string> {
  await requireActiveStaff(input.actorUserId);
  const signalKey = clean(input.signalKey, 2, 160, "Signal key");
  const serviceKey = clean(input.serviceKey, 2, 120, "Service key");
  const signalKind = clean(input.signalKind, 2, 120, "Signal kind");
  const evidenceRef = clean(input.evidenceRef, 2, 500, "Signal evidence");
  const observedCount = Math.max(1, Math.trunc(input.observedCount ?? 1));
  const result = await db.execute(sql`
    INSERT INTO operations_service_signals (signal_key, service_key, signal_kind, severity_hint, observed_count, evidence_ref)
    VALUES (${signalKey}, ${serviceKey}, ${signalKind}, ${input.severityHint ?? null}::incident_severity, ${observedCount}, ${evidenceRef})
    ON CONFLICT (signal_key, evidence_ref) DO UPDATE SET
      observed_count = operations_service_signals.observed_count + EXCLUDED.observed_count,
      last_observed_at = now(),
      severity_hint = COALESCE(EXCLUDED.severity_hint, operations_service_signals.severity_hint)
    RETURNING id::text
  `);
  const id = rows<{ id: string }>(result)[0]?.id;
  if (!id) throw new Error("Service signal could not be recorded");
  return id;
}

export async function listServiceSignals(userId: string, limit = 50): Promise<ServiceSignal[]> {
  await requireActiveStaff(userId);
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const result = await db.execute(sql`
    SELECT id::text AS id, signal_key AS "signalKey", service_key AS "serviceKey", signal_kind AS "signalKind",
           severity_hint::text AS "severityHint", observed_count AS "observedCount", first_observed_at AS "firstObservedAt",
           last_observed_at AS "lastObservedAt", evidence_ref AS "evidenceRef", proposed_incident_id::text AS "proposedIncidentId"
      FROM operations_service_signals
     ORDER BY last_observed_at DESC, observed_count DESC
     LIMIT ${safeLimit}
  `);
  return rows<ServiceSignal>(result).map((item) => ({ ...item, observedCount: Number(item.observedCount) }));
}

const allowedTransitions: Record<IncidentState, IncidentState[]> = {
  DETECTED: ["INVESTIGATING", "CLOSED"],
  INVESTIGATING: ["MITIGATING", "MONITORING", "RESOLVED", "CLOSED"],
  MITIGATING: ["MONITORING", "RESOLVED", "CLOSED"],
  MONITORING: ["INVESTIGATING", "MITIGATING", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED", "INVESTIGATING"],
  CLOSED: [],
};

function isAllowedTransition(current: IncidentState, next: IncidentState): boolean {
  return current === next || allowedTransitions[current].includes(next);
}

function priorityForSeverity(severity: IncidentSeverity): "CRITICAL" | "URGENT" | "HIGH" | "NORMAL" {
  if (severity === "SEV1") return "CRITICAL";
  if (severity === "SEV2") return "URGENT";
  if (severity === "SEV3") return "HIGH";
  return "NORMAL";
}

function defaultSla(severity: IncidentSeverity): Date {
  const minutes = severity === "SEV1" ? 15 : severity === "SEV2" ? 30 : severity === "SEV3" ? 120 : 480;
  return new Date(Date.now() + minutes * 60_000);
}

async function requireActiveStaff(userId: string): Promise<{ id: string; role: string }> {
  const result = await db.execute(sql`SELECT id::text AS id, role::text AS role FROM users WHERE id = ${userId}::uuid AND active = TRUE LIMIT 1`);
  const actor = rows<{ id: string; role: string }>(result)[0];
  if (!actor) throw new Error("Active staff authority is required");
  return actor;
}

async function requireIncidentVisibility(userId: string, incidentId: string): Promise<void> {
  const actor = await requireActiveStaff(userId);
  const result = await db.execute(sql`
    SELECT 1
      FROM operations_incidents i
     WHERE i.id = ${incidentId}::uuid
       AND (
         ${actor.role === "OWNER"} = TRUE
         OR i.commander_user_id = ${userId}::uuid
         OR EXISTS (SELECT 1 FROM operations_incident_responders r WHERE r.incident_id = i.id AND r.user_id = ${userId}::uuid)
         OR EXISTS (SELECT 1 FROM work_collaborators wc WHERE wc.work_item_id = i.work_item_id AND wc.user_id = ${userId}::uuid)
       )
     LIMIT 1
  `);
  if (!rows(result)[0]) throw new Error("Incident is unavailable");
}

async function requireIncidentCommander(userId: string, incidentId: string): Promise<void> {
  const actor = await requireActiveStaff(userId);
  const result = await db.execute(sql`SELECT commander_user_id::text AS "commanderUserId" FROM operations_incidents WHERE id = ${incidentId}::uuid LIMIT 1`);
  const incident = rows<{ commanderUserId: string }>(result)[0];
  if (!incident || (actor.role !== "OWNER" && incident.commanderUserId !== userId)) throw new Error("Incident commander authority is required");
}

async function lockIncidentTx(tx: any, incidentId: string): Promise<{ workItemId: string; conversationId: string; state: string }> {
  const result = await tx.execute(sql`
    SELECT work_item_id::text AS "workItemId", conversation_id::text AS "conversationId", state::text AS state
      FROM operations_incidents WHERE id = ${incidentId}::uuid FOR UPDATE
  `);
  const incident = rows<{ workItemId: string; conversationId: string; state: string }>(result)[0];
  if (!incident) throw new Error("Incident is unavailable");
  return incident;
}

async function requireSupportCaseVisibilityTx(tx: any, userId: string, caseId: string): Promise<void> {
  const actorResult = await tx.execute(sql`SELECT role::text AS role FROM users WHERE id = ${userId}::uuid AND active = TRUE LIMIT 1`);
  const role = rows<{ role: string }>(actorResult)[0]?.role;
  if (!role) throw new Error("Active staff authority is required");
  const result = await tx.execute(sql`
    SELECT 1
      FROM trader_support_cases c
      JOIN work_items w ON w.id = c.work_item_id
     WHERE c.id = ${caseId}::uuid
       AND (
         ${role === "OWNER"} = TRUE
         OR w.owner_user_id = ${userId}::uuid
         OR w.created_by_user_id = ${userId}::uuid
         OR EXISTS (SELECT 1 FROM work_collaborators wc WHERE wc.work_item_id = w.id AND wc.user_id = ${userId}::uuid)
         OR (w.owner_user_id IS NULL AND w.status NOT IN ('DONE','CANCELLED'))
       )
     LIMIT 1
  `);
  if (!rows(result)[0]) throw new Error("Support case is unavailable");
}

async function appendChronology(incidentId: string, eventType: string, actorUserId: string, note: string, metadata: Record<string, unknown>) {
  await db.execute(sql`
    INSERT INTO operations_incident_chronology (incident_id, event_type, actor_user_id, note, metadata)
    VALUES (${incidentId}::uuid, ${eventType}, ${actorUserId}::uuid, ${note}, CAST(${JSON.stringify(metadata)} AS jsonb))
  `);
}

async function appendChronologyTx(tx: any, incidentId: string, eventType: string, actorUserId: string, note: string, metadata: Record<string, unknown>) {
  await tx.execute(sql`
    INSERT INTO operations_incident_chronology (incident_id, event_type, actor_user_id, note, metadata)
    VALUES (${incidentId}::uuid, ${eventType}, ${actorUserId}::uuid, ${note}, CAST(${JSON.stringify(metadata)} AS jsonb))
  `);
}

async function appendWorkHistoryTx(tx: any, workItemId: string, eventType: string, actorUserId: string, metadata: Record<string, unknown>) {
  await tx.execute(sql`
    INSERT INTO work_history (work_item_id, event_type, actor_user_id, metadata)
    VALUES (${workItemId}::uuid, ${eventType}, ${actorUserId}::uuid, CAST(${JSON.stringify(metadata)} AS jsonb))
  `);
}

async function auditTx(tx: any, action: string, actorUserId: string, targetId: string, metadata: Record<string, unknown>) {
  await tx.execute(sql`
    INSERT INTO audit_logs (action, entity_type, entity_id, actor_type, actor_id, metadata)
    VALUES (${action}, 'operations_incident', ${targetId}, 'STAFF', ${actorUserId}, CAST(${JSON.stringify(metadata)} AS jsonb))
  `);
}

function normalizeIncident(item: IncidentSummary): IncidentSummary {
  return { ...item, affectedTraderCount: Number(item.affectedTraderCount), linkedCaseCount: Number(item.linkedCaseCount), responderCount: Number(item.responderCount) };
}

function clean(value: string, min: number, max: number, label: string): string {
  const result = value.trim();
  if (result.length < min || result.length > max) throw new Error(`${label} must be between ${min} and ${max} characters`);
  return result;
}

function cleanOptional(value: string | null | undefined, max: number): string {
  const result = (value ?? "").trim();
  if (result.length > max) throw new Error(`Text must be at most ${max} characters`);
  return result;
}

function rows<T = Record<string, unknown>>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? []);
}
