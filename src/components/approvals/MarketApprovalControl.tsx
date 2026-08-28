"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SourceOption {
  id: string;
  title: string;
  version: string;
  status: string;
}

export function MarketApprovalControl({
  campaignId,
  role,
  brandGuardianStatus,
  campaignStatus,
  currentReleaseVersion,
  sources,
  attachedSourceIds,
}: {
  campaignId: string;
  role: string;
  brandGuardianStatus: string;
  campaignStatus: string;
  currentReleaseVersion: number | null;
  sources: SourceOption[];
  attachedSourceIds: string[];
}) {
  const router = useRouter();
  const [sourceId, setSourceId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const canBrandApprove = role === "OWNER" || role === "GROWTH_DIRECTOR";
  const isOwner = role === "OWNER";
  const availableSources = sources.filter((source) => source.status === "CURRENT" && !attachedSourceIds.includes(source.id));

  async function call(label: string, url: string, body: Record<string, unknown>) {
    setBusy(label);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? result.error ?? `${label} failed.`);
      setMessage(`${label} recorded.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${label} failed.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-surface-border bg-surface-raised p-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Decision controls</p>
        <h2 className="mt-1 text-xl font-semibold text-ink">Move only the gate you own.</h2>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          Each action is independent. Brand approval cannot publish; Compliance/Legal cannot spend; final release cannot start advertising.
        </p>
      </div>

      <div className="mt-5 space-y-5">
        <div className="rounded-xl border border-surface-border p-4">
          <p className="text-sm font-semibold text-ink">1. Attach authoritative source</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select value={sourceId} onChange={(event) => setSourceId(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-surface-border bg-surface px-3 py-3 text-base text-ink">
              <option value="">Choose a CURRENT source…</option>
              {availableSources.map((source) => <option key={source.id} value={source.id}>{source.title} · {source.version}</option>)}
            </select>
            <button
              type="button"
              disabled={!sourceId || busy !== null || !["OWNER", "GROWTH_DIRECTOR", "STRATEGIST"].includes(role)}
              onClick={() => call("Source attachment", `/api/campaigns/${campaignId}/claim-sources`, { claimSourceId: sourceId, note: notes || undefined })}
              className="rounded-xl border border-surface-border px-4 py-3 text-sm font-semibold text-ink disabled:opacity-40"
            >Attach source</button>
          </div>
          {availableSources.length === 0 ? <p className="mt-2 text-xs text-ink-faint">No additional CURRENT sources are available.</p> : null}
        </div>

        <div className="rounded-xl border border-surface-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-sm font-semibold text-ink">2. Brand & Claims</p><p className="mt-1 text-xs text-ink-faint">Automated result: {brandGuardianStatus} · Campaign: {campaignStatus}</p></div>
            <div className="flex flex-wrap gap-2">
              {canBrandApprove ? <>
                <ActionButton disabled={busy !== null} onClick={() => call("Brand & Claims approval", `/api/campaigns/${campaignId}/review`, { action: "APPROVE", notes: notes || undefined })}>Approve</ActionButton>
                <ActionButton disabled={busy !== null} onClick={() => call("Brand revision request", `/api/campaigns/${campaignId}/review`, { action: "REVISION_REQUESTED", notes: notes || undefined })}>Needs revision</ActionButton>
              </> : <span className="text-xs text-ink-faint">View only</span>}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-surface-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-sm font-semibold text-ink">3. Compliance / Legal</p><p className="mt-1 text-xs text-ink-faint">Owner-only until dedicated legal/compliance authority roles are introduced.</p></div>
            {isOwner ? <div className="flex flex-wrap gap-2">
              <ActionButton disabled={busy !== null} onClick={() => call("Compliance / Legal approval", `/api/campaigns/${campaignId}/compliance-review`, { action: "APPROVE", notes: notes || undefined })}>Approve</ActionButton>
              <ActionButton disabled={busy !== null} onClick={() => call("Compliance revision request", `/api/campaigns/${campaignId}/compliance-review`, { action: "REVISION_REQUIRED", notes: notes || undefined })}>Needs revision</ActionButton>
            </div> : <span className="text-xs text-ink-faint">Not your authority</span>}
          </div>
        </div>

        <div className="rounded-xl border border-brand/20 bg-brand/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-sm font-semibold text-ink">4. Final Market Release</p><p className="mt-1 text-xs text-ink-faint">{currentReleaseVersion ? `Current release v${currentReleaseVersion}` : "No current release"}</p></div>
            {isOwner ? <button
              type="button"
              disabled={busy !== null}
              onClick={() => call("Final market release", `/api/campaigns/${campaignId}/market-release`, { notes: notes || undefined })}
              className="rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >Release to market</button> : <span className="text-xs text-ink-faint">Owner release required</span>}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-faint">Decision note</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={2000} placeholder="Why is this source relevant, or what did you review?" className="w-full rounded-xl border border-surface-border bg-surface px-3 py-3 text-base text-ink" />
        </label>

        {message ? <p className="text-sm text-ink-muted" aria-live="polite">{message}</p> : null}
        {busy ? <p className="text-xs text-ink-faint" aria-live="polite">Recording {busy}…</p> : null}
      </div>
    </section>
  );
}

function ActionButton({ children, disabled, onClick }: { children: React.ReactNode; disabled: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="rounded-lg border border-surface-border px-3 py-2 text-xs font-semibold text-ink disabled:opacity-40">{children}</button>;
}
