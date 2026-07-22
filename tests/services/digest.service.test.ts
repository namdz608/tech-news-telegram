import { describe, expect, it } from 'vitest';
import { DigestService } from '../../src/services/digest.service';

describe('DigestService', () => {
  it('builds a compact formatted telegram digest', () => {
    const digest = new DigestService(10).buildDigest([
      {
        id: 'https://example.com/a',
        sourceId: 'src',
        sourceName: 'Example',
        title: 'AI security for Kubernetes',
        url: 'https://example.com/a',
        summary: 'Short summary',
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['ai', 'k8s', 'security'],
      },
    ]);

    expect(digest).toContain('BẢN TIN CÔNG NGHỆ');
    expect(digest).toContain('1 bài mới');
    expect(digest).toContain('Nguồn: Example');
    expect(digest).toContain('AI');
    expect(digest).toContain('1. AI security for Kubernetes');
    expect(digest).toContain('Example');
    expect(digest).toContain('https://example.com/a');
    expect(digest).toContain('📝 Short summary');
    expect(digest).not.toContain('Summary:');
  });

  it('does not repeat the same article across multiple topic sections', () => {
    const digest = new DigestService(10).buildDigest([
      {
        id: 'https://example.com/a',
        sourceId: 'src',
        sourceName: 'Example',
        title: 'AI security for Kubernetes',
        url: 'https://example.com/a',
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['ai', 'k8s', 'security'],
      },
    ]);

    expect(digest.match(/AI security for Kubernetes/g)).toHaveLength(1);
  });

  it('balances articles across topics instead of letting early AI articles fill the digest', () => {
    const aiArticles = Array.from({ length: 10 }, (_value, index) => ({
      id: `https://example.com/ai-${index}`,
      sourceId: 'hn',
      sourceName: 'Hacker News',
      title: `AI article ${index + 1}`,
      url: `https://example.com/ai-${index}`,
      collectedAt: '2026-06-09T00:00:00.000Z',
      topics: ['ai' as const],
    }));
    const digest = new DigestService(2).buildDigest([
      ...aiArticles,
      {
        id: 'https://example.com/devops',
        sourceId: 'devops',
        sourceName: 'DevOps Blog',
        title: 'DevOps observability update',
        url: 'https://example.com/devops',
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['devops'],
      },
      {
        id: 'https://example.com/cloud',
        sourceId: 'cloud',
        sourceName: 'Cloud Blog',
        title: 'Cloud infrastructure update',
        url: 'https://example.com/cloud',
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['cloud'],
      },
    ]);

    expect(digest).toContain('🤖 AI');
    expect(digest).toContain('🛠️ DEVOPS');
    expect(digest).toContain('☁️ CLOUD');
    expect(digest).toContain('AI article 1');
    expect(digest).toContain('AI article 2');
    expect(digest).not.toContain('AI article 3');
  });

  it('renders multi-topic articles in the section they were selected for', () => {
    const digest = new DigestService(1).buildDigest([
      {
        id: 'https://example.com/k8s',
        sourceId: 'k8s',
        sourceName: 'Kubernetes Blog',
        title: 'Kubernetes release update',
        url: 'https://example.com/k8s',
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['k8s'],
      },
      {
        id: 'https://example.com/cloud',
        sourceId: 'cloud',
        sourceName: 'Cloud Blog',
        title: 'Cloud controller update',
        url: 'https://example.com/cloud',
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['k8s', 'cloud'],
      },
    ]);

    expect(digest).toContain('☸️ KUBERNETES');
    expect(digest).toContain('☁️ CLOUD');
    expect(digest.indexOf('☁️ CLOUD')).toBeLessThan(digest.indexOf('Cloud controller update'));
  });

  it('prefers source-topic affinity over earlier weak matches', () => {
    const digest = new DigestService(1).buildDigest([
      {
        id: 'https://example.com/k8s-cloud',
        sourceId: 'kubernetes-blog',
        sourceName: 'Kubernetes Blog',
        title: 'Kubernetes cloud controller update',
        url: 'https://example.com/k8s-cloud',
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['cloud'],
      },
      {
        id: 'https://example.com/aws-cloud',
        sourceId: 'aws-news-blog',
        sourceName: 'AWS News Blog',
        title: 'AWS launches cloud infrastructure update',
        url: 'https://example.com/aws-cloud',
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['cloud'],
      },
    ]);

    expect(digest).toContain('☁️ CLOUD');
    expect(digest).toContain('AWS launches cloud infrastructure update');
    expect(digest).not.toContain('Kubernetes cloud controller update');
  });

  it('prefers GitHub AI repositories for the AI topic over earlier weak matches', () => {
    const messages = new DigestService(1).buildDigestMessages([
      {
        id: 'https://example.com/generic-ai',
        sourceId: 'generic-ai-blog',
        sourceName: 'Generic AI Blog',
        title: 'OpenAI platform update',
        url: 'https://example.com/generic-ai',
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['ai'],
      },
      {
        id: 'https://github.com/example/new-tool',
        sourceId: 'github-ai-repos',
        sourceName: 'GitHub AI Repos',
        title: 'example/new-tool',
        url: 'https://github.com/example/new-tool',
        summary: 'Repository for developer workflows',
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['ai'],
      },
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0].text).toContain('GitHub AI Repos');
    expect(messages[0].text).toContain('example/new-tool');
  });

  it('prefers subreddit forum sources for their configured topic', () => {
    const messages = new DigestService(1).buildDigestMessages([
      {
        id: 'https://example.com/generic-k8s',
        sourceId: 'generic-blog',
        sourceName: 'Generic Blog',
        title: 'Kubernetes discussion',
        url: 'https://example.com/generic-k8s',
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['k8s'],
      },
      {
        id: 'https://www.reddit.com/r/kubernetes/comments/example/post/',
        sourceId: 'reddit-kubernetes',
        sourceName: 'Reddit r/kubernetes',
        title: 'Weekly cluster operations thread',
        url: 'https://www.reddit.com/r/kubernetes/comments/example/post/',
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['k8s'],
      },
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0].text).toContain('Reddit r/kubernetes');
    expect(messages[0].text).toContain('Weekly cluster operations thread');
  });

  it('builds one telegram message per article', () => {
    const aiArticle = {
        id: 'https://example.com/ai',
        sourceId: 'hn',
        sourceName: 'Hacker News',
        title: 'New AI model released',
        url: 'https://example.com/ai',
        summary: 'AI summary',
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['ai' as const],
      };
    const messages = new DigestService(10).buildDigestMessages([
      aiArticle,
      {
        id: 'https://example.com/cloud',
        sourceId: 'aws-news-blog',
        sourceName: 'AWS News Blog',
        title: 'New cloud region launched',
        url: 'https://example.com/cloud',
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['cloud'],
      },
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[0].text).toContain('🤖  <b>AI UPDATE</b>');
    expect(messages[0].text).toContain('📰  <b>New AI model released</b>');
    expect(messages[0].text).toContain('📅 <b>Công bố:</b> 09/06/2026');
    expect(messages[0].text).toContain('📝 <b>Tóm tắt</b>');
    expect(messages[0].text).toContain('AI summary');
    expect(messages[0].text).toContain('🎯 <b>Vì sao đáng chú ý?</b>');
    expect(messages[0].text).toContain('⚡ <b>Mức hành động</b>');
    expect(messages[0].text).toContain('🟡 <b>THEO DÕI</b> —');
    expect(messages[0].text).toContain('🏢 <i>Nguồn: Hacker News</i>');
    expect(messages[0].text).not.toContain('Đọc chi tiết');
    expect(messages[0].url).toBe('https://example.com/ai');
    expect(messages[0].article).toEqual(aiArticle);
    expect(messages[0].topic).toBe('ai');
    expect(messages[1].text).toContain('☁️  <b>CLOUD UPDATE</b>');
    expect(messages[1].text).toContain('📰  <b>New cloud region launched</b>');
    expect(messages[1].url).toBe('https://example.com/cloud');
  });

  it('keeps article summaries up to 360 characters in telegram messages', () => {
    const longSummary = 'a'.repeat(360);
    const messages = new DigestService(10).buildDigestMessages([
      {
        id: 'https://example.com/ai',
        sourceId: 'hn',
        sourceName: 'Hacker News',
        title: 'New AI model released',
        url: 'https://example.com/ai',
        summary: longSummary,
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['ai'],
      },
    ]);

    expect(messages[0].text).toContain(longSummary);
  });

  it('truncates article summaries after 360 characters in telegram messages', () => {
    const longSummary = 'a'.repeat(1200);
    const messages = new DigestService(10).buildDigestMessages([
      {
        id: 'https://example.com/ai',
        sourceId: 'hn',
        sourceName: 'Hacker News',
        title: 'New AI model released',
        url: 'https://example.com/ai',
        summary: longSummary,
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['ai'],
      },
    ]);

    const renderedSummary = messages[0].text.split('\n').find((line) => /^a+…$/.test(line)) ?? '';

    expect(renderedSummary).toHaveLength(360);
    expect(renderedSummary.endsWith('…')).toBe(true);
  });

  it('renders a complete security message with the published date and escaped title', () => {
    const article = {
      id: 'https://example.com/cve',
      sourceId: 'security-source',
      sourceName: 'Security Source',
      title: 'Critical <gateway> vulnerability',
      url: 'https://example.com/cve',
      summary: 'A gateway vulnerability is being actively exploited.',
      publishedAt: '2026-07-14T09:00:00.000Z',
      collectedAt: '2026-07-15T09:00:00.000Z',
      topics: ['security' as const],
    };

    const [message] = new DigestService(10).buildDigestMessages([article]);

    expect(message.text).toContain('🔐  <b>SECURITY UPDATE</b>');
    expect(message.text).toContain('📰  <b>Critical &lt;gateway&gt; vulnerability</b>');
    expect(message.text).toContain('📅 <b>Công bố:</b> 14/07/2026');
    expect(message.text).toContain('📝 <b>Tóm tắt</b>');
    expect(message.text).toContain('A gateway vulnerability is being actively exploited.');
    expect(message.text).toContain('🎯 <b>Vì sao đáng chú ý?</b>');
    expect(message.text).toContain('⚡ <b>Mức hành động</b>');
    expect(message.text).toContain('🟡 <b>THEO DÕI</b> —');
    expect(message.text).toContain('🏢 <i>Nguồn: Security Source</i>');
    const orderedSections = [
      '📰  <b>Critical',
      '📅 <b>Công bố:',
      '📝 <b>Tóm tắt</b>',
      '🎯 <b>Vì sao đáng chú ý?</b>',
      '⚡ <b>Mức hành động</b>',
      '🏢 <i>Nguồn:',
    ];
    const sectionIndexes = orderedSections.map((section) => message.text.indexOf(section));
    expect(sectionIndexes.every((index) => index >= 0)).toBe(true);
    expect(sectionIndexes).toEqual([...sectionIndexes].sort((left, right) => left - right));
    expect(message.url).toBe(article.url);
    expect(message.article).toEqual(article);
    expect(message.topic).toBe('security');
  });

  it('falls back from an invalid published date to the collected date', () => {
    const [message] = new DigestService(10).buildDigestMessages([
      {
        id: 'https://example.com/ai',
        sourceId: 'hn',
        sourceName: 'Hacker News',
        title: 'New AI model released',
        url: 'https://example.com/ai',
        publishedAt: 'invalid',
        collectedAt: '2026-07-13T09:00:00.000Z',
        topics: ['ai'],
      },
    ]);

    expect(message.text).toContain('📅 <b>Công bố:</b> 13/07/2026');
  });

  it('shows an unknown publication date when all article dates are invalid', () => {
    const [message] = new DigestService(10).buildDigestMessages([
      {
        id: 'https://example.com/ai',
        sourceId: 'hn',
        sourceName: 'Hacker News',
        title: 'New AI model released',
        url: 'https://example.com/ai',
        publishedAt: 'invalid',
        collectedAt: 'also-invalid',
        topics: ['ai'],
      },
    ]);

    expect(message.text).toContain('📅 <b>Công bố:</b> Không rõ');
  });

  it('uses the article image url when building telegram messages', () => {
    const messages = new DigestService(10).buildDigestMessages([
      {
        id: 'https://example.com/ai',
        sourceId: 'hn',
        sourceName: 'Hacker News',
        title: 'New AI model released',
        url: 'https://example.com/ai',
        imageUrl: 'https://example.com/article-image.png',
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['ai'],
      },
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0].imageUrl).toBe('https://example.com/article-image.png');
  });

  it('uses a topic fallback image when an article has no image', () => {
    const messages = new DigestService(10).buildDigestMessages([
      {
        id: 'https://example.com/security',
        sourceId: 'google-security-blog',
        sourceName: 'Google Security Blog',
        title: 'Security vulnerability update',
        url: 'https://example.com/security',
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['security'],
      },
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0].imageUrl).toBe('https://placehold.co/1200x630/991b1b/ffffff.png?text=Security');
  });

  it('returns no messages when there are no matching articles', () => {
    expect(new DigestService(10).buildDigestMessages([])).toEqual([]);
  });

  it('diversifies sources within the same topic when alternatives exist', () => {
    const digest = new DigestService(2).buildDigest([
      {
        id: 'https://example.com/k8s-cloud-1',
        sourceId: 'kubernetes-blog',
        sourceName: 'Kubernetes Blog',
        title: 'Kubernetes cloud networking update',
        url: 'https://example.com/k8s-cloud-1',
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['cloud'],
      },
      {
        id: 'https://example.com/k8s-cloud-2',
        sourceId: 'kubernetes-blog',
        sourceName: 'Kubernetes Blog',
        title: 'Kubernetes cloud storage update',
        url: 'https://example.com/k8s-cloud-2',
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['cloud'],
      },
      {
        id: 'https://example.com/aws-cloud',
        sourceId: 'aws-news-blog',
        sourceName: 'AWS News Blog',
        title: 'AWS cloud operations update',
        url: 'https://example.com/aws-cloud',
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['cloud'],
      },
    ]);

    expect(digest).toContain('AWS cloud operations update');
    expect(digest).toContain('Kubernetes cloud networking update');
    expect(digest).not.toContain('Kubernetes cloud storage update');
  });
});
