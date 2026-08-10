import type { ReactNode } from "react";
import { Badge } from "./Badge";

export function EmptyState({
  eyebrow,
  title,
  description,
  phase,
  bullets,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  phase?: string;
  bullets?: string[];
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="max-w-lg text-center">
        {eyebrow ? (
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-ink-faint">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{description}</p>
        {bullets && bullets.length > 0 ? (
          <ul className="mt-4 space-y-1.5 text-left text-sm text-ink-muted">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex gap-2">
                <span className="text-ink-faint">–</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {phase ? (
          <div className="mt-5 flex justify-center">
            <Badge tone="brand">{phase}</Badge>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ForbiddenState({ what }: { what?: ReactNode }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="max-w-md text-center">
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-ink-faint">
          Access restricted
        </p>
        <h1 className="text-lg font-semibold text-ink">Not available for your role</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          {what ?? "This area is restricted based on your current role."}
        </p>
      </div>
    </div>
  );
}
