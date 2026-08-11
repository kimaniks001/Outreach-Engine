"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Tone = "brand" | "good" | "bad" | "neutral";

const TONE_CLASSES: Record<Tone, string> = {
  brand: "bg-brand text-white hover:bg-brand-muted",
  good: "border border-status-good/40 text-status-good hover:bg-status-good/10",
  bad: "border border-status-bad/40 text-status-bad hover:bg-status-bad/10",
  neutral: "border border-surface-border text-ink-muted hover:text-ink",
};

// Small, shared fetch-and-refresh action button — used across Phase 5's
// Growth Director / Experiments / Admin cost-and-model surfaces so each
// one doesn't need its own bespoke client component (same pattern as
// src/components/distribution/GenerateChannelRecommendationsButton.tsx,
// generalized).
export function ActionButton({
  url,
  method = "POST",
  body,
  label,
  pendingLabel,
  tone = "brand",
  confirmMessage,
  onSuccess,
}: {
  url: string;
  method?: "POST" | "DELETE";
  body?: unknown;
  label: string;
  pendingLabel?: string;
  tone?: Tone;
  confirmMessage?: string;
  onSuccess?: (data: unknown) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setPending(true);
    setError(null);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? data.error ?? "Action failed.");
      return;
    }
    onSuccess?.(data);
    router.refresh();
  }

  return (
    <div className="inline-block">
      <button
        onClick={run}
        disabled={pending}
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-60 ${TONE_CLASSES[tone]}`}
      >
        {pending ? (pendingLabel ?? "Working…") : label}
      </button>
      {error ? <p className="mt-1 text-xs text-status-bad">{error}</p> : null}
    </div>
  );
}
