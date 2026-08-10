import { requireSection } from "@/lib/rbac/guard";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function ImpactPage() {
  await requireSection("IMPACT");

  return (
    <EmptyState
      eyebrow="Impact"
      title="Conversion and impact analytics arrive after product event integration"
      description="This is where registrations, KSNumbers, SecureLinks, KeyContracts, completed agreements, and campaign attribution will be measured, once SecurePay product events are integrated in Phase 4."
      bullets={[
        "Phase 4: SecurePay product event integration and attribution",
        "Phase 5: full impact analytics, experiments, and ROI reporting",
        "No fabricated figures appear here in the meantime",
      ]}
      phase="Phase 5 — Impact + Growth Director + Scale"
    />
  );
}
