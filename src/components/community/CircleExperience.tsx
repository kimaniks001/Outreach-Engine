"use client";

import Link from "next/link";
import { useState } from "react";
import type { CircleSummary, MarketInsightCandidate } from "@/lib/community/foundation";

export function CircleExperience({ circle }: { circle: CircleSummary }) {
  const [shareState, setShareState] = useState<Record<number, boolean>>({});
  const [insight, setInsight] = useState<{ index: number; data: MarketInsightCandidate } | null>(null);
  const [submitted, setSubmitted] = useState<Record<number, boolean>>({});

  function insightFor(index: number): MarketInsightCandidate {
    const post = circle.posts[index];
    return {
      summary: post?.body ?? "Circle market pattern",
      anonymised: `${circle.name} · member identities removed · theme only`,
      teams: circle.slug.includes("property")
        ? ["Training", "Marketing", "Product", "Compliance"]
        : ["Training", "Marketing", "Product"],
    };
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-brand">Circle</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">{circle.name}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">{circle.about}</p>
      </header>

      <div className="rounded-xl border border-status-good/25 bg-status-good/5 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-status-good">
          {visibilityLabel(circle.visibility)} · {circle.members} members
        </p>
        <p className="mt-2 text-sm font-medium text-ink">Who can see this room</p>
        <p className="mt-1 text-sm leading-6 text-ink-muted">{circle.whoCanSee}</p>
        <p className="mt-3 text-xs leading-5 text-ink-faint">
          Nothing here becomes Community LIVE or organisational intelligence by default. Sharing and insight submission are separate deliberate actions.
        </p>
      </div>

      <section className="space-y-4">
        {circle.posts.map((post, index) => (
          <article key={`${post.author}-${post.when}-${index}`} className="rounded-xl border border-surface-border bg-surface-raised p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ink">{post.author}</p>
                <p className="mt-0.5 text-xs text-ink-faint">{post.kind} · {post.when}</p>
              </div>
              {submitted[index] ? (
                <span className="text-xs font-medium text-status-good">Insight submitted · demo</span>
              ) : shareState[index] ? (
                <span className="text-xs font-medium text-brand">Shared to LIVE · demo</span>
              ) : null}
            </div>
            <p className="mt-4 text-sm leading-6 text-ink-muted">{post.body}</p>

            <div className="mt-5 flex flex-wrap gap-2 border-t border-surface-border pt-4">
              <button
                type="button"
                onClick={() => setShareState((current) => ({ ...current, [index]: true }))}
                disabled={Boolean(shareState[index])}
                className="rounded-md border border-brand/40 px-3 py-2 text-xs font-medium text-brand disabled:opacity-50"
              >
                {shareState[index] ? "Shared with Community LIVE · demo" : "Share with Community LIVE"}
              </button>
              <button
                type="button"
                onClick={() => setInsight({ index, data: insightFor(index) })}
                disabled={Boolean(submitted[index])}
                className="rounded-md border border-status-good/40 px-3 py-2 text-xs font-medium text-status-good disabled:opacity-50"
              >
                {submitted[index] ? "Market insight submitted · demo" : "Submit as market insight"}
              </button>
            </div>
          </article>
        ))}
      </section>

      <div className="flex flex-wrap gap-4">
        <Link href="/circles" className="text-sm font-medium text-brand hover:underline">← All Circles</Link>
        <Link href="/community-live" className="text-sm font-medium text-brand hover:underline">Community LIVE →</Link>
      </div>

      {insight ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-xl rounded-xl border border-surface-border bg-surface-raised p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-status-good">Deliberate consent</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">Submit this as market insight?</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              This does not publish the Circle conversation. It prepares a separate anonymised organisational signal.
            </p>
            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-ink-faint">Issue</dt>
                <dd className="mt-1 text-ink-muted">{insight.data.summary}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-ink-faint">What would be shared</dt>
                <dd className="mt-1 rounded-lg bg-surface p-3 text-ink">{insight.data.anonymised}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-ink-faint">Receiving teams</dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {insight.data.teams.map((team) => (
                    <span key={team} className="rounded-full border border-surface-border px-2.5 py-1 text-xs text-ink-muted">{team}</span>
                  ))}
                </dd>
              </div>
            </dl>
            <p className="mt-5 text-xs leading-5 text-ink-faint">Prototype only. No backend submission occurs in this slice.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setInsight(null)} className="rounded-md border border-surface-border px-4 py-2 text-sm text-ink-muted">Keep private</button>
              <button
                type="button"
                onClick={() => {
                  setSubmitted((current) => ({ ...current, [insight.index]: true }));
                  setInsight(null);
                }}
                className="rounded-md bg-status-good px-4 py-2 text-sm font-medium text-black"
              >
                Confirm demo submission
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function visibilityLabel(value: CircleSummary["visibility"]): string {
  if (value === "PRIVATE") return "Private";
  if (value === "INVITE_ONLY") return "Invite only";
  return "Open to network";
}
