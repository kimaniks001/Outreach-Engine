import Link from "next/link";
import { requireSection } from "@/lib/rbac/guard";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { computeFunnelSummary, computeDropOffFindings, computeImpactSummary, FUNNEL_STAGES } from "@/lib/attribution/funnel";
import { computeEfficiencySummary, computeRoi } from "@/lib/impact/roi";
import { computeCampaignScorecard, computeChannelScorecard, computeProductScorecards } from "@/lib/impact/scorecards";
import { CHANNEL_LABELS, CHANNEL_TYPES, isChannelType } from "@/lib/distribution/channels";
import { listCampaigns } from "@/lib/campaigns/campaigns";
import { listExperiments } from "@/lib/experiments/experiments";
import { listLearnings } from "@/lib/learning/learnings";

// Phase 5 completes IMPACT as a real executive workspace — Phase 5 brief
// Section 33. Only real counts appear anywhere on this page; no
// fabricated revenue. Growth Director reasoning over this data lives at
// /growth-director.
const TABS = ["overview", "campaigns", "channels", "products", "experiments", "costs", "learnings"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  campaigns: "Campaigns",
  channels: "Channels",
  products: "Products",
  experiments: "Experiments",
  costs: "Costs",
  learnings: "Learnings",
};

export default async function ImpactPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSection("IMPACT");
  const { tab: rawTab } = await searchParams;
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "overview";

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Impact</p>
        <h1 className="mt-1 text-xl font-semibold text-ink">Conversion &amp; Impact</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Real measured data only. Growth Director recommendations live at{" "}
          <Link href="/growth-director" className="text-brand">
            Growth Director
          </Link>
          .
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/impact?tab=${t}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              tab === t ? "border-brand/40 bg-brand/15 text-brand" : "border-surface-border text-ink-muted"
            }`}
          >
            {TAB_LABELS[t]}
          </Link>
        ))}
      </div>

      {tab === "overview" ? <OverviewTab /> : null}
      {tab === "campaigns" ? <CampaignsTab /> : null}
      {tab === "channels" ? <ChannelsTab /> : null}
      {tab === "products" ? <ProductsTab /> : null}
      {tab === "experiments" ? <ExperimentsTab /> : null}
      {tab === "costs" ? <CostsTab /> : null}
      {tab === "learnings" ? <LearningsTab /> : null}
    </div>
  );
}

async function OverviewTab() {
  const [summary, funnel] = await Promise.all([computeImpactSummary(), computeFunnelSummary()]);
  const dropOffFindings = computeDropOffFindings(funnel);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Reached" value={summary.reachedProfiles} />
        <Stat label="Engaged" value={summary.engagedProfiles} />
        <Stat label="KSNumbers created" value={summary.ksNumbersCreated} />
        <Stat label="First product uses" value={summary.firstProductUses} />
        <Stat label="Agreements completed" value={summary.completedAgreements} />
        <Stat label="Repeat users" value={summary.repeatUsers} />
      </div>

      <Card title="Conversion funnel">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-ink-faint">
                {FUNNEL_STAGES.map((s) => (
                  <th key={s} className="py-2 pr-4 font-medium">{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {funnel.stages.map((s) => (
                  <td key={s.stage} className="py-2 pr-4 text-ink">{s.profileCount}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Drop-off diagnostics">
        {dropOffFindings.length === 0 ? (
          <p className="text-sm text-ink-muted">No drop-off issues detected against current thresholds.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {dropOffFindings.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <Badge tone="warn">{f.fromStage} → {f.toStage}</Badge>
                <span className="text-ink-muted">{f.finding}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Conversions by campaign">
          {summary.conversionsByCampaign.length === 0 ? (
            <p className="text-sm text-ink-muted">No attributed conversions yet.</p>
          ) : (
            <ul className="space-y-1 text-sm text-ink-muted">
              {summary.conversionsByCampaign.map((c) => (
                <li key={c.campaignId} className="flex justify-between">
                  <span>{c.campaignId.slice(0, 8)}</span>
                  <span className="text-ink">{c.conversionCount}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Conversions by channel">
          {summary.conversionsByChannel.length === 0 ? (
            <p className="text-sm text-ink-muted">No attributed conversions yet.</p>
          ) : (
            <ul className="space-y-1 text-sm text-ink-muted">
              {summary.conversionsByChannel.map((c) => (
                <li key={c.channel} className="flex justify-between">
                  <span>{isChannelType(c.channel) ? CHANNEL_LABELS[c.channel] : c.channel}</span>
                  <span className="text-ink">{c.conversionCount}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

async function CampaignsTab() {
  const campaigns = await listCampaigns();
  const scorecards = await Promise.all(campaigns.map(async (c) => ({ campaign: c, scorecard: await computeCampaignScorecard(c.id) })));

  return (
    <Card title="Campaign scorecards">
      {scorecards.length === 0 ? (
        <p className="text-sm text-ink-muted">No campaigns yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-ink-faint">
                <th className="py-2 pr-4 font-medium">Campaign</th>
                <th className="py-2 pr-4 font-medium">Reach</th>
                <th className="py-2 pr-4 font-medium">Engagement</th>
                <th className="py-2 pr-4 font-medium">Registrations</th>
                <th className="py-2 pr-4 font-medium">First use</th>
                <th className="py-2 pr-4 font-medium">Agreements</th>
                <th className="py-2 pr-4 font-medium">Spend</th>
                <th className="py-2 pr-4 font-medium">Cost / conversion</th>
              </tr>
            </thead>
            <tbody>
              {scorecards.map(({ campaign, scorecard }) => (
                <tr key={campaign.id} className="border-b border-surface-border/60">
                  <td className="py-2 pr-4 text-ink">
                    <Link href={`/campaigns/${campaign.id}`} className="hover:text-brand">{campaign.name}</Link>
                    {campaign.isDemo ? <span className="ml-2"><Badge tone="warn">DEMO</Badge></span> : null}
                  </td>
                  <td className="py-2 pr-4 text-ink-muted">{scorecard.reach}</td>
                  <td className="py-2 pr-4 text-ink-muted">{scorecard.engagement}</td>
                  <td className="py-2 pr-4 text-ink-muted">{scorecard.registrations}</td>
                  <td className="py-2 pr-4 text-ink-muted">{scorecard.firstUse}</td>
                  <td className="py-2 pr-4 text-ink-muted">{scorecard.agreementCompletion}</td>
                  <td className="py-2 pr-4 text-ink-muted">{scorecard.spend !== null ? scorecard.spend.toFixed(2) : "—"}</td>
                  <td className="py-2 pr-4 text-ink-muted">{scorecard.costPerConversion !== null ? scorecard.costPerConversion.toFixed(2) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function ChannelsTab() {
  const channels = await Promise.all(CHANNEL_TYPES.map((c) => computeChannelScorecard(c)));
  const active = channels.filter((c) => c.reach > 0);

  return (
    <Card title="Channel scorecards">
      {active.length === 0 ? (
        <p className="text-sm text-ink-muted">No channel activity yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-ink-faint">
                <th className="py-2 pr-4 font-medium">Channel</th>
                <th className="py-2 pr-4 font-medium">Reach</th>
                <th className="py-2 pr-4 font-medium">Meaningful conversions</th>
                <th className="py-2 pr-4 font-medium">Conversion rate</th>
                <th className="py-2 pr-4 font-medium">Spend</th>
                <th className="py-2 pr-4 font-medium">First / Last / Linear / Multi</th>
              </tr>
            </thead>
            <tbody>
              {active.map((c) => (
                <tr key={c.channel} className="border-b border-surface-border/60">
                  <td className="py-2 pr-4 text-ink">{CHANNEL_LABELS[c.channel as keyof typeof CHANNEL_LABELS]}</td>
                  <td className="py-2 pr-4 text-ink-muted">{c.reach}</td>
                  <td className="py-2 pr-4 text-ink-muted">{c.meaningfulConversions}</td>
                  <td className="py-2 pr-4 text-ink-muted">{c.conversionRate !== null ? `${(c.conversionRate * 100).toFixed(1)}%` : "—"}</td>
                  <td className="py-2 pr-4 text-ink-muted">{c.spend !== null ? c.spend.toFixed(2) : "—"}</td>
                  <td className="py-2 pr-4 text-ink-muted">
                    {c.touchModelContribution.firstTouch} / {c.touchModelContribution.lastTouch} / {c.touchModelContribution.linear} / {c.touchModelContribution.multiTouch}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function ProductsTab() {
  const products = await computeProductScorecards();
  return (
    <Card title="Product scorecards">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {products.map((p) => (
          <div key={p.product} className="rounded-lg border border-surface-border bg-surface-raised p-4">
            <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">{p.product.replace("_", " ")}</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{p.adoption}</p>
            <p className="text-xs text-ink-faint">adoptions</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

async function ExperimentsTab() {
  const experiments = await listExperiments();
  return (
    <Card title="Experiments" action={<Link href="/campaigns" className="text-xs text-brand">Manage from Campaigns →</Link>}>
      {experiments.length === 0 ? (
        <p className="text-sm text-ink-muted">No experiments yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-ink-faint">
                <th className="py-2 pr-4 font-medium">Experiment</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Confidence</th>
                <th className="py-2 pr-4 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {experiments.map((e) => (
                <tr key={e.id} className="border-b border-surface-border/60">
                  <td className="py-2 pr-4 text-ink">
                    {e.name}
                    {e.isDemo ? <span className="ml-2"><Badge tone="warn">DEMO</Badge></span> : null}
                  </td>
                  <td className="py-2 pr-4">
                    <Badge tone={e.status === "COMPLETED" ? "good" : e.status === "CANCELLED" ? "bad" : "neutral"}>{e.status}</Badge>
                  </td>
                  <td className="py-2 pr-4 text-ink-muted">{e.confidence}</td>
                  <td className="py-2 pr-4 text-ink-muted">{e.result ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function CostsTab() {
  const [efficiency, roi] = await Promise.all([computeEfficiencySummary(), computeRoi()]);
  return (
    <div className="space-y-5">
      <Card title="Measured cost & efficiency">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
          <Row label="Distribution spend" value={efficiency.distributionSpend !== null ? `$${efficiency.distributionSpend.toFixed(2)}` : "—"} />
          <Row label="AI cost" value={efficiency.aiCost !== null ? `$${efficiency.aiCost.toFixed(4)}` : "—"} />
          <Row label="Total measured cost" value={efficiency.totalMeasuredCost !== null ? `$${efficiency.totalMeasuredCost.toFixed(2)}` : "—"} />
          <Row label="Cost / engaged profile" value={efficiency.costPerEngagedProfile !== null ? `$${efficiency.costPerEngagedProfile.toFixed(2)}` : "INSUFFICIENT_DATA"} />
          <Row label="Cost / KSNumber" value={efficiency.costPerKsNumber !== null ? `$${efficiency.costPerKsNumber.toFixed(2)}` : "INSUFFICIENT_DATA"} />
          <Row label="Cost / first product use" value={efficiency.costPerFirstProductUse !== null ? `$${efficiency.costPerFirstProductUse.toFixed(2)}` : "INSUFFICIENT_DATA"} />
          <Row label="Cost / completed agreement" value={efficiency.costPerCompletedAgreement !== null ? `$${efficiency.costPerCompletedAgreement.toFixed(2)}` : "INSUFFICIENT_DATA"} />
          <Row label="Cost / repeat user" value={efficiency.costPerRepeatUser !== null ? `$${efficiency.costPerRepeatUser.toFixed(2)}` : "INSUFFICIENT_DATA"} />
        </dl>
      </Card>
      <Card title="ROI">
        {roi.status === "INSUFFICIENT_VALUE_DATA" ? (
          <p className="text-sm text-ink-muted">
            <Badge tone="neutral">INSUFFICIENT_VALUE_DATA</Badge> No conversion carries a known monetary value
            yet — ROI is never fabricated.
          </p>
        ) : (
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <Row label="Total value" value={`$${roi.totalValue.toFixed(2)}`} />
            <Row label="Total cost" value={`$${roi.totalCost.toFixed(2)}`} />
            <Row label="ROI" value={`${(roi.roi * 100).toFixed(1)}%`} />
          </dl>
        )}
      </Card>
      <p className="text-xs text-ink-faint">
        AI budget policies and per-provider/model cost breakdown: see{" "}
        <Link href="/admin/cost-models" className="text-brand">Admin → Cost &amp; Models</Link>.
      </p>
    </div>
  );
}

async function LearningsTab() {
  const learnings = await listLearnings();
  return (
    <Card title="Commercial learnings">
      {learnings.length === 0 ? (
        <p className="text-sm text-ink-muted">No learnings recorded yet.</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {learnings.map((l) => (
            <li key={l.id} className="border-b border-surface-border/60 pb-3 last:border-0">
              <div className="flex items-center gap-2">
                <Badge tone={l.status === "ACTIVE" ? "good" : l.status === "REJECTED" ? "bad" : "neutral"}>{l.status}</Badge>
                <Badge tone="neutral">{l.confidence}</Badge>
                {l.isDemo ? <Badge tone="warn">DEMO</Badge> : null}
              </div>
              <p className="mt-1 text-ink">{l.conclusion}</p>
              <p className="text-xs text-ink-faint">{l.observation}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
