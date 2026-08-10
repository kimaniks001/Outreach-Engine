import { z } from "zod";
import { runStructuredTask, type StructuredTaskResult } from "./run-structured-task";

// docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md Sections 16-18. Image-first,
// not image-only: this produces creative BRIEFS (headline/body/CTA/image
// concept), never a generated image. Max 3 variants per generation action.

const variantSchema = z.object({
  variantLabel: z.string().min(1),
  angle: z.string().min(1),
  headline: z.string().min(1),
  body: z.string().min(1),
  cta: z.string().min(1),
  imageConcept: z.string().min(1),
  rationale: z.string().min(1),
});

const variantsResponseSchema = z.object({
  variants: z.array(variantSchema).min(1).max(3),
});

export type CreativeVariantDraft = z.infer<typeof variantSchema>;

export interface GenerateCreativeInput {
  campaign: {
    name: string;
    objective: string;
    targetAudience: string;
    positioningAngle: string;
    coreMessage: string;
    cta: string;
  };
  requestedByUserId: string;
}

const SYSTEM_PROMPT = `You are the Content & Creative Studio for the SecurePay Outreach Engine. Strategy is image-first, not image-only.

SecurePay's core positioning (never violate): "Money should follow the agreement." / "SecurePay is the agreement layer for money." Never describe SecurePay as a wallet, bank, M-PESA competitor, ordinary payment app, or escrow product.

Image-first rules: clean visuals, one primary idea per image, minimal text baked into the image itself (headline/body/CTA are separate fields), strong SecurePay identity, mobile-first readability, Kenyan commercial context where relevant, no fake product screenshots.

Produce exactly 3 creative variants:
- "A" with angle "Problem-led"
- "B" with angle "Agreement-led"
- "C" with angle "Outcome-led"

Respond with ONLY JSON: { "variants": [ { "variantLabel": string, "angle": string, "headline": string, "body": string, "cta": string, "imageConcept": string, "rationale": string } ] }
imageConcept is a creative brief/instruction for a designer (visual direction), not a generated image.`;

function buildUserPrompt(input: GenerateCreativeInput["campaign"]): string {
  return `CAMPAIGN_NAME: ${input.name}
OBJECTIVE: ${input.objective}
TARGET_AUDIENCE: ${input.targetAudience}
POSITIONING_ANGLE: ${input.positioningAngle}
CORE_MESSAGE: ${input.coreMessage}
CTA: ${input.cta}

Generate the 3 creative variants per the JSON contract.`;
}

export async function generateCreativeVariantsViaAI(
  input: GenerateCreativeInput
): Promise<StructuredTaskResult<{ variants: CreativeVariantDraft[] }>> {
  return runStructuredTask({
    taskType: "CREATIVE_IDEATION",
    system: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(input.campaign),
    schema: variantsResponseSchema,
    requestedByUserId: input.requestedByUserId,
    maxOutputTokens: 1500,
  });
}

// Always-available fallback — Phase 2 brief Section 16: "Phase 2 succeeds
// if it can produce a high-quality IMAGE CREATIVE BRIEF even before
// automated image generation is wired... Do not let image-generation
// integration become the blocker." Used whenever AI is unavailable,
// malformed, or errors, so Creative Studio never simply fails.
export function buildDeterministicVariants(
  campaign: GenerateCreativeInput["campaign"]
): CreativeVariantDraft[] {
  return [
    {
      variantLabel: "A",
      angle: "Problem-led",
      headline: `Tired of ${campaign.objective.toLowerCase()}?`,
      body: `${campaign.targetAudience} deserve better. ${campaign.coreMessage}`,
      cta: campaign.cta,
      imageConcept:
        "Single clean visual of the friction/problem moment (e.g. a tense handoff or delayed payment), mobile-first, minimal text baked in, strong SecurePay mark in a corner.",
      rationale: "Opens on the audience's real pain point before introducing SecurePay as the fix.",
    },
    {
      variantLabel: "B",
      angle: "Agreement-led",
      headline: "Money should follow the agreement.",
      body: `${campaign.coreMessage} SecurePay is the agreement layer for money.`,
      cta: campaign.cta,
      imageConcept:
        "Two parties visibly reaching agreement (handshake or signed-terms motif), clean and calm, one clear focal point, no fake app screenshots.",
      rationale: "Leads directly with SecurePay's core positioning statement for maximum on-doctrine safety.",
    },
    {
      variantLabel: "C",
      angle: "Outcome-led",
      headline: `${campaign.objective} — done right.`,
      body: `${campaign.coreMessage} ${campaign.cta}.`,
      cta: campaign.cta,
      imageConcept:
        "A satisfied outcome moment (completed milestone, released funds), bright and simple, readable at a glance on mobile.",
      rationale: "Shows the positive end-state to build desire and trust before the CTA.",
    },
  ];
}
