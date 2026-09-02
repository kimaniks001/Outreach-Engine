import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  addIncidentResponder,
  createPreventionAction,
  getIncident,
  linkSupportCase,
  listIncidentChronology,
  listServiceSignals,
  listVisibleIncidents,
  openIncident,
  recordServiceSignal,
  setIncidentCommunicationState,
  transitionIncident,
  updateIncidentImpact,
} from "@/lib/operations/incident-engine";
import { getOrCreateTraderConversation, openSupportCase } from "@/lib/trader-support/support-engine";

const run = randomUUID().slice(0, 8);
let owner = "";
let commander = "";
let responder = "";
let outsider = "";
const userIds: string[] = [];
const incidentIds: string[] = [];
const supportConversationIds: string[] = [];
const supportCaseIds: string[] = [];

function rows<T>(result: unknown): T[] { return ((result as { rows?: T[] }).rows ?? []); }
async function createStaff(name: string, role: "OWNER" | "STRATEGIST" = "STRATEGIST") {
  const result = await db.execute(sql`INSERT INTO users (email,password_hash,name,role,active) VALUES (${`incident-${run}-${name.toLowerCase()}@example.test`},'not-used',${name},${role}::role,true) RETURNING id::text`);
  const id = rows<{ id: string }>(result)[0]?.id;
  if (!id) throw new Error("staff setup failed");
  userIds.push(id);
  return id;
}

beforeAll(async () => {
  owner = await createStaff("Owner", "OWNER");
  commander = await createStaff("Commander");
  responder = await createStaff("Responder");
  outsider = await createStaff("Outsider");
});

afterAll(async () => {
  await db.execute(sql`DELETE FROM operations_service_signals WHERE evidence_ref LIKE ${`incident-test:${run}:%`}`);
  for (const incidentId of incidentIds) {
    const result = await db.execute(sql`SELECT work_item_id::text AS "workItemId", conversation_id::text AS "conversationId" FROM operations_incidents WHERE id=${incidentId}::uuid`);
    const item = rows<{ workItemId: string; conversationId: string }>(result)[0];
    await db.execute(sql`DELETE FROM operations_incidents WHERE id=${incidentId}::uuid`);
    if (item?.workItemId) await db.execute(sql`DELETE FROM work_items WHERE id=${item.workItemId}::uuid`);
    if (item?.conversationId) await db.execute(sql`DELETE FROM staff_conversations WHERE id=${item.conversationId}::uuid`);
  }
  for (const caseId of supportCaseIds) {
    const result = await db.execute(sql`SELECT work_item_id::text AS "workItemId" FROM trader_support_cases WHERE id=${caseId}::uuid`);
    const workItemId = rows<{ workItemId: string }>(result)[0]?.workItemId;
    await db.execute(sql`DELETE FROM trader_support_cases WHERE id=${caseId}::uuid`);
    if (workItemId) await db.execute(sql`DELETE FROM work_items WHERE id=${workItemId}::uuid`);
  }
  for (const conversationId of supportConversationIds) await db.execute(sql`DELETE FROM trader_support_conversations WHERE id=${conversationId}::uuid`);
  for (const userId of userIds) await db.execute(sql`DELETE FROM users WHERE id=${userId}::uuid`);
});

