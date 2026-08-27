import { requireSection } from "@/lib/rbac/guard";
import { CommunityLiveExperience } from "@/components/community/CommunityLiveExperience";
import { resolveCommunityAuthorityConnection } from "@/lib/community/authority-connection";

export default async function CommunityLivePage() {
  const user = await requireSection("COMMUNITY_LIVE");
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
            ? "SecurePay Community authority bridge connected"
            : "Community LIVE is showing prototype content"}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          {authority.status === "CONNECTED"
            ? "Caller-scoped SecurePay identity is available. This UI slice still uses demo feed content until the live read adapter is wired into the page."
            : `${authority.reason}. No Community membership, moderation or feed authority is being invented locally.`}
        </p>
      </div>

      <CommunityLiveExperience currentUserName={user.name} />
    </div>
  );
}
