import { requireUser } from "@/lib/rbac/guard";
import { canAccessSection } from "@/lib/rbac/sections";
import { SurfaceLanding, type SurfaceLink } from "@/components/nerve/SurfaceLanding";

export default async function WorkPage() {
  const user = await requireUser();
  const links: SurfaceLink[] = [];
  if (canAccessSection(user.role, "APPROVALS")) links.push({ label: "Approval Desk", href: "/approvals", description: "Review work that already requires governed human approval." });
  if (canAccessSection(user.role, "CAMPAIGNS")) links.push({ label: "Campaign work", href: "/campaigns", description: "Existing campaign ownership and workflow remains available while universal work objects are added." });
  if (canAccessSection(user.role, "DISTRIBUTION")) links.push({ label: "Distribution work", href: "/distribution", description: "Authorised distribution plans, execution windows and operational evidence." });
  if (links.length === 0) links.push({ label: "Today", href: "/today", description: "Your current role has no specialist work rooms. Today remains your personal starting point.", state: "foundation" });

  return (
    <SurfaceLanding
      eyebrow="Work"
      title="Know what you own, what is waiting and what happens next."
      description="Work becomes the shared responsibility layer for tasks, queues, schedules, approvals, projects and follow-ups. Every actionable item will carry an owner, state, priority, context and next action."
      phase="Phase 3"
      next="Existing approvals, campaigns and distribution work stay live. Phase 3 introduces universal tasks, operational queues, SLAs, recurring schedules and routing."
      links={links}
    />
  );
}
