import { requireSection } from "@/lib/rbac/guard";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function DistributionPage() {
  await requireSection("DISTRIBUTION");

  return (
    <EmptyState
      eyebrow="Distribution"
      title="Targeting and paid/direct distribution arrive in Phase 3"
      description="This is where paid-media planning and prospect/business distribution will live, once audience targeting exists. AI will never have unrestricted authority to launch spend here."
      bullets={[
        "Paid media planning across an adapter-based, provider-agnostic set of channels",
        "Prospect and business distribution shells for approved outreach",
        "Every spend increase requires explicit human approval",
      ]}
      phase="Phase 3 — Targeting + Distribution"
    />
  );
}
