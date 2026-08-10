"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function CreateCampaignForm({
  opportunityId,
  defaults,
}: {
  opportunityId: string;
  defaults: { name: string; targetAudience: string; coreMessage: string; cta: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaults.name);
  const [objective, setObjective] = useState("Generate qualified interest for this opportunity");
  const [targetAudience, setTargetAudience] = useState(defaults.targetAudience);
  const [positioningAngle, setPositioningAngle] = useState("Money should follow the agreement.");
  const [coreMessage, setCoreMessage] = useState(defaults.coreMessage);
  const [cta, setCta] = useState(defaults.cta || "Learn how it works");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opportunityId,
        name,
        objective,
        targetAudience,
        positioningAngle,
        coreMessage,
        cta,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(body.message ?? "Failed to create campaign.");
      return;
    }
    router.push(`/campaigns/${body.campaign.id}`);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-muted"
      >
        Create Campaign
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-surface-border bg-surface p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-ink-muted">Campaign name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
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
          <label className="mb-1 block text-xs font-medium text-ink-muted">Target audience</label>
          <input
            required
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Positioning angle</label>
          <input
            required
            value={positioningAngle}
            onChange={(e) => setPositioningAngle(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-ink-muted">Core message</label>
          <textarea
            required
            rows={2}
            value={coreMessage}
            onChange={(e) => setCoreMessage(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
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
      </div>

      {error ? <p className="mt-2 text-sm text-status-bad">{error}</p> : null}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-muted disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create campaign"}
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
