import { NextRequest, NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { whatShouldSecurePayDoNext } from "@/lib/growth-director/engine";

// The first-class "What should SecurePay do next?" query — Phase 5 brief
// Section 19.
export async function GET(req: NextRequest) {
  const { response } = await requireApiCapability("view", "analytics");
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit")) || 7;
  const items = await whatShouldSecurePayDoNext(limit);
  return NextResponse.json({ items });
}
