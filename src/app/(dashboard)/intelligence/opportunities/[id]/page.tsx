import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection } from "@/lib/rbac/guard";
import { can, scopeFor } from "@/lib/rbac/permissions";
import { ForbiddenState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getOpportunity, getOpportunityScore } from "@/lib/intelligence/opportunities";
import { getUsageRecord } from "@/lib/ai/usage";
import { MONEY_FLOW_DEFINITIONS } from "@/lib/opportunity/money-flow";
import { SCORE_DIMENSIONS, SCORE_DIMENSION_LABELS } from "@/lib/opportunity/scoring";
import { OpportunityReviewButtons } from "@/components/intelligence/OpportunityReviewButtons";
import { CreateCampaignForm } from "@/components/campaigns/CreateCampaignForm";

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSection("INTELLIGENCE");
  const scope = scopeFor(user.role, "intelligence");
  if (scope === "none") return <ForbiddenState what="Opportunities are restricted to your role." />;

  const { id } = await params;
  const opportunity = await getOpportunity(id);
  if (!opportunity) notFound();
  if (scope === "approved" && opportunity.status !== "APPROVED") {
    return <ForbiddenState what="This opportunity has not been approved yet." />;
  }

  const [score, usage] = await Promise.all([
    getOpportunityScore(id),
    opportunity.aiUsageRecordId ? getUsageRecord(opportunity.aiUsageRecordId) : Promise.resolve(null),
  ]);

  const canReview = can(user.role, "approve", "intelligence");
  const canCreateCampaign = can(user.role, "create", "campaigns") && opportunity.status === "APPROVED";
  const canSeeSource = scope === "raw" || scope === "full";

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">{opportunity.title}</h2>
              {opportunity.isDemo ? <Badge tone="warn">DEMO / SAMPLE</Badge> : null}
              <Badge tone={opportunity.status === "APPROVED" ? "good" : opportunity.status === "REJECTED" ? "bad" : "neutral"}>
                {opportunity.status}
              </Badge>
              <Badge tone="brand">{opportunity.opportunityScore}/100</Badge>
            </div>
            {canSeeSource ? (
              <Link href={`/intelligence/signals/${opportunity.marketSignalId}`} className="mt-1 inline-block text-xs text-brand">
                View source signal →
              </Link>
            ) : null}
          </div>
          {canReview && (opportunity.status === "NEEDS_REVIEW" || opportunity.status === "DRAFT") ? (
            <OpportunityReviewButtons opportunityId={opportunity.id} />
          ) : null}
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <Field label="Problem" value={opportunity.problem} />
          <Field label="Target audience" value={opportunity.targetAudience} />
          <Field label="Sector" value={opportunity.affectedSector ?? "—"} />
          <Field label="Geography" value={opportunity.geography ?? "—"} />
          <Field label="SecurePay relevance" value={opportunity.securepayRelevance} full />
          <Field
            label="Money-flow mapping"
            value={
              opportunity.moneyFlowMapping === "NEEDS_DOCTRINE_REVIEW"
                ? "NEEDS_DOCTRINE_REVIEW — not enough doctrine to safely map a product"
                : `${MONEY_FLOW_DEFINITIONS[opportunity.moneyFlowMapping].label} — ${MONEY_FLOW_DEFINITIONS[opportunity.moneyFlowMapping].product}`
            }
            full
          />
          <Field label="Evidence summary" value={opportunity.evidenceSummary} full />
          <Field label="Urgency" value={opportunity.urgency} />
          <Field label="Confidence" value={Number(opportunity.confidence).toFixed(2)} />
          {opportunity.risksCaveats ? <Field label="Risks / caveats" value={opportunity.risksCaveats} full /> : null}
        </dl>
      </Card>

      {score ? (
        <Card title="Score breakdown (0-100, unweighted average)">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {SCORE_DIMENSIONS.map((d) => (
              <div key={d} className="rounded-md border border-surface-border p-3">
                <p className="text-xs text-ink-faint">{SCORE_DIMENSION_LABELS[d]}</p>
                <p className="mt-1 text-lg font-semibold text-ink">{score[d]}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-ink-muted">
            Total: <span className="font-medium text-ink">{score.totalScore}/100</span>
            {score.aiProposed ? " (AI-proposed, evidence strength computed deterministically)" : " (manually adjusted)"}
          </p>
        </Card>
      ) : null}

      {usage ? (
        <Card title="AI execution">
          <dl className="space-y-2 text-sm">
            <Row label="Provider / model">{usage.providerName ? `${usage.providerName} / ${usage.modelName}` : "—"}</Row>
            <Row label="Routing reason">{usage.routingReason}</Row>
            <Row label="Latency">{usage.latencyMs !== null ? `${usage.latencyMs}ms` : "—"}</Row>
            <Row label="Estimated cost">{usage.estimatedCostUsd !== null ? `$${usage.estimatedCostUsd.toFixed(5)}` : "—"}</Row>
          </dl>
        </Card>
      ) : null}

      {canCreateCampaign ? (
        <Card title="Create a campaign from this opportunity">
          <CreateCampaignForm
            opportunityId={opportunity.id}
            defaults={{
              name: opportunity.title,
              targetAudience: opportunity.targetAudience,
              coreMessage: opportunity.evidenceSummary,
              cta: opportunity.recommendedCta ?? "",
            }}
          />
        </Card>
      ) : null}
    </div>
  );
}

function Field({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
