import Link from "next/link";
import { requireUser } from "@/lib/rbac/guard";
import { listStaffDirectory } from "@/lib/conversations/staff-conversations";
import { listServiceSignals, listVisibleIncidents } from "@/lib/operations/incident-engine";
import { openIncidentAction, recordSignalAction } from "./actions";

export default async function OperationsPage() {
  const user = await requireUser();
  const [incidents, signals, staff] = await Promise.all([listVisibleIncidents(user.id), listServiceSignals(user.id, 20), listStaffDirectory()]);
  const active = incidents.filter((item) => !["RESOLVED", "CLOSED"].includes(item.state));
  const critical = active.filter((item) => item.severity === "SEV1" || item.severity === "SEV2");
  const affectedEstimate = active.reduce((sum, item) => sum + item.affectedTraderCount, 0);

  return (
    <div className="mx-auto max-w-7xl outreach-rise">
      <section className="overflow-hidden rounded-[30px] border border-brand/15 bg-surface-raised shadow-quiet">
        <div className="grid gap-7 px-6 py-8 sm:px-8 lg:grid-cols-[1.25fr_.75fr] lg:px-10 lg:py-10">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">Operations · Incident Command</p>
            <h1 className="mt-4 max-w-3xl font-display text-4xl leading-[1.04] text-ink sm:text-5xl">See the disruption. Give it an owner. Keep one calm chronology.</h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-ink-muted">Outreach coordinates operational response through one incident room, one Work responsibility and evidence-backed updates. It does not acquire SecurePay payment, release, settlement or provider authority.</p>
          </div>
          <div className="rounded-3xl bg-brand p-6 text-white shadow-float">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">Operational pulse</p>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Metric value={active.length} label="active incidents" />
              <Metric value={critical.length} label="SEV1 / SEV2" />
              <Metric value={affectedEstimate} label="trader impact estimate" />
              <Metric value={signals.length} label="recent signals" />
            </div>
          </div>
        </div>
      </section>

      <div className="mt-7 grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Incident queue</p><h2 className="mt-1 font-display text-3xl text-ink">What needs coordinated response</h2></div>
            <Link href="/work" className="rounded-full border border-surface-border px-4 py-2 text-sm font-semibold text-ink hover:border-brand/30 hover:text-brand">Open Operations Work</Link>
          </div>
          <div className="mt-4 space-y-3">
            {incidents.length === 0 ? <Empty /> : incidents.map((incident) => (
              <Link key={incident.id} href={`/operations/incidents/${incident.id}`} className="block rounded-2xl border border-surface-border bg-surface-raised p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-float">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint"><span>{incident.severity}</span><span>·</span><span>{incident.state}</span><span>·</span><span>{incident.affectedService}</span></div>
                    <h3 className="mt-2 text-base font-semibold text-ink">{incident.title}</h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-muted">{incident.summary || "Incident room is active. Keep the chronology current."}</p>
                  </div>
                  <div className="text-right text-xs text-ink-faint"><p>{incident.commanderName}</p><p className="mt-1">{incident.responderCount} responders · {incident.linkedCaseCount} cases</p><p className="mt-1">Impact estimate {incident.affectedTraderCount}</p></div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-3xl border border-surface-border bg-surface-raised p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Declare incident</p>
            <h2 className="mt-1 font-display text-2xl text-ink">Create one response room</h2>
            <form action={openIncidentAction} className="mt-4 space-y-3">
              <input name="title" required maxLength={180} placeholder="What is disrupted?" className="w-full rounded-xl border border-surface-border bg-surface-soft px-3 py-2.5 text-sm text-ink" />
              <input name="affectedService" required maxLength={120} placeholder="Affected service" className="w-full rounded-xl border border-surface-border bg-surface-soft px-3 py-2.5 text-sm text-ink" />
              <textarea name="summary" maxLength={4000} placeholder="Known facts only — what happened?" className="min-h-24 w-full rounded-xl border border-surface-border bg-surface-soft px-3 py-2.5 text-sm text-ink" />
              <div className="grid grid-cols-2 gap-3"><select name="severity" defaultValue="SEV3" className="rounded-xl border border-surface-border bg-surface-soft px-3 py-2.5 text-sm text-ink"><option>SEV1</option><option>SEV2</option><option>SEV3</option><option>SEV4</option></select><input name="affectedTraderCount" type="number" min="0" defaultValue="0" aria-label="Trader impact estimate" className="rounded-xl border border-surface-border bg-surface-soft px-3 py-2.5 text-sm text-ink" /></div>
              <select name="commanderUserId" defaultValue={user.id} className="w-full rounded-xl border border-surface-border bg-surface-soft px-3 py-2.5 text-sm text-ink">{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
              <button className="w-full rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white">Open incident room</button>
            </form>
          </section>

          <section className="rounded-3xl border border-surface-border bg-surface-raised p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Service signals</p>
            <h2 className="mt-1 font-display text-2xl text-ink">Evidence before incident</h2>
            <p className="mt-2 text-xs leading-5 text-ink-muted">Signals are observations, not automatic truth. Similar evidence may suggest an incident; a human still declares it.</p>
            <div className="mt-4 space-y-2">{signals.slice(0, 6).map((signal) => <div key={signal.id} className="rounded-xl bg-surface-soft p-3"><div className="flex justify-between gap-2 text-xs font-semibold text-ink"><span>{signal.serviceKey}</span><span>×{signal.observedCount}</span></div><p className="mt-1 text-xs text-ink-muted">{signal.signalKind} · {signal.signalKey}</p></div>)}</div>
            <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-brand">Record observed signal</summary><form action={recordSignalAction} className="mt-3 space-y-2"><input name="signalKey" required placeholder="Signal key" className="w-full rounded-xl border border-surface-border px-3 py-2 text-sm" /><input name="serviceKey" required placeholder="Service" className="w-full rounded-xl border border-surface-border px-3 py-2 text-sm" /><input name="signalKind" required placeholder="Kind e.g. settlement failures" className="w-full rounded-xl border border-surface-border px-3 py-2 text-sm" /><input name="evidenceRef" required placeholder="Evidence reference" className="w-full rounded-xl border border-surface-border px-3 py-2 text-sm" /><select name="severityHint" defaultValue="" className="w-full rounded-xl border border-surface-border px-3 py-2 text-sm"><option value="">No severity hint</option><option>SEV1</option><option>SEV2</option><option>SEV3</option><option>SEV4</option></select><button className="rounded-full border border-brand/25 px-4 py-2 text-sm font-semibold text-brand">Record evidence</button></form></details>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) { return <div><p className="font-display text-4xl leading-none">{value}</p><p className="mt-1 text-xs text-white/65">{label}</p></div>; }
function Empty() { return <div className="rounded-2xl border border-brand/15 bg-brand-soft/30 p-6"><p className="font-display text-2xl text-brand-muted">No visible incidents.</p><p className="mt-2 text-sm leading-6 text-ink-muted">That is good news. When evidence requires coordinated response, the incident will carry an owner, room, chronology and Work responsibility.</p></div>; }
