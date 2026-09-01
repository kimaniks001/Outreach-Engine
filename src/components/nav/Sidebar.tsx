"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-surface-border bg-surface-raised/95 px-4 py-3 backdrop-blur md:hidden">
        <Link href="/today" aria-label="SecurePay Outreach Engine home">
          <p className="text-[11px] font-medium uppercase tracking-widest text-brand">SecurePay</p>
          <p className="text-sm font-semibold text-ink">Outreach Engine</p>
        </Link>
        <button
          type="button"
          aria-controls="staff-navigation"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          onClick={() => setMobileOpen((open) => !open)}
          className="rounded-md border border-surface-border px-3 py-2 text-sm font-medium text-ink-muted"
        >
          {mobileOpen ? "Close" : "Menu"}
        </button>
      </header>

      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
        />
      ) : null}

      <aside
        id="staff-navigation"
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-72 shrink-0 flex-col border-r border-surface-border bg-surface-raised transition-transform md:sticky md:top-0 md:z-auto md:h-screen md:w-60 md:translate-x-0 ${
          mobileOpen ? "visible translate-x-0" : "invisible -translate-x-full md:visible"
        }`}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-5">
          <Link href="/today" aria-label="SecurePay Outreach Engine home">
            <p className="text-xs font-medium uppercase tracking-widest text-brand">SecurePay</p>
            <p className="mt-0.5 text-sm font-semibold text-ink">Outreach Engine</p>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-md border border-surface-border px-2.5 py-1.5 text-xs text-ink-muted md:hidden"
          >
            Close
          </button>
        </div>

        <nav aria-label="Staff navigation" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {SECTIONS.map((section) => {
            if (!allowedSections.includes(section)) return null;
            return <NavLink key={section} section={section} active={isActive(pathname, section)} />;
          })}
        </nav>

        <div className="border-t border-surface-border px-4 py-4">
          <p className="truncate text-sm font-medium text-ink">{userName}</p>
          <p className="text-xs text-ink-faint">{ROLE_LABELS[role]}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 w-full rounded-md border border-surface-border px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:border-status-bad/40 hover:text-status-bad"
          >
            Log out
          </button>
        </div>
      </aside>
    </>
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
      aria-current={active ? "page" : undefined}
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
