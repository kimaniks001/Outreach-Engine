"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MarketNetworkLogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/securepay-auth/logout", { method: "POST" });
    } finally {
      router.push("/market-login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      className="rounded-md border border-surface-border px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:border-brand/40 hover:text-ink disabled:opacity-60"
    >
      {busy ? "Leaving…" : "Leave Community LIVE"}
    </button>
  );
}
