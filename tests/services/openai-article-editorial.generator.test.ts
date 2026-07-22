import { describe, expect, it, vi } from 'vitest';
import { OpenAIArticleEditorialGenerator } from '../../src/services/openai-article-editorial.generator';
import type { ArticleEditorialInput } from '../../src/services/article-editorial.types';

const input: ArticleEditorialInput = {
  title: 'Critical gateway vulnerability',
  summary: 'A gateway vulnerability is being actively exploited.',
  sourceName: 'Security Source',
  topic: 'security',
  publishedAt: '2026-07-14T09:00:00.000Z',
  collectedAt: '2026-07-15T09:00:00.000Z',
};

describe('OpenAIArticleEditorialGenerator', () => {
  it('requests JSON-only Vietnamese editorial content through Responses API', async () => {
    const create = vi.fn().mockResolvedValue({ output_text: '{"title":"Tin"}' });
    const generator = new OpenAIArticleEditorialGenerator({ responses: { create } }, 'test-model');

    await expect(generator.generate(input)).resolves.toBe('{"title":"Tin"}');
    expect(create).toHaveBeenCalledWith({
      model: 'test-model',
      instructions: expect.stringContaining('actionLevel'),
      input: JSON.stringify(input),
    });
  });
});
