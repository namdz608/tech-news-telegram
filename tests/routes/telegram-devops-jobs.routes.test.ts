import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDevopsJobsFlowService: vi.fn(),
  jobsRun: vi.fn(),
  createDevopsInfraFlowService: vi.fn(),
  devopsRun: vi.fn(),
  gadgetRun: vi.fn(),
  healthRun: vi.fn(),
  goldRun: vi.fn(),
}));

vi.mock('../../src/services/devops-jobs-flow.service', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/services/devops-jobs-flow.service')>(),
  createDevopsJobsFlowService: mocks.createDevopsJobsFlowService,
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
import { releaseDevopsJobsDigestLock } from '../../src/services/devops-jobs-digest-lock';

const success = {
  sent: true,
  channel: 'telegram-devops-jobs',
  messageCount: 1,
  collectedCount: 2,
  eligibleCount: 1,
  skippedSeenCount: 0,
  partial: false,
  failedSources: [],
  language: 'vi',
};

async function createTestApp() {
  const { createApp } = await import('../../src/app');
  return createApp();
}

describe('POST /telegram/send-devops-jobs', () => {
  beforeEach(() => {
    vi.resetModules();
    releaseDevopsJobsDigestLock();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.createDevopsJobsFlowService.mockImplementation(() => ({ run: mocks.jobsRun }));
    mocks.createDevopsInfraFlowService.mockImplementation(() => ({ run: mocks.devopsRun }));
  });

  it('returns the flow response unchanged', async () => {
    mocks.jobsRun.mockResolvedValue(success);
    const response = await request(await createTestApp()).post('/telegram/send-devops-jobs');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(success);
    expect(JSON.stringify(response.body)).not.toContain('test-devops-jobs-token');
  });

  it('maps all failed sources to 503', async () => {
    const { AllDevopsJobsSourcesFailedError } = await import(
      '../../src/services/devops-jobs-flow.service'
    );
    mocks.jobsRun.mockRejectedValue(new AllDevopsJobsSourcesFailedError());
    const response = await request(await createTestApp()).post('/telegram/send-devops-jobs');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'All devops-jobs sources failed' });
  });

  it('returns 409 while another devops-jobs run is active', async () => {
    let release!: () => void;
    const promise = new Promise<typeof success>((resolve) => {
      release = () => resolve(success);
    });
    mocks.jobsRun.mockReturnValue(promise);
    const app = await createTestApp();
    const first = request(app).post('/telegram/send-devops-jobs').then((value) => value);
    try {
      await vi.waitFor(() => expect(mocks.jobsRun).toHaveBeenCalledOnce());
      const second = await request(app).post('/telegram/send-devops-jobs');
      expect(second.status).toBe(409);
      expect(second.body).toEqual({ error: 'DevOps jobs digest is already running' });
    } finally {
      release();
    }
    await first;
  });
});
