import { requireUser } from "@/lib/rbac/guard";
import { canAccessSection } from "@/lib/rbac/sections";
import { SurfaceLanding, type SurfaceLink } from "@/components/nerve/SurfaceLanding";

export default async function OperationsPage() {
  const user = await requireUser();
  const links: SurfaceLink[] = [];
  if (canAccessSection(user.role, "DISTRIBUTION")) links.push({ label: "Distribution operations", href: "/distribution", description: "Existing provider readiness, execution windows, pause controls and evidence are the first operational foundations." });
  if (canAccessSection(user.role, "ADMIN")) links.push({ label: "Admin", href: "/admin", description: "Current configuration and control surfaces remain restricted by role." });
  links.push({ label: "Today", href: "/today", description: "System and AI readiness already surface in Today while incident and service operations are built.", state: "foundation" });

  return (
    <SurfaceLanding
      eyebrow="Operations"
      title="Keep SecurePay smooth, calm and observable."
      description="Operations becomes the home for service health, support queues, incidents, affected traders, responders, chronology, resolution and prevention — designed for operators, not as a wall of developer telemetry."
      phase="Phase 5"
      next="Distribution already proves controlled execution and pause boundaries. Phase 5 adds incident command, service health, case clustering and resolution propagation."
      links={links}
    />
  );
}
