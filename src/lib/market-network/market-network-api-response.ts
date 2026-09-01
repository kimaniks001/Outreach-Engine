import { NextResponse } from "next/server";
import type { PlugMarketConnection } from "./plug-market-connection";
import { SecurePayMarketRequestError } from "./securepay-plug-market-client";

export function unavailableMarketConnection(
  connection: Exclude<PlugMarketConnection, { status: "CONNECTED" }>
) {
  return NextResponse.json(
    {
      error: "SecurePay Market Network authority is not available for this session",
      authorityStatus: connection.status,
    },
    { status: 503 }
  );
}

export function customerMarketFailure(error: unknown, fallback: string) {
  if (error instanceof SecurePayMarketRequestError) {
    if (error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: "Your SecurePay market session is not authorised" }, { status: 401 });
    }
    if (error.status === 404) {
      return NextResponse.json({ error: "This market record is not available to you" }, { status: 404 });
    }
    if (error.status === 409) {
      return NextResponse.json(
        { error: "This market state changed. Refresh before trying again." },
        { status: 409 }
      );
    }
    if (error.status === 400 || error.status === 422) {
      return NextResponse.json({ error: "SecurePay rejected this market request" }, { status: error.status });
    }
  }
  return NextResponse.json({ error: fallback }, { status: 502 });
}

export function readPagination(request: Request): { limit: number; offset: number } | null {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) {
    return null;
  }
  return { limit, offset };
}
