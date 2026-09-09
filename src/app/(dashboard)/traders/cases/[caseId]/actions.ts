"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/rbac/guard";
import {
  requireSupportCaseVisibility,
  visibleSupportContextTarget,
} from "@/lib/trader-support/support-visibility";
import {
  resolveSupportCase,
  transitionSupportCase,
  type SupportCaseState,
} from "@/lib/trader-support/support-engine";
import { queueWhatsAppHumanReply } from "@/lib/whatsapp/human-reply";

const HUMAN_STATES = new Set<SupportCaseState>(["OPEN", "WAITING_ON_TRADER", "WAITING_INTERNAL"]);

export async function replyToTraderAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const caseId = required(formData, "caseId");
  const conversationId = required(formData, "conversationId");
  const body = required(formData, "body");
  const afterSendRaw = value(formData, "afterSend");
  const afterSend = HUMAN_STATES.has(afterSendRaw as SupportCaseState) ? (afterSendRaw as SupportCaseState) : "OPEN";

  try {
    const target = await visibleSupportContextTarget(user.id, caseId);
    if (target.conversationId !== conversationId) throw new Error("Support conversation does not belong to this case");
    await queueWhatsAppHumanReply({ actorUserId: user.id, conversationId, body });
    await transitionSupportCase(user.id, caseId, afterSend);
  } catch (error) {
    redirect(casePath(caseId, `error=${encodeURIComponent(message(error))}`));
  }

  refresh(caseId);
  redirect(casePath(caseId, "sent=1"));
}

export async function updateSupportCaseStateAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const caseId = required(formData, "caseId");
  const nextRaw = required(formData, "state");
  if (!HUMAN_STATES.has(nextRaw as SupportCaseState)) redirect(casePath(caseId, "error=Unsupported+case+state"));

  try {
    await requireSupportCaseVisibility(user.id, caseId);
    await transitionSupportCase(user.id, caseId, nextRaw as SupportCaseState);
  } catch (error) {
    redirect(casePath(caseId, `error=${encodeURIComponent(message(error))}`));
  }

  refresh(caseId);
  redirect(casePath(caseId, "updated=1"));
}

export async function resolveSupportCaseAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const caseId = required(formData, "caseId");
  const summary = required(formData, "summary");

  try {
    await requireSupportCaseVisibility(user.id, caseId);
    await resolveSupportCase({ actorUserId: user.id, caseId, summary, kind: "HUMAN" });
  } catch (error) {
    redirect(casePath(caseId, `error=${encodeURIComponent(message(error))}`));
  }

  refresh(caseId);
  redirect(casePath(caseId, "resolved=1"));
}

function refresh(caseId: string): void {
  revalidatePath("/traders");
  revalidatePath(`/traders/cases/${caseId}`);
  revalidatePath("/work");
  revalidatePath("/today");
}
function casePath(caseId: string, query: string): string { return `/traders/cases/${encodeURIComponent(caseId)}?${query}`; }
function value(formData: FormData, key: string): string { const item = formData.get(key); return typeof item === "string" ? item.trim() : ""; }
function required(formData: FormData, key: string): string { const item = value(formData, key); if (!item) throw new Error(`${key} is required`); return item; }
function message(error: unknown): string { return error instanceof Error ? error.message : "Support action could not be completed"; }
