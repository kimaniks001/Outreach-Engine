import { describe, expect, it, vi } from "vitest";
import { SecurePayAuthClient } from "@/lib/community/securepay-auth-client";
import { selectCommunityActor } from "@/lib/community/community-actor";

describe("SecurePayAuthClient", () => {
  it("uses the existing KS Number password flow without inventing an Outreach market password", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://securepay.test/auth/login");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        ksNumber: "KS123",
        password: "secret",
      });
      return Response.json({
        challengeToken: "challenge",
        expiresAt: "2026-08-27T13:30:00Z",
      });
    });

    const client = new SecurePayAuthClient("https://securepay.test/", fetchMock as typeof fetch);
    await expect(client.begin({ ksNumber: "KS123", password: "secret" })).resolves.toMatchObject({
      challengeToken: "challenge",
    });
  });

  it("refreshes through the SecurePay refresh-session contract", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://securepay.test/auth/refresh");
      expect(JSON.parse(String(init?.body))).toEqual({ refreshToken: "refresh-1" });
      return Response.json({
        accessToken: "access-2",
        accessTokenExpiresAt: "2026-08-27T14:00:00Z",
        refreshToken: "refresh-2",
        refreshTokenExpiresAt: "2026-08-28T14:00:00Z",
      });
    });

    const client = new SecurePayAuthClient("https://securepay.test", fetchMock as typeof fetch);
    await expect(client.refresh("refresh-1")).resolves.toMatchObject({
      accessToken: "access-2",
      refreshToken: "refresh-2",
    });
  });

  it("logs out with the caller bearer token", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer access-1");
      return new Response(null, { status: 204 });
    });

    const client = new SecurePayAuthClient("https://securepay.test", fetchMock as typeof fetch);
    await expect(client.logout("access-1")).resolves.toBeUndefined();
  });
});

describe("Community actor selection", () => {
  it("does not convert a SecurePay identity into Plug, Master or staff authority", () => {
    const actor = selectCommunityActor(null, {
      ksNumber: "KS123",
      accessToken: "caller-token",
    });

    expect(actor).toMatchObject({
      kind: "SECUREPAY",
      name: "KS123",
    });
    expect(actor).not.toHaveProperty("role");
    expect(actor).not.toHaveProperty("staffUser");
  });
});
