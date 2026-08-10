"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SafeModeState } from "@/lib/safe-mode/state";

export function SafeModeToggle({ mode }: { mode: SafeModeState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const nextMode: SafeModeState = mode === "SAFE_MODE" ? "NORMAL" : "SAFE_MODE";

  async function toggle() {
    setError(null);
    const response = await fetch("/api/admin/safe-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: nextMode }),
    });
    if (!response.ok) {
      setError("Failed to update Safe Mode.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div>
      <button
        onClick={toggle}
        disabled={pending}
        className={`rounded-md border px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${
          nextMode === "SAFE_MODE"
            ? "border-status-warn/40 text-status-warn hover:bg-status-warn/10"
            : "border-status-good/40 text-status-good hover:bg-status-good/10"
        }`}
      >
        {nextMode === "SAFE_MODE" ? "Activate Safe Mode" : "Return to Normal"}
      </button>
      {error ? <p className="mt-2 text-xs text-status-bad">{error}</p> : null}
    </div>
  );
}
