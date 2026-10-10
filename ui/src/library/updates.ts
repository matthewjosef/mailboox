// Tell people when a newer MailBoox is out, and how to update without starting a new, empty library.

/** The list Moss itself reads for MailBoox updates. */
export const TOOL_LIST_URL =
  "https://raw.githubusercontent.com/matthewjosef/mailboox/master/curation/lists/tool-list-0.16.json";

export interface AvailableUpdate {
  version: string;
  changelog: string | null;
}

function parts(version: string): number[] {
  return version.split(/[.-]/).slice(0, 3).map((p) => Number.parseInt(p, 10) || 0);
}

/** Negative when a < b, positive when a > b (major.minor.patch only). */
export function compareVersions(a: string, b: string): number {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** "0.1.4" → "0.1.x": Moss only updates a Tool in place within its version branch. */
export function versionBranch(version: string): string {
  const [major, minor] = parts(version);
  return `${major}.${minor}.x`;
}

/** The newest version in the running branch, if it's newer than what's running. */
export function findUpdate(toolList: unknown, running: string): AvailableUpdate | null {
  const tools = (toolList as { tools?: unknown })?.tools;
  if (!Array.isArray(tools)) return null;
  const branch = versionBranch(running);
  const tool = tools.find((t) => t?.id === "mailboox" && t?.versionBranch === branch);
  if (!tool || !Array.isArray(tool.versions)) return null;
  let best: AvailableUpdate | null = null;
  for (const v of tool.versions) {
    if (typeof v?.version !== "string" || compareVersions(v.version, running) <= 0) continue;
    if (!best || compareVersions(v.version, best.version) > 0)
      best = { version: v.version, changelog: typeof v.changelog === "string" ? v.changelog : null };
  }
  return best;
}

/** Never throws: an offline or blocked check just means no banner. */
export async function checkForUpdate(running: string, fetchFn: typeof fetch = fetch): Promise<AvailableUpdate | null> {
  try {
    const res = await fetchFn(TOOL_LIST_URL, { cache: "no-store" });
    if (!res.ok) return null;
    return findUpdate(await res.json(), running);
  } catch {
    return null;
  }
}
