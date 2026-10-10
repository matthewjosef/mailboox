import { describe, expect, it } from "vitest";

import { distanceKm, describeDistance, pinCenter, roundPin } from "./geo";

describe("roundPin", () => {
  it("keeps only hundredths of a degree, so a precise spot never leaves the device", () => {
    expect(roundPin(45.61234, -122.67891)).toEqual({ lat_centi: 4561, lng_centi: -12268 });
    expect(pinCenter({ lat_centi: 4561, lng_centi: -12268 })).toEqual([45.61, -122.68]);
  });
});

describe("distances", () => {
  it("computes great-circle distance between rounded pins", () => {
    const a = { lat_centi: 4561, lng_centi: -12268 };
    const b = { lat_centi: 4561 + 9, lng_centi: -12268 }; // 0.09° north ≈ 10 km
    expect(distanceKm(a, b)).toBeCloseTo(10.0, 0);
  });

  it("describes distances without false precision", () => {
    expect(describeDistance(0.4)).toBe("Very close by");
    expect(describeDistance(1.6)).toBe("About 2 km away");
    expect(describeDistance(12.2)).toBe("About 12 km away");
  });
});
