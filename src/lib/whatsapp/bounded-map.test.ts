import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./bounded-map";

describe("bounded WhatsApp ingress parallelism", () => {
  it("processes 1,000 independent items without loss and never exceeds the configured width", async () => {
    const items = Array.from({ length: 1_000 }, (_, index) => index);
    let active = 0;
    let peak = 0;
    const seen = new Set<number>();

    const output = await mapWithConcurrency(items, 8, async (item) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      seen.add(item);
      active -= 1;
      return item * 2;
    });

    expect(seen.size).toBe(1_000);
    expect(output).toHaveLength(1_000);
    expect(output[0]).toBe(0);
    expect(output[999]).toBe(1_998);
    expect(peak).toBe(8);
  });

  it("keeps result order stable even when completion order differs", async () => {
    const output = await mapWithConcurrency([0, 1, 2, 3, 4, 5], 3, async (item) => {
      for (let spin = 0; spin < 5 - item; spin += 1) await Promise.resolve();
      return `result-${item}`;
    });
    expect(output).toEqual(["result-0", "result-1", "result-2", "result-3", "result-4", "result-5"]);
  });
});
