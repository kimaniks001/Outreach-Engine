import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createActionDraft, createStaffCircle, sendMessage } from "@/lib/conversations/staff-conversations";
import {
  addCollaborator,
  addDependency,
  claimWorkItem,
  convertConversationDraftToWork,
  createWorkItem,
  getWorkItem,
  listWorkHistory,
  listWorkItems,
  routeWorkItem,
  updateRoutingProfile,
  updateWorkStatus,
} from "@/lib/work/work-engine";

const run = randomUUID().slice(0, 8);
let owner = "";
let strategistA = "";
let strategistB = "";
let outsider = "";
const users: string[] = [];
const workItems: string[] = [];
const conversations: string[] = [];

function resultRows<T>(result: unknown): T[] {
  return ((result as unknown as { rows?: T[] }).rows ?? []);
}

async function createStaff(name: string, role: "OWNER" | "STRATEGIST" = "STRATEGIST"): Promise<string> {
  const result = await db.execute(sql`
    INSERT INTO users (email, password_hash, name, role, active)
    VALUES (${`work-${run}-${name.toLowerCase()}@example.test`}, 'not-used', ${name}, ${role}::role, true)
    RETURNING id::text
  `);
  const id = resultRows<{ id: string }>(result)[0]?.id;
  if (!id) throw new Error("test staff creation failed");
  users.push(id);
  return id;
}

beforeAll(async () => {
  owner = await createStaff("Owner", "OWNER");
  strategistA = await createStaff("Asha");
  strategistB = await createStaff("Baraka");
  outsider = await createStaff("Outside");
});

afterAll(async () => {
  for (const id of new Set(workItems)) await db.execute(sql`DELETE FROM work_items WHERE id = ${id}::uuid`);
  for (const id of new Set(conversations)) await db.execute(sql`DELETE FROM staff_conversations WHERE id = ${id}::uuid`);
  for (const id of users) await db.execute(sql`DELETE FROM users WHERE id = ${id}::uuid`);
});

