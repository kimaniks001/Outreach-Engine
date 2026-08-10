import Link from "next/link";
import { requireSection } from "@/lib/rbac/guard";
import { canViewAdminProviders } from "@/lib/rbac/sections";
import { ForbiddenState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { routeTask } from "@/lib/ai/router";
import { AI_TASK_TYPES, type AITaskType } from "@/lib/ai/task-types";

function isTaskType(value: string | undefined): value is AITaskType {
  return Boolean(value) && (AI_TASK_TYPES as readonly string[]).includes(value as string);
}

export default async function AdminRoutingPage({
  searchParams,
}: {
  searchParams: Promise<{ taskType?: string }>;
}) {
  const user = await requireSection("ADMIN");
  if (!canViewAdminProviders(user.role)) {
    return <ForbiddenState what="Model routing is not visible to your role." />;
  }

  const params = await searchParams;
  const taskType: AITaskType = isTaskType(params.taskType) ? params.taskType : "MARKET_RESEARCH";
  const decision = await routeTask(taskType);

  return (
    <div className="space-y-5">
      <Card title="Routing rule">
        <p className="text-sm text-ink-muted">
          Deterministic, explainable routing: an approved, enabled model from an AVAILABLE
          provider that supports the requested task type is selected, preferring the highest
          quality score, then lowest input cost. If nothing qualifies, the Gateway returns{" "}
          <code className="rounded bg-surface px-1 py-0.5 text-xs">NO_AVAILABLE_MODEL</code>{" "}
          rather than silently falling back to an unapproved provider. No self-optimization or
          learning happens in Phase 1.
        </p>
      </Card>

      <Card title="Try it: pick a task type">
        <div className="flex flex-wrap gap-1.5">
          {AI_TASK_TYPES.map((type) => (
            <Link
              key={type}
              href={`/admin/routing?taskType=${type}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                type === taskType
                  ? "border-brand/40 bg-brand/15 text-brand"
                  : "border-surface-border text-ink-muted hover:text-ink"
              }`}
            >
              {type}
            </Link>
          ))}
        </div>

        <div className="mt-5 rounded-md border border-surface-border bg-surface p-4">
          <div className="mb-2 flex items-center gap-2">
            <Badge tone={decision.outcome === "SELECTED" ? "good" : "neutral"}>
              {decision.outcome}
            </Badge>
            <span className="text-sm text-ink">{taskType}</span>
          </div>
          {decision.outcome === "SELECTED" ? (
            <p className="text-sm text-ink-muted">
              {decision.provider.displayName} / {decision.model.displayName} — {decision.reason}
            </p>
          ) : (
            <p className="text-sm text-ink-muted">{decision.reason}</p>
          )}
        </div>
      </Card>
    </div>
  );
}
