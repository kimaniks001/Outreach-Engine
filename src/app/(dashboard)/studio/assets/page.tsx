import Link from "next/link";
import { requireSection } from "@/lib/rbac/guard";
import { listAssetLibrary, listReleasableCreative } from "@/lib/assets/market-assets";
import { AssetReleaseForm } from "@/components/assets/AssetReleaseForm";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default async function AssetLibraryPage() {
  const user = await requireSection("STUDIO");
  const [assets, releasable] = await Promise.all([listAssetLibrary(), listReleasableCreative()]);
  const canRelease = user.role === "OWNER" || user.role === "GROWTH_DIRECTOR";

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="max-w-4xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Asset Library</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">One approved message. Many safe ways to carry it.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">
          Assets are minted only from creative covered by a current final Market Release. Asset Library does not write new claims.
          If the parent release becomes stale, the asset stops being approved for market use automatically.
        </p>
        <Link href="/studio" className="mt-3 inline-block text-sm font-medium text-brand hover:underline">← Back to Studio</Link>
      </header>

      <section className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
        <Card>
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Release an asset</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Package approved creative</h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Choose the approved creative and the market format. The headline, body and CTA come from the approved release—not from this form.
          </p>
          <div className="mt-5">
            {canRelease ? (
              <AssetReleaseForm campaigns={releasable} />
            ) : (
              <div className="rounded-xl border border-surface-border bg-surface p-4 text-sm text-ink-muted">
                Your role can inspect approved assets but cannot release them. Owner or Growth Director performs this market handoff.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Library truth</p>
              <h2 className="mt-1 text-lg font-semibold text-ink">What the market may use now</h2>
            </div>
            <Badge tone="neutral">{assets.filter((row) => row.approvedForUse).length} current</Badge>
          </div>

          <div className="mt-5 space-y-3">
            {assets.map(({ asset, campaignName, state, parentReleaseCurrent, approvedForUse }) => (
              <div key={asset.id} className="rounded-xl border border-surface-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{asset.title}</p>
                    <p className="mt-1 text-xs text-ink-faint">{campaignName} · {asset.kind.replaceAll("_", " ")} · {asset.locale} · v{asset.version}</p>
                  </div>
                  <Badge tone={approvedForUse ? "good" : state === "REVOKED" ? "bad" : "warn"}>
                    {approvedForUse ? "APPROVED FOR USE" : state === "REVOKED" ? "REVOKED" : "STALE"}
                  </Badge>
                </div>
                <p className="mt-3 text-sm font-medium text-ink">{asset.approvedContent.headline}</p>
                <p className="mt-1 text-sm leading-6 text-ink-muted">{asset.approvedContent.body}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-faint">
                  <span>Asset state: {state ?? "UNKNOWN"}</span>
                  <span>•</span>
                  <span>Parent market proof: {parentReleaseCurrent ? "current" : "no longer current"}</span>
                </div>
              </div>
            ))}
            {assets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-surface-border p-6 text-sm text-ink-muted">
                No assets have been released yet. Final market approval comes first; Asset Library comes after.
              </div>
            ) : null}
          </div>
        </Card>
      </section>

      <section className="rounded-2xl border border-brand/20 bg-brand/5 p-5 text-sm leading-6 text-ink-muted">
        <span className="font-semibold text-ink">Approval travels with the exact version.</span> A market asset never inherits permission merely because its campaign once reached READY_FOR_DISTRIBUTION.
      </section>
    </div>
  );
}
