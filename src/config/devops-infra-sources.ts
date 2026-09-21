import type { DevopsInfraSearchQuery } from '../types/devops-infra';

export const DEVOPS_INFRA_SUBREDDITS = [
  'devops',
  'sysadmin',
  'kubernetes',
  'aws',
  'azure',
  'googlecloud',
  'selfhosted',
  'homelab',
  'linuxadmin',
  'networking',
  'sre',
  'terraform',
  'ansible',
  'docker',
  'gitlab',
  'prometheus',
  'proxmox',
] as const;

export const devopsInfraRedditQueries: DevopsInfraSearchQuery[] = [
  {
    key: 'k8s-crashloop-oom',
    text: 'kubernetes CrashLoopBackOff OOMKilled pod restart fix',
  },
  {
    key: 'terraform-state-lock',
    text: 'terraform state lock error dynamodb apply stuck',
  },
  {
    key: 'nginx-502',
    text: 'nginx 502 bad gateway upstream timeout reverse proxy',
  },
  {
    key: 'wireguard-onprem',
    text: 'wireguard VPN on-prem self-hosted tunnel routing',
  },
  {
    key: 'iam-access-denied',
    text: 'AWS IAM AccessDenied policy role permission denied',
  },
  {
    key: 'kubernetes-loi-vi',
    text: 'kubernetes lỗi pod không chạy CrashLoopBackOff giải pháp',
  },
];

export const DEVOPS_INFRA_STACKEXCHANGE_SITES: {
  site: 'serverfault' | 'unix' | 'devops' | 'stackoverflow';
  tags?: string[];
}[] = [
  { site: 'serverfault' },
  { site: 'unix' },
  { site: 'devops' },
  {
    site: 'stackoverflow',
    tags: [
      'kubernetes',
      'docker',
      'terraform',
      'amazon-web-services',
      'azure',
      'google-cloud-platform',
      'linux',
      'nginx',
      'ansible',
      'prometheus',
      'gitlab-ci',
      'networking',
    ],
  },
];

export const devopsInfraHnQueries: DevopsInfraSearchQuery[] = [
  {
    key: 'k8s-pod-failures',
    text: 'kubernetes CrashLoopBackOff OOMKilled ImagePullBackOff',
  },
  {
    key: 'terraform-apply-failed',
    text: 'terraform state lock apply failed backend',
  },
  {
    key: 'cloud-outage-postmortem',
    text: 'AWS GCP Azure outage postmortem status page incident',
  },
  {
    key: 'onprem-homelab',
    text: 'on-prem VPN Proxmox bare-metal Kubernetes homelab',
  },
  {
    key: 'nginx-dns-cert-iam',
    text: 'nginx 502 DNS cert expiry IAM AccessDenied troubleshooting',
  },
];

const devopsInfraWebSearchQueries: DevopsInfraSearchQuery[] = [
  {
    key: 'k8s-troubleshooting',
    text: 'kubernetes CrashLoopBackOff OOMKilled troubleshooting solution',
  },
  {
    key: 'terraform-troubleshooting',
    text: 'terraform state lock apply failed infrastructure fix',
  },
  {
    key: 'cloud-incident',
    text: 'AWS GCP Azure outage postmortem infrastructure incident',
  },
  {
    key: 'nginx-networking',
    text: 'nginx 502 DNS certificate expiry networking fix',
  },
  {
    key: 'onprem-infra',
    text: 'Proxmox bare metal self-hosted wireguard VPN troubleshooting',
  },
  {
    key: 'facebook-infra-groups',
    text: 'kubernetes terraform devops troubleshooting site:facebook.com',
    discoveryHint: 'facebook',
  },
  {
    key: 'telegram-infra-channels',
    text: 'kubernetes sự cố hạ tầng devops giải pháp site:t.me',
    discoveryHint: 'telegram',
  },
  {
    key: 'discord-infra-servers',
    text: 'kubernetes terraform nginx devops help site:discord.com',
    discoveryHint: 'discord',
  },
];

export function buildDevopsInfraWebSearchQueries(max: number): DevopsInfraSearchQuery[] {
  return devopsInfraWebSearchQueries.slice(0, Math.max(0, max));
}

export const DEVOPS_INFRA_X_QUERY =
  '(kubernetes OR terraform OR nginx OR "state lock" OR CrashLoopBackOff OR OOMKilled OR "AccessDenied" OR sự cố hạ tầng OR "kubernetes lỗi") (devops OR infra OR sysadmin) lang:en OR lang:vi -is:retweet';
