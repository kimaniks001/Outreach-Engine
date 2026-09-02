import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/rbac/guard";
import { listVisibleConversationMessages, listVisibleSupportCases } from "@/lib/trader-support/support-visibility";

export default async function TraderCaseRoomPage({ params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireUser();
  const { caseId } = await params;
  const supportCase = (await listVisibleSupportCases(user.id)).find((item) => item.id === caseId);
  if (!supportCase) notFound();
  const messages = await listVisibleConversationMessages(user.id, supportCase.conversationId);

  return (
    <div className="mx-auto max-w-6xl outreach-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/traders" className="text-sm font-semibold text-brand hover:text-brand-muted">← Trader Support</Link>
        <Link href={`/work/${supportCase.workItemId}`} className="rounded-full border border-surface-border px-4 py-2 text-sm font-semibold text-ink transition hover:border-brand/30 hover:text-brand">Open responsibility</Link>
      </div>

      <section className="mt-5 overflow-hidden rounded-[30px] border border-brand/15 bg-surface-raised shadow-quiet">
        <div className="grid gap-6 px-6 py-7 sm:px-8 lg:grid-cols-[1.3fr_.7fr] lg:px-10">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Secure Resolution Room · support</p>
            <h1 className="mt-3 font-display text-4xl leading-tight text-ink">{supportCase.subject}</h1>
            <p className="mt-3 text-sm leading-6 text-ink-muted">The trader conversation stays intact here while the team coordinates responsibility behind it. Internal ownership changes do not become trader-facing departmental hand-offs.</p>
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
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">One trader conversation</p><h2 className="mt-1 font-display text-3xl text-ink">Ask SecurePay</h2></div>
            <span className="text-xs text-ink-faint">{messages.length} message{messages.length === 1 ? "" : "s"}</span>
          </div>
          <div className="mt-5 space-y-4">
            {messages.length === 0 ? <p className="rounded-2xl bg-surface-soft p-4 text-sm text-ink-muted">No messages have been recorded in this support conversation yet.</p> : messages.map((message) => {
              const trader = message.actorType === "TRADER";
              return <div key={message.id} className={`flex ${trader ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${trader ? "bg-surface-soft text-ink" : "bg-brand text-white"}`}>
                  <div className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${trader ? "text-ink-faint" : "text-white/60"}`}>{trader ? "Trader" : message.actorName ?? "SecurePay"}</div>
                  <p className="mt-1 text-sm leading-6">{message.body}</p>
                  {message.sourceKind ? <p className={`mt-2 text-[10px] ${trader ? "text-ink-faint" : "text-white/55"}`}>Grounded · {message.sourceKind.replaceAll("_", " ")}</p> : null}
                </div>
              </div>;
            })}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-surface-border bg-surface-raised p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Next action</p>
            <p className="mt-2 text-sm leading-6 text-ink">{supportCase.nextAction || "Agree the next action."}</p>
            <p className="mt-4 text-xs leading-5 text-ink-faint">Responsibility and SLA are governed by the linked Work item, so this room never becomes a second competing task system.</p>
          </div>
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

function RoomRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 border-t border-white/15 py-3 first:border-0 first:pt-0 last:pb-0"><span className="text-xs text-white/60">{label}</span><span className="text-sm font-semibold text-white">{value}</span></div>;
}
