import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { resolveAutomatedSupportContextClient } from "./automated-support-context";
import { approvedGuidance, buildContextAnswer } from "./support-guidance";
import { classifySupportMessage, type SupportRoute, type SupportTriageDecision } from "./triage";

interface ClaimedTriageJob {
  jobId: string;
  attempts: number;
  channelMessageDbId: string;
  providerMessageId: string;
  channelAddress: string;
  body: string;
  conversationId: string;
  securepayIdentityRef: string;
  bindingAuthoritySequence: number;
  bindingAssertionId: string;
  receivedAt: Date;
}

interface SupportCaseRef {
  caseId: string;
  workItemId: string;
}

export async function processWhatsAppTriageBatch(limit = 25): Promise<{
  claimed: number;
  completed: number;
  failed: number;
}> {
  const claimed = await claimJobs(Math.max(1, Math.min(limit, 100)));
  let completed = 0;
  let failed = 0;

  await mapWithConcurrency(claimed, 8, async (job) => {
    try {
      await processJob(job);
      await markJobDone(job.jobId);
      completed += 1;
    } catch (error) {
      failed += 1;
      await markJobFailed(job, error);
    }
  });

  return { claimed: claimed.length, completed, failed };
}

async function processJob(job: ClaimedTriageJob): Promise<void> {
  // The address may have been revoked/rebound after ingress. Never re-resolve a
  // pending message onto whatever identity owns the address now. Its stored epoch
  // is the only routing authority for this job; a mismatch is terminal/stale.
  if (!(await bindingSnapshotStillCurrent(job))) {
    await markChannelMessage(job.channelMessageDbId, "STALE_BINDING");
    return;
  }

  const aggregate = await aggregateConversation(job.conversationId, job.receivedAt);
  const decision = classifySupportMessage(aggregate.text);

  await db.execute(sql`
    INSERT INTO support_triage_decisions (
      channel_message_id, support_conversation_id, intent, route, priority,
      requires_securepay_context, reason, aggregate_message_count
    ) VALUES (
      ${job.channelMessageDbId}::uuid, ${job.conversationId}::uuid,
      ${decision.intent}::support_triage_intent, ${decision.route}::support_triage_route,
      ${decision.priority}::work_priority, ${decision.requiresSecurePayContext}, ${decision.reason}, ${aggregate.count}
    )
    ON CONFLICT (channel_message_id) DO UPDATE SET
      intent = EXCLUDED.intent,
      route = EXCLUDED.route,
      priority = EXCLUDED.priority,
      requires_securepay_context = EXCLUDED.requires_securepay_context,
      reason = EXCLUDED.reason,
      aggregate_message_count = EXCLUDED.aggregate_message_count,
      decided_at = now()
  `);

  if (decision.route === "AUTO_GUIDANCE") {
    const body = approvedGuidance(decision.intent);
    if (!body) return queueHuman(job, aggregate.text, decision, "PLUG_SUPPORT", "Approved guidance was unavailable.");
    await queueResponse(job, body, "AUTO_GUIDANCE");
    await markChannelMessage(job.channelMessageDbId, "TRIAGED");
    return;
  }

  if (decision.route === "AUTO_CONTEXT") {
    await resolveFromSecurePayContext(job, aggregate.text, decision);
    return;
  }

  if (decision.route === "PLUG") {
    await queueHuman(job, aggregate.text, decision, "PLUG_SUPPORT");
    return;
  }

  if (decision.route === "SENSITIVE_REVIEW") {
    await queueHuman(job, aggregate.text, decision, "SENSITIVE_REVIEW");
    await queueResponse(
      job,
      "I’m passing this to the SecurePay team for careful handling rather than guessing. You can continue here, but please don’t send passwords, PINs or OTPs in chat.",
      "ACKNOWLEDGEMENT"
    );
    return;
  }

  await queueStaffWithOptionalContext(job, aggregate.text, decision);
}

