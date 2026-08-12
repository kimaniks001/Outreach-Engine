import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { recordAuditEvent } from "@/lib/audit/log";

// Constant-time secret comparison — a plain `===` leaks timing
// information proportional to the number of matching leading bytes,
// which is a real (if narrow) side channel for a shared secret compared
// over the network. See docs/PRODUCTION_READINESS_REVIEW.md.
function secretsMatch(provided: string, configured: string): boolean {
  const providedBuf = Buffer.from(provided);
  const configuredBuf = Buffer.from(configured);
  if (providedBuf.length !== configuredBuf.length) return false;
  return timingSafeEqual(providedBuf, configuredBuf);
}

// Product-event ingestion boundary auth — Phase 4 brief Section 14: "an
// internal authenticated endpoint... Do not require live SecurePay API
// credentials to complete Phase 4." Two paths, either is sufficient:
//
// 1. A shared secret header (PRODUCT_EVENT_INGESTION_SECRET), for a real
//    server-to-server SecurePay integration — never required, so the app
//    works with zero credentials, matching every other Phase 1-3
//    credential-optional boundary.
// 2. An authenticated OWNER session (same "only Owner writes commercial
//    memory" precedent Phase 3 established for audience/distribution) —
//    lets an Owner drive ingestion from the UI/simulator with no secret
//    configured at all.
//
// No public unauthenticated ingestion under any configuration.

export interface IngestionAuthResult {
  ok: boolean;
  actorUserId: string | null;
  actorLabel: string;
  response: NextResponse | null;
}

export async function requireProductEventIngestionAuth(req: NextRequest): Promise<IngestionAuthResult> {
  const configuredSecret = process.env.PRODUCT_EVENT_INGESTION_SECRET;
  if (configuredSecret) {
    const provided = req.headers.get("x-outreach-ingestion-secret");
    if (provided && secretsMatch(provided, configuredSecret)) {
      return { ok: true, actorUserId: null, actorLabel: "system:product-event-ingestion", response: null };
    }
  }

  const user: CurrentUser | null = await getCurrentUser();
  if (user && user.role === "OWNER") {
    return { ok: true, actorUserId: user.id, actorLabel: user.email, response: null };
  }

  await recordAuditEvent({
    eventType: "ACCESS_DENIED",
    actorUserId: user?.id ?? null,
    targetType: "capability",
    targetId: "product-event-ingestion",
    metadata: { hasSecretConfigured: !!configuredSecret },
  });

  return {
    ok: false,
    actorUserId: null,
    actorLabel: "unauthenticated",
    response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }),
  };
}
