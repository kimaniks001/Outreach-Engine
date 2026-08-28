"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface ReleasableCampaign {
  campaignId: string;
  campaignName: string;
  releaseVersion: number;
  variants: Array<{ id: string; label: string; headline: string }>;
}

const KINDS = [
  ["SOCIAL_POST", "Social post"],
  ["WHATSAPP_MESSAGE", "WhatsApp message"],
  ["POSTER_COPY", "Poster copy"],
  ["FLYER_COPY", "Flyer copy"],
  ["VIDEO_SCRIPT", "Video script"],
  ["TALKING_POINTS", "Talking points"],
] as const;

export function AssetReleaseForm({ campaigns }: { campaigns: ReleasableCampaign[] }) {
  const router = useRouter();
  const options = useMemo(
    () => campaigns.flatMap((campaign) => campaign.variants.map((variant) => ({ campaign, variant }))),
    [campaigns]
  );
  const [selection, setSelection] = useState(options[0] ? `${options[0].campaign.campaignId}|${options[0].variant.id}` : "");
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("SOCIAL_POST");
  const [locale, setLocale] = useState("en-KE");
  const [guidance, setGuidance] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function release() {
    const [campaignId, creativeVariantId] = selection.split("|");
    if (!campaignId || !creativeVariantId) return;
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch("/api/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campaignId, creativeVariantId, kind, locale, usageGuidance: guidance || null }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Could not release asset.");
      setStatus("Released from the current approved market proof.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not release asset.");
    } finally {
      setBusy(false);
    }
  }

  if (options.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-surface-border p-5 text-sm text-ink-muted">
        Nothing can be released yet. A campaign needs a current final Market Release with approved creative first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-ink">
        Approved creative
        <select
          value={selection}
          onChange={(event) => setSelection(event.target.value)}
          className="mt-1.5 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink"
        >
          {options.map(({ campaign, variant }) => (
            <option key={variant.id} value={`${campaign.campaignId}|${variant.id}`}>
              {campaign.campaignName} · {variant.label} · release v{campaign.releaseVersion}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink">
          Market format
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as (typeof KINDS)[number][0])}
            className="mt-1.5 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink"
          >
            {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Locale
          <input
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink"
          />
        </label>
      </div>

      <label className="block text-sm font-medium text-ink">
        Guidance for the Plug
        <textarea
          value={guidance}
          onChange={(event) => setGuidance(event.target.value)}
          rows={3}
          placeholder="Where this message works best, what not to change, or how to introduce it."
          className="mt-1.5 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={release}
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Releasing…" : "Release approved asset"}
        </button>
        {status ? <p className="text-xs text-ink-muted">{status}</p> : null}
      </div>
      <p className="text-xs leading-5 text-ink-faint">
        You are packaging already-approved copy. This form cannot introduce a new headline, claim or CTA.
      </p>
    </div>
  );
}
