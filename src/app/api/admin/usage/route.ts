import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { listRecentUsage } from "@/lib/ai/usage";

export async function GET() {
  const { response } = await requireApiCapability("view", "model-config");
  if (response) return response;

  const usage = await listRecentUsage(50);
  return NextResponse.json({ usage });
}
