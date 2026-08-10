import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runMock } = vi.hoisted(() => ({ runMock: vi.fn() }));

vi.mock('../../src/services/gadget-flow.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/gadget-flow.service')>();
  return {
    ...actual,
    createGadgetFlowService: () => ({ run: runMock }),
  };
});

import request from 'supertest';
import { createApp } from '../../src/app';
import {
  AllGadgetSourcesFailedError,
  isAllGadgetSourcesFailedError,
} from '../../src/services/gadget-flow.service';

const success = {
  sent: true, collectedCount: 2, eligibleCount: 1, skippedSeenCount: 0,
  messageCount: 1, language: 'vi', channel: 'telegram-gadgets',
};

describe('POST /telegram/send-gadgets', () => {
  beforeEach(() => runMock.mockReset());

  it('returns the gadget flow response', async () => {
    runMock.mockResolvedValue(success);
    const response = await request(createApp()).post('/telegram/send-gadgets');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(success);
  });

  it('returns 503 when every gadget source fails', async () => {
    const error = new AllGadgetSourcesFailedError();
    expect(isAllGadgetSourcesFailedError(error)).toBe(true);
    runMock.mockImplementationOnce(async () => { throw error; });
    const response = await request(createApp()).post('/telegram/send-gadgets');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'All gadget sources failed' });
  });

  it('returns 409 while another gadget run is active', async () => {
    let release!: () => void;
    runMock.mockReturnValue(new Promise((resolve) => { release = () => resolve(success); }));
    const first = request(createApp()).post('/telegram/send-gadgets').then((response) => response);
    await vi.waitFor(() => expect(runMock).toHaveBeenCalledOnce());
    const second = await request(createApp()).post('/telegram/send-gadgets');
    expect(second.status).toBe(409);
    release();
    await first;
  });
});
