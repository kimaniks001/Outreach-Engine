"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SECTION_LABELS, SECTION_PATHS, type Section } from "@/lib/rbac/sections";
import { ROLE_LABELS, type Role } from "@/lib/rbac/roles";

type SurfaceKey = "today" | "conversations" | "work" | "traders" | "growth" | "operations" | "people";

type Surface = {
  key: SurfaceKey;
  label: string;
  href: string;
  eyebrow: string;
  icon: IconName;
};

type IconName = "today" | "chat" | "work" | "traders" | "growth" | "operations" | "people";

const SURFACES: Surface[] = [
  { key: "today", label: "Today", href: "/today", eyebrow: "My day", icon: "today" },
  { key: "conversations", label: "Conversations", href: "/conversations", eyebrow: "Talk & belong", icon: "chat" },
  { key: "work", label: "Work", href: "/work", eyebrow: "Own & finish", icon: "work" },
  { key: "traders", label: "Traders", href: "/traders", eyebrow: "Help people trade", icon: "traders" },
  { key: "growth", label: "Growth", href: "/growth", eyebrow: "Listen & grow", icon: "growth" },
  { key: "operations", label: "Operations", href: "/operations", eyebrow: "Keep SecurePay smooth", icon: "operations" },
  { key: "people", label: "People", href: "/people", eyebrow: "Team & access", icon: "people" },
];

