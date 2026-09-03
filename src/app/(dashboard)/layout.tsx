import { requireUser } from "@/lib/rbac/guard";
import { sectionsForRole } from "@/lib/rbac/sections";
import { Sidebar } from "@/components/nav/Sidebar";
import { CommandBox } from "@/components/copilot/CommandBox";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const allowedSections = sectionsForRole(user.role);

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar role={user.role} userName={user.name} allowedSections={allowedSections} />
      <main className="min-w-0 flex-1 px-4 pb-10 pt-28 sm:px-6 lg:px-8 lg:py-8 xl:px-10">
        <CommandBox />
        {children}
      </main>
    </div>
  );
}
