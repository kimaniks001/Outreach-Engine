import { NextRequest, NextResponse } from "next/server";
import { requireProductEventIngestionAuth } from "@/lib/product-events/auth";
import { ingestProductEvent } from "@/lib/product-events/ingest";

// The internal, authenticated product-event ingestion boundary — Phase 4
// brief Sections 13/14. No public unauthenticated ingestion. See
// docs/PHASE_4_PRODUCT_EVENT_INTEGRATION.md.
export async function POST(req: NextRequest) {
  const auth = await requireProductEventIngestionAuth(req);
  if (!auth.ok) return auth.response!;

  const json = await req.json().catch(() => null);
  if (json === null) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: "Body must be valid JSON." }, { status: 400 });
  }

  const outcome = await ingestProductEvent(json, auth.actorLabel);

  switch (outcome.status) {
    case "PROCESSED":
      return NextResponse.json({ outcome }, { status: 201 });
    case "DUPLICATE":
      return NextResponse.json({ outcome }, { status: 200 });
    case "REJECTED":
      return NextResponse.json({ outcome }, { status: 400 });
    default:
      return NextResponse.json({ outcome }, { status: 400 });
  }
}
