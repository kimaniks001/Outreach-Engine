import Link from "next/link";
import { requireSection } from "@/lib/rbac/guard";
import { communityProfile, communityPrinciples } from "@/lib/community/foundation";
import { Card } from "@/components/ui/Card";

export default async function CommunityProfilePage() {
  await requireSection("COMMUNITY_LIVE");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-brand">Community identity · prototype</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">{communityProfile.name}</h1>
        <p className="mt-2 text-sm text-ink-muted">{communityProfile.territory}</p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">Known for {communityProfile.knownFor.toLowerCase()}.</p>
      </header>

      <div className="rounded-lg border border-status-good/20 bg-status-good/5 p-4 text-sm leading-6 text-ink-muted">
        Community identity shows contribution, belonging and demonstrated capability. {communityPrinciples.moneyBoundary}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Qualifications">
          <div className="flex flex-wrap gap-2">
            {communityProfile.qualifications.map((item) => (
              <span key={item} className="rounded-full border border-status-good/30 bg-status-good/10 px-3 py-1.5 text-xs font-medium text-status-good">
                {item}
              </span>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-ink-faint">
            Qualifications represent training outcomes in this prototype. They are not financial or platform authority.
          </p>
        </Card>

        <Card title="Your circles">
          <ul className="space-y-2 text-sm text-ink-muted">
            {communityProfile.circleNames.map((name) => <li key={name}>{name}</li>)}
          </ul>
          <Link href="/circles" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">Open Circles →</Link>
        </Card>

        <Card title="Community contribution">
          <p className="text-3xl font-semibold text-ink">{communityProfile.peopleHelped}</p>
          <p className="mt-1 text-xs text-ink-faint">people helped · demo identity metric</p>
          <ul className="mt-4 space-y-2 text-sm text-ink-muted">
            {communityProfile.contributions.map((item) => <li key={item}>• {item}</li>)}
          </ul>
        </Card>

        <Card title="Accolades">
          <div className="flex flex-wrap gap-2">
            {communityProfile.accolades.map((item) => (
              <span key={item} className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand">
                {item}
              </span>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-ink-faint">
            Accolades are encouragement and community recognition. They are deliberately distinct from qualifications.
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-4">
        <Link href="/community-live" className="text-sm font-medium text-brand hover:underline">← Community LIVE</Link>
        <Link href="/circles" className="text-sm font-medium text-brand hover:underline">Your Circles →</Link>
      </div>
    </div>
  );
}
