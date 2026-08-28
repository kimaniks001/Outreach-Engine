import { describe, expect, it } from "vitest";
import {
  assertExecutionWindow,
  DistributionExecutionPolicyError,
} from "@/lib/distribution/execution-policy";

describe("distribution execution policy", () => {
  const now = new Date("2026-08-28T12:00:00.000Z");

  it("allows an execution inside its approved window", () => {
    expect(() =>
      assertExecutionWindow(
        {
          startDate: new Date("2026-08-28T11:00:00.000Z"),
          endDate: new Date("2026-08-28T13:00:00.000Z"),
        },
        now
      )
    ).not.toThrow();
  });

  it("fails closed before the approved start time", () => {
    expect(() =>
      assertExecutionWindow(
        { startDate: new Date("2026-08-28T13:00:00.000Z"), endDate: null },
        now
      )
    ).toThrow(DistributionExecutionPolicyError);
  });

  it("fails closed after the approved end time", () => {
    expect(() =>
      assertExecutionWindow(
        { startDate: null, endDate: new Date("2026-08-28T11:00:00.000Z") },
        now
      )
    ).toThrow(DistributionExecutionPolicyError);
  });

  it("rejects an invalid window where end precedes start", () => {
    expect(() =>
      assertExecutionWindow(
        {
          startDate: new Date("2026-08-29T12:00:00.000Z"),
          endDate: new Date("2026-08-27T12:00:00.000Z"),
        },
        now
      )
    ).toThrow(DistributionExecutionPolicyError);
  });
});