async function resolveFromSecurePayContext(
  job: ClaimedTriageJob,
  aggregateText: string,
  decision: SupportTriageDecision
): Promise<void> {
  const supportCase = await createOrReuseCase(job, decision, "TRADER_SUPPORT", aggregateText);
  await attachDecisionCase(job.channelMessageDbId, supportCase.caseId);
  const client = resolveAutomatedSupportContextClient();
  if (!client) {
    await rerouteCase(supportCase, "SECUREPAY_STAFF", "Automated SecurePay support identity is not configured; human review required.");
    await changeDecisionRoute(job.channelMessageDbId, "SECUREPAY_STAFF", "Automated SecurePay context connection is unavailable.");
    await queueResponse(job, "I need a SecurePay team member to check this rather than guess. I’ve queued it for review here.", "ACKNOWLEDGEMENT");
    await markChannelMessage(job.channelMessageDbId, "HUMAN_QUEUED");
    return;
  }

  const caseRef = `WA:${supportCase.caseId}`;
  let context;
  try {
    context = await client.read(job.securepayIdentityRef, caseRef);
  } catch (error) {
    await rerouteCase(supportCase, "SECUREPAY_STAFF", "Authoritative SecurePay context could not be retrieved automatically.");
    await changeDecisionRoute(job.channelMessageDbId, "SECUREPAY_STAFF", "SecurePay context retrieval failed closed to staff.");
    await appendWorkContext(supportCase.workItemId, `\n\nAUTOMATED CONTEXT FETCH\nUnavailable: ${safeError(error)}`);
    await queueResponse(job, "I need a SecurePay team member to check this rather than guess. I’ve queued it for review here.", "ACKNOWLEDGEMENT");
    await markChannelMessage(job.channelMessageDbId, "HUMAN_QUEUED");
    return;
  }

  await appendWorkContext(supportCase.workItemId, `\n\nSECUREPAY CONTEXT\n${summarizeContext(context)}`);
  const answer = buildContextAnswer({ intent: decision.intent, aggregateText, context });
  if (answer.status === "AMBIGUOUS") {
    await setCaseWaitingOnTrader(supportCase);
    await queueResponse(
      job,
      "I can help, but I can see more than one current agreement and I don’t want to guess which one you mean. Tell me the agreement name/reference, or open securepay.ke and send me the reference you see.",
      "AUTO_CONTEXT"
    );
    await appendWorkContext(supportCase.workItemId, `\n\nCLARIFICATION\n${answer.reason}`);
    await markChannelMessage(job.channelMessageDbId, "TRIAGED");
    return;
  }

  await queueResponse(job, answer.body, "AUTO_CONTEXT");
  await resolveCaseFromContext(supportCase, answer.sourceRef);
  await markChannelMessage(job.channelMessageDbId, "TRIAGED");
}

async function queueStaffWithOptionalContext(
  job: ClaimedTriageJob,
  aggregateText: string,
  decision: SupportTriageDecision
): Promise<void> {
  const supportCase = await createOrReuseCase(job, decision, "SECUREPAY_STAFF", aggregateText);
  await attachDecisionCase(job.channelMessageDbId, supportCase.caseId);

  if (decision.requiresSecurePayContext) {
    const client = resolveAutomatedSupportContextClient();
    if (client) {
      try {
        const context = await client.read(job.securepayIdentityRef, `WA:${supportCase.caseId}`);
        await appendWorkContext(supportCase.workItemId, `\n\nSECUREPAY CONTEXT (BOUNDED)\n${summarizeContext(context)}`);
      } catch (error) {
        await appendWorkContext(supportCase.workItemId, `\n\nSECUREPAY CONTEXT\nAutomatic fetch unavailable: ${safeError(error)}`);
      }
    }
  }

  await queueResponse(job, "I need a SecurePay team member to look at this rather than guess. I’ve queued it for review here.", "ACKNOWLEDGEMENT");
  await markChannelMessage(job.channelMessageDbId, "HUMAN_QUEUED");
}

