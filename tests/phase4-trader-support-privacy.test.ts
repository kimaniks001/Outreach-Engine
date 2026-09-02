import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getOrCreateTraderConversation, openSupportCase, recordTraderMessage } from "@/lib/trader-support/support-engine";
import {
  listVisibleConversationMessages,
  listVisibleSupportCases,
  listVisibleSupportConversations,
  visibleSupportContextTarget,
} from "@/lib/trader-support/support-visibility";

const run = randomUUID().slice(0, 8);
const users: string[] = [];
const conversations: string[] = [];
const cases: string[] = [];

function rows<T>(result: unknown): T[] { return ((result as { rows?: T[] }).rows ?? []); }
async function staff(name: string, role: "OWNER" | "STRATEGIST" = "STRATEGIST"): Promise<string> {
  const result = await db.execute(sql`INSERT INTO users (email,password_hash,name,role,active) VALUES (${`support-privacy-${run}-${name}@test.local`},'x',${name},${role}::role,true) RETURNING id::text`);
  const id = rows<{ id: string }>(result)[0]?.id;
  if (!id) throw new Error("staff setup failed");
  users.push(id);
  return id;
}

afterAll(async () => {
  for (const id of cases) await db.execute(sql`DELETE FROM trader_support_cases WHERE id = ${id}::uuid`);
  for (const id of conversations) await db.execute(sql`DELETE FROM trader_support_conversations WHERE id = ${id}::uuid`);
  for (const id of users) await db.execute(sql`DELETE FROM users WHERE id = ${id}::uuid`);
});

describe("Phase 4 trader support privacy", () => {
  it("fails closed for staff outside the linked Work responsibility while preserving Owner oversight", async () => {
    const owner = await staff("owner", "OWNER");
    const assignee = await staff("assignee");
    const outsider = await staff("outsider");
    const traderRef = `privacy-${run}`;
    const conversationId = await getOrCreateTraderConversation({ actorUserId: assignee, securepayIdentityRef: traderRef });
    conversations.push(conversationId);
    await recordTraderMessage(conversationId, "Please help with this private support question.");
    const caseId = await openSupportCase({ actorUserId: assignee, conversationId, subject: `Private support ${run}`, ownerUserId: assignee });
    cases.push(caseId);

    expect((await listVisibleSupportCases(assignee)).some((item) => item.id === caseId)).toBe(true);
    expect((await listVisibleSupportCases(outsider)).some((item) => item.id === caseId)).toBe(false);
    expect((await listVisibleSupportCases(owner)).some((item) => item.id === caseId)).toBe(true);

    expect((await listVisibleSupportConversations(outsider)).some((item) => item.id === conversationId)).toBe(false);
    await expect(listVisibleConversationMessages(outsider, conversationId)).rejects.toThrow("unavailable");
    expect((await listVisibleConversationMessages(owner, conversationId)).length).toBe(1);

    await expect(visibleSupportContextTarget(outsider, caseId)).rejects.toThrow("unavailable");
    expect(await visibleSupportContextTarget(assignee, caseId)).toEqual({ caseId, conversationId, securepayIdentityRef: traderRef });
    expect(await visibleSupportContextTarget(owner, caseId)).toEqual({ caseId, conversationId, securepayIdentityRef: traderRef });
  });
});
