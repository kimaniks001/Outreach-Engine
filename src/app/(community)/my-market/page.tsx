import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { requireCommunityActor } from "@/lib/community/current-community-actor";
import { getMyMarketSnapshot } from "@/lib/market/my-market-snapshot";
import {
  lifetimeShareAuthority,
  retentionRewardAuthority,
  type ReferralRelationshipEvidence,
} from "@/lib/market/referral-authority";

export default async function MyMarketPage() {
  const actor = await requireCommunityActor();
  const snapshot = await getMyMarketSnapshot();

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">My Market · private</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink md:text-3xl">The market you are growing</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">
            Relationships, capability and backend-confirmed reward evidence belong here — away from the social feed. Community LIVE is where people see you. My Market is where you privately understand the economic network you are building.
          </p>
        </div>
        <Link
          href="/learn"
          className="rounded-md border border-brand/30 bg-brand/5 px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand/10"
        >
          Grow my capability
        </Link>
      </header>

      {snapshot.status === "LIVE" ? (
        <LiveMarket snapshot={snapshot} />
      ) : (
        <UnavailableMarket actorName={actor.name} reason={snapshot.reason} />
      )}

      <LifetimeShareBoundary />
    </div>
  );
}

function LiveMarket({ snapshot }: { snapshot: Extract<Awaited<ReturnType<typeof getMyMarketSnapshot>>, { status: "LIVE" }> }) {
  const { history, confirmedRewardEvidenceTotal } = snapshot;

  return (
    <>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="People connected"
          value={String(history.totalReferred)}
          note="Referral relationships SecurePay currently attributes to you"
        />
        <MetricCard
          label="Activated or later"
          value={String(history.activatedOrLaterCount)}
          note="Referred KS Numbers observed active by SecurePay"
        />
        <MetricCard
          label="Confirmed reward evidence"
          value={
            confirmedRewardEvidenceTotal
              ? formatMoney(
                  confirmedRewardEvidenceTotal.amountMinor,
                  confirmedRewardEvidenceTotal.currency
                )
              : "—"
          }
          note={
            confirmedRewardEvidenceTotal
              ? `Across ${confirmedRewardEvidenceTotal.relationshipCount} qualified relationship${confirmedRewardEvidenceTotal.relationshipCount === 1 ? "" : "s"}`
              : "No qualified reward amount is currently present in referral history"
          }
        />
        <MetricCard
          label="Your referral code"
          value={history.referralCode}
          note="Backend-issued code tied to your own SecurePay identity"
          compact
        />
      </section>

      <div className="rounded-lg border border-status-good/20 bg-status-good/5 p-4 text-sm leading-6 text-ink-muted">
        <span className="font-semibold text-ink">Live SecurePay evidence.</span> These relationships and reward fields come from the caller-scoped referral authority. The reward total above is only an addition of already-confirmed evidence; it is not a wallet balance, payout amount or new reward calculation.
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Your relationships</p>
            <h2 className="mt-1 text-lg font-semibold text-ink">Who you brought into the market</h2>
          </div>
          <p className="text-xs text-ink-faint">Pending → Activated → Qualified</p>
        </div>

        {history.relationships.length === 0 ? (
          <Card title="Your market starts with one relationship">
            <p className="text-sm leading-6 text-ink-muted">
              SecurePay does not currently have a referred relationship for this identity. When somebody legitimately uses your referral path, backend history will appear here.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {history.relationships.map((relationship) => (
              <RelationshipCard key={relationship.relationshipId} relationship={relationship} />
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={retentionRewardAuthority.title}>
          <p className="text-sm leading-6 text-ink-muted">{retentionRewardAuthority.currentTruth}</p>
          <div className="mt-4 rounded-md border border-status-warn/25 bg-status-warn/5 px-3 py-2 text-xs leading-5 text-ink-muted">
            Not shown as money here yet. The backend domain has the entitlement, but Outreach still needs a participant-safe API projection before it can display progress or reward evidence truthfully.
          </div>
        </Card>

        <Card title="What this is not">
          <ul className="space-y-2 text-sm leading-6 text-ink-muted">
            <li>• Not a wallet or withdrawable balance.</li>
            <li>• Not authority over the people you referred.</li>
            <li>• Not access to their agreements or money.</li>
            <li>• Not a social leaderboard.</li>
            <li>• Not a lifetime-share calculation performed by Outreach.</li>
          </ul>
        </Card>
      </section>
    </>
  );
}

function UnavailableMarket({ actorName, reason }: { actorName: string; reason: string }) {
  return (
    <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_0.7fr]">
      <Card title="Your SecurePay market is not connected in this session">
        <p className="text-sm leading-6 text-ink-muted">
          {actorName}, {reason.toLowerCase()}.
        </p>
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          We will not fill this space with invented relationships or earnings. Sign in through the Market Network with your SecurePay identity when the API environment is available, and My Market will read your own referral history directly.
        </p>
        <Link
          href="/market-login"
          className="mt-4 inline-flex rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Use SecurePay market sign-in
        </Link>
      </Card>

      <Card title="What will appear here">
        <ul className="space-y-2 text-sm leading-6 text-ink-muted">
          <li>• People legitimately connected through your referral relationship.</li>
          <li>• Activation state from SecurePay identity truth.</li>
          <li>• Qualified KeyContract reward evidence.</li>
          <li>• Plain-language explanation of why a reward qualified.</li>
          <li>• Additional reward families only when participant-safe authority exists.</li>
        </ul>
      </Card>
    </section>
  );
}

function LifetimeShareBoundary() {
  return (
    <section className="overflow-hidden rounded-xl border border-brand/30 bg-surface-raised">
      <div className="border-b border-brand/20 bg-brand/5 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Target commercial model</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">{lifetimeShareAuthority.title}</h2>
          </div>
          <span className="rounded-full border border-status-warn/30 bg-status-warn/10 px-3 py-1.5 text-xs font-semibold text-status-warn">
            Backend rule required
          </span>
        </div>
        <p className="mt-4 max-w-4xl text-lg leading-8 text-ink">
          {lifetimeShareAuthority.targetRule}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-0 lg:grid-cols-2">
        <div className="p-5 md:p-6 lg:border-r lg:border-surface-border">
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">What SecurePay can prove today</p>
          <p className="mt-3 text-sm leading-6 text-ink-muted">{lifetimeShareAuthority.currentTruth}</p>
        </div>
        <div className="p-5 md:p-6">
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">What must be defined before we show an amount</p>
          <p className="mt-3 text-sm leading-6 text-ink-muted">{lifetimeShareAuthority.requiredBackendDecision}</p>
        </div>
      </div>

      <div className="border-t border-surface-border bg-surface px-5 py-4 text-xs leading-5 text-ink-faint md:px-6">
        Outreach will never estimate this number from transaction volume. When the lifetime rule is implemented, every amount shown here must trace back to SecurePay backend entitlement evidence.
      </div>
    </section>
  );
}

function RelationshipCard({ relationship }: { relationship: ReferralRelationshipEvidence }) {
  const reward =
    relationship.rewardAmountMinor !== null && relationship.rewardCurrency
      ? formatMoney(relationship.rewardAmountMinor, relationship.rewardCurrency)
      : null;

  return (
    <article className="rounded-xl border border-surface-border bg-surface-raised p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">KS Number</p>
          <h3 className="mt-1 text-lg font-semibold text-ink">{relationship.referredKsNumber}</h3>
        </div>
        <StatusBadge status={relationship.status} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs text-ink-faint">Connected</dt>
          <dd className="mt-1 text-ink-muted">{formatDate(relationship.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-faint">Activated</dt>
          <dd className="mt-1 text-ink-muted">{relationship.activatedAt ? formatDate(relationship.activatedAt) : "Not yet"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-faint">Qualified</dt>
          <dd className="mt-1 text-ink-muted">{relationship.qualifiedAt ? formatDate(relationship.qualifiedAt) : "Not yet"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-faint">Confirmed reward evidence</dt>
          <dd className="mt-1 font-medium text-ink">{reward ?? "—"}</dd>
        </div>
      </dl>

      {relationship.qualificationExplanation && (
        <div className="mt-4 rounded-lg border border-surface-border bg-surface p-4">
          <p className="text-xs font-semibold text-ink">Why this qualified</p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">{relationship.qualificationExplanation}</p>
        </div>
      )}

      {relationship.referralRuleVersion && (
        <p className="mt-3 text-[11px] text-ink-faint">
          Rule evidence: {relationship.referralRuleVersion}
          {relationship.pricingVersion ? ` · Pricing: ${relationship.pricingVersion}` : ""}
        </p>
      )}
    </article>
  );
}

function MetricCard({
  label,
  value,
  note,
  compact = false,
}: {
  label: string;
  value: string;
  note: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">{label}</p>
      <p className={`mt-2 font-semibold text-ink ${compact ? "break-all text-lg" : "text-3xl"}`}>{value}</p>
      <p className="mt-2 text-xs leading-5 text-ink-muted">{note}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "QUALIFIED"
      ? "border-status-good/30 bg-status-good/10 text-status-good"
      : status === "ACTIVATED"
        ? "border-brand/30 bg-brand/10 text-brand"
        : "border-surface-border bg-surface text-ink-faint";

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${styles}`}>
      {titleCase(status)}
    </span>
  );
}

function formatMoney(amountMinor: number, currency: string): string {
  const amount = amountMinor / 100;
  try {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recorded";
  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|_)([a-z])/g, (_match, prefix: string, letter: string) => `${prefix ? " " : ""}${letter.toUpperCase()}`);
}