async function queueHuman(
  job: ClaimedTriageJob,
  aggregateText: string,
  decision: SupportTriageDecision,
  queueKey: "PLUG_SUPPORT" | "SECUREPAY_STAFF" | "SENSITIVE_REVIEW",
  extraReason?: string
): Promise<void> {
  const supportCase = await createOrReuseCase(job, decision, queueKey, aggregateText, extraReason);
  await attachDecisionCase(job.channelMessageDbId, supportCase.caseId);
  if (queueKey === "PLUG_SUPPORT") {
    await queueResponse(job, "I’ve passed this to a SecurePay support person so they can help without guessing. You can continue the conversation here.", "ACKNOWLEDGEMENT");
  }
  await markChannelMessage(job.channelMessageDbId, "HUMAN_QUEUED");
}

async function createOrReuseCase(
  job: ClaimedTriageJob,
  decision: SupportTriageDecision,
  queueKey: string,
  aggregateText: string,
  extraReason?: string
): Promise<SupportCaseRef> {
  const subject = `WhatsApp ${decision.intent}`;
  const existing = rows<SupportCaseRef>(await db.execute(sql`
    SELECT c.id::text AS "caseId", c.work_item_id::text AS "workItemId"
      FROM trader_support_cases c
      JOIN work_items w ON w.id = c.work_item_id
     WHERE c.conversation_id = ${job.conversationId}::uuid
       AND c.subject = ${subject}
       AND c.state IN ('OPEN','WAITING_ON_TRADER','WAITING_INTERNAL')
       AND c.opened_at >= now() - interval '30 minutes'
     ORDER BY c.opened_at DESC LIMIT 1
  `))[0];
  if (existing) {
    await db.execute(sql`UPDATE trader_support_cases SET state = 'OPEN' WHERE id = ${existing.caseId}::uuid AND state = 'WAITING_ON_TRADER'`);
    await appendWorkContext(existing.workItemId, `\n\nCUSTOMER FOLLOW-UP\n${clip(aggregateText, 1800)}`);
    return existing;
  }

  const queue = rows<{ id: string }>(await db.execute(sql`
    SELECT id::text AS id FROM work_queues WHERE queue_key = ${queueKey} AND active = TRUE LIMIT 1
  `))[0];
  if (!queue) throw new Error(`Support queue ${queueKey} is unavailable`);

  const context = jobCard(job, decision, aggregateText, extraReason);
  return db.transaction(async (tx) => {
    const work = rows<{ id: string }>(await tx.execute(sql`
      INSERT INTO work_items (
        work_type, title, context, next_action, queue_id, priority, status, routing_reason
      ) VALUES (
        'CASE', ${subject}, ${context}, ${nextActionFor(queueKey)}, ${queue.id}::uuid,
        ${decision.priority}::work_priority, 'INBOX', ${decision.reason}
      ) RETURNING id::text AS id
    `))[0];
    if (!work) throw new Error("Support work item could not be created");

    const supportCase = rows<{ id: string }>(await tx.execute(sql`
      INSERT INTO trader_support_cases (conversation_id, work_item_id, subject)
      VALUES (${job.conversationId}::uuid, ${work.id}::uuid, ${subject})
      RETURNING id::text AS id
    `))[0];
    if (!supportCase) throw new Error("Support case could not be created");

    await tx.execute(sql`
      INSERT INTO work_history (work_item_id, event_type, metadata)
      VALUES (${work.id}::uuid, 'WHATSAPP_SUPPORT_CASE_OPENED', CAST(${JSON.stringify({ route: decision.route, intent: decision.intent })} AS jsonb))
    `);
    await tx.execute(sql`
      INSERT INTO trader_support_case_history (case_id, event_type, metadata)
      VALUES (${supportCase.id}::uuid, 'WHATSAPP_CASE_OPENED', CAST(${JSON.stringify({ route: decision.route, intent: decision.intent })} AS jsonb))
    `);
    return { caseId: supportCase.id, workItemId: work.id };
  });
}

