import { requireSection } from "@/lib/rbac/guard";
import { canViewAdminProviders } from "@/lib/rbac/sections";
import { ForbiddenState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { listModelsWithProviders } from "@/lib/ai/registry";

export default async function AdminModelsPage() {
  const user = await requireSection("ADMIN");
  if (!canViewAdminProviders(user.role)) {
    return <ForbiddenState what="AI model configuration is not visible to your role." />;
  }

  const rows = await listModelsWithProviders();

  return (
    <Card title="AI Models">
      <p className="mb-4 text-sm text-ink-muted">
        Model definitions are data, not doctrine — capabilities and task-type approvals are
        configured here, not hard-coded into application logic.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No models registered yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-ink-faint">
                <th className="py-2 pr-4 font-medium">Model</th>
                <th className="py-2 pr-4 font-medium">Provider</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Approved</th>
                <th className="py-2 pr-4 font-medium">Enabled</th>
                <th className="py-2 pr-4 font-medium">Capabilities</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ model, provider }) => (
                <tr key={model.id} className="border-b border-surface-border/60">
                  <td className="py-3 pr-4 text-ink">{model.displayName}</td>
                  <td className="py-3 pr-4 text-ink-muted">{provider.displayName}</td>
                  <td className="py-3 pr-4">
                    <Badge tone={model.status === "APPROVED" ? "good" : "neutral"}>
                      {model.status}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 text-ink-muted">{model.approved ? "Yes" : "No"}</td>
                  <td className="py-3 pr-4 text-ink-muted">{model.enabled ? "Yes" : "No"}</td>
                  <td className="py-3 pr-4 text-ink-muted">
                    {model.capabilities.length > 0 ? model.capabilities.join(", ") : "—"}
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
