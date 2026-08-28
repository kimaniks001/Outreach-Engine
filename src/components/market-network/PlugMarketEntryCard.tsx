"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlugMarketProfile } from "@/lib/market-network/securepay-plug-market-client";

export function PlugMarketEntryCard({ profile }: { profile: PlugMarketProfile }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(path: "entry" | "exit") {
    setWorking(true);
    setError(null);
    try {
      const response = await fetch(`/api/market-network/plug/${path}`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Market participation could not be updated");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Market participation could not be updated");
    } finally {
      setWorking(false);
    }
  }

  const copy = standingCopy(profile.standing);

  return (
    <section className="rounded-xl border border-brand/25 bg-surface-raised p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Your market standing</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">{copy.title}</h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">{copy.body}</p>
        </div>
        <span className="rounded-full border border-surface-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink-muted">
          {profile.standing.replaceAll("_", " ")}
        </span>
      </div>

      {profile.standing === "READY_TO_ENTER" && (
        <div className="mt-5 rounded-lg border border-surface-border bg-surface p-4">
          <p className="text-sm font-semibold text-ink">Before you enter</p>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            I’m ready to represent SecurePay accurately, work within the skills SecurePay currently shows for me, and ask for help when a question is outside my role.
          </p>
          <button
            type="button"
            disabled={working}
            onClick={() => act("entry")}
            className="mt-4 rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {working ? "Entering…" : "I understand · enter the market"}
          </button>
        </div>
      )}

      {profile.standing === "EXITED" && profile.marketReady && (
        <button
          type="button"
          disabled={working}
          onClick={() => act("entry")}
          className="mt-5 rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {working ? "Re-entering…" : "Re-enter the market"}
        </button>
      )}

      {profile.standing === "ACTIVE" && (
        <button
          type="button"
          disabled={working}
          onClick={() => act("exit")}
          className="mt-5 rounded-md border border-surface-border px-4 py-2 text-sm font-medium text-ink-muted disabled:opacity-50"
        >
          {working ? "Updating…" : "Leave active market participation"}
        </button>
      )}

      {error && <p className="mt-3 text-sm text-status-bad">{error}</p>}

      <p className="mt-4 text-xs leading-5 text-ink-faint">
        Market participation is not employment, Master status, referral entitlement, payment authority or a professional licence. SecurePay keeps each of those truths separate.
      </p>
    </section>
  );
}

function standingCopy(standing: PlugMarketProfile["standing"]): { title: string; body: string } {
  switch (standing) {
    case "IN_TRAINING":
      return {
        title: "Keep learning before you enter the market",
        body: "A current Market Ready credential is required before SecurePay can accept market entry.",
      };
    case "READY_TO_ENTER":
      return {
        title: "You’re ready to enter the market",
        body: "You have demonstrated the foundational capability. Entering is still your explicit choice; SecurePay does not turn a training pass into Plug identity automatically.",
      };
    case "ACTIVE":
      return {
        title: "You’re active in the market",
        body: "SecurePay currently records both active market enrollment and current Market Ready capability for this identity.",
      };
    case "REFRESH_REQUIRED":
      return {
        title: "Refresh before representing the market again",
        body: "Your Plug enrollment remains recorded, but your current Market Ready evidence needs refreshing. Representation pauses until capability is current again.",
      };
    case "EXITED":
      return {
        title: "You left active market participation",
        body: "Your history remains true. If you choose to return, SecurePay will require current Market Ready capability before re-entry.",
      };
  }
}
