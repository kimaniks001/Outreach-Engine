import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type IncidentSeverity = "SEV1" | "SEV2" | "SEV3" | "SEV4";
export type IncidentState = "DETECTED" | "INVESTIGATING" | "MITIGATING" | "MONITORING" | "RESOLVED" | "CLOSED";
export type IncidentCommunicationState = "INTERNAL_ONLY" | "DRAFTED" | "AWAITING_APPROVAL" | "RELEASED";

export interface IncidentSummary {
  id: string; title: string; summary: string; severity: IncidentSeverity; state: IncidentState;
  commanderUserId: string; commanderName: string; affectedService: string; affectedTraderCount: number;
  communicationState: IncidentCommunicationState; detectedAt: Date; resolvedAt: Date | null;
  workItemId: string; conversationId: string; linkedCaseCount: number; responderCount: number;
}
export interface IncidentChronologyEntry { id: string; eventType: string; actorName: string | null; note: string; metadata: Record<string, unknown>; createdAt: Date; }
export interface ServiceSignal { id: string; signalKey: string; serviceKey: string; signalKind: string; severityHint: IncidentSeverity | null; observedCount: number; firstObservedAt: Date; lastObservedAt: Date; evidenceRef: string; proposedIncidentId: string | null; }

type Tx = Pick<typeof db, "execute">;

export async function openIncident(input: { actorUserId: string; title: string; summary?: string; severity: IncidentSeverity; affectedService: string; commanderUserId?: string; affectedTraderCount?: number; }): Promise<string> {
  const actor = await requireActiveStaff(input.actorUserId);
  const commanderId = input.commanderUserId ?? input.actorUserId;
  await requireActiveStaff(commanderId);
  const title = clean(input.title, 2, 180, "Incident title");
  const summary = cleanOptional(input.summary, 4000);
  const service = clean(input.affectedService, 2, 120, "Affected service");
  const affected = nonNegativeInteger(input.affectedTraderCount ?? 0, "Affected trader count");
  return db.transaction(async (tx) => {
    const room = one<{ id: string }>(await tx.execute(sql`INSERT INTO staff_conversations (type,title,created_by_user_id) VALUES ('GROUP',${`Incident · ${title}`},${input.actorUserId}::uuid) RETURNING id::text`));
    if (!room) throw new Error("Incident room could not be created");
    const members = Array.from(new Set([input.actorUserId, commanderId]));
    for (const memberId of members) await tx.execute(sql`INSERT INTO staff_conversation_members (conversation_id,user_id,member_role) VALUES (${room.id}::uuid,${memberId}::uuid,${memberId === commanderId ? "OWNER" : "MEMBER"}::conversation_member_role) ON CONFLICT DO NOTHING`);
    const queue = one<{ id: string }>(await tx.execute(sql`SELECT id::text AS id FROM work_queues WHERE queue_key='OPERATIONS' AND active=TRUE LIMIT 1`));
    if (!queue) throw new Error("Operations queue is unavailable");
    const work = one<{ id: string }>(await tx.execute(sql`
      INSERT INTO work_items (work_type,title,context,next_action,queue_id,owner_user_id,priority,status,sla_due_at,source_conversation_id,created_by_user_id,routing_reason)
      VALUES ('INCIDENT',${title},${summary},'Coordinate the incident and keep chronology current.',${queue.id}::uuid,${commanderId}::uuid,${priorityFor(input.severity)}::work_priority,'IN_PROGRESS',${defaultSla(input.severity)},${room.id}::uuid,${input.actorUserId}::uuid,'Incident commander selected explicitly at declaration.') RETURNING id::text`));
    if (!work) throw new Error("Incident work item could not be created");
    const incident = one<{ id: string }>(await tx.execute(sql`
      INSERT INTO operations_incidents (work_item_id,conversation_id,title,summary,severity,state,commander_user_id,affected_service,affected_trader_count,created_by_user_id)
      VALUES (${work.id}::uuid,${room.id}::uuid,${title},${summary},${input.severity}::incident_severity,'DETECTED',${commanderId}::uuid,${service},${affected},${input.actorUserId}::uuid) RETURNING id::text`));
    if (!incident) throw new Error("Incident could not be created");
    for (const memberId of members) {
      await tx.execute(sql`INSERT INTO operations_incident_responders (incident_id,user_id,added_by_user_id) VALUES (${incident.id}::uuid,${memberId}::uuid,${input.actorUserId}::uuid) ON CONFLICT DO NOTHING`);
      if (memberId !== commanderId) await tx.execute(sql`INSERT INTO work_collaborators (work_item_id,user_id,added_by_user_id) VALUES (${work.id}::uuid,${memberId}::uuid,${input.actorUserId}::uuid) ON CONFLICT DO NOTHING`);
    }
    await chronologyTx(tx, incident.id, "INCIDENT_DETECTED", input.actorUserId, "Incident declared in Outreach.", { severity: input.severity, affectedService: service, affectedTraderCount: affected, commanderUserId: commanderId });
    await workHistoryTx(tx, work.id, "INCIDENT_DECLARED", input.actorUserId, { incidentId: incident.id, severity: input.severity });
    await auditTx(tx, "INCIDENT_DECLARED", input.actorUserId, incident.id, { severity: input.severity, affectedService: service, actorRole: actor.role });
    return incident.id;
  });
}

