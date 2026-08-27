import { describe, expect, it, vi } from "vitest";
import {
  CommunityAuthorityError,
  type CommunityAuthorityPort,
  type CommunityDetail,
  type CommunityFeedPost,
  type CommunitySummary,
  type MyCommunities,
} from "@/lib/community/authority";
import { loadLiveCommunitySnapshot } from "@/lib/community/live-snapshot";

function summary(id: string, name: string): CommunitySummary {
  return {
    id,
    name,
    description: `${name} description`,
    visibility: "PUBLIC",
    membershipPolicy: "OPEN",
    status: "ACTIVE",
    memberCount: 10,
    createdAt: "2026-08-27T10:00:00Z",
  };
}

function detail(id: string, name: string, callerRole: CommunityDetail["callerRole"]): CommunityDetail {
  return {
    ...summary(id, name),
    visibility: id === "private-member" ? "PRIVATE" : "PUBLIC",
    rules: "Be useful and respectful.",
    updatedAt: "2026-08-27T11:00:00Z",
    callerRole,
  };
}

function post(communityId: string, id: string): CommunityFeedPost {
  return {
    id,
    communityId,
    authorIdentityId: "author-id",
    title: `Post ${id}`,
    body: "Authorized feed body",
    visibility: "PUBLIC",
    publishedAt: "2026-08-27T12:00:00Z",
    sourceType: null,
    sourceReferenceId: null,
  };
}

function authority(overrides: Partial<CommunityAuthorityPort>): CommunityAuthorityPort {
  const unimplemented = () => Promise.reject(new Error("not implemented in test"));
  return {
    listCommunities: unimplemented,
    getMyCommunities: unimplemented,
    getCommunity: unimplemented,
    listMembers: unimplemented,
    listFeed: unimplemented,
    join: unimplemented,
    requestJoin: unimplemented,
    approveJoinRequest: unimplemented,
    rejectJoinRequest: unimplemented,
    leave: unimplemented,
    publishFeedPost: unimplemented,
    unpublishFeedPost: unimplemented,
    ...overrides,
  } as CommunityAuthorityPort;
}

describe("loadLiveCommunitySnapshot", () => {
  it("unions public discovery with caller-owned private memberships, while SecurePay re-authorizes every detail/feed read", async () => {
    const mine: MyCommunities = {
      memberships: [
        {
          communityId: "private-member",
          role: "MEMBER",
          status: "ACTIVE",
          joinedAt: "2026-08-20T08:00:00Z",
        },
      ],
      pendingJoinRequests: [],
    };

    const getCommunity = vi.fn(async (id: string) =>
      id === "private-member" ? detail(id, "Private Crew", "MEMBER") : detail(id, "Public Market", null)
    );
    const listFeed = vi.fn(async (id: string) => [post(id, `${id}-post`)]);

    const result = await loadLiveCommunitySnapshot(
      authority({
        listCommunities: async () => [summary("public-market", "Public Market")],
        getMyCommunities: async () => mine,
        getCommunity,
        listFeed,
      })
    );

    expect(result.communities.map((item) => item.community.id)).toEqual([
      "private-member",
      "public-market",
    ]);
    expect(result.communities[0]?.membership?.role).toBe("MEMBER");
    expect(result.communities[1]?.membership).toBeNull();
    expect(getCommunity).toHaveBeenCalledWith("private-member");
    expect(getCommunity).toHaveBeenCalledWith("public-market");
    expect(listFeed).toHaveBeenCalledTimes(2);
  });

  it("drops a resource that becomes NOT_FOUND without revealing whether privacy or lifecycle caused it", async () => {
    const result = await loadLiveCommunitySnapshot(
      authority({
        listCommunities: async () => [summary("gone", "Gone")],
        getMyCommunities: async () => ({ memberships: [], pendingJoinRequests: [] }),
        getCommunity: async () => {
          throw new CommunityAuthorityError("NOT_FOUND", 404, "Community resource not found");
        },
        listFeed: async () => [],
      })
    );

    expect(result.communities).toEqual([]);
  });

  it("does not swallow authentication failures", async () => {
    await expect(
      loadLiveCommunitySnapshot(
        authority({
          listCommunities: async () => {
            throw new CommunityAuthorityError("UNAUTHENTICATED", 401, "Unauthorized");
          },
          getMyCommunities: async () => ({ memberships: [], pendingJoinRequests: [] }),
        })
      )
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
  });
});
