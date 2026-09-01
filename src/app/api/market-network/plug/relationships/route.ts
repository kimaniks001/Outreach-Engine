import { NextResponse } from "next/server";
import { resolvePlugMarketConnection } from "@/lib/market-network/plug-market-connection";
import {
  customerMarketFailure,
  readPagination,
  unavailableMarketConnection,
} from "@/lib/market-network/market-network-api-response";

export async function GET(request: Request) {
  const connection = await resolvePlugMarketConnection();
  if (connection.status !== "CONNECTED") return unavailableMarketConnection(connection);
  const page = readPagination(request);
  if (!page) return NextResponse.json({ error: "Invalid pagination" }, { status: 400 });

  try {
    return NextResponse.json(
      await connection.client.getPlugRelationships(page.limit, page.offset)
    );
  } catch (error) {
    return customerMarketFailure(error, "Your active market relationships could not be read right now");
  }
}
