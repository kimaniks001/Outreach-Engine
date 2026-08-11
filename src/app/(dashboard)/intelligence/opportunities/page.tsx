import Link from "next/link";
import { requireSection } from "@/lib/rbac/guard";
import { scopeFor } from "@/lib/rbac/permissions";
import { ForbiddenState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { listOpportunities } from "@/lib/intelligence/opportunities";
import { MONEY_FLOW_DEFINITIONS } from "@/lib/opportunity/money-flow";

const STATUS_OPTIONS = ["DRAFT", "NEEDS_REVIEW", "APPROVED", "REJECTED", "ARCHIVED"] as const;

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireSection("INTELLIGENCE");
  const scope = scopeFor(user.role, "intelligence");
  if (scope === "none") {
    return <ForbiddenState what="Opportunities are restricted to your role." />;
  }

  const params = await searchParams;
  const statusFilter = params.status && STATUS_OPTIONS.includes(params.status as never) ? params.status : undefined;

  const opportunities =
    scope === "approved"
      ? await listOpportunities({ status: ["APPROVED"] }) // conclusion-without-source scope
      : await listOpportunities(statusFilter ? { status: [statusFilter as (typeof STATUS_OPTIONS)[number]] } : {});

  return (
    <div className="space-y-5">
      {scope !== "approved" ? (
        <div className="flex flex-wrap gap-1.5">
          <Link
            href="/intelligence/opportunities"
            className={`rounded-full border px-3 py-1 text-xs font-medium ${!statusFilter ? "border-brand/40 bg-brand/15 text-brand" : "border-surface-border text-ink-muted"}`}
          >
            All
          </Link>
          {STATUS_OPTIONS.map((s) => (
            <Link
              key={s}
              href={`/intelligence/opportunities?status=${s}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${statusFilter === s ? "border-brand/40 bg-brand/15 text-brand" : "border-surface-border text-ink-muted"}`}
            >
              {s}
            </Link>
          ))}
        </div>
      ) : null}

      <Card>
        {opportunities.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {scope === "approved"
              ? "No approved opportunities yet — check back once one has been reviewed."
              : "No opportunities yet. Analyze a signal from the Signals tab to create one."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-border text-ink-faint">
                  <th className="py-2 pr-4 font-medium">Title</th>
                  <th className="py-2 pr-4 font-medium">Score</th>
                  <th className="py-2 pr-4 font-medium">Money flow</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Sector</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((o) => (
                  <tr key={o.id} className="border-b border-surface-border/60">
                    <td className="py-3 pr-4 text-ink">
                      <Link href={`/intelligence/opportunities/${o.id}`} className="hover:text-brand">
                        {o.title}
                      </Link>
                      {o.isDemo ? (
                        <span className="ml-2">
                          <Badge tone="warn">DEMO</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-ink">{o.opportunityScore}/100</td>
                    <td className="py-3 pr-4 text-ink-muted">
                      {o.moneyFlowMapping === "NEEDS_DOCTRINE_REVIEW"
                        ? "Needs doctrine review"
                        : MONEY_FLOW_DEFINITIONS[o.moneyFlowMapping].label}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={o.status === "APPROVED" ? "good" : o.status === "REJECTED" ? "bad" : "neutral"}>
                        {o.status}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 text-ink-muted">{o.affectedSector ?? "—"}</td>
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
