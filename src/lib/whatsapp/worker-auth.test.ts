import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { authorizeSupportWorker } from "./worker-auth";

afterEach(() => {
  delete process.env.SUPPORT_WORKER_SECRET;
});

describe("WhatsApp support worker auth", () => {
  it("fails closed when no worker secret is configured", () => {
    const req = new NextRequest("https://outreach.example/api/internal/support/whatsapp/drain", {
      method: "POST",
      headers: { authorization: "Bearer anything" },
    });
    expect(authorizeSupportWorker(req)).toBe(false);
  });

  it("requires the exact bearer secret", () => {
    process.env.SUPPORT_WORKER_SECRET = "test-support-worker-secret-123456";
    const bad = new NextRequest("https://outreach.example/api/internal/support/whatsapp/drain", {
      method: "POST",
      headers: { authorization: "Bearer wrong-secret" },
    });
    const good = new NextRequest("https://outreach.example/api/internal/support/whatsapp/drain", {
      method: "POST",
      headers: { authorization: "Bearer test-support-worker-secret-123456" },
    });
    expect(authorizeSupportWorker(bad)).toBe(false);
    expect(authorizeSupportWorker(good)).toBe(true);
  });
});
