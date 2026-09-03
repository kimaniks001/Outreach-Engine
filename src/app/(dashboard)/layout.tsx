import { requireUser } from "@/lib/rbac/guard";
import { sectionsForRole } from "@/lib/rbac/sections";
import { Sidebar } from "@/components/nav/Sidebar";
import { CommandBox } from "@/components/copilot/CommandBox";
import { ResilienceNotice } from "@/components/nerve/ResilienceNotice";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const allowedSections = sectionsForRole(user.role);

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-white">Skip to main content</a>
      <Sidebar role={user.role} userName={user.name} allowedSections={allowedSections} />
      <main id="main-content" className="min-w-0 flex-1 px-4 pb-10 pt-28 sm:px-6 lg:px-8 lg:py-8 xl:px-10">
        <ResilienceNotice />
        <CommandBox />
        {children}
      </main>
    </div>
  );
}
