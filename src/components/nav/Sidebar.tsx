"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SECTIONS, SECTION_LABELS, SECTION_PATHS, type Section } from "@/lib/rbac/sections";
import { ROLE_LABELS, type Role } from "@/lib/rbac/roles";

export function Sidebar({
  role,
  userName,
  allowedSections,
}: {
  role: Role;
  userName: string;
  allowedSections: readonly Section[];
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-surface-border bg-surface-raised">
      <div className="border-b border-surface-border px-5 py-5">
        <p className="text-xs font-medium uppercase tracking-widest text-brand">SecurePay</p>
        <p className="mt-0.5 text-sm font-semibold text-ink">Outreach Engine</p>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {SECTIONS.map((section) => {
          if (!allowedSections.includes(section)) return null;
          return <NavLink key={section} section={section} active={isActive(pathname, section)} />;
        })}
      </nav>

      <div className="border-t border-surface-border px-4 py-4">
        <p className="truncate text-sm font-medium text-ink">{userName}</p>
        <p className="text-xs text-ink-faint">{ROLE_LABELS[role]}</p>
        <button
          onClick={handleLogout}
          className="mt-3 w-full rounded-md border border-surface-border px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:border-status-bad/40 hover:text-status-bad"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}

function isActive(pathname: string, section: Section): boolean {
  const path = SECTION_PATHS[section];
  return pathname === path || pathname.startsWith(`${path}/`);
}

function NavLink({ section, active }: { section: Section; active: boolean }) {
  return (
    <Link
      href={SECTION_PATHS[section]}
      className={`block rounded-md px-3 py-2 text-sm transition ${
        active
          ? "bg-brand/15 font-medium text-brand"
          : "text-ink-muted hover:bg-surface hover:text-ink"
      }`}
    >
      {SECTION_LABELS[section]}
    </Link>
  );
}
