"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  circles,
  communityPosts,
  communityPrinciples,
  gospel,
  liveRooms,
  peopleToKnow,
  stories,
  type CommunityLens,
  type CommunityPost,
} from "@/lib/community/foundation";
import { Card } from "@/components/ui/Card";

const lensCopy: Record<CommunityLens, { title: string; body: string }> = {
  PLUG: {
    title: "Your people are here.",
    body: "See what the market is talking about, learn from people doing the work, celebrate one another and take a little office energy back into your own space.",
  },
  MASTER: {
    title: "Your territory is talking.",
    body: "Notice the questions repeating across Plugs, support people without hovering over them, and help useful knowledge travel across the market.",
  },
  STAFF: {
    title: "Stay close to the market.",
    body: "Listen to the people carrying SecurePay into real relationships. Community conversation is human space; only deliberately submitted insight becomes organisational input.",
  },
  BOARD: {
    title: "Community is not a Board operating surface.",
    body: "Board oversight should receive governed, aggregated reporting rather than private or social conversation. This preview explains the boundary only.",
  },
};

export function CommunityLiveExperience({ currentUserName }: { currentUserName: string }) {
  const [lens, setLens] = useState<CommunityLens>("PLUG");
  const [reactionState, setReactionState] = useState<Record<string, string>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [pollState, setPollState] = useState<Record<string, string>>({});
  const [insightPost, setInsightPost] = useState<CommunityPost | null>(null);
  const [submittedInsights, setSubmittedInsights] = useState<Record<string, boolean>>({});

  const visiblePosts = useMemo(() => communityPosts, []);
  const copy = lensCopy[lens];

  if (lens === "BOARD") {
    return (
      <div className="space-y-6">
        <LensSwitcher lens={lens} setLens={setLens} />
        <Card title="Community LIVE boundary">
          <p className="text-lg font-semibold text-ink">{copy.title}</p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">{copy.body}</p>
          <div className="mt-5 rounded-lg border border-surface-border bg-surface p-4 text-sm text-ink-muted">
            The future Board view should receive governed summaries such as community health, readiness,
            recurring market themes, major incidents and policy questions. It should not expose Circle posts,
            private comments or personal social activity.
          </div>
          <Link href="/today" className="mt-5 inline-block text-sm font-medium text-brand hover:underline">
            Return to governed Outreach views →
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <LensSwitcher lens={lens} setLens={setLens} />

      <section className="rounded-xl border border-surface-border bg-gradient-to-br from-[#102b25] via-surface-raised to-surface-raised p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-widest text-status-good">Community LIVE</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">{copy.title}</h1>
            <p className="mt-3 text-sm leading-6 text-ink-muted">{copy.body}</p>
            <p className="mt-4 text-sm font-medium text-ink">{communityPrinciples.line}</p>
          </div>
          <div className="rounded-full border border-status-good/30 bg-status-good/10 px-3 py-1.5 text-xs font-medium text-status-good">
            Prototype social layer · no live publishing
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Stories</p>
            <h2 className="mt-1 text-lg font-semibold text-ink">Small moments from around the market</h2>
          </div>
          <Link href="/community-profile" className="text-sm font-medium text-brand hover:underline">
            Community profile →
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stories.map((story) => (
            <article
              key={`${story.name}-${story.caption}`}
              className="min-w-[185px] rounded-xl border border-surface-border bg-surface-raised p-4"
            >
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
          {visiblePosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              reacted={reactionState[post.id]}
              commentsOpen={Boolean(openComments[post.id])}
              pollChoice={pollState[post.id]}
              submittedInsight={Boolean(submittedInsights[post.id])}
              onReact={(label) => setReactionState((current) => ({ ...current, [post.id]: label }))}
              onToggleComments={() =>
                setOpenComments((current) => ({ ...current, [post.id]: !current[post.id] }))
              }
              onPoll={(choice) => setPollState((current) => ({ ...current, [post.id]: choice }))}
              onInsight={() => setInsightPost(post)}
            />
          ))}
        </section>

        <aside className="space-y-5">
          <Card title="LIVE rooms">
            <div className="space-y-3">
              {liveRooms.map((room) => (
                <div key={room.title} className="rounded-lg border border-surface-border bg-surface p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`text-[11px] font-semibold uppercase tracking-wider ${
                        room.state === "LIVE" ? "text-status-bad" : "text-ink-faint"
                      }`}
                    >
                      {room.state === "LIVE" ? "LIVE · demo" : room.when}
                    </span>
                    <span className="text-[11px] text-ink-faint">{room.note}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-ink">{room.title}</p>
                  <p className="mt-1 text-xs text-ink-muted">Hosted by {room.host}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="Your circles"
            action={
              <Link href="/circles" className="text-xs font-medium text-brand hover:underline">
                See all
              </Link>
            }
          >
            <div className="space-y-3">
              {circles.slice(0, 4).map((circle) => (
                <Link
                  key={circle.slug}
                  href={`/circles/${circle.slug}`}
                  className="block rounded-lg border border-surface-border bg-surface p-3 transition hover:border-brand/40"
                >
                  <p className="text-sm font-semibold text-ink">{circle.name}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {circle.members} members · {visibilityLabel(circle.visibility)}
                  </p>
                </Link>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-ink-faint">{communityPrinciples.circleBoundary}</p>
          </Card>

          <Card title="The Gospel">
            <div className="space-y-4">
              {gospel.map((item) => (
                <div key={item.title}>
                  <p className="text-sm font-semibold text-ink">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">{item.body}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card title="People to know">
            <div className="space-y-4">
              {peopleToKnow.map((person) => (
                <div key={person.name} className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
                    {initials(person.name)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink">{person.name}</p>
                    <p className="text-xs text-ink-muted">{person.credential} · {person.place}</p>
                    <p className="mt-1 text-xs leading-5 text-ink-faint">Known for {person.knownFor.toLowerCase()}.</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="rounded-lg border border-brand/20 bg-brand/5 p-4 text-xs leading-5 text-ink-muted">
            Signed in as <span className="font-medium text-ink">{currentUserName}</span>. The lens switcher above
            is for product review only; it does not change your real RBAC role or permissions.
          </div>

          <div className="rounded-lg border border-surface-border bg-surface-raised p-4 text-xs leading-5 text-ink-muted">
            {communityPrinciples.moneyBoundary}
          </div>
        </aside>
      </div>

      {insightPost?.insight ? (
        <InsightConsentDialog
          post={insightPost}
          onCancel={() => setInsightPost(null)}
          onConfirm={() => {
            setSubmittedInsights((current) => ({ ...current, [insightPost.id]: true }));
            setInsightPost(null);
          }}
        />
      ) : null}
    </div>
  );
}

function LensSwitcher({
  lens,
  setLens,
}: {
  lens: CommunityLens;
  setLens: (lens: CommunityLens) => void;
}) {
  const lenses: CommunityLens[] = ["PLUG", "MASTER", "STAFF", "BOARD"];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-raised p-3">
      <div>
        <p className="text-xs font-medium text-ink">Preview lens</p>
        <p className="text-[11px] text-ink-faint">Prototype only — this does not change permissions.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {lenses.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setLens(item)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              lens === item
                ? "border-brand bg-brand/15 text-brand"
                : "border-surface-border text-ink-muted hover:text-ink"
            }`}
          >
            {item === "PLUG" ? "Plug" : item === "MASTER" ? "Master" : item === "STAFF" ? "Staff" : "Board"}
          </button>
        ))}
      </div>
    </div>
  );
}

