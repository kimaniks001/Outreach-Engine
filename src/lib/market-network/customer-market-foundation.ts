import type {
  CustomerMarketRequest,
  CustomerMarketRequestType,
} from "./securepay-plug-market-client";

export const customerMarketRequestChoices: ReadonlyArray<{
  type: CustomerMarketRequestType;
  label: string;
  description: string;
}> = [
  {
    type: "GENERAL_SECUREPAY_HELP",
    label: "I need SecurePay help",
    description: "Ask the market for a Market Ready Plug who can guide a general SecurePay journey.",
  },
  {
    type: "PROPERTY_JOURNEY_HELP",
    label: "I need property journey help",
    description: "Ask for a Plug who currently holds SecurePay's Property Specialist capability.",
  },
];

export function humanRequestType(type: CustomerMarketRequestType): string {
  return type === "PROPERTY_JOURNEY_HELP" ? "Property journey help" : "SecurePay help";
}

export function customerRequestMeaning(status: CustomerMarketRequest["status"]): {
  happened: string;
  means: string;
  next: string;
} {
  switch (status) {
    case "OPEN":
      return {
        happened: "Your request is live in the qualified market.",
        means: "Eligible Plugs may express interest. Interest is not assignment or referral attribution.",
        next: "Review interested candidates when they appear, then choose one if you want to proceed.",
      };
    case "SELECTED":
      return {
        happened: "You selected one interested Plug.",
        means: "SecurePay recorded your choice and closed this request to further interest.",
        next: "Open the relationship when you are ready to work with the selected Plug.",
      };
    case "CANCELLED":
      return {
        happened: "You cancelled this request.",
        means: "The linked market opportunity is closed and no candidate can be selected from it.",
        next: "Create a new request if you still need help.",
      };
  }
}

export const marketRelationshipBoundary = {
  title: "Relationship is not money authority",
  explanation:
    "A selected or active market relationship does not create referral provenance, an agreement, a fee, Payment Ready, a 10% share, payment, release or settlement authority.",
  contactClosed:
    "SecurePay has not opened contact exchange on this relationship yet. Outreach will not reveal or infer phone, email, KS Number or private identity data.",
} as const;
