import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/rbac/guard";
import { resolveSupportContextConnection } from "@/lib/trader-support/support-context-connection";
import type { SecurePaySupportContext } from "@/lib/trader-support/securepay-support-context-client";
import {
  listVisibleConversationMessages,
  listVisibleSupportCases,
  visibleSupportContextTarget,
} from "@/lib/trader-support/support-visibility";
import {
  replyToTraderAction,
  resolveSupportCaseAction,
  updateSupportCaseStateAction,
} from "./actions";

type PageParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TraderCaseRoomPage({ params, searchParams }: { params: Promise<{ caseId: string }>; searchParams: PageParams }) {
  const user = await requireUser();
  const { caseId } = await params;
  const notices = await searchParams;
  const supportCase = (await listVisibleSupportCases(user.id)).find((item) => item.id === caseId);
  if (!supportCase) notFound();

  const [messages, target, connection] = await Promise.all([
    listVisibleConversationMessages(user.id, supportCase.conversationId),
    visibleSupportContextTarget(user.id, caseId),
    resolveSupportContextConnection(),
  ]);

  let securePayContext: SecurePaySupportContext | null = null;
  let contextState: "READY" | "UNAVAILABLE" | "NOT_AUTHORISED" = "UNAVAILABLE";
  if (connection.status === "CONNECTED") {
    try {
      securePayContext = await connection.client.read(target.securepayIdentityRef, caseId);
      contextState = "READY";
    } catch (error) {
      const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
      contextState = status === 401 || status === 403 ? "NOT_AUTHORISED" : "UNAVAILABLE";
    }
  }

  const terminal = supportCase.state === "RESOLVED" || supportCase.state === "CLOSED";
  const error = scalar(notices.error);

  return (
    <div className="mx-auto max-w-6xl outreach-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/traders" className="text-sm font-semibold text-brand hover:text-brand-muted">← Trader Support</Link>
        <Link href={`/work/${supportCase.workItemId}`} className="rounded-full border border-surface-border px-4 py-2 text-sm font-semibold text-ink transition hover:border-brand/30 hover:text-brand">Open responsibility</Link>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {scalar(notices.sent) === "1" ? <Notice tone="good">Reply recorded and queued for WhatsApp delivery.</Notice> : null}
      {scalar(notices.updated) === "1" ? <Notice tone="good">Case state updated.</Notice> : null}
      {scalar(notices.resolved) === "1" ? <Notice tone="good">Case resolved with a human resolution record.</Notice> : null}

      <section className="mt-5 overflow-hidden rounded-[30px] border border-brand/15 bg-surface-raised shadow-quiet">
        <div className="grid gap-6 px-6 py-7 sm:px-8 lg:grid-cols-[1.3fr_.7fr] lg:px-10">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Secure Resolution Room · support</p>
            <h1 className="mt-3 font-display text-4xl leading-tight text-ink">{supportCase.subject}</h1>
            <p className="mt-3 text-sm leading-6 text-ink-muted">The customer stays in one WhatsApp conversation. Outreach carries the internal routing, bounded SecurePay context and human responsibility behind it without pretending to be a transaction surface.</p>
          </div>
          <div className="rounded-3xl bg-brand p-5 text-white">
            <RoomRow label="Case state" value={supportCase.state.replaceAll("_", " ")} />
            <RoomRow label="Priority" value={supportCase.priority} />
            <RoomRow label="Owner" value={supportCase.ownerName ?? "Shared queue"} />
            <RoomRow label="SLA" value={supportCase.slaDueAt ? supportCase.slaDueAt.toLocaleString() : "Not set"} />
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
        <section className="rounded-3xl border border-surface-border bg-surface-raised p-5 shadow-sm sm:p-6">
          <div className="flex items-end justify-between gap-3">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">One customer conversation</p><h2 className="mt-1 font-display text-3xl text-ink">WhatsApp support</h2></div>
            <span className="text-xs text-ink-faint">{messages.length} message{messages.length === 1 ? "" : "s"}</span>
          </div>
          <div className="mt-5 max-h-[520px] space-y-4 overflow-y-auto pr-1">
            {messages.length === 0 ? <p className="rounded-2xl bg-surface-soft p-4 text-sm text-ink-muted">No messages have been recorded in this support conversation yet.</p> : messages.map((message) => {
              const trader = message.actorType === "TRADER";
              return <div key={message.id} className={`flex ${trader ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${trader ? "bg-surface-soft text-ink" : "bg-brand text-white"}`}>
                  <div className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${trader ? "text-ink-faint" : "text-white/60"}`}>{trader ? "Customer" : message.actorName ?? "SecurePay"}</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                  {message.sourceKind ? <p className={`mt-2 text-[10px] ${trader ? "text-ink-faint" : "text-white/55"}`}>Grounded · {message.sourceKind.replaceAll("_", " ")}</p> : null}
                </div>
              </div>;
            })}
          </div>

          {!terminal ? <form action={replyToTraderAction} className="mt-6 rounded-2xl border border-brand/15 bg-brand-soft/20 p-4">
            <input type="hidden" name="caseId" value={supportCase.id} />
            <input type="hidden" name="conversationId" value={supportCase.conversationId} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-xs font-semibold text-brand">Reply on WhatsApp</p><p className="mt-1 text-[10px] text-ink-faint">Support communication only. Money, agreement, release, settlement or identity actions remain on securepay.ke.</p></div>
              <select name="afterSend" defaultValue="WAITING_ON_TRADER" className="rounded-xl border border-surface-border bg-surface-raised px-3 py-2 text-xs text-ink outline-none focus:border-brand/40">
                <option value="WAITING_ON_TRADER">Then wait for customer</option>
                <option value="OPEN">Keep case active</option>
                <option value="WAITING_INTERNAL">Then wait internally</option>
              </select>
            </div>
            <textarea name="body" required minLength={1} maxLength={4096} rows={4} placeholder="Write a clear human reply…" className="mt-3 w-full resize-y rounded-2xl border border-surface-border bg-surface-raised px-4 py-3 text-sm leading-6 text-ink outline-none placeholder:text-ink-faint focus:border-brand/40" />
            <div className="mt-3 flex items-center justify-between gap-3"><p className="text-[10px] text-ink-faint">The reply is persisted first, then delivered through the durable WhatsApp outbox.</p><button className="rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-muted">Queue reply</button></div>
          </form> : null}
        </section>

        <aside className="space-y-4">
          <SupportContextCard context={securePayContext} state={contextState} />

          {!terminal ? <div className="rounded-3xl border border-surface-border bg-surface-raised p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Case handling</p>
            <p className="mt-2 text-sm leading-6 text-ink">{supportCase.nextAction || "Agree the next action."}</p>
            <form action={updateSupportCaseStateAction} className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              <input type="hidden" name="caseId" value={supportCase.id} />
              <button name="state" value="OPEN" className="rounded-xl border border-surface-border px-3 py-2 text-xs font-semibold text-ink-muted hover:border-brand/30">Working now</button>
              <button name="state" value="WAITING_ON_TRADER" className="rounded-xl border border-surface-border px-3 py-2 text-xs font-semibold text-ink-muted hover:border-brand/30">Waiting on customer</button>
              <button name="state" value="WAITING_INTERNAL" className="rounded-xl border border-surface-border px-3 py-2 text-xs font-semibold text-ink-muted hover:border-brand/30">Waiting internally</button>
            </form>
            <form action={resolveSupportCaseAction} className="mt-4 border-t border-surface-border pt-4">
              <input type="hidden" name="caseId" value={supportCase.id} />
              <textarea name="summary" required minLength={2} maxLength={2000} rows={3} placeholder="Resolution summary" className="w-full rounded-xl border border-surface-border bg-surface px-3 py-2 text-xs leading-5 text-ink outline-none focus:border-brand/40" />
              <button className="mt-2 w-full rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white">Resolve case</button>
            </form>
            <p className="mt-4 text-[10px] leading-4 text-ink-faint">Responsibility and SLA remain governed by the linked Work item. These controls update the same support case rather than creating a second ticket system.</p>
          </div> : <div className="rounded-3xl border border-brand/15 bg-brand-soft/35 p-5"><p className="text-xs font-semibold text-brand">This case is {supportCase.state.toLowerCase()}.</p><p className="mt-2 text-xs leading-5 text-ink-muted">A new inbound issue can create a new support case without overwriting this resolution record.</p></div>}

          <div className="rounded-3xl bg-surface-inverse p-5 text-white">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">Grounded support</p>
            <p className="mt-2 text-sm leading-6 text-white/75">AI or staff may explain authoritative context, but a money, agreement, release, settlement, fee or identity answer must come from SecurePay truth or approved guidance—not inference.</p>
            <p className="mt-4 text-xs text-white/50">Room viewed by {user.name}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SupportContextCard({ context, state }: { context: SecurePaySupportContext | null; state: "READY" | "UNAVAILABLE" | "NOT_AUTHORISED" }) {
  if (!context) {
    return <div className="rounded-3xl border border-surface-border bg-surface-raised p-5 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">SecurePay context</p>
      <p className="mt-2 text-sm font-semibold text-ink">{state === "NOT_AUTHORISED" ? "Private context stays closed" : "Context is temporarily unavailable"}</p>
      <p className="mt-2 text-xs leading-5 text-ink-muted">{state === "NOT_AUTHORISED" ? "This operator does not have the case-limited support read authority. Outreach will not widen access or try another customer lookup." : "The case can continue with human support, but authoritative product or money answers must wait for SecurePay context or approved guidance."}</p>
    </div>;
  }

  const attention = context.agreements.filter((agreement) => agreement.attentionRequired);
  const next = context.agreements.flatMap((agreement) => agreement.nextActions.map((action) => ({ ...action, agreement: agreement.publicReference }))).slice(0, 3);
  return <div className="rounded-3xl border border-brand/15 bg-[#f6f3ea] p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">SecurePay truth · minimum view</p><p className="mt-2 font-display text-2xl text-ink">{context.traderDisplayName || "Customer"}</p></div><span className="rounded-full bg-brand/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand">{context.identityStatus}</span></div>
    <div className="mt-4 grid grid-cols-2 gap-3"><Metric label="Relevant agreements" value={String(context.agreements.length)} /><Metric label="Need attention" value={String(attention.length)} /></div>
    <div className="mt-4 border-t border-brand/10 pt-4"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-faint">Authoritative next actions</p>{next.length === 0 ? <p className="mt-2 text-xs leading-5 text-ink-muted">No participant next action is currently projected.</p> : <div className="mt-2 space-y-2">{next.map((action, index) => <div key={`${action.agreement}-${action.actionCode}-${index}`} className="rounded-2xl bg-white/70 px-3 py-2"><p className="text-xs font-semibold text-ink">{action.reason}</p><p className="mt-1 text-[10px] text-ink-faint">{action.agreement}{action.deadline ? ` · by ${new Date(action.deadline).toLocaleString()}` : ""}</p></div>)}</div>}</div>
    <p className="mt-4 text-[10px] leading-4 text-ink-faint">Case-bound read · no contacts, documents, balances, ledger or unrelated account history.</p>
  </div>;
}

function Notice({ children, tone }: { children: React.ReactNode; tone: "good" | "error" }) { return <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${tone === "good" ? "border-brand/15 bg-brand-soft/35 text-brand-muted" : "border-red-200 bg-red-50 text-red-700"}`}>{children}</div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-white/70 p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">{label}</p><p className="mt-1 text-xl font-semibold text-ink">{value}</p></div>; }
function RoomRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-3 border-t border-white/15 py-3 first:border-0 first:pt-0 last:pb-0"><span className="text-xs text-white/60">{label}</span><span className="text-sm font-semibold text-white">{value}</span></div>; }
function scalar(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
