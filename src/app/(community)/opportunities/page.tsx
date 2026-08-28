import Link from "next/link";
import { requireCommunityActor } from "@/lib/community/current-community-actor";
import {
  canRepresentMarket,
  getPlugMarketAuthority,
} from "@/lib/market-network/plug-market-authority";
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
  const [authority, market] = await Promise.all([
    getReadinessAuthority(),
    actor.kind === "SECUREPAY" ? getPlugMarketAuthority() : Promise.resolve(null),
  ]);
  const readinessLive = authority.status === "CONNECTED";
  const marketLive = market?.status === "CONNECTED";
  const activePlug = market ? canRepresentMarket(market) : false;

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Opportunities · capability first</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink md:text-3xl">The right person for the right market moment</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">
            Opportunities should connect people to work they are actually ready to handle. Confidence, popularity or a Community post does not replace current capability, and capability alone does not silently enroll somebody as a Plug.
          </p>
        </div>
        <Link
          href="/learn"
          className="rounded-md border border-brand/30 bg-brand/5 px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand/10"
        >
          Grow my capability
        </Link>
      </header>

      <div className={`rounded-lg border p-4 ${readinessLive && marketLive ? "border-status-good/25 bg-status-good/5" : "border-status-warn/25 bg-status-warn/5"}`}>
        <p className="text-sm font-semibold text-ink">
          {readinessLive && marketLive
            ? activePlug
              ? "SecurePay capability and active Plug standing connected"
              : "Capability may be current, but active market representation is not"
            : "Real matching is not active yet"}
        </p>
        <p className="mt-1 text-sm leading-6 text-ink-muted">
          {readinessLive && marketLive
            ? activePlug
              ? `${actor.name}'s capability below is derived from current backend credentials and active Plug enrollment. Opportunity fulfilment itself remains a later authority.`
              : `SecurePay does not currently project this identity as able to represent the market. Enter or refresh market participation before capability can be treated as opportunity-ready.`
            : `${actor.name} is authenticated, but the full readiness + Plug authority projection is unavailable. ${readinessPrinciples.opportunity}`}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {opportunityPreviews.map((opportunity) => {
          const capabilityEligible = authoritativeOpportunityEligible(
            authority.projection,
            opportunity.requirements
          );
          const eligible = capabilityEligible && activePlug;

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
                  {eligible
                    ? "Capability + market standing confirmed"
                    : capabilityEligible && marketLive
                      ? "Enter or refresh the market"
                      : readinessLive
                        ? "Not eligible yet"
                        : "Preview only"}
                </span>
              </div>

              <p className="mt-4 text-sm leading-6 text-ink-muted">{opportunity.need}</p>

              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Requires</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full border border-brand/20 bg-brand/5 px-3 py-1 text-xs font-medium text-brand">
                    Active Plug standing
                  </span>
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
                disabled
                className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                {eligible
                  ? "Eligible · opportunity assignment authority not built yet"
                  : capabilityEligible
                    ? "Active market standing required"
                    : readinessLive
                      ? "Build the required capability first"
                      : "Locked until authority confirms readiness"}
              </button>
            </article>
          );
        })}
      </div>

      <section className="rounded-xl border border-surface-border bg-surface-raised p-5 md:p-6">
        <p className="text-xs font-medium uppercase tracking-widest text-brand">Matching doctrine</p>
        <h2 className="mt-1 text-lg font-semibold text-ink">Learning should increase commercial possibility</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
          A Plug should be able to see the practical value of learning: qualify for another market, help better customers, handle more complex situations and grow a stronger economic territory. But readiness, Plug enrollment and opportunity assignment remain separate backend truths.
        </p>
      </section>
    </div>
  );
}
