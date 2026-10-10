/** Pull the human-readable part out of a zome call error. */
export function friendlyError(e: unknown): string {
  const message =
    typeof e === "string" ? e : (e as { message?: unknown })?.message?.toString() ?? String(e);
  const guest = message.match(/Guest\("((?:[^"\\]|\\.)*)"\)/);
  if (guest) return guest[1];
  const invalid = message.match(/InvalidCommit error: (.*)$/s);
  if (invalid) return invalid[1].trim();
  return message;
}
