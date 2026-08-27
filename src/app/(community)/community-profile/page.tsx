import Link from "next/link";
import { communityProfile, communityPrinciples } from "@/lib/community/foundation";
import { Card } from "@/components/ui/Card";
import { requireCommunityActor } from "@/lib/community/current-community-actor";

export default async function CommunityProfilePage() {
  const actor = await requireCommunityActor();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-brand">Community identity · prototype</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">
          {actor.kind === "SECUREPAY" ? actor.name : communityProfile.name}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          {actor.kind === "SECUREPAY"
            ? "SecurePay identity connected · profile projection not connected yet"
            : communityProfile.territory}
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">
          {actor.kind === "SECUREPAY"
            ? "Outreach will show your territory, demonstrated skills, Circles and community contribution here only after those sources become authoritative."
            : `Known for ${communityProfile.knownFor.toLowerCase()}.`}
        </p>
      </header>

      <div className="rounded-lg border border-status-good/20 bg-status-good/5 p-4 text-sm leading-6 text-ink-muted">
        Community identity is about contribution, belonging and demonstrated capability. {communityPrinciples.moneyBoundary}
      </div>

      {actor.kind === "SECUREPAY" ? (
        <Card title="Your community identity is being connected">
          <p className="text-sm leading-6 text-ink-muted">
            Your SecurePay session is real, but the current profile cards below are not safe to attach to your identity yet. Market Ready, specialist credentials, Plug status, Master status, reputation and Circles each need their own backend truth before they appear here.
          </p>
          <p className="mt-3 text-xs text-ink-faint">
            We would rather show less than invent a qualification or relationship you do not have.
          </p>
        </Card>
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
