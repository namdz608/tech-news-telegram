import { describe, expect, it } from "vitest";
import { DevopsInfraSelectionService } from "../../src/services/devops-infra-selection.service";
import type {
  DevopsEnvironment,
  DevopsInfraCandidate,
  DevopsInfraCategory,
  DevopsInfraKind,
  DevopsInfraSourceItem,
  SolutionConfidence,
} from "../../src/types/devops-infra";

const NOW = new Date("2026-09-21T03:00:00.000Z");

function sourceItem(
  id: string,
  overrides: Partial<DevopsInfraSourceItem> = {},
): DevopsInfraSourceItem {
  return {
    id,
    sourceId: "test",
    sourceName: "Test",
    title: "Kubernetes pod failure",
    url: `https://example.com/${id}`,
    summary: "",
    body: "Kubernetes pod failure fixed by configuration",
    publishedAt: "2026-09-21T01:00:00.000Z",
    collectedAt: NOW.toISOString(),
    discoveredAt: NOW.toISOString(),
    discoveryChannel: "stackexchange",
    communityKey: "test",
    sourceQuotaKey: `source-${id}`,
    sourceTextStatus: "full",
    answers: [],
    ...overrides,
  };
}

function candidate(
  id: string,
  overrides: {
    item?: Partial<DevopsInfraSourceItem>;
    kind?: DevopsInfraKind;
    category?: DevopsInfraCategory;
    environment?: DevopsEnvironment;
    rootCause?: string;
    solutionSteps?: readonly string[];
    solutionConfidence?: SolutionConfidence;
  } = {},
): DevopsInfraCandidate {
  let hash = 2_166_136_261;
  for (const character of id) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return {
    item: sourceItem(id, overrides.item),
    kind: overrides.kind ?? "problem-solution",
    category: overrides.category ?? "k8s-containers",
    environment: overrides.environment ?? "hybrid",
    problem: `${id} problem`,
    ...(overrides.rootCause ? { rootCause: overrides.rootCause } : {}),
    solutionSteps: overrides.solutionSteps ?? ["apply fix"],
    solutionConfidence: overrides.solutionConfidence ?? "anecdotal",
    fingerprint: `fp${(hash >>> 0).toString(36)}${id.length.toString(36)}`,
    score: 0,
    scoreReasons: [],
  };
}

function service(maxArticles = 12, maxIncidents = 3): DevopsInfraSelectionService {
  return new DevopsInfraSelectionService(maxArticles, maxIncidents, () => NOW);
}

