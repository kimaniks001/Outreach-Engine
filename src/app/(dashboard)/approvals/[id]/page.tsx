import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection } from "@/lib/rbac/guard";
import { getCampaign } from "@/lib/campaigns/campaigns";
import {
  getCurrentMarketRelease,
  listCampaignSources,
  listClaimSources,
  listMarketReviewDecisions,
} from "@/lib/approvals/market-release";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { MarketApprovalControl } from "@/components/approvals/MarketApprovalControl";

export default async function CampaignApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSection("APPROVALS");
  const { id } = await params;
  const [campaign, attached, allSources, decisions, currentRelease] = await Promise.all([
    getCampaign(id),
    listCampaignSources(id),
    listClaimSources(),
    listMarketReviewDecisions(id),
    getCurrentMarketRelease(id),
  ]);
  if (!campaign) notFound();

  const brandDecision = decisions.find((decision) => decision.lane === "BRAND_CLAIMS") ?? null;
  const complianceDecision = decisions.find((decision) => decision.lane === "COMPLIANCE_LEGAL") ?? null;
  const finalDecision = decisions.find((decision) => decision.lane === "FINAL_MARKET_RELEASE") ?? null;

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header>
        <Link href="/approvals" className="text-xs font-medium text-brand hover:text-brand-muted">← Approval Desk</Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-ink-faint">Market approval room</p>
          <Badge tone={campaign.riskLevel === "HIGH" ? "warn" : "neutral"}>{campaign.riskLevel} RISK</Badge>
          <Badge tone={currentRelease ? "good" : campaign.status === "REJECTED" ? "bad" : "neutral"}>
            {currentRelease ? `MARKET v${currentRelease.releaseVersion}` : campaign.status}
          </Badge>
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{campaign.name}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
          Review what the market will actually receive, which SecurePay sources support it, and who authorised each gate.
          A source reference or approval cannot silently survive changed creative content.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Current market message</p>
          <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
            <Field label="Core message" value={campaign.coreMessage} full />
            <Field label="Positioning" value={campaign.positioningAngle} />
            <Field label="Call to action" value={campaign.cta} />
            <Field label="Audience" value={campaign.targetAudience} />
            <Field label="Risk" value={campaign.riskLevel} />
            <Field label="Creative brief" value={campaign.creativeBrief ?? "No creative brief"} full />
          </dl>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <Link href={`/studio/${campaign.id}`} className="font-medium text-brand hover:text-brand-muted">Open in Studio →</Link>
            <Link href={`/campaigns/${campaign.id}`} className="text-ink-muted hover:text-ink">Campaign record →</Link>
          </div>
        </Card>

        <Card>
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Release gates</p>
          <div className="mt-4 space-y-3">
            <Gate number="1" label="Deterministic Brand Guardian" value={campaign.brandGuardianStatus} good={campaign.brandGuardianStatus === "PASS"} />
            <Gate number="2" label="Authoritative sources" value={`${attached.filter((row) => row.source.status === "CURRENT").length} current`} good={attached.some((row) => row.source.status === "CURRENT")} />
            <Gate number="3" label="Human Brand & Claims" value={brandDecision?.action ?? "WAITING"} good={brandDecision?.action === "APPROVE"} />
            <Gate number="4" label="Compliance / Legal" value={complianceDecision?.action ?? (campaign.riskLevel === "HIGH" ? "REQUIRED" : "OPTIONAL")} good={campaign.riskLevel !== "HIGH" || complianceDecision?.action === "APPROVE"} />
            <Gate number="5" label="Final Market Release" value={currentRelease ? `CURRENT v${currentRelease.releaseVersion}` : finalDecision?.action ?? "WAITING"} good={Boolean(currentRelease)} />
          </div>
          <p className="mt-4 text-xs leading-5 text-ink-faint">Release permission does not grant distribution budget or ad-spend authority.</p>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Claim provenance</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Sources attached to this campaign</h2>
          <div className="mt-4 space-y-2">
            {attached.map(({ source, note }) => (
              <div key={source.id} className="rounded-xl border border-surface-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-ink">{source.title}</p>
                    <p className="mt-0.5 text-xs text-ink-faint">{source.sourceType} · {source.version}</p>
                  </div>
                  <Badge tone={source.status === "CURRENT" ? "good" : "neutral"}>{source.status}</Badge>
                </div>
                <p className="mt-2 break-words text-xs text-ink-muted">{source.sourceReference}</p>
                {note ? <p className="mt-2 text-xs text-ink-faint">Why attached: {note}</p> : null}
              </div>
            ))}
            {attached.length === 0 ? <p className="text-sm text-ink-muted">No authoritative source has been attached. Approval will fail closed.</p> : null}
          </div>
        </Card>

        <MarketApprovalControl
          campaignId={campaign.id}
          role={user.role}
          brandGuardianStatus={campaign.brandGuardianStatus}
          campaignStatus={campaign.status}
          currentReleaseVersion={currentRelease?.releaseVersion ?? null}
          sources={allSources.map((source) => ({ id: source.id, title: source.title, version: source.version, status: source.status }))}
          attachedSourceIds={attached.map((row) => row.source.id)}
        />
      </section>

      <section>
        <div className="mb-3">
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Append-only decision history</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">Who authorised what?</h2>
        </div>
        <div className="space-y-2">
          {decisions.map((decision) => (
            <div key={decision.id} className="rounded-xl border border-surface-border bg-surface-raised px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{decision.lane.replaceAll("_", " ")}</span>
                  <Badge tone={decision.action === "APPROVE" ? "good" : decision.action === "REJECT" ? "bad" : "warn"}>{decision.action}</Badge>
                </div>
                <span className="text-xs text-ink-faint">{decision.createdAt.toLocaleString("en-KE")}</span>
              </div>
              <p className="mt-2 font-mono text-[11px] text-ink-faint">content {decision.contentFingerprint.slice(0, 16)}… · {decision.sourceSnapshot.length} source version(s)</p>
              {decision.notes ? <p className="mt-2 text-sm text-ink-muted">{decision.notes}</p> : null}
            </div>
          ))}
          {decisions.length === 0 ? <p className="text-sm text-ink-muted">No human market-review decision has been recorded yet.</p> : null}
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return <div className={full ? "md:col-span-2" : ""}><dt className="text-xs text-ink-faint">{label}</dt><dd className="mt-1 leading-5 text-ink">{value}</dd></div>;
}

function Gate({ number, label, value, good }: { number: string; label: string; value: string; good: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${good ? "bg-brand text-white" : "bg-surface text-ink-faint"}`}>{number}</span>
      <div className="min-w-0 flex-1"><p className="text-sm font-medium text-ink">{label}</p><p className="text-xs text-ink-faint">{value}</p></div>
    </div>
  );
}
