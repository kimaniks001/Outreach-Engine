"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function NewAudienceForm({ campaigns }: { campaigns: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [linkedCampaignId, setLinkedCampaignId] = useState(campaigns[0]?.id ?? "");
  const [sector, setSector] = useState("");
  const [geography, setGeography] = useState("");
  const [businessCriteria, setBusinessCriteria] = useState("");
  const [roleFunctionCriteria, setRoleFunctionCriteria] = useState("");
  const [companyCriteria, setCompanyCriteria] = useState("");
  const [intentCriteria, setIntentCriteria] = useState("");
  const [estimatedReach, setEstimatedReach] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/audiences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        linkedCampaignId,
        sector: sector || undefined,
        geography: geography || undefined,
        businessCriteria: businessCriteria || undefined,
        roleFunctionCriteria: roleFunctionCriteria || undefined,
        companyCriteria: companyCriteria || undefined,
        intentCriteria: intentCriteria || undefined,
        estimatedReach: estimatedReach || undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(body.message ?? "Failed to create audience segment.");
      return;
    }
    router.push(`/audiences/${body.segment.id}`);
  }

  if (campaigns.length === 0) {
    return <p className="text-sm text-ink-muted">Create a campaign first — audience segments must link to one.</p>;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-muted"
      >
        New audience segment
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-surface-border bg-surface p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-ink-muted">Segment name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-ink-muted">Description</label>
          <textarea
            required
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-ink-muted">Linked campaign</label>
          <select
            required
            value={linkedCampaignId}
            onChange={(e) => setLinkedCampaignId(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <Field label="Sector" value={sector} onChange={setSector} />
        <Field label="Geography" value={geography} onChange={setGeography} />
        <Field label="Business / use-case criteria" value={businessCriteria} onChange={setBusinessCriteria} full />
        <Field label="Role / function criteria" value={roleFunctionCriteria} onChange={setRoleFunctionCriteria} />
        <Field label="Company criteria" value={companyCriteria} onChange={setCompanyCriteria} />
        <Field label="Intent criteria" value={intentCriteria} onChange={setIntentCriteria} full />
        <Field label="Estimated reach (placeholder or known value)" value={estimatedReach} onChange={setEstimatedReach} />
      </div>

      {error ? <p className="mt-2 text-sm text-status-bad">{error}</p> : null}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-muted disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create segment"}
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

function Field({
  label,
  value,
  onChange,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  full?: boolean;
}) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="mb-1 block text-xs font-medium text-ink-muted">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
      />
    </div>
  );
}