const GROWTH_SECTIONS: readonly Section[] = [
  "INTELLIGENCE",
  "CAMPAIGNS",
  "STUDIO",
  "APPROVALS",
  "AUDIENCES",
  "DISTRIBUTION",
  "ENGAGEMENT",
  "IMPACT",
  "GROWTH_DIRECTOR",
];

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
  const visibleGrowth = GROWTH_SECTIONS.filter((section) => allowedSections.includes(section));

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[292px] shrink-0 flex-col border-r border-surface-border/80 bg-surface-raised/90 backdrop-blur-xl lg:flex">
        <BrandBlock />

        <nav className="flex-1 overflow-y-auto px-4 py-5" aria-label="Outreach nerve centre">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-faint">Nerve centre</p>
          <div className="mt-3 space-y-1">
            {SURFACES.map((surface) => (
              <SurfaceLink key={surface.key} surface={surface} active={isSurfaceActive(pathname, surface.key)} />
            ))}
          </div>

          {visibleGrowth.length > 0 ? (
            <div className="mt-7 border-t border-surface-border/70 pt-5">
              <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-faint">Growth rooms</p>
              <div className="mt-2 space-y-0.5">
                {visibleGrowth.map((section) => (
                  <Link
                    key={section}
                    href={SECTION_PATHS[section]}
                    className={`block rounded-xl px-3 py-2 text-[13px] transition ${
                      pathname === SECTION_PATHS[section] || pathname.startsWith(`${SECTION_PATHS[section]}/`)
                        ? "bg-brand-soft/55 font-medium text-brand-muted"
                        : "text-ink-muted hover:bg-surface-soft/65 hover:text-ink"
                    }`}
                  >
                    {SECTION_LABELS[section]}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </nav>

        <div className="m-4 rounded-2xl border border-surface-border bg-surface px-4 py-3.5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
              {initials(userName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{userName}</p>
              <p className="truncate text-xs text-ink-faint">{ROLE_LABELS[role]}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-3 w-full rounded-xl border border-surface-border bg-surface-raised px-3 py-2 text-xs font-medium text-ink-muted transition hover:border-accent/45 hover:text-accent"
          >
            Log out
          </button>
        </div>
      </aside>

      <div className="fixed inset-x-0 top-0 z-40 border-b border-surface-border/80 bg-surface-raised/95 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <BrandMark compact />
          <Link href="/today" className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white">
            Today
          </Link>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5" aria-label="Outreach surfaces">
          {SURFACES.map((surface) => (
            <Link
              key={surface.key}
              href={surface.href}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                isSurfaceActive(pathname, surface.key)
                  ? "border-brand bg-brand-soft/60 text-brand-muted"
                  : "border-surface-border bg-surface text-ink-muted"
              }`}
            >
              {surface.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

function BrandBlock() {
  return (
    <div className="border-b border-surface-border/70 px-6 py-6">
      <BrandMark />
      <p className="mt-4 max-w-[210px] font-display text-[18px] leading-snug text-ink">
        The people behind a smoother SecurePay.
      </p>
    </div>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`relative flex ${compact ? "h-9 w-9" : "h-11 w-11"} items-center justify-center rounded-full bg-brand text-white shadow-sm`}>
        <span className="outreach-living-ring absolute inset-[-5px] rounded-full border border-brand/30" aria-hidden />
        <svg viewBox="0 0 32 32" className="h-5 w-5" fill="none" aria-hidden>
          <path d="M9 10.5 16 6l7 4.5v10L16 25l-7-4.5v-10Z" stroke="currentColor" strokeWidth="1.8" />
          <path d="m12.5 16 2.3 2.3 4.9-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand">SecurePay</p>
        <p className={`${compact ? "text-sm" : "text-base"} font-semibold text-ink`}>Outreach</p>
      </div>
    </div>
  );
}

function SurfaceLink({ surface, active }: { surface: Surface; active: boolean }) {
  return (
    <Link
      href={surface.href}
      className={`group flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition ${
        active
          ? "border-brand/20 bg-brand-soft/55 shadow-sm"
          : "border-transparent hover:border-surface-border hover:bg-surface"
      }`}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${active ? "bg-brand text-white" : "bg-surface-soft text-ink-muted group-hover:text-brand"}`}>
        <SurfaceIcon name={surface.icon} />
      </span>
      <span className="min-w-0">
        <span className={`block text-sm font-semibold ${active ? "text-brand-muted" : "text-ink"}`}>{surface.label}</span>
        <span className="block truncate text-[11px] text-ink-faint">{surface.eyebrow}</span>
      </span>
    </Link>
  );
}

function SurfaceIcon({ name }: { name: IconName }) {
  const shared = "h-[17px] w-[17px]";
  if (name === "today") return <svg viewBox="0 0 24 24" className={shared} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 4.5h14v15H5z"/><path d="M8 2.8v3.5M16 2.8v3.5M8 10h8M8 14h5" strokeLinecap="round"/></svg>;
  if (name === "chat") return <svg viewBox="0 0 24 24" className={shared} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 5.5h16v10H9l-5 4v-14Z" strokeLinejoin="round"/><path d="M8 10h8" strokeLinecap="round"/></svg>;
  if (name === "work") return <svg viewBox="0 0 24 24" className={shared} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16v12H4z"/><path d="M9 7V4h6v3M4 11h16" strokeLinecap="round"/></svg>;
  if (name === "traders") return <svg viewBox="0 0 24 24" className={shared} fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 19c.7-3.3 2.2-5 4.5-5s3.8 1.7 4.5 5M13.5 18c.5-2.5 1.7-3.8 3.5-3.8 1.7 0 2.9 1.3 3.5 3.8" strokeLinecap="round"/></svg>;
  if (name === "growth") return <svg viewBox="0 0 24 24" className={shared} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m4 17 5-5 3 3 7-8" strokeLinecap="round" strokeLinejoin="round"/><path d="M15 7h4v4" strokeLinecap="round"/></svg>;
  if (name === "operations") return <svg viewBox="0 0 24 24" className={shared} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 12h3l2-5 4 10 2-5h5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="9"/></svg>;
  return <svg viewBox="0 0 24 24" className={shared} fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 19c.8-4 3-6 6.5-6s5.7 2 6.5 6" strokeLinecap="round"/></svg>;
}

function isSurfaceActive(pathname: string, key: SurfaceKey): boolean {
  if (key === "today") return pathname === "/today";
  if (key === "conversations") return pathname.startsWith("/conversations") || pathname.startsWith("/community-live") || pathname.startsWith("/circles");
  if (key === "work") return pathname.startsWith("/work");
  if (key === "traders") return pathname.startsWith("/traders");
  if (key === "operations") return pathname.startsWith("/operations");
  if (key === "people") return pathname.startsWith("/people") || pathname.startsWith("/admin");
  return pathname.startsWith("/growth") || GROWTH_SECTIONS.some((section) => pathname === SECTION_PATHS[section] || pathname.startsWith(`${SECTION_PATHS[section]}/`));
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "SP";
}
