import { requireSection } from "@/lib/rbac/guard";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { computeFunnelSummary, computeDropOffFindings, computeImpactSummary, FUNNEL_STAGES } from "@/lib/attribution/funnel";
import { CHANNEL_LABELS, isChannelType } from "@/lib/distribution/channels";

// Phase 4 activates real IMPACT data — Phase 4 brief Section 30. Only
// real counts appear here; no fabricated revenue since no monetary event
// data is guaranteed to exist. Growth Director reasoning over this data
// remains Phase 5.
export default async function ImpactPage() {
  await requireSection("IMPACT");

  const [summary, funnel] = await Promise.all([computeImpactSummary(), computeFunnelSummary()]);
  const dropOffFindings = computeDropOffFindings(funnel);

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Impact</p>
        <h1 className="mt-1 text-xl font-semibold text-ink">Conversion &amp; Impact</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Real Phase 4 counts only. Growth Director recommendations and full ROI/experiment
          reporting arrive in Phase 5.
        </p>
      </header>

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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}
