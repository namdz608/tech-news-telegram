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

describe('DevopsJobsMessageService', () => {
  const service = new DevopsJobsMessageService();

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
});
