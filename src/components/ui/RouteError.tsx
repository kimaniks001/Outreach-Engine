"use client";

import Link from "next/link";
import { useEffect } from "react";

export function RouteError({
  error,
  reset,
  homeHref,
  homeLabel,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref: string;
  homeLabel: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[55vh] max-w-2xl items-center justify-center">
      <section className="w-full rounded-xl border border-status-warn/30 bg-surface-raised p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-status-warn">Temporarily unavailable</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">This workspace could not load safely.</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          No local replacement data has been invented. Try the request again, or return to a known workspace.
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-ink-faint">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white"
          >
            Try again
          </button>
          <Link
            href={homeHref}
            className="rounded-md border border-surface-border px-4 py-2.5 text-sm font-medium text-ink-muted"
          >
            {homeLabel}
          </Link>
        </div>
      </section>
    </div>
  );
}
