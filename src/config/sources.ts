/**
 * Danh mục mọi nguồn tin mà SourceService có thể crawl.
 *
 * Mỗi phần tử dùng `kind` để SourceService dispatch tới đúng crawler.
 * Được đọc bởi `news.controller.ts`, `source.service.ts` và
 * `tests/config/sources.test.ts`.
 */
import { env } from './env';
import type { SourceConfig } from '../types/source';
import type { TopicKey } from '../types/topic';

/**
 * Tạo cấu hình RSS Reddit nhất quán từ subreddit và topic mặc định.
 *
 * Được sử dụng nội bộ bên dưới để tạo tám nguồn Reddit; không export.
 */
const redditRssSource = (subreddit: string, slug: string, defaultTopics: TopicKey[]): SourceConfig => ({
  // Slug ổn định tạo ID dùng cho dedupe/affinity.
  id: `reddit-${slug}`,
  // Tên hiển thị giữ nguyên subreddit gốc.
  name: `Reddit r/${subreddit}`,
  // Reddit được đọc qua feed RSS public.
  kind: 'rss',
  enabled: true,
  // Homepage phục vụ metadata; feedUrl là endpoint crawler thực sự gọi.
  homepageUrl: `https://www.reddit.com/r/${subreddit}`,
  feedUrl: `https://www.reddit.com/r/${subreddit}/.rss?limit=10`,
  // Topic mặc định bù cho tiêu đề thảo luận không chứa đủ keyword.
  defaultTopics,
});

// Danh sách theo thứ tự thu thập; mỗi object mô tả endpoint và cách parse.
export const sources: SourceConfig[] = [
  // Hacker News front page qua RSS.
  {
    id: 'hn-rss',
    name: 'Hacker News',
    kind: 'rss',
    enabled: true,
    homepageUrl: 'https://news.ycombinator.com',
    feedUrl: 'https://hnrss.org/frontpage',
  },
  // Blog Kubernetes chính thức qua RSS.
  {
    id: 'kubernetes-blog',
    name: 'Kubernetes Blog',
    kind: 'rss',
    enabled: true,
    homepageUrl: 'https://kubernetes.io/blog/',
    feedUrl: 'https://kubernetes.io/feed.xml',
  },
  // X Search chỉ bật khi có bearer token thật.
  {
    id: 'x-search',
    name: 'X Search',
    kind: 'x-search',
    enabled: Boolean(env.X_BEARER_TOKEN),
    homepageUrl: 'https://x.com',
    bearerToken: env.X_BEARER_TOKEN,
    query: env.X_SEARCH_QUERY,
    maxResults: env.X_SEARCH_MAX_RESULTS,
  },
  // GitHub Search lấy repository AI mới/cập nhật.
  {
    id: 'github-ai-repos',
    name: 'GitHub AI Repos',
    kind: 'github-repos',
    enabled: true,
    homepageUrl: 'https://github.com',
    token: env.GITHUB_TOKEN,
    query: env.GITHUB_AI_REPO_QUERY,
    maxResults: env.GITHUB_AI_REPO_MAX_RESULTS,
    lookbackDays: env.GITHUB_AI_REPO_LOOKBACK_DAYS,
  },
  // Các community RSS được factory gắn topic chuyên ngành mặc định.
  redditRssSource('MachineLearning', 'machine-learning', ['ai']),
  redditRssSource('LocalLLaMA', 'local-llama', ['ai']),
  redditRssSource('OpenAI', 'openai', ['ai']),
  redditRssSource('artificial', 'artificial', ['ai']),
  redditRssSource('kubernetes', 'kubernetes', ['k8s']),
  redditRssSource('devops', 'devops', ['devops']),
  redditRssSource('cybersecurity', 'cybersecurity', ['security']),
  redditRssSource('aws', 'aws', ['cloud']),
  // Các blog security/cloud/devops chính thức hoặc chuyên ngành qua RSS.
  {
    id: 'google-security-blog',
    name: 'Google Security Blog',
    kind: 'rss',
    enabled: true,
    homepageUrl: 'https://security.googleblog.com',
    feedUrl: 'https://security.googleblog.com/feeds/posts/default',
  },
  {
    id: 'aws-news-blog',
    name: 'AWS News Blog',
    kind: 'rss',
    enabled: true,
    homepageUrl: 'https://aws.amazon.com/blogs/aws/',
    feedUrl: 'https://aws.amazon.com/blogs/aws/feed/',
  },
  {
    id: 'cncf-blog',
    name: 'CNCF Blog',
    kind: 'rss',
    enabled: true,
    homepageUrl: 'https://www.cncf.io/blog/',
    feedUrl: 'https://www.cncf.io/feed/',
  },
  {
    id: 'devops-dot-com',
    name: 'DevOps.com',
    kind: 'rss',
    enabled: true,
    homepageUrl: 'https://devops.com',
    feedUrl: 'https://devops.com/feed/',
  },
  // The Hacker News không có RSS phù hợp nên dùng CSS selectors để scrape HTML.
  {
    id: 'the-hacker-news-html',
    name: 'The Hacker News',
    kind: 'html',
    enabled: true,
    homepageUrl: 'https://thehackernews.com',
    listUrl: 'https://thehackernews.com',
    selectors: {
      // `item` khoanh mỗi card; các selector còn lại đọc field trong card đó.
      item: '.body-post',
      title: '.home-title',
      url: 'a.story-link',
      summary: '.home-desc',
      publishedAt: '.h-datetime',
      image: 'img',
    },
  },
];
