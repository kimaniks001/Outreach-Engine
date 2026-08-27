"use client";

import Link from "next/link";
import { useState } from "react";
import {
  circles,
  communityPosts,
  communityPrinciples,
  gospel,
  liveRooms,
  stories,
} from "@/lib/community/foundation";

export function CommunityMemberLiveExperience({ currentUserName }: { currentUserName: string }) {
  const [reactionState, setReactionState] = useState<Record<string, string>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [pollState, setPollState] = useState<Record<string, string>>({});

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-surface-border bg-gradient-to-br from-[#102b25] via-surface-raised to-surface-raised p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-status-good">Community LIVE</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">Your people are here.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">
          Listen, learn, laugh, ask a question and stay close to the people carrying SecurePay into the market. You are signed in as {currentUserName}.
        </p>
        <p className="mt-4 text-sm font-medium text-ink">{communityPrinciples.line}</p>
        <div className="mt-5 rounded-lg border border-status-warn/30 bg-status-warn/5 px-4 py-3 text-xs leading-5 text-ink-muted">
          The social content below is prototype content until the deployed MW-07 Community feed is connected. Your SecurePay identity is real; no Plug, Master, specialist, moderator or organiser status is inferred here.
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Stories</p>
            <h2 className="mt-1 text-lg font-semibold text-ink">Small moments from around the market</h2>
          </div>
          <Link href="/community-profile" className="text-sm font-medium text-brand hover:underline">My community identity →</Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stories.map((story) => (
            <article key={`${story.name}-${story.caption}`} className="min-w-[185px] rounded-xl border border-surface-border bg-surface-raised p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-brand/30 bg-brand/10 text-sm font-semibold text-brand">
                {initials(story.name)}
              </div>
              <p className="mt-3 text-sm font-semibold text-ink">{story.name}</p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">{story.caption}</p>
              <p className="mt-2 text-[11px] uppercase tracking-wider text-ink-faint">{story.type} · demo</p>
            </article>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.55fr_0.85fr]">
        <section className="space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">The feed</p>
            <h2 className="mt-1 text-lg font-semibold text-ink">What your people are saying</h2>
          </div>

          {communityPosts.map((post) => (
            <article key={post.id} className="rounded-xl border border-surface-border bg-surface-raised p-5">
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${post.author.official ? "bg-status-good/15 text-status-good" : "bg-brand/10 text-brand"}`}>
                  {initials(post.author.name)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">{post.author.name}</p>
                  <p className="text-xs text-ink-faint">{post.author.role} · {post.author.place} · {post.when}</p>
                </div>
              </div>

              <p className="mt-4 text-sm leading-6 text-ink-muted">{post.body}</p>
              {post.media ? <div className="mt-4 rounded-lg border border-dashed border-surface-border bg-surface p-4 text-xs text-ink-faint">{post.media}</div> : null}

              {post.poll ? (
                <div className="mt-4 space-y-2">
                  {post.poll.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => setPollState((current) => ({ ...current, [post.id]: choice }))}
                      className={`block w-full rounded-lg border px-3 py-2 text-left text-xs transition ${pollState[post.id] === choice ? "border-brand bg-brand/10 text-brand" : "border-surface-border bg-surface text-ink-muted hover:text-ink"}`}
                    >
                      {choice}
                    </button>
                  ))}
                  {pollState[post.id] ? <p className="text-[11px] text-ink-faint">Demo vote only · {pollState[post.id]}</p> : null}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-surface-border pt-4">
                {post.reactions.map((reaction) => (
                  <button
                    key={reaction.label}
                    type="button"
                    onClick={() => setReactionState((current) => ({ ...current, [post.id]: reaction.label }))}
                    className={`rounded-full border px-2.5 py-1 text-xs transition ${reactionState[post.id] === reaction.label ? "border-brand bg-brand/10 text-brand" : "border-surface-border text-ink-muted hover:text-ink"}`}
                  >
                    {reaction.label} · {reaction.count + (reactionState[post.id] === reaction.label ? 1 : 0)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setOpenComments((current) => ({ ...current, [post.id]: !current[post.id] }))}
                  className="px-2 py-1 text-xs text-ink-faint hover:text-ink"
                >
                  {openComments[post.id] ? "Hide replies" : `Replies · ${post.comments.length}`}
                </button>
              </div>

              {openComments[post.id] && post.comments.length > 0 ? (
                <div className="mt-4 space-y-3 rounded-lg bg-surface p-3">
                  {post.comments.map((comment, index) => (
                    <div key={`${comment.name}-${index}`}>
                      <p className="text-xs font-semibold text-ink">{comment.name}</p>
                      <p className="mt-1 text-xs leading-5 text-ink-muted">{comment.body}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </section>

        <aside className="space-y-5">
          <section className="rounded-lg border border-surface-border bg-surface-raised p-5">
            <h2 className="text-sm font-semibold text-ink">LIVE rooms</h2>
            <div className="mt-4 space-y-3">
              {liveRooms.map((room) => (
                <div key={room.title} className="rounded-lg border border-surface-border bg-surface p-3">
                  <p className={`text-[11px] font-semibold uppercase tracking-wider ${room.state === "LIVE" ? "text-status-bad" : "text-ink-faint"}`}>
                    {room.state === "LIVE" ? "LIVE · demo" : room.when}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-ink">{room.title}</p>
                  <p className="mt-1 text-xs text-ink-muted">Hosted by {room.host}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-surface-border bg-surface-raised p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">Circles</h2>
              <Link href="/circles" className="text-xs font-medium text-brand hover:underline">See all</Link>
            </div>
            <div className="mt-4 space-y-3">
              {circles.slice(0, 4).map((circle) => (
                <Link key={circle.slug} href={`/circles/${circle.slug}`} className="block rounded-lg border border-surface-border bg-surface p-3 transition hover:border-brand/40">
                  <p className="text-sm font-semibold text-ink">{circle.name}</p>
                  <p className="mt-1 text-xs text-ink-muted">{circle.members} members · demo</p>
                </Link>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-ink-faint">{communityPrinciples.circleBoundary}</p>
          </section>

          <section className="rounded-lg border border-surface-border bg-surface-raised p-5">
            <h2 className="text-sm font-semibold text-ink">The Gospel</h2>
            <div className="mt-4 space-y-4">
              {gospel.map((item) => (
                <div key={item.title}>
                  <p className="text-sm font-semibold text-ink">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">{item.body}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="rounded-lg border border-surface-border bg-surface-raised p-4 text-xs leading-5 text-ink-muted">
            {communityPrinciples.moneyBoundary}
          </div>
        </aside>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
