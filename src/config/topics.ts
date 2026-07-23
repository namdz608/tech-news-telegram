/**
 * Từ điển topic trung tâm cho matching, scoring và render digest.
 *
 * Được `article.service.ts` dùng để gán topic và `digest.service.ts`
 * dùng để xếp/hiển thị; tests của hai service gọi gián tiếp.
 */
import type { TopicDefinition } from '../types/topic';

// Thứ tự mảng cũng là thứ tự các section trong digest.
export const topics: TopicDefinition[] = [
  // Nhóm AI bao gồm tên lĩnh vực, mô hình và provider phổ biến.
  {
    key: 'ai',
    label: 'AI',
    keywords: ['ai', 'artificial intelligence', 'machine learning', 'llm', 'openai', 'anthropic', 'gemini'],
  },
  // Nhóm Kubernetes/container orchestration.
  {
    key: 'k8s',
    label: 'Kubernetes',
    keywords: ['kubernetes', 'k8s', 'kubectl', 'helm', 'container orchestration'],
  },
  // Nhóm an toàn thông tin và lỗ hổng.
  {
    key: 'security',
    label: 'Security',
    keywords: ['security', 'vulnerability', 'cve', 'exploit', 'ransomware', 'zero-day', 'malware'],
  },
  // Nhóm vận hành, CI/CD và reliability.
  {
    key: 'devops',
    label: 'DevOps',
    keywords: ['devops', 'ci/cd', 'github actions', 'jenkins', 'observability', 'sre'],
  },
  // Nhóm cloud provider và infrastructure as code.
  {
    key: 'cloud',
    label: 'Cloud',
    keywords: ['aws', 'azure', 'gcp', 'cloud', 'serverless', 'terraform'],
  },
];
