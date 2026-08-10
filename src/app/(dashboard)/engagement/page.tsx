import { requireSection } from "@/lib/rbac/guard";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function EngagementPage() {
  await requireSection("ENGAGEMENT");

  return (
    <EmptyState
      eyebrow="Engagement"
      title="Your engagement workspace is being built"
      description="This is where the content calendar, engagement queue, and approved AI response suggestions will appear for review and action, once Phase 2 content tooling exists."
      bullets={[
        "Content calendar and drafts awaiting approval",
        "Engagement queue for inbound responses",
        "Basic performance metrics for assigned work",
      ]}
      phase="Phase 2 — Intelligence + Campaign + Creative"
    />
  );
}
