import Link from "next/link";
import { requireCommunityActor } from "@/lib/community/current-community-actor";
import {
  authoritativeOpportunityEligible,
  getReadinessAuthority,
} from "@/lib/readiness/authority";
import {
  opportunityPreviews,
  readinessPrinciples,
} from "@/lib/readiness/foundation";

export default async function OpportunitiesPage() {
  const actor = await requireCommunityActor();
  const authority = await getReadinessAuthority();

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Opportunities · capability first</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink md:text-3xl">The right person for the right market moment</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">
            Opportunities should connect people to work they are actually ready to handle. Confidence, popularity or a Community post does not replace current capability.
          </p>
        </div>
        <Link
          href="/learn"
          className="rounded-md border border-brand/30 bg-brand/5 px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand/10"
        >
          Grow my capability
        </Link>
      </header>

      <div className="rounded-lg border border-status-warn/25 bg-status-warn/5 p-4">
        <p className="text-sm font-semibold text-ink">Real matching is not active yet</p>
        <p className="mt-1 text-sm leading-6 text-ink-muted">
          {actor.name} is authenticated, but Outreach has no backend Plug/readiness credential projection yet. {readinessPrinciples.opportunity}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {opportunityPreviews.map((opportunity) => {
          const eligible = authoritativeOpportunityEligible(
            authority.projection,
            opportunity.requirements
          );

          return (
            <article key={opportunity.id} className="rounded-xl border border-surface-border bg-surface-raised p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">{opportunity.place}</p>
                  <h2 className="mt-1 text-lg font-semibold text-ink">{opportunity.title}</h2>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    eligible
                      ? "border-status-good/30 bg-status-good/10 text-status-good"
                      : "border-surface-border bg-surface text-ink-faint"
                  }`}
                >
                  {eligible ? "Eligible" : "Preview only"}
                </span>
              </div>

              <p className="mt-4 text-sm leading-6 text-ink-muted">{opportunity.need}</p>

              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Requires</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {opportunity.requirements.map((requirement) => (
                    <span key={requirement} className="rounded-full border border-brand/20 bg-brand/5 px-3 py-1 text-xs font-medium text-brand">
                      {requirement}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-surface-border bg-surface p-4">
                <p className="text-xs font-semibold text-ink">Why this capability matters</p>
                <p className="mt-1 text-xs leading-5 text-ink-muted">{opportunity.whyItFits}</p>
              </div>

              <p className="mt-4 text-xs leading-5 text-ink-faint">{opportunity.authorityNote}</p>

              <button
                type="button"
                disabled={!eligible}
                className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                {eligible ? "Open opportunity" : "Locked until authority confirms readiness"}
              </button>
            </article>
          );
        })}
      </div>

      <section className="rounded-xl border border-surface-border bg-surface-raised p-5 md:p-6">
        <p className="text-xs font-medium uppercase tracking-widest text-brand">Matching doctrine</p>
        <h2 className="mt-1 text-lg font-semibold text-ink">Learning should increase commercial possibility</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
          A Plug should be able to see the practical value of learning: qualify for another market, help better customers, handle more complex situations and grow a stronger economic territory. But the unlock must be earned and backend-authoritative.
        </p>
      </section>
    </div>
  );
}
