import { NextResponse } from "next/server";
import { resolvePlugMarketConnection } from "@/lib/market-network/plug-market-connection";
import {
  customerMarketFailure,
  unavailableMarketConnection,
} from "@/lib/market-network/market-network-api-response";

export async function GET(
  _request: Request,
  context: { params: Promise<{ requestId: string }> }
) {
  const connection = await resolvePlugMarketConnection();
  if (connection.status !== "CONNECTED") return unavailableMarketConnection(connection);
  const { requestId } = await context.params;
  try {
    return NextResponse.json(await connection.client.getCustomerSelection(requestId));
  } catch (error) {
    return customerMarketFailure(error, "Your market selection could not be read right now");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> }
) {
  const connection = await resolvePlugMarketConnection();
  if (connection.status !== "CONNECTED") return unavailableMarketConnection(connection);

  const body = (await request.json().catch(() => null)) as { candidateRef?: string } | null;
  if (!body?.candidateRef?.trim()) {
    return NextResponse.json({ error: "candidateRef is required" }, { status: 422 });
  }

  const { requestId } = await context.params;
  try {
    return NextResponse.json(
      await connection.client.selectCustomerCandidate(requestId, body.candidateRef),
      { status: 201 }
    );
  } catch (error) {
    return customerMarketFailure(error, "This candidate could not be selected right now");
  }
}
