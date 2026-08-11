import Link from "next/link";
import { requireSection } from "@/lib/rbac/guard";
import { can, scopeFor } from "@/lib/rbac/permissions";
import { ForbiddenState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { listAudienceSegments } from "@/lib/audience/segments";
import { listCampaigns } from "@/lib/campaigns/campaigns";
import { NewAudienceForm } from "@/components/audience/NewAudienceForm";

export default async function AudiencesPage() {
  const user = await requireSection("AUDIENCES");
  const scope = scopeFor(user.role, "audience");
  if (scope === "none") {
    return <ForbiddenState what="Audience segments are restricted to your role." />;
  }

  const canCreate = can(user.role, "create", "audience");
  const [segments, campaigns] = await Promise.all([
    listAudienceSegments(scope === "approved" ? { status: ["APPROVED"] } : {}),
    canCreate ? listCampaigns() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Audiences</p>
          <h1 className="mt-1 text-xl font-semibold text-ink">Audience segments</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Target commercial situations and intent — never sensitive personal traits. Every score
            shows its components and who/what generated it.
          </p>
        </div>
        {canCreate ? <NewAudienceForm campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))} /> : null}
      </header>

      <Card>
        {segments.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {scope === "approved"
              ? "No approved audience segments yet — check back once one has been reviewed."
              : "No audience segments yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-border text-ink-faint">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Sector</th>
                  <th className="py-2 pr-4 font-medium">Geography</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((s) => (
                  <tr key={s.id} className="border-b border-surface-border/60">
                    <td className="py-3 pr-4 text-ink">
                      <Link href={`/audiences/${s.id}`} className="hover:text-brand">
                        {s.name}
                      </Link>
                      {s.isDemo ? (
                        <span className="ml-2">
                          <Badge tone="warn">DEMO</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-ink-muted">{s.sector ?? "—"}</td>
                    <td className="py-3 pr-4 text-ink-muted">{s.geography ?? "—"}</td>
                    <td className="py-3 pr-4">
                      <Badge tone={s.status === "APPROVED" ? "good" : s.status === "REJECTED" ? "bad" : "neutral"}>
                        {s.status}
                      </Badge>
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
