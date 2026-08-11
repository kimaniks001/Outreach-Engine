"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function ActionButton({
  label,
  pendingLabel,
  onClick,
  tone = "neutral",
}: {
  label: string;
  pendingLabel: string;
  onClick: () => Promise<{ ok: boolean; message?: string }>;
  tone?: "neutral" | "good" | "bad" | "brand";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toneClass =
    tone === "good"
      ? "border-status-good/40 text-status-good hover:bg-status-good/10"
      : tone === "bad"
        ? "border-status-bad/40 text-status-bad hover:bg-status-bad/10"
        : tone === "brand"
          ? "bg-brand text-white hover:bg-brand-muted border-transparent"
          : "border-surface-border text-ink-muted hover:text-ink";

  return (
    <div>
      <button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await onClick();
          setPending(false);
          if (!result.ok) {
            setError(result.message ?? "Action failed.");
            return;
          }
          router.refresh();
        }}
        className={`rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${toneClass}`}
      >
        {pending ? pendingLabel : label}
      </button>
      {error ? <p className="mt-1 text-xs text-status-bad">{error}</p> : null}
    </div>
  );
}

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const parsed = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      parsed?.outcome?.reason ?? parsed?.message ?? parsed?.error ?? "Action failed.";
    return { ok: false, message: String(message) };
  }
  return { ok: true };
}

export function RunPlanBrandGuardianButton({ planId }: { planId: string }) {
  return (
    <ActionButton
      label="Run Brand Guardian"
      pendingLabel="Reviewing…"
      onClick={() => postJson(`/api/distribution/plans/${planId}/brand-guardian`)}
    />
  );
}

export function PlanReviewButtons({ planId }: { planId: string }) {
  return (
    <div className="flex gap-2">
      <ActionButton
        label="Approve"
        pendingLabel="Approving…"
        tone="good"
        onClick={() => postJson(`/api/distribution/plans/${planId}/review`, { action: "APPROVE" })}
      />
      <ActionButton
        label="Reject"
        pendingLabel="Rejecting…"
        tone="bad"
        onClick={() => postJson(`/api/distribution/plans/${planId}/review`, { action: "REJECT" })}
      />
    </div>
  );
}

export function MarkReadyButton({ planId }: { planId: string }) {
  return (
    <ActionButton
      label="Mark READY"
      pendingLabel="Checking…"
      tone="brand"
      onClick={() => postJson(`/api/distribution/plans/${planId}/ready`)}
    />
  );
}

export function LaunchSimulatedButton({ planId }: { planId: string }) {
  return (
    <ActionButton
      label="Launch (SIMULATED)"
      pendingLabel="Launching…"
      tone="brand"
      onClick={() => postJson(`/api/distribution/plans/${planId}/launch`)}
    />
  );
}

export function PauseExecutionButton({ planId }: { planId: string }) {
  return (
    <ActionButton
      label="Pause"
      pendingLabel="Pausing…"
      onClick={() => postJson(`/api/distribution/plans/${planId}/pause`)}
    />
  );
}
