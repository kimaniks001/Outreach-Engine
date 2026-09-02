import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  getOrCreateTraderConversation,
  listConversationMessages,
  listFrictionSummary,
  listSupportCases,
  listSupportConversations,
  openSupportCase,
  recordGroundedSupportAnswer,
  recordStaffReply,
  recordTraderFriction,
  recordTraderMessage,
  resolveSupportCase,
  transitionSupportCase,
} from "@/lib/trader-support/support-engine";

const run = randomUUID().slice(0, 8);
let owner = "";
let support = "";
const userIds: string[] = [];
const conversationIds: string[] = [];
const caseIds: string[] = [];

function resultRows<T>(result: unknown): T[] { return ((result as { rows?: T[] }).rows ?? []); }

async function createStaff(name: string, role: "OWNER" | "STRATEGIST" = "STRATEGIST"): Promise<string> {
  const result = await db.execute(sql`
    INSERT INTO users (email, password_hash, name, role, active)
    VALUES (${`support-${run}-${name.toLowerCase()}@example.test`}, 'not-used', ${name}, ${role}::role, true)
    RETURNING id::text
  `);
  const id = resultRows<{ id: string }>(result)[0]?.id;
  if (!id) throw new Error("staff setup failed");
  userIds.push(id);
  return id;
}

beforeAll(async () => {
  owner = await createStaff("Owner", "OWNER");
  support = await createStaff("Amina");
});

afterAll(async () => {
  for (const caseId of caseIds) await db.execute(sql`DELETE FROM trader_support_cases WHERE id = ${caseId}::uuid`);
  for (const conversationId of conversationIds) await db.execute(sql`DELETE FROM trader_support_conversations WHERE id = ${conversationId}::uuid`);
  for (const userId of userIds) await db.execute(sql`DELETE FROM users WHERE id = ${userId}::uuid`);
});

