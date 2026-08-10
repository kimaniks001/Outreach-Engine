import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { listProviders } from "@/lib/ai/registry";

export async function GET() {
  const { response } = await requireApiCapability("view", "model-config");
  if (response) return response;

  const providers = await listProviders();
  return NextResponse.json({ providers });
}
