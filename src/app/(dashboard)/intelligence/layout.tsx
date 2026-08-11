import Link from "next/link";
import { requireSection } from "@/lib/rbac/guard";
import { scopeFor } from "@/lib/rbac/permissions";

export default async function IntelligenceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSection("INTELLIGENCE");
  const scope = scopeFor(user.role, "intelligence");
  const canSeeRaw = scope === "raw" || scope === "full";

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Intelligence</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">Market Intelligence</h1>
        {!canSeeRaw ? (
          <p className="mt-1 text-sm text-ink-muted">
            You see approved opportunity conclusions only — raw signals and source evidence are
            restricted to your role.
          </p>
        ) : null}
      </header>

      <div className="mb-6 flex gap-1 border-b border-surface-border">
        {canSeeRaw ? (
          <Link href="/intelligence/signals" className="rounded-t-md px-3 py-2 text-sm text-ink-muted hover:text-ink">
            Signals
          </Link>
        ) : null}
        <Link href="/intelligence/opportunities" className="rounded-t-md px-3 py-2 text-sm text-ink-muted hover:text-ink">
          Opportunities
        </Link>
      </div>

      {children}
    </div>
  );
}
