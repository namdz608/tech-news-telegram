import { describe, expect, it } from 'vitest';
import { DevopsJobsFlowError, assertDevopsJobsConfigured } from '../../src/services/devops-jobs-flow.service';

describe('assertDevopsJobsConfigured', () => {
  it.each(['', 'test-devops-jobs-token', 'replace_me'])('rejects token %j', (botToken) => {
    expect(() => assertDevopsJobsConfigured({
      botToken,
      chatId: '-100123',
    })).toThrow(DevopsJobsFlowError);
  });
});
