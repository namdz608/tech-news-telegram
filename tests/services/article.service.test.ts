import { describe, expect, it } from 'vitest';
import { topics } from '../../src/config/topics';
import { matchTopics } from '../../src/services/article.service';
import { normalizeUrl } from '../../src/utils/normalize-url';

describe('article utilities', () => {
  it('matches article topics from title and summary', () => {
    const result = matchTopics({
      title: 'Critical Kubernetes CVE impacts clusters',
      summary: 'Security teams should patch k8s nodes',
    });

    expect(result).toEqual(expect.arrayContaining(['k8s', 'security']));
  });

  it('does not match short keywords inside unrelated words', () => {
    const result = matchTopics({
      title: 'Kubernetes maintainers improve availability',
      summary: 'Cloud controller updates for reliable clusters',
    });

    expect(result).not.toContain('ai');
    expect(result).toEqual(expect.arrayContaining(['k8s', 'cloud']));
  });

  it.each([
    ['ChatGPT', 'ai'],
    ['GPT-5', 'ai'],
    ['Codex', 'ai'],
    ['Claude', 'ai'],
    ['DeepMind', 'ai'],
    ['GitHub', 'devops'],
    ['Docker', 'devops'],
    ['HashiCorp', 'devops'],
    ['Cloudflare', 'cloud'],
  ] as const)('matches tracked-account term %s to %s', (term, topic) => {
    expect(matchTopics({ title: `${term} ships a platform update` })).toContain(topic);
  });

  it('lists Cloudflare explicitly instead of relying on the broader cloud substring', () => {
    expect(topics.find((topic) => topic.key === 'cloud')?.keywords).toContain('cloudflare');
  });

  it('normalizes tracking URLs before dedupe', () => {
    expect(normalizeUrl('https://example.com/post?utm_source=x#comments')).toBe('https://example.com/post');
  });
});
