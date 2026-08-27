import { ReadinessJourney } from "@/components/readiness/ReadinessJourney";
import { Card } from "@/components/ui/Card";
import { requireCommunityActor } from "@/lib/community/current-community-actor";
import { getReadinessAuthority } from "@/lib/readiness/authority";
import {
  credentialDefinitions,
  readinessPrinciples,
} from "@/lib/readiness/foundation";

export default async function LearnPage() {
  const actor = await requireCommunityActor();
  const authority = await getReadinessAuthority();

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Learn · market readiness</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink md:text-3xl">Earn the right to enter the market</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">
          SecurePay market learning is meant to feel like practice, not school. You meet realistic situations, choose what you would do, see why it matters and build toward capability that can later unlock real opportunities.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="The gate">
          <p className="text-sm leading-6 text-ink-muted">{readinessPrinciples.gate}</p>
        </Card>
        <Card title="How learning feels">
          <p className="text-sm leading-6 text-ink-muted">{readinessPrinciples.learning}</p>
        </Card>
        <Card title="Authority right now">
          <p className="text-sm leading-6 text-ink-muted">{authority.reason}</p>
          <p className="mt-2 text-xs font-medium uppercase tracking-wider text-status-warn">{authority.status}</p>
        </Card>
      </div>

      <ReadinessJourney memberName={actor.name} />

      <section className="space-y-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Credential map</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">What the real authority will eventually prove</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {credentialDefinitions.map((credential) => (
            <div key={credential.id} className="rounded-lg border border-surface-border bg-surface-raised p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{credential.name}</p>
                  <p className="mt-1 text-xs text-ink-faint">
                    {credential.kind === "READINESS" ? "Readiness credential" : `${credential.industry} specialist credential`}
                  </p>
                </div>
                <span className="rounded-full border border-surface-border px-2.5 py-1 text-[11px] font-medium text-ink-faint">definition only</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-ink-muted">{credential.description}</p>
              <ul className="mt-3 space-y-1 text-xs leading-5 text-ink-muted">
                {credential.evidenceRequired.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-5 text-ink-faint">{credential.currentnessNote}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
