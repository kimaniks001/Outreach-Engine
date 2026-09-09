import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  normalizeWhatsAppAddress,
  parseWhatsAppIdentityBindingAssertion,
  verifySecurePayBindingSignature,
} from "./identity-binding";

const SECRET = "0123456789abcdef0123456789abcdef";

describe("WhatsApp identity binding assertions", () => {
  it("normalizes a WhatsApp address without treating it as SecurePay identity", () => {
    expect(normalizeWhatsAppAddress("+254 712 345 678")).toBe("254712345678");
  });

  it("accepts an exact HMAC signature over the raw request body", () => {
    const body = JSON.stringify({ assertionId: "assertion-12345678" });
    const digest = createHmac("sha256", SECRET).update(body, "utf8").digest("hex");

    expect(verifySecurePayBindingSignature(body, `sha256=${digest}`, SECRET)).toBe(true);
    expect(verifySecurePayBindingSignature(`${body} `, `sha256=${digest}`, SECRET)).toBe(false);
    expect(verifySecurePayBindingSignature(body, "sha256=deadbeef", SECRET)).toBe(false);
  });

  it("parses only the narrow SecurePay attestation contract", () => {
    expect(parseWhatsAppIdentityBindingAssertion({
      assertionId: "assertion-12345678",
      channel: "WHATSAPP",
      channelAddress: "+254 712 345 678",
      securepayIdentityRef: "KS001ABC",
      action: "BIND",
      authoritySequence: 7,
      occurredAt: "2026-09-09T15:30:00+03:00",
    })).toMatchObject({
      channelAddress: "254712345678",
      securepayIdentityRef: "KS001ABC",
      action: "BIND",
      authoritySequence: 7,
    });
  });

  it("rejects extra fields so callers cannot smuggle new identity authority into the contract", () => {
    expect(() => parseWhatsAppIdentityBindingAssertion({
      assertionId: "assertion-12345678",
      channel: "WHATSAPP",
      channelAddress: "254712345678",
      securepayIdentityRef: "KS001ABC",
      action: "BIND",
      authoritySequence: 7,
      occurredAt: "2026-09-09T15:30:00+03:00",
      verifiedByPhonePossession: true,
    })).toThrow();
  });
});
