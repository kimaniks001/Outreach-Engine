import { describe, expect, it } from "vitest";
import { classifySupportMessage } from "./triage";

describe("WhatsApp support triage", () => {
  it("routes bereavement and compliance away from ordinary Plugs", () => {
    expect(classifySupportMessage("My husband died and I need help with his account").route).toBe("SENSITIVE_REVIEW");
    expect(classifySupportMessage("I have a compliance question").route).toBe("SENSITIVE_REVIEW");
  });

  it("keeps payment questions out of automated context until payment context exists", () => {
    const decision = classifySupportMessage("Where is my money? I paid this morning");
    expect(decision.intent).toBe("PAYMENT");
    expect(decision.route).toBe("SECUREPAY_STAFF");
    expect(decision.requiresSecurePayContext).toBe(true);
  });

  it("allows delivery questions into bounded-context automation", () => {
    const decision = classifySupportMessage("The seller says the milestone is complete. What happens next?");
    expect(decision.intent).toBe("DELIVERY_MILESTONE");
    expect(decision.route).toBe("AUTO_CONTEXT");
    expect(decision.requiresSecurePayContext).toBe(true);
  });

  it("sends agreement creation to securepay.ke guidance rather than WhatsApp trading", () => {
    const decision = classifySupportMessage("I want to create an agreement with John");
    expect(decision.intent).toBe("AGREEMENT");
    expect(decision.route).toBe("AUTO_GUIDANCE");
    expect(decision.requiresSecurePayContext).toBe(false);
  });

  it("honours a direct request for a human", () => {
    expect(classifySupportMessage("Please let me talk to a person").route).toBe("PLUG");
  });

  it("fails unknown questions to a human rather than inventing an answer", () => {
    expect(classifySupportMessage("There is something odd here, can you check?").route).toBe("PLUG");
  });
});
