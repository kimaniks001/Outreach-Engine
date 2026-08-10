import { requireSection } from "@/lib/rbac/guard";
import { canViewAdminProviders, canManageAdminProviders } from "@/lib/rbac/sections";
import { ForbiddenState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge, statusToTone } from "@/components/ui/Badge";
import { listProviders } from "@/lib/ai/registry";
import { ProviderToggle } from "@/components/admin/ProviderToggle";

export default async function AdminProvidersPage() {
  const user = await requireSection("ADMIN");
  if (!canViewAdminProviders(user.role)) {
    return <ForbiddenState what="AI provider configuration is not visible to your role." />;
  }

  const providers = await listProviders();
  const canManage = canManageAdminProviders(user.role);

  return (
    <Card title="AI Providers">
      <p className="mb-4 text-sm text-ink-muted">
        A provider is AVAILABLE only when its adapter exists, credentials are configured, and it
        is enabled. No credential values are ever shown here.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-surface-border text-ink-faint">
              <th className="py-2 pr-4 font-medium">Provider</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Adapter</th>
              <th className="py-2 pr-4 font-medium">Credentials</th>
              <th className="py-2 pr-4 font-medium">Enabled</th>
              {canManage ? <th className="py-2 pr-4 font-medium">Action</th> : null}
            </tr>
          </thead>
          <tbody>
            {providers.map((provider) => (
              <tr key={provider.id} className="border-b border-surface-border/60">
                <td className="py-3 pr-4 text-ink">{provider.displayName}</td>
                <td className="py-3 pr-4">
                  <Badge tone={statusToTone(provider.status)}>{provider.status}</Badge>
                </td>
                <td className="py-3 pr-4 text-ink-muted">
                  {provider.adapterImplemented ? "Implemented (stub)" : "Not implemented"}
                </td>
                <td className="py-3 pr-4 text-ink-muted">
                  {provider.credentialsConfigured ? "Configured" : "Not configured"}
                </td>
                <td className="py-3 pr-4 text-ink-muted">{provider.enabled ? "Yes" : "No"}</td>
                {canManage ? (
                  <td className="py-3 pr-4">
                    <ProviderToggle providerId={provider.id} enabled={provider.enabled} />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
