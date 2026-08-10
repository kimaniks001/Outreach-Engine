import { requireSection } from "@/lib/rbac/guard";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function IntelligencePage() {
  await requireSection("INTELLIGENCE");

  return (
    <EmptyState
      eyebrow="Intelligence"
      title="Market Intelligence arrives in Phase 2"
      description="This is where verified market signals, sourced claims, and opportunity scoring will live, each traceable back to its source with a confidence and verification state."
      bullets={[
        "Source provenance (source, timestamp, confidence, verification status)",
        "Opportunity scoring against SecurePay's five commercial pillars",
        "A conclusion-without-raw-source view for roles without source access",
      ]}
      phase="Phase 2 — Intelligence + Campaign + Creative"
    />
  );
}
