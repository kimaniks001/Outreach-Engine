import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { listDistributionProviders } from "@/lib/distribution/providers";

export async function GET() {
  const { response } = await requireApiCapability("view", "distribution");
  if (response) return response;

  const providers = listDistributionProviders();
  return NextResponse.json({ providers });
}
