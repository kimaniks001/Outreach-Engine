import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/rbac/guard";
import { getWorkItem, listRoutingProfiles, listWorkHistory, listWorkItems, type WorkStatus } from "@/lib/work/work-engine";
import { listWorkHandovers } from "@/lib/people/remote-team";
import { addCollaboratorAction, addDependencyAction, assignOwnerAction, claimWorkAction, handoverWorkAction, routeWorkAction, statusWorkAction } from "../actions";

const CONTROL = "w-full rounded-xl border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand/40";

export default async function WorkDetailPage({ params }: { params: Promise<{ workItemId: string }> }) {
  const user = await requireUser();
  const { workItemId } = await params;
  let item;
  try { item = await getWorkItem(user.id, workItemId); } catch { notFound(); }
  const [history, people, visibleItems, handovers] = await Promise.all([
    listWorkHistory(user.id, workItemId),
    listRoutingProfiles(),
    listWorkItems(user.id, user.role === "OWNER"),
    listWorkHandovers(user.id,workItemId),
  ]);
  const dependencies = visibleItems.filter((candidate) => candidate.id !== item.id && !["DONE","CANCELLED"].includes(candidate.status));
  const terminal = ["DONE", "CANCELLED"].includes(item.status);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/work" className="text-xs font-semibold text-ink-muted hover:text-brand">← Work</Link>
        {item.sourceConversationId ? <Link href={`/conversations?conversation=${item.sourceConversationId}`} className="text-xs font-semibold text-brand">Open source conversation →</Link> : null}
      </div>

      <header className="rounded-[30px] border border-surface-border bg-surface-raised p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.15em]"><span className="rounded-full bg-brand-soft px-2.5 py-1 text-brand-muted">{humanize(item.workType)}</span><span className="rounded-full bg-surface px-2.5 py-1 text-ink-muted">{item.queueName}</span><span className="rounded-full bg-accent-soft/50 px-2.5 py-1 text-accent">{item.priority}</span></div>
            <h1 className="mt-4 max-w-4xl font-display text-4xl leading-tight text-ink">{item.title}</h1>
            {item.context ? <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-ink-muted">{item.context}</p> : null}
          </div>
          <span className="self-start rounded-full border border-surface-border bg-surface px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{humanize(item.status)}</span>
        </div>
        <div className="mt-7 grid gap-4 border-t border-surface-border pt-5 sm:grid-cols-2 lg:grid-cols-5">
          <Fact label="Owner" value={item.ownerName ?? "Unowned"} attention={!item.ownerUserId} />
          <Fact label="Next action" value={item.nextAction || "Agree the next action"} />
          <Fact label="SLA" value={item.slaDueAt ? formatDate(item.slaDueAt) : "None"} attention={Boolean(item.slaDueAt && item.slaDueAt.getTime() < Date.now() && !terminal)} />
          <Fact label="Due" value={item.dueAt ? formatDate(item.dueAt) : "None"} />
          <Fact label="Blocking" value={item.blockedByCount ? `${item.blockedByCount} dependencies` : "Clear"} attention={item.blockedByCount > 0} />
        </div>
        {item.routingReason ? <div className="mt-5 rounded-2xl bg-brand-soft/35 px-4 py-3 text-xs leading-5 text-brand-muted"><span className="font-semibold">Routing:</span> {item.routingReason}</div> : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-[26px] border border-surface-border bg-surface-raised p-5 shadow-sm sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-faint">History</p>
          <h2 className="mt-1 font-display text-2xl text-ink">How responsibility moved</h2>
          {history.length === 0 ? <p className="mt-5 text-sm text-ink-muted">No history yet.</p> : (
            <ol className="mt-5 space-y-0">
              {history.map((entry, index) => (
                <li key={entry.id} className="relative grid grid-cols-[18px_1fr] gap-3 pb-5 last:pb-0">
                  <div className="relative"><span className="absolute left-[7px] top-2 h-2 w-2 rounded-full bg-brand" />{index < history.length - 1 ? <span className="absolute left-[10px] top-4 h-[calc(100%+2px)] w-px bg-surface-border" /> : null}</div>
                  <div><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-ink">{humanize(entry.eventType)}</p><time className="text-[10px] text-ink-faint">{formatDate(entry.createdAt)}</time></div><p className="mt-1 text-xs text-ink-muted">{entry.actorName ?? "System"}{Object.keys(entry.metadata).length ? ` · ${compactMetadata(entry.metadata)}` : ""}</p></div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="space-y-4">
          {!terminal ? <section className="rounded-[24px] border border-surface-border bg-surface-raised p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand">Move the work</p>
            <div className="mt-4 space-y-3">
              {!item.ownerUserId ? <form action={claimWorkAction}><input type="hidden" name="workItemId" value={item.id} /><button className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white">Claim responsibility</button></form> : null}
              <form action={routeWorkAction}><input type="hidden" name="workItemId" value={item.id} /><button className="w-full rounded-xl border border-brand/25 bg-brand-soft/35 px-4 py-2.5 text-sm font-semibold text-brand-muted">Route by fit + workload</button></form>
              <form action={statusWorkAction} className="flex gap-2"><input type="hidden" name="workItemId" value={item.id} /><select name="status" className={CONTROL} defaultValue={nextStatuses(item.status)[0] ?? item.status}>{nextStatuses(item.status).map((status) => <option key={status}>{status}</option>)}</select><button className="rounded-xl border border-surface-border px-3 text-xs font-semibold text-ink-muted">Move</button></form>
            </div>
          </section> : null}
          {!terminal&&item.ownerUserId===user.id&&item.workType!=="INCIDENT"?<section className="rounded-[24px] border border-surface-border bg-surface-raised p-5 shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-brand">Handover</p><form action={handoverWorkAction} className="mt-3 space-y-2"><input type="hidden" name="workItemId" value={item.id}/><select name="toUserId" defaultValue="" className={CONTROL}><option value="" disabled>Choose next owner</option>{people.filter(p=>p.userId!==user.id).map(p=><option key={p.userId} value={p.userId}>{p.name} · {p.timezone}</option>)}</select><textarea name="summary" required maxLength={4000} placeholder="What has happened and what matters?" className={CONTROL}/><input name="nextAction" required maxLength={500} defaultValue={item.nextAction} placeholder="Exact next action" className={CONTROL}/><button className="rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white">Hand over with context</button></form>{handovers.length?<p className="mt-3 text-xs text-ink-faint">{handovers.length} immutable handover{handovers.length===1?"":"s"} recorded</p>:null}</section>:null}

          {!terminal ? <section className="rounded-[24px] border border-surface-border bg-surface-raised p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-faint">Ownership</p>
            <form action={assignOwnerAction} className="mt-3 flex gap-2"><input type="hidden" name="workItemId" value={item.id} /><select name="ownerUserId" className={CONTROL} defaultValue={item.ownerUserId ?? ""}><option value="">Return to queue</option>{people.map((person) => <option key={person.userId} value={person.userId}>{person.name} · {humanize(person.role)}</option>)}</select><button className="rounded-xl bg-surface px-3 text-xs font-semibold text-ink-muted">Set</button></form>
            <form action={addCollaboratorAction} className="mt-3 flex gap-2"><input type="hidden" name="workItemId" value={item.id} /><select name="collaboratorUserId" className={CONTROL} defaultValue=""><option value="" disabled>Add collaborator</option>{people.map((person) => <option key={person.userId} value={person.userId}>{person.name}</option>)}</select><button className="rounded-xl bg-surface px-3 text-xs font-semibold text-ink-muted">Add</button></form>
          </section> : null}

          {!terminal && dependencies.length > 0 ? <section className="rounded-[24px] border border-surface-border bg-surface-raised p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-faint">Dependencies</p>
            <p className="mt-2 text-xs leading-5 text-ink-muted">A blocking dependency must finish or be cancelled before this work can complete.</p>
            <form action={addDependencyAction} className="mt-3 flex gap-2"><input type="hidden" name="workItemId" value={item.id} /><select name="dependsOnWorkItemId" className={CONTROL} defaultValue=""><option value="" disabled>Choose blocker</option>{dependencies.slice(0, 50).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select><button className="rounded-xl bg-surface px-3 text-xs font-semibold text-ink-muted">Add</button></form>
          </section> : null}

          <section className="rounded-[24px] border border-surface-border bg-surface p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-faint">Responsibility contract</p>
            <p className="mt-2 text-xs leading-5 text-ink-muted">This object coordinates internal work. It does not grant identity, agreement, payment, release, settlement, Plug attribution or any other SecurePay authority.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function nextStatuses(status: WorkStatus): WorkStatus[] {
  const map: Record<WorkStatus, WorkStatus[]> = {
    INBOX: ["READY", "CANCELLED"], READY: ["IN_PROGRESS", "WAITING", "BLOCKED", "CANCELLED"], IN_PROGRESS: ["WAITING", "BLOCKED", "DONE", "CANCELLED"], WAITING: ["READY", "IN_PROGRESS", "CANCELLED"], BLOCKED: ["READY", "IN_PROGRESS", "CANCELLED"], DONE: [], CANCELLED: [],
  };
  return map[status];
}
function Fact({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) { return <div><p className="text-[10px] uppercase tracking-[0.15em] text-ink-faint">{label}</p><p className={`mt-1 text-sm font-medium ${attention ? "text-accent" : "text-ink"}`}>{value}</p></div>; }
function humanize(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/^./, (m) => m.toUpperCase()); }
function formatDate(value: Date) { return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(value); }
function compactMetadata(metadata: Record<string, unknown>) { return Object.entries(metadata).slice(0, 3).map(([key, value]) => `${humanize(key)}: ${String(value)}`).join(" · "); }
