import Link from "next/link";
import { requireSection } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { ForbiddenState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { listCampaigns } from "@/lib/campaigns/campaigns";
import { listVariantsForCampaigns, listAllVariantsWithCampaignName } from "@/lib/creative/variants";
import { VariantCard } from "@/components/campaigns/VariantCard";

export default async function CampaignsPage() {
  const user = await requireSection("CAMPAIGNS");

  if (can(user.role, "view", "campaigns")) {
    const campaigns = await listCampaigns();
    const variants = await listVariantsForCampaigns(campaigns.map((c) => c.id));
    const variantCounts = new Map<string, number>();
    for (const v of variants) variantCounts.set(v.campaignId, (variantCounts.get(v.campaignId) ?? 0) + 1);

    return (
      <div className="space-y-5">
        <Card>
          {campaigns.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No campaigns yet. Approve an opportunity in Intelligence, then create a campaign
              from it.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-surface-border text-ink-faint">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Brand Guardian</th>
                    <th className="py-2 pr-4 font-medium">Audience</th>
                    <th className="py-2 pr-4 font-medium">Creatives</th>
                    <th className="py-2 pr-4 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} className="border-b border-surface-border/60">
                      <td className="py-3 pr-4 text-ink">
                        <Link href={`/campaigns/${c.id}`} className="hover:text-brand">
                          {c.name}
                        </Link>
                        {c.isDemo ? (
                          <span className="ml-2">
                            <Badge tone="warn">DEMO</Badge>
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge tone={c.status === "READY_FOR_DISTRIBUTION" ? "good" : c.status === "REJECTED" ? "bad" : "neutral"}>
                          {c.status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge tone={c.brandGuardianStatus === "PASS" ? "good" : c.brandGuardianStatus === "BLOCK" ? "bad" : "neutral"}>
                          {c.brandGuardianStatus}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-ink-muted">{c.targetAudience}</td>
                      <td className="py-3 pr-4 text-ink-muted">{variantCounts.get(c.id) ?? 0}</td>
                      <td className="py-3 pr-4 text-ink-faint">{c.createdAt.toISOString().slice(0, 10)}</td>
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

  if (can(user.role, "view", "content")) {
    // Content & Engagement's view: creative variants only, campaign name for
    // context — never the full strategy. See
    // docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md RBAC section.
    const rows = await listAllVariantsWithCampaignName();
    const canEdit = can(user.role, "edit", "content");

    return (
      <div className="space-y-5">
        <p className="text-sm text-ink-muted">
          Creative variants for campaigns that have moved into content work. Campaign strategy
          and Brand Guardian internals for the wider campaign are not shown here.
        </p>
        {rows.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-muted">No creative content assigned yet.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map(({ variant, campaignName }) => (
              <Card key={variant.id} title={campaignName}>
                <VariantCard variant={variant} canEdit={canEdit} />
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  return <ForbiddenState what="Campaigns are restricted to your role." />;
}
