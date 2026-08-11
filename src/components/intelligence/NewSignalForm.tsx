"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const SIGNAL_TYPES = [
  "WEB",
  "NEWS",
  "SOCIAL",
  "INDUSTRY",
  "GOVERNMENT",
  "COMPETITOR",
  "CUSTOMER_FEEDBACK",
  "INTERNAL_OBSERVATION",
  "MANUAL",
];

export function NewSignalForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [signalType, setSignalType] = useState("MANUAL");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/intelligence/signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, summary, signalType }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError("Failed to create signal.");
      return;
    }
    setTitle("");
    setSummary("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-muted"
      >
        + New Signal
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-ink-muted">Title</label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-ink-muted">Summary / raw observation</label>
          <textarea
            required
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Signal type</label>
          <select
            value={signalType}
            onChange={(e) => setSignalType(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          >
            {SIGNAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <p className="mt-2 text-sm text-status-bad">{error}</p> : null}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-muted disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create signal"}
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
