interface WhatsAppSendResult {
  messageId: string;
}

export async function sendWhatsAppText(input: {
  to: string;
  body: string;
  replyToMessageId?: string | null;
}): Promise<WhatsAppSendResult> {
  const body = input.body.trim();
  if (!body || body.length > 4096) throw new Error("WhatsApp text must contain 1-4096 characters");
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeRecipient(input.to),
    type: "text",
    text: { preview_url: false, body },
  };
  if (input.replyToMessageId) payload.context = { message_id: input.replyToMessageId };
  return send(payload);
}

export async function sendWhatsAppTemplate(input: {
  to: string;
  templateName: string;
  languageCode: string;
  components?: unknown[];
}): Promise<WhatsAppSendResult> {
  if (!/^[a-z0-9_]+$/.test(input.templateName)) throw new Error("Invalid WhatsApp template name");
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeRecipient(input.to),
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.languageCode },
      ...(input.components?.length ? { components: input.components } : {}),
    },
  };
  return send(payload);
}

async function send(payload: Record<string, unknown>): Promise<WhatsAppSendResult> {
  const token = requiredEnv("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = requiredEnv("WHATSAPP_PHONE_NUMBER_ID");
  const graphVersion = requiredEnv("WHATSAPP_GRAPH_API_VERSION");
  const baseUrl = (process.env.WHATSAPP_GRAPH_API_BASE_URL || "https://graph.facebook.com").replace(/\/$/, "");

  const response = await fetch(`${baseUrl}/${encodeURIComponent(graphVersion)}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => null) as { messages?: Array<{ id?: string }>; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(`WhatsApp send failed (${response.status}): ${json?.error?.message ?? "unknown error"}`);
  const messageId = json?.messages?.[0]?.id;
  if (!messageId) throw new Error("WhatsApp send succeeded without a message id");
  return { messageId };
}

function normalizeRecipient(value: string): string {
  const clean = value.replace(/[^0-9]/g, "");
  if (clean.length < 5 || clean.length > 20) throw new Error("Invalid WhatsApp recipient");
  return clean;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
