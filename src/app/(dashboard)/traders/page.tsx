import Link from "next/link";
import { requireUser } from "@/lib/rbac/guard";
import { listFrictionSummary, listSupportCases, listSupportConversations } from "@/lib/trader-support/support-engine";

export default async function TradersPage() {
  const user = await requireUser();
  const [conversations, cases, friction] = await Promise.all([
    listSupportConversations(),
    listSupportCases(),
    listFrictionSummary(),
  ]);
  const openCases = cases.filter((item) => item.state !== "RESOLVED" && item.state !== "CLOSED");
  const nearSla = openCases.filter((item) => item.slaDueAt && item.slaDueAt.getTime() <= Date.now() + 8 * 60 * 60 * 1000);

  return (
    <div className="mx-auto max-w-7xl outreach-rise">
      <section className="overflow-hidden rounded-[30px] border border-brand/15 bg-surface-raised shadow-quiet">
        <div className="grid gap-7 px-6 py-8 sm:px-8 lg:grid-cols-[1.3fr_.7fr] lg:px-10 lg:py-10">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">Traders · Ask SecurePay</p>
            <h1 className="mt-4 max-w-3xl font-display text-4xl leading-[1.04] text-ink sm:text-5xl">The trader asks once. SecurePay carries the issue through.</h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-ink-muted">Support conversations stay continuous while Outreach handles ownership, SLA, case work and internal coordination behind the scenes. Identity, agreements and money remain SecurePay backend truth.</p>
          </div>
          <div className="rounded-3xl bg-brand p-6 text-white shadow-float">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">Support pulse</p>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Metric value={openCases.length} label="open cases" />
              <Metric value={nearSla.length} label="near SLA" />
              <Metric value={conversations.length} label="conversations" />
              <Metric value={friction.reduce((sum, item) => sum + item.count, 0)} label="friction notes" />
            </div>
          </div>
        </div>
      </section>

      <div className="mt-7 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <section>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Cases</p>
              <h2 className="mt-1 font-display text-3xl text-ink">What needs SecurePay now</h2>
            </div>
            <Link href="/work" className="rounded-full border border-surface-border px-4 py-2 text-sm font-semibold text-ink transition hover:border-brand/30 hover:text-brand">Open Work</Link>
          </div>
          <div className="mt-4 space-y-3">
            {openCases.length === 0 ? (
              <div className="rounded-2xl border border-brand/15 bg-brand-soft/30 p-6">
                <p className="font-display text-2xl text-brand-muted">No open trader cases.</p>
                <p className="mt-2 text-sm leading-6 text-ink-muted">New support needs will appear here with an owner, queue, priority, SLA and next action.</p>
              </div>
            ) : openCases.map((item) => (
              <Link key={item.id} href={`/traders/cases/${item.id}`} className="block rounded-2xl border border-surface-border bg-surface-raised p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-float">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint"><span>{item.priority}</span><span>·</span><span>{item.state.replaceAll("_", " ")}</span></div>
                    <h3 className="mt-2 text-base font-semibold text-ink">{item.subject}</h3>
                    <p className="mt-2 text-sm text-ink-muted">{item.nextAction || "Agree the next action."}</p>
                  </div>
                  <div className="text-right text-xs text-ink-faint">
                    <p>{item.ownerName ?? "Shared queue"}</p>
                    <p className="mt-1">{item.slaDueAt ? `SLA ${item.slaDueAt.toLocaleString()}` : "No SLA"}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Trader friction</p>
          <h2 className="mt-1 font-display text-3xl text-ink">What keeps getting in the way</h2>
          <div className="mt-4 rounded-2xl border border-surface-border bg-surface-raised p-5 shadow-sm">
            {friction.length === 0 ? <p className="text-sm leading-6 text-ink-muted">No friction pattern has been recorded yet. Case teams can capture recurring obstacles without turning them into unsupported product claims.</p> : (
              <div className="space-y-3">
                {friction.slice(0, 8).map((item) => <div key={item.category} className="flex items-center justify-between border-t border-surface-border/70 pt-3 first:border-0 first:pt-0"><span className="text-sm text-ink">{item.category.replaceAll("_", " ")}</span><span className="font-display text-2xl text-brand-muted">{item.count}</span></div>)}
              </div>
            )}
          </div>
          <div className="mt-4 rounded-2xl bg-surface-inverse p-5 text-white">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">Authority boundary</p>
            <p className="mt-2 text-sm leading-6 text-white/75">Outreach may coordinate support and record grounded guidance. It does not manufacture identity, agreement, payment, release, settlement, fee or referral truth.</p>
            <p className="mt-3 text-xs text-white/55">Signed in as {user.name}</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div><p className="font-display text-4xl leading-none">{value}</p><p className="mt-1 text-xs text-white/65">{label}</p></div>;
}
