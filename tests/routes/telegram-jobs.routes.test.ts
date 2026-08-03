import { beforeEach, describe, expect, it, vi } from 'vitest';

const { crawlMock, sendMessagesMock } = vi.hoisted(() => ({
  crawlMock: vi.fn(),
  sendMessagesMock: vi.fn(),
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

import request from 'supertest';
import { createApp } from '../../src/app';

describe('POST /telegram/send-jobs', () => {
  beforeEach(() => {
    crawlMock.mockReset();
    sendMessagesMock.mockReset();
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
    crawlMock.mockResolvedValueOnce({
      articles: [],
      boardCounts: { topcv: 0, itviec: 0, vietnamworks: 0 },
    });

    const response = await request(createApp()).post('/telegram/send-jobs').query({ role: 'devops' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      sent: true,
      articleCount: 0,
      messageCount: 0,
      role: 'devops',
      experienceYears: null,
      boardCounts: { topcv: 0, itviec: 0, vietnamworks: 0 },
      language: 'vi',
    });
    expect(sendMessagesMock).not.toHaveBeenCalled();
  });

  it('crawls and sends mapped job articles with boardCounts', async () => {
    crawlMock.mockResolvedValueOnce({
      articles: [
        {
          id: 'https://example.com/job',
          sourceId: 'itviec',
          sourceName: 'ITviec',
          title: 'DevOps Engineer',
          url: 'https://example.com/job',
          summary: 'Build CI/CD pipelines',
          collectedAt: '2026-08-03T00:00:00.000Z',
          topics: ['devops'],
          jobDetails: {
            description: 'Build CI/CD pipelines',
            skills: ['Docker', 'Kubernetes'],
            salary: 'Thương lượng',
            location: 'Hà Nội',
          },
        },
      ],
      boardCounts: { topcv: 0, itviec: 3, vietnamworks: 5 },
    });
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
    const sentMessages = sendMessagesMock.mock.calls[0][0];
    expect(sentMessages[0].text).toContain('Mô tả công việc');
    expect(sentMessages[0].text).toContain('Kỹ năng cần có');
    expect(sentMessages[0].text).toContain('Mức lương');
    expect(sentMessages[0].text).toContain('Địa điểm');
    expect(response.body).toMatchObject({
      sent: true,
      articleCount: 1,
      messageCount: 1,
      role: 'devops',
      experienceYears: '1-2',
      boardCounts: { topcv: 0, itviec: 3, vietnamworks: 5 },
    });
  });
});
