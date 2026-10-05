import { beforeEach, describe, expect, it, vi } from 'vitest';

const { crawlMock, sendMessagesMock, jobsSendMessagesMock, sendJobsPdfEmailMock, assertConfiguredMock, buildJobsPdfMock } = vi.hoisted(
  () => ({
    crawlMock: vi.fn(),
    sendMessagesMock: vi.fn(),
    jobsSendMessagesMock: vi.fn(),
    sendJobsPdfEmailMock: vi.fn(),
    assertConfiguredMock: vi.fn(),
    buildJobsPdfMock: vi.fn(),
  }),
);

vi.mock('../../src/crawlers/vn-jobs.crawler', () => ({
  VnJobsCrawler: class {
    crawl = crawlMock;
  },
}));

vi.mock('../../src/services/telegram.service', () => ({
  TelegramService: class {
    sendMessages = sendMessagesMock;
  },
  createTelegramService: () => ({
    sendMessages: jobsSendMessagesMock,
  }),
}));

vi.mock('../../src/services/email.service', () => ({
  EmailService: class {
    assertConfigured = assertConfiguredMock;
    sendJobsPdfEmail = sendJobsPdfEmailMock;
  },
}));

vi.mock('../../src/services/jobs-pdf.service', () => ({
  buildJobsPdf: buildJobsPdfMock,
}));

import request from 'supertest';
import { createApp } from '../../src/app';

