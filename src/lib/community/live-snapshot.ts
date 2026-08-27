import {
  CommunityAuthorityError,
  type CommunityAuthorityPort,
  type CommunityDetail,
  type CommunityFeedPost,
  type CommunityJoinRequest,
  type CommunityMembership,
  type CommunitySummary,
} from "./authority";

export interface LiveCommunityItem {
  community: CommunityDetail;
  membership: CommunityMembership | null;
  feed: CommunityFeedPost[];
}

export interface LiveCommunitySnapshot {
  communities: LiveCommunityItem[];
  pendingJoinRequests: CommunityJoinRequest[];
}

/**
 * Builds the Community LIVE read model only from SecurePay-authorized reads.
 *
 * Security remains upstream:
 * - public discovery comes from GET /communities
 * - caller-owned memberships come from GET /communities/me
 * - each detail/feed read is still re-authorized by SecurePayAPI
 *
 * A local union of ids is only a presentation optimization; it never grants
 * access. A 404 caused by a membership/privacy race is dropped without
 * revealing whether the resource was private or removed.
 */
export async function loadLiveCommunitySnapshot(
  authority: CommunityAuthorityPort
): Promise<LiveCommunitySnapshot> {
  const [publicCommunities, mine] = await Promise.all([
    authority.listCommunities(),
    authority.getMyCommunities(),
  ]);

  const membershipById = new Map(
    mine.memberships
      .filter((membership) => membership.status === "ACTIVE")
      .map((membership) => [membership.communityId, membership] as const)
  );

  const publicById = new Map(publicCommunities.map((community) => [community.id, community] as const));
  const visibleIds = new Set<string>([
    ...publicCommunities.map((community) => community.id),
    ...membershipById.keys(),
  ]);

  const items = await Promise.all(
    [...visibleIds].map(async (communityId): Promise<LiveCommunityItem | null> => {
      try {
        const [community, feed] = await Promise.all([
          authority.getCommunity(communityId),
          authority.listFeed(communityId),
        ]);

        return {
          community,
          membership: membershipById.get(communityId) ?? null,
          feed,
        };
      } catch (error) {
        if (error instanceof CommunityAuthorityError && error.code === "NOT_FOUND") {
          return null;
        }
        throw error;
      }
    })
  );

  return {
    communities: items
      .filter((item): item is LiveCommunityItem => item !== null)
      .sort((a, b) => compareCommunityItems(a, b, publicById)),
    pendingJoinRequests: mine.pendingJoinRequests,
  };
}

function compareCommunityItems(
  a: LiveCommunityItem,
  b: LiveCommunityItem,
  publicById: Map<string, CommunitySummary>
): number {
  const aMember = a.membership ? 1 : 0;
  const bMember = b.membership ? 1 : 0;
  if (aMember !== bMember) return bMember - aMember;

  const aPublic = publicById.has(a.community.id) ? 1 : 0;
  const bPublic = publicById.has(b.community.id) ? 1 : 0;
  if (aPublic !== bPublic) return bPublic - aPublic;

  return a.community.name.localeCompare(b.community.name);
}
