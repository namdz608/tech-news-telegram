import type { TopicDefinition } from '../types/topic';

export const topics: TopicDefinition[] = [
  {
    key: 'ai',
    label: 'AI',
    keywords: ['ai', 'artificial intelligence', 'machine learning', 'llm', 'openai', 'anthropic', 'gemini'],
  },
  {
    key: 'k8s',
    label: 'Kubernetes',
    keywords: ['kubernetes', 'k8s', 'kubectl', 'helm', 'container orchestration'],
  },
  {
    key: 'security',
    label: 'Security',
    keywords: ['security', 'vulnerability', 'cve', 'exploit', 'ransomware', 'zero-day', 'malware'],
  },
  {
    key: 'devops',
    label: 'DevOps',
    keywords: ['devops', 'ci/cd', 'github actions', 'jenkins', 'observability', 'sre'],
  },
  {
    key: 'cloud',
    label: 'Cloud',
    keywords: ['aws', 'azure', 'gcp', 'cloud', 'serverless', 'terraform'],
  },
];
