"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";

interface VariantLike {
  id: string;
  variantLabel: string;
  angle: string;
  headline: string;
  body: string;
  cta: string;
  imageConcept: string;
  rationale: string;
  brandGuardianStatus: string;
}

export function VariantCard({ variant, canEdit }: { variant: VariantLike; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [headline, setHeadline] = useState(variant.headline);
  const [body, setBody] = useState(variant.body);
  const [cta, setCta] = useState(variant.cta);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    await fetch(`/api/creative/variants/${variant.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ headline, body, cta }),
    });
    setPending(false);
    setEditing(false);
    router.refresh();
  }

  async function runBrandGuardian() {
    setPending(true);
    await fetch(`/api/creative/variants/${variant.id}/brand-guardian`, { method: "POST" });
    setPending(false);
    router.refresh();
  }

  const tone =
    variant.brandGuardianStatus === "PASS" ? "good" : variant.brandGuardianStatus === "BLOCK" ? "bad" : variant.brandGuardianStatus === "REVISE" ? "warn" : "neutral";

  return (
    <div className="rounded-md border border-surface-border p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">
          Variant {variant.variantLabel} — {variant.angle}
        </p>
        <Badge tone={tone}>{variant.brandGuardianStatus}</Badge>
      </div>

      {editing ? (
        <div className="space-y-2">
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
          <input
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={pending}
              className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-muted disabled:opacity-60"
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-md border border-surface-border px-3 py-1 text-xs text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm font-medium text-ink">{variant.headline}</p>
          <p className="mt-1 text-sm text-ink-muted">{variant.body}</p>
          <p className="mt-1 text-xs text-ink-faint">CTA: {variant.cta}</p>
          <p className="mt-2 text-xs text-ink-muted">
            <span className="text-ink-faint">Image concept: </span>
            {variant.imageConcept}
          </p>
          <p className="mt-1 text-xs text-ink-faint">Rationale: {variant.rationale}</p>
        </>
      )}

      {canEdit && !editing ? (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="rounded-md border border-surface-border px-2.5 py-1 text-xs text-ink-muted hover:text-ink"
          >
            Edit copy
          </button>
          <button
            onClick={runBrandGuardian}
            disabled={pending}
            className="rounded-md border border-surface-border px-2.5 py-1 text-xs text-ink-muted hover:text-ink disabled:opacity-60"
          >
            Run Brand Guardian
          </button>
        </div>
      ) : null}
    </div>
  );
}