describe('POST /telegram/send-jobs', () => {
  beforeEach(() => {
    crawlMock.mockReset();
    sendMessagesMock.mockReset();
    jobsSendMessagesMock.mockReset();
    jobsSendMessagesMock.mockResolvedValue(undefined);
    sendJobsPdfEmailMock.mockReset();
    assertConfiguredMock.mockReset();
    buildJobsPdfMock.mockReset();
    assertConfiguredMock.mockImplementation(() => undefined);
    buildJobsPdfMock.mockResolvedValue({
      buffer: Buffer.from('%PDF'),
      fileName: 'vn-jobs-devops-test.pdf',
    });
    sendJobsPdfEmailMock.mockResolvedValue({
      messageId: 'msg-1',
      mailTo: 'jobs@example.com',
    });
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

  it('does not send email when crawl is empty', async () => {
    crawlMock.mockResolvedValueOnce({
      articles: [],
      crawledCounts: { topcv: 0, itviec: 0, vietnamworks: 0 },
      boardCounts: { topcv: 0, itviec: 0, vietnamworks: 0 },
      matchedCount: 0,
    });

    const response = await request(createApp()).post('/telegram/send-jobs').query({ role: 'devops' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      sent: false,
      channel: 'email',
      articleCount: 0,
      role: 'devops',
      experienceYears: null,
      limit: 10,
      matchedCount: 0,
      language: 'vi',
    });
    expect(sendMessagesMock).not.toHaveBeenCalled();
    expect(sendJobsPdfEmailMock).not.toHaveBeenCalled();
  });

  it('passes limit to crawler maxResults', async () => {
    crawlMock.mockResolvedValueOnce({
      articles: [],
      crawledCounts: { topcv: 0, itviec: 0, vietnamworks: 0 },
      boardCounts: { topcv: 0, itviec: 0, vietnamworks: 0 },
      matchedCount: 0,
    });

    const response = await request(createApp()).post('/telegram/send-jobs').query({
      role: 'devops',
      limit: '25',
    });

    expect(response.status).toBe(200);
    expect(crawlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'devops',
        maxResults: 25,
      }),
    );
    expect(response.body.limit).toBe(25);
  });

  it('returns 400 for invalid limit', async () => {
    const response = await request(createApp()).post('/telegram/send-jobs').query({
      role: 'devops',
      limit: '101',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Invalid limit/);
  });

  it('returns 503 when email is not configured', async () => {
    crawlMock.mockResolvedValueOnce({
      articles: [
        {
          id: '1',
          sourceId: 'itviec',
          sourceName: 'ITviec',
          title: 'DevOps',
          url: 'https://example.com/1',
          collectedAt: '2026-08-03T00:00:00.000Z',
          topics: ['devops'],
        },
      ],
      boardCounts: { topcv: 0, itviec: 1, vietnamworks: 0 },
      crawledCounts: { topcv: 0, itviec: 1, vietnamworks: 0 },
      matchedCount: 1,
    });
    assertConfiguredMock.mockImplementation(() => {
      throw new Error('Email not configured: missing SMTP_HOST, MAIL_TO');
    });

    const response = await request(createApp()).post('/telegram/send-jobs').query({ role: 'devops' });

    expect(response.status).toBe(503);
    expect(response.body.error).toMatch(/Email not configured/);
    expect(sendJobsPdfEmailMock).not.toHaveBeenCalled();
    expect(sendMessagesMock).not.toHaveBeenCalled();
  });

  it('crawls, builds PDF, emails, and does not use Telegram', async () => {
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
      crawledCounts: { topcv: 0, itviec: 8, vietnamworks: 12 },
      matchedCount: 8,
    });

    const response = await request(createApp()).post('/telegram/send-jobs').query({
      role: 'devops',
      experienceYears: '1-2',
    });

    expect(response.status).toBe(200);
    expect(crawlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'devops',
        experienceYears: '1-2',
        maxResults: 10,
      }),
    );
    expect(buildJobsPdfMock).toHaveBeenCalledTimes(1);
    expect(sendJobsPdfEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'devops',
        pdfFileName: 'vn-jobs-devops-test.pdf',
        articleCount: 1,
      }),
    );
    expect(sendMessagesMock).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      sent: true,
      channel: 'email',
      articleCount: 1,
      role: 'devops',
      experienceYears: '1-2',
      matchedCount: 8,
      mailTo: 'jobs@example.com',
      pdfFileName: 'vn-jobs-devops-test.pdf',
      boardCounts: { topcv: 0, itviec: 3, vietnamworks: 5 },
    });
    expect(jobsSendMessagesMock).not.toHaveBeenCalled();
  });

  it('sends one Telegram card per job with the company logo and skips the PDF', async () => {
    crawlMock.mockResolvedValueOnce({
      articles: [
        {
          id: 'https://example.com/job',
          sourceId: 'itviec',
          sourceName: 'ITviec',
          title: 'DevOps Engineer',
          url: 'https://example.com/job',
          author: 'Acme',
          imageUrl: 'https://cdn.example.com/acme.jpg',
          collectedAt: '2026-08-03T00:00:00.000Z',
          topics: ['devops'],
          jobDetails: {
            description: 'Build CI/CD pipelines',
            skills: ['Docker'],
            salary: 'Thương lượng',
            location: 'Hà Nội',
          },
        },
      ],
      boardCounts: { topcv: 0, itviec: 1, vietnamworks: 0 },
      crawledCounts: { topcv: 0, itviec: 1, vietnamworks: 0 },
      matchedCount: 1,
    });

    const response = await request(createApp()).post('/telegram/send-jobs').query({
      role: 'devops',
      channel: 'telegram',
    });

    expect(response.status).toBe(200);
    expect(buildJobsPdfMock).not.toHaveBeenCalled();
    expect(sendJobsPdfEmailMock).not.toHaveBeenCalled();
    const messages = jobsSendMessagesMock.mock.calls[0]?.[0];
    expect(messages).toHaveLength(1);
    expect(messages[0].imageUrl).toBe('https://cdn.example.com/acme.jpg');
    expect(response.body).toMatchObject({
      sent: true,
      channel: 'telegram',
      telegramSent: true,
      messageCount: 1,
    });
    expect(response.body.mailTo).toBeUndefined();
    expect(response.body.pdfFileName).toBeUndefined();
  });

  it('sends Telegram when email fails and channel=both', async () => {
    crawlMock.mockResolvedValueOnce({
      articles: [
        {
          id: 'https://example.com/job',
          sourceId: 'itviec',
          sourceName: 'ITviec',
          title: 'DevOps Engineer',
          url: 'https://example.com/job',
          collectedAt: '2026-08-03T00:00:00.000Z',
          topics: ['devops'],
        },
      ],
      boardCounts: { topcv: 0, itviec: 1, vietnamworks: 0 },
      crawledCounts: { topcv: 0, itviec: 1, vietnamworks: 0 },
      matchedCount: 1,
    });
    sendJobsPdfEmailMock.mockRejectedValueOnce(new Error('Daily user sending limit exceeded'));

    const response = await request(createApp()).post('/telegram/send-jobs').query({
      role: 'devops',
      channel: 'both',
    });

    expect(response.status).toBe(200);
    expect(jobsSendMessagesMock).toHaveBeenCalledTimes(1);
    expect(response.body).toMatchObject({
      sent: true,
      channel: 'both',
      emailSent: false,
      telegramSent: true,
    });
    expect(response.body.emailError).toMatch(/Daily user sending limit exceeded/);
  });

  it('returns 400 for an unknown channel', async () => {
    const response = await request(createApp()).post('/telegram/send-jobs').query({
      role: 'devops',
      channel: 'slack',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Invalid channel/);
    expect(crawlMock).not.toHaveBeenCalled();
  });
});
