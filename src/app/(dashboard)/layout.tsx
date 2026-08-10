import { requireUser } from "@/lib/rbac/guard";
import { sectionsForRole } from "@/lib/rbac/sections";
import { Sidebar } from "@/components/nav/Sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const allowedSections = sectionsForRole(user.role);

  return (
    <div className="flex min-h-screen">
      <Sidebar role={user.role} userName={user.name} allowedSections={allowedSections} />
      <main className="flex-1 overflow-y-auto px-8 py-8">{children}</main>
    </div>
  );
}
