"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const SOURCE_TYPES = [
  "NEWS_ARTICLE",
  "INDUSTRY_REPORT",
  "SOCIAL_POST",
  "DIRECT_INTERVIEW",
  "INTERNAL_DATA",
  "GOVERNMENT_PUBLICATION",
  "MANUAL_OBSERVATION",
  "OTHER",
];

export function AddEvidenceForm({ signalId }: { signalId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [sourceType, setSourceType] = useState("MANUAL_OBSERVATION");
  const [extractedClaim, setExtractedClaim] = useState("");
  const [confidence, setConfidence] = useState(0.5);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/intelligence/signals/${signalId}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceName,
        sourceReference: sourceReference || undefined,
        sourceType,
        extractedClaim,
        confidence,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError("Failed to add evidence.");
      return;
    }
    setSourceName("");
    setSourceReference("");
    setExtractedClaim("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-ink-muted hover:text-ink"
      >
        + Add source evidence
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-surface-border bg-surface p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Source name</label>
          <input
            required
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Source reference (URL)</label>
          <input
            value={sourceReference}
            onChange={(e) => setSourceReference(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Source type</label>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          >
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Confidence (0-1)</label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={confidence}
            onChange={(e) => setConfidence(Number(e.target.value))}
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-ink-muted">Extracted claim</label>
          <textarea
            required
            rows={2}
            value={extractedClaim}
            onChange={(e) => setExtractedClaim(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
      </div>

      {error ? <p className="mt-2 text-sm text-status-bad">{error}</p> : null}

      <p className="mt-2 text-xs text-ink-faint">
        New evidence starts as NEEDS_REVIEW or WEAK_EVIDENCE — it can only become VERIFIED through
        an explicit review action.
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-muted disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Add evidence"}
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
