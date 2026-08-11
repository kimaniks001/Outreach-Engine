import { randomUUID } from "node:crypto";
import { schema } from "@/lib/db";
import { ingestProductEvent, type IngestOutcome } from "./ingest";
import { sweepAbandonedJourneys } from "@/lib/journeys/abandonment";
import { recomputeNextBestAction } from "@/lib/next-best-action/engine";

// Deterministic test/demo product-event adapter — Phase 4 brief Section
// 31. Proves the complete SECUREPAY → INGESTION → PROFILE/JOURNEY →
// ATTRIBUTION → NEXT-BEST-ACTION flow without any live SecurePay
// integration. Every event this adapter produces is forced isDemo: true
// and sourced as "simulator" — never presented as real product activity
// anywhere in the UI (SIMULATED / DEMO labeled everywhere it surfaces).

type ProductEventType = (typeof schema.productEventTypeEnum.enumValues)[number];

export interface SimulateEventInput {
  productEventType: ProductEventType;
  profileRef: {
    profileId?: string;
    ksNumber?: string;
    email?: string;
    phone?: string;
    sessionToken?: string;
    campaignClickRef?: string;
    partnerRef?: string;
  };
  campaignId?: string;
  organizationId?: string;
  metadata?: Record<string, string | number | boolean>;
  occurredAt?: Date;
}

export async function simulateProductEvent(input: SimulateEventInput): Promise<IngestOutcome> {
  return ingestProductEvent(
    {
      source: "simulator",
      externalEventId: randomUUID(),
      productEventType: input.productEventType,
      occurredAt: (input.occurredAt ?? new Date()).toISOString(),
      schemaVersion: "1",
      profileRef: input.profileRef,
      campaignId: input.campaignId,
      organizationId: input.organizationId,
      metadata: input.metadata ?? {},
      isDemo: true,
    },
    "simulator"
  );
}

// Simulates time passing for abandonment-detection demo purposes without
// waiting in real time — sweeps using a shifted "now" rather than mutating
// stored timestamps. Recomputes next-best-action for every profile whose
// journey abandoned as a result.
export async function simulateElapsedTime(hoursElapsed: number): Promise<string[]> {
  const shiftedNow = new Date(Date.now() + hoursElapsed * 60 * 60 * 1000);
  const affectedProfileIds = await sweepAbandonedJourneys(shiftedNow);
  for (const profileId of affectedProfileIds) {
    await recomputeNextBestAction(profileId);
  }
  return affectedProfileIds;
}
