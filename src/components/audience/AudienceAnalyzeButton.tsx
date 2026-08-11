"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AudienceAnalyzeButton({ segmentId }: { segmentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/audiences/${segmentId}/analyze`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      const reason =
        body?.result?.reason ?? body?.result?.error ?? body?.message ?? "Classification failed — see console for detail.";
      setError(String(reason));
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button
        onClick={analyze}
        disabled={pending}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-muted disabled:opacity-60"
      >
        {pending ? "Classifying…" : "Run AI targeting analysis"}
      </button>
      {error ? <p className="mt-2 text-sm text-status-bad">{error}</p> : null}
    </div>
  );
}
