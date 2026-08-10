"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(
          body.error === "ACCOUNT_INACTIVE"
            ? "This account has been deactivated."
            : "Incorrect email or password."
        );
        setSubmitting(false);
        return;
      }

      router.push("/today");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-brand">SecurePay</p>
          <h1 className="mt-1 text-xl font-semibold text-ink">Outreach Engine</h1>
          <p className="mt-1 text-sm text-ink-muted">Command Centre sign in</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-surface-border bg-surface-raised p-6 shadow-sm"
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink-muted">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                placeholder="you@securepay.co"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink-muted">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                placeholder="••••••••"
              />
            </div>

            {error ? (
              <p role="alert" className="text-sm text-status-bad">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-muted disabled:opacity-60"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-ink-faint">
          Internal SecurePay tool. Access is role-restricted and audited.
        </p>
      </div>
    </main>
  );
}
