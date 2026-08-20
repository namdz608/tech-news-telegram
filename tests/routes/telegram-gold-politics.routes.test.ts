import { inspect } from 'node:util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createGoldPoliticsFlowServiceMock,
  goldPoliticsRunMock,
  gadgetRunMock,
  healthRunMock,
} = vi.hoisted(() => ({
  createGoldPoliticsFlowServiceMock: vi.fn(),
  goldPoliticsRunMock: vi.fn(),
  gadgetRunMock: vi.fn(),
  healthRunMock: vi.fn(),
}));

vi.mock('../../src/services/gold-politics-flow.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/gold-politics-flow.service')>();
  return {
    ...actual,
    createGoldPoliticsFlowService: createGoldPoliticsFlowServiceMock,
  };
});

vi.mock('../../src/services/gadget-flow.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/gadget-flow.service')>();
  return {
    ...actual,
    createGadgetFlowService: () => ({ run: gadgetRunMock }),
  };
});

vi.mock('../../src/services/health-flow.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/health-flow.service')>();
  return {
    ...actual,
    createHealthFlowService: () => ({ run: healthRunMock }),
  };
});

import request from 'supertest';

const success = {
  sent: true,
  channel: 'telegram-gold-politics',
  priceMessageCount: 1,
  newsMessageCount: 2,
  collectedCount: 7,
  eligibleCount: 4,
  skippedSeenCount: 1,
  partial: false,
  failedSources: [],
  language: 'vi',
};

const gadgetSuccess = {
  sent: true, collectedCount: 2, eligibleCount: 1, skippedSeenCount: 0,
  messageCount: 1, language: 'vi', channel: 'telegram-gadgets',
};

const healthSuccess = {
  sent: true, collectedCount: 2, eligibleCount: 1, skippedSeenCount: 0,
  messageCount: 1, language: 'vi', channel: 'telegram-health',
};

const SECRETS = {
  token: 'injected-bot-token-SECRET',
  chatId: '-100-injected-chat-SECRET',
  header: 'Authorization: Bearer injected-header-SECRET',
  sourceText: 'injected allegation source-text SECRET',
};

async function createTestApp() {
  const { createApp } = await import('../../src/app');
  return createApp();
}

async function loadGoldPoliticsErrors() {
  return import('../../src/services/gold-politics-flow.service');
}

async function loadDeliveryError() {
  const { GoldPoliticsDeliveryError } = await import(
    '../../src/services/gold-politics-delivery.service'
  );
  return GoldPoliticsDeliveryError;
}

function loggedText(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls
    .map((args) => args.map((arg) => inspect(arg, { depth: 10, showHidden: true })).join(' '))
    .join('\n');
}

function expectNoInjectedSecrets(text: string) {
  expect(text).not.toContain(SECRETS.token);
  expect(text).not.toContain(SECRETS.chatId);
  expect(text).not.toContain(SECRETS.header);
  expect(text).not.toContain(SECRETS.sourceText);
}

