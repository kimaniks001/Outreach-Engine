import Link from "next/link";
import { requireSection } from "@/lib/rbac/guard";
import { can, scopeFor } from "@/lib/rbac/permissions";
import { ForbiddenState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge, statusToTone } from "@/components/ui/Badge";
import { listDistributionPlans } from "@/lib/distribution/plans";
import { listAudienceSegments } from "@/lib/audience/segments";
import { listCampaigns } from "@/lib/campaigns/campaigns";
import { listAllChannelRecommendations } from "@/lib/distribution/recommendations";
import { listAllExecutions } from "@/lib/distribution/executions";
import { listDistributionProviders } from "@/lib/distribution/providers";
import { getSafeMode } from "@/lib/safe-mode/state";
import { CHANNEL_LABELS, isChannelType } from "@/lib/distribution/channels";
import { NewPlanForm } from "@/components/distribution/NewPlanForm";

const TABS = ["plans", "direct-outreach", "channel-recommendations", "budgets", "executions", "providers"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  plans: "Plans",
  "direct-outreach": "Direct Outreach",
  "channel-recommendations": "Channel Recommendations",
  budgets: "Budgets",
  executions: "Executions",
  providers: "Providers",
};

const DIRECT_OUTREACH_CHANNELS = new Set(["DIRECT_BUSINESS_OUTREACH", "EMAIL", "WHATSAPP", "PARTNER_PLATFORM"]);

