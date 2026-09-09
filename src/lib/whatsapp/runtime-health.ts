import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export interface SupportRuntimeHealth {
  triageReady: number;
  triageProcessing: number;
  triageStale: number;
  outboxReady: number;
  outboxSending: number;
  outboxUncertain: number;
  waitingIdentity: number;
  plugWaiting: number;
  staffWaiting: number;
  sensitiveWaiting: number;
  oldestTriageSeconds: number;
  oldestOutboxSeconds: number;
}

export interface SupportRecoveryResult {
  reclaimedTriage: number;
  quarantinedOutbound: number;
}

export interface SupportDrainPlan {
  triageLimit: number;
  outboundLimit: number;
  pressure: "NORMAL" | "ELEVATED" | "HIGH";
}

const STALE_AFTER = "5 minutes";

export async function recoverStaleSupportWork(): Promise<SupportRecoveryResult> {
  return db.transaction(async (tx) => {
    const triage = await tx.execute(sql`
      UPDATE support_triage_jobs
         SET status = 'FAILED',
             locked_at = NULL,
             available_at = now(),
             last_error = 'Recovered stale PROCESSING lease after worker interruption.',
             updated_at = now()
       WHERE status = 'PROCESSING'
         AND locked_at IS NOT NULL
         AND locked_at < now() - interval '5 minutes'
    `);

    const outbound = await tx.execute(sql`
      UPDATE support_channel_outbox
         SET status = 'UNCERTAIN',
             locked_at = NULL,
             last_error = 'Delivery outcome is uncertain after a stale SENDING lease; automatic replay is disabled to prevent duplicate WhatsApp delivery.',
             updated_at = now()
       WHERE status = 'SENDING'
         AND locked_at IS NOT NULL
         AND locked_at < now() - interval '5 minutes'
    `);

    return {
      reclaimedTriage: rowCount(triage),
      quarantinedOutbound: rowCount(outbound),
    };
  });
}

export async function readSupportRuntimeHealth(): Promise<SupportRuntimeHealth> {
  const result = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM support_triage_jobs
        WHERE status IN ('PENDING','FAILED') AND available_at <= now() AND attempts < 5) AS "triageReady",
      (SELECT count(*)::int FROM support_triage_jobs WHERE status = 'PROCESSING') AS "triageProcessing",
      (SELECT count(*)::int FROM support_triage_jobs
        WHERE status = 'PROCESSING' AND locked_at < now() - interval '5 minutes') AS "triageStale",
      (SELECT count(*)::int FROM support_channel_outbox
        WHERE status IN ('PENDING','FAILED') AND available_at <= now() AND attempts < 5) AS "outboxReady",
      (SELECT count(*)::int FROM support_channel_outbox WHERE status = 'SENDING') AS "outboxSending",
      (SELECT count(*)::int FROM support_channel_outbox WHERE status = 'UNCERTAIN') AS "outboxUncertain",
      (SELECT count(*)::int FROM support_channel_messages WHERE processing_status = 'WAITING_IDENTITY') AS "waitingIdentity",
      (SELECT count(*)::int FROM work_items w JOIN work_queues q ON q.id = w.queue_id
        WHERE q.queue_key = 'PLUG_SUPPORT' AND w.status NOT IN ('DONE','CANCELLED')) AS "plugWaiting",
      (SELECT count(*)::int FROM work_items w JOIN work_queues q ON q.id = w.queue_id
        WHERE q.queue_key = 'SECUREPAY_STAFF' AND w.status NOT IN ('DONE','CANCELLED')) AS "staffWaiting",
      (SELECT count(*)::int FROM work_items w JOIN work_queues q ON q.id = w.queue_id
        WHERE q.queue_key = 'SENSITIVE_REVIEW' AND w.status NOT IN ('DONE','CANCELLED')) AS "sensitiveWaiting",
      COALESCE((SELECT greatest(0, extract(epoch FROM (now() - min(created_at)))::int)
        FROM support_triage_jobs WHERE status IN ('PENDING','FAILED') AND attempts < 5), 0) AS "oldestTriageSeconds",
      COALESCE((SELECT greatest(0, extract(epoch FROM (now() - min(created_at)))::int)
        FROM support_channel_outbox WHERE status IN ('PENDING','FAILED')), 0) AS "oldestOutboxSeconds"
  `);
  const row = rows<SupportRuntimeHealth>(result)[0];
  return row ?? emptyHealth();
}

export function planSupportDrain(health: Pick<SupportRuntimeHealth, "triageReady" | "outboxReady">): SupportDrainPlan {
  const peak = Math.max(health.triageReady, health.outboxReady);
  if (peak >= 500) return { triageLimit: 100, outboundLimit: 200, pressure: "HIGH" };
  if (peak >= 100) return { triageLimit: 75, outboundLimit: 150, pressure: "ELEVATED" };
  return { triageLimit: 25, outboundLimit: 50, pressure: "NORMAL" };
}

export function supportHealthState(health: SupportRuntimeHealth): "HEALTHY" | "DEGRADED" | "ACTION_REQUIRED" {
  if (health.outboxUncertain > 0 || health.triageStale > 0 || health.oldestTriageSeconds > 300 || health.oldestOutboxSeconds > 300) {
    return "ACTION_REQUIRED";
  }
  if (health.triageReady >= 100 || health.outboxReady >= 100 || health.waitingIdentity >= 100 || health.staffWaiting >= 50) {
    return "DEGRADED";
  }
  return "HEALTHY";
}

function rowCount(result: unknown): number {
  return Number((result as { rowCount?: number }).rowCount ?? 0);
}

function rows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? []);
}

function emptyHealth(): SupportRuntimeHealth {
  return {
    triageReady: 0,
    triageProcessing: 0,
    triageStale: 0,
    outboxReady: 0,
    outboxSending: 0,
    outboxUncertain: 0,
    waitingIdentity: 0,
    plugWaiting: 0,
    staffWaiting: 0,
    sensitiveWaiting: 0,
    oldestTriageSeconds: 0,
    oldestOutboxSeconds: 0,
  };
}

export const SUPPORT_STALE_LEASE_DESCRIPTION = STALE_AFTER;
