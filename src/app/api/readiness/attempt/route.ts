import { NextResponse } from "next/server";
import { resolveReadinessAuthorityConnection } from "@/lib/readiness/readiness-connection";
import type { ReadinessProgramCode } from "@/lib/readiness/securepay-readiness-client";

const PROGRAM_CODES = new Set<ReadinessProgramCode>(["MARKET_READY", "PROPERTY_SPECIALIST"]);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { programCode?: string; answers?: Record<string, string> }
    | null;

  if (!body?.programCode || !PROGRAM_CODES.has(body.programCode as ReadinessProgramCode)) {
    return NextResponse.json({ error: "Unknown readiness program" }, { status: 422 });
  }
  if (!body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) {
    return NextResponse.json({ error: "Answers are required" }, { status: 422 });
  }

  const connection = await resolveReadinessAuthorityConnection();
  if (connection.status !== "CONNECTED") {
    return NextResponse.json(
      {
        error: "SecurePay readiness authority is not available for this session",
        authorityStatus: connection.status,
      },
      { status: 503 }
    );
  }

  try {
    const attempt = await connection.client.submitAttempt(
      body.programCode as ReadinessProgramCode,
      body.answers
    );
    return NextResponse.json(attempt, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Assessment submission failed" },
      { status: 422 }
    );
  }
}
