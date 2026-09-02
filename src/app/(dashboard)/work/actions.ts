"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/rbac/guard";
import {
  addCollaborator,
  addDependency,
  assignWorkOwner,
  claimWorkItem,
  convertConversationDraftToWork,
  createWorkItem,
  routeWorkItem,
  updateRoutingProfile,
  updateWorkStatus,
  type RecurrenceRule,
  type WorkPriority,
  type WorkStatus,
  type WorkType,
} from "@/lib/work/work-engine";

const WORK_TYPES = new Set<WorkType>(["TASK", "CASE", "INCIDENT", "FOLLOW_UP", "APPROVAL", "KNOWLEDGE", "SCHEDULE", "PROJECT"]);
const PRIORITIES = new Set<WorkPriority>(["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"]);
const STATUSES = new Set<WorkStatus>(["INBOX", "READY", "IN_PROGRESS", "WAITING", "BLOCKED", "DONE", "CANCELLED"]);
const RECURRENCES = new Set<RecurrenceRule>(["DAILY", "WEEKLY", "MONTHLY"]);

export async function createWorkAction(formData: FormData) {
  const user = await requireUser();
  const workType = enumValue(formData, "workType", WORK_TYPES, "TASK");
  const priority = enumValue(formData, "priority", PRIORITIES, "NORMAL");
  const recurrenceRaw = stringValue(formData, "recurrenceRule");
  const recurrenceRule = recurrenceRaw && RECURRENCES.has(recurrenceRaw as RecurrenceRule) ? (recurrenceRaw as RecurrenceRule) : null;
  const id = await createWorkItem({
    actorUserId: user.id,
    workType,
    title: stringValue(formData, "title"),
    context: stringValue(formData, "context"),
    nextAction: stringValue(formData, "nextAction"),
    queueKey: stringValue(formData, "queueKey") || undefined,
    ownerUserId: stringValue(formData, "ownerUserId") || null,
    priority,
    dueAt: dateValue(formData, "dueAt"),
    scheduledFor: dateValue(formData, "scheduledFor"),
    recurrenceRule,
    requiredRole: stringValue(formData, "requiredRole") || null,
    requiredLanguage: stringValue(formData, "requiredLanguage") || null,
    preferredTimezone: stringValue(formData, "preferredTimezone") || null,
  });
  revalidatePath("/work");
  revalidatePath("/today");
  redirect(`/work/${id}`);
}

export async function convertDraftAction(formData: FormData) {
  const user = await requireUser();
  const id = await convertConversationDraftToWork(user.id, required(formData, "draftId"));
  revalidatePath("/work");
  revalidatePath("/conversations");
  revalidatePath("/today");
  redirect(`/work/${id}`);
}

export async function claimWorkAction(formData: FormData) {
  const user = await requireUser();
  const id = required(formData, "workItemId");
  await claimWorkItem(user.id, id);
  refreshWork(id);
}

export async function routeWorkAction(formData: FormData) {
  const user = await requireUser();
  const id = required(formData, "workItemId");
  await routeWorkItem(user.id, id);
  refreshWork(id);
}

export async function statusWorkAction(formData: FormData) {
  const user = await requireUser();
  const id = required(formData, "workItemId");
  const status = enumValue(formData, "status", STATUSES, "READY");
  await updateWorkStatus(user.id, id, status);
  refreshWork(id);
}

export async function assignOwnerAction(formData: FormData) {
  const user = await requireUser();
  const id = required(formData, "workItemId");
  await assignWorkOwner(user.id, id, stringValue(formData, "ownerUserId") || null);
  refreshWork(id);
}

export async function addCollaboratorAction(formData: FormData) {
  const user = await requireUser();
  const id = required(formData, "workItemId");
  await addCollaborator(user.id, id, required(formData, "collaboratorUserId"));
  refreshWork(id);
}

export async function addDependencyAction(formData: FormData) {
  const user = await requireUser();
  const id = required(formData, "workItemId");
  await addDependency(user.id, id, required(formData, "dependsOnWorkItemId"));
  refreshWork(id);
}

export async function updateMyRoutingProfileAction(formData: FormData) {
  const user = await requireUser();
  await updateRoutingProfile(user.id, {
    timezone: stringValue(formData, "timezone") || "UTC",
    languages: stringValue(formData, "languages").split(",").map((v) => v.trim()).filter(Boolean),
    available: formData.get("available") === "on",
    maxActiveWork: Number(stringValue(formData, "maxActiveWork") || "20"),
  });
  revalidatePath("/work");
}

function refreshWork(id: string) {
  revalidatePath("/work");
  revalidatePath(`/work/${id}`);
  revalidatePath("/today");
}

function stringValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
function required(formData: FormData, key: string): string {
  const value = stringValue(formData, key);
  if (!value) throw new Error(`${key} is required`);
  return value;
}
function enumValue<T extends string>(formData: FormData, key: string, allowed: Set<T>, fallback: T): T {
  const value = stringValue(formData, key) as T;
  return allowed.has(value) ? value : fallback;
}
function dateValue(formData: FormData, key: string): Date | null {
  const value = stringValue(formData, key);
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new Error(`${key} is invalid`);
  return parsed;
}
