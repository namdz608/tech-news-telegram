import { describe, expect, it, vi } from 'vitest';
import {
  buildJobsPdf,
  buildRequirementsText,
  isPdfCompatibleImage,
  splitJobDescription,
  toDashBulletList,
  truncateText,
} from '../../src/services/jobs-pdf.service';
import type { Article } from '../../src/types/article';

/** 1x1 PNG trong suốt. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const sampleArticle: Article = {
  id: 'https://example.com/job',
  sourceId: 'topcv',
  sourceName: 'TopCV',
  title: 'DevOps Engineer (CMC Cloud)',
  url: 'https://example.com/job',
  collectedAt: '2026-08-03T00:00:00.000Z',
  author: 'CMC Telecom',
  topics: ['devops'],
  jobDetails: {
    description: [
      'Mô tả:',
      '- Vận hành hệ thống k8s và Helm',
      '- Vận hành CI/CD chain, Gitops',
      '',
      'Yêu cầu:',
      '- Có từ 1.5 – 5 năm kinh nghiệm DevOps / SRE',
      '- Thành thạo k8s, docker',
      '- Kiến thức network (OSI, TCP/IP)',
      '- Lập trình cơ bản Bash, Python',
    ].join('\n'),
    skills: ['Linux', 'Devops', 'K8s', 'SRE', 'IT Services and IT Consulting', 'DevOps Engineer'],
    salary: 'Thoả thuận',
    location: 'Hà Nội',
  },
};

describe('buildJobsPdf', () => {
  it('creates a PDF buffer with job content', async () => {
    const result = await buildJobsPdf([sampleArticle], {
      role: 'devops',
      experienceYears: '2-5',
      limit: 10,
      generatedAt: new Date('2026-08-03T08:30:00.000Z'),
    });

    expect(result.fileName).toMatch(/^vn-jobs-devops-20260803-\d{4}\.pdf$/);
    expect(result.buffer.subarray(0, 4).toString('utf8')).toBe('%PDF');
    expect(result.buffer.length).toBeGreaterThan(500);
  });

  it('embeds company logo when imageUrl is jpeg/png', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () =>
        TINY_PNG.buffer.slice(TINY_PNG.byteOffset, TINY_PNG.byteOffset + TINY_PNG.byteLength),
    }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const withLogo: Article = {
        ...sampleArticle,
        imageUrl: 'https://cdn.example.com/logo.png',
      };
      const result = await buildJobsPdf([withLogo], {
        role: 'devops',
        limit: 10,
        generatedAt: new Date('2026-08-03T08:30:00.000Z'),
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://cdn.example.com/logo.png',
        expect.objectContaining({ redirect: 'follow' }),
      );
      expect(result.buffer.subarray(0, 4).toString('utf8')).toBe('%PDF');
      expect(result.buffer.length).toBeGreaterThan(500);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('truncates long descriptions for compact layout', () => {
    expect(truncateText('a'.repeat(50), 20)).toHaveLength(20);
    expect(truncateText('a'.repeat(50), 20).endsWith('…')).toBe(true);
  });

  it('normalizes mixed bullets to dash lists', () => {
    expect(toDashBulletList('• Build\n· Ship\n- Run')).toBe('- Build\n- Ship\n- Run');
  });

  it('splits JD into duties vs requirements', () => {
    const split = splitJobDescription(sampleArticle.jobDetails!.description!);
    expect(split.duties).toContain('Vận hành hệ thống k8s');
    expect(split.duties).not.toContain('1.5 – 5 năm');
    expect(split.requirements).toContain('1.5 – 5 năm kinh nghiệm');
    expect(split.requirements).toContain('Thành thạo k8s, docker');
  });

  it('prefers JD requirements over generic skill tags', () => {
    const split = splitJobDescription(sampleArticle.jobDetails!.description!);
    const text = buildRequirementsText(split.requirements, sampleArticle.jobDetails!.skills);
    expect(text).toContain('1.5 – 5 năm kinh nghiệm');
    expect(text).not.toContain('IT Services and IT Consulting');
  });

  it('filters industry/job-title tags when JD requirements missing', () => {
    const text = buildRequirementsText('', [
      'Linux',
      'Kubernetes',
      'IT Services and IT Consulting',
      'DevOps Engineer',
    ]);
    expect(text).toContain('- Linux');
    expect(text).toContain('- Kubernetes');
    expect(text).not.toContain('IT Services');
    expect(text).not.toContain('DevOps Engineer');
  });
});

describe('isPdfCompatibleImage', () => {
  it('accepts png and jpeg magic bytes', () => {
    expect(isPdfCompatibleImage(TINY_PNG)).toBe(true);
    expect(isPdfCompatibleImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBe(true);
    expect(isPdfCompatibleImage(Buffer.from('RIFF....WEBP'))).toBe(false);
  });
});