export async function listVisibleIncidents(userId: string): Promise<IncidentSummary[]> {
  const actor = await requireActiveStaff(userId);
  const result = await db.execute(sql`
    SELECT i.id::text AS id,i.title,i.summary,i.severity::text AS severity,i.state::text AS state,i.commander_user_id::text AS "commanderUserId",u.name AS "commanderName",i.affected_service AS "affectedService",i.affected_trader_count AS "affectedTraderCount",i.communication_state::text AS "communicationState",i.detected_at AS "detectedAt",i.resolved_at AS "resolvedAt",i.work_item_id::text AS "workItemId",i.conversation_id::text AS "conversationId",
      (SELECT count(*)::int FROM operations_incident_case_links l WHERE l.incident_id=i.id) AS "linkedCaseCount",
      (SELECT count(*)::int FROM operations_incident_responders r WHERE r.incident_id=i.id) AS "responderCount"
    FROM operations_incidents i JOIN users u ON u.id=i.commander_user_id
    WHERE ${actor.role === "OWNER"}=TRUE OR i.commander_user_id=${userId}::uuid OR EXISTS (SELECT 1 FROM operations_incident_responders r WHERE r.incident_id=i.id AND r.user_id=${userId}::uuid)
    ORDER BY CASE i.severity WHEN 'SEV1' THEN 0 WHEN 'SEV2' THEN 1 WHEN 'SEV3' THEN 2 ELSE 3 END,CASE WHEN i.state IN ('RESOLVED','CLOSED') THEN 1 ELSE 0 END,i.detected_at DESC`);
  return rows<IncidentSummary>(result).map((i) => ({ ...i, affectedTraderCount: Number(i.affectedTraderCount), linkedCaseCount: Number(i.linkedCaseCount), responderCount: Number(i.responderCount) }));
}

export async function getIncident(userId: string, incidentId: string): Promise<IncidentSummary> {
  const incident = (await listVisibleIncidents(userId)).find((i) => i.id === incidentId);
  if (!incident) throw new Error("Incident is unavailable");
  return incident;
}

export async function listIncidentChronology(userId: string, incidentId: string): Promise<IncidentChronologyEntry[]> {
  await requireIncidentVisibility(userId, incidentId);
  return rows<IncidentChronologyEntry>(await db.execute(sql`SELECT c.id::text AS id,c.event_type AS "eventType",u.name AS "actorName",c.note,c.metadata,c.created_at AS "createdAt" FROM operations_incident_chronology c LEFT JOIN users u ON u.id=c.actor_user_id WHERE c.incident_id=${incidentId}::uuid ORDER BY c.created_at,c.id`)).map((e) => ({ ...e, metadata: e.metadata ?? {} }));
}

