import { describe, expect, it } from 'vitest';
import { devopsInfraFailureParts } from '../../src/utils/devops-infra-http-error';

describe('devopsInfraFailureParts', () => {
  it('prefers an HTTP status over a DNS code', () => {
    expect(
      devopsInfraFailureParts(
        Object.assign(new Error('429'), {
          code: 'ERR_BAD_REQUEST',
          response: { status: 429 },
        }),
      ),
    ).toEqual({ statusOrCode: 429, name: 'Error' });
  });

  it('surfaces a DNS/network code when there is no HTTP status', () => {
    expect(
      devopsInfraFailureParts(Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' })),
    ).toEqual({ statusOrCode: 'ENOTFOUND', name: 'Error' });
  });

  it('falls back to unknown when neither status nor code exists', () => {
    expect(devopsInfraFailureParts(new Error('comments unavailable'))).toEqual({
      statusOrCode: 'unknown',
      name: 'Error',
    });
  });
});