async function claimJobs(limit: number): Promise<ClaimedTriageJob[]> {
  // Pre-existing or malformed jobs without an authoritative ingress snapshot are not
  // allowed to discover a current identity retroactively. Close them fail-closed.
  await db.execute(sql`
    WITH stale AS (
      UPDATE support_triage_jobs j
         SET status = 'DONE', locked_at = NULL, updated_at = now(),
             last_error = 'No authoritative WhatsApp binding snapshot was captured at ingress.'
        FROM support_channel_messages m
       WHERE j.channel_message_id = m.id
         AND j.status IN ('PENDING','FAILED')
         AND (
           m.binding_securepay_identity_ref IS NULL OR
           m.binding_authority_sequence IS NULL OR
           m.binding_assertion_id IS NULL
         )
      RETURNING m.id
    )
    UPDATE support_channel_messages m
       SET processing_status = 'STALE_BINDING', processed_at = now()
      FROM stale s
     WHERE m.id = s.id
  `);

  const result = await db.execute(sql`
    WITH picked AS (
      SELECT j.id
        FROM support_triage_jobs j
        JOIN support_channel_messages m ON m.id = j.channel_message_id
       WHERE j.status IN ('PENDING','FAILED')
         AND j.available_at <= now()
         AND j.attempts < 5
         AND m.support_conversation_id IS NOT NULL
         AND m.binding_securepay_identity_ref IS NOT NULL
         AND m.binding_authority_sequence IS NOT NULL
         AND m.binding_assertion_id IS NOT NULL
       ORDER BY j.created_at
       LIMIT ${limit}
       FOR UPDATE OF j SKIP LOCKED
    ), claimed AS (
      UPDATE support_triage_jobs j
         SET status = 'PROCESSING', attempts = attempts + 1, locked_at = now(), updated_at = now(), last_error = NULL
        FROM picked p
       WHERE j.id = p.id
       RETURNING j.id, j.channel_message_id, j.attempts
    )
    SELECT c.id::text AS "jobId", c.attempts,
           m.id::text AS "channelMessageDbId", m.channel_message_id AS "providerMessageId",
           m.channel_address AS "channelAddress", m.body,
           m.support_conversation_id::text AS "conversationId",
           m.binding_securepay_identity_ref AS "securepayIdentityRef",
           m.binding_authority_sequence AS "bindingAuthoritySequence",
           m.binding_assertion_id AS "bindingAssertionId",
           m.received_at AS "receivedAt"
      FROM claimed c
      JOIN support_channel_messages m ON m.id = c.channel_message_id
  `);
  return rows<Omit<ClaimedTriageJob, "bindingAuthoritySequence" | "receivedAt"> & {
    bindingAuthoritySequence: string | number;
    receivedAt: Date | string;
  }>(result).map((job) => ({
    ...job,
    bindingAuthoritySequence: Number(job.bindingAuthoritySequence),
    receivedAt: new Date(job.receivedAt),
  }));
}

async function bindingSnapshotStillCurrent(job: ClaimedTriageJob): Promise<boolean> {
  const current = rows<{ current: number }>(await db.execute(sql`
    SELECT 1 AS current
      FROM support_channel_identities
     WHERE channel = 'WHATSAPP'
       AND channel_address = ${job.channelAddress}
       AND securepay_identity_ref = ${job.securepayIdentityRef}
       AND binding_authority_sequence = ${job.bindingAuthoritySequence}
       AND binding_assertion_id = ${job.bindingAssertionId}
       AND revoked_at IS NULL
     LIMIT 1
  `));
  return current.length === 1;
}

async function aggregateConversation(conversationId: string, receivedAt: Date): Promise<{ text: string; count: number }> {
  const result = await db.execute(sql`
    SELECT body
      FROM trader_support_messages
     WHERE conversation_id = ${conversationId}::uuid
       AND actor_type = 'TRADER'
       AND created_at >= ${receivedAt} - interval '3 minutes'
       AND created_at <= ${receivedAt} + interval '1 second'
     ORDER BY created_at DESC
     LIMIT 8
  `);
  const messages = rows<{ body: string }>(result).reverse();
  return { text: messages.map((message) => message.body).join("\n"), count: Math.max(messages.length, 1) };
}

