import { NextResponse } from "next/server";
import type { CommunityAuthorityConnection } from "./authority-connection";
import { CommunityAuthorityError } from "./authority";

export function unavailableCommunityConnection(
  connection: Exclude<CommunityAuthorityConnection, { status: "CONNECTED" }>
) {
  return NextResponse.json(
    {
      error: "SecurePay Community authority is not available for this session",
      authorityStatus: connection.status,
    },
    { status: 503 }
  );
}

export function communityAuthorityFailure(error: unknown, fallback: string) {
  if (error instanceof CommunityAuthorityError) {
    switch (error.code) {
      case "UNAUTHENTICATED":
        return NextResponse.json({ error: "Your SecurePay session is no longer authorised" }, { status: 401 });
      case "FORBIDDEN":
        return NextResponse.json({ error: "SecurePay has not authorised this Community action" }, { status: 403 });
      case "NOT_FOUND":
        return NextResponse.json({ error: "This Community resource is not available" }, { status: 404 });
      case "CONFLICT":
        return NextResponse.json({ error: "This Community state changed. Refresh and try again." }, { status: 409 });
      case "INVALID_TRANSITION":
        return NextResponse.json({ error: "SecurePay rejected this Community state change" }, { status: 422 });
      case "UPSTREAM_ERROR":
        break;
    }
  }

  return NextResponse.json({ error: fallback }, { status: 502 });
}