export async function addIncidentNote(userId: string, incidentId: string, note: string): Promise<void> {
  await requireIncidentVisibility(userId, incidentId);
  await db.execute(sql`INSERT INTO operations_incident_chronology (incident_id,event_type,actor_user_id,note) VALUES (${incidentId}::uuid,'NOTE',${userId}::uuid,${clean(note,1,4000,"Chronology note")})`);
}

export async function addIncidentResponder(actorUserId: string, incidentId: string, responderUserId: string): Promise<void> {
  await requireIncidentCommander(actorUserId, incidentId); await requireActiveStaff(responderUserId);
  await db.transaction(async (tx) => {
    const current = await lockIncidentTx(tx, incidentId);
    const inserted = one(await tx.execute(sql`INSERT INTO operations_incident_responders (incident_id,user_id,added_by_user_id) VALUES (${incidentId}::uuid,${responderUserId}::uuid,${actorUserId}::uuid) ON CONFLICT DO NOTHING RETURNING 1 AS inserted`));
    if (!inserted) return;
    await tx.execute(sql`INSERT INTO staff_conversation_members (conversation_id,user_id,member_role) VALUES (${current.conversationId}::uuid,${responderUserId}::uuid,'MEMBER') ON CONFLICT DO NOTHING`);
    await tx.execute(sql`INSERT INTO work_collaborators (work_item_id,user_id,added_by_user_id) VALUES (${current.workItemId}::uuid,${responderUserId}::uuid,${actorUserId}::uuid) ON CONFLICT DO NOTHING`);
    await chronologyTx(tx, incidentId, "RESPONDER_ADDED", actorUserId, "Responder joined the incident room.", { responderUserId });
  });
}

export async function transitionIncident(input: { actorUserId: string; incidentId: string; state: IncidentState; note?: string; resolutionSummary?: string; rootCauseSummary?: string; }): Promise<void> {
  await requireIncidentCommander(input.actorUserId, input.incidentId);
  const resolution = cleanOptional(input.resolutionSummary, 4000); const rootCause = cleanOptional(input.rootCauseSummary, 4000); const note = cleanOptional(input.note, 4000);
  const terminal = input.state === "RESOLVED" || input.state === "CLOSED";
  if (terminal && !resolution) throw new Error("A resolution summary is required before resolving an incident");
  await db.transaction(async (tx) => {
    const current = await lockIncidentTx(tx, input.incidentId);
    if (!allowedTransitions[current.state as IncidentState].includes(input.state) && current.state !== input.state) throw new Error("Incident transition is not allowed");
    await tx.execute(sql`UPDATE operations_incidents SET state=${input.state}::incident_state,resolution_summary=CASE WHEN ${terminal} THEN ${resolution} ELSE resolution_summary END,root_cause_summary=CASE WHEN ${terminal} THEN NULLIF(${rootCause},'') ELSE root_cause_summary END,resolved_at=CASE WHEN ${terminal} THEN now() ELSE NULL END,closed_at=CASE WHEN ${input.state === "CLOSED"} THEN now() ELSE closed_at END,updated_at=now() WHERE id=${input.incidentId}::uuid`);
    await tx.execute(sql`UPDATE work_items SET status=${terminal ? "DONE" : "IN_PROGRESS"}::work_item_status,completed_at=CASE WHEN ${terminal} THEN COALESCE(completed_at,now()) ELSE NULL END,updated_at=now() WHERE id=${current.workItemId}::uuid`);
    await chronologyTx(tx, input.incidentId, `STATE_${input.state}`, input.actorUserId, note || resolution || `Incident moved to ${input.state}.`, { previousState: current.state, nextState: input.state, rootCauseRecorded: Boolean(rootCause) });
    await workHistoryTx(tx, current.workItemId, "INCIDENT_STATE_CHANGED", input.actorUserId, { incidentId: input.incidentId, previousState: current.state, nextState: input.state });
  });
}

