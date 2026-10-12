import { describe, expect, it } from 'vitest';
import { SourceContentEnrichmentService } from '../../src/services/source-content-enrichment.service';
import { SourceService } from '../../src/services/source.service';
import { GadgetSourceService } from '../../src/services/gadget-source.service';
import { HealthSourceService } from '../../src/services/health-source.service';
import { PoliticsSourceService } from '../../src/services/politics-source.service';
import { DevopsInfraSourceService } from '../../src/services/devops-infra-source.service';
import { DevopsJobsSourceService } from '../../src/services/devops-jobs-source.service';
import type { Article } from '../../src/types/article';
import type { PoliticsSourceItem } from '../../src/types/gold-politics';
import type { DevopsInfraSourceItem } from '../../src/types/devops-infra';

const NOW = new Date();
const PUBLISHED = new Date(NOW.getTime() - 60_000).toISOString();
const BODY = 'Kubernetes controller race fixed in the release. The patch improves rollout reliability. '.repeat(8).trim();
const URL = 'https://kubernetes.io/blog/controller-fix';
const article: Article = { id: URL, title: 'Kubernetes controller race fixed', url: URL, summary: 'RSS excerpt', sourceName: 'Kubernetes', sourceId: 'kubernetes', publishedAt: PUBLISHED, collectedAt: NOW.toISOString(), topics: ['k8s'] };
const source = { id: 'kubernetes', name: 'Kubernetes', enabled: true, kind: 'rss' as const, homepageUrl: 'https://kubernetes.io', feedUrl: 'https://kubernetes.io/feed' };
const crawler = { crawl: async () => [article] };
const enricher = () => new SourceContentEnrichmentService({ retrieve: async (url) => ({ finalUrl: url, contentType: 'text/plain', text: BODY, retrievalBackend: 'jina' }) }, { enabled: true, maxItems: 2, concurrency: 2, maxChars: 4000 });

describe('enrichment is connected to every collection flow', () => {
  it('enriches technology news after filtering and dedupe', async () => {
    const result = await new SourceService([source], { rss: crawler, html: crawler, xSearch: crawler, githubRepos: crawler }, 14, enricher()).collectLatest();
    expect(result[0]).toMatchObject({ ...article, summary: BODY, sourceTextStatus: 'full', retrievalBackend: 'jina' });
  });

  it.each([['gadget', GadgetSourceService], ['health', HealthSourceService]] as const)('enriches %s RSS without changing collection counters', async (_name, Service) => {
    const result = await new Service([source], crawler, 14, () => NOW, enricher()).collectLatest();
    expect(result).toMatchObject({ successfulSourceCount: 1, failedSourceCount: 0 });
    expect(result.articles[0]).toMatchObject({ url: URL, publishedAt: PUBLISHED, summary: BODY, sourceTextStatus: 'full' });
  });

  it('preserves politics evidence origin and source publication time', async () => {
    const item: PoliticsSourceItem = {
      ...article, discoveryChannel: 'rss', discoveredAt: NOW.toISOString(), sourceQuotaKey: 'kubernetes.io', sourceTextStatus: 'search-excerpt',
      evidenceKind: 'identified-report', evidentiaryEffect: 'mentions', evidenceOriginKey: 'kubernetes.io',
      originAttribution: { url: URL, publishedAt: PUBLISHED, discoveredAt: NOW.toISOString() },
    };
    const adapter = { key: 'rss', isEnabled: () => true, collect: async () => ({ items: [item], successfulSourceCount: 1, failedSources: [] }) };
    const result = await new PoliticsSourceService([adapter], 72, undefined, undefined, () => NOW, enricher()).collectLatest();
    expect(result.items[0]).toMatchObject({ summary: BODY, sourceTextStatus: 'full', publishedAt: PUBLISHED, originAttribution: item.originAttribution, evidenceOriginKey: item.evidenceOriginKey });
  });

  it('enriches infra excerpts and keeps answer evidence', async () => {
    const item: DevopsInfraSourceItem = {
      ...article, body: '', publishedAt: PUBLISHED, discoveryChannel: 'web', discoveredAt: NOW.toISOString(),
      communityKey: 'kubernetes.io', sourceQuotaKey: 'kubernetes.io', sourceTextStatus: 'search-excerpt', answers: [{ body: 'Original answer', accepted: true }],
    };
    const adapter = { key: 'web', isEnabled: () => true, collect: async () => ({ items: [item], successfulSourceCount: 1, failedSources: [] }) };
    const result = await new DevopsInfraSourceService([adapter], 72, () => NOW, 1000, enricher()).collectLatest();
    expect(result.items[0]).toMatchObject({ body: BODY, answers: item.answers, publishedAt: PUBLISHED });
  });

  it('enriches job descriptions without deriving salary or location from prose', async () => {
    const job = { id: URL, sourceId: 'jobs', sourceName: 'Jobs', title: 'DevOps Engineer', company: 'Acme', url: URL, location: 'Hanoi', salary: '1000 USD', description: 'Excerpt', tags: ['kubernetes'], publishedAt: PUBLISHED };
    const result = await new DevopsJobsSourceService([{ key: 'jobs', collect: async () => [job] }], enricher()).collectLatest();
    expect(result).toMatchObject({ collectedCount: 1, successfulSourceCount: 1, failedSources: [] });
    expect(result.items[0]).toMatchObject({ ...job, description: BODY, sourceTextStatus: 'full' });
  });
});
