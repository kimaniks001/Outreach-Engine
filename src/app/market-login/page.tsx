"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Step = "CREDENTIALS" | "MFA";

export default function MarketLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("CREDENTIALS");
  const [ksNumber, setKsNumber] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function begin(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/securepay-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ksNumber, password }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        challengeToken?: string;
        error?: string;
      };

      if (!response.ok || !body.challengeToken) {
        setError(humanError(body.error, "We could not start your SecurePay sign-in."));
        return;
      }

      setChallengeToken(body.challengeToken);
      setPassword("");
      setStep("MFA");
    } catch {
      setError("SecurePay could not be reached. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function complete(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/securepay-auth/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken, otpProof: otp }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(humanError(body.error, "That code could not be confirmed."));
        return;
      }

      router.push("/community-live");
      router.refresh();
    } catch {
      setError("SecurePay could not be reached. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function startAgain() {
    setStep("CREDENTIALS");
    setOtp("");
    setChallengeToken("");
    setError(null);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-7 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">SecurePay</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">Community LIVE</h1>
          <p className="mt-2 text-sm text-ink-muted">Money stays quiet. People come alive here.</p>
        </div>

        <section className="rounded-xl border border-surface-border bg-surface-raised p-6 shadow-xl">
          {step === "CREDENTIALS" ? (
            <>
              <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Market Network</p>
              <h2 className="mt-2 text-lg font-semibold text-ink">Enter with your SecurePay identity</h2>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                Use the same KS Number and SecurePay sign-in you use in the market. Outreach does not create a second market password for you.
              </p>

              <form onSubmit={begin} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="ks-number" className="mb-1 block text-sm font-medium text-ink-muted">KS Number</label>
                  <input
                    id="ks-number"
                    required
                    autoComplete="username"
                    value={ksNumber}
                    onChange={(event) => setKsNumber(event.target.value)}
                    className="w-full rounded-md border border-surface-border bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
                    placeholder="Your KS Number"
                  />
                </div>
                <div>
                  <label htmlFor="market-password" className="mb-1 block text-sm font-medium text-ink-muted">Password</label>
                  <input
                    id="market-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-md border border-surface-border bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
                    placeholder="••••••••"
                  />
                </div>

                {error ? <p role="alert" className="text-sm text-status-bad">{error}</p> : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-muted disabled:opacity-60"
                >
                  {submitting ? "Checking…" : "Continue securely"}
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="text-xs font-medium uppercase tracking-widest text-status-good">One more step</p>
              <h2 className="mt-2 text-lg font-semibold text-ink">Confirm it is you</h2>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                SecurePay asked for your second-factor proof. Enter the code from your normal SecurePay authentication channel.
              </p>

              <form onSubmit={complete} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="otp" className="mb-1 block text-sm font-medium text-ink-muted">Security code</label>
                  <input
                    id="otp"
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(event) => setOtp(event.target.value)}
                    className="w-full rounded-md border border-surface-border bg-surface px-3 py-2.5 text-center text-lg tracking-[0.3em] text-ink outline-none focus:border-brand"
                    placeholder="000000"
                  />
                </div>

                {error ? <p role="alert" className="text-sm text-status-bad">{error}</p> : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-muted disabled:opacity-60"
                >
                  {submitting ? "Confirming…" : "Enter Community LIVE"}
                </button>
                <button type="button" onClick={startAgain} className="w-full text-xs text-ink-faint hover:text-ink-muted">
                  Use a different KS Number
                </button>
              </form>
            </>
          )}
        </section>

        <div className="mt-6 text-center text-xs leading-5 text-ink-faint">
          <p>SecurePay remains the authority for your identity and Community access.</p>
          <p className="mt-3">
            SecurePay staff?{" "}
            <Link href="/login" className="font-medium text-brand hover:underline">Open Command Centre sign in</Link>
          </p>
        </div>
      </div>
    </main>
  );
}

function humanError(code: string | undefined, fallback: string): string {
  switch (code) {
    case "INVALID_CREDENTIALS":
      return "That KS Number or password could not be confirmed.";
    case "INVALID_MFA":
      return "That security code could not be confirmed. Try again.";
    case "RATE_LIMITED":
      return "Too many attempts. Give SecurePay a little time before trying again.";
    case "SECUREPAY_NOT_CONFIGURED":
      return "Community LIVE is not connected to SecurePay authentication in this environment yet.";
    case "SECUREPAY_AUTH_UNAVAILABLE":
      return "SecurePay authentication is temporarily unavailable. Please try again.";
    default:
      return fallback;
  }
}
