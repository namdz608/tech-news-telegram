import { inspect } from 'node:util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDevopsInfraFlowService: vi.fn(),
  devopsRun: vi.fn(),
  gadgetRun: vi.fn(),
  healthRun: vi.fn(),
  goldRun: vi.fn(),
}));

vi.mock('../../src/services/devops-infra-flow.service', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/services/devops-infra-flow.service')>(),
  createDevopsInfraFlowService: mocks.createDevopsInfraFlowService,
}));
vi.mock('../../src/services/gadget-flow.service', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/services/gadget-flow.service')>(),
  createGadgetFlowService: () => ({ run: mocks.gadgetRun }),
}));
vi.mock('../../src/services/health-flow.service', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/services/health-flow.service')>(),
  createHealthFlowService: () => ({ run: mocks.healthRun }),
}));
vi.mock('../../src/services/gold-politics-flow.service', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/services/gold-politics-flow.service')>(),
  createGoldPoliticsFlowService: () => ({ run: mocks.goldRun }),
}));

import request from 'supertest';
import { releaseDevopsInfraDigestLock } from '../../src/services/devops-infra-digest-lock';

const success = {
  sent: true,
  channel: 'telegram-devops-infra',
  messageCount: 2,
  collectedCount: 5,
  eligibleCount: 3,
  skippedSeenCount: 1,
  partial: false,
  failedSources: [],
  language: 'vi',
};
const otherSuccess = {
  sent: true,
  collectedCount: 1,
  eligibleCount: 1,
  skippedSeenCount: 0,
  messageCount: 1,
  language: 'vi',
};
const SECRETS = [
  'dummy-devops-route-token-SECRET',
  '-100-dummy-devops-route-chat-SECRET',
  'Bearer dummy-devops-route-header-SECRET',
  'dummy devops source text SECRET',
];

async function createTestApp() {
  const { createApp } = await import('../../src/app');
  return createApp();
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<typeof success>((resolve) => {
    release = () => resolve(success);
  });
  return { promise, release };
}

function expectNoSecrets(value: unknown) {
  const text = typeof value === 'string'
    ? value
    : inspect(value, { depth: 10, showHidden: true });
  SECRETS.forEach((secret) => expect(text).not.toContain(secret));
}

describe('POST /telegram/send-devops-infra', () => {
  beforeEach(() => {
    vi.resetModules();
    releaseDevopsInfraDigestLock();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.createDevopsInfraFlowService.mockImplementation(() => ({ run: mocks.devopsRun }));
  });

  it('does not call the factory when createApp is imported', async () => {
    await createTestApp();
    expect(mocks.createDevopsInfraFlowService).not.toHaveBeenCalled();
  });

  it('returns the flow response unchanged', async () => {
    mocks.devopsRun.mockResolvedValue(success);
    const response = await request(await createTestApp()).post('/telegram/send-devops-infra');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(success);
  });

  it('maps all failed sources to 503', async () => {
    const { AllDevopsInfraSourcesFailedError } = await import(
      '../../src/services/devops-infra-flow.service'
    );
    mocks.devopsRun.mockRejectedValue(new AllDevopsInfraSourcesFailedError());
    const response = await request(await createTestApp()).post('/telegram/send-devops-infra');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'All devops-infra sources failed' });
  });

  it('returns 409 while another devops-infra run is active', async () => {
    const pending = deferred();
    mocks.devopsRun.mockReturnValue(pending.promise);
    const app = await createTestApp();
    const first = request(app).post('/telegram/send-devops-infra').then((value) => value);
    try {
      await vi.waitFor(() => expect(mocks.devopsRun).toHaveBeenCalledOnce());
      const second = await request(app).post('/telegram/send-devops-infra');
      expect(second.status).toBe(409);
      expect(second.body).toEqual({ error: 'DevOps infra digest is already running' });
    } finally {
      pending.release();
    }
    await first;
  });

  it('does not block gadget, health, or gold-politics while running', async () => {
    const pending = deferred();
    mocks.devopsRun.mockReturnValue(pending.promise);
    mocks.gadgetRun.mockResolvedValue({ ...otherSuccess, channel: 'telegram-gadgets' });
    mocks.healthRun.mockResolvedValue({ ...otherSuccess, channel: 'telegram-health' });
    mocks.goldRun.mockResolvedValue({ ...otherSuccess, channel: 'telegram-gold-politics' });
    const app = await createTestApp();
    const active = request(app).post('/telegram/send-devops-infra').then((value) => value);
    try {
      await vi.waitFor(() => expect(mocks.devopsRun).toHaveBeenCalledOnce());
      for (const path of ['send-gadgets', 'send-health', 'send-gold-politics']) {
        expect((await request(app).post(`/telegram/${path}`)).status).toBe(200);
      }
    } finally {
      pending.release();
    }
    await active;
  });

  it.each([
    ['send-gadgets', 'gadgetRun'],
    ['send-health', 'healthRun'],
    ['send-gold-politics', 'goldRun'],
  ] as const)('is not blocked by an active %s run', async (path, mockName) => {
    const pending = deferred();
    mocks[mockName].mockReturnValue(pending.promise);
    mocks.devopsRun.mockResolvedValue(success);
    const app = await createTestApp();
    const active = request(app).post(`/telegram/${path}`).then((value) => value);
    try {
      await vi.waitFor(() => expect(mocks[mockName]).toHaveBeenCalledOnce());
      const response = await request(app).post('/telegram/send-devops-infra');
      expect(response.status).toBe(200);
      expect(response.body).toEqual(success);
    } finally {
      pending.release();
    }
    await active;
  });

  it.each(['delivery', 'flow'])('maps a safe %s error to 500 without leaks', async (kind) => {
    const error = kind === 'delivery'
      ? new (await import('../../src/services/devops-infra-delivery.service'))
          .DevopsInfraDeliveryError('telegram-send-failed')
      : new (await import('../../src/services/devops-infra-flow.service'))
          .DevopsInfraFlowError('sent-history-read-failed');
    mocks.devopsRun.mockRejectedValue(error);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await request(await createTestApp())
        .post('/telegram/send-devops-infra')
        .set('Authorization', SECRETS[2])
        .send({ token: SECRETS[0], chatId: SECRETS[1], text: SECRETS[3] });
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
      expectNoSecrets(response.body);
      expectNoSecrets(errorLog.mock.calls);
    } finally {
      errorLog.mockRestore();
    }
  });

  it('clears the lock after errors and reuses the lazy singleton', async () => {
    const { AllDevopsInfraSourcesFailedError } = await import(
      '../../src/services/devops-infra-flow.service'
    );
    mocks.devopsRun
      .mockRejectedValueOnce(new AllDevopsInfraSourcesFailedError())
      .mockResolvedValue(success);
    const app = await createTestApp();
    expect((await request(app).post('/telegram/send-devops-infra')).status).toBe(503);
    expect((await request(app).post('/telegram/send-devops-infra')).status).toBe(200);
    expect(mocks.createDevopsInfraFlowService).toHaveBeenCalledOnce();
    expect(mocks.devopsRun).toHaveBeenCalledTimes(2);
  });
});
