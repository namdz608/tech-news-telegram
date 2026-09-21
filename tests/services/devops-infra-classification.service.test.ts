import { describe, expect, it } from "vitest";
import { classifyDevopsInfraItem } from "../../src/services/devops-infra-classification.service";
import type { DevopsInfraSourceItem } from "../../src/types/devops-infra";

const NOW = "2026-09-21T03:00:00.000Z";

function item(
  overrides: Partial<DevopsInfraSourceItem> = {},
): DevopsInfraSourceItem {
  return {
    id: "thread-1",
    sourceId: "thread-1",
    sourceName: "Test",
    title: "Kubernetes pod is failing",
    url: "https://example.com/thread-1",
    summary: "",
    body: "The pod has an operational failure",
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

describe("classifyDevopsInfraItem", () => {
  it("classifies CrashLoopBackOff with accepted solution steps", () => {
    const result = classifyDevopsInfraItem(
      item({
        title: "Kubernetes pod CrashLoopBackOff after deploy",
        body: "The pod restarts continuously.",
        answers: [
          {
            body: "Run `kubectl logs pod/api`, then set the missing env config.",
            accepted: true,
            score: 1,
          },
        ],
      }),
    );

    expect(result).toMatchObject({
      kind: "problem-solution",
      category: "k8s-containers",
      solutionConfidence: "accepted",
    });
    expect(result?.solutionSteps.length).toBeGreaterThan(0);
    expect(result?.problem).toContain("CrashLoopBackOff");
  });

  it("rejects a problem thread with no solution", () => {
    expect(
      classifyDevopsInfraItem(
        item({
          title: "Kubernetes pod CrashLoopBackOff after deploy",
          body: "The pod restarts continuously and I need help.",
        }),
      ),
    ).toBeUndefined();
  });

  it("sets incident verification from source evidence", () => {
    const reported = classifyDevopsInfraItem(
      item({
        title: "AWS status page outage thread",
        body: "Users report an AWS EC2 outage.",
      }),
    );
    const confirmed = classifyDevopsInfraItem(
      item({
        title: "AWS outage affecting EC2",
        body: "Confirmed at status.aws.amazon.com.",
      }),
    );
    const rumor = classifyDevopsInfraItem(
      item({
        title: "Rumor: AWS outage affecting EC2",
        body: "Unconfirmed social chatter only.",
        discoveryChannel: "x",
      }),
    );

    expect(reported).toMatchObject({
      kind: "incident",
      category: "cloud-aws",
      verification: "reported",
    });
    expect(confirmed?.verification).toBe("confirmed");
    expect(rumor?.verification).toBe("unverified");
  });

  it("confirms incidents only from body evidence", () => {
    const officialAdvisory = classifyDevopsInfraItem(
      item({
        title: "Kubernetes outage incident",
        body: "An official advisory confirms the control-plane outage.",
      }),
    );
    const cve = classifyDevopsInfraItem(
      item({
        title: "Kubernetes security incident",
        body: "The incident is tracked as CVE-2026-12345.",
      }),
    );
    const titleOnly = classifyDevopsInfraItem(
      item({
        title: "Official advisory for Kubernetes outage",
        body: "Users report unavailable pods.",
      }),
    );

    expect(officialAdvisory?.verification).toBe("confirmed");
    expect(cve?.verification).toBe("confirmed");
    expect(titleOnly?.verification).toBe("reported");
  });

  it("detects onprem, cloud, hybrid, and unknown environments", () => {
    const classifyEnvironment = (text: string) =>
      classifyDevopsInfraItem(
        item({
          title: `${text} outage incident`,
          body: text,
          answers: [],
        }),
      )?.environment;

    expect(classifyEnvironment("Proxmox self-hosted")).toBe("onprem");
    expect(classifyEnvironment("EKS control plane")).toBe("cloud");
    expect(classifyEnvironment("Proxmox connected to EKS")).toBe("hybrid");
    expect(classifyEnvironment("Kubernetes pod")).toBe("unknown");
  });

  it("rejects tool advertisements", () => {
    expect(
      classifyDevopsInfraItem(
        item({
          title: "Best DevOps platform 50% off",
          body: "Buy now and start your free trial.",
        }),
      ),
    ).toBeUndefined();
  });

  it("rejects product launches without an operational failure", () => {
    expect(
      classifyDevopsInfraItem(
        item({
          title: "Launching a new Kubernetes observability platform",
          body: "Today we announce our latest product release.",
        }),
      ),
    ).toBeUndefined();
  });

  it("selects exactly one weighted category with spec-order tie breaks", () => {
    const k8s = classifyDevopsInfraItem(
      item({
        title: "kubectl pods helm outage",
        body: "AWS EKS AWS incident.",
      }),
    );
    const aws = classifyDevopsInfraItem(
      item({
        title: "AWS IAM S3 EKS control plane outage",
        body: "A Kubernetes cluster is affected.",
      }),
    );
    const tie = classifyDevopsInfraItem(
      item({
        title: "Kubernetes AWS outage",
        body: "Incident under investigation.",
      }),
    );

    expect(k8s?.category).toBe("k8s-containers");
    expect(aws?.category).toBe("cloud-aws");
    expect(tie?.category).toBe("k8s-containers");
  });

  it("extracts root cause only from an explicit source statement", () => {
    const explicit = classifyDevopsInfraItem(
      item({
        title: "Kubernetes outage incident",
        body: "The root cause was an expired certificate. Service recovered.",
      }),
    );
    const guessed = classifyDevopsInfraItem(
      item({
        title: "Kubernetes outage incident",
        body: "An expired certificate might explain this.",
      }),
    );

    expect(explicit?.rootCause).toBe("an expired certificate");
    expect(guessed?.rootCause).toBeUndefined();
  });

  it("does not extract a root cause across body and answer boundaries", () => {
    const result = classifyDevopsInfraItem(
      item({
        title: "Kubernetes outage incident",
        body: "still investigating the root cause",
        answers: [
          {
            body: "Run kubectl rollout restart deployment/api.",
            accepted: true,
          },
        ],
      }),
    );

    expect(result?.rootCause).toBeUndefined();
  });

  it("builds a compact fingerprint and rejects one shorter than eight chars", () => {
    const result = classifyDevopsInfraItem(
      item({
        title: "AWS outage affecting production services today",
        body: "Incident reported by users.",
      }),
    );

    expect(result?.fingerprint).toBe(
      "awsoutageaffectingproductionservicestodayawsoutageaffectingproductionservicestoday",
    );
    expect(
      classifyDevopsInfraItem(item({ title: "S3", body: "CVE", summary: "" })),
    ).toBeUndefined();
  });

  it("ranks accepted, author-confirmed, highly-voted, and anecdotal answers", () => {
    const confidence = (answers: DevopsInfraSourceItem["answers"]) =>
      classifyDevopsInfraItem(
        item({
          title: "Kubernetes CrashLoopBackOff failure",
          body: "The pod keeps restarting.",
          answers,
        }),
      )?.solutionConfidence;

    expect(
      confidence([
        { body: "Run `kubectl logs`.", authorConfirmed: true },
        { body: "Set the config value.", accepted: true },
      ]),
    ).toBe("accepted");
    expect(
      confidence([{ body: "Run `kubectl logs`.", authorConfirmed: true }]),
    ).toBe("author-confirmed");
    expect(
      confidence([
        { body: "Run `kubectl logs`.", score: 3 },
        { body: "Try a restart.", score: 2 },
      ]),
    ).toBe("highly-voted");
    expect(
      confidence([
        { body: "Run `kubectl logs`.", score: 3 },
        { body: "Try a restart.", score: 3 },
      ]),
    ).not.toBe("highly-voted");
    expect(confidence([{ body: "Set `replicas: 2` in the config." }])).toBe(
      "anecdotal",
    );
  });

  it("keeps incidents that have no solution", () => {
    expect(
      classifyDevopsInfraItem(
        item({
          title: "AWS EC2 outage incident",
          body: "Users report unavailable instances.",
        }),
      ),
    ).toMatchObject({
      kind: "incident",
      solutionConfidence: "none",
    });
  });
});
