import { requireSection } from "@/lib/rbac/guard";
import { listProviders } from "@/lib/ai/registry";
import { getSafeMode } from "@/lib/safe-mode/state";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Badge, statusToTone } from "@/components/ui/Badge";
import { sql } from "drizzle-orm";
import { can, scopeFor } from "@/lib/rbac/permissions";
import { listSignalsWithEvidenceCount } from "@/lib/intelligence/signals";
import { listOpportunities } from "@/lib/intelligence/opportunities";
import { listCampaigns } from "@/lib/campaigns/campaigns";
import { listRecentUsage } from "@/lib/ai/usage";

export default async function TodayPage() {
  const user = await requireSection("TODAY");

  const [providers, safeMode, dbOk] = await Promise.all([
    listProviders(),
    getSafeMode(),
    pingDatabase(),
  ]);

  const providerCounts = {
    available: providers.filter((p) => p.status === "AVAILABLE").length,
    notConfigured: providers.filter((p) => p.status === "NOT_CONFIGURED").length,
    disabled: providers.filter((p) => p.status === "DISABLED").length,
    degraded: providers.filter((p) => p.status === "DEGRADED").length,
  };

  const intelScope = scopeFor(user.role, "intelligence");
  const canSeeSignals = intelScope === "raw" || intelScope === "full";
  const canSeeOpportunities = intelScope !== "none";
  const canApproveOpportunities = can(user.role, "approve", "intelligence");
  const canSeeCampaigns = can(user.role, "view", "campaigns");
  const canApproveCampaigns = can(user.role, "approve", "campaigns");
  const canSeeUsage = can(user.role, "view", "model-config");

  const [signals, opportunities, campaigns, recentUsage] = await Promise.all([
    canSeeSignals ? listSignalsWithEvidenceCount() : Promise.resolve([]),
    canSeeOpportunities
      ? listOpportunities(intelScope === "approved" ? { status: ["APPROVED"] } : {})
      : Promise.resolve([]),
    canSeeCampaigns ? listCampaigns() : Promise.resolve([]),
    canSeeUsage ? listRecentUsage(5) : Promise.resolve([]),
  ]);

  const newSignalsCount = signals.filter((s) => s.signal.status === "NEW").length;
  const opportunitiesAwaitingReview = opportunities.filter((o) => o.status === "NEEDS_REVIEW").length;
  const opportunitiesApproved = opportunities.filter((o) => o.status === "APPROVED").length;
  const campaignsAwaitingApproval = campaigns.filter((c) => c.status === "AWAITING_APPROVAL").length;
  const campaignsBlocked = campaigns.filter((c) => c.brandGuardianStatus === "BLOCK" || c.status === "NEEDS_REVISION").length;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Today</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">Welcome back, {user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          A snapshot of the Command Centre. Phase 2 — Intelligence + Campaign + Creative.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="System status">
          <dl className="space-y-3 text-sm">
            <Row label="Application">
              <Badge tone="good">Online</Badge>
            </Row>
            <Row label="Database">
              <Badge tone={dbOk ? "good" : "bad"}>{dbOk ? "Connected" : "Unreachable"}</Badge>
            </Row>
            <Row label="AI provider readiness">
              <Badge tone={providerCounts.available > 0 ? "good" : "neutral"}>
                {providerCounts.available} available / {providers.length} configured
              </Badge>
            </Row>
            <Row label="Safe Mode">
              <Badge tone={statusToTone(safeMode)}>{safeMode === "SAFE_MODE" ? "Active" : "Normal"}</Badge>
            </Row>
          </dl>
        </Card>

        <Card title="Work queue">
          <ul className="space-y-2 text-sm text-ink-muted">
            {canApproveOpportunities && opportunitiesAwaitingReview > 0 ? (
              <li>{opportunitiesAwaitingReview} opportunity(ies) awaiting review.</li>
            ) : null}
            {canApproveCampaigns && campaignsAwaitingApproval > 0 ? (
              <li>{campaignsAwaitingApproval} campaign(s) awaiting approval.</li>
            ) : null}
            {campaignsBlocked > 0 ? <li>{campaignsBlocked} campaign(s) blocked or needing revision.</li> : null}
            {!(
              (canApproveOpportunities && opportunitiesAwaitingReview > 0) ||
              (canApproveCampaigns && campaignsAwaitingApproval > 0) ||
              campaignsBlocked > 0
            ) ? (
              <li>Nothing pending for your role right now.</li>
            ) : null}
          </ul>
        </Card>

        <Card title="AI providers">
          <dl className="space-y-3 text-sm">
            <Row label="Available">
              <span className="text-ink">{providerCounts.available}</span>
            </Row>
            <Row label="Not configured">
              <span className="text-ink">{providerCounts.notConfigured}</span>
            </Row>
            <Row label="Disabled">
              <span className="text-ink">{providerCounts.disabled}</span>
            </Row>
            <Row label="Degraded">
              <span className="text-ink">{providerCounts.degraded}</span>
            </Row>
          </dl>
          <p className="mt-3 text-xs text-ink-faint">
            No live provider credentials are configured by default in Phase 1. See Admin → AI
            Providers.
          </p>
        </Card>

        <Card title="Outreach snapshot">
          <dl className="space-y-3 text-sm">
            {canSeeSignals ? (
              <Row label="New signals">
                <span className="text-ink">{newSignalsCount}</span>
              </Row>
            ) : null}
            {canSeeOpportunities ? (
              <Row label="Opportunities approved">
                <span className="text-ink">{opportunitiesApproved}</span>
              </Row>
            ) : null}
            {canSeeCampaigns ? (
              <Row label="Campaigns">
                <span className="text-ink">{campaigns.length}</span>
              </Row>
            ) : null}
            <Row label="Audience memory">
              <span className="text-ink-muted">Not active yet</span>
            </Row>
            <Row label="Distribution">
              <span className="text-ink-muted">Not active yet</span>
            </Row>
          </dl>
          <p className="mt-3 text-xs text-ink-faint">
            No figures are fabricated here — rows only appear once your role has visibility into
            that resource.
          </p>
        </Card>

        {canSeeUsage ? (
          <Card title="Recent AI executions" className="lg:col-span-2">
            {recentUsage.length === 0 ? (
              <p className="text-sm text-ink-muted">No AI executions recorded yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm text-ink-muted">
                {recentUsage.map((u) => (
                  <li key={u.id} className="flex items-center justify-between">
                    <span>
                      {u.taskType} — {u.providerName ? `${u.providerName} / ${u.modelName}` : "no model"}
                    </span>
                    <Badge tone={u.success ? "good" : "neutral"}>{u.success ? "OK" : "N/A"}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        <Card title="Next build milestone" className="lg:col-span-2">
          <p className="text-sm text-ink">Phase 3 — Targeting + Distribution</p>
          <p className="mt-1 text-sm text-ink-muted">
            Audience targeting, paid media planning, and prospect/business distribution — building
            on the campaigns approved here.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-muted">{label}</dt>
      <dd>{children}</dd>
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
