"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AnalyzeSignalButton({ signalId }: { signalId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/intelligence/signals/${signalId}/analyze`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      const reason =
        body?.result?.reason ?? body?.result?.error ?? body?.message ?? "Analysis failed — see console for detail.";
      setError(String(reason));
      return;
    }
    if (body.opportunity?.id) {
      router.push(`/intelligence/opportunities/${body.opportunity.id}`);
    } else {
      router.refresh();
    }
  }

  return (
    <div>
      <button
        onClick={analyze}
        disabled={pending}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-muted disabled:opacity-60"
      >
        {pending ? "Analyzing…" : "Analyze signal"}
      </button>
      {error ? <p className="mt-2 text-sm text-status-bad">{error}</p> : null}
    </div>
  );
}
