import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeWhatsAppWebhook, verifyMetaWebhookSignature, verifyWebhookChallenge } from "./protocol";

describe("WhatsApp webhook protocol", () => {
  it("accepts only the configured verification token", () => {
    const ok = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "secret", "hub.challenge": "12345" });
    const bad = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "12345" });
    expect(verifyWebhookChallenge(ok, "secret")).toBe("12345");
    expect(verifyWebhookChallenge(bad, "secret")).toBeNull();
  });

  it("verifies Meta HMAC signatures", () => {
    const raw = JSON.stringify({ hello: "world" });
    const secret = "app-secret";
    const digest = createHmac("sha256", secret).update(raw).digest("hex");
    expect(verifyMetaWebhookSignature(raw, `sha256=${digest}`, secret)).toBe(true);
    expect(verifyMetaWebhookSignature(raw, `sha256=${"0".repeat(64)}`, secret)).toBe(false);
  });

  it("normalizes text, button and interactive replies and ignores status-only callbacks", () => {
    const payload = {
      entry: [{ changes: [{ value: { messages: [
        { id: "wamid.text", from: "+254 700 000 001", timestamp: "1700000000", type: "text", text: { body: " Where is my payment? " } },
        { id: "wamid.button", from: "254700000001", timestamp: "1700000001", type: "button", button: { text: "Help me" }, context: { id: "wamid.notice" } },
        { id: "wamid.interactive", from: "254700000001", timestamp: "1700000002", type: "interactive", interactive: { button_reply: { id: "support", title: "I need help" } } },
      ] } }] }],
    };
    const messages = normalizeWhatsAppWebhook(payload);
    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatchObject({ messageId: "wamid.text", from: "254700000001", kind: "TEXT", body: "Where is my payment?" });
    expect(messages[1]).toMatchObject({ kind: "BUTTON", body: "Help me", replyToMessageId: "wamid.notice" });
    expect(messages[2]).toMatchObject({ kind: "INTERACTIVE", body: "I need help" });
    expect(normalizeWhatsAppWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: "wamid.status" }] } }] }] })).toEqual([]);
  });
});
