import Link from "next/link";
import { requireSection } from "@/lib/rbac/guard";
import { listProviders } from "@/lib/ai/registry";
import { getSafeMode } from "@/lib/safe-mode/state";
import { db } from "@/lib/db";
import { Badge, statusToTone } from "@/components/ui/Badge";
import { sql } from "drizzle-orm";
import { can, scopeFor } from "@/lib/rbac/permissions";
import { listSignalsWithEvidenceCount } from "@/lib/intelligence/signals";
import { listOpportunities } from "@/lib/intelligence/opportunities";
import { listCampaigns } from "@/lib/campaigns/campaigns";
import { listRecentUsage } from "@/lib/ai/usage";
import { listAudienceSegments } from "@/lib/audience/segments";
import { listDistributionPlans } from "@/lib/distribution/plans";
import { listAllExecutions } from "@/lib/distribution/executions";
import { countApprovedBudgets } from "@/lib/distribution/budget-guard";
import { countAuditEventsByType } from "@/lib/audit/log";

type AttentionItem = {
  label: string;
  detail: string;
  count: number;
  href: string;
  tone: "attention" | "blocked" | "ready";
};

type PulseItem = {
  label: string;
  value: number;
  href: string;
  helper: string;
};

export default async function TodayPage() {
  const user = await requireSection("TODAY");

  const [providers, safeMode, dbOk] = await Promise.all([listProviders(), getSafeMode(), pingDatabase()]);

  const providerCounts = {
    available: providers.filter((p) => p.status === "AVAILABLE").length,
    degraded: providers.filter((p) => p.status === "DEGRADED").length,
  };

  const intelScope = scopeFor(user.role, "intelligence");
  const canSeeSignals = intelScope === "raw" || intelScope === "full";
  const canSeeOpportunities = intelScope !== "none";
  const canApproveOpportunities = can(user.role, "approve", "intelligence");
  const canSeeCampaigns = can(user.role, "view", "campaigns");
  const canApproveCampaigns = can(user.role, "approve", "campaigns");
  const canSeeUsage = can(user.role, "view", "model-config");
  const audienceScope = scopeFor(user.role, "audience");
  const canSeeAudiences = audienceScope !== "none";
  const canApproveAudiences = can(user.role, "approve", "audience");
  const distributionScope = scopeFor(user.role, "distribution");
  const canSeeDistribution = distributionScope !== "none";
  const canApproveDistribution = can(user.role, "approve", "distribution");
  const canSeeAudit = can(user.role, "view", "audit");

  const [signals, opportunities, campaigns, recentUsage, audienceSegments, distributionPlans, executions, approvedBudgets, safeModeBlocks] =
    await Promise.all([
      canSeeSignals ? listSignalsWithEvidenceCount() : Promise.resolve([]),
      canSeeOpportunities
        ? listOpportunities(intelScope === "approved" ? { status: ["APPROVED"] } : {})
        : Promise.resolve([]),
      canSeeCampaigns ? listCampaigns() : Promise.resolve([]),
      canSeeUsage ? listRecentUsage(5) : Promise.resolve([]),
      canSeeAudiences ? listAudienceSegments(audienceScope === "approved" ? { status: ["APPROVED"] } : {}) : Promise.resolve([]),
      canSeeDistribution ? listDistributionPlans() : Promise.resolve([]),
      canSeeDistribution ? listAllExecutions() : Promise.resolve([]),
      canSeeDistribution ? countApprovedBudgets() : Promise.resolve(0),
      canSeeAudit ? countAuditEventsByType("SAFE_MODE_BLOCKED_EXECUTION") : Promise.resolve(0),
    ]);

  const newSignalsCount = signals.filter((s) => s.signal.status === "NEW").length;
  const opportunitiesAwaitingReview = opportunities.filter((o) => o.status === "NEEDS_REVIEW").length;
  const opportunitiesApproved = opportunities.filter((o) => o.status === "APPROVED").length;
  const campaignsAwaitingApproval = campaigns.filter((c) => c.status === "AWAITING_APPROVAL").length;
  const campaignsBlocked = campaigns.filter((c) => c.brandGuardianStatus === "BLOCK" || c.status === "NEEDS_REVISION").length;
  const campaignsReadyForTargeting = campaigns.filter((c) => c.status === "READY_FOR_DISTRIBUTION").length;
  const audiencesAwaitingReview = audienceSegments.filter((a) => a.status === "NEEDS_REVIEW").length;
  const plansAwaitingApproval = distributionPlans.filter((p) => p.status === "AWAITING_APPROVAL").length;
  const executionsRunning = executions.filter((e) => e.status === "RUNNING").length;

  const attention: AttentionItem[] = [];
  if (canApproveOpportunities && opportunitiesAwaitingReview > 0) attention.push({ label: "Opportunity review", detail: "Market opportunities are waiting for your judgement.", count: opportunitiesAwaitingReview, href: "/intelligence", tone: "attention" });
  if (canApproveCampaigns && campaignsAwaitingApproval > 0) attention.push({ label: "Campaign approval", detail: "Campaigns are ready for an authorised decision.", count: campaignsAwaitingApproval, href: "/approvals", tone: "attention" });
  if (campaignsBlocked > 0) attention.push({ label: "Campaigns need revision", detail: "Brand Guardian or workflow state has stopped these from moving forward.", count: campaignsBlocked, href: "/campaigns", tone: "blocked" });
  if (canApproveAudiences && audiencesAwaitingReview > 0) attention.push({ label: "Audience review", detail: "Audience segments are waiting for approval.", count: audiencesAwaitingReview, href: "/audiences", tone: "attention" });
  if (canApproveDistribution && plansAwaitingApproval > 0) attention.push({ label: "Distribution approval", detail: "Plans are queued behind human budget or execution authority.", count: plansAwaitingApproval, href: "/distribution", tone: "attention" });
  if (campaignsReadyForTargeting > 0) attention.push({ label: "Ready to move", detail: "Campaigns are authorised far enough to continue into targeting.", count: campaignsReadyForTargeting, href: "/campaigns", tone: "ready" });

  const attentionCount = attention.reduce((sum, item) => sum + item.count, 0);
  const firstName = user.name.split(" ")[0] || user.name;
  const pulse: PulseItem[] = [];
  if (canSeeSignals) pulse.push({ label: "New signals", value: newSignalsCount, href: "/intelligence", helper: "Evidence waiting to be understood" });
  if (canSeeOpportunities) pulse.push({ label: "Approved opportunities", value: opportunitiesApproved, href: "/intelligence", helper: "Approved market possibilities" });
  if (canSeeCampaigns) pulse.push({ label: "Campaigns", value: campaigns.length, href: "/campaigns", helper: "Across your visible campaign scope" });
  if (canSeeAudiences) pulse.push({ label: "Audiences", value: audienceSegments.length, href: "/audiences", helper: "Visible privacy-aware segments" });
  if (canSeeDistribution) pulse.push({ label: "Distribution plans", value: distributionPlans.length, href: "/distribution", helper: `${approvedBudgets} approved budget${approvedBudgets === 1 ? "" : "s"}` });

  return (
    <div className="mx-auto max-w-7xl outreach-rise">
      <section className="relative overflow-hidden rounded-[30px] border border-brand/15 bg-surface-raised shadow-quiet">
        <div className="absolute right-[-80px] top-[-100px] h-72 w-72 rounded-full bg-brand-soft/35 blur-3xl" aria-hidden />
        <div className="absolute bottom-[-130px] left-[38%] h-60 w-60 rounded-full bg-accent-soft/25 blur-3xl" aria-hidden />
        <div className="relative grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[1.35fr_.65fr] lg:px-10 lg:py-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-brand-bright shadow-[0_0_0_5px_rgba(63,162,104,0.12)]" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">Today</p>
            </div>
            <h1 className="mt-4 max-w-3xl font-display text-4xl leading-[1.02] text-ink sm:text-5xl lg:text-[56px]">
              Good to see you, {firstName}.
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-ink-muted">
              {attentionCount > 0
                ? `${attentionCount} ${attentionCount === 1 ? "thing needs" : "things need"} attention across the work your role can see.`
                : "Nothing in your current authorised work queues needs action right now."}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/work" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-muted">Open Work</Link>
              <Link href="/conversations" className="rounded-full border border-surface-border bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-brand/30 hover:text-brand">Conversations</Link>
              <Link href="/growth" className="rounded-full border border-surface-border bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-brand/30 hover:text-brand">Growth</Link>
            </div>
          </div>

          <div className="rounded-3xl bg-brand p-5 text-white shadow-float sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">Your attention</p>
            <div className="mt-3 flex items-end gap-3">
              <span className="font-display text-6xl leading-none">{attentionCount}</span>
              <span className="pb-1.5 text-sm text-white/70">across {attention.length} work {attention.length === 1 ? "type" : "types"}</span>
            </div>
            <div className="mt-5 border-t border-white/15 pt-4 text-sm leading-6 text-white/75">
              Today only counts real records already visible to your role. Trader cases, incidents and staff messages will join this view as their roadmap phases land.
            </div>
          </div>
        </div>
      </section>

      <div className="mt-7 grid gap-6 xl:grid-cols-[1.4fr_.6fr]">
        <section>
          <SectionHeading eyebrow="Needs you" title="Your attention queue" helper="Prioritised from real work already in Outreach." />
          <div className="mt-4 space-y-3">
            {attention.length === 0 ? (
              <div className="rounded-2xl border border-brand/15 bg-brand-soft/35 px-5 py-6">
                <p className="font-display text-2xl text-brand-muted">Quiet right now.</p>
                <p className="mt-2 max-w-xl text-sm leading-6 text-ink-muted">No approval, review, revision or ready-to-move item currently needs you. You can use the breathing room to inspect Growth or Community LIVE.</p>
              </div>
            ) : (
              attention.map((item) => <AttentionRow key={`${item.href}-${item.label}`} item={item} />)
            )}
          </div>
        </section>

        <section>
          <SectionHeading eyebrow="Live pulse" title="Is Outreach ready?" />
          <div className="mt-4 rounded-2xl border border-surface-border bg-surface-raised p-5 shadow-sm">
            <StatusRow label="Application" value={<Badge tone="good">Online</Badge>} />
            <StatusRow label="Database" value={<Badge tone={dbOk ? "good" : "bad"}>{dbOk ? "Connected" : "Unreachable"}</Badge>} />
            <StatusRow label="AI providers" value={<Badge tone={providerCounts.degraded > 0 ? "warn" : providerCounts.available > 0 ? "good" : "neutral"}>{providerCounts.available} available</Badge>} />
            <StatusRow label="Safe Mode" value={<Badge tone={statusToTone(safeMode)}>{safeMode === "SAFE_MODE" ? "Active" : "Normal"}</Badge>} />
            {canSeeDistribution ? <StatusRow label="Executions running" value={<span className="font-mono text-xs text-ink">{executionsRunning}</span>} /> : null}
            {canSeeAudit ? <StatusRow label="Safe Mode blocks" value={<span className="font-mono text-xs text-ink">{safeModeBlocks}</span>} /> : null}
          </div>
        </section>
      </div>

      {pulse.length > 0 ? (
        <section className="mt-9">
          <SectionHeading eyebrow="What is moving" title="Visible across your Outreach world" helper="No vanity totals: only resources your role is authorised to see." />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {pulse.map((item) => (
              <Link key={item.label} href={item.href} className="group rounded-2xl border border-surface-border bg-surface-raised p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-float">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{item.label}</p>
                <p className="mt-3 font-display text-4xl text-ink group-hover:text-brand-muted">{item.value}</p>
                <p className="mt-2 text-xs leading-5 text-ink-muted">{item.helper}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-9 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-3xl border border-surface-border bg-surface-inverse p-6 text-ink-inverse shadow-quiet sm:p-7">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">True North</p>
          <h2 className="mt-3 max-w-xl font-display text-3xl leading-tight">One place to know what needs you, who needs help and what happens next.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/68">The shell is intentionally getting simpler while the operating system underneath gets richer. Conversations, Work, Traders, Operations and People will feed this same personal view instead of becoming competing dashboards.</p>
        </div>

        {canSeeUsage ? (
          <div className="rounded-3xl border border-surface-border bg-surface-raised p-6 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Recent AI activity</p>
            <h2 className="mt-2 font-display text-2xl text-ink">Assistance, not authority.</h2>
            {recentUsage.length === 0 ? (
              <p className="mt-4 text-sm text-ink-muted">No AI executions recorded yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {recentUsage.map((usage) => (
                  <li key={usage.id} className="flex items-start justify-between gap-3 border-t border-surface-border/70 pt-3 first:border-0 first:pt-0">
                    <div>
                      <p className="text-sm font-medium text-ink">{usage.taskType}</p>
                      <p className="mt-0.5 text-xs text-ink-faint">{usage.providerName ? `${usage.providerName} / ${usage.modelName}` : "No model recorded"}</p>
                    </div>
                    <Badge tone={usage.success ? "good" : "neutral"}>{usage.success ? "OK" : "N/A"}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="rounded-3xl border border-surface-border bg-surface-raised p-6 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Coming into Today</p>
            <h2 className="mt-2 font-display text-2xl text-ink">The rest of your working day.</h2>
            <div className="mt-4 space-y-3 text-sm text-ink-muted">
              <RoadmapRow phase="2" label="Messages, mentions and working circles" />
              <RoadmapRow phase="3" label="Tasks, queues, schedules and follow-ups" />
              <RoadmapRow phase="4" label="Trader cases and support hand-offs" />
              <RoadmapRow phase="5" label="Incidents and operational attention" />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const tone = item.tone === "blocked"
    ? "bg-accent-soft/35 border-accent/20"
    : item.tone === "ready"
      ? "bg-brand-soft/30 border-brand/15"
      : "bg-surface-raised border-surface-border";
  return (
    <Link href={item.href} className={`group flex items-center gap-4 rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-float ${tone}`}>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-display text-2xl ${item.tone === "blocked" ? "bg-accent text-white" : item.tone === "ready" ? "bg-brand text-white" : "bg-surface-soft text-ink"}`}>{item.count}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink group-hover:text-brand-muted">{item.label}</span>
        <span className="mt-1 block text-sm leading-5 text-ink-muted">{item.detail}</span>
      </span>
      <span className="text-lg text-ink-faint transition group-hover:translate-x-1 group-hover:text-brand">→</span>
    </Link>
  );
}

function SectionHeading({ eyebrow, title, helper }: { eyebrow: string; title: string; helper?: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">{eyebrow}</p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl text-ink sm:text-[28px]">{title}</h2>
        {helper ? <p className="text-xs text-ink-faint">{helper}</p> : null}
      </div>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-surface-border/70 py-3 first:border-0 first:pt-0 last:pb-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function RoadmapRow({ phase, label }: { phase: string; label: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-soft font-mono text-[10px] text-brand-muted">{phase}</span>
      <span className="pt-0.5">{label}</span>
    </div>
  );
}

async function pingDatabase(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
