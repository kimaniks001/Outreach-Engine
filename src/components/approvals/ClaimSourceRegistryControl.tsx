"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const SOURCE_TYPES = ["DOCTRINE", "TERMS", "PRICING", "PRODUCT_AUTHORITY", "LEGAL_APPROVAL", "POLICY", "OTHER"] as const;

export function ClaimSourceRegistryControl() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/claim-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceKey: String(form.get("sourceKey") ?? "").trim(),
          title: String(form.get("title") ?? "").trim(),
          sourceType: String(form.get("sourceType") ?? "DOCTRINE"),
          version: String(form.get("version") ?? "").trim(),
          sourceReference: String(form.get("sourceReference") ?? "").trim(),
          contentDigest: String(form.get("contentDigest") ?? "").trim() || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? result.error ?? "Could not register source.");
      event.currentTarget.reset();
      setMessage("Authoritative source reference registered. It is now available for explicit campaign attachment.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not register source.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-surface-border bg-surface-raised p-5">
      <div className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Owner control</p>
        <h2 className="mt-1 text-xl font-semibold text-ink">Register an authoritative claim source</h2>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          Register the reference and exact version SecurePay authorises reviewers to rely on. This does not turn an uploaded file,
          AI output or draft into doctrine; the source must already be authoritative outside Outreach.
        </p>
      </div>
      <form onSubmit={submit} className="mt-5 grid gap-3 md:grid-cols-2">
        <Field name="sourceKey" label="Stable source key" placeholder="securepay-customer-language" required />
        <Field name="title" label="Source title" placeholder="SecurePay Customer Language Doctrine" required />
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-ink-faint">Source type</span>
          <select name="sourceType" className="w-full rounded-xl border border-surface-border bg-surface px-3 py-3 text-base text-ink">
            {SOURCE_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <Field name="version" label="Version" placeholder="v1.0" required />
        <div className="md:col-span-2"><Field name="sourceReference" label="Authoritative reference" placeholder="Repository path, document reference or controlled URL" required /></div>
        <div className="md:col-span-2"><Field name="contentDigest" label="Content digest (optional)" placeholder="SHA-256 or other controlled digest" /></div>
        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <button disabled={busy} className="rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Registering…" : "Register source"}
          </button>
          {message ? <p className="text-sm text-ink-muted" aria-live="polite">{message}</p> : null}
        </div>
      </form>
    </section>
  );
}

function Field({ name, label, placeholder, required }: { name: string; label: string; placeholder: string; required?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-ink-faint">{label}</span>
      <input name={name} required={required} placeholder={placeholder} className="w-full rounded-xl border border-surface-border bg-surface px-3 py-3 text-base text-ink" />
    </label>
  );
}
