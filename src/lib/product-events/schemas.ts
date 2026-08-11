import { z } from "zod";
import { schema } from "@/lib/db";

// Inbound schema for the product-event ingestion boundary — Phase 4 brief
// Section 14. Deliberately strict: metadata is capped to a shallow
// string/number/boolean map (no nested objects, no arrays) so an
// integrator cannot smuggle arbitrary free-form or sensitive data through
// it. Malformed input never mutates anything — see src/lib/product-events/ingest.ts.

export const profileRefSchema = z
  .object({
    profileId: z.string().uuid().optional(),
    ksNumber: z.string().min(1).max(64).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(3).max(32).optional(),
    sessionToken: z.string().min(1).max(128).optional(),
    campaignClickRef: z.string().min(1).max(128).optional(),
    partnerRef: z.string().min(1).max(128).optional(),
  })
  .refine((ref) => Object.values(ref).some((v) => v !== undefined), {
    message: "profileRef must include at least one identifier (profileId, ksNumber, email, phone, sessionToken, campaignClickRef, or partnerRef).",
  });

export const metadataSchema = z
  .record(z.union([z.string().max(500), z.number(), z.boolean()]))
  .refine((obj) => Object.keys(obj).length <= 20, { message: "metadata may not have more than 20 keys." })
  .default({});

export const productEventIngestSchema = z.object({
  source: z.string().min(1).max(64),
  externalEventId: z.string().min(1).max(128),
  idempotencyKey: z.string().min(1).max(160).optional(),
  productEventType: z.enum(schema.productEventTypeEnum.enumValues),
  occurredAt: z.string().datetime(),
  schemaVersion: z.string().max(16).default("1"),
  profileRef: profileRefSchema,
  organizationId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  metadata: metadataSchema,
  isDemo: z.boolean().default(false),
});

export type ProductEventIngestInput = z.infer<typeof productEventIngestSchema>;
