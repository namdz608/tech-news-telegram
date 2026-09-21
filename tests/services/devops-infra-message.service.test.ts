import { describe, expect, it, vi } from 'vitest';
import { DevopsInfraMessageService } from '../../src/services/devops-infra-message.service';
import type { DevopsInfraCandidate } from '../../src/types/devops-infra';

function candidate(
  overrides: Partial<DevopsInfraCandidate> = {},
): DevopsInfraCandidate {
  return {
    item: {
      id: 'thread-1',
      sourceId: 'thread-1',
      sourceName: 'Stack Exchange',
      title: 'Pod <script> CrashLoopBackOff',
      url: 'https://example.com/thread-1',
      summary: '',
      body: 'The pod restarts continuously.',
      imageUrl: 'https://cdn.example.com/pod.png',
      publishedAt: '2026-09-21T03:00:00.000Z',
      collectedAt: '2026-09-21T03:01:00.000Z',
      discoveredAt: '2026-09-21T03:01:00.000Z',
      discoveryChannel: 'stackexchange',
      communityKey: 'stackoverflow',
      sourceQuotaKey: 'stackoverflow',
      sourceTextStatus: 'full',
      answers: [{ body: 'Run kubectl logs pod/api.', accepted: true }],
    },
    kind: 'problem-solution',
    category: 'k8s-containers',
    environment: 'cloud',
    problem: 'The pod enters CrashLoopBackOff.',
    rootCause: 'The application exits during startup.',
    solutionSteps: ['Run kubectl logs pod/api.', 'Inspect the startup error.'],
    solutionConfidence: 'accepted',
    fingerprint: 'thread-1',
    score: 10,
    scoreReasons: [],
    ...overrides,
  };
}

const editorial = {
  title: 'Pod <script> gặp CrashLoopBackOff',
  problem: 'Pod liên tục khởi động lại.',
  rootCause: 'Ứng dụng thoát khi khởi động.',
  solutionSteps: ['Chạy kubectl logs pod/api.', 'Kiểm tra lỗi khởi động.'],
  caution: 'Một thread diễn đàn không phải runbook chính thức.',
};

describe('DevopsInfraMessageService', () => {
  it('renders problem-solution blocks in order with escaped HTML and Vietnamese time', async () => {
    const editor = { edit: vi.fn().mockResolvedValue(editorial) };
    const [message] = await new DevopsInfraMessageService(editor).buildMessages([candidate()]);

    expect(editor.edit).toHaveBeenCalledWith(expect.objectContaining({ fingerprint: 'thread-1' }));
    expect(message).toMatchObject({
      url: 'https://example.com/thread-1',
      imageUrl: 'https://cdn.example.com/pod.png',
    });
    expect(message.text).toBe([
      'Kubernetes/Container · Cloud',
      'Bài toán',
      '<b>Pod &lt;script&gt; gặp CrashLoopBackOff</b>',
      'Thời gian: 10:00 21/09/2026',
      '',
      'Bài toán:',
      'Pod liên tục khởi động lại.',
      '',
      'Nguyên nhân:',
      'Ứng dụng thoát khi khởi động.',
      '',
      'Cách xử lý:',
      '1. Chạy kubectl logs pod/api.',
      '2. Kiểm tra lỗi khởi động.',
      '',
      'Độ tin cậy lời giải:',
      'Câu trả lời được chấp nhận',
      '',
      'Lưu ý:',
      'Một thread diễn đàn không phải runbook chính thức.',
      '',
      'Nguồn: Stack Exchange',
      'Tham khảo từ diễn đàn, kiểm tra trên môi trường của bạn trước khi áp dụng.',
    ].join('\n'));
    expect(message.text).not.toContain('Xem thread gốc');
  });

  it('omits root cause and environment when absent or unknown', async () => {
    const editor = {
      edit: vi.fn().mockResolvedValue({ ...editorial, rootCause: undefined }),
    };
    const [message] = await new DevopsInfraMessageService(editor).buildMessages([
      candidate({ environment: 'unknown', rootCause: undefined }),
    ]);

    expect(message.text).toContain('Kubernetes/Container\nBài toán');
    expect(message.text).not.toContain('Nguyên nhân:');
  });

  it('renders an unverified incident without fake numbered runbook or confidence', async () => {
    const editor = {
      edit: vi.fn().mockResolvedValue({
        ...editorial,
        rootCause: undefined,
        solutionSteps: ['Vendor đang điều tra.', 'Diễn đàn ghi nhận dịch vụ phục hồi.'],
      }),
    };
    const [message] = await new DevopsInfraMessageService(editor).buildMessages([
      candidate({
        kind: 'incident',
        category: 'cloud-aws',
        verification: 'unverified',
        rootCause: undefined,
        solutionConfidence: 'none',
      }),
    ]);

    expect(message.text).toContain('AWS · Cloud\nSự cố\n🔴 CHƯA KIỂM CHỨNG');
    expect(message.text).not.toContain('Bài toán\n');
    expect(message.text.indexOf('🔴 CHƯA KIỂM CHỨNG'))
      .toBeLessThan(message.text.indexOf('<b>Pod &lt;script&gt;'));
    expect(message.text).toContain(
      'Cách xử lý:\nVendor đang điều tra.\nDiễn đàn ghi nhận dịch vụ phục hồi.',
    );
    expect(message.text).not.toContain('1. Vendor');
    expect(message.text).not.toContain('Độ tin cậy lời giải:');
  });

  it('adds destructive caution inside the caution block', async () => {
    const destructive = candidate({
      solutionSteps: ['Run kubectl delete pod api.'],
      item: {
        ...candidate().item,
        body: 'The workaround is kubectl delete pod api.',
      },
    });
    const editor = { edit: vi.fn().mockResolvedValue(editorial) };
    const [message] = await new DevopsInfraMessageService(editor).buildMessages([destructive]);

    expect(message.text).toContain(
      'Lưu ý:\nMột thread diễn đàn không phải runbook chính thức. '
      + 'Lệnh trong thread có thể phá hủy dữ liệu; kiểm tra trên môi trường của bạn.',
    );
  });

  it.each([
    'http://127.0.0.1/a.png',
    'https://10.0.0.1/a.png',
    'https://172.16.2.3/a.png',
    'https://192.168.1.2/a.png',
    'https://localhost/a.png',
    'https://user:secret@example.com/a.png',
    'ftp://cdn.example.com/a.png',
    'not-a-url',
  ])('omits unsafe image URL %s', async (imageUrl) => {
    const editor = { edit: vi.fn().mockResolvedValue(editorial) };
    const [message] = await new DevopsInfraMessageService(editor).buildMessages([
      candidate({ item: { ...candidate().item, imageUrl } }),
    ]);

    expect(message.imageUrl).toBeUndefined();
  });
});
