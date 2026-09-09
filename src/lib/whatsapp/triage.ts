export type SupportIntent =
  | "GENERAL"
  | "ACCESS_OTP"
  | "AGREEMENT"
  | "PAYMENT"
  | "DELIVERY_MILESTONE"
  | "DISPUTE"
  | "FEEDBACK"
  | "HUMAN_REQUEST"
  | "SENSITIVE"
  | "UNKNOWN";

export type SupportRoute = "AUTO_GUIDANCE" | "AUTO_CONTEXT" | "PLUG" | "SECUREPAY_STAFF" | "SENSITIVE_REVIEW";
export type SupportPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT" | "CRITICAL";

export interface SupportTriageDecision {
  intent: SupportIntent;
  route: SupportRoute;
  priority: SupportPriority;
  requiresSecurePayContext: boolean;
  reason: string;
}

const contains = (text: string, terms: string[]) => terms.some((term) => text.includes(term));

/**
 * Fast, deterministic first-pass routing. It is intentionally conservative:
 * the classifier never grants authority or manufactures SecurePay facts. Deeper
 * agents may enrich classification later, but they must preserve these sensitive
 * and transactional fail-closed boundaries.
 */
export function classifySupportMessage(raw: string): SupportTriageDecision {
  const text = normalize(raw);

  if (contains(text, [
    "died", "death", "deceased", "passed away", "bereavement", "succession",
    "compliance", "aml", "money laundering", "terror", "sanction", "court order",
    "fraud", "scam", "stolen identity", "identity theft", "account hacked", "hacked account",
  ])) {
    return {
      intent: "SENSITIVE",
      route: "SENSITIVE_REVIEW",
      priority: contains(text, ["hacked", "fraud", "stolen identity", "identity theft"]) ? "URGENT" : "HIGH",
      requiresSecurePayContext: false,
      reason: "Sensitive, compliance, bereavement, fraud or account-security language requires protected human review.",
    };
  }

  if (contains(text, ["dispute", "i disagree", "not mine", "never received", "didn't receive", "did not receive", "wrong item", "seller is lying", "buyer is lying"])) {
    return {
      intent: "DISPUTE",
      route: "SECUREPAY_STAFF",
      priority: "HIGH",
      requiresSecurePayContext: true,
      reason: "Potential dispute or contested fulfilment should not be resolved by an ordinary Plug or an unreviewed automated answer.",
    };
  }

  if (contains(text, ["human", "person", "someone call", "call me", "talk to someone", "talk to a person", "agent please", "need an agent"])) {
    return {
      intent: "HUMAN_REQUEST",
      route: "PLUG",
      priority: "NORMAL",
      requiresSecurePayContext: false,
      reason: "The customer explicitly requested human assistance.",
    };
  }

  if (contains(text, ["otp", "one time password", "code not", "login", "log in", "sign in", "password", "can't access", "cannot access"])) {
    return {
      intent: "ACCESS_OTP",
      route: "SECUREPAY_STAFF",
      priority: "NORMAL",
      requiresSecurePayContext: false,
      reason: "Account-access support is identity-sensitive and the current bounded agreement projection does not expose OTP/authentication state.",
    };
  }

  if (contains(text, ["where is my money", "where is the money", "payment", "paid", "payout", "settlement", "released", "release money", "funds", "mpesa", "m-pesa", "pesalink"])) {
    return {
      intent: "PAYMENT",
      route: "SECUREPAY_STAFF",
      priority: "HIGH",
      requiresSecurePayContext: true,
      reason: "Money-state questions require authoritative payment context that is not present in the current minimum support projection.",
    };
  }

  if (contains(text, ["delivery", "delivered", "milestone", "completion", "complete", "received the goods", "received item"])) {
    return {
      intent: "DELIVERY_MILESTONE",
      route: "AUTO_CONTEXT",
      priority: "NORMAL",
      requiresSecurePayContext: true,
      reason: "Delivery/milestone guidance can be automated only when the case-bound SecurePay projection identifies one unambiguous relevant agreement and next action.",
    };
  }

  const wantsToBuildAgreement = contains(text, ["make an agreement", "create an agreement", "build an agreement", "start an agreement", "new agreement"]);
  if (wantsToBuildAgreement) {
    return {
      intent: "AGREEMENT",
      route: "AUTO_GUIDANCE",
      priority: "NORMAL",
      requiresSecurePayContext: false,
      reason: "Agreement creation is a securepay.ke action; WhatsApp may guide but must not build the agreement.",
    };
  }

  if (contains(text, ["agreement", "securelink", "keycontract", "pending", "accepted", "acceptance", "next step", "what happens next"])) {
    return {
      intent: "AGREEMENT",
      route: "AUTO_CONTEXT",
      priority: "NORMAL",
      requiresSecurePayContext: true,
      reason: "Agreement-state questions may be answered from the minimum case-bound SecurePay projection when unambiguous.",
    };
  }

  if (contains(text, ["thank you", "thanks", "worked", "helpful", "confusing", "feedback", "suggestion", "i like", "i don't like", "i do not like"])) {
    return {
      intent: "FEEDBACK",
      route: "AUTO_GUIDANCE",
      priority: "LOW",
      requiresSecurePayContext: false,
      reason: "Feedback can be acknowledged immediately and retained for Outreach learning.",
    };
  }

  if (contains(text, ["hello", "hi", "hey", "help", "what is securepay", "how does securepay work", "what can i do here"])) {
    return {
      intent: "GENERAL",
      route: "AUTO_GUIDANCE",
      priority: "LOW",
      requiresSecurePayContext: false,
      reason: "General support can be answered from approved channel guidance without customer-specific SecurePay data.",
    };
  }

  return {
    intent: "UNKNOWN",
    route: "PLUG",
    priority: "NORMAL",
    requiresSecurePayContext: false,
    reason: "The first-pass classifier cannot safely determine the customer's need, so a human should review it.",
  };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}
