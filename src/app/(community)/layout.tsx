import Link from "next/link";
import { requireCommunityActor } from "@/lib/community/current-community-actor";
import { MarketNetworkLogoutButton } from "@/components/community/MarketNetworkLogoutButton";

export default async function CommunityLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireCommunityActor();

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-20 border-b border-surface-border bg-surface-raised/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-5">
            <Link href="/community-live" className="group">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">SecurePay</p>
              <p className="mt-0.5 text-sm font-semibold text-ink group-hover:text-brand">Community LIVE</p>
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              <CommunityLink href="/community-live">LIVE</CommunityLink>
              <CommunityLink href="/circles">Circles</CommunityLink>
              <CommunityLink href="/community-profile">My community identity</CommunityLink>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="max-w-48 truncate text-xs font-medium text-ink">{actor.name}</p>
              <p className="text-[11px] text-ink-faint">
                {actor.kind === "STAFF" ? "SecurePay staff" : "SecurePay identity"}
              </p>
            </div>
            {actor.kind === "STAFF" ? (
              <Link
                href="/today"
                className="rounded-md border border-surface-border px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:border-brand/40 hover:text-ink"
              >
                Command Centre
              </Link>
            ) : (
              <MarketNetworkLogoutButton />
            )}
          </div>
        </div>

        <nav className="mx-auto flex max-w-7xl gap-2 overflow-x-auto border-t border-surface-border px-5 py-2 md:hidden">
          <CommunityLink href="/community-live">LIVE</CommunityLink>
          <CommunityLink href="/circles">Circles</CommunityLink>
          <CommunityLink href="/community-profile">My identity</CommunityLink>
        </nav>
      </header>

      <main className="px-5 py-7 md:px-8 md:py-8">{children}</main>
    </div>
  );
}

function CommunityLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-ink-muted transition hover:bg-brand/10 hover:text-brand"
    >
      {children}
    </Link>
  );
}