function PostCard({
  post,
  reacted,
  commentsOpen,
  pollChoice,
  submittedInsight,
  onReact,
  onToggleComments,
  onPoll,
  onInsight,
}: {
  post: CommunityPost;
  reacted?: string;
  commentsOpen: boolean;
  pollChoice?: string;
  submittedInsight: boolean;
  onReact: (label: string) => void;
  onToggleComments: () => void;
  onPoll: (choice: string) => void;
  onInsight: () => void;
}) {
  return (
    <article className="rounded-xl border border-surface-border bg-surface-raised p-5">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            post.author.official ? "bg-status-good/15 text-status-good" : "bg-brand/10 text-brand"
          }`}
        >
          {initials(post.author.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="text-sm font-semibold text-ink">{post.author.name}</p>
            <p className="text-xs text-ink-faint">{post.author.role} · {post.author.place} · {post.when}</p>
          </div>
          {post.circle ? (
            <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-brand">From {post.circle}</p>
          ) : null}
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-ink-muted">{post.body}</p>

      {post.media ? (
        <div className="mt-4 rounded-lg border border-dashed border-surface-border bg-surface p-4 text-xs text-ink-faint">
          {post.media}
        </div>
      ) : null}

      {post.poll ? (
        <div className="mt-4 space-y-2">
          {post.poll.map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => onPoll(choice)}
              className={`block w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                pollChoice === choice
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-surface-border bg-surface text-ink-muted hover:text-ink"
              }`}
            >
              {choice}
            </button>
          ))}
          {pollChoice ? <p className="text-[11px] text-ink-faint">Your demo vote: {pollChoice}</p> : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-surface-border pt-4">
        {post.reactions.map((reaction) => (
          <button
            key={reaction.label}
            type="button"
            onClick={() => onReact(reaction.label)}
            className={`rounded-full border px-2.5 py-1 text-xs transition ${
              reacted === reaction.label
                ? "border-brand bg-brand/10 text-brand"
                : "border-surface-border text-ink-muted hover:text-ink"
            }`}
          >
            {reaction.label} · {reaction.count + (reacted === reaction.label ? 1 : 0)}
          </button>
        ))}
        <button type="button" onClick={onToggleComments} className="px-2 py-1 text-xs text-ink-faint hover:text-ink">
          {commentsOpen ? "Hide replies" : `Replies · ${post.comments.length}`}
        </button>
        {post.insight ? (
          <button
            type="button"
            onClick={onInsight}
            disabled={submittedInsight}
            className="ml-auto rounded-full border border-status-good/30 px-2.5 py-1 text-xs font-medium text-status-good disabled:opacity-50"
          >
            {submittedInsight ? "Insight submitted · demo" : "Submit as market insight"}
          </button>
        ) : null}
      </div>

      {commentsOpen && post.comments.length > 0 ? (
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
  );
}

function InsightConsentDialog({
  post,
  onCancel,
  onConfirm,
}: {
  post: CommunityPost;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const insight = post.insight!;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded-xl border border-surface-border bg-surface-raised p-6 shadow-2xl">
        <p className="text-xs font-medium uppercase tracking-widest text-status-good">Consent preview</p>
        <h2 className="mt-2 text-xl font-semibold text-ink">Submit as market insight?</h2>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          This is different from sharing a post with Community LIVE. The prototype will only show what would be
          sent after deliberate confirmation.
        </p>

        <dl className="mt-5 space-y-4 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-ink-faint">Issue</dt>
            <dd className="mt-1 text-ink-muted">{insight.summary}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-ink-faint">What leaves the community</dt>
            <dd className="mt-1 rounded-lg bg-surface p-3 text-ink">{insight.anonymised}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-ink-faint">Receives the insight</dt>
            <dd className="mt-2 flex flex-wrap gap-2">
              {insight.teams.map((team) => (
                <span key={team} className="rounded-full border border-surface-border px-2.5 py-1 text-xs text-ink-muted">
                  {team}
                </span>
              ))}
            </dd>
          </div>
        </dl>

        <p className="mt-5 text-xs leading-5 text-ink-faint">
          Prototype only: confirming below changes local UI state. No backend submission or customer-data transfer occurs.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-md border border-surface-border px-4 py-2 text-sm text-ink-muted">
            Keep it here
          </button>
          <button type="button" onClick={onConfirm} className="rounded-md bg-status-good px-4 py-2 text-sm font-medium text-black">
            Confirm demo submission
          </button>
        </div>
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

function visibilityLabel(value: "PRIVATE" | "INVITE_ONLY" | "OPEN_TO_NETWORK"): string {
  if (value === "PRIVATE") return "Private";
  if (value === "INVITE_ONLY") return "Invite only";
  return "Open to network";
}
