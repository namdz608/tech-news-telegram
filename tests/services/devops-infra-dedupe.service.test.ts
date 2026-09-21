import { describe, expect, it } from "vitest";
import {
  dedupeDevopsInfraCandidates,
  FINGERPRINT_JACCARD_THRESHOLD,
  fingerprintTokenJaccard,
} from "../../src/services/devops-infra-dedupe.service";
import type {
  DevopsInfraCandidate,
  DevopsInfraSourceItem,
} from "../../src/types/devops-infra";

const NOW = "2026-09-21T03:00:00.000Z";
const EARLIER = "2026-09-20T03:00:00.000Z";

function sourceItem(
  overrides: Partial<DevopsInfraSourceItem> = {},
): DevopsInfraSourceItem {
  return {
    id: "thread-1",
    sourceId: "thread-1",
    sourceName: "Test",
    title: "Kubernetes pod is failing",
    url: "https://example.com/thread-1",
    summary: "",
    body: "short body",
    publishedAt: NOW,
    collectedAt: NOW,
    discoveredAt: NOW,
    discoveryChannel: "stackexchange",
    communityKey: "test",
    sourceQuotaKey: "test",
    sourceTextStatus: "full",
    answers: [],
    ...overrides,
  };
}

function candidate(
  overrides: Partial<DevopsInfraCandidate> & {
    item?: Partial<DevopsInfraSourceItem>;
  } = {},
): DevopsInfraCandidate {
  const { item: itemOverrides, ...rest } = overrides;
  return {
    item: sourceItem(itemOverrides),
    kind: "problem-solution",
    category: "k8s-containers",
    environment: "cloud",
    problem: "pod failure",
    solutionSteps: ["step one"],
    solutionConfidence: "anecdotal",
    fingerprint: "kubernetespodisfailing",
    score: 10,
    scoreReasons: [],
    ...rest,
  };
}

describe("dedupeDevopsInfraCandidates", () => {
  it("keeps the first candidate when normalizeUrl(url) matches", () => {
    const first = candidate({
      item: {
        url: "https://example.com/post?utm_source=x",
        body: "first",
      },
      solutionConfidence: "anecdotal",
    });
    const second = candidate({
      item: {
        url: "https://example.com/post#comments",
        body: "second with more text and accepted fix evidence",
      },
      solutionConfidence: "accepted",
    });

    const result = dedupeDevopsInfraCandidates([first, second]);

    expect(result).toHaveLength(1);
    expect(result[0]?.item.body).toBe("first");
    expect(result[0]?.solutionConfidence).toBe("anecdotal");
  });

  it("keeps the better representative for the same fingerprint", () => {
    const fingerprint = "kubernetespodcrashloop";
    const accepted = candidate({
      item: { url: "https://example.com/a", body: "medium length body" },
      fingerprint,
      solutionConfidence: "accepted",
    });
    const highlyVoted = candidate({
      item: {
        url: "https://example.com/b",
        body: "much longer body with extra troubleshooting detail",
      },
      fingerprint,
      solutionConfidence: "highly-voted",
    });
    const anecdotalLonger = candidate({
      item: {
        url: "https://example.com/c",
        body: "much longer body with extra troubleshooting detail",
        publishedAt: EARLIER,
      },
      fingerprint,
      solutionConfidence: "anecdotal",
    });
    const anecdotalEarlier = candidate({
      item: {
        url: "https://example.com/d",
        body: "shorter",
        publishedAt: EARLIER,
      },
      fingerprint,
      solutionConfidence: "anecdotal",
    });

    expect(
      dedupeDevopsInfraCandidates([highlyVoted, accepted]).map(
        (entry) => entry.solutionConfidence,
      ),
    ).toEqual(["accepted"]);

    expect(
      dedupeDevopsInfraCandidates([anecdotalEarlier, anecdotalLonger]).map(
        (entry) => entry.item.body,
      ),
    ).toEqual(["much longer body with extra troubleshooting detail"]);

    expect(
      dedupeDevopsInfraCandidates([
        candidate({
          item: { url: "https://example.com/e", body: "same", publishedAt: NOW },
          fingerprint,
          solutionConfidence: "anecdotal",
        }),
        candidate({
          item: {
            url: "https://example.com/f",
            body: "same",
            publishedAt: EARLIER,
          },
          fingerprint,
          solutionConfidence: "anecdotal",
        }),
      ]).map((entry) => entry.item.publishedAt),
    ).toEqual([EARLIER]);
  });

  it(`merges fingerprint token Jaccard >= ${FINGERPRINT_JACCARD_THRESHOLD}`, () => {
    const leftFingerprint = "kubernetespodcrashloopbackoffdeploythe";
    const rightFingerprint = "kubernetespodcrashloopbackoffdeploytha";
    expect(fingerprintTokenJaccard(leftFingerprint, rightFingerprint)).toBeGreaterThanOrEqual(
      FINGERPRINT_JACCARD_THRESHOLD,
    );

    const weaker = candidate({
      item: { url: "https://example.com/similar-a", body: "short" },
      fingerprint: leftFingerprint,
      solutionConfidence: "anecdotal",
    });
    const stronger = candidate({
      item: { url: "https://example.com/similar-b", body: "longer fix body" },
      fingerprint: rightFingerprint,
      solutionConfidence: "highly-voted",
    });

    const result = dedupeDevopsInfraCandidates([weaker, stronger]);
    expect(result).toHaveLength(1);
    expect(result[0]?.solutionConfidence).toBe("highly-voted");
  });

  it("keeps separate items when fingerprints and URLs differ", () => {
    const aws = candidate({
      item: { url: "https://example.com/aws-outage" },
      fingerprint: "awsoutageec2regionfail",
      category: "cloud-aws",
      kind: "incident",
      solutionConfidence: "none",
    });
    const nginx = candidate({
      item: { url: "https://example.com/nginx-502" },
      fingerprint: "nginxreverseproxy502badgateway",
      category: "networking",
      problem: "502 bad gateway",
    });

    expect(dedupeDevopsInfraCandidates([aws, nginx])).toHaveLength(2);
  });

  it("returns survivors sorted by original input index", () => {
    const keepAt0 = candidate({
      item: { url: "https://example.com/keep-0" },
      fingerprint: "alphaoneproblemhere",
    });
    const dupOf2 = candidate({
      item: { url: "https://example.com/dup-2" },
      fingerprint: "betatwoproblemherey",
    });
    const keepAt2 = candidate({
      item: { url: "https://example.com/keep-2" },
      fingerprint: "betatwoproblemherez",
      solutionConfidence: "accepted",
    });
    const keepAt3 = candidate({
      item: { url: "https://example.com/keep-3" },
      fingerprint: "gammathreeproblem",
    });

    const result = dedupeDevopsInfraCandidates([
      keepAt0,
      dupOf2,
      keepAt2,
      keepAt3,
    ]);

    expect(result.map((entry) => entry.item.url)).toEqual([
      "https://example.com/keep-0",
      "https://example.com/keep-2",
      "https://example.com/keep-3",
    ]);
  });
});
