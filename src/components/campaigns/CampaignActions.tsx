"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunBrandGuardianButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/brand-guardian`, { method: "POST" });
    setPending(false);
    if (!res.ok) {
      setError("Brand Guardian review failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={pending}
        className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-ink-muted hover:text-ink disabled:opacity-60"
      >
        {pending ? "Reviewing…" : "Run Brand Guardian"}
      </button>
      {error ? <p className="mt-1 text-xs text-status-bad">{error}</p> : null}
    </div>
  );
}

export function CampaignReviewButtons({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "APPROVE" | "REJECT" | "REVISION_REQUESTED") {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(body.message ?? "Action failed.");
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
          onClick={() => act("REVISION_REQUESTED")}
          className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-ink-muted hover:text-ink disabled:opacity-60"
        >
          Request revision
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-status-bad">{error}</p> : null}
    </div>
  );
}

export function GenerateVariantsButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/creative`, { method: "POST" });
    setPending(false);
    if (!res.ok) {
      setError("Creative generation failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={pending}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-muted disabled:opacity-60"
      >
        {pending ? "Generating…" : "Generate 3 creative variants"}
      </button>
      {error ? <p className="mt-1 text-xs text-status-bad">{error}</p> : null}
    </div>
  );
}