async function queueResponse(
  job: ClaimedTriageJob,
  body: string,
  purpose: "AUTO_GUIDANCE" | "AUTO_CONTEXT" | "ACKNOWLEDGEMENT"
): Promise<void> {
  await db.execute(sql`
    INSERT INTO support_channel_outbox (
      channel, channel_address, source_channel_message_id, support_conversation_id,
      body, reply_to_channel_message_id, purpose,
      expected_securepay_identity_ref, expected_binding_authority_sequence, expected_binding_assertion_id
    ) VALUES (
      'WHATSAPP', ${job.channelAddress}, ${job.channelMessageDbId}::uuid, ${job.conversationId}::uuid,
      ${clip(body, 4096)}, ${job.providerMessageId}, ${purpose},
      ${job.securepayIdentityRef}, ${job.bindingAuthoritySequence}, ${job.bindingAssertionId}
    )
    ON CONFLICT (source_channel_message_id, purpose) DO NOTHING
  `);
}

async function attachDecisionCase(channelMessageId: string, caseId: string): Promise<void> {
  await db.execute(sql`
    UPDATE support_triage_decisions SET support_case_id = ${caseId}::uuid
     WHERE channel_message_id = ${channelMessageId}::uuid
  `);
}

async function changeDecisionRoute(channelMessageId: string, route: SupportRoute, reason: string): Promise<void> {
  await db.execute(sql`
    UPDATE support_triage_decisions SET route = ${route}::support_triage_route, reason = ${reason}, decided_at = now()
     WHERE channel_message_id = ${channelMessageId}::uuid
  `);
}

async function appendWorkContext(workItemId: string, addition: string): Promise<void> {
  await db.execute(sql`
    UPDATE work_items SET context = left(context || ${addition}, 12000), updated_at = now()
     WHERE id = ${workItemId}::uuid
  `);
}

async function rerouteCase(supportCase: SupportCaseRef, queueKey: string, reason: string): Promise<void> {
  await db.execute(sql`
    UPDATE work_items
       SET queue_id = (SELECT id FROM work_queues WHERE queue_key = ${queueKey} AND active = TRUE LIMIT 1),
           status = 'INBOX', next_action = ${nextActionFor(queueKey)}, routing_reason = ${reason}, updated_at = now()
     WHERE id = ${supportCase.workItemId}::uuid
  `);
}

async function setCaseWaitingOnTrader(supportCase: SupportCaseRef): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`UPDATE trader_support_cases SET state = 'WAITING_ON_TRADER' WHERE id = ${supportCase.caseId}::uuid`);
    await tx.execute(sql`UPDATE work_items SET status = 'WAITING', next_action = 'Wait for the trader to identify the agreement, then re-evaluate.', updated_at = now() WHERE id = ${supportCase.workItemId}::uuid`);
  });
}

async function resolveCaseFromContext(supportCase: SupportCaseRef, sourceRef: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE trader_support_cases
         SET state = 'RESOLVED', resolution_kind = 'AUTHORITATIVE_CONTEXT',
             resolution_summary = 'Resolved automatically from the case-bound minimum SecurePay support projection.',
             authoritative_source_ref = ${sourceRef}, resolved_at = now()
       WHERE id = ${supportCase.caseId}::uuid
    `);
    await tx.execute(sql`
      UPDATE work_items SET status = 'DONE', completed_at = now(), updated_at = now()
       WHERE id = ${supportCase.workItemId}::uuid
    `);
  });
}

async function markChannelMessage(id: string, status: "TRIAGED" | "HUMAN_QUEUED" | "STALE_BINDING"): Promise<void> {
  await db.execute(sql`UPDATE support_channel_messages SET processing_status = ${status}, processed_at = now() WHERE id = ${id}::uuid`);
}

async function markJobDone(jobId: string): Promise<void> {
  await db.execute(sql`UPDATE support_triage_jobs SET status = 'DONE', locked_at = NULL, updated_at = now() WHERE id = ${jobId}::uuid`);
}

async function markJobFailed(job: ClaimedTriageJob, error: unknown): Promise<void> {
  const message = safeError(error);
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE support_triage_jobs
         SET status = 'FAILED', locked_at = NULL, last_error = ${message},
             available_at = now() + (least(attempts, 5) * interval '30 seconds'), updated_at = now()
       WHERE id = ${job.jobId}::uuid
    `);
    if (job.attempts >= 5) {
      await tx.execute(sql`UPDATE support_channel_messages SET processing_status = 'FAILED', processed_at = now() WHERE id = ${job.channelMessageDbId}::uuid`);
    }
  });
}

