"use client";

import { useState } from "react";
import type { PlugMarketKitItem } from "@/lib/assets/market-assets";

export function ApprovedMarketKitCard({ item }: { item: PlugMarketKitItem }) {
  const [copied, setCopied] = useState(false);
  const readyText = [item.headline, item.body, item.cta].filter(Boolean).join("\n\n");

  async function copyApprovedMessage() {
    await navigator.clipboard.writeText(readyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <article className="rounded-2xl border border-surface-border bg-surface-raised p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">Approved for you to use</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">{item.title}</h2>
          <p className="mt-1 text-xs text-ink-faint">{item.kind.replaceAll("_", " ")} · {item.locale} · v{item.version}</p>
        </div>
        <span className="rounded-full border border-status-good/30 bg-status-good/10 px-2.5 py-1 text-xs font-semibold text-status-good">
          CURRENT
        </span>
      </div>

      <div className="mt-5 rounded-xl border border-surface-border bg-surface p-4">
        <p className="text-base font-semibold text-ink">{item.headline}</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-muted">{item.body}</p>
        <p className="mt-3 text-sm font-medium text-brand">{item.cta}</p>
      </div>

      {item.usageGuidance ? (
        <div className="mt-4 rounded-xl bg-brand/5 p-3 text-xs leading-5 text-ink-muted">
          <span className="font-semibold text-ink">How to use it: </span>{item.usageGuidance}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyApprovedMessage}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          {copied ? "Copied" : "Copy approved message"}
        </button>
      </div>

      <p className="mt-4 text-[11px] leading-5 text-ink-faint">
        Use this version as supplied. If SecurePay withdraws or replaces it, it will disappear from the current kit.
      </p>
    </article>
  );
}
