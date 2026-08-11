import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { ForbiddenState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ActionButton } from "@/components/ui/ActionButton";
import { NewVariantForm } from "@/components/experiments/NewVariantForm";
import { getExperiment, listVariants, listExperimentResults } from "@/lib/experiments/experiments";
import { listVariantsForCampaign } from "@/lib/creative/variants";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export default async function ExperimentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSection("CAMPAIGNS");
  if (!can(user.role, "view", "campaigns")) {
    return <ForbiddenState what="Experiments are restricted to your role." />;
  }

  const { id } = await params;
  const experiment = await getExperiment(id);
  if (!experiment) notFound();

  const [variants, results, creativeVariants, distributionPlans] = await Promise.all([
    listVariants(id),
    listExperimentResults(id),
    experiment.campaignId ? listVariantsForCampaign(experiment.campaignId) : Promise.resolve([]),
    experiment.campaignId ? db.select().from(schema.distributionPlans).where(eq(schema.distributionPlans.campaignId, experiment.campaignId)) : Promise.resolve([]),
  ]);

  const canEdit = can(user.role, "edit", "campaigns");

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">
          {experiment.campaignId ? <Link href={`/campaigns/${experiment.campaignId}`} className="hover:text-brand">Campaign</Link> : "Experiment"} / Experiment
        </p>
        <h1 className="mt-1 text-xl font-semibold text-ink">{experiment.name}</h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
          <Badge tone={experiment.status === "COMPLETED" ? "good" : experiment.status === "CANCELLED" || experiment.status === "INCONCLUSIVE" ? "bad" : "neutral"}>{experiment.status}</Badge>
          {experiment.isDemo ? <Badge tone="warn">DEMO</Badge> : null}
        </p>
      </header>

      <Card title="Hypothesis">
        <p className="text-sm text-ink">{experiment.hypothesis}</p>
        <p className="mt-2 text-xs text-ink-faint">Primary metric: {experiment.primaryMetric}</p>
        <p className="text-xs text-ink-faint">Expected outcome: {experiment.expectedOutcome}</p>
      </Card>

      <Card title={`Variants (${variants.length})`}>
        <ul className="mb-3 space-y-1 text-sm">
          {variants.map((v) => (
            <li key={v.id} className="flex items-center gap-2">
              <Badge tone={v.isControl ? "neutral" : "brand"}>{v.variantLabel}{v.isControl ? " (control)" : ""}</Badge>
              <span className="text-ink-muted">{v.messagingAngle}</span>
              {!v.distributionPlanId ? <span className="text-xs text-status-warn">no distribution plan linked</span> : null}
            </li>
          ))}
        </ul>
        {canEdit && experiment.status === "DRAFT" ? (
          <NewVariantForm
            experimentId={id}
            creativeVariants={creativeVariants.map((v) => ({ id: v.id, variantLabel: v.variantLabel, angle: v.angle }))}
            distributionPlans={distributionPlans.map((p) => ({ id: p.id, objective: p.objective }))}
          />
        ) : null}
      </Card>

      {canEdit ? (
        <Card title="Lifecycle">
          <div className="flex flex-wrap gap-2">
            {experiment.status === "DRAFT" ? <ActionButton url={`/api/experiments/${id}/plan`} label="Plan" tone="neutral" /> : null}
            {(experiment.status === "DRAFT" || experiment.status === "PLANNED") ? <ActionButton url={`/api/experiments/${id}/start`} label="Start" tone="brand" /> : null}
            {experiment.status === "RUNNING" ? (
              <ActionButton url={`/api/experiments/${id}/evaluate`} body={{ useAiNarrative: true }} label="Evaluate now" tone="brand" pendingLabel="Evaluating…" />
            ) : null}
            {(experiment.status === "COMPLETED" || experiment.status === "INCONCLUSIVE") ? (
              <ActionButton url={`/api/experiments/${id}/learning`} label="Create learning" tone="good" />
            ) : null}
            {experiment.status !== "CANCELLED" && experiment.status !== "COMPLETED" ? (
              <ActionButton url={`/api/experiments/${id}/cancel`} label="Cancel" tone="bad" confirmMessage="Cancel this experiment?" />
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card title="Evaluation history">
        {results.length === 0 ? (
          <p className="text-sm text-ink-muted">Not evaluated yet.</p>
        ) : (
          <div className="space-y-4">
            {results.map((r) => (
              <div key={r.id} className="border-b border-surface-border/60 pb-3 last:border-0">
                <div className="flex items-center gap-2 text-sm">
                  <Badge tone={r.confidence === "HIGH" ? "good" : r.confidence === "INSUFFICIENT_DATA" ? "neutral" : "warn"}>{r.confidence}</Badge>
                  <span className="text-ink-faint">{r.computedAt.toLocaleString()}</span>
                </div>
                <p className="mt-1 text-sm text-ink">{r.interpretation}</p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-surface-border text-ink-faint">
                        <th className="py-1 pr-3 font-medium">Variant</th>
                        <th className="py-1 pr-3 font-medium">Sample</th>
                        <th className="py-1 pr-3 font-medium">Conversions</th>
                        <th className="py-1 pr-3 font-medium">Rate</th>
                        <th className="py-1 pr-3 font-medium">vs control</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.perVariant.map((v) => (
                        <tr key={v.variantId} className={v.variantId === r.winnerVariantId ? "text-status-good" : "text-ink-muted"}>
                          <td className="py-1 pr-3">{v.label}{v.variantId === r.winnerVariantId ? " 🏆" : ""}</td>
                          <td className="py-1 pr-3">{v.sampleCount}</td>
                          <td className="py-1 pr-3">{v.primaryMetricCount}</td>
                          <td className="py-1 pr-3">{(v.conversionRate * 100).toFixed(1)}%</td>
                          <td className="py-1 pr-3">{v.relativeDifference !== null ? `${(v.relativeDifference * 100).toFixed(1)}%` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
