import { describe, expect, it, vi } from "vitest";
import { CommunityAuthorityError, canSeeMemberOnlyFeed, mayModerateCommunity } from "@/lib/community/authority";
import { resolveCommunityAuthorityConnection } from "@/lib/community/authority-connection";
import { SecurePayCommunityClient } from "@/lib/community/securepay-community-client";
import type { SecurePayIdentityBridge } from "@/lib/community/identity-bridge";

describe("Community authority role semantics", () => {
  it("keeps moderation scoped to backend ORGANISER/MODERATOR roles", () => {
    expect(mayModerateCommunity("ORGANISER")).toBe(true);
    expect(mayModerateCommunity("MODERATOR")).toBe(true);
    expect(mayModerateCommunity("MEMBER")).toBe(false);
    expect(mayModerateCommunity(null)).toBe(false);
  });

  it("allows member-only feed only to active membership roles", () => {
    expect(canSeeMemberOnlyFeed("MEMBER")).toBe(true);
    expect(canSeeMemberOnlyFeed("MODERATOR")).toBe(true);
    expect(canSeeMemberOnlyFeed("ORGANISER")).toBe(true);
    expect(canSeeMemberOnlyFeed(undefined)).toBe(false);
  });
});

describe("Community authority connection", () => {
  it("fails closed when the SecurePay API base URL is missing", async () => {
    const bridge: SecurePayIdentityBridge = {
      async getCurrentIdentity() {
        throw new Error("identity bridge should not be called without a base URL");
      },
    };

    await expect(resolveCommunityAuthorityConnection(bridge, " ")).resolves.toMatchObject({
      status: "BASE_URL_UNCONFIGURED",
    });
  });

  it("fails closed when there is no caller-scoped SecurePay identity", async () => {
    const bridge: SecurePayIdentityBridge = {
      async getCurrentIdentity() {
        return null;
      },
    };

    await expect(
      resolveCommunityAuthorityConnection(bridge, "https://securepay.test")
    ).resolves.toMatchObject({ status: "IDENTITY_BRIDGE_UNAVAILABLE" });
  });

  it("connects only when the caller identity and token are supplied", async () => {
    const bridge: SecurePayIdentityBridge = {
      async getCurrentIdentity() {
        return {
          identityId: "identity-1",
          ksNumber: "KS-DEMO-1",
          accessToken: "caller-token",
        };
      },
    };

    const result = await resolveCommunityAuthorityConnection(bridge, "https://securepay.test");
    expect(result.status).toBe("CONNECTED");
    if (result.status === "CONNECTED") {
      expect(result.identity.identityId).toBe("identity-1");
      expect(result.client).toBeInstanceOf(SecurePayCommunityClient);
    }
  });
});

describe("SecurePayCommunityClient", () => {
  it("propagates the caller-scoped SecurePay bearer token", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://securepay.test/communities");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer caller-token");
      return new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const client = new SecurePayCommunityClient({
      baseUrl: "https://securepay.test/",
      accessToken: "caller-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(client.listCommunities()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves backend 404 non-enumeration without leaking an upstream private-community message", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: "Private community exists but you are not a member" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      })
    );

    const client = new SecurePayCommunityClient({
      baseUrl: "https://securepay.test",
      accessToken: "caller-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    try {
      await client.getCommunity("hidden-community-id");
      throw new Error("expected getCommunity to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(CommunityAuthorityError);
      const authorityError = error as CommunityAuthorityError;
      expect(authorityError.code).toBe("NOT_FOUND");
      expect(authorityError.status).toBe(404);
      expect(authorityError.message).toBe("Community resource not found");
      expect(authorityError.message).not.toContain("Private community");
    }
  });

  it("does not allow construction without a caller token", () => {
    expect(
      () =>
        new SecurePayCommunityClient({
          baseUrl: "https://securepay.test",
          accessToken: " ",
        })
    ).toThrow("Caller-scoped SecurePay accessToken is required");
  });

  it("uses caller authority for join, leave and deliberate feed publishing", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer caller-token");
      expect(init?.method).toBe("POST");

      if (path.endsWith("/join")) {
        return Response.json({
          communityId: "community-1",
          role: "MEMBER",
          status: "ACTIVE",
          joinedAt: "2026-09-01T10:00:00Z",
        });
      }
      if (path.endsWith("/leave")) return new Response(null, { status: 204 });

      expect(path).toBe("https://securepay.test/communities/community-1/feed");
      expect(JSON.parse(String(init?.body))).toEqual({
        title: "A useful update",
        body: "Shared deliberately with the Community.",
        visibility: "MEMBER",
      });
      return Response.json({
        id: "post-1",
        communityId: "community-1",
        authorIdentityId: "caller-identity",
        title: "A useful update",
        body: "Shared deliberately with the Community.",
        visibility: "MEMBER",
        publishedAt: "2026-09-01T10:01:00Z",
        sourceType: null,
        sourceReferenceId: null,
      });
    });

    const client = new SecurePayCommunityClient({
      baseUrl: "https://securepay.test",
      accessToken: "caller-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    await client.join("community-1");
    await client.publishFeedPost("community-1", {
      title: "A useful update",
      body: "Shared deliberately with the Community.",
      visibility: "MEMBER",
    });
    await client.leave("community-1");

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
