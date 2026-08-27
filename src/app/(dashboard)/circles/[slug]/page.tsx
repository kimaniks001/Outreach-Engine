import { notFound } from "next/navigation";
import { requireSection } from "@/lib/rbac/guard";
import { circles } from "@/lib/community/foundation";
import { CircleExperience } from "@/components/community/CircleExperience";

export default async function CirclePage({ params }: { params: Promise<{ slug: string }> }) {
  await requireSection("COMMUNITY_LIVE");
  const { slug } = await params;
  const circle = circles.find((item) => item.slug === slug);

  if (!circle) notFound();

  return (
    <div className="mx-auto max-w-5xl">
      <CircleExperience circle={circle} />
    </div>
  );
}
