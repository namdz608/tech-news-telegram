import axios from "axios";
import { env } from "../config/env";
import type { DevopsInfraSourceItem } from "../types/devops-infra";
import {
  parseDiscordChannelAllowlist,
  type DiscordChannelAllowlistEntry,
} from "../utils/devops-infra-allowlist";
import { compactText } from "../utils/text";
import type {
  DevopsInfraSourceAdapter,
  DevopsInfraSourceAdapterResult,
} from "./devops-infra-source.adapter";

const DISCORD_API_ORIGIN = "https://discord.com/api/v10";
const MAX_BODY_BYTES = 512 * 1024;

interface HttpResponse {
  data: unknown;
}

interface HttpClientLike {
  get(
    url: string,
    config: {
      headers: Record<string, string>;
      params?: Record<string, unknown>;
    },
  ): Promise<HttpResponse>;
}

function createDefaultHttpClient(): HttpClientLike {
  return axios.create({
    timeout: env.REQUEST_TIMEOUT_MS,
    maxRedirects: 0,
    maxContentLength: MAX_BODY_BYTES,
    maxBodyLength: MAX_BODY_BYTES,
  }) as HttpClientLike;
}

export class DevopsInfraDiscordAdapter implements DevopsInfraSourceAdapter {
  readonly key = "discord";

  constructor(
    private readonly http: HttpClientLike = createDefaultHttpClient(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  isEnabled(): boolean {
    return (
      env.DISCORD_BOT_TOKEN.trim() !== "" &&
      parseDiscordChannelAllowlist(env.DISCORD_CHANNEL_ALLOWLIST).length > 0
    );
  }

  async collect(): Promise<DevopsInfraSourceAdapterResult> {
    const token = env.DISCORD_BOT_TOKEN.trim();
    const channels = parseDiscordChannelAllowlist(env.DISCORD_CHANNEL_ALLOWLIST);
    if (!token || channels.length === 0) {
      return { items: [], successfulSourceCount: 0, failedSources: [] };
    }

    const discoveredAt = this.now().toISOString();
    const settled = await Promise.all(
      channels.map(async (channel) => {
        const sourceKey = `discord:${channel.channelId}`;
        try {
          const response = await this.http.get(
            `${DISCORD_API_ORIGIN}/channels/${channel.channelId}/messages`,
            {
              headers: {
                Accept: "application/json",
                Authorization: `Bot ${token}`,
              },
              params: { limit: 50 },
            },
          );
          return {
            ok: true as const,
            items: parseMessages(response.data).flatMap((message) => {
              const item = mapMessage(message, channel, discoveredAt);
              return item ? [item] : [];
            }),
          };
        } catch {
          return { ok: false as const, sourceKey };
        }
      }),
    );

    const items: DevopsInfraSourceItem[] = [];
    const failedSources: string[] = [];
    let successfulSourceCount = 0;
    for (const result of settled) {
      if (result.ok) {
        successfulSourceCount += 1;
        items.push(...result.items);
      } else {
        failedSources.push(result.sourceKey);
      }
    }
    return { items, successfulSourceCount, failedSources };
  }
}

function mapMessage(
  value: unknown,
  channel: DiscordChannelAllowlistEntry,
  discoveredAt: string,
): DevopsInfraSourceItem | undefined {
  const message = asRecord(value);
  const author = asRecord(message?.author);
  const id = readNumericId(message?.id);
  const channelId = readNumericId(message?.channel_id);
  const body = readText(message?.content);
  const publishedAt = readTimestamp(message?.timestamp);
  if (
    !message ||
    !id ||
    channelId !== channel.channelId ||
    !body ||
    !publishedAt ||
    author?.bot === true
  ) {
    return undefined;
  }

  const username = readText(author?.username);
  const communityKey = `discord:${channel.channelId}`;
  return {
    id,
    sourceId: "discord",
    sourceName: `Discord #${channel.channelId}`,
    title: body,
    url: `https://discord.com/channels/${channel.guildId}/${channel.channelId}/${id}`,
    summary: body,
    body,
    ...(username ? { author: username } : {}),
    publishedAt,
    collectedAt: discoveredAt,
    discoveredAt,
    discoveryChannel: "discord",
    communityKey,
    sourceQuotaKey: communityKey,
    sourceTextStatus: "full",
    answers: [],
  };
}

function parseMessages(payload: unknown): unknown[] {
  const value = readJsonBody(payload);
  if (!Array.isArray(value)) {
    throw new Error("discord-messages");
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readNumericId(value: unknown): string {
  return typeof value === "string" && /^\d+$/.test(value) ? value : "";
}

function readText(value: unknown): string {
  return typeof value === "string" ? compactText(value) : "";
}

function readTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function readJsonBody(data: unknown): unknown {
  if (typeof data !== "string") {
    return data;
  }
  try {
    return JSON.parse(data) as unknown;
  } catch {
    throw new Error("discord-json");
  }
}
