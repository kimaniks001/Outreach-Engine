"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CHANNEL_TYPES, CHANNEL_LABELS, type ChannelType } from "@/lib/distribution/channels";

interface CreativeVariantOption {
  id: string;
  variantLabel: string;
  headline: string;
  brandGuardianStatus: string;
}

export function NewPlanForm({
  campaigns,
  audienceSegments,
}: {
  campaigns: Array<{ id: string; name: string }>;
  audienceSegments: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [audienceSegmentId, setAudienceSegmentId] = useState(audienceSegments[0]?.id ?? "");
  const [objective, setObjective] = useState("");
  const [channel, setChannel] = useState<ChannelType>("GOOGLE_SEARCH");
  const [channelStrategy, setChannelStrategy] = useState("");
  const [destination, setDestination] = useState("");
  const [cta, setCta] = useState("");
  const [plannedBudget, setPlannedBudget] = useState("");
  const [budgetCurrency, setBudgetCurrency] = useState("USD");
  const [variants, setVariants] = useState<CreativeVariantOption[]>([]);
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!campaignId) return;
    fetch(`/api/campaigns/${campaignId}`)
      .then((r) => (r.ok ? r.json() : { variants: [] }))
      .then((body) => setVariants(body.variants ?? []))
      .catch(() => setVariants([]));
    setSelectedVariantIds([]);
  }, [campaignId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/distribution/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId,
        audienceSegmentId,
        objective,
        channel,
        channelStrategy,
        destination: destination || undefined,
        cta,
        creativeVariantIds: selectedVariantIds,
        plannedBudget: plannedBudget ? Number(plannedBudget) : undefined,
        budgetCurrency,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(body.message ?? "Failed to create distribution plan.");
      return;
    }
    router.push(`/distribution/plans/${body.plan.id}`);
  }

  if (audienceSegments.length === 0) {
    return <p className="text-sm text-ink-muted">Approve an audience segment first — distribution plans require one.</p>;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-muted"
      >
        New distribution plan
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-surface-border bg-surface p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Campaign</label>
          <select
            required
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Audience segment (APPROVED)</label>
          <select
            required
            value={audienceSegmentId}
            onChange={(e) => setAudienceSegmentId(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          >
            {audienceSegments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-ink-muted">Objective</label>
          <input
            required
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Channel</label>
          <select
            required
            value={channel}
            onChange={(e) => setChannel(e.target.value as ChannelType)}
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          >
            {CHANNEL_TYPES.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">CTA</label>
          <input
            required
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            Channel strategy / adapted copy (must pass Brand Guardian)
          </label>
          <textarea
            required
            rows={3}
            value={channelStrategy}
            onChange={(e) => setChannelStrategy(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-ink-muted">Destination</label>
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g. SecurePay demo page, business onboarding"
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Planned budget (optional)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={plannedBudget}
            onChange={(e) => setPlannedBudget(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Currency</label>
          <input
            value={budgetCurrency}
            onChange={(e) => setBudgetCurrency(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
        {variants.length > 0 ? (
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              Creative variants (must each pass Brand Guardian before this plan can become READY)
            </label>
            <div className="space-y-1.5">
              {variants.map((v) => (
                <label key={v.id} className="flex items-center gap-2 text-sm text-ink-muted">
                  <input
                    type="checkbox"
                    checked={selectedVariantIds.includes(v.id)}
                    onChange={(e) =>
                      setSelectedVariantIds((prev) =>
                        e.target.checked ? [...prev, v.id] : prev.filter((id) => id !== v.id)
                      )
                    }
                  />
                  {v.variantLabel}: {v.headline} ({v.brandGuardianStatus})
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-sm text-status-bad">{error}</p> : null}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-muted disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create plan"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
