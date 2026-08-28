"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface StudioModelOption {
  id: string;
  label: string;
  provider: string;
  isMock: boolean;
}

export function StudioGenerateControl({
  campaignId,
  models,
}: {
  campaignId: string;
  models: StudioModelOption[];
}) {
  const router = useRouter();
  const [modelId, setModelId] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setPending(true);
    setMessage(null);
    setError(null);

    const res = await fetch(`/api/campaigns/${campaignId}/creative`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(modelId ? { preferredModelId: modelId } : {}),
    });
    const body = await res.json().catch(() => ({}));
    setPending(false);

    if (!res.ok) {
      setError(body.message ?? "Studio could not create this draft.");
      return;
    }

    if (body.source === "ai") {
      setMessage(`Drafted with ${body.provider}/${body.model}. Still requires human review and market approval.`);
    } else {
      setMessage("No live approved model completed the job, so Studio used its deterministic creative-brief fallback. Still draft only.");
    }
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-raised p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Creative direction</p>
          <h3 className="mt-1 text-lg font-semibold text-ink">Generate a new draft set</h3>
          <p className="mt-1 text-sm leading-5 text-ink-muted">
            Automatic routing chooses the highest-quality approved available model. Or choose a specific approved model for this
            job. Studio will not silently bypass the registry if your choice becomes unavailable.
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="min-w-64 rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          >
            <option value="">Automatic · best approved model</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label} · {model.provider}{model.isMock ? " · DEMO" : ""}
              </option>
            ))}
          </select>
          <button
            onClick={generate}
            disabled={pending}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-muted disabled:opacity-60"
          >
            {pending ? "Creating…" : "Create 3 drafts"}
          </button>
        </div>
      </div>

      {models.length === 0 ? (
        <p className="mt-3 text-xs text-ink-faint">
          No live model is currently approved and available for Creative Ideation. Automatic generation will use the safe
          deterministic brief fallback rather than pretending an AI model ran.
        </p>
      ) : null}
      {message ? <p className="mt-3 text-sm text-status-good">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-status-bad">{error}</p> : null}
    </div>
  );
}
