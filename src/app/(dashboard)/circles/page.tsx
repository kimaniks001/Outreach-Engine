import { requireSection } from "@/lib/rbac/guard";
import { CirclesDirectory } from "@/components/community/CirclesDirectory";

export default async function CirclesPage() {
  await requireSection("COMMUNITY_LIVE");

  return (
    <div className="mx-auto max-w-6xl">
      <CirclesDirectory />
    </div>
  );
}
