import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { ForbiddenState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge, statusToTone } from "@/components/ui/Badge";
import { getDistributionPlan, listApprovalHistory } from "@/lib/distribution/plans";
import { listExecutionsForPlan } from "@/lib/distribution/executions";
import { getCurrentBudget } from "@/lib/distribution/budget-guard";
import { getAudienceSegment } from "@/lib/audience/segments";
import { getCampaign } from "@/lib/campaigns/campaigns";
import { getSafeMode } from "@/lib/safe-mode/state";
import { CHANNEL_LABELS, isChannelType } from "@/lib/distribution/channels";
import {
  RunPlanBrandGuardianButton,
  PlanReviewButtons,
  MarkReadyButton,
  LaunchSimulatedButton,
  PauseExecutionButton,
} from "@/components/distribution/PlanActions";
import { BudgetPanel } from "@/components/distribution/BudgetPanel";

export default async function DistributionPlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSection("DISTRIBUTION");
  if (!can(user.role, "view", "distribution")) {
    return <ForbiddenState what="Distribution plans are restricted to your role." />;
  }

  const { id } = await params;
  const plan = await getDistributionPlan(id);
  if (!plan) notFound();

  const [campaign, segment, budget, executions, approvalHistory, safeMode] = await Promise.all([
    getCampaign(plan.campaignId),
    getAudienceSegment(plan.audienceSegmentId),
    getCurrentBudget(id),
    listExecutionsForPlan(id),
    listApprovalHistory(id),
    getSafeMode(),
  ]);

  const canEdit = can(user.role, "edit", "distribution");
  const canApprove = can(user.role, "approve", "distribution");

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">{plan.objective}</h2>
              {plan.isDemo ? <Badge tone="warn">DEMO / SAMPLE</Badge> : null}
              <Badge
                tone={
                  plan.status === "RUNNING" || plan.status === "COMPLETED"
                    ? "good"
                    : plan.status === "FAILED" || plan.status === "CANCELLED"
                      ? "bad"
                      : "neutral"
                }
              >
                {plan.status}
              </Badge>
              <Badge tone={plan.brandGuardianStatus === "PASS" ? "good" : plan.brandGuardianStatus === "NOT_REVIEWED" ? "neutral" : "bad"}>
                Brand Guardian: {plan.brandGuardianStatus}
              </Badge>
            </div>
            <div className="mt-1 flex gap-3 text-xs text-brand">
              {campaign ? <Link href={`/campaigns/${campaign.id}`}>Campaign: {campaign.name} →</Link> : null}
              {segment ? <Link href={`/audiences/${segment.id}`}>Audience: {segment.name} →</Link> : null}
            </div>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <Field label="Channel" value={isChannelType(plan.channel) ? CHANNEL_LABELS[plan.channel] : plan.channel} />
          <Field label="Execution mode" value={plan.executionMode} />
          <Field label="Channel strategy" value={plan.channelStrategy} full />
          <Field label="CTA" value={plan.cta} />
          <Field label="Destination" value={plan.destination ?? "—"} />
          <Field label="Risk level" value={plan.riskLevel} />
          <Field label="Provider account reference" value={plan.providerAccountReference ?? "Not set"} />
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          {canEdit && plan.status !== "RUNNING" ? <RunPlanBrandGuardianButton planId={plan.id} /> : null}
          {canApprove && plan.status === "AWAITING_APPROVAL" ? <PlanReviewButtons planId={plan.id} /> : null}
          {canApprove && plan.status === "APPROVED" ? <MarkReadyButton planId={plan.id} /> : null}
          {canApprove && plan.status === "READY" ? <LaunchSimulatedButton planId={plan.id} /> : null}
          {canEdit && plan.status === "RUNNING" ? <PauseExecutionButton planId={plan.id} /> : null}
        </div>

        {safeMode === "SAFE_MODE" ? (
          <p className="mt-3 text-xs text-status-warn">
            Safe Mode is active — launch is blocked server-side regardless of plan status. Planning/editing remains allowed.
          </p>
        ) : null}
      </Card>

      <Card title="Budget">
        <BudgetPanel
          planId={plan.id}
          currentBudget={
            budget
              ? {
                  id: budget.id,
                  plannedBudget: budget.plannedBudget,
                  approvedBudget: budget.approvedBudget,
                  currency: budget.currency,
                  dailyCap: budget.dailyCap,
                  totalCap: budget.totalCap,
                  status: budget.status,
                  createdAt: budget.createdAt.toISOString(),
                }
              : null
          }
          canPropose={canEdit && plan.status !== "RUNNING"}
          canApprove={canApprove}
        />
      </Card>

      <Card title="Executions">
        {executions.length === 0 ? (
          <p className="text-sm text-ink-muted">No executions yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {executions.map((e) => (
              <li key={e.id} className="flex items-center justify-between rounded-md border border-surface-border p-3">
                <div>
                  <p className="text-ink">
                    {e.isSimulated ? <Badge tone="warn">SIMULATED / NOT LIVE</Badge> : e.adapterKey} — external ID:{" "}
                    <span className="font-mono text-xs">{e.externalExecutionId ?? "—"}</span>
                  </p>
                  {e.normalizedError ? <p className="mt-1 text-xs text-status-bad">{e.normalizedError}</p> : null}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-ink-muted">Spend: {e.reportedSpend ?? "—"}</span>
                  <Badge tone={statusToTone(e.status === "RUNNING" ? "AVAILABLE" : e.status === "FAILED" ? "DISABLED" : "NOT_CONFIGURED")}>
                    {e.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Approval history">
        {approvalHistory.length === 0 ? (
          <p className="text-sm text-ink-muted">No approval events yet.</p>
        ) : (
          <ul className="space-y-1.5 text-sm text-ink-muted">
            {approvalHistory.map((a) => (
              <li key={a.id}>
                {a.action} — {new Date(a.createdAt).toLocaleString()}
                {a.notes ? `: ${a.notes}` : ""}
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
