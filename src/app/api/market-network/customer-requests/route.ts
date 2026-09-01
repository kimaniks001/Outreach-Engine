import { NextResponse } from "next/server";
import { resolvePlugMarketConnection } from "@/lib/market-network/plug-market-connection";
import {
  customerMarketFailure,
  unavailableMarketConnection,
} from "@/lib/market-network/market-network-api-response";
import type { CustomerMarketRequestType } from "@/lib/market-network/securepay-plug-market-client";

const REQUEST_TYPES = new Set<CustomerMarketRequestType>([
  "GENERAL_SECUREPAY_HELP",
  "PROPERTY_JOURNEY_HELP",
]);

export async function POST(request: Request) {
  const connection = await resolvePlugMarketConnection();
  if (connection.status !== "CONNECTED") return unavailableMarketConnection(connection);

  const body = (await request.json().catch(() => null)) as { requestType?: string } | null;
  if (!body?.requestType || !REQUEST_TYPES.has(body.requestType as CustomerMarketRequestType)) {
    return NextResponse.json({ error: "Choose a supported kind of market help" }, { status: 422 });
  }

  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
  if (!idempotencyKey || idempotencyKey.length > 100) {
    return NextResponse.json({ error: "A valid Idempotency-Key is required" }, { status: 400 });
  }

  try {
    const created = await connection.client.createCustomerRequest(
      body.requestType as CustomerMarketRequestType,
      idempotencyKey
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return customerMarketFailure(error, "Your market help request could not be created right now");
  }
}
