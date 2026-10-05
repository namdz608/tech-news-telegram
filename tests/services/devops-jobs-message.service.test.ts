import { describe, expect, it } from 'vitest';
import { DevopsJobsMessageService } from '../../src/services/devops-jobs-message.service';
import type { DevopsJob } from '../../src/types/devops-jobs';

function job(overrides: Partial<DevopsJob> = {}): DevopsJob {
  return {
    id: '1',
    sourceId: 'remoteok',
    sourceName: 'Remote OK',
    title: 'DevOps <Engineer>',
    company: 'Acme & Co',
    url: 'https://example.com/jobs/1',
    location: 'United States',
    description: '<p>Keep the platform healthy</p>',
    tags: [],
    publishedAt: '2026-10-02T18:30:00.000Z',
    ...overrides,
  };
}

const passthrough = {
  async translateDigestVerified(text: string) {
    return { text, succeeded: true };
  },
};

describe('DevopsJobsMessageService', () => {
  const service = new DevopsJobsMessageService('Asia/Ho_Chi_Minh', passthrough);

  it('renders salary and escapes HTML', async () => {
    const [message] = await service.buildMessages([job({ salary: '$100k' })]);
    expect(message?.url).toBe('https://example.com/jobs/1');
    expect(message?.text).toBe([
      '🛠️ DevOps remote',
      '',
      '<b>DevOps &lt;Engineer&gt;</b>',
      '🏢 Acme &amp; Co',
      '📍 Remote · toàn cầu',
      '💰 $100k',
      '🗓 03/10/2026',
      '📡 Remote OK',
      '',
      'Keep the platform healthy',
    ].join('\n'));
  });

  it('omits the salary line and the excerpt when they are absent', async () => {
    const [message] = await service.buildMessages([job({ description: '   ' })]);
    expect(message?.text.includes('💰')).toBe(false);
    expect(message?.text.endsWith('📡 Remote OK')).toBe(true);
  });

  it('truncates the excerpt to 240 characters and adds an ellipsis', async () => {
    const [message] = await service.buildMessages([
      job({ description: 'a'.repeat(241) }),
    ]);
    const excerpt = message?.text.split('\n').at(-1);
    expect(excerpt).toBe(`${'a'.repeat(240)}…`);
  });

  it('translates the title, salary, and excerpt, then escapes HTML', async () => {
    const translator = {
      async translateDigestVerified(text: string) {
        return { text: `VI <${text}>`, succeeded: true };
      },
    };
    const [message] = await new DevopsJobsMessageService('Asia/Ho_Chi_Minh', translator)
      .buildMessages([job({ salary: '$100k' })]);
    expect(message?.text).toContain('<b>VI &lt;DevOps &lt;Engineer&gt;&gt;</b>');
    expect(message?.text).toContain('💰 VI &lt;$100k&gt;');
    expect(message?.text).toContain('VI &lt;Keep the platform healthy&gt;');
    expect(message?.text).toContain('🏢 Acme &amp; Co');
  });

  it('keeps the source text when translation fails', async () => {
    const translator = {
      async translateDigestVerified(text: string) {
        return { text, succeeded: false };
      },
    };
    const [message] = await new DevopsJobsMessageService('Asia/Ho_Chi_Minh', translator)
      .buildMessages([job()]);
    expect(message?.text).toContain('<b>DevOps &lt;Engineer&gt;</b>');
    expect(message?.text).toContain('Keep the platform healthy');
  });
});
