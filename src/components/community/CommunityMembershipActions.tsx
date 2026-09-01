import { ActionButton } from "@/components/ui/ActionButton";
import type {
  CommunityMembershipPolicy,
  CommunityMembershipRole,
} from "@/lib/community/authority";

export function CommunityMembershipActions({
  communityId,
  membershipPolicy,
  membershipRole,
  joinRequestPending,
}: {
  communityId: string;
  membershipPolicy: CommunityMembershipPolicy;
  membershipRole: CommunityMembershipRole | null;
  joinRequestPending: boolean;
}) {
  const url = `/api/community/communities/${encodeURIComponent(communityId)}/membership`;

  if (membershipRole) {
    return (
      <ActionButton
        url={url}
        body={{ action: "LEAVE" }}
        label="Leave Community"
        pendingLabel="Leaving…"
        tone="neutral"
        confirmMessage="Leave this Community? Member-only posts will no longer be visible to you."
      />
    );
  }

  if (joinRequestPending) {
    return (
      <span className="rounded-md border border-status-warn/30 bg-status-warn/5 px-3 py-2 text-xs font-medium text-status-warn">
        Join request pending
      </span>
    );
  }

  const approvalRequired = membershipPolicy === "APPROVAL_REQUIRED";
  return (
    <ActionButton
      url={url}
      body={{ action: approvalRequired ? "REQUEST_JOIN" : "JOIN" }}
      label={approvalRequired ? "Request to join" : "Join Community"}
      pendingLabel={approvalRequired ? "Requesting…" : "Joining…"}
      tone="brand"
    />
  );
}
