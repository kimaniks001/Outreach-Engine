import { requireSection } from "@/lib/rbac/guard";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function CampaignsPage() {
  await requireSection("CAMPAIGNS");

  return (
    <EmptyState
      eyebrow="Campaigns"
      title="Campaign strategy and creative generation arrive in Phase 2"
      description="This is where campaign strategy, image-first creative, and Brand Guardian review will live. Every public or bulk action here will require human approval, per SecurePay's AI governance rules."
      bullets={[
        "Campaign strategy drafts and approval workflow",
        "Image-first creative variants (headlines, CTAs, descriptions)",
        "Brand Guardian positioning checks before anything is marked approved",
      ]}
      phase="Phase 2 — Intelligence + Campaign + Creative"
    />
  );
}