export async function updateIncidentImpact(actorUserId: string, incidentId: string, affectedTraderCount: number): Promise<void> {
  await requireIncidentCommander(actorUserId, incidentId); const count = nonNegativeInteger(affectedTraderCount, "Affected trader count");
  await db.transaction(async (tx) => { await lockIncidentTx(tx, incidentId); await tx.execute(sql`UPDATE operations_incidents SET affected_trader_count=${count},updated_at=now() WHERE id=${incidentId}::uuid`); await chronologyTx(tx, incidentId, "IMPACT_UPDATED", actorUserId, "Affected trader estimate updated.", { affectedTraderCount: count }); });
}

export async function setIncidentCommunicationState(input: { actorUserId: string; incidentId: string; state: IncidentCommunicationState; releaseEvidenceRef?: string | null; }): Promise<void> {
  const actor = await requireActiveStaff(input.actorUserId); await requireIncidentCommander(input.actorUserId, input.incidentId); const evidence = cleanOptional(input.releaseEvidenceRef, 500);
  if (input.state === "RELEASED" && actor.role !== "OWNER") throw new Error("Only Owner oversight may record externally released incident communication");
  if (input.state === "RELEASED" && !evidence) throw new Error("Released communication requires external release evidence");
  await db.transaction(async (tx) => { const current = await lockIncidentTx(tx, input.incidentId); if (current.communicationState === "RELEASED") { if (input.state !== "RELEASED" || current.releaseEvidenceRef !== evidence) throw new Error("Released communication evidence is immutable"); return; } await tx.execute(sql`UPDATE operations_incidents SET communication_state=${input.state}::incident_communication_state,communication_release_evidence_ref=CASE WHEN ${input.state === "RELEASED"} THEN ${evidence} ELSE NULL END,updated_at=now() WHERE id=${input.incidentId}::uuid`); await chronologyTx(tx,input.incidentId,"COMMUNICATION_STATE_CHANGED",input.actorUserId,"Incident communication state changed.",{ state: input.state, releaseEvidenceRef: input.state === "RELEASED" ? evidence : null }); });
}

export async function linkSupportCase(actorUserId: string, incidentId: string, caseId: string): Promise<void> {
  await requireIncidentVisibility(actorUserId, incidentId);
  await db.transaction(async (tx) => { await lockIncidentTx(tx,incidentId); await requireSupportCaseVisibilityTx(tx,actorUserId,caseId); const inserted=one(await tx.execute(sql`INSERT INTO operations_incident_case_links (incident_id,case_id,linked_by_user_id) VALUES (${incidentId}::uuid,${caseId}::uuid,${actorUserId}::uuid) ON CONFLICT DO NOTHING RETURNING 1 AS inserted`)); if(!inserted)return; await chronologyTx(tx,incidentId,"SUPPORT_CASE_LINKED",actorUserId,"A related trader support case was linked.",{ caseId }); });
}

export async function createPreventionAction(input: { actorUserId: string; incidentId: string; title: string; nextAction: string; ownerUserId?: string | null; dueAt?: Date | null; }): Promise<string> {
  await requireIncidentCommander(input.actorUserId,input.incidentId); if (input.ownerUserId) await requireActiveStaff(input.ownerUserId);
  const title = clean(input.title,2,180,"Prevention action title"); const next = clean(input.nextAction,2,500,"Next action");
  return db.transaction(async (tx) => { const incident = await lockIncidentTx(tx,input.incidentId); const queue = one<{id:string}>(await tx.execute(sql`SELECT id::text AS id FROM work_queues WHERE queue_key='OPERATIONS' AND active=TRUE LIMIT 1`)); if (!queue) throw new Error("Operations queue is unavailable"); const work = one<{id:string}>(await tx.execute(sql`INSERT INTO work_items (work_type,title,context,next_action,queue_id,owner_user_id,priority,status,due_at,source_conversation_id,created_by_user_id) VALUES ('TASK',${title},${`Prevention action from incident ${input.incidentId}`},${next},${queue.id}::uuid,${input.ownerUserId ?? null}::uuid,'HIGH',${input.ownerUserId ? "READY" : "INBOX"}::work_item_status,${input.dueAt ?? null},${incident.conversationId}::uuid,${input.actorUserId}::uuid) RETURNING id::text`)); if (!work) throw new Error("Prevention action could not be created"); await workHistoryTx(tx,work.id,"PREVENTION_ACTION_CREATED",input.actorUserId,{incidentId:input.incidentId}); await chronologyTx(tx,input.incidentId,"PREVENTION_ACTION_CREATED",input.actorUserId,"A prevention action was created in Work.",{workItemId:work.id}); return work.id; });
}

