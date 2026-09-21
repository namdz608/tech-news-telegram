import { describe, expect, it } from 'vitest';
import {
  DEVOPS_INFRA_STACKEXCHANGE_SITES,
  DEVOPS_INFRA_SUBREDDITS,
  DEVOPS_INFRA_X_QUERY,
  buildDevopsInfraWebSearchQueries,
  devopsInfraHnQueries,
  devopsInfraRedditQueries,
} from '../../src/config/devops-infra-sources';

const expectedSubreddits = [
  'devops',
  'sysadmin',
  'kubernetes',
  'aws',
  'azure',
  'googlecloud',
  'selfhosted',
  'homelab',
  'linuxadmin',
  'networking',
  'sre',
  'terraform',
  'ansible',
  'docker',
  'gitlab',
  'prometheus',
  'proxmox',
] as const;

const expectedStackOverflowTags = [
  'kubernetes',
  'docker',
  'terraform',
  'amazon-web-services',
  'azure',
  'google-cloud-platform',
  'linux',
  'nginx',
  'ansible',
  'prometheus',
  'gitlab-ci',
  'networking',
];

describe('devops-infra source catalogs', () => {
  it('lists the approved subreddits exactly once', () => {
    expect(DEVOPS_INFRA_SUBREDDITS).toEqual([...expectedSubreddits]);
    expect(new Set(DEVOPS_INFRA_SUBREDDITS).size).toBe(17);
  });

  it('defines stackoverflow tags exactly as specified', () => {
    const stackOverflow = DEVOPS_INFRA_STACKEXCHANGE_SITES.find(
      (entry) => entry.site === 'stackoverflow',
    );
    expect(stackOverflow?.tags).toEqual(expectedStackOverflowTags);
  });

  it('caps web search queries and includes a telegram discovery hint', () => {
    const queries = buildDevopsInfraWebSearchQueries(8);
    expect(queries.length).toBeLessThanOrEqual(8);
    expect(queries.some((query) => query.discoveryHint === 'telegram')).toBe(true);
    expect(
      queries.some((query) => query.text.includes('site:facebook.com') && query.discoveryHint === 'facebook'),
    ).toBe(true);
    expect(
      queries.some((query) => query.text.includes('site:discord.com') && query.discoveryHint === 'discord'),
    ).toBe(true);
  });

  it('buildDevopsInfraWebSearchQueries(0) returns an empty list', () => {
    expect(buildDevopsInfraWebSearchQueries(0)).toEqual([]);
  });

  it('covers required reddit and HN troubleshooting themes', () => {
    const redditText = devopsInfraRedditQueries.map((query) => query.text).join(' ');
    expect(redditText).toMatch(/CrashLoop|OOMKilled/i);
    expect(redditText).toMatch(/terraform.*state lock/i);
    expect(redditText).toMatch(/nginx.*502/i);
    expect(redditText).toMatch(/wireguard|on-prem/i);
    expect(redditText).toMatch(/AccessDenied|IAM/i);
    expect(redditText).toMatch(/kubernetes lỗi/);

    const hnText = devopsInfraHnQueries.map((query) => query.text).join(' ');
    expect(hnText).toMatch(/CrashLoopBackOff|OOMKilled|ImagePullBackOff/i);
    expect(hnText).toMatch(/terraform.*state lock|apply failed/i);
    expect(hnText).toMatch(/AWS|GCP|Azure.*outage|postmortem/i);
    expect(hnText).toMatch(/VPN|Proxmox|bare-metal Kubernetes/i);
    expect(hnText).toMatch(/nginx 502|DNS|cert expiry|AccessDenied/i);
  });

  it('ends the X query with -is:retweet and mixes English and Vietnamese', () => {
    expect(DEVOPS_INFRA_X_QUERY.trimEnd()).toMatch(/-is:retweet$/);
    expect(DEVOPS_INFRA_X_QUERY).toMatch(/kubernetes|devops|infra/i);
    expect(DEVOPS_INFRA_X_QUERY).toMatch(/sự cố|kubernetes|hạ tầng|infra/i);
  });

  it('contains no gold-politics query strings', () => {
    const catalogText = [
      ...devopsInfraRedditQueries.map((query) => query.text),
      ...devopsInfraHnQueries.map((query) => query.text),
      ...buildDevopsInfraWebSearchQueries(20).map((query) => query.text),
      DEVOPS_INFRA_X_QUERY,
    ].join('\n');

    expect(catalogText).not.toMatch(/Quốc hội/);
    expect(catalogText).not.toMatch(/chính trị Việt Nam/i);
  });
});
