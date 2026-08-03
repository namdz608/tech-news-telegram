import { describe, expect, it } from 'vitest';
import { buildJobDigestMessages, renderJobMessage } from '../../src/services/job-message.service';

describe('job message service', () => {
  it('renders the four job sections', () => {
    const text = renderJobMessage(
      {
        id: 'https://example.com/job',
        sourceId: 'vietnamworks',
        sourceName: 'VietnamWorks',
        title: 'Giáo viên tiếng Anh',
        url: 'https://example.com/job',
        collectedAt: '2026-08-03T00:00:00.000Z',
        author: 'Sunshine School',
        topics: ['jobs-english'],
        jobDetails: {
          description: 'Dạy IELTS cho học sinh tiểu học',
          skills: ['IELTS', 'Classroom management'],
          salary: '15-25 triệu',
          location: 'Hà Nội',
        },
      },
      'jobs-english',
    );

    expect(text).toContain('Mô tả công việc');
    expect(text).toContain('Dạy IELTS cho học sinh tiểu học');
    expect(text).toContain('Kỹ năng cần có');
    expect(text).toContain('IELTS');
    expect(text).toContain('Classroom management');
    expect(text).toMatch(/-\s*IELTS/);
    expect(text).toMatch(/-\s*Classroom management/);
    expect(text).not.toContain('IELTS, Classroom management');
    expect(text).toContain('Mức lương');
    expect(text).toContain('15-25 triệu');
    expect(text).toContain('Địa điểm');
    expect(text).toContain('Hà Nội');
    expect(text).not.toContain('Vì sao đáng chú ý');
    expect(text).not.toContain('Tóm tắt');
  });

  it('builds digest messages for all articles without topic balancing', () => {
    const messages = buildJobDigestMessages([
      {
        id: '1',
        sourceId: 'vietnamworks',
        sourceName: 'VietnamWorks',
        title: 'Job 1',
        url: 'https://example.com/1',
        collectedAt: '2026-08-03T00:00:00.000Z',
        topics: ['devops'],
        jobDetails: { description: 'A', skills: ['Docker'], salary: 'Thương lượng', location: 'Hà Nội' },
      },
      {
        id: '2',
        sourceId: 'itviec',
        sourceName: 'ITviec',
        title: 'Job 2',
        url: 'https://example.com/2',
        collectedAt: '2026-08-03T00:00:00.000Z',
        topics: ['devops'],
        jobDetails: { description: 'B', skills: [], salary: '20tr', location: 'Hà Nội' },
      },
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[0].text).toContain('Mô tả công việc');
    expect(messages[1].imageUrl).toContain('placehold.co');
  });
});
