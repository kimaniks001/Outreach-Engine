import { requireSection } from "@/lib/rbac/guard";
import { canViewSafeMode, canChangeSafeMode } from "@/lib/rbac/sections";
import { ForbiddenState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge, statusToTone } from "@/components/ui/Badge";
import { getSafeMode } from "@/lib/safe-mode/state";
import { SafeModeToggle } from "@/components/admin/SafeModeToggle";

export default async function AdminSafeModePage() {
  const user = await requireSection("ADMIN");
  if (!canViewSafeMode(user.role)) {
    return <ForbiddenState what="Safe Mode is Owner-only." />;
  }

  const mode = await getSafeMode();

  return (
    <Card title="Safe Mode">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm text-ink-muted">Current state:</span>
        <Badge tone={statusToTone(mode)}>{mode === "SAFE_MODE" ? "Safe Mode active" : "Normal"}</Badge>
      </div>

      <p className="mb-4 text-sm text-ink-muted">
        Safe Mode is a system-wide switch that will suspend public publishing, outbound outreach,
        paid-media execution, AI agent execution, and external automations once those exist. It
        does not stop login, dashboard access, historical analytics, or audit/configuration
        review. In Phase 1, the AI Gateway already checks this flag before every execution — see{" "}
        <code className="rounded bg-surface px-1 py-0.5 text-xs">src/lib/ai/gateway.ts</code>.
      </p>

      {canChangeSafeMode(user.role) ? (
        <SafeModeToggle mode={mode} />
      ) : (
        <p className="text-sm text-ink-faint">Only the Owner can change this setting.</p>
      )}
    </Card>
  );
}
