"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SCOPES = ["GLOBAL", "PROVIDER", "MODEL", "TASK_TYPE", "USER"] as const;
const PERIODS = ["DAILY", "MONTHLY"] as const;

// Minimal set-budget-policy form — Phase 5 brief Section 28/26 ("no
// over-engineering"): scope + period + soft/hard limits + an optional
// scopeRef, nothing more.
export function SetBudgetPolicyForm() {
  const router = useRouter();
  const [scope, setScope] = useState<(typeof SCOPES)[number]>("GLOBAL");
  const [periodType, setPeriodType] = useState<(typeof PERIODS)[number]>("MONTHLY");
  const [scopeRef, setScopeRef] = useState("");
  const [softLimitUsd, setSoftLimitUsd] = useState("");
  const [hardLimitUsd, setHardLimitUsd] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/admin/ai-budget", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope,
        scopeRef: scope === "GLOBAL" ? undefined : scopeRef || undefined,
        periodType,
        softLimitUsd: softLimitUsd ? Number(softLimitUsd) : undefined,
        hardLimitUsd: hardLimitUsd ? Number(hardLimitUsd) : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? data.error ?? "Failed to set budget policy.");
      return;
    }
    setScopeRef("");
    setSoftLimitUsd("");
    setHardLimitUsd("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 text-xs">
      <label className="flex flex-col gap-0.5">
        Scope
        <select value={scope} onChange={(e) => setScope(e.target.value as (typeof SCOPES)[number])} className="rounded border border-surface-border bg-surface px-2 py-1">
          {SCOPES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
      {scope !== "GLOBAL" ? (
        <label className="flex flex-col gap-0.5">
          Scope ref (id/task type)
          <input value={scopeRef} onChange={(e) => setScopeRef(e.target.value)} className="w-40 rounded border border-surface-border bg-surface px-2 py-1" />
        </label>
      ) : null}
      <label className="flex flex-col gap-0.5">
        Period
        <select value={periodType} onChange={(e) => setPeriodType(e.target.value as (typeof PERIODS)[number])} className="rounded border border-surface-border bg-surface px-2 py-1">
          {PERIODS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-0.5">
        Soft limit ($)
        <input value={softLimitUsd} onChange={(e) => setSoftLimitUsd(e.target.value)} type="number" min="0" step="0.01" className="w-24 rounded border border-surface-border bg-surface px-2 py-1" />
      </label>
      <label className="flex flex-col gap-0.5">
        Hard limit ($)
        <input value={hardLimitUsd} onChange={(e) => setHardLimitUsd(e.target.value)} type="number" min="0" step="0.01" className="w-24 rounded border border-surface-border bg-surface px-2 py-1" />
      </label>
      <button type="submit" disabled={pending} className="rounded-md bg-brand px-3 py-1.5 font-medium text-white hover:bg-brand-muted disabled:opacity-60">
        {pending ? "Saving…" : "Set policy"}
      </button>
      {error ? <p className="w-full text-status-bad">{error}</p> : null}
    </form>
  );
}
