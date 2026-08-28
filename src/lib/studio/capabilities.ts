import type { AITaskType } from "@/lib/ai/task-types";
import type { AIModel, AIProvider } from "@/lib/ai/types";

export const STUDIO_LANES = [
  {
    key: "STRATEGY",
    label: "Strategy & campaign thinking",
    taskType: "CAMPAIGN_STRATEGY" as AITaskType,
    description: "Positioning, campaign concepts, briefs and structured choices before production begins.",
    outputs: ["Campaign concept", "Creative brief", "Messaging architecture"],
  },
  {
    key: "COPY",
    label: "Copy & messaging",
    taskType: "CONTENT_COPY" as AITaskType,
    description: "Human market language for ads, WhatsApp, email, landing pages, scripts and calls to action.",
    outputs: ["Ad copy", "WhatsApp copy", "Email", "Landing copy"],
  },
  {
    key: "CREATIVE",
    label: "Creative direction",
    taskType: "CREATIVE_IDEATION" as AITaskType,
    description: "Visual concepts and campaign variants. Current production creates designer-ready briefs, not fake rendered media.",
    outputs: ["Visual concept", "Campaign variants", "Designer brief"],
  },
  {
    key: "IMAGE",
    label: "Image design",
    taskType: "IMAGE_GENERATION" as AITaskType,
    description: "Image-generation models once a provider/model is explicitly approved for SecurePay Studio use.",
    outputs: ["Social card", "Poster", "Display creative"],
  },
  {
    key: "VIDEO",
    label: "Video",
    taskType: "VIDEO_GENERATION" as AITaskType,
    description: "Short-form and campaign video generation when an approved video model is connected.",
    outputs: ["Short video", "Explainer", "Motion creative"],
  },
  {
    key: "AUDIO",
    label: "Audio & voice",
    taskType: "AUDIO_PRODUCTION" as AITaskType,
    description: "Voice, radio and audio production when approved audio providers are available.",
    outputs: ["Voice-over", "Radio script", "Audio explainer"],
  },
  {
    key: "PRESENTATION",
    label: "Presentations & documents",
    taskType: "PRESENTATION_DESIGN" as AITaskType,
    description: "Campaign decks, explainers, event packs and structured presentation material.",
    outputs: ["Presentation", "Sales pack", "Event kit"],
  },
  {
    key: "LOCALISE",
    label: "Translation & localisation",
    taskType: "TRANSLATION_LOCALISATION" as AITaskType,
    description: "Approved language and local-market adaptation without changing the underlying SecurePay claim.",
    outputs: ["Kiswahili variant", "Local market adaptation", "Bilingual copy"],
  },
  {
    key: "CHANNEL",
    label: "Channel adaptation",
    taskType: "CHANNEL_ADAPTATION" as AITaskType,
    description: "Resize and rewrite an approved creative idea for each channel while preserving source meaning.",
    outputs: ["Meta variant", "Google copy", "WhatsApp variant", "Email variant"],
  },
] as const;

export type StudioLane = (typeof STUDIO_LANES)[number];

export interface StudioModelCard {
  model: AIModel;
  provider: AIProvider;
  routable: boolean;
  reason: string;
}

export function describeModelForTask(
  model: AIModel,
  provider: AIProvider,
  taskType: AITaskType
): StudioModelCard {
  const providerAvailable = provider.status === "AVAILABLE";
  const modelApproved = model.enabled && model.approved && model.status === "APPROVED";
  const taskApproved = model.approvedTaskTypes.includes(taskType);
  const routable = providerAvailable && modelApproved && taskApproved;

  let reason: string;
  if (routable) reason = `Approved and available for ${taskType}.`;
  else if (!providerAvailable) reason = `${provider.displayName} is ${provider.status}; Studio will not route live work to it.`;
  else if (!modelApproved) reason = "Model is not both approved and enabled.";
  else reason = `Model is not approved for ${taskType}.`;

  return { model, provider, routable, reason };
}

export function countRoutableModels(
  rows: Array<{ model: AIModel; provider: AIProvider }>,
  taskType: AITaskType
): number {
  return rows.filter(({ model, provider }) => describeModelForTask(model, provider, taskType).routable).length;
}
