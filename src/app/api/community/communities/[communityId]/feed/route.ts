import { NextResponse } from "next/server";
import type { CommunityFeedVisibility } from "@/lib/community/authority";
import { resolveCommunityAuthorityConnection } from "@/lib/community/authority-connection";
import {
  communityAuthorityFailure,
  unavailableCommunityConnection,
} from "@/lib/community/community-api-response";

const VISIBILITIES = new Set<CommunityFeedVisibility>(["PUBLIC", "MEMBER"]);

export async function POST(
  request: Request,
  context: { params: Promise<{ communityId: string }> }
) {
  const connection = await resolveCommunityAuthorityConnection();
  if (connection.status !== "CONNECTED") return unavailableCommunityConnection(connection);

  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    body?: unknown;
    visibility?: unknown;
  } | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const postBody = typeof body?.body === "string" ? body.body.trim() : "";
  const visibility = body?.visibility;

  if (
    title.length < 1 ||
    title.length > 120 ||
    postBody.length < 1 ||
    postBody.length > 5000 ||
    typeof visibility !== "string" ||
    !VISIBILITIES.has(visibility as CommunityFeedVisibility)
  ) {
    return NextResponse.json(
      { error: "Add a title, a message and a supported visibility" },
      { status: 422 }
    );
  }

  const { communityId } = await context.params;
  try {
    const post = await connection.client.publishFeedPost(communityId, {
      title,
      body: postBody,
      visibility: visibility as CommunityFeedVisibility,
    });
    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    return communityAuthorityFailure(error, "Your Community post could not be published right now");
  }
}
