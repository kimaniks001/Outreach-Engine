import { notFound } from "next/navigation";
import { circles } from "@/lib/community/foundation";
import { CircleExperience } from "@/components/community/CircleExperience";
import { requireCommunityActor } from "@/lib/community/current-community-actor";

export default async function CirclePage({ params }: { params: Promise<{ slug: string }> }) {
  await requireCommunityActor();
  const { slug } = await params;
  const circle = circles.find((item) => item.slug === slug);

  if (!circle) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="rounded-lg border border-status-warn/30 bg-status-warn/5 px-4 py-3 text-xs leading-5 text-ink-muted">
        Prototype Circle. Privacy actions below demonstrate the intended contract only; no Circle membership or content is persisted yet.
      </div>
      <CircleExperience circle={circle} />
    </div>
  );
}
