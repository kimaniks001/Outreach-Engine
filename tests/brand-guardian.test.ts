import { describe, expect, it } from "vitest";
import { checkText, resultFromFindings } from "@/lib/brand-guardian/rules";

// Pure, deterministic rule engine tests — no DB, no AI dependency. This is
// the AUTHORITATIVE Brand Guardian check per the Phase 2 brief Section 13.

describe("Brand Guardian rule engine", () => {
  it('blocks "SecurePay is an escrow wallet"', () => {
    const findings = checkText("SecurePay is an escrow wallet for your money.", "coreMessage");
    expect(resultFromFindings(findings)).toBe("BLOCK");
    expect(findings.some((f) => f.reason.includes("escrow"))).toBe(true);
  });

  it("blocks wallet framing", () => {
    const findings = checkText("Download the SecurePay wallet today.", "headline");
    expect(resultFromFindings(findings)).toBe("BLOCK");
  });

  it("blocks bank framing", () => {
    const findings = checkText("SecurePay is a digital bank for Kenyans.", "body");
    expect(resultFromFindings(findings)).toBe("BLOCK");
  });

  it("blocks M-PESA competitor framing", () => {
    const findings = checkText("SecurePay is the M-PESA competitor you've been waiting for.", "body");
    expect(resultFromFindings(findings)).toBe("BLOCK");
  });

  it("blocks ordinary payment app framing", () => {
    const findings = checkText("Just another payment app, but better.", "body");
    expect(resultFromFindings(findings)).toBe("BLOCK");
  });

  it("flags unsupported absolute/compliance claims as REVISE", () => {
    const findings = checkText("SecurePay is 100% safe and legally binding.", "body");
    expect(resultFromFindings(findings)).toBe("REVISE");
    expect(findings.length).toBeGreaterThanOrEqual(2);
  });

  it("flags pricing references as REVISE", () => {
    const findings = checkText("Only KES 50 per transaction, free forever.", "body");
    expect(resultFromFindings(findings)).toBe("REVISE");
  });

  it("passes approved agreement-layer positioning cleanly", () => {
    const findings = checkText(
      "Money should follow the agreement. SecurePay is the agreement layer for money.",
      "coreMessage"
    );
    expect(resultFromFindings(findings)).toBe("PASS");
    expect(findings).toHaveLength(0);
  });

  it("passes the demo campaign tagline", () => {
    const findings = checkText("Agree on the milestone. Let the money follow.", "coreMessage");
    expect(resultFromFindings(findings)).toBe("PASS");
  });

  it("BLOCK takes priority over REVISE when both are present", () => {
    const findings = checkText("Our SecurePay wallet is 100% guaranteed safe.", "body");
    expect(resultFromFindings(findings)).toBe("BLOCK");
  });

  it("every finding carries a doctrine reference and a recommended correction", () => {
    const findings = checkText("SecurePay is a bank.", "body");
    for (const f of findings) {
      expect(f.doctrineReference.length).toBeGreaterThan(0);
      expect(f.recommendedCorrection.length).toBeGreaterThan(0);
    }
  });
});
