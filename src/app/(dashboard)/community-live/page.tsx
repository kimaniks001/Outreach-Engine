import { requireSection } from "@/lib/rbac/guard";
import { CommunityLiveExperience } from "@/components/community/CommunityLiveExperience";

export default async function CommunityLivePage() {
  const user = await requireSection("COMMUNITY_LIVE");

  return (
    <div className="mx-auto max-w-7xl">
      <CommunityLiveExperience currentUserName={user.name} />
    </div>
  );
}
