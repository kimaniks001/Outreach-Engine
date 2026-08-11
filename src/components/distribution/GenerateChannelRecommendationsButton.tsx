"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GenerateChannelRecommendationsButton({
  campaignId,
  audienceSegmentId,
}: {
  campaignId: string;
  audienceSegmentId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setPending(true);
    setError(null);
    const res = await fetch("/api/distribution/channel-recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, audienceSegmentId }),
    });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(body.message ?? "Failed to generate channel recommendations.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button
        onClick={generate}
        disabled={pending}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-muted disabled:opacity-60"
      >
        {pending ? "Generating…" : "Generate channel recommendations"}
      </button>
      {error ? <p className="mt-2 text-sm text-status-bad">{error}</p> : null}
    </div>
  );
}
