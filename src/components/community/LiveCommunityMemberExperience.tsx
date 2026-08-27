import Link from "next/link";
import type { LiveCommunitySnapshot } from "@/lib/community/live-snapshot";
import { communityPrinciples } from "@/lib/community/foundation";

export function LiveCommunityMemberExperience({
  memberName,
  snapshot,
}: {
  memberName: string;
  snapshot: LiveCommunitySnapshot;
}) {
  const totalPosts = snapshot.communities.reduce((sum, item) => sum + item.feed.length, 0);

  return (
    <div className="space-y-7">
      <section className="rounded-xl border border-status-good/30 bg-gradient-to-br from-[#102b25] via-surface-raised to-surface-raised p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-status-good">Community LIVE</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Your people are here.</h1>
            <p className="mt-3 text-sm leading-6 text-ink-muted">
              Signed in as <span className="font-medium text-ink">{memberName}</span>. Everything shown in this live section was returned through your own SecurePay session and remains subject to SecurePay Community visibility rules.
            </p>
            <p className="mt-4 text-sm font-medium text-ink">{communityPrinciples.line}</p>
          </div>
          <div className="rounded-full border border-status-good/30 bg-status-good/10 px-3 py-1.5 text-xs font-semibold text-status-good">
            SecurePay Community authority · live read
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Metric label="Communities visible to you" value={snapshot.communities.length} />
        <Metric label="Authorized feed posts" value={totalPosts} />
        <Metric label="Pending join requests" value={snapshot.pendingJoinRequests.length} />
      </section>

      {snapshot.pendingJoinRequests.length > 0 ? (
        <section className="rounded-xl border border-surface-border bg-surface-raised p-5">
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Waiting rooms</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Join requests awaiting a decision</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {snapshot.pendingJoinRequests.map((request) => (
              <div key={request.id} className="rounded-lg border border-surface-border bg-surface p-3">
                <p className="text-sm font-medium text-ink">Community request pending</p>
                <p className="mt-1 text-xs text-ink-faint">Requested {formatDateTime(request.requestedAt)}</p>
                <p className="mt-2 text-xs leading-5 text-ink-muted">
                  SecurePay is keeping the request pending until the Community&apos;s authorized moderator or organiser decides it.
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Your Community LIVE</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">What your Communities are saying</h2>
          </div>
          <p className="max-w-xl text-right text-xs leading-5 text-ink-faint">
            Author names are not guessed here. MW-07 exposes author identity IDs, not profile/contact details, so this view deliberately says “Community member” until an authorized profile projection exists.
          </p>
        </div>

        {snapshot.communities.length === 0 ? (
          <div className="rounded-xl border border-surface-border bg-surface-raised p-8 text-center">
            <p className="text-lg font-semibold text-ink">No Communities are visible yet.</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink-muted">
              This is a valid live result. Outreach will not manufacture a Community or membership just to make the screen look busy.
            </p>
          </div>
        ) : (
          snapshot.communities.map(({ community, membership, feed }) => (
            <article key={community.id} className="rounded-xl border border-surface-border bg-surface-raised p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-ink">{community.name}</h3>
                    <span className="rounded-full border border-surface-border px-2.5 py-1 text-[11px] font-medium text-ink-muted">
                      {community.visibility === "PRIVATE" ? "Private" : "Public"}
                    </span>
                    {membership ? (
                      <span className="rounded-full border border-status-good/30 bg-status-good/10 px-2.5 py-1 text-[11px] font-medium text-status-good">
                        {membership.role === "MEMBER" ? "Member" : titleCase(membership.role)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">{community.description}</p>
                  <p className="mt-2 text-xs text-ink-faint">
                    {community.memberCount} members · {community.membershipPolicy === "OPEN" ? "Open membership" : "Approval required"}
                  </p>
                </div>
                <span className="text-xs text-ink-faint">{feed.length} visible post{feed.length === 1 ? "" : "s"}</span>
              </div>

              {community.rules ? (
                <details className="mt-4 rounded-lg border border-surface-border bg-surface px-3 py-2">
                  <summary className="cursor-pointer text-xs font-medium text-ink-muted">Community rules</summary>
                  <p className="mt-2 text-xs leading-5 text-ink-faint">{community.rules}</p>
                </details>
              ) : null}

              <div className="mt-5 space-y-3">
                {feed.length === 0 ? (
                  <p className="rounded-lg bg-surface p-4 text-sm text-ink-faint">No published posts are visible to you in this Community.</p>
                ) : (
                  feed.map((post) => (
                    <div key={post.id} className="rounded-lg border border-surface-border bg-surface p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-brand">Community member</p>
                          <h4 className="mt-1 text-sm font-semibold text-ink">{post.title}</h4>
                        </div>
                        <div className="text-right text-[11px] text-ink-faint">
                          <p>{post.visibility === "MEMBER" ? "Members only" : "Public post"}</p>
                          <p className="mt-1">{formatDateTime(post.publishedAt)}</p>
                        </div>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-muted">{post.body}</p>
                    </div>
                  ))
                )}
              </div>
            </article>
          ))
        )}
      </section>

      <section className="rounded-xl border border-brand/20 bg-brand/5 p-5">
        <p className="text-sm font-semibold text-ink">The richer social layer is still being connected.</p>
        <p className="mt-2 text-xs leading-5 text-ink-muted">
          Stories, reactions, voice/video moments, LIVE rooms, accolades and Circles are not part of MW-07 Community authority. They remain separate product work rather than being falsely represented as live backend features.
        </p>
        <div className="mt-4 flex flex-wrap gap-4">
          <Link href="/circles" className="text-sm font-medium text-brand hover:underline">Explore the Circles prototype →</Link>
          <Link href="/community-profile" className="text-sm font-medium text-brand hover:underline">Community identity prototype →</Link>
        </div>
      </section>

      <p className="text-xs leading-5 text-ink-faint">{communityPrinciples.moneyBoundary}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-4">
      <p className="text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink-muted">{label}</p>
    </div>
  );
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/(^|_)([a-z])/g, (_, prefix, letter: string) => `${prefix ? " " : ""}${letter.toUpperCase()}`);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  }).format(date);
}
