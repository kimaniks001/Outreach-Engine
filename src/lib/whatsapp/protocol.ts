import { createHmac, timingSafeEqual } from "node:crypto";

export type WhatsAppInboundKind = "TEXT" | "BUTTON" | "INTERACTIVE" | "UNSUPPORTED";

export interface NormalizedWhatsAppMessage {
  messageId: string;
  from: string;
  sentAt: Date;
  kind: WhatsAppInboundKind;
  body: string | null;
  replyToMessageId: string | null;
  raw: Record<string, unknown>;
}

export function verifyMetaWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=") || !appSecret) return false;
  const suppliedHex = signatureHeader.slice("sha256=".length);
  if (!/^[a-fA-F0-9]{64}$/.test(suppliedHex)) return false;

  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex"), "hex");
  const supplied = Buffer.from(suppliedHex, "hex");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function verifyWebhookChallenge(searchParams: URLSearchParams, verifyToken: string): string | null {
  if (searchParams.get("hub.mode") !== "subscribe") return null;
  if (!verifyToken || searchParams.get("hub.verify_token") !== verifyToken) return null;
  const challenge = searchParams.get("hub.challenge");
  return challenge && challenge.length <= 512 ? challenge : null;
}

export function normalizeWhatsAppWebhook(payload: unknown): NormalizedWhatsAppMessage[] {
  const root = asRecord(payload);
  const entries = asArray(root?.entry);
  const normalized: NormalizedWhatsAppMessage[] = [];

  for (const entryValue of entries) {
    const entry = asRecord(entryValue);
    for (const changeValue of asArray(entry?.changes)) {
      const change = asRecord(changeValue);
      const value = asRecord(change?.value);
      for (const messageValue of asArray(value?.messages)) {
        const message = asRecord(messageValue);
        if (!message) continue;
        const id = stringValue(message.id);
        const from = normalizeAddress(stringValue(message.from));
        if (!id || !from) continue;

        const type = stringValue(message.type) ?? "unsupported";
        const timestampSeconds = Number(stringValue(message.timestamp));
        const sentAt = Number.isFinite(timestampSeconds) && timestampSeconds > 0
          ? new Date(timestampSeconds * 1000)
          : new Date();
        const context = asRecord(message.context);

        normalized.push({
          messageId: id,
          from,
          sentAt,
          ...extractBody(message, type),
          replyToMessageId: stringValue(context?.id) ?? null,
          raw: message,
        });
      }
    }
  }

  return normalized;
}

function extractBody(message: Record<string, unknown>, type: string): Pick<NormalizedWhatsAppMessage, "kind" | "body"> {
  if (type === "text") {
    const text = asRecord(message.text);
    return { kind: "TEXT", body: cleanBody(stringValue(text?.body)) };
  }
  if (type === "button") {
    const button = asRecord(message.button);
    return { kind: "BUTTON", body: cleanBody(stringValue(button?.text) ?? stringValue(button?.payload)) };
  }
  if (type === "interactive") {
    const interactive = asRecord(message.interactive);
    const buttonReply = asRecord(interactive?.button_reply);
    const listReply = asRecord(interactive?.list_reply);
    const body = stringValue(buttonReply?.title) ?? stringValue(listReply?.title) ?? stringValue(buttonReply?.id) ?? stringValue(listReply?.id);
    return { kind: "INTERACTIVE", body: cleanBody(body) };
  }
  return { kind: "UNSUPPORTED", body: null };
}

function cleanBody(value: string | null): string | null {
  if (!value) return null;
  const clean = value.trim();
  if (!clean) return null;
  return clean.slice(0, 6000);
}

function normalizeAddress(value: string | null): string | null {
  if (!value) return null;
  const clean = value.replace(/[^0-9]/g, "");
  return clean.length >= 5 && clean.length <= 80 ? clean : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
