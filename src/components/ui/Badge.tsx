type BadgeTone = "good" | "warn" | "bad" | "neutral" | "brand";

const TONE_CLASSES: Record<BadgeTone, string> = {
  good: "bg-status-good/15 text-status-good border-status-good/30",
  warn: "bg-status-warn/15 text-status-warn border-status-warn/30",
  bad: "bg-status-bad/15 text-status-bad border-status-bad/30",
  neutral: "bg-status-neutral/15 text-ink-muted border-surface-border",
  brand: "bg-brand/15 text-brand border-brand/30",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

// Consistent provider/system status → badge tone mapping used across Today
// and Admin so a status never reads differently in two places.
export function statusToTone(
  status: "AVAILABLE" | "NOT_CONFIGURED" | "DISABLED" | "DEGRADED" | "NORMAL" | "SAFE_MODE"
): BadgeTone {
  switch (status) {
    case "AVAILABLE":
    case "NORMAL":
      return "good";
    case "DEGRADED":
    case "SAFE_MODE":
      return "warn";
    case "DISABLED":
      return "bad";
    case "NOT_CONFIGURED":
    default:
      return "neutral";
  }
}
