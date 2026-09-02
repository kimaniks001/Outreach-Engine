import { requireUser } from "@/lib/rbac/guard";
import { canAccessSection } from "@/lib/rbac/sections";
import { SurfaceLanding, type SurfaceLink } from "@/components/nerve/SurfaceLanding";

export default async function ConversationsPage() {
  const user = await requireUser();
  const links: SurfaceLink[] = [];
  if (canAccessSection(user.role, "COMMUNITY_LIVE")) {
    links.push({
      label: "Community LIVE",
      href: "/community-live",
      description: "The existing shared community foundation for people, belonging and market conversation.",
    });
  }
  links.push({
    label: "Today",
    href: "/today",
    description: "Return to your personal attention view while direct messages, staff circles and work-linked rooms are built.",
    state: "foundation",
  });

  return (
    <SurfaceLanding
      eyebrow="Conversations"
      title="People talk here. Work should move with the conversation."
      description="This becomes the internal home for direct messages, department circles, company community, case rooms and incident rooms — without turning SecurePay work into email chains."
      phase="Phase 2"
      next="Community LIVE is already real. Phase 2 adds staff DMs, private working circles and conversation-to-action without exposing private work to market-facing community spaces."
      links={links}
    />
  );
}
