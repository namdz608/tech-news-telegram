import { beforeEach, describe, expect, it, vi } from 'vitest';

const { gadgetRunMock, runMock } = vi.hoisted(() => ({
  gadgetRunMock: vi.fn(),
  runMock: vi.fn(),
}));

vi.mock('../../src/services/health-flow.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/health-flow.service')>();
  return {
    ...actual,
    createHealthFlowService: () => ({ run: runMock }),
  };
});

vi.mock('../../src/services/gadget-flow.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/gadget-flow.service')>();
  return {
    ...actual,
    createGadgetFlowService: () => ({ run: gadgetRunMock }),
  };
});

import request from 'supertest';
import { createApp } from '../../src/app';
import {
  AllHealthSourcesFailedError,
  isAllHealthSourcesFailedError,
} from '../../src/services/health-flow.service';

const success = {
  sent: true, collectedCount: 2, eligibleCount: 1, skippedSeenCount: 0,
  messageCount: 1, language: 'vi', channel: 'telegram-health',
};

describe('POST /telegram/send-health', () => {
  beforeEach(() => {
    gadgetRunMock.mockReset();
    runMock.mockReset();
  });

  it('returns the health flow response', async () => {
    runMock.mockResolvedValue(success);
    const response = await request(createApp()).post('/telegram/send-health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(success);
  });

  it('returns 503 when every health source fails', async () => {
    const error = new AllHealthSourcesFailedError();
    expect(isAllHealthSourcesFailedError(error)).toBe(true);
    runMock.mockImplementationOnce(async () => { throw error; });
    const response = await request(createApp()).post('/telegram/send-health');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'All health sources failed' });
  });

  it('returns 409 while another health run is active', async () => {
    let release!: () => void;
    runMock.mockReturnValue(new Promise((resolve) => { release = () => resolve(success); }));
    const first = request(createApp()).post('/telegram/send-health').then((response) => response);
    await vi.waitFor(() => expect(runMock).toHaveBeenCalledOnce());
    const second = await request(createApp()).post('/telegram/send-health');
    expect(second.status).toBe(409);
    release();
    await first;
  });

  it('does not block the gadget flow while a health run is active', async () => {
    let release!: () => void;
    runMock.mockReturnValue(new Promise((resolve) => { release = () => resolve(success); }));
    gadgetRunMock.mockResolvedValue({
      ...success,
      channel: 'telegram-gadgets',
    });
    const healthRequest = request(createApp())
      .post('/telegram/send-health')
      .then((response) => response);
    await vi.waitFor(() => expect(runMock).toHaveBeenCalledOnce());

    const gadgetResponse = await request(createApp()).post('/telegram/send-gadgets');

    expect(gadgetResponse.status).toBe(200);
    expect(gadgetRunMock).toHaveBeenCalledOnce();
    release();
    await healthRequest;
  });
});
