import {
  CommunityAuthorityError,
  type CommunityAuthorityErrorCode,
  type CommunityAuthorityPort,
  type CommunityDetail,
  type CommunityFeedPost,
  type CommunityJoinRequest,
  type CommunityMember,
  type CommunityMembership,
  type CommunitySummary,
  type MyCommunities,
  type PublishCommunityFeedPostInput,
} from "./authority";

export interface SecurePayCommunityClientOptions {
  baseUrl: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}

/**
 * Caller-scoped adapter to SecurePayAPI MW-07 Community authority.
 *
 * IMPORTANT: accessToken must belong to the current SecurePay identity.
 * There is deliberately no service-token fallback because Community membership
 * and moderator/organiser authority are caller-specific backend truth.
 */
export class SecurePayCommunityClient implements CommunityAuthorityPort {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SecurePayCommunityClientOptions) {
    const baseUrl = options.baseUrl.trim().replace(/\/+$/, "");
    const accessToken = options.accessToken.trim();

    if (!baseUrl) throw new Error("SecurePay Community baseUrl is required");
    if (!accessToken) throw new Error("Caller-scoped SecurePay accessToken is required");

    this.baseUrl = baseUrl;
    this.accessToken = accessToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  listCommunities(): Promise<CommunitySummary[]> {
    return this.request("/communities");
  }

  getMyCommunities(): Promise<MyCommunities> {
    return this.request("/communities/me");
  }

  getCommunity(communityId: string): Promise<CommunityDetail> {
    return this.request(`/communities/${encodeURIComponent(communityId)}`);
  }

  listMembers(communityId: string): Promise<CommunityMember[]> {
    return this.request(`/communities/${encodeURIComponent(communityId)}/members`);
  }

  listFeed(communityId: string): Promise<CommunityFeedPost[]> {
    return this.request(`/communities/${encodeURIComponent(communityId)}/feed`);
  }

  join(communityId: string): Promise<CommunityMembership> {
    return this.request(`/communities/${encodeURIComponent(communityId)}/join`, { method: "POST" });
  }

  requestJoin(communityId: string): Promise<CommunityJoinRequest> {
    return this.request(`/communities/${encodeURIComponent(communityId)}/join-requests`, {
      method: "POST",
    });
  }

  approveJoinRequest(communityId: string, requestId: string): Promise<CommunityJoinRequest> {
    return this.request(
      `/communities/${encodeURIComponent(communityId)}/join-requests/${encodeURIComponent(requestId)}/approve`,
      { method: "POST" }
    );
  }

  rejectJoinRequest(communityId: string, requestId: string): Promise<CommunityJoinRequest> {
    return this.request(
      `/communities/${encodeURIComponent(communityId)}/join-requests/${encodeURIComponent(requestId)}/reject`,
      { method: "POST" }
    );
  }

  async leave(communityId: string): Promise<void> {
    await this.request<void>(`/communities/${encodeURIComponent(communityId)}/leave`, {
      method: "POST",
    });
  }

  publishFeedPost(
    communityId: string,
    input: PublishCommunityFeedPostInput
  ): Promise<CommunityFeedPost> {
    return this.request(`/communities/${encodeURIComponent(communityId)}/feed`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  unpublishFeedPost(communityId: string, postId: string): Promise<CommunityFeedPost> {
    return this.request(
      `/communities/${encodeURIComponent(communityId)}/feed/${encodeURIComponent(postId)}/unpublish`,
      { method: "POST" }
    );
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.accessToken}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw await toAuthorityError(response);
    }

    if (response.status === 204) return undefined as T;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new CommunityAuthorityError(
        "UPSTREAM_ERROR",
        response.status,
        "SecurePay Community authority returned a non-JSON response"
      );
    }

    return (await response.json()) as T;
  }
}

async function toAuthorityError(response: Response): Promise<CommunityAuthorityError> {
  const code = mapStatus(response.status);
  let upstreamMessage = "";

  try {
    const body = (await response.json()) as { message?: unknown; error?: unknown };
    if (typeof body.message === "string") upstreamMessage = body.message;
    else if (typeof body.error === "string") upstreamMessage = body.error;
  } catch {
    // Privacy-preserving status is enough. Do not require an upstream body.
  }

  const safeMessage =
    response.status === 404
      ? "Community resource not found"
      : upstreamMessage || `SecurePay Community authority returned HTTP ${response.status}`;

  return new CommunityAuthorityError(code, response.status, safeMessage);
}

function mapStatus(status: number): CommunityAuthorityErrorCode {
  switch (status) {
    case 401:
      return "UNAUTHENTICATED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 422:
      return "INVALID_TRANSITION";
    default:
      return "UPSTREAM_ERROR";
  }
}
