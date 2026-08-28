import { NextResponse } from "next/server";
import { resolvePlugMarketConnection } from "@/lib/market-network/plug-market-connection";

export async function POST() {
  const connection = await resolvePlugMarketConnection();
  if (connection.status !== "CONNECTED") {
    return NextResponse.json(
      {
        error: "SecurePay Plug market authority is not available for this session",
        authorityStatus: connection.status,
      },
      { status: 503 }
    );
  }

  try {
    const profile = await connection.client.enterMarket();
    return NextResponse.json(profile, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Market entry could not be recorded" },
      { status: 422 }
    );
  }
}