export async function recordServiceSignal(input: { actorUserId: string; signalKey: string; serviceKey: string; signalKind: string; severityHint?: IncidentSeverity | null; evidenceRef: string; observedCount?: number; }): Promise<string> {
  await requireActiveStaff(input.actorUserId); const count=positiveInteger(input.observedCount??1,"Observed count");
  const item=one<{id:string}>(await db.execute(sql`INSERT INTO operations_service_signals (signal_key,service_key,signal_kind,severity_hint,observed_count,evidence_ref) VALUES (${clean(input.signalKey,2,160,"Signal key")},${clean(input.serviceKey,2,120,"Service key")},${clean(input.signalKind,2,120,"Signal kind")},${input.severityHint??null}::incident_severity,${count},${clean(input.evidenceRef,2,500,"Signal evidence")}) ON CONFLICT (signal_key,evidence_ref) DO UPDATE SET observed_count=operations_service_signals.observed_count+EXCLUDED.observed_count,last_observed_at=now(),severity_hint=COALESCE(EXCLUDED.severity_hint,operations_service_signals.severity_hint) RETURNING id::text`)); if(!item) throw new Error("Service signal could not be recorded"); return item.id;
}

export async function listServiceSignals(userId: string, limit=50): Promise<ServiceSignal[]> { await requireActiveStaff(userId); const safe=Math.min(Math.max(Math.trunc(limit),1),100); return rows<ServiceSignal>(await db.execute(sql`SELECT id::text AS id,signal_key AS "signalKey",service_key AS "serviceKey",signal_kind AS "signalKind",severity_hint::text AS "severityHint",observed_count AS "observedCount",first_observed_at AS "firstObservedAt",last_observed_at AS "lastObservedAt",evidence_ref AS "evidenceRef",proposed_incident_id::text AS "proposedIncidentId" FROM operations_service_signals ORDER BY last_observed_at DESC,observed_count DESC LIMIT ${safe}`)).map((s)=>({...s,observedCount:Number(s.observedCount)})); }

