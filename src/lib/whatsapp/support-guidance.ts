import type { SecurePaySupportAgreementContext, SecurePaySupportContext } from "@/lib/trader-support/securepay-support-context-client";
import type { SupportIntent } from "./triage";

const SECUREPAY_WEB = "https://securepay.ke";

export function approvedGuidance(intent: SupportIntent): string | null {
  switch (intent) {
    case "GENERAL":
      return `You're chatting with SecurePay support. I can help explain updates, agreements, milestones, access and next steps here on WhatsApp. Agreements are built and progressed on ${SECUREPAY_WEB}.`;
    case "AGREEMENT":
      return `Yes — agreements are built on SecurePay. Open ${SECUREPAY_WEB} to start or continue the agreement. You can keep asking me questions here while you do it.`;
    case "FEEDBACK":
      return "Thank you — I've recorded that feedback for the SecurePay team. If there is something you need help with now, tell me in your own words.";
    default:
      return null;
  }
}

export function buildContextAnswer(input: {
  intent: SupportIntent;
  aggregateText: string;
  context: SecurePaySupportContext;
}): { status: "ANSWER"; body: string; sourceRef: string } | { status: "AMBIGUOUS"; reason: string } {
  const agreement = selectAgreement(input.context, input.aggregateText);
  if (!agreement) {
    return {
      status: "AMBIGUOUS",
      reason: input.context.agreements.length === 0
        ? "No current agreement is available in the minimum SecurePay support projection."
        : "More than one agreement could match the conversation and the customer did not identify one clearly.",
    };
  }

  const reference = agreement.publicReference;
  const nextAction = agreement.nextActions[0];
  const deadline = nextAction?.deadline ? ` The current deadline shown by SecurePay is ${formatDeadline(nextAction.deadline)}.` : "";
  const attention = agreement.attentionRequired ? " SecurePay currently marks this agreement as needing your attention." : "";

  if (input.intent === "DELIVERY_MILESTONE") {
    const next = nextAction
      ? ` Your next SecurePay step is: ${nextAction.reason}.${deadline}`
      : " There is no participant next action listed for you in the current support view.";
    return {
      status: "ANSWER",
      sourceRef: `${input.context.caseRef}:${reference}`,
      body: `I can see agreement ${reference} is currently ${humanize(agreement.status)}.${attention}${next} You can review or act on it at ${SECUREPAY_WEB}. If you tell me what part is unclear, I can explain it here.`,
    };
  }

  const next = nextAction ? ` Your next SecurePay step is: ${nextAction.reason}.${deadline}` : "";
  return {
    status: "ANSWER",
    sourceRef: `${input.context.caseRef}:${reference}`,
    body: `I can see agreement ${reference} is currently ${humanize(agreement.status)}.${attention}${next} Any agreement action itself happens on ${SECUREPAY_WEB}.`,
  };
}

function selectAgreement(context: SecurePaySupportContext, aggregateText: string): SecurePaySupportAgreementContext | null {
  const text = normalize(aggregateText);
  const explicit = context.agreements.filter((agreement) => {
    const ref = normalize(agreement.publicReference);
    const title = normalize(agreement.title);
    return (ref.length >= 4 && text.includes(ref)) || (title.length >= 5 && text.includes(title));
  });
  if (explicit.length === 1) return explicit[0] ?? null;
  if (context.agreements.length === 1) return context.agreements[0] ?? null;
  return null;
}

function humanize(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ");
}

function formatDeadline(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().replace("T", " ").replace(/:\d{2}\.\d{3}Z$/, " UTC");
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
