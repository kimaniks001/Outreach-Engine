import { NextResponse } from "next/server";
import { resolveCommunityAuthorityConnection } from "@/lib/community/authority-connection";
import {
  communityAuthorityFailure,
  unavailableCommunityConnection,
} from "@/lib/community/community-api-response";

type MembershipAction = "JOIN" | "REQUEST_JOIN" | "LEAVE";
const ACTIONS = new Set<MembershipAction>(["JOIN", "REQUEST_JOIN", "LEAVE"]);

export async function POST(
  request: Request,
  context: { params: Promise<{ communityId: string }> }
) {
  const connection = await resolveCommunityAuthorityConnection();
  if (connection.status !== "CONNECTED") return unavailableCommunityConnection(connection);

  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  if (!body?.action || !ACTIONS.has(body.action as MembershipAction)) {
    return NextResponse.json({ error: "Choose a supported Community membership action" }, { status: 422 });
  }

  const { communityId } = await context.params;
  try {
    switch (body.action as MembershipAction) {
      case "JOIN":
        return NextResponse.json(await connection.client.join(communityId), { status: 201 });
      case "REQUEST_JOIN":
        return NextResponse.json(await connection.client.requestJoin(communityId), { status: 201 });
      case "LEAVE":
        await connection.client.leave(communityId);
        return NextResponse.json({ status: "LEFT" });
    }
  } catch (error) {
    return communityAuthorityFailure(error, "Your Community membership could not be updated right now");
  }
}
