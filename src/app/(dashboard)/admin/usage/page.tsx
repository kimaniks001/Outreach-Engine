import { requireSection } from "@/lib/rbac/guard";
import { canViewAdminProviders } from "@/lib/rbac/sections";
import { ForbiddenState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { listRecentUsage } from "@/lib/ai/usage";

export default async function AdminUsagePage() {
  const user = await requireSection("ADMIN");
  if (!canViewAdminProviders(user.role)) {
    return <ForbiddenState what="AI usage records are not visible to your role." />;
  }

  const usage = await listRecentUsage(50);

  return (
    <Card title="AI Usage">
      <p className="mb-4 text-sm text-ink-muted">
        Every AI Gateway call is recorded here, whether or not a model was actually available.
        Phase 1 has no live providers configured by default, so most rows will show
        NO_AVAILABLE_MODEL — that is expected, not an error.
      </p>
      {usage.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No AI executions recorded yet. Nothing in Phase 1 calls the AI Gateway automatically —
          see docs/PHASE_1_COMMAND_CENTRE_AND_AI_CORE.md.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-ink-faint">
                <th className="py-2 pr-4 font-medium">Task</th>
                <th className="py-2 pr-4 font-medium">Provider / Model</th>
                <th className="py-2 pr-4 font-medium">Result</th>
                <th className="py-2 pr-4 font-medium">Reason</th>
                <th className="py-2 pr-4 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((row) => (
                <tr key={row.id} className="border-b border-surface-border/60 align-top">
                  <td className="py-3 pr-4 text-ink">{row.taskType}</td>
                  <td className="py-3 pr-4 text-ink-muted">
                    {row.providerName ? `${row.providerName} / ${row.modelName}` : "—"}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={row.success ? "good" : "neutral"}>
                      {row.success ? "Success" : "Not executed"}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 max-w-sm text-ink-muted">{row.routingReason}</td>
                  <td className="py-3 pr-4 text-ink-faint">
                    {row.createdAt.toISOString().replace("T", " ").slice(0, 19)}
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
