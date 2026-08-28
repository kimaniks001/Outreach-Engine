import { describe, expect, it } from "vitest";
import { canAccessSection } from "./sections";
import type { Role } from "./roles";

const allowed: Role[] = ["OWNER", "GROWTH_DIRECTOR", "STRATEGIST", "CONTENT_ENGAGEMENT"];
const denied: Role[] = ["DISTRIBUTION_SALES", "ANALYST"];

describe("Creative Studio section access", () => {
  it.each(allowed)("allows %s into Studio", (role) => {
    expect(canAccessSection(role, "STUDIO")).toBe(true);
  });

  it.each(denied)("keeps %s out of Studio", (role) => {
    expect(canAccessSection(role, "STUDIO")).toBe(false);
  });
});
