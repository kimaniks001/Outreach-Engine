import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { ForbiddenState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getCampaign, listApprovalHistory, listBrandReviews } from "@/lib/campaigns/campaigns";
import { listVariantsForCampaign } from "@/lib/creative/variants";
import { VariantCard } from "@/components/campaigns/VariantCard";
import { RunBrandGuardianButton, CampaignReviewButtons, GenerateVariantsButton } from "@/components/campaigns/CampaignActions";
import { NewExperimentForm } from "@/components/experiments/NewExperimentForm";
import { listExperiments } from "@/lib/experiments/experiments";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSection("CAMPAIGNS");
  if (!can(user.role, "view", "campaigns")) {
    return <ForbiddenState what="Campaign strategy is restricted to your role." />;
  }

  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  const [variants, approvalHistory, brandReviews, experiments] = await Promise.all([
    listVariantsForCampaign(id),
    listApprovalHistory("campaign", id),
    listBrandReviews("campaign", id),
    listExperiments({ campaignId: id }),
  ]);

  const canEdit = can(user.role, "edit", "campaigns");
  const canApprove = can(user.role, "approve", "campaigns");
  const latestReview = brandReviews[0];

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-ink">{campaign.name}</h2>
          {campaign.isDemo ? <Badge tone="warn">DEMO / SAMPLE</Badge> : null}
          <Badge tone={campaign.status === "READY_FOR_DISTRIBUTION" ? "good" : campaign.status === "REJECTED" ? "bad" : "neutral"}>
            {campaign.status}
          </Badge>
          <Badge tone={campaign.brandGuardianStatus === "PASS" ? "good" : campaign.brandGuardianStatus === "BLOCK" ? "bad" : "neutral"}>
            Brand Guardian: {campaign.brandGuardianStatus}
          </Badge>
        </div>
        <Link href={`/intelligence/opportunities/${campaign.opportunityId}`} className="mt-1 inline-block text-xs text-brand">
          View source opportunity →
        </Link>

        <dl className="mt-4 grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <Field label="Objective" value={campaign.objective} full />
          <Field label="Target audience" value={campaign.targetAudience} />
          <Field label="Positioning angle" value={campaign.positioningAngle} />
          <Field label="Core message" value={campaign.coreMessage} full />
          <Field label="CTA" value={campaign.cta} />
          <Field label="Risk level" value={campaign.riskLevel} />
        </dl>

        {campaign.status === "READY_FOR_DISTRIBUTION" ? (
          <p className="mt-4 text-xs text-ink-faint">
            No distribution/publishing action exists in this phase — that begins Phase 3.
          </p>
        ) : null}
      </Card>

      <Card title="Brand Guardian">
        {latestReview ? (
          <div className="space-y-2 text-sm">
            <Badge tone={latestReview.result === "PASS" ? "good" : latestReview.result === "BLOCK" ? "bad" : "warn"}>
              {latestReview.result}
            </Badge>
            {latestReview.reasons.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-ink-muted">
                {latestReview.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-muted">No issues found.</p>
            )}
            {latestReview.recommendedCorrection ? (
              <p className="text-ink-muted">
                <span className="text-ink-faint">Recommended correction: </span>
                {latestReview.recommendedCorrection}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">Not reviewed yet.</p>
        )}
        {canEdit ? (
          <div className="mt-3">
            <RunBrandGuardianButton campaignId={campaign.id} />
          </div>
        ) : null}
      </Card>

      <Card
        title={`Creative variants (${variants.length})`}
        action={canEdit ? <GenerateVariantsButton campaignId={campaign.id} /> : undefined}
      >
        {variants.length === 0 ? (
          <p className="text-sm text-ink-muted">No creative variants generated yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {variants.map((v) => (
              <VariantCard key={v.id} variant={v} canEdit={can(user.role, "edit", "content")} />
            ))}
          </div>
        )}
      </Card>

      {canApprove ? (
        <Card title="Approval">
          <CampaignReviewButtons campaignId={campaign.id} />
        </Card>
      ) : null}

      {approvalHistory.length > 0 ? (
        <Card title="Approval history">
          <ul className="space-y-2 text-sm text-ink-muted">
            {approvalHistory.map((e) => (
              <li key={e.id}>
                {e.action} — {e.createdAt.toISOString().slice(0, 19).replace("T", " ")}
                {e.notes ? ` — ${e.notes}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title={`Experiments (${experiments.length})`} action={canEdit ? <NewExperimentForm campaignId={campaign.id} /> : undefined}>
        {experiments.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No experiments yet — compare messaging/creative variants against real SecurePay behavior,
            not just clicks.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {experiments.map((e) => (
              <li key={e.id} className="flex items-center justify-between border-b border-surface-border/60 pb-2 last:border-0">
                <Link href={`/campaigns/experiments/${e.id}`} className="text-ink hover:text-brand">{e.name}</Link>
                <Badge tone={e.status === "COMPLETED" ? "good" : e.status === "CANCELLED" || e.status === "INCONCLUSIVE" ? "bad" : "neutral"}>{e.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
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
