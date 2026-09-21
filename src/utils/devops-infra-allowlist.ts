const NUMERIC_ID = /^\d+$/;

export interface DiscordChannelAllowlistEntry {
  guildId: string;
  channelId: string;
}

export function parseDiscordChannelAllowlist(
  raw: string,
): DiscordChannelAllowlistEntry[] {
  const unique = new Map<string, DiscordChannelAllowlistEntry>();
  for (const token of raw.split(",")) {
    const parts = token.trim().split(":");
    if (
      parts.length !== 2 ||
      !NUMERIC_ID.test(parts[0]) ||
      !NUMERIC_ID.test(parts[1])
    ) {
      continue;
    }
    const entry = { guildId: parts[0], channelId: parts[1] };
    unique.set(`${entry.guildId}:${entry.channelId}`, entry);
  }
  return [...unique.values()];
}

export function parseFacebookPageAllowlist(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(",")
        .map((token) => token.trim())
        .filter((token) => NUMERIC_ID.test(token)),
    ),
  ];
}
