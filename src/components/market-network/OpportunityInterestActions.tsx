"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OpportunityInterestActions({ offerId, currentDecision }: { offerId: string; currentDecision: "ACCEPTED" | "DECLINED" | null }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(decision: "ACCEPTED" | "DECLINED") {
    setWorking(true);
    setError(null);
    try {
      const response = await fetch(`/api/market-network/opportunities/${encodeURIComponent(offerId)}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not update your interest");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update your interest");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={working || currentDecision === "ACCEPTED"} onClick={() => update("ACCEPTED")} className="rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-45">
          {currentDecision === "ACCEPTED" ? "I’m interested ✓" : "I’m interested"}
        </button>
        <button type="button" disabled={working || currentDecision === "DECLINED"} onClick={() => update("DECLINED")} className="rounded-md border border-surface-border px-4 py-2.5 text-sm font-medium text-ink-muted disabled:opacity-45">
          {currentDecision === "DECLINED" ? "Not for me ✓" : "Not for me"}
        </button>
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-faint">Your response records interest only. Any later customer relationship is confirmed separately.</p>
      {error && <p className="mt-2 text-sm text-status-bad">{error}</p>}
    </div>
  );
}
