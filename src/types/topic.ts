export type TopicKey = 'ai' | 'k8s' | 'security' | 'devops' | 'cloud';

export interface TopicDefinition {
  key: TopicKey;
  label: string;
  keywords: string[];
}
