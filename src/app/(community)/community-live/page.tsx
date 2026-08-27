import { CommunityLiveExperience } from "@/components/community/CommunityLiveExperience";
import { CommunityMemberLiveExperience } from "@/components/community/CommunityMemberLiveExperience";
import { resolveCommunityAuthorityConnection } from "@/lib/community/authority-connection";
import { requireCommunityActor } from "@/lib/community/current-community-actor";

export default async function CommunityLivePage() {
  const actor = await requireCommunityActor();
  const authority = await resolveCommunityAuthorityConnection();

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          authority.status === "CONNECTED"
            ? "border-status-good/40 bg-status-good/10 text-ink"
            : "border-status-warn/40 bg-status-warn/10 text-ink"
        }`}
      >
        <p className="font-medium">
          {authority.status === "CONNECTED"
            ? "SecurePay identity connected"
            : "Community LIVE is showing prototype content"}
        </p>
        <p className="mt-1 text-xs leading-5 text-ink-muted">
          {authority.status === "CONNECTED"
            ? "Your caller-scoped SecurePay session is available. Live Community membership and feed reads remain off until the MW-07 backend authority is deployed and connected; the feed below is still clearly demo content."
            : `${authority.reason}. No Community membership, moderation, Plug, Master or financial authority is being invented locally.`}
        </p>
      </div>

      {actor.kind === "STAFF" ? (
        <CommunityLiveExperience currentUserName={actor.name} />
      ) : (
        <CommunityMemberLiveExperience currentUserName={actor.name} />
      )}
    </div>
  );
}
