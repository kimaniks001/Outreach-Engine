import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { listRetentionReviewCandidates } from "@/lib/commercial-memory/retention";

export async function GET() {
  const { response } = await requireApiCapability("view", "audience");
  if (response) return response;

  return NextResponse.json({ candidates: await listRetentionReviewCandidates() });
}
