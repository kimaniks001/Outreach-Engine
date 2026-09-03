import { requireUser } from "@/lib/rbac/guard";
import { canAccessSection } from "@/lib/rbac/sections";
import { SurfaceLanding, type SurfaceLink } from "@/components/nerve/SurfaceLanding";

export default async function GrowthPage() {
  const user = await requireUser();
  const candidates: Array<[Parameters<typeof canAccessSection>[1], SurfaceLink]> = [
    ["INTELLIGENCE", { label: "Intelligence", href: "/intelligence", description: "Listen to evidence, signals and opportunities before deciding what SecurePay should do next." }],
    ["CAMPAIGNS", { label: "Campaigns", href: "/campaigns", description: "Turn approved market objectives into governed campaign work." }],
    ["STUDIO", { label: "Studio", href: "/studio", description: "Create and revise market material while AI output remains draft until authorised." }],
    ["APPROVALS", { label: "Approval Desk", href: "/approvals", description: "Brand, compliance and human approval stay between creation and market execution." }],
    ["AUDIENCES", { label: "Audiences", href: "/audiences", description: "Build privacy-aware audience strategy without inventing customer truth." }],
    ["DISTRIBUTION", { label: "Distribution", href: "/distribution", description: "Plan and execute only through approved budgets, windows and provider boundaries." }],
    ["ENGAGEMENT", { label: "Engagement", href: "/engagement", description: "Understand supported market response and human engagement." }],
    ["IMPACT", { label: "Impact", href: "/impact", description: "Measure outcomes and learning instead of treating vanity metrics as business truth." }],
    ["GROWTH_DIRECTOR", { label: "Growth Director", href: "/growth-director", description: "Evidence-grounded recommendations: what happened, what it means and what to do next." }],
  ];
  const links = candidates.filter(([section]) => canAccessSection(user.role, section)).map(([, link]) => link);
  if (["OWNER","GROWTH_DIRECTOR","STRATEGIST","ANALYST"].includes(user.role)) links.unshift({ label: "Market learning loop", href: "/growth/network-loop", description: "Connect trader friction to evidence, conversation and owned work without collapsing backend authority boundaries." });
  if (links.length === 0) links.push({ label: "Today", href: "/today", description: "Your role does not currently have a Growth room. Today remains your personal operating view.", state: "foundation" });

  return (
    <SurfaceLanding
      eyebrow="Growth"
      title="The commercial brain we already built — now connected to the whole organisation."
      description="Intelligence, Campaigns, Studio, approvals, audiences, distribution, engagement, impact and Growth Director remain intact. The Nerve Centre wraps them in shared work, conversation, trader and operations context instead of rebuilding them."
      phase="Built foundation · integrated in Phase 9"
      next="Growth is the strongest existing Outreach capability. Phase 9 completes its integration with Today, Conversations, Work, Traders, Operations and People."
      links={links}
    />
  );
}
