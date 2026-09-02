"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/rbac/guard";
import {
  addIncidentNote,
  addIncidentResponder,
  createPreventionAction,
  linkSupportCase,
  openIncident,
  recordServiceSignal,
  setIncidentCommunicationState,
  transitionIncident,
  updateIncidentImpact,
  type IncidentCommunicationState,
  type IncidentSeverity,
  type IncidentState,
} from "@/lib/operations/incident-engine";

const SEVERITIES = new Set<IncidentSeverity>(["SEV1", "SEV2", "SEV3", "SEV4"]);
const STATES = new Set<IncidentState>(["DETECTED", "INVESTIGATING", "MITIGATING", "MONITORING", "RESOLVED", "CLOSED"]);
const COMMS = new Set<IncidentCommunicationState>(["INTERNAL_ONLY", "DRAFTED", "AWAITING_APPROVAL", "RELEASED"]);

export async function openIncidentAction(formData: FormData) {
  const user = await requireUser();
  const incidentId = await openIncident({
    actorUserId: user.id,
    title: required(formData, "title"),
    summary: value(formData, "summary"),
    severity: enumValue(formData, "severity", SEVERITIES, "SEV3"),
    affectedService: required(formData, "affectedService"),
    commanderUserId: value(formData, "commanderUserId") || user.id,
    affectedTraderCount: numericValue(formData, "affectedTraderCount", 0),
  });
  refresh(incidentId);
  redirect(`/operations/incidents/${incidentId}`);
}

export async function incidentStateAction(formData: FormData) {
  const user = await requireUser();
  const incidentId = required(formData, "incidentId");
  await transitionIncident({
    actorUserId: user.id,
    incidentId,
    state: enumValue(formData, "state", STATES, "INVESTIGATING"),
    note: value(formData, "note"),
    resolutionSummary: value(formData, "resolutionSummary"),
    rootCauseSummary: value(formData, "rootCauseSummary"),
  });
  refresh(incidentId);
}

export async function addIncidentNoteAction(formData: FormData) {
  const user = await requireUser();
  const incidentId = required(formData, "incidentId");
  await addIncidentNote(user.id, incidentId, required(formData, "note"));
  refresh(incidentId);
}

export async function addResponderAction(formData: FormData) {
  const user = await requireUser();
  const incidentId = required(formData, "incidentId");
  await addIncidentResponder(user.id, incidentId, required(formData, "responderUserId"));
  refresh(incidentId);
}

export async function updateImpactAction(formData: FormData) {
  const user = await requireUser();
  const incidentId = required(formData, "incidentId");
  await updateIncidentImpact(user.id, incidentId, numericValue(formData, "affectedTraderCount", 0));
  refresh(incidentId);
}

export async function communicationStateAction(formData: FormData) {
  const user = await requireUser();
  const incidentId = required(formData, "incidentId");
  await setIncidentCommunicationState({ actorUserId: user.id, incidentId, state: enumValue(formData, "state", COMMS, "INTERNAL_ONLY"), releaseEvidenceRef: value(formData, "releaseEvidenceRef") });
  refresh(incidentId);
}

export async function linkSupportCaseAction(formData: FormData) {
  const user = await requireUser();
  const incidentId = required(formData, "incidentId");
  await linkSupportCase(user.id, incidentId, required(formData, "caseId"));
  refresh(incidentId);
}

export async function preventionAction(formData: FormData) {
  const user = await requireUser();
  const incidentId = required(formData, "incidentId");
  await createPreventionAction({ actorUserId: user.id, incidentId, title: required(formData, "title"), nextAction: required(formData, "nextAction"), ownerUserId: value(formData, "ownerUserId") || null });
  refresh(incidentId);
}

export async function recordSignalAction(formData: FormData) {
  const user = await requireUser();
  await recordServiceSignal({
    actorUserId: user.id,
    signalKey: required(formData, "signalKey"),
    serviceKey: required(formData, "serviceKey"),
    signalKind: required(formData, "signalKind"),
    severityHint: enumOptional(formData, "severityHint", SEVERITIES),
    evidenceRef: required(formData, "evidenceRef"),
    observedCount: numericValue(formData, "observedCount", 1),
  });
  revalidatePath("/operations");
}

function refresh(id: string) { revalidatePath("/operations"); revalidatePath(`/operations/incidents/${id}`); revalidatePath("/work"); revalidatePath("/today"); revalidatePath("/conversations"); }
function value(formData: FormData, key: string) { const raw = formData.get(key); return typeof raw === "string" ? raw.trim() : ""; }
function required(formData: FormData, key: string) { const result = value(formData, key); if (!result) throw new Error(`${key} is required`); return result; }
function enumValue<T extends string>(formData: FormData, key: string, allowed: Set<T>, fallback: T): T { const item = value(formData, key) as T; return allowed.has(item) ? item : fallback; }
function enumOptional<T extends string>(formData: FormData, key: string, allowed: Set<T>): T | null { const item = value(formData, key) as T; return allowed.has(item) ? item : null; }
function numericValue(formData: FormData, key: string, fallback: number) { const raw = value(formData, key); if (!raw) return fallback; const result = Number(raw); if (!Number.isFinite(result)) throw new Error(`${key} must be a valid number`); return result; }
