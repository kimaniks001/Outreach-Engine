import Link from "next/link";
import { communityProfile, communityPrinciples } from "@/lib/community/foundation";
import { Card } from "@/components/ui/Card";
import { PlugMarketEntryCard } from "@/components/market-network/PlugMarketEntryCard";
import { requireCommunityActor } from "@/lib/community/current-community-actor";
import { getPlugMarketAuthority } from "@/lib/market-network/plug-market-authority";
import { getReadinessAuthority } from "@/lib/readiness/authority";

export default async function CommunityProfilePage() {
  const actor = await requireCommunityActor();
  const readiness = await getReadinessAuthority();
  const market = actor.kind === "SECUREPAY" ? await getPlugMarketAuthority() : null;
  const liveCredentials = readiness.projection?.credentials ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-brand">Community identity</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">
          {actor.kind === "SECUREPAY" ? actor.name : communityProfile.name}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          {actor.kind === "SECUREPAY"
            ? readiness.status === "CONNECTED"
              ? market?.status === "CONNECTED"
                ? `SecurePay identity connected · ${market.profile.standing.replaceAll("_", " ").toLowerCase()}`
                : "SecurePay identity connected · capability evidence connected · Plug authority unavailable"
              : "SecurePay identity connected · capability evidence unavailable"
            : communityProfile.territory}
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">
          {actor.kind === "SECUREPAY"
            ? "Your identity shows only what SecurePay can prove: capability from readiness evidence and Plug market standing from separate enrollment authority. Territory, Circles, Master status and reputation remain separate truths."
            : `Known for ${communityProfile.knownFor.toLowerCase()}.`}
        </p>
      </header>

      <div className="rounded-lg border border-status-good/20 bg-status-good/5 p-4 text-sm leading-6 text-ink-muted">
        Community identity is about contribution, belonging and demonstrated capability. {communityPrinciples.moneyBoundary}
      </div>

      {actor.kind === "SECUREPAY" && market?.status === "CONNECTED" && (
        <PlugMarketEntryCard profile={market.profile} />
      )}

      {actor.kind === "SECUREPAY" && market?.status === "UNAVAILABLE" && (
        <div className="rounded-lg border border-status-warn/25 bg-status-warn/5 p-4 text-sm leading-6 text-ink-muted">
          <span className="font-semibold text-ink">Plug market standing unavailable.</span> {market.reason} A Market Ready credential by itself will not be displayed as Plug identity.
        </div>
      )}

      {actor.kind === "SECUREPAY" ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card title="Qualifications">
            {readiness.status === "CONNECTED" ? (
              liveCredentials.length > 0 ? (
                <div className="space-y-3">
                  {liveCredentials.map((credential) => (
                    <div key={credential.credentialId} className="rounded-lg border border-surface-border bg-surface p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-ink">{credential.name}</p>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                            credential.status === "CURRENT"
                              ? "border-status-good/30 bg-status-good/10 text-status-good"
                              : "border-status-warn/30 bg-status-warn/10 text-status-warn"
                          }`}
                        >
                          {credential.status === "CURRENT" ? "Current" : "Refresh required"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-ink-faint">Evidence version {credential.evidenceVersion}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-6 text-ink-muted">
                  No Market Ready or specialist credential has been evidenced for this identity yet.
                </p>
              )
            ) : (
              <p className="text-sm leading-6 text-ink-muted">
                {readiness.reason} We would rather show no qualification than invent one.
              </p>
            )}
            <Link href="/learn" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">
              Go to Learn →
            </Link>
          </Card>

          <Card title="Identity boundaries">
            <ul className="space-y-2 text-sm leading-6 text-ink-muted">
              <li>• A current credential proves demonstrated capability only.</li>
              <li>• Plug identity requires separate backend market enrollment.</li>
              <li>• Neither makes you SecurePay staff, a Community moderator or a Master.</li>
              <li>• Neither creates referral, Lifetime Share, payment or settlement authority.</li>
              <li>• Circles and community reputation appear only when their own authority exists.</li>
            </ul>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card title="Qualifications · demo persona">
            <div className="flex flex-wrap gap-2">
              {communityProfile.qualifications.map((item) => (
                <span key={item} className="rounded-full border border-status-good/30 bg-status-good/10 px-3 py-1.5 text-xs font-medium text-status-good">
                  {item}
                </span>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-ink-faint">
              These are prototype training outcomes, not financial or platform authority.
            </p>
          </Card>

          <Card title="Circles · demo persona">
            <ul className="space-y-2 text-sm text-ink-muted">
              {communityProfile.circleNames.map((name) => <li key={name}>{name}</li>)}
            </ul>
          </Card>

          <Card title="Community contribution · demo persona">
            <p className="text-3xl font-semibold text-ink">{communityProfile.peopleHelped}</p>
            <p className="mt-1 text-xs text-ink-faint">people helped · demo identity metric</p>
            <ul className="mt-4 space-y-2 text-sm text-ink-muted">
              {communityProfile.contributions.map((item) => <li key={item}>• {item}</li>)}
            </ul>
          </Card>

          <Card title="Accolades · demo persona">
            <div className="flex flex-wrap gap-2">
              {communityProfile.accolades.map((item) => (
                <span key={item} className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand">
                  {item}
                </span>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-ink-faint">
              Accolades are encouragement and remain distinct from qualifications.
            </p>
          </Card>
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <Link href="/community-live" className="text-sm font-medium text-brand hover:underline">← Community LIVE</Link>
        <Link href="/circles" className="text-sm font-medium text-brand hover:underline">Circles →</Link>
      </div>
    </div>
  );
}
