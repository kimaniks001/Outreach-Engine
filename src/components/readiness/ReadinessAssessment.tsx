"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ReadinessCredentialState,
  ReadinessProgram,
  ReadinessProgramCode,
} from "@/lib/readiness/securepay-readiness-client";

export function ReadinessAssessment({
  program,
  credentialState,
  live,
  lockedReason,
}: {
  program: ReadinessProgram;
  credentialState: ReadinessCredentialState;
  live: boolean;
  lockedReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ passed: boolean; score: number; totalQuestions: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const complete = useMemo(
    () => program.questions.every((question) => Boolean(answers[question.id])),
    [answers, program.questions]
  );

  async function submit() {
    if (!live) {
      setError("Practice preview only. SecurePay authority is not connected, so no score or credential can be issued.");
      return;
    }
    if (!complete || lockedReason) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/readiness/attempt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ programCode: program.code, answers }),
      });
      const payload = (await response.json()) as {
        passed?: boolean;
        score?: number;
        totalQuestions?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Assessment could not be submitted");
      setResult({
        passed: Boolean(payload.passed),
        score: Number(payload.score ?? 0),
        totalQuestions: Number(payload.totalQuestions ?? program.questions.length),
      });
      if (payload.passed) router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Assessment could not be submitted");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-ink">{program.title}</h2>
            <StatePill state={credentialState} />
            {!live && (
              <span className="rounded-full border border-surface-border px-2.5 py-1 text-[11px] font-medium text-ink-faint">
                preview
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-6 text-ink-muted">{program.description}</p>
          <p className="mt-2 text-xs text-ink-faint">
            Version {program.version} · {program.questions.length} questions · pass {program.passScore}/{program.questions.length}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          {credentialState === "CURRENT" ? "Review check" : open ? "Close" : "Take check"}
        </button>
      </div>

      {lockedReason && (
        <div className="mt-4 rounded-lg border border-status-warn/30 bg-status-warn/10 p-3 text-sm text-ink-muted">
          {lockedReason}
        </div>
      )}

      {open && (
        <div className="mt-6 space-y-6 border-t border-surface-border pt-5">
          {program.questions.map((question, index) => (
            <fieldset key={question.id} disabled={Boolean(lockedReason)}>
              <legend className="text-sm font-medium leading-6 text-ink">
                {index + 1}. {question.prompt}
              </legend>
              <div className="mt-3 space-y-2">
                {question.options.map((option) => (
                  <label
                    key={option}
                    className="flex cursor-pointer gap-3 rounded-lg border border-surface-border p-3 text-sm text-ink-muted transition hover:border-brand/30"
                  >
                    <input
                      type="radio"
                      name={`${program.code}-${question.id}`}
                      checked={answers[question.id] === option}
                      onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
                      className="mt-0.5"
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          {result && (
            <div
              className={`rounded-lg border p-4 text-sm ${
                result.passed
                  ? "border-status-good/30 bg-status-good/10 text-ink"
                  : "border-status-warn/30 bg-status-warn/10 text-ink"
              }`}
            >
              <p className="font-semibold">{result.passed ? "You passed this check." : "Nearly there."}</p>
              <p className="mt-1 text-ink-muted">
                {result.score}/{result.totalQuestions} correct. {result.passed ? "SecurePay issued the credential evidence." : "Review the scenarios and try again when ready."}
              </p>
            </div>
          )}

          {error && <p className="text-sm text-status-bad">{error}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={!complete || submitting || Boolean(lockedReason)}
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Checking…" : live ? "Submit check" : "Try practice preview"}
          </button>
        </div>
      )}
    </section>
  );
}

function StatePill({ state }: { state: ReadinessCredentialState }) {
  const label: Record<ReadinessCredentialState, string> = {
    CURRENT: "Current",
    REFRESH_DUE: "Refresh due",
    NOT_EARNED: "Not earned",
  };
  return (
    <span className="rounded-full border border-surface-border bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-muted">
      {label[state]}
    </span>
  );
}
