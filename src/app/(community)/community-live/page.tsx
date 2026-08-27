import { redirect } from "next/navigation";
import { CommunityLiveExperience } from "@/components/community/CommunityLiveExperience";
import { CommunityMemberLiveExperience } from "@/components/community/CommunityMemberLiveExperience";
import { LiveCommunityMemberExperience } from "@/components/community/LiveCommunityMemberExperience";
import { CommunityAuthorityError } from "@/lib/community/authority";
import { resolveCommunityAuthorityConnection } from "@/lib/community/authority-connection";
import { requireCommunityActor } from "@/lib/community/current-community-actor";
import { loadLiveCommunitySnapshot } from "@/lib/community/live-snapshot";

export default async function CommunityLivePage() {
  const actor = await requireCommunityActor();

  // Staff retain the rich post-roadmap product-review surface. Staff RBAC is
  // independent of SecurePay market identity and must not be silently mapped
  // to Community membership or Plug/Master status.
  if (actor.kind === "STAFF") {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <BoundaryBanner
          title="Staff Community LIVE preview"
          body="This is the product-review surface for eligible Outreach staff. Persona lenses remain prototype-only and do not change staff RBAC or create SecurePay Community authority."
          good={false}
        />
        <CommunityLiveExperience currentUserName={actor.name} />
      </div>
    );
  }

  const authority = await resolveCommunityAuthorityConnection();
  if (authority.status !== "CONNECTED") {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <BoundaryBanner
          title="Community LIVE is showing prototype content"
          body={`${authority.reason}. Your SecurePay sign-in is not being converted into local membership, moderator, Plug, Master or financial authority.`}
          good={false}
        />
        <CommunityMemberLiveExperience currentUserName={actor.name} />
      </div>
    );
  }

  try {
    const snapshot = await loadLiveCommunitySnapshot(authority.client);
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <LiveCommunityMemberExperience memberName={actor.name} snapshot={snapshot} />
      </div>
    );
  } catch (error) {
    if (error instanceof CommunityAuthorityError && error.code === "UNAUTHENTICATED") {
      redirect("/api/securepay-auth/restore?next=/community-live");
    }

    const reason =
      error instanceof CommunityAuthorityError
        ? "SecurePay Community authority is not available for live reading in this environment yet."
        : "Community LIVE could not load its live Community view.";

    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <BoundaryBanner
          title="Live Community feed unavailable"
          body={`${reason} The fallback below is clearly demo content; no Community authority is inferred locally.`}
          good={false}
        />
        <CommunityMemberLiveExperience currentUserName={actor.name} />
      </div>
    );
  }
}

function BoundaryBanner({ title, body, good }: { title: string; body: string; good: boolean }) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        good
          ? "border-status-good/40 bg-status-good/10 text-ink"
          : "border-status-warn/40 bg-status-warn/10 text-ink"
      }`}
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{body}</p>
    </div>
  );
}
