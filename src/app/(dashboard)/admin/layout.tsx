import Link from "next/link";
import { requireSection } from "@/lib/rbac/guard";
import {
  canViewAdminProviders,
  canViewAdminAudit,
  canViewSafeMode,
} from "@/lib/rbac/sections";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSection("ADMIN");

  const tabs = [
    canViewAdminProviders(user.role) && { href: "/admin/providers", label: "AI Providers" },
    canViewAdminProviders(user.role) && { href: "/admin/models", label: "AI Models" },
    canViewAdminProviders(user.role) && { href: "/admin/usage", label: "AI Usage" },
    canViewAdminProviders(user.role) && { href: "/admin/routing", label: "Model Routing" },
    canViewAdminAudit(user.role) && { href: "/admin/audit", label: "Audit" },
    canViewSafeMode(user.role) && { href: "/admin/safe-mode", label: "Safe Mode" },
  ].filter((tab): tab is { href: string; label: string } => Boolean(tab));

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Admin</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">System administration</h1>
        {user.role !== "OWNER" ? (
          <p className="mt-1 text-sm text-ink-muted">
            Read-only visibility for your role. Configuration changes and credentials remain
            Owner-only.
          </p>
        ) : null}
      </header>

      <div className="mb-6 flex gap-1 border-b border-surface-border">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="rounded-t-md px-3 py-2 text-sm text-ink-muted hover:text-ink"
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {children}
    </div>
  );
}
