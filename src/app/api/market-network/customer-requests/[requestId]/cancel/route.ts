import { NextResponse } from "next/server";
import { resolvePlugMarketConnection } from "@/lib/market-network/plug-market-connection";
import {
  customerMarketFailure,
  unavailableMarketConnection,
} from "@/lib/market-network/market-network-api-response";

export async function POST(
  _request: Request,
  context: { params: Promise<{ requestId: string }> }
) {
  const connection = await resolvePlugMarketConnection();
  if (connection.status !== "CONNECTED") return unavailableMarketConnection(connection);
  const { requestId } = await context.params;
  try {
    return NextResponse.json(await connection.client.cancelCustomerRequest(requestId));
  } catch (error) {
    return customerMarketFailure(error, "This market request could not be cancelled right now");
  }
}
