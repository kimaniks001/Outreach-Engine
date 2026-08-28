import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { getCampaign } from "@/lib/campaigns/campaigns";
import { listVariantsForCampaign } from "@/lib/creative/variants";
import { listModelsWithProviders, listRoutableModelsForTask } from "@/lib/ai/registry";
import { STUDIO_LANES, countRoutableModels } from "@/lib/studio/capabilities";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ForbiddenState } from "@/components/ui/EmptyState";
import { VariantCard } from "@/components/campaigns/VariantCard";
import { StudioGenerateControl } from "@/components/studio/StudioGenerateControl";

export default async function StudioWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSection("STUDIO");
  const { id } = await params;

  const [campaign, variants, modelRows, creativeModels] = await Promise.all([
    getCampaign(id),
    listVariantsForCampaign(id),
    listModelsWithProviders(),
    listRoutableModelsForTask("CREATIVE_IDEATION"),
  ]);

  if (!campaign) notFound();

  const canSeeStrategy = can(user.role, "view", "campaigns");
  const canSeeContent = can(user.role, "view", "content") || canSeeStrategy;
  if (!canSeeContent) return <ForbiddenState what="This Studio workspace is restricted to your role." />;

  // Content & Engagement does not receive full campaign strategy through a
  // guessed URL. Their Studio access begins once creative work exists and
  // only the content projection is rendered below.
  if (!canSeeStrategy && variants.length === 0) {
    return <ForbiddenState what="This campaign has not been handed into creative work yet." />;
  }

  const canGenerate = can(user.role, "edit", "campaigns") || can(user.role, "create", "content");
  const canEditContent = can(user.role, "edit", "content");

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header>
        <Link href="/studio" className="text-xs font-medium text-brand hover:text-brand-muted">
          ← Studio
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-ink-faint">Campaign workspace</p>
          {campaign.isDemo ? <Badge tone="warn">DEMO / SAMPLE</Badge> : null}
          <Badge tone={campaign.status === "READY_FOR_DISTRIBUTION" ? "good" : campaign.status === "REJECTED" ? "bad" : "neutral"}>
            {campaign.status}
          </Badge>
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{campaign.name}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
          One working room for creative direction, model choice and human revision. Nothing leaves this room as authorised
          market material merely because it was generated here.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Source brief</p>
          {canSeeStrategy ? (
            <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
              <Field label="Objective" value={campaign.objective} full />
              <Field label="Audience" value={campaign.targetAudience} />
              <Field label="Positioning" value={campaign.positioningAngle} />
              <Field label="Core message" value={campaign.coreMessage} full />
              <Field label="Call to action" value={campaign.cta} />
              <Field label="Risk" value={campaign.riskLevel} />
            </dl>
          ) : (
            <div className="mt-3 rounded-xl border border-surface-border bg-surface p-4 text-sm text-ink-muted">
              You are working on approved creative content for <span className="font-medium text-ink">{campaign.name}</span>.
              Campaign strategy remains restricted to the strategy roles; Studio gives you the creative material you need
              without opening the full strategy record.
            </div>
          )}
        </Card>

        <Card>
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Market gate</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Creation is only the first gate.</h2>
          <div className="mt-4 space-y-2 text-sm text-ink-muted">
            <Gate label="1" text="Studio creates or revises a draft" active />
            <Gate label="2" text="Brand & claims review" />
            <Gate label="3" text="Compliance / Legal when required" />
            <Gate label="4" text="Approved for Market" />
            <Gate label="5" text="Distribution or Plug Market Kit" />
          </div>
        </Card>
      </div>

      {canGenerate ? (
        <StudioGenerateControl
          campaignId={campaign.id}
          models={creativeModels.map(({ model, provider }) => ({
            id: model.id,
            label: model.displayName,
            provider: provider.displayName,
            isMock: provider.isMock,
          }))}
        />
      ) : (
        <div className="rounded-xl border border-surface-border bg-surface p-4 text-sm text-ink-muted">
          Your role can review this Studio workspace but cannot generate new creative drafts.
        </div>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Draft wall</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">Creative variants</h2>
          </div>
          <p className="text-xs text-ink-faint">Each generation and human edit is audit-traceable.</p>
        </div>
        {variants.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-surface-border p-8 text-sm text-ink-muted">
            No creative drafts yet. Generate a set above or hand the campaign to an authorised content creator.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {variants.map((variant) => (
              <VariantCard key={variant.id} variant={variant} canEdit={canEditContent} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3">
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Other production lanes</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">Build the campaign across media</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Studio exposes the lanes now, but only calls a live model when the Model Registry says that exact task is approved
            and available.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STUDIO_LANES.filter((lane) => lane.taskType !== "CREATIVE_IDEATION").map((lane) => {
            const available = countRoutableModels(modelRows, lane.taskType);
            return (
              <div key={lane.key} className="rounded-2xl border border-surface-border bg-surface-raised p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{lane.label}</p>
                  <Badge tone={available > 0 ? "good" : "neutral"}>{available > 0 ? `${available} ready` : "Not live"}</Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-ink-muted">{lane.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap gap-3 border-t border-surface-border pt-5 text-sm">
        <Link href={`/campaigns/${campaign.id}`} className="font-medium text-brand hover:text-brand-muted">
          Campaign record →
        </Link>
        <Link href="/distribution" className="text-ink-muted hover:text-ink">
          Distribution planning →
        </Link>
      </div>
    </div>
  );
}

function Field({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="mt-1 leading-5 text-ink">{value}</dd>
    </div>
  );
}

function Gate({ label, text, active }: { label: string; text: string; active?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${active ? "bg-brand text-white" : "bg-surface text-ink-faint"}`}>
        {label}
      </span>
      <span className={active ? "font-medium text-ink" : ""}>{text}</span>
    </div>
  );
}
