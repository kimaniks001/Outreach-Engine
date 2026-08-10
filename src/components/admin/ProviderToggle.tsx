"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ProviderToggle({ providerId, enabled }: { providerId: string; enabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setError(null);
    const response = await fetch(`/api/admin/providers/${providerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    if (!response.ok) {
      setError("Failed to update.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggle}
        disabled={pending}
        className={`rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:opacity-60 ${
          enabled
            ? "border-status-bad/40 text-status-bad hover:bg-status-bad/10"
            : "border-status-good/40 text-status-good hover:bg-status-good/10"
        }`}
      >
        {enabled ? "Disable" : "Enable"}
      </button>
      {error ? <span className="text-xs text-status-bad">{error}</span> : null}
    </div>
  );
}
