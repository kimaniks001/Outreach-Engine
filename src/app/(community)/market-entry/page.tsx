import Link from "next/link";
import { PlugMarketEntryCard } from "@/components/market-network/PlugMarketEntryCard";
import { requireCommunityActor } from "@/lib/community/current-community-actor";
import { getPlugMarketAuthority } from "@/lib/market-network/plug-market-authority";
import { getReadinessAuthority } from "@/lib/readiness/authority";

export default async function MarketEntryPage() {
  const actor = await requireCommunityActor();
  const [market, readiness] = await Promise.all([
    actor.kind === "SECUREPAY" ? getPlugMarketAuthority() : Promise.resolve(null),
    getReadinessAuthority(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Enter the market</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink md:text-3xl">Market Ready is the gate. Entering is your choice.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">
          Learning proves what you currently understand. Plug market participation is a separate, explicit step. SecurePay will not turn a training result into a commercial identity behind your back.
        </p>
      </header>

      {market?.status === "CONNECTED" ? (
        <PlugMarketEntryCard profile={market.profile} />
      ) : (
        <section className="rounded-xl border border-status-warn/25 bg-status-warn/5 p-5 md:p-6">
          <h2 className="text-lg font-semibold text-ink">Market-entry authority is not connected</h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            {market?.reason ?? "This staff/demo session does not have a caller-scoped SecurePay Plug market identity."} Outreach will not create a local Plug badge as a substitute.
          </p>
        </section>
      )}

      <section className="rounded-xl border border-surface-border bg-surface-raised p-5 md:p-6">
        <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Capability right now</p>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          {readiness.status === "CONNECTED"
            ? readiness.projection?.marketReadinessStatus === "MARKET_READY"
              ? "SecurePay currently shows Market Ready capability for this identity."
              : "SecurePay currently shows this identity as still in training."
            : readiness.reason}
        </p>
        <Link href="/learn" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">
          Open Learn →
        </Link>
      </section>
    </div>
  );
}
