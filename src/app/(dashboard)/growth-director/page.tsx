import { requireSection } from "@/lib/rbac/guard";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function GrowthDirectorPage() {
  await requireSection("GROWTH_DIRECTOR");

  return (
    <EmptyState
      eyebrow="Growth Director"
      title="Growth Director supervises the five pillars"
      description="Growth Director is not a sixth pillar — it is the supervising intelligence layer that reasons across Marketing, Positioning, Distribution, Impact, and Action to answer: what should SecurePay do next, and why? It becomes active once those five pillars are producing enough evidence to reason over."
      bullets={[
        "Draws on market intelligence, campaign results, distribution performance, and impact data",
        "Recommends — humans approve every consequential action",
        "Activates in Phase 5, once the pillars it supervises exist",
      ]}
      phase="Phase 5 — Impact + Growth Director + Scale"
    />
  );
}
