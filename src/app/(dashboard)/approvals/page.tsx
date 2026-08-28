import Link from "next/link";
import { requireSection } from "@/lib/rbac/guard";
import { listApprovalQueue, listClaimSources } from "@/lib/approvals/market-release";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ClaimSourceRegistryControl } from "@/components/approvals/ClaimSourceRegistryControl";

export default async function ApprovalDeskPage() {
  const user = await requireSection("APPROVALS");
  const [queue, sources] = await Promise.all([listApprovalQueue(), listClaimSources()]);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="max-w-4xl">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-brand">Approval Desk</p>
          <Badge tone="neutral">Market release authority</Badge>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
          Nothing reaches the market because it looked good.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted md:text-base">
          Brand & Claims, authoritative sources, Compliance/Legal where required and final market release are separate gates.
          An approval is bound to the exact content reviewed; editing the material makes the old approval stale.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Release queue</p>
              <h2 className="mt-1 text-xl font-semibold text-ink">What needs a decision?</h2>
            </div>
            <Link href="/studio" className="text-sm font-medium text-brand hover:text-brand-muted">Studio →</Link>
          </div>
          <div className="mt-5 space-y-2">
            {queue.map((item) => (
              <Link
                key={item.campaign.id}
                href={`/approvals/${item.campaign.id}`}
                className="block rounded-xl border border-surface-border px-4 py-4 transition hover:border-brand/30 hover:bg-brand/5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{item.campaign.name}</p>
                    <p className="mt-1 text-xs text-ink-faint">
                      {item.campaign.riskLevel} risk · {item.sourceCount} current source{item.sourceCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Badge tone={item.currentRelease ? "good" : item.campaign.status === "REJECTED" ? "bad" : "neutral"}>
                    {item.currentRelease ? `MARKET v${item.currentRelease.releaseVersion}` : item.campaign.status}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-ink-muted sm:grid-cols-3">
                  <GateSummary label="Brand & Claims" value={item.brandDecision?.action ?? "WAITING"} />
                  <GateSummary label="Compliance / Legal" value={item.complianceDecision?.action ?? "WAITING"} />
                  <GateSummary label="Final release" value={item.currentRelease ? "CURRENT" : "WAITING"} />
                </div>
              </Link>
            ))}
            {queue.length === 0 ? (
              <div className="rounded-xl border border-dashed border-surface-border p-6 text-sm text-ink-muted">
                No campaigns are waiting for market review yet. Studio drafts will appear here once a campaign exists.
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Source authority</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">What makes a claim true?</h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Outreach stores references and versions, not a new copy of SecurePay truth. Only CURRENT sources can support a market release.
          </p>
          <div className="mt-4 space-y-2">
            {sources.slice(0, 6).map((source) => (
              <div key={source.id} className="rounded-xl border border-surface-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-ink">{source.title}</p>
                    <p className="mt-0.5 text-xs text-ink-faint">{source.sourceKey} · {source.version}</p>
                  </div>
                  <Badge tone={source.status === "CURRENT" ? "good" : "neutral"}>{source.status}</Badge>
                </div>
              </div>
            ))}
            {sources.length === 0 ? <p className="text-sm text-ink-muted">No authoritative claim sources are registered yet.</p> : null}
          </div>
        </Card>
      </section>

      {user.role === "OWNER" ? <ClaimSourceRegistryControl /> : null}

      <p className="text-xs leading-5 text-ink-faint">
        Approval does not distribute content and does not authorise advertising spend. Distribution and budget authority remain separate.
      </p>
    </div>
  );
}

function GateSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface px-3 py-2">
      <span className="block text-ink-faint">{label}</span>
      <span className="mt-0.5 block font-medium text-ink">{value}</span>
    </div>
  );
}
