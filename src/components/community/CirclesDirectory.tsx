"use client";

import Link from "next/link";
import { useState } from "react";
import { circles, communityPrinciples } from "@/lib/community/foundation";

export function CirclesDirectory() {
  const [membership, setMembership] = useState<Record<string, "JOINED" | "REQUESTED" | "MUTED">>({
    "ruiru-hardware": "JOINED",
    "new-plugs": "JOINED",
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-brand">Circles</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">Your smaller rooms inside Community LIVE</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
          Community LIVE is the town square. Circles are the rooms where membership and visibility mean
          something. They are designed for belonging, not surveillance.
        </p>
      </header>

      <div className="rounded-lg border border-status-good/20 bg-status-good/5 p-4 text-sm leading-6 text-ink-muted">
        <span className="font-medium text-ink">Sacred boundary:</span> {communityPrinciples.circleBoundary}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {circles.map((circle) => {
          const state = membership[circle.slug];
          return (
            <article key={circle.slug} className="rounded-xl border border-surface-border bg-surface-raised p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">
                    {visibilityLabel(circle.visibility)}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-ink">{circle.name}</h2>
                  <p className="mt-1 text-xs text-ink-faint">{circle.members} members</p>
                </div>
                {state ? (
                  <span className="rounded-full border border-brand/30 bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">
                    {state === "JOINED" ? "Member" : state === "REQUESTED" ? "Request sent · demo" : "Muted · demo"}
                  </span>
                ) : null}
              </div>

              <p className="mt-4 text-sm leading-6 text-ink-muted">{circle.about}</p>
              <div className="mt-4 rounded-lg bg-surface p-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">Who can see this Circle</p>
                <p className="mt-1 text-xs leading-5 text-ink-muted">{circle.whoCanSee}</p>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href={`/circles/${circle.slug}`}
                  className="rounded-md bg-brand px-3 py-2 text-xs font-medium text-white transition hover:bg-brand-muted"
                >
                  Open Circle
                </Link>
                {!state ? (
                  <button
                    type="button"
                    onClick={() =>
                      setMembership((current) => ({
                        ...current,
                        [circle.slug]: circle.visibility === "OPEN_TO_NETWORK" ? "JOINED" : "REQUESTED",
                      }))
                    }
                    className="rounded-md border border-surface-border px-3 py-2 text-xs font-medium text-ink-muted hover:text-ink"
                  >
                    {circle.visibility === "OPEN_TO_NETWORK" ? "Join · demo" : "Request access · demo"}
                  </button>
                ) : null}
                {state === "JOINED" ? (
                  <button
                    type="button"
                    onClick={() => setMembership((current) => ({ ...current, [circle.slug]: "MUTED" }))}
                    className="rounded-md border border-surface-border px-3 py-2 text-xs text-ink-muted hover:text-ink"
                  >
                    Mute · demo
                  </button>
                ) : null}
                {state === "MUTED" ? (
                  <button
                    type="button"
                    onClick={() => setMembership((current) => ({ ...current, [circle.slug]: "JOINED" }))}
                    className="rounded-md border border-surface-border px-3 py-2 text-xs text-ink-muted hover:text-ink"
                  >
                    Unmute · demo
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/community-live" className="text-sm font-medium text-brand hover:underline">
          ← Back to Community LIVE
        </Link>
        <Link href="/community-profile" className="text-sm font-medium text-brand hover:underline">
          See your community identity →
        </Link>
      </div>
    </div>
  );
}

function visibilityLabel(value: "PRIVATE" | "INVITE_ONLY" | "OPEN_TO_NETWORK"): string {
  if (value === "PRIVATE") return "Private";
  if (value === "INVITE_ONLY") return "Invite only";
  return "Open to network";
}
