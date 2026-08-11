"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewVariantForm({
  experimentId,
  creativeVariants,
  distributionPlans,
}: {
  experimentId: string;
  creativeVariants: Array<{ id: string; variantLabel: string; angle: string }>;
  distributionPlans: Array<{ id: string; objective: string }>;
}) {
  const router = useRouter();
  const [variantLabel, setVariantLabel] = useState("");
  const [isControl, setIsControl] = useState(false);
  const [messagingAngle, setMessagingAngle] = useState("");
  const [cta, setCta] = useState("");
  const [creativeVariantId, setCreativeVariantId] = useState("");
  const [distributionPlanId, setDistributionPlanId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch(`/api/experiments/${experimentId}/variants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variantLabel,
        isControl,
        messagingAngle,
        cta,
        creativeVariantId: creativeVariantId || undefined,
        distributionPlanId: distributionPlanId || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? data.error ?? "Failed to add variant.");
      return;
    }
    setVariantLabel("");
    setMessagingAngle("");
    setCta("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-2 rounded-md border border-surface-border p-3 text-xs">
      <input required value={variantLabel} onChange={(e) => setVariantLabel(e.target.value)} placeholder="Label (e.g. A)" className="rounded border border-surface-border bg-surface px-2 py-1" />
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={isControl} onChange={(e) => setIsControl(e.target.checked)} /> Control
      </label>
      <input required value={messagingAngle} onChange={(e) => setMessagingAngle(e.target.value)} placeholder="Messaging angle" className="col-span-2 rounded border border-surface-border bg-surface px-2 py-1" />
      <input required value={cta} onChange={(e) => setCta(e.target.value)} placeholder="CTA" className="rounded border border-surface-border bg-surface px-2 py-1" />
      <select value={creativeVariantId} onChange={(e) => setCreativeVariantId(e.target.value)} className="rounded border border-surface-border bg-surface px-2 py-1">
        <option value="">Creative variant (optional)</option>
        {creativeVariants.map((v) => (
          <option key={v.id} value={v.id}>{v.variantLabel} — {v.angle}</option>
        ))}
      </select>
      <select value={distributionPlanId} onChange={(e) => setDistributionPlanId(e.target.value)} className="col-span-2 rounded border border-surface-border bg-surface px-2 py-1">
        <option value="">Distribution plan serving this variant (needed for evaluation)</option>
        {distributionPlans.map((p) => (
          <option key={p.id} value={p.id}>{p.objective.slice(0, 60)}</option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="col-span-2 rounded-md bg-brand px-3 py-1.5 font-medium text-white hover:bg-brand-muted disabled:opacity-60">
        {pending ? "Adding…" : "Add variant"}
      </button>
      {error ? <p className="col-span-2 text-status-bad">{error}</p> : null}
    </form>
  );
}
