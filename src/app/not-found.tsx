import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5 py-10">
      <section className="w-full max-w-xl rounded-xl border border-surface-border bg-surface-raised p-7 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">404 · Not found</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">This Outreach workspace does not exist.</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          The link may be old, or this identity may no longer have access to the resource.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white"
        >
          Return to Outreach
        </Link>
      </section>
    </main>
  );
}
