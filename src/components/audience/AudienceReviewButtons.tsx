"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AudienceReviewButtons({ segmentId }: { segmentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "APPROVE" | "REJECT" | "ARCHIVE") {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/audiences/${segmentId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setPending(false);
    if (!res.ok) {
      setError("Action failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={() => act("APPROVE")}
          className="rounded-md border border-status-good/40 px-3 py-1.5 text-sm font-medium text-status-good hover:bg-status-good/10 disabled:opacity-60"
        >
          Approve
        </button>
        <button
          disabled={pending}
          onClick={() => act("REJECT")}
          className="rounded-md border border-status-bad/40 px-3 py-1.5 text-sm font-medium text-status-bad hover:bg-status-bad/10 disabled:opacity-60"
        >
          Reject
        </button>
        <button
          disabled={pending}
          onClick={() => act("ARCHIVE")}
          className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-ink-muted hover:text-ink disabled:opacity-60"
        >
          Archive
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-status-bad">{error}</p> : null}
    </div>
  );
}
