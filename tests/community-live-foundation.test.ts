import { describe, expect, it } from "vitest";
import {
  circles,
  communityPosts,
  communityPrinciples,
  communityProfile,
} from "@/lib/community/foundation";
import { canAccessSection, sectionsForRole } from "@/lib/rbac/sections";

describe("Community LIVE foundation boundaries", () => {
  it("keeps money out of the community identity surface", () => {
    const profileText = JSON.stringify(communityProfile).toLowerCase();
    expect(profileText).not.toContain("lifetime share");
    expect(profileText).not.toContain("earnings");
    expect(communityPrinciples.moneyBoundary.toLowerCase()).toContain("never displays personal earnings");
  });

  it("models Circles as explicit visibility spaces", () => {
    expect(circles.length).toBeGreaterThanOrEqual(4);
    for (const circle of circles) {
      expect(circle.whoCanSee.length).toBeGreaterThan(10);
      expect(["PRIVATE", "INVITE_ONLY", "OPEN_TO_NETWORK"]).toContain(circle.visibility);
    }
  });

  it("requires a separate market-insight representation instead of treating all posts as intelligence", () => {
    const insightPosts = communityPosts.filter((post) => post.insight);
    expect(insightPosts.length).toBeGreaterThan(0);
    expect(insightPosts.length).toBeLessThan(communityPosts.length);
    for (const post of insightPosts) {
      expect(post.insight?.anonymised.length).toBeGreaterThan(10);
      expect(post.insight?.teams.length).toBeGreaterThan(0);
    }
  });
});

describe("Community LIVE current staff access", () => {
  it("is visible to community-relevant current staff roles", () => {
    for (const role of ["OWNER", "GROWTH_DIRECTOR", "STRATEGIST", "CONTENT_ENGAGEMENT", "DISTRIBUTION_SALES"] as const) {
      expect(canAccessSection(role, "COMMUNITY_LIVE")).toBe(true);
      expect(sectionsForRole(role)).toContain("COMMUNITY_LIVE");
    }
  });

  it("does not add the social surface to the ANALYST role", () => {
    expect(canAccessSection("ANALYST", "COMMUNITY_LIVE")).toBe(false);
  });
});
