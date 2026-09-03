import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { runStructuredTask } from "@/lib/ai/tasks/run-structured-task";
const Brief = z
  .object({
    summary: z.string().min(2).max(4000),
    priorities: z.array(z.string().max(300)).max(8),
    patterns: z.array(z.string().max(300)).max(8),
    suggestedActions: z.array(z.string().max(300)).max(8),
  })
  .strict();
export interface GroundRef {
  type: string;
  id: string;
  label: string;
  href: string;
}
export interface CopilotContext {
  needsMe: GroundRef[];
  cases: GroundRef[];
  incidents: GroundRef[];
  patterns: { label: string; count: number }[];
  recentBriefs: {
    id: string;
    query: string;
    summary: string;
    createdAt: Date;
    providerIsMock: boolean;
  }[];
}
export async function getCopilotContext(
  userId: string,
  role: string,
): Promise<CopilotContext> {
  await requireActive(userId);
  const owner = role === "OWNER";
  const visible = sql`${owner} OR w.owner_user_id=${userId}::uuid OR w.created_by_user_id=${userId}::uuid OR EXISTS(SELECT 1 FROM work_collaborators c WHERE c.work_item_id=w.id AND c.user_id=${userId}::uuid)`;
  const [work, cases, incidents, patterns, briefs] = await Promise.all([
    db.execute(
      sql`SELECT w.id::text AS id,w.title,w.priority::text AS priority FROM work_items w WHERE (${visible}) AND w.status NOT IN('DONE','CANCELLED') ORDER BY CASE w.priority WHEN 'CRITICAL' THEN 0 WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 ELSE 3 END,COALESCE(w.sla_due_at,w.due_at,'infinity') LIMIT 20`,
    ),
    db.execute(
      sql`SELECT c.id::text AS id,c.subject FROM trader_support_cases c JOIN work_items w ON w.id=c.work_item_id WHERE (${visible}) AND c.state NOT IN('RESOLVED','CLOSED') ORDER BY c.opened_at DESC LIMIT 12`,
    ),
    db.execute(
      sql`SELECT i.id::text AS id,i.title,i.severity::text AS severity FROM operations_incidents i JOIN work_items w ON w.id=i.work_item_id WHERE (${visible}) AND i.state NOT IN('RESOLVED','CLOSED') ORDER BY CASE i.severity WHEN 'SEV1' THEN 0 WHEN 'SEV2' THEN 1 ELSE 2 END,i.detected_at DESC LIMIT 12`,
    ),
    db.execute(
      sql`SELECT category AS label,count(*)::int AS count FROM trader_friction_events WHERE created_at>now()-interval '90 days' GROUP BY category HAVING count(*)>1 ORDER BY count(*) DESC,category LIMIT 10`,
    ),
    db.execute(
      sql`SELECT id::text AS id,query,summary,created_at AS "createdAt",provider_is_mock AS "providerIsMock" FROM outreach_copilot_briefs WHERE requested_by_user_id=${userId}::uuid ORDER BY created_at DESC LIMIT 8`,
    ),
  ]);
  return {
    needsMe: rows<{ id: string; title: string; priority: string }>(work).map(
      (x) => ({
        type: "work",
        id: x.id,
        label: `${x.priority}: ${x.title}`,
        href: `/work/${x.id}`,
      }),
    ),
    cases: rows<{ id: string; subject: string }>(cases).map((x) => ({
      type: "case",
      id: x.id,
      label: x.subject,
      href: `/traders/cases/${x.id}`,
    })),
    incidents: rows<{ id: string; title: string; severity: string }>(
      incidents,
    ).map((x) => ({
      type: "incident",
      id: x.id,
      label: `${x.severity}: ${x.title}`,
      href: "/operations",
    })),
    patterns: rows<{ label: string; count: number }>(patterns).map((x) => ({
      ...x,
      count: Number(x.count),
    })),
    recentBriefs: rows<CopilotContext["recentBriefs"][number]>(briefs).map(
      (x) => ({ ...x, createdAt: new Date(x.createdAt) }),
    ),
  };
}
export async function generateBrief(
  userId: string,
  role: string,
  query: string,
) {
  const clean = query.trim();
  if (clean.length < 2 || clean.length > 500)
    throw new Error("Question must be between 2 and 500 characters");
  const context = await getCopilotContext(userId, role);
  const refs = [
    ...context.needsMe,
    ...context.cases,
    ...context.incidents,
  ].slice(0, 30);
  const payload = {
    query: clean,
    needsMe: context.needsMe.map((x) => ({
      ref: `${x.type}:${x.id}`,
      label: x.label,
    })),
    openCases: context.cases.map((x) => ({
      ref: `case:${x.id}`,
      label: x.label,
    })),
    incidents: context.incidents.map((x) => ({
      ref: `incident:${x.id}`,
      label: x.label,
    })),
    repeatedFriction: context.patterns,
  };
  const result = await runStructuredTask({
    taskType: "SOURCE_SYNTHESIS",
    requestedByUserId: userId,
    system:
      "You are the Outreach organisational copilot. Use only supplied evidence. Return strict JSON with summary, priorities, patterns, suggestedActions. Suggestions never execute, approve, publish, contact traders, or state financial/product truth. Cite evidence refs in prose where useful.",
    userPrompt: `COPILOT_CONTEXT\n${JSON.stringify(payload)}`,
    schema: Brief,
    maxOutputTokens: 1000,
  });
  if (result.status !== "SUCCESS")
    throw new Error(
      `Copilot unavailable: ${"reason" in result ? result.reason : "error" in result ? result.error : "Malformed model output"}`,
    );
  const inserted = await db.execute(
    sql`INSERT INTO outreach_copilot_briefs(requested_by_user_id,query,summary,priorities,patterns,suggested_actions,grounding_refs,ai_usage_record_id,provider_is_mock) VALUES(${userId}::uuid,${clean},${result.data.summary},CAST(${JSON.stringify(result.data.priorities)} AS jsonb),CAST(${JSON.stringify(result.data.patterns)} AS jsonb),CAST(${JSON.stringify(result.data.suggestedActions)} AS jsonb),CAST(${JSON.stringify(refs)} AS jsonb),${result.usageRecordId}::uuid,${result.isMock}) RETURNING id::text`,
  );
  return one<{ id: string }>(inserted)!.id;
}
async function requireActive(id: string) {
  if (
    !one(
      await db.execute(
        sql`SELECT 1 FROM users WHERE id=${id}::uuid AND active=TRUE`,
      ),
    )
  )
    throw new Error("Active staff identity required");
}
function rows<T>(r: unknown): T[] {
  return (r as { rows?: T[] }).rows ?? [];
}
function one<T = Record<string, unknown>>(r: unknown): T | undefined {
  return rows<T>(r)[0];
}
