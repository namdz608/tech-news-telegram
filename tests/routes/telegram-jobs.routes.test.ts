import { beforeEach, describe, expect, it, vi } from 'vitest';

const { crawlMock, sendMessagesMock, editDigestMessagesMock } = vi.hoisted(() => ({
  crawlMock: vi.fn(),
  sendMessagesMock: vi.fn(),
  editDigestMessagesMock: vi.fn(async (messages: unknown[]) => messages),
}));

vi.mock('../../src/crawlers/vn-jobs.crawler', () => ({
  VnJobsCrawler: class {
    crawl = crawlMock;
  },
}));

vi.mock('../../src/services/telegram.service', () => ({
  TelegramService: class {
    sendMessages = sendMessagesMock;
  },
}));

vi.mock('../../src/services/digest-message-editorial.service', () => ({
  editDigestMessages: (...args: unknown[]) => editDigestMessagesMock(...args),
}));

import request from 'supertest';
import { createApp } from '../../src/app';

describe('POST /telegram/send-jobs', () => {
  beforeEach(() => {
    crawlMock.mockReset();
    sendMessagesMock.mockReset();
    editDigestMessagesMock.mockClear();
  });

  it('returns 400 when role is missing', async () => {
    const response = await request(createApp()).post('/telegram/send-jobs');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Invalid role/);
    expect(crawlMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid experienceYears', async () => {
    const response = await request(createApp()).post('/telegram/send-jobs').query({
      role: 'devops',
      experienceYears: '10+',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Invalid experienceYears/);
  });

  it('succeeds without experienceYears and does not send when empty', async () => {
    crawlMock.mockResolvedValueOnce([]);

    const response = await request(createApp()).post('/telegram/send-jobs').query({ role: 'devops' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      sent: true,
      articleCount: 0,
      messageCount: 0,
      role: 'devops',
      experienceYears: null,
      language: 'vi',
    });
    expect(sendMessagesMock).not.toHaveBeenCalled();
  });

  it('crawls, edits, and sends mapped job articles', async () => {
    crawlMock.mockResolvedValueOnce([
      {
        id: 'https://example.com/job',
        sourceId: 'itviec',
        sourceName: 'ITviec',
        title: 'DevOps Engineer',
        url: 'https://example.com/job',
        summary: 'Acme · Ho Chi Minh',
        collectedAt: '2026-08-03T00:00:00.000Z',
        topics: ['devops'],
      },
    ]);
    sendMessagesMock.mockResolvedValueOnce(undefined);

    const response = await request(createApp()).post('/telegram/send-jobs').query({
      role: 'devops',
      experienceYears: '1-2',
    });

    expect(response.status).toBe(200);
    expect(crawlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'devops',
        experienceYears: '1-2',
      }),
    );
    expect(sendMessagesMock).toHaveBeenCalledTimes(1);
    expect(response.body).toMatchObject({
      sent: true,
      articleCount: 1,
      messageCount: 1,
      role: 'devops',
      experienceYears: '1-2',
    });
  });
});
