import { requireUser } from "@/lib/rbac/guard";
import { canAccessSection } from "@/lib/rbac/sections";
import { SurfaceLanding, type SurfaceLink } from "@/components/nerve/SurfaceLanding";

export default async function PeoplePage() {
  const user = await requireUser();
  const links: SurfaceLink[] = [];
  if (canAccessSection(user.role, "ADMIN")) links.push({ label: "Admin", href: "/admin", description: "Existing access, audit and configuration controls stay governed and role-restricted." });
  if (canAccessSection(user.role, "COMMUNITY_LIVE")) links.push({ label: "Community LIVE", href: "/community-live", description: "The existing belonging layer remains separate from staff access and authority." });
  links.push({ label: "Today", href: "/today", description: "Your work identity and personal operating view start here while richer team presence is built.", state: "foundation" });

  return (
    <SurfaceLanding
      eyebrow="People"
      title="A remote team should still feel like one team."
      description="People becomes the organisational home for staff, Plugs, Masters, directors, teams, skills, availability, timezone, rotations, access and culture — without turning profiles into social-media vanity."
      phase="Phases 6–7"
      next="Phase 6 adds remote presence, handover and follow-the-sun operation. Phase 7 adds team identity, recognition, rituals and role-specific organisation views."
      links={links}
    />
  );
}
