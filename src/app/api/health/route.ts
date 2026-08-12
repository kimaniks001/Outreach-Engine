import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { listProviders } from "@/lib/ai/registry";
import { getSafeMode } from "@/lib/safe-mode/state";

// Unauthenticated production readiness/health endpoint — deliberately
// outside PUBLIC_API_PATHS's need for a session because a hosting
// platform's health check runs before any operator can log in. Never
// returns secrets, connection strings, provider keys, or stack traces —
// only booleans/counts/enums. See docs/PRODUCTION_READINESS_REVIEW.md.
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  let databaseOk = false;
  try {
    await db.execute(sql`select 1`);
    databaseOk = true;
  } catch {
    databaseOk = false;
  }

  let aiProviders: { total: number; configured: number; available: number } | null = null;
  let safeMode: "NORMAL" | "SAFE_MODE" | null = null;
  try {
    const providers = await db ? await listProviders() : [];
    aiProviders = {
      total: providers.length,
      configured: providers.filter((p) => p.credentialsConfigured).length,
      available: providers.filter((p) => p.status === "AVAILABLE").length,
    };
    safeMode = await getSafeMode();
  } catch {
    // Database unreachable — aiProviders/safeMode stay null, databaseOk
    // above already reflects the failure.
  }

  const ok = databaseOk;

  return NextResponse.json(
    {
      status: ok ? "OK" : "DEGRADED",
      app: "outreach-engine",
      buildVersion: process.env.NEXT_PUBLIC_BUILD_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
      database: databaseOk ? "REACHABLE" : "UNREACHABLE",
      aiProviders,
      safeMode,
      latencyMs: Date.now() - startedAt,
    },
    { status: ok ? 200 : 503 }
  );
}
