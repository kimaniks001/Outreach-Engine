"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/rbac/guard";
import {
  createActionDraft,
  createDirectConversation,
  createStaffCircle,
  markConversationRead,
  sendMessage,
  togglePin,
  toggleReaction,
  type ConversationActionType,
} from "@/lib/conversations/staff-conversations";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function conversationPath(conversationId: string, extra?: string): string {
  return `/conversations?c=${encodeURIComponent(conversationId)}${extra ?? ""}`;
}

export async function createDirectAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const otherUserId = text(formData, "otherUserId");
  if (!otherUserId) redirect("/conversations?error=Choose+a+team+member");

  try {
    const conversationId = await createDirectConversation(user.id, otherUserId);
    revalidatePath("/conversations");
    redirect(conversationPath(conversationId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Conversation could not be created";
    redirect(`/conversations?error=${encodeURIComponent(message)}`);
  }
}

export async function createCircleAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const title = text(formData, "title");
  const memberUserIds = formData
    .getAll("memberUserIds")
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  try {
    const conversationId = await createStaffCircle(user.id, title, memberUserIds, "STAFF_CIRCLE");
    revalidatePath("/conversations");
    redirect(conversationPath(conversationId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Circle could not be created";
    redirect(`/conversations?error=${encodeURIComponent(message)}`);
  }
}

export async function sendMessageAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const conversationId = text(formData, "conversationId");
  if (!conversationId) redirect("/conversations");

  const body = text(formData, "body");
  const replyToMessageId = text(formData, "replyToMessageId") || null;
  const attachmentLabel = text(formData, "attachmentLabel");
  const attachmentUrl = text(formData, "attachmentUrl");
  const attachment = attachmentLabel || attachmentUrl ? { label: attachmentLabel, url: attachmentUrl } : null;

  try {
    await sendMessage({ userId: user.id, conversationId, body, replyToMessageId, attachment });
    revalidatePath("/conversations");
    redirect(conversationPath(conversationId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Message could not be sent";
    redirect(conversationPath(conversationId, `&error=${encodeURIComponent(message)}`));
  }
}

export async function markReadAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const conversationId = text(formData, "conversationId");
  if (!conversationId) return;
  await markConversationRead(user.id, conversationId);
  revalidatePath("/conversations");
  revalidatePath("/today");
}

export async function toggleReactionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const conversationId = text(formData, "conversationId");
  const messageId = text(formData, "messageId");
  const emoji = text(formData, "emoji");
  if (!conversationId || !messageId || !emoji) return;
  await toggleReaction(user.id, conversationId, messageId, emoji);
  revalidatePath("/conversations");
}

export async function togglePinAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const conversationId = text(formData, "conversationId");
  const messageId = text(formData, "messageId");
  if (!conversationId || !messageId) return;
  await togglePin(user.id, conversationId, messageId);
  revalidatePath("/conversations");
}

export async function createActionDraftAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const conversationId = text(formData, "conversationId");
  const sourceMessageId = text(formData, "messageId");
  const actionType = text(formData, "actionType") as ConversationActionType;
  if (!conversationId || !sourceMessageId || !actionType) return;

  try {
    await createActionDraft(user.id, conversationId, sourceMessageId, actionType);
    revalidatePath("/conversations");
    redirect(conversationPath(conversationId, "&drafted=1"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action draft could not be created";
    redirect(conversationPath(conversationId, `&error=${encodeURIComponent(message)}`));
  }
}
