import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  createActionDraft,
  createDirectConversation,
  createStaffCircle,
  ensureCompanyConversation,
  getConversation,
  getUnreadConversationCount,
  listActionDrafts,
  listConversationsForUser,
  listMessages,
  markConversationRead,
  searchMessages,
  sendMessage,
  togglePin,
  toggleReaction,
} from "@/lib/conversations/staff-conversations";

const run = randomUUID().slice(0, 8);
let alice = "";
let bob = "";
let charlie = "";
const createdConversations: string[] = [];

async function createStaff(name: string): Promise<string> {
  const result = await db.execute(sql`
    INSERT INTO users (email, password_hash, name, role, active)
    VALUES (${`conversation-${run}-${name.toLowerCase()}@example.test`}, 'not-used-in-service-test', ${name}, 'STRATEGIST', true)
    RETURNING id::text
  `);
  const id = ((result as { rows?: Array<{ id: string }> }).rows ?? [])[0]?.id;
  if (!id) throw new Error("test staff creation failed");
  return id;
}

beforeAll(async () => {
  alice = await createStaff("Alice");
  bob = await createStaff("Bob");
  charlie = await createStaff("Charlie");
});

afterAll(async () => {
  if (createdConversations.length > 0) {
    await db.execute(sql`DELETE FROM staff_conversations WHERE id = ANY(${createdConversations}::uuid[])`);
  }
  await db.execute(sql`DELETE FROM users WHERE id IN (${alice}::uuid, ${bob}::uuid, ${charlie}::uuid)`);
});

describe("staff conversations: privacy and collaboration", () => {
  it("converges repeated direct-message creation onto one private room", async () => {
    const first = await createDirectConversation(alice, bob);
    const replay = await createDirectConversation(bob, alice);
    createdConversations.push(first);

    expect(replay).toBe(first);
    const aliceRooms = await listConversationsForUser(alice);
    const bobRooms = await listConversationsForUser(bob);
    expect(aliceRooms.some((room) => room.id === first)).toBe(true);
    expect(bobRooms.some((room) => room.id === first)).toBe(true);
  });

  it("fails closed when a non-member tries to read a private room", async () => {
    const conversationId = await createDirectConversation(alice, bob);
    if (!createdConversations.includes(conversationId)) createdConversations.push(conversationId);
    await sendMessage({ userId: alice, conversationId, body: `private-${run}` });

    await expect(listMessages(charlie, conversationId)).rejects.toThrow("Conversation is unavailable");
    await expect(getConversation(charlie, conversationId)).rejects.toThrow("Conversation is unavailable");
  });

  it("search only returns messages from rooms the caller belongs to", async () => {
    const privateCircle = await createStaffCircle(alice, `Private ${run}`, [bob]);
    createdConversations.push(privateCircle);
    const secret = `restricted-market-note-${run}`;
    await sendMessage({ userId: bob, conversationId: privateCircle, body: secret });

    expect((await searchMessages(alice, secret)).some((row) => row.conversationId === privateCircle)).toBe(true);
    expect(await searchMessages(charlie, secret)).toEqual([]);
  });

  it("supports replies, reactions and pins without crossing conversation boundaries", async () => {
    const conversationId = await createStaffCircle(alice, `Ops ${run}`, [bob]);
    createdConversations.push(conversationId);
    const otherConversationId = await createStaffCircle(charlie, `Other ${run}`, []);
    createdConversations.push(otherConversationId);

    const firstMessageId = await sendMessage({ userId: alice, conversationId, body: "STK looks stable again." });
    await sendMessage({ userId: bob, conversationId, body: "Confirmed from my side.", replyToMessageId: firstMessageId });
    await toggleReaction(bob, conversationId, firstMessageId, "✅");
    await togglePin(alice, conversationId, firstMessageId);

    const messages = await listMessages(alice, conversationId);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.pinned).toBe(true);
    expect(messages[0]?.reactions).toEqual(expect.arrayContaining([expect.objectContaining({ emoji: "✅", count: 1 })]));
    expect(messages[1]?.replyToMessageId).toBe(firstMessageId);

    await expect(sendMessage({ userId: charlie, conversationId: otherConversationId, body: "bad reply", replyToMessageId: firstMessageId })).rejects.toThrow("Message is unavailable");
  });

  it("tracks unread rooms and clears them only for the member who marks the room read", async () => {
    const conversationId = await createStaffCircle(alice, `Unread ${run}`, [bob]);
    createdConversations.push(conversationId);
    await markConversationRead(bob, conversationId);
    await sendMessage({ userId: alice, conversationId, body: "Bob needs this update." });

    expect(await getUnreadConversationCount(bob)).toBeGreaterThanOrEqual(1);
    await markConversationRead(bob, conversationId);
    const bobRooms = await listConversationsForUser(bob);
    expect(bobRooms.find((room) => room.id === conversationId)?.unreadCount).toBe(0);
  });

  it("accepts only HTTPS linked attachments and never treats a link as stored file authority", async () => {
    const conversationId = await createStaffCircle(alice, `Links ${run}`, [bob]);
    createdConversations.push(conversationId);

    await expect(sendMessage({
      userId: alice,
      conversationId,
      body: "",
      attachment: { label: "unsafe", url: "http://example.test/file" },
    })).rejects.toThrow("HTTPS");

    await sendMessage({
      userId: alice,
      conversationId,
      body: "Reference only",
      attachment: { label: "Approved reference", url: "https://example.test/reference" },
    });
    const messages = await listMessages(bob, conversationId);
    expect(messages.at(-1)?.attachment?.url).toBe("https://example.test/reference");
  });

  it("conversation-to-work creates a draft intent only, not task/case/incident authority", async () => {
    const conversationId = await createStaffCircle(alice, `Draft ${run}`, [bob]);
    createdConversations.push(conversationId);
    const messageId = await sendMessage({ userId: bob, conversationId, body: "Please follow this up tomorrow." });

    await createActionDraft(alice, conversationId, messageId, "FOLLOW_UP");
    const drafts = await listActionDrafts(alice, conversationId);
    expect(drafts).toEqual(expect.arrayContaining([expect.objectContaining({ sourceMessageId: messageId, actionType: "FOLLOW_UP" })]));

    const raw = await db.execute(sql`
      SELECT status FROM conversation_action_drafts
       WHERE conversation_id = ${conversationId}::uuid AND source_message_id = ${messageId}::uuid
    `);
    const status = ((raw as { rows?: Array<{ status: string }> }).rows ?? [])[0]?.status;
    expect(status).toBe("DRAFT");
  });

  it("company room enrolls active staff but remains an Outreach staff domain", async () => {
    const companyId = await ensureCompanyConversation();
    const detail = await getConversation(alice, companyId);
    expect(detail.type).toBe("COMPANY");
    expect(detail.participants.some((participant) => participant.id === alice)).toBe(true);
    expect(detail.participants.some((participant) => participant.id === bob)).toBe(true);
  });
});
