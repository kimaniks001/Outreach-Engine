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
    return NextResponse.json(await connection.client.getCustomerRelationship(requestId));
  } catch (error) {
    return customerMarketFailure(error, "Your market relationship could not be read right now");
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ requestId: string }> }
) {
  const connection = await resolvePlugMarketConnection();
  if (connection.status !== "CONNECTED") return unavailableMarketConnection(connection);
  const { requestId } = await context.params;
  try {
    return NextResponse.json(await connection.client.openCustomerRelationship(requestId), {
      status: 201,
    });
  } catch (error) {
    return customerMarketFailure(error, "Your selected market relationship could not be opened right now");
  }
}