describe("True North Phase 5 incident command", () => {
  it("declares one incident with one Work responsibility, one room and chronology", async () => {
    const id = await openIncident({ actorUserId: commander, title: `Settlement delay ${run}`, summary: "A repeated operational delay is under investigation.", severity: "SEV2", affectedService: "settlement-status", affectedTraderCount: 4 });
    incidentIds.push(id);
    const incident = await getIncident(commander, id);
    expect(incident).toEqual(expect.objectContaining({ severity: "SEV2", state: "DETECTED", commanderName: "Commander", affectedTraderCount: 4, responderCount: 1 }));
    const work = rows<{ type: string; priority: string; status: string; queue: string }>(await db.execute(sql`SELECT w.work_type::text AS type,w.priority::text AS priority,w.status::text AS status,q.queue_key AS queue FROM work_items w JOIN work_queues q ON q.id=w.queue_id WHERE w.id=${incident.workItemId}::uuid`))[0];
    expect(work).toEqual({ type: "INCIDENT", priority: "URGENT", status: "IN_PROGRESS", queue: "OPERATIONS" });
    const chronology = await listIncidentChronology(commander, id);
    expect(chronology[0]?.eventType).toBe("INCIDENT_DETECTED");
  });

  it("keeps incident visibility private until a responder is deliberately added", async () => {
    const id = await openIncident({ actorUserId: commander, title: `Private incident ${run}`, severity: "SEV3", affectedService: "agreements" });
    incidentIds.push(id);
    await expect(getIncident(outsider, id)).rejects.toThrow("Incident is unavailable");
    expect((await listVisibleIncidents(outsider)).some((item) => item.id === id)).toBe(false);
    await addIncidentResponder(commander, id, responder);
    expect((await getIncident(responder, id)).id).toBe(id);
    const incident = await getIncident(commander, id);
    const roomMember = rows<{ count: number }>(await db.execute(sql`SELECT count(*)::int AS count FROM staff_conversation_members WHERE conversation_id=${incident.conversationId}::uuid AND user_id=${responder}::uuid`))[0]?.count;
    expect(Number(roomMember)).toBe(1);
  });

  it("requires a real resolution summary and respects unfinished Work dependencies", async () => {
    const id = await openIncident({ actorUserId: commander, title: `Dependency incident ${run}`, severity: "SEV3", affectedService: "activation" });
    incidentIds.push(id);
    await transitionIncident({ actorUserId: commander, incidentId: id, state: "INVESTIGATING", note: "Checking the failure boundary." });
    await expect(transitionIncident({ actorUserId: commander, incidentId: id, state: "RESOLVED" })).rejects.toThrow("resolution summary");
    const incident = await getIncident(commander, id);
    const queue = rows<{ id: string }>(await db.execute(sql`SELECT id::text AS id FROM work_queues WHERE queue_key='OPERATIONS' LIMIT 1`))[0];
    if (!queue) throw new Error("operations queue missing in test setup");
    const blocker = rows<{ id: string }>(await db.execute(sql`INSERT INTO work_items (work_type,title,queue_id,priority,status,created_by_user_id) VALUES ('TASK',${`Blocking task ${run}`},${queue.id}::uuid,'HIGH','READY',${commander}::uuid) RETURNING id::text`))[0];
    if (!blocker) throw new Error("blocking work setup failed");
    await db.execute(sql`INSERT INTO work_dependencies (work_item_id,depends_on_work_item_id,created_by_user_id) VALUES (${incident.workItemId}::uuid,${blocker.id}::uuid,${commander}::uuid)`);
    await expect(transitionIncident({ actorUserId: commander, incidentId: id, state: "RESOLVED", resolutionSummary: "Mitigation complete." })).rejects.toThrow();
    expect((await getIncident(commander, id)).state).toBe("INVESTIGATING");
    const workAfterRejectedResolution = rows<{ status: string }>(await db.execute(sql`SELECT status::text AS status FROM work_items WHERE id=${incident.workItemId}::uuid`))[0];
    expect(workAfterRejectedResolution?.status).toBe("IN_PROGRESS");
    await db.execute(sql`DELETE FROM work_dependencies WHERE work_item_id=${incident.workItemId}::uuid AND depends_on_work_item_id=${blocker.id}::uuid`);
    await db.execute(sql`DELETE FROM work_items WHERE id=${blocker.id}::uuid`);
    await transitionIncident({ actorUserId: commander, incidentId: id, state: "RESOLVED", resolutionSummary: "Mitigation complete.", rootCauseSummary: "Operational dependency was corrected." });
    expect((await getIncident(commander, id)).state).toBe("RESOLVED");
  });

  it("treats affected trader count as an operator estimate and tracks changes in chronology", async () => {
    const id = await openIncident({ actorUserId: commander, title: `Impact estimate ${run}`, severity: "SEV4", affectedService: "notifications" });
    incidentIds.push(id);
    await updateIncidentImpact(commander, id, 12);
    expect((await getIncident(commander, id)).affectedTraderCount).toBe(12);
    const chronology = await listIncidentChronology(commander, id);
    expect(chronology.some((entry) => entry.eventType === "IMPACT_UPDATED" && entry.note.includes("estimate"))).toBe(true);
  });

  it("never turns communication state into publication authority", async () => {
    const id = await openIncident({ actorUserId: commander, title: `Comms incident ${run}`, severity: "SEV3", affectedService: "securelinks" });
    incidentIds.push(id);
    await setIncidentCommunicationState({ actorUserId: commander, incidentId: id, state: "DRAFTED" });
    await expect(setIncidentCommunicationState({ actorUserId: commander, incidentId: id, state: "RELEASED", releaseEvidenceRef: `approved:${run}` })).rejects.toThrow("Owner oversight");
    await expect(setIncidentCommunicationState({ actorUserId: owner, incidentId: id, state: "RELEASED" })).rejects.toThrow("release evidence");
    await setIncidentCommunicationState({ actorUserId: owner, incidentId: id, state: "RELEASED", releaseEvidenceRef: `approved:${run}` });
    expect((await getIncident(owner, id)).communicationState).toBe("RELEASED");
    const stored = rows<{ ref: string | null }>(await db.execute(sql`SELECT communication_release_evidence_ref AS ref FROM operations_incidents WHERE id=${id}::uuid`))[0];
    expect(stored?.ref).toBe(`approved:${run}`);
  });

  it("links only support cases already visible to the incident responder", async () => {
    const id = await openIncident({ actorUserId: commander, title: `Case cluster ${run}`, severity: "SEV3", affectedService: "payments" });
    incidentIds.push(id);
    const conversation = await getOrCreateTraderConversation({ actorUserId: outsider, securepayIdentityRef: `sp-incident-case-${run}` });
    supportConversationIds.push(conversation);
    const caseId = await openSupportCase({ actorUserId: outsider, conversationId: conversation, subject: `Private trader case ${run}`, ownerUserId: outsider });
    supportCaseIds.push(caseId);
    await expect(linkSupportCase(commander, id, caseId)).rejects.toThrow("Support case is unavailable");
    await addIncidentResponder(commander, id, outsider);
    await linkSupportCase(outsider, id, caseId);
    expect((await getIncident(commander, id)).linkedCaseCount).toBe(1);
  });

  it("turns prevention into normal Operations Work and keeps service signals evidence-only", async () => {
    const id = await openIncident({ actorUserId: commander, title: `Prevention ${run}`, severity: "SEV3", affectedService: "payment-status" });
    incidentIds.push(id);
    const preventionId = await createPreventionAction({ actorUserId: commander, incidentId: id, title: `Prevent recurrence ${run}`, nextAction: "Add a bounded operational health check.", ownerUserId: responder });
    const prevention = rows<{ type: string; queue: string; owner: string }>(await db.execute(sql`SELECT w.work_type::text AS type,q.queue_key AS queue,w.owner_user_id::text AS owner FROM work_items w JOIN work_queues q ON q.id=w.queue_id WHERE w.id=${preventionId}::uuid`))[0];
    expect(prevention).toEqual({ type: "TASK", queue: "OPERATIONS", owner: responder });
    await db.execute(sql`DELETE FROM work_items WHERE id=${preventionId}::uuid`);

    const evidence = `incident-test:${run}:signal`;
    await recordServiceSignal({ actorUserId: commander, signalKey: `settlement-delay-${run}`, serviceKey: "settlement", signalKind: "repeat-failure", severityHint: "SEV2", evidenceRef: evidence, observedCount: 2 });
    await recordServiceSignal({ actorUserId: commander, signalKey: `settlement-delay-${run}`, serviceKey: "settlement", signalKind: "repeat-failure", severityHint: "SEV2", evidenceRef: evidence, observedCount: 3 });
    const signal = (await listServiceSignals(commander, 100)).find((item) => item.evidenceRef === evidence);
    expect(signal).toEqual(expect.objectContaining({ observedCount: 5, proposedIncidentId: null }));
  });
});