import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";

describe("password hashing", () => {
  it("hashes never equal the plaintext and verify correctly", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toBe("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a different hash each time (salted)", async () => {
    const a = await hashPassword("same input");
    const b = await hashPassword("same input");
    expect(a).not.toBe(b);
  });
});

describe("session tokens", () => {
  it("round-trips a valid token", async () => {
    const token = await createSessionToken({ userId: "user-123" });
    const payload = await verifySessionToken(token);
    expect(payload).toEqual({ userId: "user-123" });
  });

  it("rejects a tampered token", async () => {
    const token = await createSessionToken({ userId: "user-123" });
    const tampered = token.slice(0, -2) + (token.endsWith("a") ? "bb" : "aa");
    const payload = await verifySessionToken(tampered);
    expect(payload).toBeNull();
  });

  it("rejects garbage input without throwing", async () => {
    const payload = await verifySessionToken("not-a-real-token");
    expect(payload).toBeNull();
  });

  it("rejects an expired token", async () => {
    // Sign directly with a 1-second expiry to avoid depending on the
    // module's fixed session length.
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1s")
      .setSubject("user-123")
      .sign(secret);

    await new Promise((resolve) => setTimeout(resolve, 1200));

    const payload = await verifySessionToken(token);
    expect(payload).toBeNull();
  });
});
