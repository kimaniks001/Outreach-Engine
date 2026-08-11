import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection } from "@/lib/rbac/guard";
import { can, scopeFor } from "@/lib/rbac/permissions";
import { ForbiddenState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getAudienceSegment, getAudienceScore } from "@/lib/audience/segments";
import { getCampaign } from "@/lib/campaigns/campaigns";
import { SCORE_DIMENSIONS, SCORE_DIMENSION_LABELS } from "@/lib/audience/scoring";
import { CHANNEL_LABELS, isChannelType } from "@/lib/distribution/channels";
import { AudienceAnalyzeButton } from "@/components/audience/AudienceAnalyzeButton";
import { AudienceReviewButtons } from "@/components/audience/AudienceReviewButtons";
import { GenerateChannelRecommendationsButton } from "@/components/distribution/GenerateChannelRecommendationsButton";
import { listChannelRecommendations } from "@/lib/distribution/recommendations";

export default async function AudienceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSection("AUDIENCES");
  const scope = scopeFor(user.role, "audience");
  if (scope === "none") return <ForbiddenState what="Audience segments are restricted to your role." />;

  const { id } = await params;
  const segment = await getAudienceSegment(id);
  if (!segment) notFound();
  if (scope === "approved" && segment.status !== "APPROVED") {
    return <ForbiddenState what="This audience segment has not been approved yet." />;
  }

  const [score, campaign, recommendations] = await Promise.all([
    getAudienceScore(id),
    getCampaign(segment.linkedCampaignId),
    listChannelRecommendations(segment.linkedCampaignId, id),
  ]);

  const canAnalyze = can(user.role, "create", "audience");
  const canReview = can(user.role, "approve", "audience") && (segment.status === "DRAFT" || segment.status === "NEEDS_REVIEW");
  const canGenerateRecommendations = can(user.role, "create", "distribution") && segment.status === "APPROVED";

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">{segment.name}</h2>
              {segment.isDemo ? <Badge tone="warn">DEMO / SAMPLE</Badge> : null}
              <Badge tone={segment.status === "APPROVED" ? "good" : segment.status === "REJECTED" ? "bad" : "neutral"}>
                {segment.status}
              </Badge>
              {score ? <Badge tone="brand">{score.totalScore}/100</Badge> : null}
            </div>
            {campaign ? (
              <Link href={`/campaigns/${campaign.id}`} className="mt-1 inline-block text-xs text-brand">
                Linked campaign: {campaign.name} →
              </Link>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {canAnalyze ? <AudienceAnalyzeButton segmentId={segment.id} /> : null}
            {canReview ? <AudienceReviewButtons segmentId={segment.id} /> : null}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <Field label="Description" value={segment.description} full />
          <Field label="Sector" value={segment.sector ?? "—"} />
          <Field label="Geography" value={segment.geography ?? "—"} />
          <Field label="Business / use-case criteria" value={segment.businessCriteria ?? "—"} full />
          <Field label="Role / function criteria" value={segment.roleFunctionCriteria ?? "—"} />
          <Field label="Company criteria" value={segment.companyCriteria ?? "—"} />
          <Field label="Intent criteria" value={segment.intentCriteria ?? "—"} full />
          <Field label="Estimated reach" value={segment.estimatedReach ?? "Not estimated"} />
          <Field label="Classification" value={segment.classification} />
          <div className="md:col-span-2">
            <dt className="text-xs text-ink-faint">Channel eligibility</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {segment.channelEligibility.length === 0 ? (
                <span className="text-ink-muted">None specified</span>
              ) : (
                segment.channelEligibility.map((c) => (
                  <Badge key={c} tone="neutral">
                    {isChannelType(c) ? CHANNEL_LABELS[c] : c}
                  </Badge>
                ))
              )}
            </dd>
          </div>
        </dl>
      </Card>

      {score ? (
        <Card title="Targeting score (0-100, unweighted average)">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {SCORE_DIMENSIONS.map((d) => (
              <div key={d} className="rounded-md border border-surface-border p-3">
                <p className="text-xs text-ink-faint">{SCORE_DIMENSION_LABELS[d]}</p>
                <p className="mt-1 text-lg font-semibold text-ink">{score[d]}</p>
              </div>
            ))}
            {score.channelFit !== null ? (
              <div className="rounded-md border border-surface-border p-3">
                <p className="text-xs text-ink-faint">{SCORE_DIMENSION_LABELS.channelFit}</p>
                <p className="mt-1 text-lg font-semibold text-ink">{score.channelFit}</p>
              </div>
            ) : null}
          </div>
          <p className="mt-3 text-sm text-ink-muted">
            Total: <span className="font-medium text-ink">{score.totalScore}/100</span>
            {score.aiProposed ? " — AI-proposed, server-validated" : " — manually set"}
          </p>
          {Object.keys(score.explanation).length > 0 ? (
            <dl className="mt-3 space-y-2 text-sm">
              {Object.entries(score.explanation).map(([key, note]) => (
                <div key={key}>
                  <dt className="text-xs font-medium text-ink-faint">{key}</dt>
                  <dd className="text-ink-muted">{note}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </Card>
      ) : (
        <Card title="Targeting score">
          <p className="text-sm text-ink-muted">No score yet — run AI targeting analysis to propose one.</p>
        </Card>
      )}

      {segment.status === "APPROVED" ? (
        <Card title="Channel recommendations">
          {canGenerateRecommendations ? (
            <div className="mb-3">
              <GenerateChannelRecommendationsButton campaignId={segment.linkedCampaignId} audienceSegmentId={segment.id} />
            </div>
          ) : null}
          {recommendations.length === 0 ? (
            <p className="text-sm text-ink-muted">None generated yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recommendations.map((r) => (
                <li key={r.id} className="rounded-md border border-surface-border p-3">
                  <p className="font-medium text-ink">
                    #{r.priority} — {r.channel}
                  </p>
                  <p className="mt-1 text-ink-muted">{r.rationale}</p>
                  <p className="mt-1 text-xs text-ink-faint">{r.executionAvailability}</p>
                </li>
              ))}
            </ul>
          )}
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
