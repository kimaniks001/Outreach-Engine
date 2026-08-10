"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATES = ["VERIFIED", "NEEDS_REVIEW", "WEAK_EVIDENCE", "REJECTED"];

export function EvidenceReviewButtons({ evidenceId, current }: { evidenceId: string; current: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function setStatus(verificationStatus: string) {
    setPending(true);
    await fetch(`/api/intelligence/evidence/${evidenceId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationStatus }),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-1">
      {STATES.filter((s) => s !== current).map((s) => (
        <button
          key={s}
          disabled={pending}
          onClick={() => setStatus(s)}
          className="rounded-full border border-surface-border px-2 py-0.5 text-xs text-ink-muted hover:text-ink disabled:opacity-60"
        >
          Mark {s}
        </button>
      ))}
    </div>
  );
}