describe('POST /telegram/send-gold-politics', () => {
  beforeEach(() => {
    vi.resetModules();
    createGoldPoliticsFlowServiceMock.mockReset();
    goldPoliticsRunMock.mockReset();
    gadgetRunMock.mockReset();
    healthRunMock.mockReset();
    createGoldPoliticsFlowServiceMock.mockImplementation(() => ({ run: goldPoliticsRunMock }));
  });

  it('does not call the gold-politics factory when the app is imported', async () => {
    const { createApp } = await import('../../src/app');
    createApp();
    expect(createGoldPoliticsFlowServiceMock).not.toHaveBeenCalled();
  });

  it('returns the gold-politics flow response unchanged', async () => {
    goldPoliticsRunMock.mockResolvedValue(success);
    const response = await request(await createTestApp()).post('/telegram/send-gold-politics');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(success);
  });

  it('returns 503 when every gold-politics source fails', async () => {
    const { AllGoldPoliticsSourcesFailedError, isAllGoldPoliticsSourcesFailedError } =
      await loadGoldPoliticsErrors();
    const error = new AllGoldPoliticsSourcesFailedError();
    expect(isAllGoldPoliticsSourcesFailedError(error)).toBe(true);
    goldPoliticsRunMock.mockImplementationOnce(async () => { throw error; });
    const response = await request(await createTestApp()).post('/telegram/send-gold-politics');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'All gold-politics sources failed' });
  });

  it('returns 409 while another gold-politics run is active', async () => {
    let release = () => {};
    goldPoliticsRunMock.mockReturnValue(new Promise((resolve) => {
      release = () => resolve(success);
    }));
    const app = await createTestApp();
    const first = request(app).post('/telegram/send-gold-politics').then((response) => response);
    try {
      await vi.waitFor(() => expect(goldPoliticsRunMock).toHaveBeenCalledOnce());
      const second = await request(app).post('/telegram/send-gold-politics');
      expect(second.status).toBe(409);
      expect(second.body).toEqual({ error: 'Gold-politics digest is already running' });
    } finally {
      release();
    }
    await first;
  });

  it('does not block gadget or health routes while a gold-politics run is active', async () => {
    let release = () => {};
    goldPoliticsRunMock.mockReturnValue(new Promise((resolve) => {
      release = () => resolve(success);
    }));
    gadgetRunMock.mockResolvedValue(gadgetSuccess);
    healthRunMock.mockResolvedValue(healthSuccess);
    const app = await createTestApp();
    const goldRequest = request(app).post('/telegram/send-gold-politics').then((response) => response);
    try {
      await vi.waitFor(() => expect(goldPoliticsRunMock).toHaveBeenCalledOnce());

      const gadgetResponse = await request(app).post('/telegram/send-gadgets');
      expect(gadgetResponse.status).toBe(200);
      expect(gadgetRunMock).toHaveBeenCalledOnce();

      const healthResponse = await request(app).post('/telegram/send-health');
      expect(healthResponse.status).toBe(200);
      expect(healthRunMock).toHaveBeenCalledOnce();
    } finally {
      release();
    }
    await goldRequest;
  });

  it('does not block gold-politics while a gadget run is active', async () => {
    let release = () => {};
    gadgetRunMock.mockReturnValue(new Promise((resolve) => {
      release = () => resolve(gadgetSuccess);
    }));
    goldPoliticsRunMock.mockResolvedValue(success);
    const app = await createTestApp();
    const gadgetRequest = request(app).post('/telegram/send-gadgets').then((response) => response);
    try {
      await vi.waitFor(() => expect(gadgetRunMock).toHaveBeenCalledOnce());
      const goldResponse = await request(app).post('/telegram/send-gold-politics');
      expect(goldResponse.status).toBe(200);
      expect(goldResponse.body).toEqual(success);
      expect(goldPoliticsRunMock).toHaveBeenCalledOnce();
    } finally {
      release();
    }
    await gadgetRequest;
  });

  it('does not block gold-politics while a health run is active', async () => {
    let release = () => {};
    healthRunMock.mockReturnValue(new Promise((resolve) => {
      release = () => resolve(healthSuccess);
    }));
    goldPoliticsRunMock.mockResolvedValue(success);
    const app = await createTestApp();
    const healthRequest = request(app).post('/telegram/send-health').then((response) => response);
    try {
      await vi.waitFor(() => expect(healthRunMock).toHaveBeenCalledOnce());
      const goldResponse = await request(app).post('/telegram/send-gold-politics');
      expect(goldResponse.status).toBe(200);
      expect(goldResponse.body).toEqual(success);
      expect(goldPoliticsRunMock).toHaveBeenCalledOnce();
    } finally {
      release();
    }
    await healthRequest;
  });

  it.each([
    ['GoldPoliticsDeliveryError', async () => new (await loadDeliveryError())('telegram-send-failed')],
    ['GoldPoliticsFlowError', async () => {
      const { GoldPoliticsFlowError } = await loadGoldPoliticsErrors();
      return new GoldPoliticsFlowError('sent-history-read-failed');
    }],
  ] as const)(
    'maps a safe %s to HTTP 500 without leaking injected secrets',
    async (_name, createError) => {
      goldPoliticsRunMock.mockImplementationOnce(async () => { throw await createError(); });
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        const response = await request(await createTestApp())
          .post('/telegram/send-gold-politics')
          .set('Authorization', SECRETS.header)
          .send({
            token: SECRETS.token,
            chatId: SECRETS.chatId,
            text: SECRETS.sourceText,
          });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: 'Internal server error' });
        expectNoInjectedSecrets(JSON.stringify(response.body));
        expectNoInjectedSecrets(loggedText(errorLog));
      } finally {
        errorLog.mockRestore();
      }
    },
  );

  it('clears the lock after a 503 so the next request can run', async () => {
    const { AllGoldPoliticsSourcesFailedError } = await loadGoldPoliticsErrors();
    goldPoliticsRunMock
      .mockRejectedValueOnce(new AllGoldPoliticsSourcesFailedError())
      .mockResolvedValueOnce(success);
    const app = await createTestApp();

    const first = await request(app).post('/telegram/send-gold-politics');
    expect(first.status).toBe(503);

    const second = await request(app).post('/telegram/send-gold-politics');
    expect(second.status).toBe(200);
    expect(second.body).toEqual(success);
  });

  it('clears the lock after a 500 so the next request can run', async () => {
    const GoldPoliticsDeliveryError = await loadDeliveryError();
    goldPoliticsRunMock
      .mockRejectedValueOnce(new GoldPoliticsDeliveryError('telegram-send-failed'))
      .mockResolvedValueOnce(success);
    const app = await createTestApp();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const first = await request(app).post('/telegram/send-gold-politics');
      expect(first.status).toBe(500);

      const second = await request(app).post('/telegram/send-gold-politics');
      expect(second.status).toBe(200);
      expect(second.body).toEqual(success);
    } finally {
      errorLog.mockRestore();
    }
  });

  it('calls the lazy factory once across repeated non-concurrent requests', async () => {
    goldPoliticsRunMock.mockResolvedValue(success);
    const app = await createTestApp();

    const first = await request(app).post('/telegram/send-gold-politics');
    const second = await request(app).post('/telegram/send-gold-politics');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(createGoldPoliticsFlowServiceMock).toHaveBeenCalledOnce();
    expect(goldPoliticsRunMock).toHaveBeenCalledTimes(2);
  });
});
