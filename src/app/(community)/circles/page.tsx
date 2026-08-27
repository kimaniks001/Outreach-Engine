import { CirclesDirectory } from "@/components/community/CirclesDirectory";
import { requireCommunityActor } from "@/lib/community/current-community-actor";

export default async function CirclesPage() {
  await requireCommunityActor();

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 rounded-lg border border-status-warn/30 bg-status-warn/5 px-4 py-3 text-xs leading-5 text-ink-muted">
        Circle rooms remain prototype-only until a dedicated Circle backend authority exists. They are not being mapped onto MW-07 Communities.
      </div>
      <CirclesDirectory />
    </div>
  );
}
