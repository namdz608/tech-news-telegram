import type { DevopsInfraCategory } from '../types/devops-infra';

export const devopsInfraFallbackImageUrls: Record<DevopsInfraCategory, string> = {
  'k8s-containers': 'https://placehold.co/1200x630/075985/ffffff.png?text=Kubernetes',
  'cloud-aws': 'https://placehold.co/1200x630/b45309/ffffff.png?text=AWS',
  'cloud-gcp': 'https://placehold.co/1200x630/1d4ed8/ffffff.png?text=GCP',
  'cloud-azure': 'https://placehold.co/1200x630/0369a1/ffffff.png?text=Azure',
  'onprem-selfhosted': 'https://placehold.co/1200x630/3f3f46/ffffff.png?text=On-prem',
  networking: 'https://placehold.co/1200x630/166534/ffffff.png?text=Networking',
  'observability-sre': 'https://placehold.co/1200x630/7e22ce/ffffff.png?text=SRE',
  cicd: 'https://placehold.co/1200x630/9a3412/ffffff.png?text=CI%2FCD',
  'db-storage': 'https://placehold.co/1200x630/0f766e/ffffff.png?text=Storage',
  'iam-secrets': 'https://placehold.co/1200x630/991b1b/ffffff.png?text=IAM',
};
