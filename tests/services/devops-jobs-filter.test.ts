import { describe, expect, it } from 'vitest';
import { isEligibleDevopsJob } from '../../src/services/devops-jobs-filter';
import type { DevopsJob } from '../../src/types/devops-jobs';

function job(overrides: Partial<DevopsJob> = {}): DevopsJob {
  return {
    id: '1',
    sourceId: 'remoteok',
    sourceName: 'Remote OK',
    title: 'DevOps Engineer',
    company: 'Acme',
    url: 'https://example.com/jobs/1',
    location: '',
    description: 'Keep clusters healthy',
    tags: [],
    publishedAt: '2026-10-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('devops job filter', () => {
  it.each([
    'Acme | SRE | REMOTE (US)',
    'Hiring US residents only.',
    'US-based candidates only.',
    'US based residents only.',
    '<b>REMOTE</b>&nbsp;(US)',
    'Hiring US&nbsp;residents only.',
    'Remote (UK only)',
    'Remote: EU',
    'Remote within Canada',
    'Only US-based candidates are eligible.',
  ])('rejects geographic restrictions in descriptions: %s', (description) => {
    expect(isEligibleDevopsJob(job({
      sourceId: 'hn',
      description: `Remote work.\n${description}`,
    }))).toBe(false);
  });

  it('keeps a worldwide role mentioning US customers and cloud regions', () => {
    expect(isEligibleDevopsJob(job({
      sourceId: 'hn',
      description: 'Remote worldwide. Support US customers using us-east-1.',
    }))).toBe(true);
  });
  it.each([
    ['title devops', { title: 'DevOps Engineer' }],
    ['sre', { title: 'Staff SRE' }],
    ['site reliability', { title: 'Site Reliability Engineer' }],
    ['platform', { title: 'Platform Engineer' }],
    ['infrastructure', { description: 'Infrastructure for CI' }],
    ['kubernetes', { tags: ['Kubernetes'] }],
    ['k8s', { title: 'K8s operator' }],
    ['cloud engineer', { title: 'Cloud Engineer' }],
  ])('keeps %s', (_label, overrides) => {
    expect(isEligibleDevopsJob(job(overrides))).toBe(true);
  });

  it('drops a title with no approved keyword', () => {
    expect(isEligibleDevopsJob(job({ title: 'Accountant', description: 'Ledgers' }))).toBe(false);
  });

  it.each([
    'US only',
    'EU only',
    'UK only',
    'must be located in Texas',
    'must be based in London',
  ])('drops restriction %s', (phrase) => {
    expect(isEligibleDevopsJob(job({ description: phrase }))).toBe(false);
  });

  it.each(['Worldwide', 'Anywhere', 'Global', ''])(
    'keeps remote-only location %j',
    (location) => {
      expect(isEligibleDevopsJob(job({ location }))).toBe(true);
    },
  );

  it('keeps a worldwide job whose description mentions us-east-1', () => {
    expect(isEligibleDevopsJob(job({
      location: 'Worldwide',
      description: 'DevOps role. Deploy to us-east-1.',
    }))).toBe(true);
  });

  it('drops a remote-only job located in the United States', () => {
    expect(isEligibleDevopsJob(job({ location: 'United States' }))).toBe(false);
  });

  it('drops LinkedIn unless the post has a remote signal', () => {
    expect(isEligibleDevopsJob(job({
      sourceId: 'linkedin',
      location: 'Worldwide',
      description: 'Office collaboration',
    }))).toBe(false);
  });

  it('keeps a LinkedIn remote worldwide post', () => {
    expect(isEligibleDevopsJob(job({
      sourceId: 'linkedin',
      location: 'Worldwide',
      description: 'Remote DevOps',
    }))).toBe(true);
  });
});
