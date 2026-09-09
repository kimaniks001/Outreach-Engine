export const SUPPORT_FRAGMENT_SETTLE_MS = 1_500;
export const SUPPORT_FRAGMENT_CONTEXT_MS = 3 * 60_000;
export const SUPPORT_FRAGMENT_MAX_MESSAGES = 8;

export interface SupportFragment {
  id: string;
  conversationId: string;
  body: string;
  receivedAtMs: number;
}

export interface SupportFragmentCycle {
  conversationId: string;
  leaderId: string;
  fragments: SupportFragment[];
  aggregateText: string;
}

/**
 * Deterministic model of the production intake debounce: fragments from the same
 * conversation that arrive without a settle-sized pause are one handling cycle.
 * Every fragment remains present in the cycle for audit; only the newest fragment
 * becomes the processing leader.
 */
export function coalesceSupportFragments(
  input: readonly SupportFragment[],
  settleMs = SUPPORT_FRAGMENT_SETTLE_MS,
): SupportFragmentCycle[] {
  const ordered = [...input].sort((a, b) => a.receivedAtMs - b.receivedAtMs || a.id.localeCompare(b.id));
  const active = new Map<string, SupportFragment[]>();
  const cycles: SupportFragmentCycle[] = [];

  const flush = (conversationId: string) => {
    const fragments = active.get(conversationId);
    if (!fragments?.length) return;
    const bounded = fragments.slice(-SUPPORT_FRAGMENT_MAX_MESSAGES);
    cycles.push({
      conversationId,
      leaderId: fragments[fragments.length - 1]!.id,
      fragments: [...fragments],
      aggregateText: bounded.map((fragment) => fragment.body).join("\n"),
    });
    active.delete(conversationId);
  };

  for (const fragment of ordered) {
    const current = active.get(fragment.conversationId);
    if (current?.length) {
      const previous = current[current.length - 1]!;
      if (fragment.receivedAtMs - previous.receivedAtMs > settleMs) flush(fragment.conversationId);
    }
    const next = active.get(fragment.conversationId) ?? [];
    next.push(fragment);
    active.set(fragment.conversationId, next);
  }

  for (const conversationId of [...active.keys()].sort()) flush(conversationId);
  return cycles.sort((a, b) => a.fragments[0]!.receivedAtMs - b.fragments[0]!.receivedAtMs || a.conversationId.localeCompare(b.conversationId));
}
