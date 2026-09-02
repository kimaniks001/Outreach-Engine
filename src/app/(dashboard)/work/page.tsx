import Link from "next/link";
import { requireUser } from "@/lib/rbac/guard";
import { listConversationWorkDrafts } from "@/lib/work/conversation-intake";
import { listRoutingProfiles, listWorkItems, listWorkQueues, type WorkItem } from "@/lib/work/work-engine";
import { claimWorkAction, convertDraftAction, createWorkAction, routeWorkAction, updateMyRoutingProfileAction } from "./actions";

const FIELD = "w-full rounded-2xl border border-surface-border bg-surface-raised px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/45 focus:ring-2 focus:ring-brand-soft";

export default async function WorkPage() {
  const user = await requireUser();
  const [items, queues, drafts, routingProfiles] = await Promise.all([
    listWorkItems(user.id, user.role === "OWNER"),
    listWorkQueues(),
    listConversationWorkDrafts(user.id),
    listRoutingProfiles(),
  ]);
  const mine = items.filter((item) => item.ownerUserId === user.id && !isTerminal(item));
  const unowned = items.filter((item) => !item.ownerUserId && !isTerminal(item));
  const urgent = items.filter((item) => ["URGENT", "CRITICAL"].includes(item.priority) && !isTerminal(item));
  const blocked = items.filter((item) => item.status === "BLOCKED" || item.blockedByCount > 0);
  const myProfile = routingProfiles.find((profile) => profile.userId === user.id);

  return (
    <div className="mx-auto max-w-[1480px] space-y-7">
      <header className="overflow-hidden rounded-[30px] border border-surface-border bg-surface-raised shadow-sm">
        <div className="grid gap-0 xl:grid-cols-[1.45fr_0.75fr]">
          <div className="p-6 sm:p-8 lg:p-10">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.23em] text-brand">
              <span className="h-2 w-2 rounded-full bg-brand" />
              Work · responsibility engine
            </div>
            <h1 className="mt-5 max-w-3xl font-display text-4xl leading-[1.04] text-ink sm:text-5xl">
              Nothing important should live only in someone&apos;s memory.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-ink-muted sm:text-base">
              Every actionable item has a queue, owner, priority, state, SLA, context, history and a clear next action. Conversations can become work without losing their origin.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              <Metric label="Mine" value={mine.length} />
              <Metric label="Unowned" value={unowned.length} attention={unowned.length > 0} />
              <Metric label="Urgent" value={urgent.length} attention={urgent.length > 0} />
              <Metric label="Blocked" value={blocked.length} attention={blocked.length > 0} />
              <Metric label="Conversation drafts" value={drafts.length} />
            </div>
          </div>
          <div className="border-t border-surface-border bg-brand-deep p-6 text-white xl:border-l xl:border-t-0 sm:p-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">My routing signal</p>
            <p className="mt-3 font-display text-2xl">Available where I actually work.</p>
            <p className="mt-2 text-sm leading-6 text-white/70">This helps Outreach suggest responsibility. It never expands your SecurePay authority.</p>
            <form action={updateMyRoutingProfileAction} className="mt-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input name="timezone" defaultValue={myProfile?.timezone ?? "Africa/Nairobi"} className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40" aria-label="Timezone" />
                <input name="languages" defaultValue={(myProfile?.languages ?? ["en"]).join(", ")} className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40" aria-label="Languages" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-white/75"><input type="checkbox" name="available" defaultChecked={myProfile?.available ?? true} /> Available</label>
                <label className="flex items-center gap-2 text-xs text-white/75">Capacity <input name="maxActiveWork" type="number" min="1" max="200" defaultValue={myProfile?.maxActiveWork ?? 20} className="w-16 rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-white" /></label>
                <button className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-brand-deep">Update</button>
              </div>
            </form>
          </div>
        </div>
      </header>

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,0.65fr)]">
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-faint">Responsibility now</p>
              <h2 className="mt-1 font-display text-3xl text-ink">Work that can move</h2>
            </div>
            <span className="text-xs text-ink-faint">{items.length} visible to you</span>
          </div>

          {items.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              {items.map((item) => <WorkCard key={item.id} item={item} userId={user.id} />)}
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-[26px] border border-surface-border bg-surface-raised p-5 shadow-sm sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">Create work</p>
            <h2 className="mt-2 font-display text-2xl text-ink">Make responsibility explicit.</h2>
            <form action={createWorkAction} className="mt-5 space-y-3">
              <input name="title" required minLength={2} maxLength={180} placeholder="What needs to happen?" className={FIELD} />
              <textarea name="context" rows={3} placeholder="Context someone needs to do this well" className={FIELD} />
              <input name="nextAction" placeholder="What happens next?" className={FIELD} />
              <div className="grid grid-cols-2 gap-3">
                <select name="workType" className={FIELD} defaultValue="TASK">
                  {(["TASK","FOLLOW_UP","CASE","INCIDENT","APPROVAL","KNOWLEDGE","SCHEDULE","PROJECT"] as const).map((type) => <option key={type}>{type}</option>)}
                </select>
                <select name="priority" className={FIELD} defaultValue="NORMAL">
                  {(["LOW","NORMAL","HIGH","URGENT","CRITICAL"] as const).map((priority) => <option key={priority}>{priority}</option>)}
                </select>
              </div>
              <select name="queueKey" className={FIELD} defaultValue="GENERAL">
                {queues.map((queue) => <option value={queue.queueKey} key={queue.id}>{queue.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-ink-muted">Due<input name="dueAt" type="datetime-local" className={`${FIELD} mt-1`} /></label>
                <label className="text-xs text-ink-muted">Schedule<input name="scheduledFor" type="datetime-local" className={`${FIELD} mt-1`} /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select name="recurrenceRule" className={FIELD} defaultValue=""><option value="">One-off</option><option>DAILY</option><option>WEEKLY</option><option>MONTHLY</option></select>
                <input name="requiredLanguage" placeholder="Language e.g. sw" className={FIELD} />
              </div>
              <details className="rounded-2xl border border-surface-border bg-surface px-4 py-3">
                <summary className="cursor-pointer text-xs font-semibold text-ink-muted">Routing requirements</summary>
                <div className="mt-3 space-y-3">
                  <select name="requiredRole" className={FIELD} defaultValue=""><option value="">Any staff role</option>{Array.from(new Set(routingProfiles.map((p) => p.role))).map((role) => <option key={role}>{role}</option>)}</select>
                  <input name="preferredTimezone" placeholder="Preferred timezone" className={FIELD} />
                </div>
              </details>
              <button className="w-full rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-muted">Create work item</button>
            </form>
          </section>

          <section className="rounded-[26px] border border-surface-border bg-surface-raised p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">From conversations</p><h2 className="mt-1 font-display text-2xl text-ink">Ready to become work</h2></div>
              <span className="rounded-full bg-accent-soft/60 px-2.5 py-1 text-xs font-semibold text-accent">{drafts.length}</span>
            </div>
            {drafts.length === 0 ? <p className="mt-4 text-sm text-ink-muted">No conversation action drafts are waiting.</p> : (
              <div className="mt-4 space-y-3">
                {drafts.slice(0, 6).map((draft) => (
                  <div key={draft.id} className="rounded-2xl border border-surface-border bg-surface p-3.5">
                    <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">{humanize(draft.actionType)}</span><span className="text-[10px] text-ink-faint">{draft.conversationTitle}</span></div>
                    <p className="mt-2 line-clamp-3 text-sm leading-5 text-ink">{draft.sourceBody || "Conversation action"}</p>
                    <form action={convertDraftAction} className="mt-3"><input type="hidden" name="draftId" value={draft.id} /><button className="text-xs font-semibold text-brand hover:text-brand-muted">Make this real work →</button></form>
                  </div>
                ))}
              </div>
            )}
            <Link href="/conversations" className="mt-4 inline-block text-xs font-medium text-ink-muted hover:text-brand">Open Conversations</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

function WorkCard({ item, userId }: { item: WorkItem; userId: string }) {
  const terminal = isTerminal(item);
  const due = item.slaDueAt ?? item.dueAt;
  const late = !terminal && Boolean(due && due.getTime() < Date.now());
  return (
    <article className={`rounded-[24px] border bg-surface-raised p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${late ? "border-accent/45" : "border-surface-border"}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityPill priority={item.priority} />
            <span className="rounded-full bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-ink-muted">{humanize(item.workType)}</span>
            <span className="text-[11px] text-ink-faint">{item.queueName}</span>
          </div>
          <Link href={`/work/${item.id}`} className="mt-3 block font-display text-[24px] leading-tight text-ink hover:text-brand">{item.title}</Link>
          {item.nextAction ? <p className="mt-2 text-sm text-ink-muted"><span className="font-semibold text-ink">Next:</span> {item.nextAction}</p> : null}
        </div>
        <StatusPill status={item.status} />
      </div>
      <div className="mt-4 grid gap-3 border-t border-surface-border/70 pt-4 text-xs sm:grid-cols-4">
        <Info label="Owner" value={item.ownerName ?? "Unowned"} attention={!item.ownerUserId} />
        <Info label="SLA / due" value={due ? formatDate(due) : "No deadline"} attention={late} />
        <Info label="Dependencies" value={item.blockedByCount ? `${item.blockedByCount} blocking` : "Clear"} attention={item.blockedByCount > 0} />
        <Info label="Collaborators" value={String(item.collaboratorCount)} />
      </div>
      {!terminal ? <div className="mt-4 flex flex-wrap gap-2">
        {!item.ownerUserId ? <form action={claimWorkAction}><input type="hidden" name="workItemId" value={item.id} /><button className="rounded-full bg-brand px-3.5 py-2 text-xs font-semibold text-white">Claim</button></form> : null}
        {(item.ownerUserId === userId || !item.ownerUserId) ? <form action={routeWorkAction}><input type="hidden" name="workItemId" value={item.id} /><button className="rounded-full border border-surface-border bg-surface px-3.5 py-2 text-xs font-semibold text-ink-muted hover:border-brand/30 hover:text-brand">Route by fit</button></form> : null}
        <Link href={`/work/${item.id}`} className="rounded-full border border-surface-border bg-surface px-3.5 py-2 text-xs font-semibold text-ink-muted hover:border-brand/30 hover:text-brand">Open work</Link>
      </div> : null}
    </article>
  );
}

function EmptyState() { return <div className="rounded-[28px] border border-dashed border-surface-border bg-surface-raised px-6 py-12 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-xl text-brand">✓</div><h3 className="mt-4 font-display text-2xl text-ink">Nothing is waiting here.</h3><p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">Create work deliberately or turn a conversation action into a governed responsibility item.</p></div>; }
function Metric({ label, value, attention = false }: { label: string; value: number; attention?: boolean }) { return <div className={`rounded-full border px-3.5 py-2 text-xs ${attention ? "border-accent/30 bg-accent-soft/45 text-accent" : "border-surface-border bg-surface text-ink-muted"}`}><span className="font-semibold">{value}</span> {label}</div>; }
function PriorityPill({ priority }: { priority: WorkItem["priority"] }) { const attention = ["URGENT","CRITICAL"].includes(priority); return <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] ${attention ? "bg-accent-soft/65 text-accent" : priority === "HIGH" ? "bg-status-warn/12 text-status-warn" : "bg-brand-soft/55 text-brand-muted"}`}>{priority}</span>; }
function StatusPill({ status }: { status: WorkItem["status"] }) { const cls = status === "DONE" ? "bg-status-good/12 text-status-good" : status === "BLOCKED" ? "bg-accent-soft/65 text-accent" : status === "IN_PROGRESS" ? "bg-brand-soft text-brand-muted" : "bg-surface text-ink-muted"; return <span className={`self-start rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${cls}`}>{humanize(status)}</span>; }
function Info({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) { return <div><p className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">{label}</p><p className={`mt-1 font-medium ${attention ? "text-accent" : "text-ink"}`}>{value}</p></div>; }
function humanize(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/^./, (m) => m.toUpperCase()); }
function formatDate(value: Date) { return new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(value); }
function isTerminal(item: WorkItem) { return item.status === "DONE" || item.status === "CANCELLED"; }
