import Link from "next/link";
import { requireSection } from "@/lib/rbac/guard";
import {
  canViewAdminProviders,
  canViewAdminAudit,
  canViewSafeMode,
} from "@/lib/rbac/sections";
import { Card } from "@/components/ui/Card";

export default async function AdminOverviewPage() {
  const user = await requireSection("ADMIN");

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      {canViewAdminProviders(user.role) ? (
        <Card title="AI Providers & Models">
          <p className="text-sm text-ink-muted">
            Provider/model registry, routing rules, and usage records.
          </p>
          <Link href="/admin/providers" className="mt-3 inline-block text-sm text-brand">
            Open →
          </Link>
        </Card>
      ) : null}

      {canViewAdminAudit(user.role) ? (
        <Card title="Audit log">
          <p className="text-sm text-ink-muted">
            Append-only record of logins, access decisions, and configuration changes.
          </p>
          <Link href="/admin/audit" className="mt-3 inline-block text-sm text-brand">
            Open →
          </Link>
        </Card>
      ) : null}

      {canViewSafeMode(user.role) ? (
        <Card title="Safe Mode">
          <p className="text-sm text-ink-muted">
            System-wide switch to suspend consequential external actions.
          </p>
          <Link href="/admin/safe-mode" className="mt-3 inline-block text-sm text-brand">
            Open →
          </Link>
        </Card>
      ) : null}
    </div>
  );
}
