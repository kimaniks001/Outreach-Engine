import Link from "next/link";
import { requireCommunityActor } from "@/lib/community/current-community-actor";
import {
  canRepresentMarket,
  getPlugMarketAuthority,
} from "@/lib/market-network/plug-market-authority";
import { getOpportunityAuthority } from "@/lib/market-network/opportunity-authority";
import { OpportunityInterestActions } from "@/components/market-network/OpportunityInterestActions";
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
  const [authority, market, opportunityAuthority] = await Promise.all([
    getReadinessAuthority(),
    actor.kind === "SECUREPAY" ? getPlugMarketAuthority() : Promise.resolve(null),
    actor.kind === "SECUREPAY"
      ? getOpportunityAuthority()
      : Promise.resolve({
          status: "UNAVAILABLE" as const,
          offers: [] as [],
          reason: "Live market opportunities are available to caller-scoped SecurePay identities.",
        }),
  ]);

  const readinessLive = authority.status === "CONNECTED";
  const marketLive = market?.status === "CONNECTED";
  const activePlug = market ? canRepresentMarket(market) : false;
  const opportunitiesLive = opportunityAuthority.status === "CONNECTED";

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Opportunities · capability first</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink md:text-3xl">The right person for the right market moment</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">
            SecurePay only shows a live opportunity when the backend says this identity is currently able to represent the market and has the capability that opportunity requires.
          </p>
        </div>
        <Link href="/learn" className="rounded-md border border-brand/30 bg-brand/5 px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand/10">
          Grow my capability
        </Link>
      </header>

      <div className={`rounded-lg border p-4 ${opportunitiesLive ? "border-status-good/25 bg-status-good/5" : "border-status-warn/25 bg-status-warn/5"}`}>
        <p className="text-sm font-semibold text-ink">
          {opportunitiesLive
            ? "SecurePay opportunity authority connected"
            : readinessLive && marketLive && activePlug
              ? "Your capability and Plug standing are connected · live offers are not"
              : "Real opportunity matching is not active for this session"}
        </p>
        <p className="mt-1 text-sm leading-6 text-ink-muted">
          {opportunitiesLive
            ? "The live cards below are already filtered by SecurePay for this caller. Outreach does not rank, assign or expose other Plugs’ responses."
            : opportunityAuthority.reason}
        </p>
      </div>

      {opportunitiesLive ? (
        opportunityAuthority.offers.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {opportunityAuthority.offers.map((offer) => (
              <article key={offer.offerId} className="rounded-xl border border-surface-border bg-surface-raised p-5 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-status-good">Live opportunity</p>
                    <h2 className="mt-1 text-lg font-semibold text-ink">{offer.title}</h2>
                  </div>
                  <span className="rounded-full border border-status-good/30 bg-status-good/10 px-3 py-1 text-xs font-semibold text-status-good">
                    {offer.myDecision === "ACCEPTED"
                      ? "Interested"
                      : offer.myDecision === "DECLINED"
                        ? "Not for me"
                        : "Open"}
                  </span>
                </div>

                <p className="mt-4 text-sm leading-6 text-ink-muted">{offer.summary}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-brand/20 bg-brand/5 px-3 py-1 text-xs font-medium text-brand">Active Plug standing</span>
                  <span className="rounded-full border border-brand/20 bg-brand/5 px-3 py-1 text-xs font-medium text-brand">
                    {humanProgram(offer.requiredProgramCode)}
                  </span>
                </div>

                {offer.closesAt && (
                  <p className="mt-4 text-xs text-ink-faint">Interest closes {formatDateTime(offer.closesAt)}.</p>
                )}

                <OpportunityInterestActions offerId={offer.offerId} currentDecision={offer.myDecision} />
              </article>
            ))}
          </div>
        ) : (
          <section className="rounded-xl border border-surface-border bg-surface-raised p-6 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Your market</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">Nothing matching your current qualifications right now</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
              That is a real result, not an error. SecurePay has not returned an open opportunity this identity is currently entitled to see.
            </p>
            <Link href="/learn" className="mt-5 inline-flex rounded-md border border-brand/30 bg-brand/5 px-4 py-2 text-sm font-medium text-brand">
              Grow another capability
            </Link>
          </section>
        )
      ) : (
        <>
          <div className="rounded-lg border border-status-warn/25 bg-status-warn/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-status-warn">Demo · practice only</p>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              These examples show how capability matching will feel. They cannot record interest, assign a customer or create any entitlement while SecurePay opportunity authority is unavailable.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {opportunityPreviews.map((opportunity) => {
              const capabilityEligible = authoritativeOpportunityEligible(authority.projection, opportunity.requirements);
              const eligible = capabilityEligible && activePlug;

              return (
                <article key={opportunity.id} className="rounded-xl border border-surface-border bg-surface-raised p-5 md:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">{opportunity.place}</p>
                      <h2 className="mt-1 text-lg font-semibold text-ink">{opportunity.title}</h2>
                    </div>
                    <span className="rounded-full border border-surface-border bg-surface px-3 py-1 text-xs font-semibold text-ink-faint">
                      Demo preview
                    </span>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-ink-muted">{opportunity.need}</p>

                  <div className="mt-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Would require</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full border border-brand/20 bg-brand/5 px-3 py-1 text-xs font-medium text-brand">Active Plug standing</span>
                      {opportunity.requirements.map((requirement) => (
                        <span key={requirement} className="rounded-full border border-brand/20 bg-brand/5 px-3 py-1 text-xs font-medium text-brand">{requirement}</span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg border border-surface-border bg-surface p-4">
                    <p className="text-xs font-semibold text-ink">Why this capability matters</p>
                    <p className="mt-1 text-xs leading-5 text-ink-muted">{opportunity.whyItFits}</p>
                  </div>

                  <p className="mt-4 text-xs leading-5 text-ink-faint">{opportunity.authorityNote}</p>
                  <button type="button" disabled className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
                    {eligible ? "Preview · live offer authority required" : readinessLive ? "Preview only" : "Locked until authority connects"}
                  </button>
                </article>
              );
            })}
          </div>
        </>
      )}

      <section className="rounded-xl border border-surface-border bg-surface-raised p-5 md:p-6">
        <p className="text-xs font-medium uppercase tracking-widest text-brand">Matching doctrine</p>
        <h2 className="mt-1 text-lg font-semibold text-ink">Interest is not assignment</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
          Learning can increase the market moments a Plug is qualified to see. Saying “I’m interested” only records availability and interest. A later backend authority must separately confirm any customer relationship; this page creates no referral, Lifetime Share, fee, agreement, payment or settlement truth. {readinessPrinciples.opportunity}
        </p>
      </section>
    </div>
  );
}

function humanProgram(code: "MARKET_READY" | "PROPERTY_SPECIALIST"): string {
  return code === "PROPERTY_SPECIALIST" ? "Property Specialist" : "Market Ready";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "at the published closing time" : date.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" });
}