const allowedTransitions: Record<IncidentState,IncidentState[]>={DETECTED:["INVESTIGATING","CLOSED"],INVESTIGATING:["MITIGATING","MONITORING","RESOLVED","CLOSED"],MITIGATING:["MONITORING","RESOLVED","CLOSED"],MONITORING:["INVESTIGATING","MITIGATING","RESOLVED","CLOSED"],RESOLVED:["CLOSED","INVESTIGATING"],CLOSED:[]};
function priorityFor(s:IncidentSeverity){return s==="SEV1"?"CRITICAL":s==="SEV2"?"URGENT":s==="SEV3"?"HIGH":"NORMAL";}
function defaultSla(s:IncidentSeverity){const m=s==="SEV1"?15:s==="SEV2"?30:s==="SEV3"?120:480;return new Date(Date.now()+m*60000);}
async function requireActiveStaff(userId:string){const actor=one<{id:string;role:string}>(await db.execute(sql`SELECT id::text AS id,role::text AS role FROM users WHERE id=${userId}::uuid AND active=TRUE LIMIT 1`));if(!actor)throw new Error("Active staff authority is required");return actor;}
async function requireIncidentVisibility(userId:string,incidentId:string){const actor=await requireActiveStaff(userId);const found=one(await db.execute(sql`SELECT 1 FROM operations_incidents i WHERE i.id=${incidentId}::uuid AND (${actor.role==="OWNER"}=TRUE OR i.commander_user_id=${userId}::uuid OR EXISTS(SELECT 1 FROM operations_incident_responders r WHERE r.incident_id=i.id AND r.user_id=${userId}::uuid)) LIMIT 1`));if(!found)throw new Error("Incident is unavailable");}
async function requireIncidentCommander(userId:string,incidentId:string){const actor=await requireActiveStaff(userId);const i=one<{commanderUserId:string}>(await db.execute(sql`SELECT commander_user_id::text AS "commanderUserId" FROM operations_incidents WHERE id=${incidentId}::uuid LIMIT 1`));if(!i||(actor.role!=="OWNER"&&i.commanderUserId!==userId))throw new Error("Incident commander authority is required");}
async function lockIncidentTx(tx:Tx,incidentId:string){const i=one<{workItemId:string;conversationId:string;state:string;communicationState:IncidentCommunicationState;releaseEvidenceRef:string|null}>(await tx.execute(sql`SELECT work_item_id::text AS "workItemId",conversation_id::text AS "conversationId",state::text AS state,communication_state::text AS "communicationState",communication_release_evidence_ref AS "releaseEvidenceRef" FROM operations_incidents WHERE id=${incidentId}::uuid FOR UPDATE`));if(!i)throw new Error("Incident is unavailable");return i;}
async function requireSupportCaseVisibilityTx(tx:Tx,userId:string,caseId:string){const actor=one<{role:string}>(await tx.execute(sql`SELECT role::text AS role FROM users WHERE id=${userId}::uuid AND active=TRUE LIMIT 1`));if(!actor)throw new Error("Active staff authority is required");const found=one(await tx.execute(sql`SELECT 1 FROM trader_support_cases c JOIN work_items w ON w.id=c.work_item_id WHERE c.id=${caseId}::uuid AND (${actor.role==="OWNER"}=TRUE OR w.owner_user_id=${userId}::uuid OR w.created_by_user_id=${userId}::uuid OR EXISTS(SELECT 1 FROM work_collaborators wc WHERE wc.work_item_id=w.id AND wc.user_id=${userId}::uuid) OR (w.owner_user_id IS NULL AND w.status NOT IN ('DONE','CANCELLED'))) LIMIT 1`));if(!found)throw new Error("Support case is unavailable");}
async function chronologyTx(tx:Tx,incidentId:string,eventType:string,actorUserId:string,note:string,metadata:Record<string,unknown>){await tx.execute(sql`INSERT INTO operations_incident_chronology (incident_id,event_type,actor_user_id,note,metadata) VALUES (${incidentId}::uuid,${eventType},${actorUserId}::uuid,${note},CAST(${JSON.stringify(metadata)} AS jsonb))`);}
async function workHistoryTx(tx:Tx,workId:string,eventType:string,actorUserId:string,metadata:Record<string,unknown>){await tx.execute(sql`INSERT INTO work_history (work_item_id,event_type,actor_user_id,metadata) VALUES (${workId}::uuid,${eventType},${actorUserId}::uuid,CAST(${JSON.stringify(metadata)} AS jsonb))`);}
async function auditTx(tx:Tx,eventType:string,actorUserId:string,targetId:string,metadata:Record<string,unknown>){await tx.execute(sql`INSERT INTO audit_events (event_type,actor_user_id,target_type,target_id,metadata) VALUES (${eventType},${actorUserId}::uuid,'operations_incident',${targetId},CAST(${JSON.stringify(metadata)} AS jsonb))`);}
function clean(v:string,min:number,max:number,label:string){const x=v.trim();if(x.length<min||x.length>max)throw new Error(`${label} must be between ${min} and ${max} characters`);return x;}
function cleanOptional(v:string|null|undefined,max:number){const x=(v??"").trim();if(x.length>max)throw new Error(`Text must be at most ${max} characters`);return x;}
function nonNegativeInteger(v:number,label:string){if(!Number.isSafeInteger(v)||v<0)throw new Error(`${label} must be a non-negative integer`);return v;}
function positiveInteger(v:number,label:string){if(!Number.isSafeInteger(v)||v<1)throw new Error(`${label} must be a positive integer`);return v;}
function rows<T=Record<string,unknown>>(r:unknown):T[]{return((r as {rows?:T[]}).rows??[]);} function one<T=Record<string,unknown>>(r:unknown):T|undefined{return rows<T>(r)[0];}
