import { requireUser } from "@/lib/rbac/guard";
import { canAccessSection } from "@/lib/rbac/sections";
import { SurfaceLanding, type SurfaceLink } from "@/components/nerve/SurfaceLanding";

export default async function TradersPage() {
  const user = await requireUser();
  const links: SurfaceLink[] = [
    {
      label: "Community LIVE",
      href: "/community-live",
      description: "Existing human market context remains available; private support case authority is not inferred from community activity.",
      state: canAccessSection(user.role, "COMMUNITY_LIVE") ? "live" : "foundation",
    },
  ];
  if (canAccessSection(user.role, "IMPACT")) links.push({ label: "Impact", href: "/impact", description: "Use existing outcome and feedback evidence to understand where trader friction is emerging." });
  if (canAccessSection(user.role, "INTELLIGENCE")) links.push({ label: "Intelligence", href: "/intelligence", description: "Review evidence-backed market signals without manufacturing SecurePay product or financial truth." });

  return (
    <SurfaceLanding
      eyebrow="Traders"
      title="The trader asks SecurePay. Outreach handles the complexity behind the scenes."
      description="This surface becomes the support home for Ask SecurePay, trader context, cases, friction patterns and proactive assistance. The trader should never need to understand SecurePay's internal departments."
      phase="Phase 4"
      next="SecurePay backend remains authoritative for identity, agreements, money and lifecycle state. Phase 4 adds support conversations, cases, safe AI resolution and seamless human escalation."
      links={links}
    />
  );
}