export default async function DistributionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireSection("DISTRIBUTION");
  const scope = scopeFor(user.role, "distribution");
  if (scope === "none") {
    return <ForbiddenState what="Distribution is restricted to your role." />;
  }

  const { tab: rawTab } = await searchParams;
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "plans";

  const [safeMode, allPlans] = await Promise.all([getSafeMode(), listDistributionPlans()]);

  const canCreate = can(user.role, "create", "distribution");

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Distribution</p>
        <h1 className="mt-1 text-xl font-semibold text-ink">Paid Media & Distribution</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Every launch is SIMULATED / NOT LIVE in this phase. Safe Mode:{" "}
          <Badge tone={statusToTone(safeMode)}>{safeMode === "SAFE_MODE" ? "Active — execution blocked" : "Normal"}</Badge>
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/distribution?tab=${t}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              tab === t ? "border-brand/40 bg-brand/15 text-brand" : "border-surface-border text-ink-muted"
            }`}
          >
            {TAB_LABELS[t]}
          </Link>
        ))}
        <Link href="/audiences" className="rounded-full border border-surface-border px-3 py-1 text-xs font-medium text-ink-muted">
          Audiences →
        </Link>
      </div>

      {tab === "plans" ? <PlansTab user={user} canCreate={canCreate} plans={allPlans.filter((p) => !DIRECT_OUTREACH_CHANNELS.has(p.channel))} /> : null}
      {tab === "direct-outreach" ? (
        <PlansTab user={user} canCreate={canCreate} plans={allPlans.filter((p) => DIRECT_OUTREACH_CHANNELS.has(p.channel))} directOutreach />
      ) : null}
      {tab === "channel-recommendations" ? <ChannelRecommendationsTab /> : null}
      {tab === "budgets" ? <BudgetsTab plans={allPlans} /> : null}
      {tab === "executions" ? <ExecutionsTab /> : null}
      {tab === "providers" ? <ProvidersTab /> : null}
    </div>
  );
}

async function PlansTab({
  user,
  canCreate,
  plans,
  directOutreach,
}: {
  user: { role: import("@/lib/rbac/roles").Role };
  canCreate: boolean;
  plans: Awaited<ReturnType<typeof listDistributionPlans>>;
  directOutreach?: boolean;
}) {
  const [campaigns, approvedSegments] = await Promise.all([
    canCreate ? listCampaigns() : Promise.resolve([]),
    canCreate ? listAudienceSegments({ status: ["APPROVED"] }) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-4">
      {canCreate ? (
        <NewPlanForm
          campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
          audienceSegments={approvedSegments.map((s) => ({ id: s.id, name: s.name }))}
        />
      ) : null}
      <Card>
        {plans.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No {directOutreach ? "direct outreach" : "paid media"} distribution plans yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-border text-ink-faint">
                  <th className="py-2 pr-4 font-medium">Objective</th>
                  <th className="py-2 pr-4 font-medium">Channel</th>
                  <th className="py-2 pr-4 font-medium">Mode</th>
                  <th className="py-2 pr-4 font-medium">Budget</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className="border-b border-surface-border/60">
                    <td className="py-3 pr-4 text-ink">
                      <Link href={`/distribution/plans/${p.id}`} className="hover:text-brand">
                        {p.objective}
                      </Link>
                      {p.isDemo ? (
                        <span className="ml-2">
                          <Badge tone="warn">DEMO</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-ink-muted">{isChannelType(p.channel) ? CHANNEL_LABELS[p.channel] : p.channel}</td>
                    <td className="py-3 pr-4 text-ink-muted">{p.executionMode}</td>
                    <td className="py-3 pr-4 text-ink-muted">
                      {p.plannedBudget ? `${p.plannedBudget} ${p.budgetCurrency}` : "—"}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge
                        tone={
                          p.status === "RUNNING" || p.status === "COMPLETED"
                            ? "good"
                            : p.status === "FAILED" || p.status === "CANCELLED"
                              ? "bad"
                              : "neutral"
                        }
                      >
                        {p.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

async function ChannelRecommendationsTab() {
  const recommendations = await listAllChannelRecommendations();
  return (
    <Card title="Channel recommendations (deterministic rule engine, no black-box optimization)">
      {recommendations.length === 0 ? (
        <p className="text-sm text-ink-muted">
          None generated yet — open an approved audience segment&apos;s campaign and generate recommendations from the
          audience detail page, or via the API.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-ink-faint">
                <th className="py-2 pr-4 font-medium">Priority</th>
                <th className="py-2 pr-4 font-medium">Channel</th>
                <th className="py-2 pr-4 font-medium">Rationale</th>
                <th className="py-2 pr-4 font-medium">Execution availability</th>
              </tr>
            </thead>
            <tbody>
              {recommendations.map((r) => (
                <tr key={r.id} className="border-b border-surface-border/60">
                  <td className="py-3 pr-4 text-ink">{r.priority}</td>
                  <td className="py-3 pr-4 text-ink">{isChannelType(r.channel) ? CHANNEL_LABELS[r.channel] : r.channel}</td>
                  <td className="py-3 pr-4 text-ink-muted">{r.rationale}</td>
                  <td className="py-3 pr-4 text-ink-muted">{r.executionAvailability}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function BudgetsTab({ plans }: { plans: Awaited<ReturnType<typeof listDistributionPlans>> }) {
  return (
    <Card title="Distribution plans by budget">
      {plans.length === 0 ? (
        <p className="text-sm text-ink-muted">No distribution plans yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-ink-faint">
                <th className="py-2 pr-4 font-medium">Plan</th>
                <th className="py-2 pr-4 font-medium">Planned budget</th>
                <th className="py-2 pr-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-b border-surface-border/60">
                  <td className="py-3 pr-4 text-ink">
                    <Link href={`/distribution/plans/${p.id}`} className="hover:text-brand">
                      {p.objective}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-ink-muted">{p.plannedBudget ? `${p.plannedBudget} ${p.budgetCurrency}` : "Not proposed"}</td>
                  <td className="py-3 pr-4">
                    <Badge tone={p.status === "APPROVED" || p.status === "READY" ? "good" : "neutral"}>{p.status}</Badge>
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

async function ExecutionsTab() {
  const executions = await listAllExecutions();
  return (
    <Card title="Execution history">
      {executions.length === 0 ? (
        <p className="text-sm text-ink-muted">No executions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-ink-faint">
                <th className="py-2 pr-4 font-medium">Channel</th>
                <th className="py-2 pr-4 font-medium">Mode</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Reported spend</th>
                <th className="py-2 pr-4 font-medium">External ID</th>
              </tr>
            </thead>
            <tbody>
              {executions.map((e) => (
                <tr key={e.id} className="border-b border-surface-border/60">
                  <td className="py-3 pr-4 text-ink">{isChannelType(e.channel) ? CHANNEL_LABELS[e.channel] : e.channel}</td>
                  <td className="py-3 pr-4">
                    <Badge tone={e.isSimulated ? "warn" : "neutral"}>{e.isSimulated ? "SIMULATED / NOT LIVE" : e.mode}</Badge>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={e.status === "RUNNING" || e.status === "COMPLETED" ? "good" : e.status === "FAILED" ? "bad" : "neutral"}>
                      {e.status}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 text-ink-muted">{e.reportedSpend ?? "—"}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-ink-faint">{e.externalExecutionId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ProvidersTab() {
  const providers = listDistributionProviders();
  return (
    <Card title="Provider readiness">
      <div className="space-y-3">
        {providers.map((p) => (
          <div key={p.key} className="flex items-center justify-between rounded-md border border-surface-border p-3">
            <div>
              <p className="text-sm font-medium text-ink">{p.displayName}</p>
              <p className="text-xs text-ink-faint">{p.reason}</p>
            </div>
            <Badge tone={statusToTone(p.status)}>{p.status}</Badge>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-faint">
        No live ad-platform credentials are configured or required in Phase 3. Google Ads and Meta Ads remain planning-only
        until a future phase adds live credentials — never falsely reported AVAILABLE.
      </p>
    </Card>
  );
}
