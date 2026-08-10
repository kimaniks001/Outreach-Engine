// The Outreach Engine's only authoritative SecurePay product/money-flow
// doctrine, per the Phase 2 brief Section 11. These four concepts — and
// nothing else — are what an opportunity may be mapped to. Do not add
// products, pricing, or new money-flow types here without an authoritative
// SecurePay doctrine source; when in doubt, the mapping function below
// returns NEEDS_DOCTRINE_REVIEW instead of guessing.

export const MONEY_FLOW_TYPES = [
  "ONE_TO_ONE",
  "MANY_TO_ONE",
  "ONE_TO_MANY",
  "MANY_TO_MANY",
  "NEEDS_DOCTRINE_REVIEW",
] as const;
export type MoneyFlowMapping = (typeof MONEY_FLOW_TYPES)[number];

export interface MoneyFlowDefinition {
  key: Exclude<MoneyFlowMapping, "NEEDS_DOCTRINE_REVIEW">;
  label: string;
  product: string;
  description: string;
}

export const MONEY_FLOW_DEFINITIONS: Record<
  Exclude<MoneyFlowMapping, "NEEDS_DOCTRINE_REVIEW">,
  MoneyFlowDefinition
> = {
  ONE_TO_ONE: {
    key: "ONE_TO_ONE",
    label: "One → One",
    product: "SecureLink / KeyContract",
    description: "A single payer and a single payee agree on a single money flow.",
  },
  MANY_TO_ONE: {
    key: "MANY_TO_ONE",
    label: "Many → One",
    product: "Group SecureLink",
    description: "Multiple payers contribute toward a single payee under one agreement.",
  },
  ONE_TO_MANY: {
    key: "ONE_TO_MANY",
    label: "One → Many",
    product: "SecureFlow",
    description: "A single payer distributes money across multiple payees under one agreement.",
  },
  MANY_TO_MANY: {
    key: "MANY_TO_MANY",
    label: "Many → Many",
    product: "Group SecureFlow",
    description: "Multiple payers and multiple payees participate under one shared agreement.",
  },
};

export function isKnownMoneyFlow(
  value: string
): value is Exclude<MoneyFlowMapping, "NEEDS_DOCTRINE_REVIEW"> {
  return Object.prototype.hasOwnProperty.call(MONEY_FLOW_DEFINITIONS, value);
}

// Never trusts free-text AI output directly — coerces anything outside the
// fixed doctrine set to NEEDS_DOCTRINE_REVIEW rather than hallucinating a
// product mapping. See docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md
// Section 11.
export function resolveMoneyFlowMapping(candidate: string): MoneyFlowMapping {
  const normalized = candidate.trim().toUpperCase().replace(/\s+/g, "_");
  if (isKnownMoneyFlow(normalized)) return normalized;
  return "NEEDS_DOCTRINE_REVIEW";
}

export function describeMoneyFlow(mapping: MoneyFlowMapping): string {
  if (mapping === "NEEDS_DOCTRINE_REVIEW") {
    return "Not enough authoritative SecurePay product doctrine to safely map this opportunity — needs human doctrine review before a product/use-case is assigned.";
  }
  const def = MONEY_FLOW_DEFINITIONS[mapping];
  return `${def.label} — ${def.product}: ${def.description}`;
}
