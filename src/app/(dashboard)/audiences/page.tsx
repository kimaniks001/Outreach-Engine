import { requireSection } from "@/lib/rbac/guard";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function AudiencesPage() {
  await requireSection("AUDIENCES");

  return (
    <EmptyState
      eyebrow="Audiences"
      title="Targeting begins in Phase 3; commercial memory arrives in Phase 4"
      description="This is where audience targeting definitions will live first, followed by the unified commercial memory that tracks audience state, consent, and suppression over time."
      bullets={[
        "Phase 3: audience targeting and paid-media planning",
        "Phase 4: commercial memory, audience states, and journey recovery",
        "Suppression and do-not-contact status will always take priority",
      ]}
      phase="Phase 3 — Targeting + Distribution"
    />
  );
}