function jobCard(
  job: ClaimedTriageJob,
  decision: SupportTriageDecision,
  aggregateText: string,
  extraReason?: string
): string {
  return [
    `CUSTOMER\n${job.securepayIdentityRef}`,
    `WHAT THEY SAID\n${clip(aggregateText, 2200)}`,
    `OUTREACH TRIAGE\n${decision.intent} · ${decision.priority}\n${decision.reason}${extraReason ? ` ${extraReason}` : ""}`,
    `CURRENT STATUS\nAuthoritative SecurePay context is included below only when a bounded, case-purpose read succeeds.`,
    `JOB\n${nextActionFor(routeQueue(decision.route))}`,
    `BOUNDARY\nExplain and support only. Do not create, accept, change or progress an agreement in WhatsApp. Any agreement/trading action must happen on https://securepay.ke. Never ask for passwords, PINs or OTPs.`,
  ].join("\n\n");
}

function nextActionFor(queueKey: string): string {
  if (queueKey === "PLUG_SUPPORT") return "Understand the customer's need, explain the next safe step, and keep agreement/trading actions on securepay.ke.";
  if (queueKey === "SENSITIVE_REVIEW") return "Review carefully under SecurePay staff policy; ordinary Plugs must not handle this case.";
  if (queueKey === "SECUREPAY_STAFF") return "Review the authoritative SecurePay state needed for this issue and respond without guessing.";
  return "Resolve from bounded SecurePay context if unambiguous; otherwise escalate safely.";
}

function routeQueue(route: SupportRoute): string {
  if (route === "PLUG") return "PLUG_SUPPORT";
  if (route === "SENSITIVE_REVIEW") return "SENSITIVE_REVIEW";
  if (route === "SECUREPAY_STAFF") return "SECUREPAY_STAFF";
  return "TRADER_SUPPORT";
}

function summarizeContext(context: {
  identityStatus: string;
  agreements: Array<{
    publicReference: string;
    title: string;
    status: string;
    participantRole: string | null;
    attentionRequired: boolean;
    nextActions: Array<{ reason: string; deadline: string | null; attentionClass: string }>;
  }>;
}): string {
  const lines = [`Identity status: ${context.identityStatus}`, `Current agreements returned: ${context.agreements.length}`];
  for (const agreement of context.agreements.slice(0, 20)) {
    const action = agreement.nextActions[0];
    lines.push(
      `- ${agreement.publicReference} · ${clip(agreement.title, 120)} · ${agreement.status}` +
      `${agreement.participantRole ? ` · role ${agreement.participantRole}` : ""}` +
      `${agreement.attentionRequired ? " · ATTENTION" : ""}` +
      `${action ? ` · next: ${clip(action.reason, 180)}${action.deadline ? ` by ${action.deadline}` : ""}` : ""}`
    );
  }
  return lines.join("\n");
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown support-processing error";
  return clip(message.replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]"), 500);
}

function clip(value: string, max: number): string {
  const clean = value.trim();
  return clean.length <= max ? clean : `${clean.slice(0, Math.max(0, max - 1))}…`;
}

function rows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? []);
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      const item = items[index];
      if (item === undefined) return;
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}
