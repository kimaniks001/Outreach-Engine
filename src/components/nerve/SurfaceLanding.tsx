import Link from "next/link";

export type SurfaceLink = {
  label: string;
  href: string;
  description: string;
  state?: "live" | "foundation";
};

export function SurfaceLanding({
  eyebrow,
  title,
  description,
  phase,
  links,
  next,
}: {
  eyebrow: string;
  title: string;
  description: string;
  phase: string;
  links: SurfaceLink[];
  next: string;
}) {
  return (
    <div className="mx-auto max-w-6xl outreach-rise">
      <header className="overflow-hidden rounded-[28px] border border-brand/15 bg-surface-raised shadow-quiet">
        <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[1.35fr_.65fr] lg:px-10 lg:py-10">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">{eyebrow}</p>
            <h1 className="mt-3 max-w-2xl font-display text-4xl leading-[1.05] text-ink sm:text-5xl">{title}</h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-ink-muted">{description}</p>
          </div>
          <div className="rounded-2xl bg-brand px-5 py-5 text-white">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">Roadmap position</p>
            <p className="mt-2 font-display text-2xl">{phase}</p>
            <p className="mt-3 text-sm leading-6 text-white/78">{next}</p>
          </div>
        </div>
      </header>

      <section className="mt-7">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Available from here</p>
            <h2 className="mt-1 font-display text-2xl text-ink">Use what is already real.</h2>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {links.map((link) => (
            <Link
              href={link.href}
              key={`${link.href}-${link.label}`}
              className="group rounded-2xl border border-surface-border bg-surface-raised p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-float"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-ink group-hover:text-brand-muted">{link.label}</span>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${link.state === "foundation" ? "bg-accent-soft/55 text-accent" : "bg-brand-soft/65 text-brand-muted"}`}>
                  {link.state === "foundation" ? "Foundation" : "Live"}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-ink-muted">{link.description}</p>
              <p className="mt-4 text-xs font-semibold text-brand">Open →</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
