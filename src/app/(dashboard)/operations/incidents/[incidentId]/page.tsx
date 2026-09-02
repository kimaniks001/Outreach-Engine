import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/rbac/guard";
import { listStaffDirectory } from "@/lib/conversations/staff-conversations";
import { listVisibleSupportCases } from "@/lib/trader-support/support-visibility";
import { getIncident, listIncidentChronology } from "@/lib/operations/incident-engine";
import { addIncidentNoteAction, addResponderAction, communicationStateAction, incidentStateAction, linkSupportCaseAction, preventionAction, updateImpactAction } from "../../actions";

export default async function IncidentRoomPage({ params }: { params: Promise<{ incidentId: string }> }) {
  const user = await requireUser();
  const { incidentId } = await params;
  let incident;
  try { incident = await getIncident(user.id, incidentId); } catch { notFound(); }
  const [chronology, staff, supportCases] = await Promise.all([listIncidentChronology(user.id, incidentId), listStaffDirectory(), listVisibleSupportCases(user.id)]);
  const terminal = incident.state === "RESOLVED" || incident.state === "CLOSED";

  return (
    <div className="mx-auto max-w-7xl outreach-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/operations" className="text-sm font-semibold text-brand hover:text-brand-muted">← Operations</Link>
        <div className="flex gap-2"><Link href={`/work/${incident.workItemId}`} className="rounded-full border border-surface-border px-4 py-2 text-sm font-semibold text-ink">Work responsibility</Link><Link href={`/conversations?conversation=${incident.conversationId}`} className="rounded-full border border-brand/25 px-4 py-2 text-sm font-semibold text-brand">Incident conversation</Link></div>
      </div>

      <section className="mt-5 overflow-hidden rounded-[30px] border border-brand/15 bg-surface-raised shadow-quiet">
        <div className="grid gap-6 px-6 py-7 sm:px-8 lg:grid-cols-[1.25fr_.75fr] lg:px-10">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Incident command · {incident.severity}</p><h1 className="mt-3 font-display text-4xl leading-tight text-ink">{incident.title}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">{incident.summary || "Keep known facts, decisions and response chronology in this room."}</p></div>
          <div className="rounded-3xl bg-brand p-5 text-white"><Row label="State" value={incident.state} /><Row label="Commander" value={incident.commanderName} /><Row label="Service" value={incident.affectedService} /><Row label="Impact" value={`${incident.affectedTraderCount} trader estimate`} /><Row label="Communication" value={incident.communicationState.replaceAll("_", " ")} /></div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <section className="rounded-3xl border border-surface-border bg-surface-raised p-5 shadow-sm sm:p-6">
          <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Chronology</p><h2 className="mt-1 font-display text-3xl text-ink">One operational memory</h2></div><span className="text-xs text-ink-faint">{chronology.length} events</span></div>
          <div className="mt-5 space-y-4">{chronology.map((entry) => <div key={entry.id} className="grid grid-cols-[7rem_1fr] gap-4 border-t border-surface-border/70 pt-4 first:border-0 first:pt-0"><div className="text-xs text-ink-faint">{entry.createdAt.toLocaleString()}</div><div><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand">{entry.eventType.replaceAll("_", " ")}</div><p className="mt-1 text-sm leading-6 text-ink">{entry.note}</p>{entry.actorName ? <p className="mt-1 text-xs text-ink-faint">{entry.actorName}</p> : null}</div></div>)}</div>
          <form action={addIncidentNoteAction} className="mt-6 flex gap-2"><input type="hidden" name="incidentId" value={incident.id} /><input name="note" required maxLength={4000} placeholder="Add a factual operational update…" className="min-w-0 flex-1 rounded-full border border-surface-border bg-surface-soft px-4 py-2.5 text-sm" /><button className="rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white">Add update</button></form>
        </section>

        <aside className="space-y-4">
          {!terminal ? <section className="rounded-3xl border border-surface-border bg-surface-raised p-5 shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Command</p><h2 className="mt-1 font-display text-2xl text-ink">Move the response deliberately</h2><form action={incidentStateAction} className="mt-4 space-y-3"><input type="hidden" name="incidentId" value={incident.id} /><select name="state" defaultValue={incident.state === "DETECTED" ? "INVESTIGATING" : incident.state} className="w-full rounded-xl border border-surface-border px-3 py-2.5 text-sm"><option>INVESTIGATING</option><option>MITIGATING</option><option>MONITORING</option><option>RESOLVED</option><option>CLOSED</option></select><textarea name="note" maxLength={4000} placeholder="What changed?" className="min-h-20 w-full rounded-xl border border-surface-border px-3 py-2.5 text-sm" /><textarea name="resolutionSummary" maxLength={4000} placeholder="Required when resolving/closing" className="min-h-20 w-full rounded-xl border border-surface-border px-3 py-2.5 text-sm" /><textarea name="rootCauseSummary" maxLength={4000} placeholder="Root cause, if established" className="min-h-20 w-full rounded-xl border border-surface-border px-3 py-2.5 text-sm" /><button className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">Record state</button></form></section> : null}

          <section className="rounded-3xl border border-surface-border bg-surface-raised p-5 shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Impact + responders</p><form action={updateImpactAction} className="mt-3 flex gap-2"><input type="hidden" name="incidentId" value={incident.id} /><input name="affectedTraderCount" type="number" min="0" defaultValue={incident.affectedTraderCount} aria-label="Trader impact estimate" className="min-w-0 flex-1 rounded-xl border border-surface-border px-3 py-2 text-sm" /><button className="rounded-full border border-brand/25 px-3 py-2 text-sm font-semibold text-brand">Update estimate</button></form><form action={addResponderAction} className="mt-3 flex gap-2"><input type="hidden" name="incidentId" value={incident.id} /><select name="responderUserId" className="min-w-0 flex-1 rounded-xl border border-surface-border px-3 py-2 text-sm">{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><button className="rounded-full border border-brand/25 px-3 py-2 text-sm font-semibold text-brand">Add responder</button></form><p className="mt-3 text-xs text-ink-faint">{incident.responderCount} responders · {incident.linkedCaseCount} linked trader cases</p></section>

          <section className="rounded-3xl border border-surface-border bg-surface-raised p-5 shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Related trader cases</p><form action={linkSupportCaseAction} className="mt-3 flex gap-2"><input type="hidden" name="incidentId" value={incident.id} /><select name="caseId" className="min-w-0 flex-1 rounded-xl border border-surface-border px-3 py-2 text-sm">{supportCases.map((item) => <option key={item.id} value={item.id}>{item.subject}</option>)}</select><button disabled={supportCases.length === 0} className="rounded-full border border-brand/25 px-3 py-2 text-sm font-semibold text-brand disabled:opacity-40">Link</button></form><p className="mt-3 text-xs leading-5 text-ink-faint">Only cases already visible to you can be linked. Linking creates operational context, not financial or identity authority.</p></section>

          <section className="rounded-3xl bg-surface-inverse p-5 text-white"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">External communication</p><p className="mt-2 text-sm leading-6 text-white/75">Outreach tracks communication state. It does not silently publish. “Released” requires Owner oversight plus evidence from an authorised external workflow.</p><form action={communicationStateAction} className="mt-4 space-y-2"><input type="hidden" name="incidentId" value={incident.id} /><select name="state" defaultValue={incident.communicationState} className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white"><option>INTERNAL_ONLY</option><option>DRAFTED</option><option>AWAITING_APPROVAL</option><option>RELEASED</option></select><input name="releaseEvidenceRef" placeholder="Release evidence ref (for RELEASED)" className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40" /><button className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-surface-inverse">Record communication state</button></form></section>

          <section className="rounded-3xl border border-surface-border bg-surface-raised p-5 shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Prevention</p><form action={preventionAction} className="mt-3 space-y-2"><input type="hidden" name="incidentId" value={incident.id} /><input name="title" required maxLength={180} placeholder="Prevention action" className="w-full rounded-xl border border-surface-border px-3 py-2 text-sm" /><input name="nextAction" required maxLength={500} placeholder="Next step" className="w-full rounded-xl border border-surface-border px-3 py-2 text-sm" /><select name="ownerUserId" defaultValue="" className="w-full rounded-xl border border-surface-border px-3 py-2 text-sm"><option value="">Leave in Operations queue</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><button className="rounded-full border border-brand/25 px-4 py-2 text-sm font-semibold text-brand">Create Work action</button></form></section>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-3 border-t border-white/15 py-2.5 first:border-0 first:pt-0 last:pb-0"><span className="text-xs text-white/60">{label}</span><span className="text-sm font-semibold text-white text-right">{value}</span></div>; }
