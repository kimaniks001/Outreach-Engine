import { requireSection } from "@/lib/rbac/guard";
import { listProviders } from "@/lib/ai/registry";
import { getSafeMode } from "@/lib/safe-mode/state";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Badge, statusToTone } from "@/components/ui/Badge";
import { sql } from "drizzle-orm";

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

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Today</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">Welcome back, {user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          A snapshot of the Command Centre. Phase 1 — Command Centre + AI Core.
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
            <li>No pending approvals.</li>
            <li>No tasks assigned yet.</li>
            <li>No alerts.</li>
          </ul>
          <p className="mt-3 text-xs text-ink-faint">
            This queue will populate once campaign approvals and assigned work exist, starting
            Phase 2.
          </p>
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
            <Row label="Campaigns">
              <span className="text-ink-muted">Not active yet</span>
            </Row>
            <Row label="Market intelligence">
              <span className="text-ink-muted">Not active yet</span>
            </Row>
            <Row label="Audience memory">
              <span className="text-ink-muted">Not active yet</span>
            </Row>
          </dl>
          <p className="mt-3 text-xs text-ink-faint">
            These activate as their phases are built. No figures are fabricated here.
          </p>
        </Card>

        <Card title="Next build milestone" className="lg:col-span-2">
          <p className="text-sm text-ink">Phase 2 — Intelligence + Campaign + Creative</p>
          <p className="mt-1 text-sm text-ink-muted">
            Market intelligence, opportunity scoring, Brand Guardian, campaign strategy, and
            image-first creative production.
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
