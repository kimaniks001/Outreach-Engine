import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { listModelsWithProviders } from "@/lib/ai/registry";

export async function GET() {
  const { response } = await requireApiCapability("view", "model-config");
  if (response) return response;

  const rows = await listModelsWithProviders();
  return NextResponse.json({ models: rows });
}
