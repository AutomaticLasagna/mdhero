import { describe, expect, it, vi } from "vitest";
import { scrollTabsWithWheel } from "../../src/lib/utils/tab-wheel";

function run(overrides = {}, side = false, width = 1000) {
  const event = { deltaY: 50, deltaX: 0, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false, preventDefault: vi.fn(), ...overrides };
  const strip = { scrollLeft: 100, scrollWidth: width, clientWidth: 300 };
  scrollTabsWithWheel(event as unknown as WheelEvent, strip as HTMLElement, side);
  return { event, strip };
}

describe("tab-wheel scrolling", () => {
  it("maps vertical pixel, line and page deltas onto horizontal movement", () => {
    expect(run().strip.scrollLeft).toBe(150);
    expect(run({ deltaY: -2, deltaMode: 1 }).strip.scrollLeft).toBe(68);
    expect(run({ deltaY: 1, deltaMode: 2 }).strip.scrollLeft).toBe(400);
    expect(run().event.preventDefault).toHaveBeenCalledOnce();
  });

  it("leaves trackpads, modified gestures, side tabs and non-overflowing strips alone", () => {
    for (const result of [
      run({ deltaX: 20 }), run({ ctrlKey: true }), run({ metaKey: true }),
      run({ shiftKey: true }), run({ deltaY: 0 }), run({}, true), run({}, false, 300),
    ]) {
      expect(result.strip.scrollLeft).toBe(100);
      expect(result.event.preventDefault).not.toHaveBeenCalled();
    }
  });
});
