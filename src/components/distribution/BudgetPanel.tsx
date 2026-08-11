"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

interface BudgetRow {
  id: string;
  plannedBudget: string;
  approvedBudget: string | null;
  currency: string;
  dailyCap: string | null;
  totalCap: string | null;
  status: string;
  createdAt: string;
}

export function BudgetPanel({
  planId,
  currentBudget,
  canPropose,
  canApprove,
}: {
  planId: string;
  currentBudget: BudgetRow | null;
  canPropose: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [plannedBudget, setPlannedBudget] = useState(currentBudget?.plannedBudget ?? "");
  const [currency, setCurrency] = useState(currentBudget?.currency ?? "USD");
  const [dailyCap, setDailyCap] = useState(currentBudget?.dailyCap ?? "");
  const [totalCap, setTotalCap] = useState(currentBudget?.totalCap ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);

  async function propose(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/distribution/plans/${planId}/budget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plannedBudget: Number(plannedBudget),
        currency,
        dailyCap: dailyCap ? Number(dailyCap) : undefined,
        totalCap: totalCap ? Number(totalCap) : undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(body.message ?? "Failed to propose budget.");
      return;
    }
    router.refresh();
  }

  async function approve() {
    setApproving(true);
    setError(null);
    const res = await fetch(`/api/distribution/plans/${planId}/budget`, { method: "PATCH" });
    const body = await res.json().catch(() => ({}));
    setApproving(false);
    if (!res.ok) {
      setError(body.message ?? "Failed to approve budget.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {currentBudget ? (
        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Row label="Planned">{currentBudget.plannedBudget} {currentBudget.currency}</Row>
          <Row label="Approved">{currentBudget.approvedBudget ?? "—"}</Row>
          <Row label="Daily cap">{currentBudget.dailyCap ?? "None"}</Row>
          <Row label="Total cap">{currentBudget.totalCap ?? "None"}</Row>
          <Row label="Status">{currentBudget.status}</Row>
        </dl>
      ) : (
        <p className="text-sm text-ink-muted">No budget proposed yet.</p>
      )}

      {canApprove && currentBudget?.status === "PROPOSED" ? (
        <button
          onClick={approve}
          disabled={approving}
          className="rounded-md border border-status-good/40 px-3 py-1.5 text-sm font-medium text-status-good hover:bg-status-good/10 disabled:opacity-60"
        >
          {approving ? "Approving…" : "Approve budget"}
        </button>
      ) : null}

      {canPropose ? (
        <form onSubmit={propose} className="grid grid-cols-2 gap-3 rounded-md border border-surface-border p-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Planned budget</label>
            <input
              required
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
              required
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Daily cap (optional)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={dailyCap}
              onChange={(e) => setDailyCap(e.target.value)}
              className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Total cap (optional)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={totalCap}
              onChange={(e) => setTotalCap(e.target.value)}
              className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />
          </div>
          <div className="md:col-span-4">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-muted disabled:opacity-60"
            >
              {submitting ? "Proposing…" : "Propose budget"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? <p className="text-sm text-status-bad">{error}</p> : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
