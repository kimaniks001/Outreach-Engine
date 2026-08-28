import Link from "next/link";
import { requireCommunityActor } from "@/lib/community/current-community-actor";
import { getPlugMarketAuthority, canRepresentMarket } from "@/lib/market-network/plug-market-authority";
import { listPlugMarketKit } from "@/lib/assets/market-assets";
import { ApprovedMarketKitCard } from "@/components/market-network/ApprovedMarketKitCard";

export default async function MarketKitPage() {
  const actor = await requireCommunityActor();

  if (actor.kind !== "SECUREPAY") {
    return (
      <div className="mx-auto max-w-4xl">
        <section className="rounded-2xl border border-surface-border bg-surface-raised p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">Market Kit</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">This desk belongs to market representatives.</h1>
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            Staff manage approved material from Studio → Asset Library. Market Kit is the safe projection delivered to a caller-scoped SecurePay Plug identity.
          </p>
          <Link href="/studio/assets" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">Open staff Asset Library →</Link>
        </section>
      </div>
    );
  }

  const authority = await getPlugMarketAuthority();
  if (!canRepresentMarket(authority)) {
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">Your Market Kit</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink md:text-3xl">Approved material waits until your market standing is active.</h1>
        </header>
        <section className="rounded-2xl border border-status-warn/30 bg-status-warn/5 p-6">
          <h2 className="text-lg font-semibold text-ink">Market representation is not currently authorised</h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">{authority.reason}</p>
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            Outreach will not infer permission from training, a referral relationship or a Community profile.
          </p>
          <Link href="/market-entry" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">Check market standing →</Link>
        </section>
      </div>
    );
  }

  const items = await listPlugMarketKit(authority);

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="max-w-4xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Your Market Kit</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Say it clearly. Carry what the market has approved.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">
          These are the current SecurePay messages cleared for you to use in the market. Internal strategy, approval notes and source documents stay behind the scenes. You get the usable version.
        </p>
      </header>

      <section className="rounded-2xl border border-brand/20 bg-brand/5 p-5">
        <p className="text-sm font-semibold text-ink">Money should follow the agreement.</p>
        <p className="mt-1 text-sm leading-6 text-ink-muted">
          The kit helps you explain that promise consistently. It does not give you authority to make new legal, pricing, settlement or product claims on SecurePay’s behalf.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {items.map((item) => <ApprovedMarketKitCard key={item.id} item={item} />)}
      </section>

      {items.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-surface-border p-8 text-center">
          <h2 className="text-lg font-semibold text-ink">Nothing current has been handed to the market yet.</h2>
          <p className="mt-2 text-sm text-ink-muted">When SecurePay releases approved material for Plug use, it will appear here automatically.</p>
        </section>
      ) : null}
    </div>
  );
}
