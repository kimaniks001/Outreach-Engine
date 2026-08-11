"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CONVERSION_TYPES = [
  "",
  "KSNUMBER_CREATED",
  "FIRST_SECURELINK",
  "FIRST_KEYCONTRACT",
  "FIRST_GROUP_SECURELINK",
  "FIRST_SECUREFLOW",
  "PAYMENT_COMMITTED",
  "AGREEMENT_COMPLETED",
  "SETTLEMENT_COMPLETED",
  "REPEAT_USE",
] as const;

// Experiments must optimize toward actual SecurePay behavior, not clicks —
// Phase 5 brief Section 11 — so primaryMetricType is a real conversion
// type, not free text.
export function NewExperimentForm({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [primaryMetricType, setPrimaryMetricType] = useState<(typeof CONVERSION_TYPES)[number]>("");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!primaryMetricType) {
      setError("Select a real conversion type as the primary metric.");
      return;
    }
    setPending(true);
    setError(null);
    const res = await fetch("/api/experiments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        hypothesis,
        campaignId,
        primaryMetricType,
        primaryMetric: primaryMetricType,
        expectedOutcome,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? data.error ?? "Failed to create experiment.");
      return;
    }
    setName("");
    setHypothesis("");
    setExpectedOutcome("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-md border border-surface-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink">
        + New experiment
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border border-surface-border p-3 text-sm">
      <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Experiment name" className="w-full rounded border border-surface-border bg-surface px-2 py-1" />
      <textarea required value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} placeholder="Hypothesis" className="w-full rounded border border-surface-border bg-surface px-2 py-1" rows={2} />
      <select required value={primaryMetricType} onChange={(e) => setPrimaryMetricType(e.target.value as (typeof CONVERSION_TYPES)[number])} className="w-full rounded border border-surface-border bg-surface px-2 py-1">
        {CONVERSION_TYPES.map((t) => (
          <option key={t} value={t}>{t || "Select primary metric (real SecurePay behavior)"}</option>
        ))}
      </select>
      <textarea required value={expectedOutcome} onChange={(e) => setExpectedOutcome(e.target.value)} placeholder="Expected outcome" className="w-full rounded border border-surface-border bg-surface px-2 py-1" rows={2} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-muted disabled:opacity-60">
          {pending ? "Creating…" : "Create draft"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-faint">Cancel</button>
      </div>
      {error ? <p className="text-xs text-status-bad">{error}</p> : null}
    </form>
  );
}
