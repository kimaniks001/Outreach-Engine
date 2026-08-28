import Link from "next/link";
import { requireSection } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { listCampaigns } from "@/lib/campaigns/campaigns";
import { listAllVariantsWithCampaignName } from "@/lib/creative/variants";
import { listModelsWithProviders } from "@/lib/ai/registry";
import { STUDIO_LANES, countRoutableModels } from "@/lib/studio/capabilities";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default async function StudioPage() {
  const user = await requireSection("STUDIO");
  const canSeeCampaignStrategy = can(user.role, "view", "campaigns");
  const canCreateContent = can(user.role, "create", "content") || can(user.role, "edit", "campaigns");

  const [modelRows, campaigns, contentRows] = await Promise.all([
    listModelsWithProviders(),
    canSeeCampaignStrategy ? listCampaigns() : Promise.resolve([]),
    canSeeCampaignStrategy ? Promise.resolve([]) : listAllVariantsWithCampaignName(),
  ]);

  const contentCampaigns = Array.from(
    new Map(
      contentRows.map(({ variant, campaignName, campaignStatus }) => [
        variant.campaignId,
        { id: variant.campaignId, name: campaignName, status: campaignStatus },
      ])
    ).values()
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="max-w-4xl">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-brand">Creative Studio</p>
          <Badge tone="neutral">Governed AI · human release</Badge>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
          Make something worth putting in the market.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted md:text-base">
          Start from the commercial job, then choose the right production capability. Different AI models are useful for
          different work. Studio may create and revise drafts; it cannot publish, approve claims or spend a distribution
          budget on its own.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Work in the studio</p>
              <h2 className="mt-1 text-xl font-semibold text-ink">Open a campaign workspace</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Campaign strategy remains the source brief. Studio turns it into creative work without changing its authority.
              </p>
            </div>
            <Link href="/campaigns" className="text-sm font-medium text-brand hover:text-brand-muted">
              Campaigns →
            </Link>
          </div>

          <div className="mt-5 space-y-2">
            {canSeeCampaignStrategy
              ? campaigns.slice(0, 8).map((campaign) => (
                  <WorkspaceRow
                    key={campaign.id}
                    id={campaign.id}
                    name={campaign.name}
                    status={campaign.status}
                    context={campaign.targetAudience}
                  />
                ))
              : contentCampaigns.slice(0, 8).map((campaign) => (
                  <WorkspaceRow
                    key={campaign.id}
                    id={campaign.id}
                    name={campaign.name}
                    status={campaign.status}
                    context="Creative work assigned to Content & Engagement"
                  />
                ))}

            {(canSeeCampaignStrategy ? campaigns.length : contentCampaigns.length) === 0 ? (
              <div className="rounded-xl border border-dashed border-surface-border p-6 text-sm text-ink-muted">
                No Studio workspace is available yet. Start from an approved market opportunity and create a campaign first.
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Release boundary</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Draft is not market-ready.</h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Everything produced here remains draft work. Brand, claims, Compliance/Legal where required, final market approval
            and distribution authority are separate gates.
          </p>
          <div className="mt-4 rounded-xl border border-brand/20 bg-brand/5 p-4 text-sm text-ink-muted">
            <span className="font-medium text-ink">AI may create.</span> SecurePay must authorise. Distribution may amplify.
          </div>
          <Link
            href="/studio/assets"
            className="mt-4 inline-flex rounded-lg border border-brand/30 px-3 py-2 text-sm font-semibold text-brand transition hover:bg-brand/5"
          >
            Open Asset Library →
          </Link>
        </Card>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Production desk</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">Choose the capability, not the hype.</h2>
          </div>
          <p className="max-w-xl text-sm text-ink-muted">
            Availability below comes from the governed Model Registry. A connected model is still unusable until it is approved
            for the specific task.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {STUDIO_LANES.map((lane) => {
            const available = countRoutableModels(modelRows, lane.taskType);
            return (
              <div key={lane.key} className="rounded-2xl border border-surface-border bg-surface-raised p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold text-ink">{lane.label}</h3>
                  <Badge tone={available > 0 ? "good" : "neutral"}>
                    {available > 0 ? `${available} ready` : "Not connected"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-5 text-ink-muted">{lane.description}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {lane.outputs.map((output) => (
                    <span key={output} className="rounded-full border border-surface-border px-2 py-1 text-xs text-ink-faint">
                      {output}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-4">
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Model desk</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">What Studio can actually use today</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {modelRows.map(({ model, provider }) => {
            const live = provider.status === "AVAILABLE" && model.enabled && model.approved && model.status === "APPROVED";
            return (
              <div key={model.id} className="rounded-2xl border border-surface-border bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{model.displayName}</p>
                    <p className="mt-0.5 text-xs text-ink-faint">{provider.displayName}</p>
                  </div>
                  <Badge tone={live ? "good" : provider.isMock ? "warn" : "neutral"}>
                    {provider.isMock ? "DEMO" : live ? "AVAILABLE" : provider.status}
                  </Badge>
                </div>
                <p className="mt-3 text-xs font-medium uppercase tracking-widest text-ink-faint">Approved work</p>
                <p className="mt-1 text-sm text-ink-muted">
                  {model.approvedTaskTypes.length > 0 ? model.approvedTaskTypes.join(" · ") : "No task approvals"}
                </p>
                {model.capabilities.length > 0 ? (
                  <p className="mt-3 text-xs text-ink-faint">Capabilities: {model.capabilities.join(", ")}</p>
                ) : null}
              </div>
            );
          })}
          {modelRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-surface-border p-6 text-sm text-ink-muted">
              No AI models are registered. Studio remains usable for human creative work, but no AI generation can be routed.
            </div>
          ) : null}
        </div>
      </section>

      {!canCreateContent ? (
        <p className="text-xs text-ink-faint">
          Your role can inspect Studio work and model availability but does not have creative-generation authority.
        </p>
      ) : null}
    </div>
  );
}

function WorkspaceRow({
  id,
  name,
  status,
  context,
}: {
  id: string;
  name: string;
  status: string;
  context: string;
}) {
  return (
    <Link
      href={`/studio/${id}`}
      className="flex items-center justify-between gap-4 rounded-xl border border-surface-border px-4 py-3 transition hover:border-brand/30 hover:bg-brand/5"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{name}</p>
        <p className="mt-0.5 truncate text-xs text-ink-faint">{context}</p>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone={status === "READY_FOR_DISTRIBUTION" ? "good" : status === "REJECTED" ? "bad" : "neutral"}>{status}</Badge>
        <span className="text-brand">→</span>
      </div>
    </Link>
  );
}
