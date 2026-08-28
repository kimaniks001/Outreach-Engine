import { createHash } from "node:crypto";
import type { Campaign, CreativeVariant } from "@/lib/db/schema";
import type { CreativeSnapshot } from "./schema";

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function fingerprintCreativeVariant(variant: CreativeVariant): string {
  return hash({
    id: variant.id,
    variantLabel: variant.variantLabel,
    angle: variant.angle,
    headline: variant.headline,
    body: variant.body,
    cta: variant.cta,
    imageConcept: variant.imageConcept,
    aspectRatioSuggestions: variant.aspectRatioSuggestions,
    carouselConcept: variant.carouselConcept,
    demoConceptNote: variant.demoConceptNote,
    rationale: variant.rationale,
  });
}

export function creativeSnapshot(variants: CreativeVariant[]): CreativeSnapshot[] {
  return [...variants]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((variant) => ({
      id: variant.id,
      variantLabel: variant.variantLabel,
      fingerprint: fingerprintCreativeVariant(variant),
    }));
}

export function fingerprintCampaignBundle(campaign: Campaign, variants: CreativeVariant[]): string {
  return hash({
    campaign: {
      id: campaign.id,
      name: campaign.name,
      objective: campaign.objective,
      targetAudience: campaign.targetAudience,
      positioningAngle: campaign.positioningAngle,
      coreMessage: campaign.coreMessage,
      recommendedChannelTypes: campaign.recommendedChannelTypes,
      cta: campaign.cta,
      destinationConcept: campaign.destinationConcept,
      creativeBrief: campaign.creativeBrief,
      riskLevel: campaign.riskLevel,
    },
    creative: creativeSnapshot(variants),
  });
}
