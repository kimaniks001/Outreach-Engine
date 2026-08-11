import { requireSection } from "@/lib/rbac/guard";
import { canViewAdminProviders, canManageAdminProviders } from "@/lib/rbac/sections";
import { ForbiddenState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ActionButton } from "@/components/ui/ActionButton";
import { SetBudgetPolicyForm } from "@/components/admin/SetBudgetPolicyForm";
import { listCurrentModelPerformance } from "@/lib/model-evaluation/performance";
import { listModelRecommendations } from "@/lib/model-evaluation/recommendations";
import { listActiveBudgetPolicies } from "@/lib/ai/budget";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export default async function AdminCostModelsPage() {
  const user = await requireSection("ADMIN");
  if (!canViewAdminProviders(user.role)) {
    return <ForbiddenState what="Model performance and cost controls are not visible to your role." />;
  }
  const canManage = canManageAdminProviders(user.role);

  const [performance, modelRecommendations, budgetPolicies, providers, models] = await Promise.all([
    listCurrentModelPerformance(),
    listModelRecommendations(),
    listActiveBudgetPolicies(),
    db.select().from(schema.aiProviders),
    db.select().from(schema.aiModels),
  ]);

  const providerName = (id: string) => providers.find((p) => p.id === id)?.displayName ?? id.slice(0, 8);
  const modelName = (id: string) => models.find((m) => m.id === id)?.displayName ?? id.slice(0, 8);

  return (
    <div className="space-y-5">
      <Card
        title="Model performance"
        action={
          canManage ? (
            <ActionButton url="/api/admin/model-performance" body={{}} label="Refresh (30d)" tone="neutral" />
          ) : null
        }
      >
        <p className="mb-3 text-sm text-ink-muted">
          Computed entirely from real ai_usage_records history. humanAcceptanceRate/revisionRate are
          honestly null — no such signal is captured anywhere in this system yet.
        </p>
        {performance.length === 0 ? (
          <p className="text-sm text-ink-muted">No performance snapshots yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-border text-ink-faint">
                  <th className="py-2 pr-4 font-medium">Provider / Model</th>
                  <th className="py-2 pr-4 font-medium">Task</th>
                  <th className="py-2 pr-4 font-medium">Samples</th>
                  <th className="py-2 pr-4 font-medium">Success</th>
                  <th className="py-2 pr-4 font-medium">Schema-valid</th>
                  <th className="py-2 pr-4 font-medium">Latency</th>
                  <th className="py-2 pr-4 font-medium">Avg cost</th>
                  <th className="py-2 pr-4 font-medium">Fallback</th>
                  <th className="py-2 pr-4 font-medium">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {performance.map((p) => (
                  <tr key={p.id} className="border-b border-surface-border/60">
                    <td className="py-2 pr-4 text-ink">{providerName(p.providerId)} / {modelName(p.modelId)}</td>
                    <td className="py-2 pr-4 text-ink-muted">{p.taskType}</td>
                    <td className="py-2 pr-4 text-ink-muted">{p.sampleCount}</td>
                    <td className="py-2 pr-4 text-ink-muted">{(Number(p.successRate) * 100).toFixed(0)}%</td>
                    <td className="py-2 pr-4 text-ink-muted">{p.schemaValidRate !== null ? `${(Number(p.schemaValidRate) * 100).toFixed(0)}%` : "—"}</td>
                    <td className="py-2 pr-4 text-ink-muted">{p.avgLatencyMs !== null ? `${Number(p.avgLatencyMs).toFixed(0)}ms` : "—"}</td>
                    <td className="py-2 pr-4 text-ink-muted">{p.avgCostUsd !== null ? `$${Number(p.avgCostUsd).toFixed(5)}` : "—"}</td>
                    <td className="py-2 pr-4 text-ink-muted">{(Number(p.fallbackRate) * 100).toFixed(0)}%</td>
                    <td className="py-2 pr-4"><Badge tone={p.confidence === "HIGH" ? "good" : p.confidence === "INSUFFICIENT_DATA" ? "neutral" : "warn"}>{p.confidence}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Model recommendations"
        action={canManage ? <ActionButton url="/api/admin/model-recommendations" label="Generate" tone="neutral" /> : null}
      >
        {modelRecommendations.length === 0 ? (
          <p className="text-sm text-ink-muted">No model recommendations yet.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {modelRecommendations.map((r) => (
              <li key={r.id} className="border-b border-surface-border/60 pb-3 last:border-0">
                <div className="flex items-center gap-2">
                  <Badge tone={r.status === "APPLIED" ? "good" : r.status === "REJECTED" ? "bad" : "neutral"}>{r.status}</Badge>
                  <span className="text-ink">{r.taskType}</span>
                </div>
                <p className="mt-1 text-ink-muted">
                  {r.fromModelId ? modelName(r.fromModelId) : "—"} → {modelName(r.toModelId)}: {r.reason}
                </p>
                {canManage && r.status === "PROPOSED" ? (
                  <div className="mt-2 flex gap-2">
                    <ActionButton url={`/api/admin/model-recommendations/${r.id}/review`} body={{ action: "APPROVE" }} label="Approve" tone="good" />
                    <ActionButton url={`/api/admin/model-recommendations/${r.id}/review`} body={{ action: "REJECT" }} label="Reject" tone="bad" />
                  </div>
                ) : null}
                {canManage && r.status === "APPROVED" ? (
                  <div className="mt-2">
                    <ActionButton
                      url={`/api/admin/model-recommendations/${r.id}/apply`}
                      label="Apply routing change"
                      tone="brand"
                      confirmMessage="This changes live model routing policy for this task type. Continue?"
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Benchmark suite" action={canManage ? <ActionButton url="/api/admin/benchmark" label="Run benchmark" tone="neutral" pendingLabel="Running…" /> : null}>
        <p className="text-sm text-ink-muted">
          Runs 9 fixed SecurePay-specific fixtures through the normal AI Gateway → Router path (never a
          direct model call) — respects Safe Mode and AI budget caps automatically. Results appear in
          Model performance above, tagged as benchmark snapshots.
        </p>
      </Card>

      <Card title="AI budget policies">
        {canManage ? (
          <div className="mb-4 border-b border-surface-border pb-4">
            <SetBudgetPolicyForm />
          </div>
        ) : null}
        {budgetPolicies.length === 0 ? (
          <p className="text-sm text-ink-muted">No budget policies configured — AI execution is unlimited.</p>
        ) : (
          <ul className="space-y-1 text-sm text-ink-muted">
            {budgetPolicies.map((p) => (
              <li key={p.id} className="flex justify-between border-b border-surface-border/60 py-1.5 last:border-0">
                <span>
                  {p.scope}
                  {p.scopeRef ? ` (${p.scopeRef.slice(0, 12)})` : ""} — {p.periodType}
                </span>
                <span className="text-ink">
                  soft ${p.softLimitUsd ?? "—"} / hard ${p.hardLimitUsd ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
