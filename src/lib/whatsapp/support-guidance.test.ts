import { describe, expect, it } from "vitest";
import { approvedGuidance, buildContextAnswer } from "./support-guidance";
import type { SecurePaySupportContext } from "@/lib/trader-support/securepay-support-context-client";

function context(agreementCount = 1): SecurePaySupportContext {
  return {
    traderRef: "KS12345",
    traderDisplayName: "Trader",
    identityStatus: "ACTIVE",
    caseRef: "WA:case-123456",
    retrievedAt: "2026-09-09T12:00:00Z",
    agreements: Array.from({ length: agreementCount }, (_, index) => ({
      publicReference: `SP-REF-${index + 1}`,
      title: index === 0 ? "Kitchen cabinets" : "Roofing work",
      status: "ACTIVE",
      agreementType: "KEY_CONTRACT",
      participantRole: "BUYER",
      participantStatus: "CONFIRMED",
      nextDeadline: "2026-09-10T12:00:00Z",
      attentionRequired: index === 0,
      nextActions: [{
        actionCode: "REVIEW_MILESTONE",
        reason: "Review the current milestone",
        deadline: "2026-09-10T12:00:00Z",
        attentionClass: "HIGH",
      }],
      completion: { completed: false, status: "IN_PROGRESS", reasonCodes: [], completedAt: null },
    })),
  };
}

describe("WhatsApp support guidance", () => {
  it("keeps agreement creation on securepay.ke", () => {
    expect(approvedGuidance("AGREEMENT")).toContain("securepay.ke");
  });

  it("answers from one unambiguous authoritative agreement", () => {
    const result = buildContextAnswer({
      intent: "DELIVERY_MILESTONE",
      aggregateText: "What happens with the milestone?",
      context: context(1),
    });
    expect(result.status).toBe("ANSWER");
    if (result.status === "ANSWER") {
      expect(result.body).toContain("SP-REF-1");
      expect(result.body).toContain("Review the current milestone");
      expect(result.body).toContain("securepay.ke");
    }
  });

  it("refuses to guess when several agreements could match", () => {
    const result = buildContextAnswer({
      intent: "AGREEMENT",
      aggregateText: "What happens next?",
      context: context(2),
    });
    expect(result.status).toBe("AMBIGUOUS");
  });

  it("uses an explicit agreement reference when several exist", () => {
    const result = buildContextAnswer({
      intent: "AGREEMENT",
      aggregateText: "What happens next on SP-REF-2?",
      context: context(2),
    });
    expect(result.status).toBe("ANSWER");
    if (result.status === "ANSWER") expect(result.body).toContain("SP-REF-2");
  });
});