describe("DevopsInfraSelectionService", () => {
  it("applies the scoring formula and scoreReasons for a constructed candidate with fixed now", () => {
    const input = candidate("scored", {
      category: "networking",
      environment: "cloud",
      rootCause: "misconfig",
      solutionSteps: ["a", "b", "c"],
      solutionConfidence: "accepted",
      item: {
        publishedAt: "2026-09-20T03:00:00.000Z",
        title: "Fix",
        body: "network timeout during deploy",
        engagement: { score: 1023 },
      },
    });

    const scored = service().select([input], new Set()).selected[0];

    expect(scored?.score).toBe(118);
    expect(scored?.scoreReasons).toEqual([
      "freshness:48",
      "relevance:1",
      "solution:accepted",
      "completeness:19",
      "engagement:10",
    ]);
  });

  it("treats non-finite engagement scores as zero for scoring", () => {
    const baseline = candidate("finite-engagement", {
      category: "networking",
      environment: "hybrid",
      solutionConfidence: "none",
      solutionSteps: [],
      item: {
        publishedAt: "2026-09-21T01:00:00.000Z",
        title: "Fix",
        body: "network issue",
      },
    });
    const invalid = candidate("invalid-engagement", {
      category: "networking",
      environment: "hybrid",
      solutionConfidence: "none",
      solutionSteps: [],
      item: {
        publishedAt: "2026-09-21T01:00:00.000Z",
        title: "Fix",
        body: "network issue",
        engagement: { score: Number.POSITIVE_INFINITY },
      },
    });

    const baselineScore = service().select([baseline], new Set()).selected[0]?.score;
    const invalidScored = service().select([invalid], new Set()).selected[0];

    expect(invalidScored?.score).toBe(baselineScore);
    expect(invalidScored?.scoreReasons).not.toContain(
      expect.stringMatching(/^engagement:/),
    );
  });

  it("URLs in seenUrls increment skippedSeenCount and are not selected.", () => {
    const seen = candidate("seen");
    const result = service().select(
      [seen, candidate("new")],
      new Set([seen.item.url]),
    );

    expect(result.skippedSeenCount).toBe(1);
    expect(result.selected.map((entry) => entry.item.url)).toEqual([
      "https://example.com/new",
    ]);
  });

  it("Off-topic items (pass through classifier returning undefined) do not increment eligible.", () => {
    const offTopic = sourceItem("off-topic", {
      title: "Quarterly company update",
      body: "Revenue and hiring update.",
    });

    const result = service().select([offTopic], new Set());

    expect(result.eligibleCount).toBe(0);
    expect(result.selected).toEqual([]);
  });

  it("eligibleCount is post-classify, post-age, pre-history? Spec: reject stale/malformed before selection; history is skipped. Define: eligibleCount = classified+deduped not-yet-filtered-by-caps count after dropping seen URLs. skippedSeenCount = classified items dropped for seen URL.", () => {
    const duplicateA = candidate("duplicate-a", {
      item: { url: "https://example.com/duplicate?utm_source=test" },
    });
    const duplicateB = candidate("duplicate-b", {
      item: { url: "https://example.com/duplicate" },
    });
    const seen = candidate("history");
    const stale = candidate("stale", {
      item: { publishedAt: "2026-09-17T00:00:00.000Z" },
    });

    const result = service().select(
      [duplicateA, duplicateB, seen, stale],
      new Set([seen.item.url]),
    );

    expect(result.eligibleCount).toBe(1);
    expect(result.skippedSeenCount).toBe(1);
  });

  it("When both cloud and on-prem exist in eligible set, selected set contains ≥1 each even if a high-scoring third environment would otherwise fill slots (anchor first, then score).", () => {
    const result = service(2).select(
      [
        candidate("hybrid-accepted", {
          environment: "hybrid",
          solutionConfidence: "accepted",
          rootCause: "known",
          solutionSteps: Array(5).fill("step"),
        }),
        candidate("cloud", {
          category: "cloud-aws",
          environment: "cloud",
          solutionConfidence: "none",
          solutionSteps: [],
        }),
        candidate("onprem", {
          category: "onprem-selfhosted",
          environment: "onprem",
          solutionConfidence: "none",
          solutionSteps: [],
        }),
      ],
      new Set(),
    );

    expect(result.selected.map((entry) => entry.environment)).toEqual([
      "cloud",
      "onprem",
    ]);
  });

  it("At most 3 incident.", () => {
    const input = Array.from({ length: 6 }, (_, index) =>
      candidate(`incident-${index}`, {
        kind: "incident",
        category: index % 2 === 0 ? "cloud-aws" : "networking",
        environment: "hybrid",
      }),
    );

    const result = service(12, 3).select(input, new Set());

    expect(
      result.selected.filter((entry) => entry.kind === "incident"),
    ).toHaveLength(3);
  });

  it("At most 2 per category.", () => {
    const input = Array.from({ length: 5 }, (_, index) =>
      candidate(`category-${index}`, {
        category: "networking",
        environment: "hybrid",
      }),
    );

    const result = service().select(input, new Set());

    expect(result.selected).toHaveLength(2);
  });

  it("At most 4 combined cloud-aws + cloud-gcp + cloud-azure.", () => {
    const categories: DevopsInfraCategory[] = [
      "cloud-aws",
      "cloud-aws",
      "cloud-gcp",
      "cloud-gcp",
      "cloud-azure",
      "cloud-azure",
    ];
    const input = categories.map((category, index) =>
      candidate(`cloud-family-${index}`, {
        category,
        environment: "hybrid",
      }),
    );

    const result = service().select(input, new Set());

    expect(result.selected).toHaveLength(4);
  });

  it("At most 2 per sourceQuotaKey.", () => {
    const input = Array.from({ length: 5 }, (_, index) =>
      candidate(`source-${index}`, {
        item: { sourceQuotaKey: "shared-source" },
        category: index % 2 === 0 ? "networking" : "db-storage",
        environment: "hybrid",
      }),
    );

    const result = service().select(input, new Set());

    expect(result.selected).toHaveLength(2);
  });

  it("Length ≤ DEVOPS_INFRA_MAX_ARTICLES.", () => {
    const categories: DevopsInfraCategory[] = [
      "networking",
      "db-storage",
      "cicd",
      "iam-secrets",
    ];
    const input = Array.from({ length: 8 }, (_, index) =>
      candidate(`max-${index}`, {
        category: categories[index % categories.length],
        environment: "hybrid",
      }),
    );

    expect(service(5).select(input, new Set()).selected).toHaveLength(5);
  });

  it("Prefer problem-solution with accepted/highly-voted/author-confirmed over anecdotal when filling remaining slots (after anchors and caps).", () => {
    const input = [
      candidate("cloud-anchor", {
        category: "cloud-aws",
        environment: "cloud",
        solutionConfidence: "none",
        solutionSteps: [],
      }),
      candidate("onprem-anchor", {
        category: "onprem-selfhosted",
        environment: "onprem",
        solutionConfidence: "none",
        solutionSteps: [],
      }),
      candidate("anecdotal", {
        category: "networking",
        environment: "hybrid",
        solutionConfidence: "anecdotal",
      }),
      candidate("accepted", {
        category: "db-storage",
        environment: "hybrid",
        solutionConfidence: "accepted",
        item: { publishedAt: "2026-09-20T01:00:00.000Z" },
      }),
    ];

    const result = service(3).select(input, new Set());

    expect(result.selected.map((entry) => entry.item.url)).toContain(
      "https://example.com/accepted",
    );
    expect(result.selected.map((entry) => entry.item.url)).not.toContain(
      "https://example.com/anecdotal",
    );
  });

  it("Prefer highly-voted over anecdotal when filling remaining slots (after anchors and caps).", () => {
    const input = [
      candidate("cloud-anchor", {
        category: "cloud-aws",
        environment: "cloud",
        solutionConfidence: "none",
        solutionSteps: [],
      }),
      candidate("onprem-anchor", {
        category: "onprem-selfhosted",
        environment: "onprem",
        solutionConfidence: "none",
        solutionSteps: [],
      }),
      candidate("anecdotal", {
        category: "networking",
        environment: "hybrid",
        solutionConfidence: "anecdotal",
      }),
      candidate("highly-voted", {
        category: "db-storage",
        environment: "hybrid",
        solutionConfidence: "highly-voted",
      }),
    ];

    const result = service(3).select(input, new Set());

    expect(result.selected.map((entry) => entry.item.url)).toContain(
      "https://example.com/highly-voted",
    );
    expect(result.selected.map((entry) => entry.item.url)).not.toContain(
      "https://example.com/anecdotal",
    );
  });

  it("Same inputs + same now → deep-equal selected URLs.", () => {
    const input = [
      candidate("z", { category: "networking", environment: "hybrid" }),
      candidate("a", { category: "db-storage", environment: "hybrid" }),
    ];

    const first = service().select(input, new Set());
    const second = service().select([...input].reverse(), new Set());

    expect(first.selected.map((entry) => entry.item.url)).toEqual(
      second.selected.map((entry) => entry.item.url),
    );
    expect(first.selected[0]?.item.url).toBe("https://example.com/a");
  });

  it("Backfill by score after anchors without violating caps.", () => {
    const input = [
      candidate("cloud-anchor", {
        category: "cloud-aws",
        environment: "cloud",
      }),
      candidate("onprem-anchor", {
        category: "onprem-selfhosted",
        environment: "onprem",
      }),
      candidate("best", {
        category: "networking",
        environment: "hybrid",
        solutionConfidence: "accepted",
      }),
      candidate("same-category-blocked", {
        category: "networking",
        environment: "hybrid",
        solutionConfidence: "highly-voted",
      }),
      candidate("same-category-blocked-2", {
        category: "networking",
        environment: "hybrid",
        solutionConfidence: "author-confirmed",
      }),
      candidate("backfill", {
        category: "db-storage",
        environment: "hybrid",
        solutionConfidence: "none",
        solutionSteps: [],
      }),
    ];

    const result = service(5).select(input, new Set());

    expect(result.selected.map((entry) => entry.item.url)).toEqual([
      "https://example.com/cloud-anchor",
      "https://example.com/onprem-anchor",
      "https://example.com/best",
      "https://example.com/same-category-blocked",
      "https://example.com/backfill",
    ]);
  });
});
