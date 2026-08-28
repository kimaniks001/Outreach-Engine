import { NextResponse } from "next/server";
import { resolvePlugMarketConnection } from "@/lib/market-network/plug-market-connection";
import {
  SecurePayMarketRequestError,
  type OpportunityDecision,
} from "@/lib/market-network/securepay-plug-market-client";

export async function POST(
  request: Request,
  context: { params: Promise<{ offerId: string }> }
) {
  const connection = await resolvePlugMarketConnection();
  if (connection.status !== "CONNECTED") {
    return NextResponse.json(
      {
        error: "SecurePay opportunity authority is not available for this session",
        authorityStatus: connection.status,
      },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { decision?: OpportunityDecision }
    | null;
  if (body?.decision !== "ACCEPTED" && body?.decision !== "DECLINED") {
    return NextResponse.json(
      { error: "Choose whether you are interested or not interested" },
      { status: 422 }
    );
  }

  const { offerId } = await context.params;
  try {
    const offer = await connection.client.decideOpportunity(offerId, body.decision);
    return NextResponse.json(offer);
  } catch (error) {
    if (error instanceof SecurePayMarketRequestError) {
      if (error.status === 404) {
        return NextResponse.json(
          { error: "This opportunity is no longer available to you" },
          { status: 404 }
        );
      }
      if (error.status === 409) {
        return NextResponse.json(
          { error: "This opportunity is no longer accepting interest" },
          { status: 409 }
        );
      }
    }
    return NextResponse.json(
      { error: "Your interest could not be updated right now" },
      { status: 502 }
    );
  }
}
