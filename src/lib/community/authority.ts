export type CommunityVisibility = "PUBLIC" | "PRIVATE";
export type CommunityMembershipPolicy = "OPEN" | "APPROVAL_REQUIRED";
export type CommunityStatus = "ACTIVE" | "ARCHIVED";
export type CommunityMembershipRole = "MEMBER" | "MODERATOR" | "ORGANISER";
export type CommunityMembershipStatus = "ACTIVE" | "LEFT";
export type CommunityFeedVisibility = "PUBLIC" | "MEMBER";
export type CommunityJoinRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface CommunitySummary {
  id: string;
  name: string;
  description: string;
  visibility: CommunityVisibility;
  membershipPolicy: CommunityMembershipPolicy;
  status: CommunityStatus;
  memberCount: number;
  createdAt: string;
}

export interface CommunityDetail extends CommunitySummary {
  rules: string;
  updatedAt: string;
  callerRole: CommunityMembershipRole | null;
}

/**
 * Privacy-safe projection returned to another member. SecurePayAPI does not
 * expose KS Number, display name or contact detail here.
 */
export interface CommunityMember {
  identityId: string;
  role: CommunityMembershipRole;
  joinedAt: string;
}

/** Caller-owned membership response from MW-07. */
export interface CommunityMembership {
  communityId: string;
  role: CommunityMembershipRole;
  status: CommunityMembershipStatus;
  joinedAt: string;
}

/** Caller-owned join request response. Requester identity is not echoed. */
export interface CommunityJoinRequest {
  id: string;
  communityId: string;
  status: CommunityJoinRequestStatus;
  requestedAt: string;
  decidedAt: string | null;
}

export interface MyCommunities {
  memberships: CommunityMembership[];
  pendingJoinRequests: CommunityJoinRequest[];
}

export interface CommunityFeedPost {
  id: string;
  communityId: string;
  authorIdentityId: string;
  title: string;
  body: string;
  visibility: CommunityFeedVisibility;
  publishedAt: string;
  sourceType: string | null;
  sourceReferenceId: string | null;
}

export interface PublishCommunityFeedPostInput {
  title: string;
  body: string;
  visibility: CommunityFeedVisibility;
  sourceType?: string;
  sourceReferenceId?: string;
}

export interface CommunityAuthorityPort {
  listCommunities(): Promise<CommunitySummary[]>;
  getMyCommunities(): Promise<MyCommunities>;
  getCommunity(communityId: string): Promise<CommunityDetail>;
  listMembers(communityId: string): Promise<CommunityMember[]>;
  listFeed(communityId: string): Promise<CommunityFeedPost[]>;
  join(communityId: string): Promise<CommunityMembership>;
  requestJoin(communityId: string): Promise<CommunityJoinRequest>;
  approveJoinRequest(communityId: string, requestId: string): Promise<CommunityJoinRequest>;
  rejectJoinRequest(communityId: string, requestId: string): Promise<CommunityJoinRequest>;
  leave(communityId: string): Promise<void>;
  publishFeedPost(
    communityId: string,
    input: PublishCommunityFeedPostInput
  ): Promise<CommunityFeedPost>;
  unpublishFeedPost(communityId: string, postId: string): Promise<CommunityFeedPost>;
}

export type CommunityAuthorityErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "UPSTREAM_ERROR";

export class CommunityAuthorityError extends Error {
  constructor(
    public readonly code: CommunityAuthorityErrorCode,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "CommunityAuthorityError";
  }
}

export function mayModerateCommunity(role: CommunityMembershipRole | null | undefined): boolean {
  return role === "MODERATOR" || role === "ORGANISER";
}

export function canSeeMemberOnlyFeed(role: CommunityMembershipRole | null | undefined): boolean {
  return role === "MEMBER" || role === "MODERATOR" || role === "ORGANISER";
}
