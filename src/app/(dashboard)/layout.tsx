import { requireUser } from "@/lib/rbac/guard";
import { sectionsForRole } from "@/lib/rbac/sections";
import { Sidebar } from "@/components/nav/Sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const allowedSections = sectionsForRole(user.role);

  return (
    <div className="min-h-screen md:flex">
      <Sidebar role={user.role} userName={user.name} allowedSections={allowedSections} />
      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
