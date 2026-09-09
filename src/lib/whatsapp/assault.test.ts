import { describe, expect, it } from "vitest";
import { coalesceSupportFragments, SUPPORT_FRAGMENT_SETTLE_MS, type SupportFragment } from "./fragment-window";
import { classifySupportMessage } from "./triage";

interface ProviderEvent extends SupportFragment {
  providerMessageId: string;
}

function buildAssaultTraffic(): ProviderEvent[] {
  const events: ProviderEvent[] = [];
  let ordinal = 0;

  for (let conversation = 0; conversation < 1_000; conversation += 1) {
    const fragmentCount = conversation < 500 ? 3 : 2; // 2,500 unique inbound messages.
    const scenario = conversation % 5;
    const bodies = scenario === 0
      ? ["Where is my payment?", "The one to John", "for the laptop"]
      : scenario === 1
        ? ["Seller says delivered", "I have not confirmed it", "what happens next?"]
        : scenario === 2
          ? ["My husband died", "I need help with his account", "please guide me"]
          : scenario === 3
            ? ["Hello", "how does SecurePay work?", "thanks"]
            : ["I need a person", "there is something odd here", "please help"];

    for (let fragment = 0; fragment < fragmentCount; fragment += 1) {
      const providerMessageId = `wamid.${conversation}.${fragment}`;
      events.push({
        id: providerMessageId,
        providerMessageId,
        conversationId: `conversation-${conversation}`,
        body: bodies[fragment] ?? bodies[bodies.length - 1]!,
        receivedAtMs: conversation * 10_000 + fragment * 350,
      });
      ordinal += 1;
    }
  }

  expect(ordinal).toBe(2_500);

  // Meta retry storm: 50 original webhooks are each delivered 20 times total.
  for (let index = 0; index < 50; index += 1) {
    const original = events[index]!;
    for (let retry = 1; retry < 20; retry += 1) {
      events.push({ ...original, id: `${original.id}:retry-${retry}` });
    }
  }

  // Delivery order is deliberately hostile and not grouped by conversation.
  return events.sort((a, b) => (a.providerMessageId.length * 31 + a.id.length * 17) % 97 - (b.providerMessageId.length * 31 + b.id.length * 17) % 97);
}

function persistIdempotently(events: readonly ProviderEvent[]): { accepted: ProviderEvent[]; duplicates: number } {
  const providerIds = new Set<string>();
  const accepted: ProviderEvent[] = [];
  let duplicates = 0;
  for (const event of events) {
    if (providerIds.has(event.providerMessageId)) {
      duplicates += 1;
      continue;
    }
    providerIds.add(event.providerMessageId);
    accepted.push({ ...event, id: event.providerMessageId });
  }
  return { accepted, duplicates };
}

describe("WhatsApp launch assault model", () => {
  it("keeps 2,500 unique inbound messages while collapsing rapid fragments into 1,000 handling cycles", () => {
    const traffic = buildAssaultTraffic();
    const persisted = persistIdempotently(traffic);
    const cycles = coalesceSupportFragments(persisted.accepted, SUPPORT_FRAGMENT_SETTLE_MS);

    expect(traffic).toHaveLength(3_450);
    expect(persisted.accepted).toHaveLength(2_500);
    expect(persisted.duplicates).toBe(950);
    expect(cycles).toHaveLength(1_000);
    expect(cycles.reduce((sum, cycle) => sum + cycle.fragments.length, 0)).toBe(2_500);
    expect(new Set(cycles.map((cycle) => cycle.leaderId)).size).toBe(1_000);
  });

  it("never routes bereavement/account-succession cycles to an ordinary Plug", () => {
    const { accepted } = persistIdempotently(buildAssaultTraffic());
    const cycles = coalesceSupportFragments(accepted);
    const sensitive = cycles.filter((cycle) => cycle.aggregateText.toLowerCase().includes("husband died"));

    expect(sensitive.length).toBeGreaterThan(0);
    for (const cycle of sensitive) {
      const decision = classifySupportMessage(cycle.aggregateText);
      expect(decision.intent).toBe("SENSITIVE");
      expect(decision.route).toBe("SENSITIVE_REVIEW");
      expect(decision.route).not.toBe("PLUG");
    }
  });

  it("preserves payment and delivery authority boundaries under fragmented wording", () => {
    const { accepted } = persistIdempotently(buildAssaultTraffic());
    const cycles = coalesceSupportFragments(accepted);

    const payment = cycles.find((cycle) => cycle.aggregateText.includes("Where is my payment?"));
    const delivery = cycles.find((cycle) => cycle.aggregateText.includes("Seller says delivered"));
    expect(payment).toBeDefined();
    expect(delivery).toBeDefined();

    expect(classifySupportMessage(payment!.aggregateText)).toMatchObject({
      intent: "PAYMENT",
      route: "SECUREPAY_STAFF",
      requiresSecurePayContext: true,
    });
    expect(classifySupportMessage(delivery!.aggregateText)).toMatchObject({
      intent: "DELIVERY_MILESTONE",
      route: "AUTO_CONTEXT",
      requiresSecurePayContext: true,
    });
  });
});