describe("True North Phase 3 work engine", () => {
  it("creates a universal responsibility object with queue, priority, SLA and append-only history", async () => {
    const id = await createWorkItem({
      actorUserId: strategistA,
      workType: "TASK",
      title: `Review trader guide ${run}`,
      context: "The guide needs a final internal pass.",
      nextAction: "Read the draft and record corrections.",
      ownerUserId: strategistA,
      priority: "HIGH",
    });
    workItems.push(id);
    const item = await getWorkItem(strategistA, id);
    expect(item.queueKey).toBe("GENERAL");
    expect(item.ownerUserId).toBe(strategistA);
    expect(item.status).toBe("READY");
    expect(item.priority).toBe("HIGH");
    expect(item.slaDueAt).toBeInstanceOf(Date);
    expect(item.nextAction).toContain("Read the draft");
    const history = await listWorkHistory(strategistA, id);
    expect(history.some((entry) => entry.eventType === "WORK_CREATED")).toBe(true);
  });

  it("routes by explainable role, language, availability and workload instead of hidden AI authority", async () => {
    await updateRoutingProfile(strategistA, { timezone: "Africa/Nairobi", languages: ["en", "sw"], available: true, maxActiveWork: 20 });
    await updateRoutingProfile(strategistB, { timezone: "Europe/London", languages: ["en"], available: true, maxActiveWork: 20 });
    const id = await createWorkItem({
      actorUserId: owner,
      workType: "TASK",
      title: `Kiswahili follow-up ${run}`,
      requiredRole: "STRATEGIST",
      requiredLanguage: "sw",
      preferredTimezone: "Africa/Nairobi",
      priority: "NORMAL",
    });
    workItems.push(id);
    const routed = await routeWorkItem(owner, id);
    expect(routed).toBe(strategistA);
    const item = await getWorkItem(owner, id);
    expect(item.routingReason).toContain("language sw");
    expect(item.routingReason).toContain("Africa/Nairobi");
    expect(item.status).toBe("READY");
  });

  it("keeps unowned work claimable but private owned work scoped to participants", async () => {
    const unowned = await createWorkItem({ actorUserId: strategistA, workType: "FOLLOW_UP", title: `Shared queue item ${run}` });
    workItems.push(unowned);
    expect((await listWorkItems(outsider)).some((item) => item.id === unowned)).toBe(true);
    await claimWorkItem(outsider, unowned);
    expect((await getWorkItem(outsider, unowned)).ownerUserId).toBe(outsider);

    const privateOwned = await createWorkItem({ actorUserId: strategistA, workType: "TASK", title: `Owned item ${run}`, ownerUserId: strategistA });
    workItems.push(privateOwned);
    await expect(getWorkItem(outsider, privateOwned)).rejects.toThrow("Work item is unavailable");
    await addCollaborator(strategistA, privateOwned, outsider);
    expect((await getWorkItem(outsider, privateOwned)).id).toBe(privateOwned);
  });

  it("prevents unresolved dependencies and dependency cycles from becoming invisible responsibility gaps", async () => {
    const blocker = await createWorkItem({ actorUserId: strategistA, workType: "TASK", title: `Blocking prerequisite ${run}`, ownerUserId: strategistA });
    const dependent = await createWorkItem({ actorUserId: strategistA, workType: "TASK", title: `Dependent work ${run}`, ownerUserId: strategistA });
    workItems.push(blocker, dependent);
    await addDependency(strategistA, dependent, blocker);
    await expect(updateWorkStatus(strategistA, dependent, "IN_PROGRESS")).rejects.toThrow("blocking dependencies");
    await expect(addDependency(strategistA, blocker, dependent)).rejects.toThrow("cycle");
    await updateWorkStatus(strategistA, blocker, "IN_PROGRESS");
    await updateWorkStatus(strategistA, blocker, "DONE");
    await updateWorkStatus(strategistA, dependent, "IN_PROGRESS");
    expect((await getWorkItem(strategistA, dependent)).status).toBe("IN_PROGRESS");
  });

  it("materializes the next scheduled instance only after recurring work completes", async () => {
    const id = await createWorkItem({
      actorUserId: strategistA,
      workType: "SCHEDULE",
      title: `Weekly market check ${run}`,
      ownerUserId: strategistA,
      scheduledFor: new Date("2026-09-03T08:00:00Z"),
      recurrenceRule: "WEEKLY",
    });
    workItems.push(id);
    await updateWorkStatus(strategistA, id, "IN_PROGRESS");
    await updateWorkStatus(strategistA, id, "DONE");
    const result = await db.execute(sql`
      SELECT id::text AS id, recurrence_rule AS "recurrenceRule", scheduled_for AS "scheduledFor", status::text AS status
        FROM work_items
       WHERE routing_reason = ${`Created from recurring work item ${id}`}
    `);
    const next = resultRows<{ id: string; recurrenceRule: string; scheduledFor: Date; status: string }>(result)[0];
    expect(next?.recurrenceRule).toBe("WEEKLY");
    expect(next?.status).toBe("READY");
    expect(next?.scheduledFor.toISOString()).toBe("2026-09-10T08:00:00.000Z");
    if (next?.id) workItems.push(next.id);
  });

  it("converts a conversation action draft exactly once and preserves its source context", async () => {
    const conversationId = await createStaffCircle(strategistA, `Work intake ${run}`, [strategistB]);
    conversations.push(conversationId);
    const messageId = await sendMessage({ userId: strategistB, conversationId, body: `Please investigate the settlement status question ${run}.` });
    await createActionDraft(strategistA, conversationId, messageId, "FOLLOW_UP");
    const draftResult = await db.execute(sql`SELECT id::text AS id FROM conversation_action_drafts WHERE conversation_id = ${conversationId}::uuid AND source_message_id = ${messageId}::uuid LIMIT 1`);
    const draftId = resultRows<{ id: string }>(draftResult)[0]?.id;
    if (!draftId) throw new Error("draft setup failed");

    const first = await convertConversationDraftToWork(strategistA, draftId);
    const replay = await convertConversationDraftToWork(strategistA, draftId);
    workItems.push(first);
    expect(replay).toBe(first);
    const item = await getWorkItem(strategistA, first);
    expect(item.sourceConversationId).toBe(conversationId);
    expect(item.sourceMessageId).toBe(messageId);
    expect(item.sourceActionDraftId).toBe(draftId);

    const raw = await db.execute(sql`SELECT status, converted_work_item_id::text AS "workItemId" FROM conversation_action_drafts WHERE id = ${draftId}::uuid`);
    expect(resultRows<{ status: string; workItemId: string }>(raw)[0]).toEqual(expect.objectContaining({ status: "CONVERTED", workItemId: first }));
    await expect(convertConversationDraftToWork(outsider, draftId)).rejects.toThrow("unavailable");
  });

  it("keeps status changes governed and terminal work terminal", async () => {
    const id = await createWorkItem({ actorUserId: strategistA, workType: "TASK", title: `Terminal transition ${run}`, ownerUserId: strategistA });
    workItems.push(id);
    await expect(updateWorkStatus(strategistA, id, "DONE")).rejects.toThrow("Invalid work transition");
    await updateWorkStatus(strategistA, id, "IN_PROGRESS");
    await updateWorkStatus(strategistA, id, "DONE");
    await expect(updateWorkStatus(strategistA, id, "READY")).rejects.toThrow("Invalid work transition");
    const item = await getWorkItem(strategistA, id);
    expect(item.status).toBe("DONE");
  });
});
