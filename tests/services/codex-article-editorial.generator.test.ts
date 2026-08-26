import { describe, expect, it, vi } from 'vitest';
import { CodexArticleEditorialGenerator } from '../../src/services/codex-article-editorial.generator';
import type { ArticleEditorialInput } from '../../src/services/article-editorial.types';

const input: ArticleEditorialInput = {
  title: 'Critical gateway vulnerability',
  summary: 'A gateway vulnerability is being actively exploited.',
  sourceName: 'Security Source',
  topic: 'security',
  publishedAt: '2026-07-14T09:00:00.000Z',
  collectedAt: '2026-07-15T09:00:00.000Z',
};

describe('CodexArticleEditorialGenerator', () => {
  it('requests JSON-only Vietnamese editorial content', async () => {
    const runner = { run: vi.fn().mockResolvedValue('{"title":"Tin"}') };
    const generator = new CodexArticleEditorialGenerator(runner, 12345);

    await expect(generator.generate(input)).resolves.toBe('{"title":"Tin"}');
    expect(runner.run).toHaveBeenCalledWith(
      expect.stringContaining('actionLevel'),
      JSON.stringify(input),
      12345,
    );
    expect(runner.run.mock.calls[0][0]).toContain('Không bịa');
  });

  it('uses domain-specific instructions when provided', async () => {
    const runner = { run: vi.fn().mockResolvedValue('{"title":"Tin"}') };
    const generator = new CodexArticleEditorialGenerator(runner, 12345);
    const customInput = { ...input, instructions: 'CUSTOM-INSTRUCTIONS' };

    await generator.generate(customInput);

    expect(runner.run).toHaveBeenCalledWith(
      'CUSTOM-INSTRUCTIONS',
      JSON.stringify(customInput),
      12345,
    );
  });

  it('edits a batch in one Codex execution while preserving input order', async () => {
    const runner = { run: vi.fn().mockResolvedValue('[{"title":"Một"},{"title":"Hai"}]') };
    const generator = new CodexArticleEditorialGenerator(runner, 12345);
    const inputs = [input, { ...input, title: 'Second article' }];

    await expect(generator.generateBatch(inputs)).resolves.toBe(
      '[{"title":"Một"},{"title":"Hai"}]',
    );
    expect(runner.run).toHaveBeenCalledTimes(1);
    expect(runner.run).toHaveBeenCalledWith(
      expect.stringContaining('cùng thứ tự'),
      JSON.stringify(inputs),
      12345,
    );
    expect(runner.run.mock.calls[0][0]).toContain('JSON array');
  });

  it('allows independent single-article Codex executions to run concurrently', async () => {
    const releases: Array<(value: string) => void> = [];
    const runner = {
      run: vi.fn(
        () => new Promise<string>((resolve) => {
          releases.push(resolve);
        }),
      ),
    };
    const generator = new CodexArticleEditorialGenerator(runner, 12345);

    const first = generator.generate(input);
    const second = generator.generate({ ...input, title: 'Second article' });

    await vi.waitFor(() => expect(runner.run).toHaveBeenCalledTimes(2));
    releases.shift()?.('{"title":"Tin thứ nhất"}');
    await expect(first).resolves.toContain('Tin thứ nhất');
    releases.shift()?.('{"title":"Tin thứ hai"}');
    await expect(second).resolves.toContain('Tin thứ hai');
  });
});
