import { describe, expect, it } from "vitest";
import { planSupportDrain, supportHealthState, type SupportRuntimeHealth } from "./runtime-health";

function health(overrides: Partial<SupportRuntimeHealth> = {}): SupportRuntimeHealth {
  return {
    triageReady: 0,
    triageProcessing: 0,
    triageStale: 0,
    outboxReady: 0,
    outboxSending: 0,
    outboxUncertain: 0,
    waitingIdentity: 0,
    plugWaiting: 0,
    staffWaiting: 0,
    sensitiveWaiting: 0,
    oldestTriageSeconds: 0,
    oldestOutboxSeconds: 0,
    ...overrides,
  };
}

describe("WhatsApp support runtime pressure", () => {
  it("keeps normal batches small when queues are calm", () => {
    expect(planSupportDrain(health({ triageReady: 20, outboxReady: 40 }))).toEqual({
      triageLimit: 25,
      outboundLimit: 50,
      pressure: "NORMAL",
    });
  });

  it("widens drainage under sustained backlog without exceeding worker hard limits", () => {
    expect(planSupportDrain(health({ triageReady: 700, outboxReady: 1200 }))).toEqual({
      triageLimit: 100,
      outboundLimit: 200,
      pressure: "HIGH",
    });
  });

  it("treats uncertain outbound delivery as action-required rather than replay-safe", () => {
    expect(supportHealthState(health({ outboxUncertain: 1 }))).toBe("ACTION_REQUIRED");
  });

  it("flags old queue work even when counts are small", () => {
    expect(supportHealthState(health({ oldestTriageSeconds: 301 }))).toBe("ACTION_REQUIRED");
  });

  it("marks a growing but young queue as degraded", () => {
    expect(supportHealthState(health({ triageReady: 150 }))).toBe("DEGRADED");
  });
});
