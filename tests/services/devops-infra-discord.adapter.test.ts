import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../src/config/env";
import { DevopsInfraDiscordAdapter } from "../../src/services/devops-infra-discord.adapter";
import { parseDiscordChannelAllowlist } from "../../src/utils/devops-infra-allowlist";

const NOW = new Date("2026-09-21T03:00:00.000Z");
const TOKEN = "test-discord-token";
const originalToken = env.DISCORD_BOT_TOKEN;
const originalAllowlist = env.DISCORD_CHANNEL_ALLOWLIST;

function http(
  handle: (url: string) => Promise<{ data: unknown }> = async () => ({ data: [] }),
) {
  return {
    get: vi.fn(
      async (
        url: string,
        _config: { headers: Record<string, string>; params?: Record<string, unknown> },
      ) => handle(url),
    ),
  };
}

describe("parseDiscordChannelAllowlist", () => {
  it("parses pairs and ignores malformed values", () => {
    expect(parseDiscordChannelAllowlist("1:2, 3:4")).toEqual([
      { guildId: "1", channelId: "2" },
      { guildId: "3", channelId: "4" },
    ]);
    expect(
      parseDiscordChannelAllowlist("abc,1:,:2,1:2:3,good:not-a-number"),
    ).toEqual([]);
    expect(parseDiscordChannelAllowlist(" \t ")).toEqual([]);
  });
});

describe("DevopsInfraDiscordAdapter", () => {
  beforeEach(() => {
    env.DISCORD_BOT_TOKEN = TOKEN;
    env.DISCORD_CHANNEL_ALLOWLIST = "100:200,300:400";
  });

  afterEach(() => {
    env.DISCORD_BOT_TOKEN = originalToken;
    env.DISCORD_CHANNEL_ALLOWLIST = originalAllowlist;
  });

  it.each([
    ["", "100:200"],
    [TOKEN, ""],
    [TOKEN, "malformed"],
  ])("is disabled for incomplete configuration", async (token, allowlist) => {
    env.DISCORD_BOT_TOKEN = token;
    env.DISCORD_CHANNEL_ALLOWLIST = allowlist;
    const client = http();
    const adapter = new DevopsInfraDiscordAdapter(client, () => NOW);

    expect(adapter.isEnabled()).toBe(false);
    await expect(adapter.collect()).resolves.toEqual({
      items: [],
      successfulSourceCount: 0,
      failedSources: [],
    });
    expect(client.get).not.toHaveBeenCalled();
  });

  it("requests only the latest messages from allowlisted channels", async () => {
    const client = http();

    const result = await new DevopsInfraDiscordAdapter(client, () => NOW).collect();

    expect(client.get).toHaveBeenCalledTimes(2);
    for (const channelId of ["200", "400"]) {
      expect(client.get).toHaveBeenCalledWith(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bot ${TOKEN}`,
          },
          params: { limit: 50 },
        },
      );
    }
    expect(
      client.get.mock.calls.every(
        ([url]) =>
          /^https:\/\/discord\.com\/api\/v10\/channels\/(200|400)\/messages$/.test(
            String(url),
          ),
      ),
    ).toBe(true);
    expect(result.successfulSourceCount).toBe(2);
  });

  it("maps valid human messages and rejects empty, bot, and foreign-channel messages", async () => {
    env.DISCORD_CHANNEL_ALLOWLIST = "100:200";
    const client = http(async () => ({
      data: [
        {
          id: "900",
          channel_id: "200",
          content: "  Restarting the rollout fixed the stuck deployment.  ",
          timestamp: "2026-09-21T01:00:00.000Z",
          author: { username: "infra-helper", bot: false },
        },
        {
          id: "901",
          channel_id: "200",
          content: " ",
          timestamp: "2026-09-21T01:01:00.000Z",
          author: { username: "empty" },
        },
        {
          id: "902",
          channel_id: "200",
          content: "automated",
          timestamp: "2026-09-21T01:02:00.000Z",
          author: { username: "bot", bot: true },
        },
        {
          id: "903",
          channel_id: "999",
          content: "foreign",
          timestamp: "2026-09-21T01:03:00.000Z",
          author: { username: "intruder" },
        },
      ],
    }));

    const result = await new DevopsInfraDiscordAdapter(client, () => NOW).collect();

    expect(result).toEqual({
      items: [
        {
          id: "900",
          sourceId: "discord",
          sourceName: "Discord #200",
          title: "Restarting the rollout fixed the stuck deployment.",
          url: "https://discord.com/channels/100/200/900",
          summary: "Restarting the rollout fixed the stuck deployment.",
          body: "Restarting the rollout fixed the stuck deployment.",
          author: "infra-helper",
          publishedAt: "2026-09-21T01:00:00.000Z",
          collectedAt: NOW.toISOString(),
          discoveredAt: NOW.toISOString(),
          discoveryChannel: "discord",
          communityKey: "discord:200",
          sourceQuotaKey: "discord:200",
          sourceTextStatus: "full",
          answers: [],
        },
      ],
      successfulSourceCount: 1,
      failedSources: [],
    });
  });

  it("isolates a forbidden channel while retaining successful channels", async () => {
    const client = http(async (url) => {
      if (url.includes("/channels/200/")) {
        throw Object.assign(new Error("forbidden"), { response: { status: 403 } });
      }
      return { data: [] };
    });

    const result = await new DevopsInfraDiscordAdapter(client, () => NOW).collect();

    expect(result).toEqual({
      items: [],
      successfulSourceCount: 1,
      failedSources: ["discord:200"],
    });
    expect(JSON.stringify(client.get.mock.calls)).toContain(TOKEN);
  });
});
