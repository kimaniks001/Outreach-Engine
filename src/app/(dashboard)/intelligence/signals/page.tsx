import Link from "next/link";
import { requireSection } from "@/lib/rbac/guard";
import { scopeFor } from "@/lib/rbac/permissions";
import { ForbiddenState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { listSignalsWithEvidenceCount } from "@/lib/intelligence/signals";
import { NewSignalForm } from "@/components/intelligence/NewSignalForm";

export default async function SignalsPage() {
  const user = await requireSection("INTELLIGENCE");
  const scope = scopeFor(user.role, "intelligence");
  if (scope !== "raw" && scope !== "full") {
    return <ForbiddenState what="Raw market signals are restricted to your role." />;
  }

  const rows = await listSignalsWithEvidenceCount();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">
          {rows.length} signal{rows.length === 1 ? "" : "s"} captured.
        </p>
        <NewSignalForm />
      </div>

      <Card>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-muted">No signals yet. Create one to get started.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-border text-ink-faint">
                  <th className="py-2 pr-4 font-medium">Title</th>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Evidence</th>
                  <th className="py-2 pr-4 font-medium">Captured</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ signal, evidenceCount }) => (
                  <tr key={signal.id} className="border-b border-surface-border/60">
                    <td className="py-3 pr-4 text-ink">
                      <Link href={`/intelligence/signals/${signal.id}`} className="hover:text-brand">
                        {signal.title}
                      </Link>
                      {signal.isDemo ? (
                        <span className="ml-2">
                          <Badge tone="warn">DEMO</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-ink-muted">{signal.signalType}</td>
                    <td className="py-3 pr-4">
                      <Badge tone={signal.status === "ANALYZED" ? "good" : "neutral"}>{signal.status}</Badge>
                    </td>
                    <td className="py-3 pr-4 text-ink-muted">
                      {evidenceCount === 0 ? (
                        <Badge tone="warn">MANUAL / UNVERIFIED</Badge>
                      ) : (
                        `${evidenceCount} source${evidenceCount === 1 ? "" : "s"}`
                      )}
                    </td>
                    <td className="py-3 pr-4 text-ink-faint">
                      {signal.capturedAt.toISOString().slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