describe("True North Phase 4 trader support", () => {
  it("converges one opaque SecurePay identity reference onto one continuous support conversation", async () => {
    const identityRef = `sp-id-${run}`;
    const first = await getOrCreateTraderConversation({ actorUserId: support, securepayIdentityRef: identityRef, displayLabel: "Trader" });
    const replay = await getOrCreateTraderConversation({ actorUserId: owner, securepayIdentityRef: identityRef, displayLabel: "Changed label" });
    conversationIds.push(first);
    expect(replay).toBe(first);
    const conversations = await listSupportConversations();
    const conversation = conversations.find((item) => item.id === first);
    expect(conversation?.securepayIdentityRef).toBe(identityRef);
    expect(conversation?.lastMessageAt).toBeInstanceOf(Date);
  });

  it("keeps the trader-facing thread continuous while staff messages remain internally attributable", async () => {
    const conversationId = await getOrCreateTraderConversation({ actorUserId: support, securepayIdentityRef: `sp-thread-${run}` });
    conversationIds.push(conversationId);
    await recordTraderMessage(conversationId, "I need help understanding what happens next.");
    await recordStaffReply(support, conversationId, "I am checking this with SecurePay and will keep the answer here.");
    const messages = await listConversationMessages(conversationId);
    expect(messages.map((message) => message.actorType)).toEqual(["TRADER", "STAFF"]);
    expect(messages[1]?.actorName).toBe("Amina");
    expect(messages.every((message) => message.createdAt instanceof Date)).toBe(true);
  });

  it("requires provenance before recording a grounded authoritative answer", async () => {
    const conversationId = await getOrCreateTraderConversation({ actorUserId: support, securepayIdentityRef: `sp-grounded-${run}` });
    conversationIds.push(conversationId);
    await expect(recordGroundedSupportAnswer({ actorUserId: support, conversationId, body: "Grounded answer", sourceKind: "SECUREPAY_AUTHORITATIVE", sourceRef: " " })).rejects.toThrow("Authority source reference");
    await recordGroundedSupportAnswer({ actorUserId: support, conversationId, body: "This answer is grounded in the current SecurePay projection.", sourceKind: "SECUREPAY_AUTHORITATIVE", sourceRef: `projection:${run}` });
    const messages = await listConversationMessages(conversationId);
    expect(messages.at(-1)).toEqual(expect.objectContaining({ sourceKind: "SECUREPAY_AUTHORITATIVE", sourceRef: `projection:${run}` }));
  });

  it("opens a case atomically on the universal Work Engine with queue, owner, priority and SLA", async () => {
    const conversationId = await getOrCreateTraderConversation({ actorUserId: support, securepayIdentityRef: `sp-case-${run}` });
    conversationIds.push(conversationId);
    const caseId = await openSupportCase({
      actorUserId: support,
      conversationId,
      subject: `Trader needs settlement-status guidance ${run}`,
      context: "Support needs to inspect current backend truth before answering.",
      ownerUserId: support,
      priority: "HIGH",
      nextAction: "Retrieve the current authorised SecurePay context.",
    });
    caseIds.push(caseId);
    const cases = await listSupportCases();
    const supportCase = cases.find((item) => item.id === caseId);
    expect(supportCase).toEqual(expect.objectContaining({ ownerName: "Amina", priority: "HIGH", workStatus: "READY", state: "OPEN" }));
    expect(supportCase?.slaDueAt).toBeInstanceOf(Date);

    const raw = await db.execute(sql`
      SELECT q.queue_key AS "queueKey", w.work_type::text AS "workType"
      FROM trader_support_cases c JOIN work_items w ON w.id = c.work_item_id JOIN work_queues q ON q.id = w.queue_id
      WHERE c.id = ${caseId}::uuid
    `);
    expect(resultRows<{ queueKey: string; workType: string }>(raw)[0]).toEqual({ queueKey: "TRADER_SUPPORT", workType: "CASE" });
  });

  it("keeps case lifecycle and Work responsibility synchronized", async () => {
    const conversationId = await getOrCreateTraderConversation({ actorUserId: support, securepayIdentityRef: `sp-state-${run}` });
    conversationIds.push(conversationId);
    const caseId = await openSupportCase({ actorUserId: support, conversationId, subject: `Need a human follow-up ${run}`, ownerUserId: support });
    caseIds.push(caseId);
    await transitionSupportCase(support, caseId, "WAITING_ON_TRADER");
    let current = (await listSupportCases()).find((item) => item.id === caseId);
    expect(current).toEqual(expect.objectContaining({ state: "WAITING_ON_TRADER", workStatus: "WAITING" }));
    await transitionSupportCase(support, caseId, "OPEN");
    current = (await listSupportCases()).find((item) => item.id === caseId);
    expect(current).toEqual(expect.objectContaining({ state: "OPEN", workStatus: "IN_PROGRESS" }));
  });

  it("does not permit an authoritative-context resolution without an authority source reference", async () => {
    const conversationId = await getOrCreateTraderConversation({ actorUserId: support, securepayIdentityRef: `sp-resolve-${run}` });
    conversationIds.push(conversationId);
    const caseId = await openSupportCase({ actorUserId: support, conversationId, subject: `Authoritative resolution ${run}`, ownerUserId: support });
    caseIds.push(caseId);
    await expect(resolveSupportCase({ actorUserId: support, caseId, summary: "Resolved from backend truth", kind: "AUTHORITATIVE_CONTEXT" })).rejects.toThrow("requires a SecurePay source reference");
    await resolveSupportCase({ actorUserId: support, caseId, summary: "Resolved from current backend truth", kind: "AUTHORITATIVE_CONTEXT", authoritativeSourceRef: `projection:${run}` });
    const current = (await listSupportCases()).find((item) => item.id === caseId);
    expect(current).toEqual(expect.objectContaining({ state: "RESOLVED", workStatus: "DONE" }));
  });

  it("aggregates trader friction without turning it into product or financial authority", async () => {
    const conversationId = await getOrCreateTraderConversation({ actorUserId: support, securepayIdentityRef: `sp-friction-${run}` });
    conversationIds.push(conversationId);
    const caseId = await openSupportCase({ actorUserId: support, conversationId, subject: `Repeated confusing status ${run}`, ownerUserId: support });
    caseIds.push(caseId);
    await recordTraderFriction(support, caseId, "status clarity", "Trader could not tell which next step was expected.");
    const summary = await listFrictionSummary();
    expect(summary.find((item) => item.category === "STATUS_CLARITY")?.count).toBeGreaterThanOrEqual(1);
  });
});
