"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  marketReadyCheck,
  propertySpecialistCheck,
  readinessLadder,
  readinessPrinciples,
  scoreCheck,
  type ReadinessCheck,
} from "@/lib/readiness/foundation";

type CheckResult = ReturnType<typeof scoreCheck> | null;

export function ReadinessJourney({ memberName }: { memberName: string }) {
  const [marketReadyPassed, setMarketReadyPassed] = useState(false);
  const [propertyPassed, setPropertyPassed] = useState(false);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-brand/20 bg-brand/5 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Practice mode · no credential awarded</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">Learn the market by handling real situations</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
              {memberName}, this is the shape of the readiness journey. You can complete it now for product review and learning, but your result stays in this browser session only. {readinessPrinciples.prototype}
            </p>
          </div>
          <span className="rounded-full border border-status-warn/30 bg-status-warn/10 px-3 py-1.5 text-xs font-semibold text-status-warn">
            Authority not connected
          </span>
        </div>
      </section>

      <section>
        <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">The path</p>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-5">
          {readinessLadder.map((step, index) => {
            const active =
              step.stage === "ORIENTATION" ||
              (step.stage === "MARKET_READY" && marketReadyPassed) ||
              (step.stage === "SPECIALIST" && propertyPassed);
            return (
              <div
                key={step.stage}
                className={`rounded-lg border p-4 ${
                  active ? "border-status-good/30 bg-status-good/5" : "border-surface-border bg-surface-raised"
                }`}
              >
                <p className="text-xs font-semibold text-ink-faint">{index + 1}</p>
                <p className="mt-1 text-sm font-semibold text-ink">{step.title}</p>
                <p className="mt-2 text-xs leading-5 text-ink-muted">{step.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      <PracticeCheck
        check={marketReadyCheck}
        eyebrow="Core readiness"
        onPassed={() => setMarketReadyPassed(true)}
      />

      <section className={`rounded-xl border p-5 md:p-6 ${marketReadyPassed ? "border-brand/25 bg-surface-raised" : "border-surface-border bg-surface-raised/60"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-brand">Industry path</p>
            <h2 className="mt-1 text-lg font-semibold text-ink">Property skills check</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
              Property is a good example of why specialist learning matters: seller identity, title due diligence and payment structure are related in the customer’s mind, but they are not the same authority.
            </p>
          </div>
          {!marketReadyPassed && (
            <span className="rounded-full border border-surface-border px-3 py-1.5 text-xs text-ink-faint">Complete core practice first</span>
          )}
        </div>

        {marketReadyPassed ? (
          <div className="mt-5">
            <PracticeCheck
              check={propertySpecialistCheck}
              eyebrow="Property practice"
              nested
              onPassed={() => setPropertyPassed(true)}
            />
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-dashed border-surface-border p-5 text-sm text-ink-muted">
            In the real system, a current Market Ready credential would be a prerequisite. Here, passing the core practice check unlocks this preview only.
          </div>
        )}
      </section>

      {propertyPassed && (
        <section className="rounded-xl border border-status-good/30 bg-status-good/5 p-5 md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-status-good">Practice completed</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">You demonstrated the Property Specialist pattern</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
            This is a learning result, not a saved credential. A future backend authority must award a real Property Specialist status with the assessment version, evidence and currentness record.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/opportunities"
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              See what this could unlock
            </Link>
            <Link
              href="/community-profile"
              className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium text-ink-muted transition hover:border-brand/40 hover:text-ink"
            >
              View identity boundary
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

function PracticeCheck({
  check,
  eyebrow,
  nested = false,
  onPassed,
}: {
  check: ReadinessCheck;
  eyebrow: string;
  nested?: boolean;
  onPassed: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CheckResult>(null);

  const complete = useMemo(
    () => check.scenarios.every((scenario) => Boolean(answers[scenario.id])),
    [answers, check.scenarios]
  );

  function submit() {
    const nextResult = scoreCheck(check, answers);
    setResult(nextResult);
    if (nextResult.passed) onPassed();
  }

  function retry() {
    setAnswers({});
    setResult(null);
  }

  return (
    <div className={nested ? "space-y-5" : "rounded-xl border border-surface-border bg-surface-raised p-5 md:p-6"}>
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-brand">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold text-ink">{check.title}</h2>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          Choose how you would respond. The point is judgement and boundaries, not memorising a brochure.
        </p>
      </div>

      <div className="mt-5 space-y-5">
        {check.scenarios.map((scenario, index) => {
          const selectedId = answers[scenario.id];
          const selected = scenario.options.find((option) => option.id === selectedId);
          return (
            <div key={scenario.id} className="rounded-lg border border-surface-border bg-surface p-4 md:p-5">
              <div className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{scenario.title}</p>
                  <p className="mt-1 text-sm leading-6 text-ink-muted">{scenario.context}</p>
                  <p className="mt-3 text-sm font-medium text-ink">{scenario.question}</p>

                  <div className="mt-3 space-y-2">
                    {scenario.options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setAnswers((current) => ({ ...current, [scenario.id]: option.id }));
                          setResult(null);
                        }}
                        className={`w-full rounded-md border px-3 py-2.5 text-left text-sm transition ${
                          selectedId === option.id
                            ? "border-brand bg-brand/5 text-ink"
                            : "border-surface-border bg-surface-raised text-ink-muted hover:border-brand/30 hover:text-ink"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  {selected && (
                    <p className={`mt-3 text-xs leading-5 ${selected.correct ? "text-status-good" : "text-ink-muted"}`}>
                      {selected.feedback}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!complete}
          onClick={submit}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Check my practice result
        </button>
        {result && !result.passed && (
          <button
            type="button"
            onClick={retry}
            className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium text-ink-muted hover:border-brand/40 hover:text-ink"
          >
            Try again
          </button>
        )}
        {result && (
          <p className={`text-sm font-medium ${result.passed ? "text-status-good" : "text-status-warn"}`}>
            {result.score}/{result.total} · {result.passed ? `${check.credentialPreview} practice passed` : "Not yet — review the reasoning and retry"}
          </p>
        )}
      </div>

      {result?.passed && (
        <div className="mt-4 rounded-lg border border-status-good/25 bg-status-good/5 p-4">
          <p className="text-sm font-semibold text-ink">Practice result: {check.credentialPreview}</p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            No credential has been created, stored or attached to your KS Number. This result exists only in this review session.
          </p>
        </div>
      )}
    </div>
  );
}
