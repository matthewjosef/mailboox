import { describe, expect, it, vi } from "vitest";

import { checkForUpdate, compareVersions, findUpdate, versionBranch } from "./updates";

const list = {
  tools: [
    {
      id: "mailboox",
      versionBranch: "0.1.x",
      versions: [
        { version: "0.1.4", changelog: "four" },
        { version: "0.1.10", changelog: "ten" },
        { version: "0.1.5", changelog: "five" },
      ],
    },
    { id: "mailboox", versionBranch: "0.2.x", versions: [{ version: "0.2.0" }] },
  ],
};

describe("compareVersions", () => {
  it("compares numerically, not as text", () => {
    expect(compareVersions("0.1.10", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("0.1.4", "0.1.4")).toBe(0);
    expect(compareVersions("0.1.4", "0.2.0")).toBeLessThan(0);
  });
});

describe("findUpdate", () => {
  it("offers the newest version in the running branch only", () => {
    expect(versionBranch("0.1.4")).toBe("0.1.x");
    // 0.2.x is a different network in Moss, so it isn't an in-place update.
    expect(findUpdate(list, "0.1.4")).toEqual({ version: "0.1.10", changelog: "ten" });
  });

  it("says nothing when up to date or when the list is unexpected", () => {
    expect(findUpdate(list, "0.1.10")).toBeNull();
    expect(findUpdate({ nope: 1 }, "0.1.4")).toBeNull();
    expect(findUpdate(null, "0.1.4")).toBeNull();
  });
});

describe("checkForUpdate", () => {
  it("never throws when offline", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(checkForUpdate("0.1.4", offline as any)).resolves.toBeNull();
  });

  it("reads the published list", async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify(list)));
    await expect(checkForUpdate("0.1.5", ok as any)).resolves.toEqual({ version: "0.1.10", changelog: "ten" });
  });
});
