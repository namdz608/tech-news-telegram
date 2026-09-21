import type {
  DevopsEnvironment,
  DevopsInfraCandidate,
  DevopsInfraCategory,
  DevopsInfraMessage,
  SolutionConfidence,
} from '../types/devops-infra';
import { compactText, escapeHtml } from '../utils/text';
import { DevopsInfraEditorialService } from './devops-infra-editorial.service';
import type { DevopsInfraEditorial } from './devops-infra-editorial.types';

interface DevopsInfraEditorialEditor {
  edit(candidate: DevopsInfraCandidate): Promise<DevopsInfraEditorial>;
}

const CATEGORY_LABELS: Record<DevopsInfraCategory, string> = {
  'k8s-containers': 'Kubernetes/Container',
  'cloud-aws': 'AWS',
  'cloud-gcp': 'GCP',
  'cloud-azure': 'Azure',
  'onprem-selfhosted': 'On-prem/Self-hosted',
  networking: 'Mạng/DNS/LB',
  'observability-sre': 'Observability/SRE',
  cicd: 'CI/CD',
  'db-storage': 'DB/Storage',
  'iam-secrets': 'IAM/Secrets',
};

const ENVIRONMENT_LABELS: Record<Exclude<DevopsEnvironment, 'unknown'>, string> = {
  cloud: 'Cloud',
  onprem: 'On-prem',
  hybrid: 'Hybrid',
};

const CONFIDENCE_LABELS: Record<Exclude<SolutionConfidence, 'none'>, string> = {
  accepted: 'Câu trả lời được chấp nhận',
  'highly-voted': 'Câu trả lời điểm cao',
  'author-confirmed': 'Tác giả xác nhận',
  anecdotal: 'Chỉ là trải nghiệm',
};

const DISCLAIMER =
  'Tham khảo từ diễn đàn, kiểm tra trên môi trường của bạn trước khi áp dụng.';
const DESTRUCTIVE_CAUTION =
  'Lệnh trong thread có thể phá hủy dữ liệu; kiểm tra trên môi trường của bạn.';
const DESTRUCTIVE_COMMAND =
  /rm\s+-rf|mkfs|drop\s+database|disable.*auth|kubectl\s+delete/iu;

export class DevopsInfraMessageService {
  constructor(
    private readonly editorial: DevopsInfraEditorialEditor =
      new DevopsInfraEditorialService(),
    private readonly timeZone = 'Asia/Ho_Chi_Minh',
  ) {}

  async buildMessages(
    candidates: readonly DevopsInfraCandidate[],
  ): Promise<DevopsInfraMessage[]> {
    return Promise.all(candidates.map(async (candidate) => {
      const editorial = await this.editorial.edit(candidate);
      const message: DevopsInfraMessage = {
        text: this.render(candidate, editorial),
        url: candidate.item.url,
      };
      const imageUrl = publicImageUrl(candidate.item.imageUrl);
      if (imageUrl) message.imageUrl = imageUrl;
      return message;
    }));
  }

  private render(
    candidate: DevopsInfraCandidate,
    editorial: DevopsInfraEditorial,
  ): string {
    const category = CATEGORY_LABELS[candidate.category];
    const environment = candidate.environment === 'unknown'
      ? ''
      : ` · ${ENVIRONMENT_LABELS[candidate.environment]}`;
    const caution = destructiveCorpus(candidate) && !editorial.caution.includes(DESTRUCTIVE_CAUTION)
      ? `${editorial.caution} ${DESTRUCTIVE_CAUTION}`
      : editorial.caution;
    const solution = candidate.kind === 'incident'
      ? editorial.solutionSteps.map(safeText)
      : editorial.solutionSteps.map((step, index) => `${index + 1}. ${safeText(step)}`);
    const lines = [
      `${category}${environment}`,
      candidate.kind === 'incident' ? 'Sự cố' : 'Bài toán',
      ...(candidate.kind === 'incident' && candidate.verification === 'unverified'
        ? ['🔴 CHƯA KIỂM CHỨNG']
        : []),
      `<b>${safeText(editorial.title)}</b>`,
      `Thời gian: ${this.formatDateTime(candidate.item.publishedAt)}`,
      '',
      'Bài toán:',
      safeText(editorial.problem),
      '',
      ...(editorial.rootCause
        ? ['Nguyên nhân:', safeText(editorial.rootCause), '']
        : []),
      'Cách xử lý:',
      ...solution,
      '',
      ...(candidate.solutionConfidence === 'none'
        ? []
        : [
            'Độ tin cậy lời giải:',
            CONFIDENCE_LABELS[candidate.solutionConfidence],
            '',
          ]),
      'Lưu ý:',
      safeText(caution),
      '',
      `Nguồn: ${safeText(candidate.item.sourceName)}`,
      DISCLAIMER,
    ];
    return collapseBlankLines(lines).join('\n').trim();
  }

  private formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Không rõ';
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((entry) => entry.type === type)?.value ?? '';
    return `${part('hour')}:${part('minute')} ${part('day')}/${part('month')}/${part('year')}`;
  }
}

function safeText(value: string): string {
  return escapeHtml(compactText(value));
}

function destructiveCorpus(candidate: DevopsInfraCandidate): boolean {
  return DESTRUCTIVE_COMMAND.test([
    candidate.item.title,
    candidate.item.body,
    ...candidate.item.answers.map((answer) => answer.body),
    candidate.problem,
    ...candidate.solutionSteps,
  ].join('\n'));
}

function collapseBlankLines(lines: readonly string[]): string[] {
  return lines.filter((line, index) =>
    line !== '' || (index > 0 && lines[index - 1] !== ''));
}

function publicImageUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:')
      || url.username !== ''
      || url.password !== ''
    ) {
      return undefined;
    }
    const hostname = url.hostname.toLowerCase().replace(/\.$/u, '');
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || isPrivateIpv4(hostname)) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/u.test(part))) {
    return false;
  }
  const octets = parts.map(Number);
  if (octets.some((part) => part > 255)) return false;
  const [first, second] = octets;
  return first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}
