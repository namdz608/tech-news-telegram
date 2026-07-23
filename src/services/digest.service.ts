/**
 * Chấm điểm, chọn bài cân bằng theo topic và render digest/message Telegram.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { env } from '../config/env';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { topicImageUrls } from '../config/topic-images';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { topics } from '../config/topics';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { Article } from '../types/article';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { TopicKey } from '../types/topic';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { compactText, escapeHtml, includesKeyword } from '../utils/text';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { createFallbackEditorial } from './article-editorial.service';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { ArticleEditorial } from './article-editorial.types';

/**
 * Interface `DigestMessage` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/services/digest-message-editorial.service.ts:2`
 * - `src/services/digest-message-editorial.service.ts:7`
 * - `src/services/digest-message-editorial.service.ts:8`
 * - `src/services/digest-message-editorial.service.ts:13`
 * - `src/services/digest-message-editorial.service.ts:15`
 * - `src/services/digest.service.ts:97`
 * - `src/services/digest.service.ts:105`
 * - `src/services/telegram.service.ts:5`
 * - `src/services/telegram.service.ts:86`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
export interface DigestMessage {
  // Gán field cấu trúc để tạo object đúng contract.
  text: string;
  // Gán field cấu trúc để tạo object đúng contract.
  url: string;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  imageUrl?: string;
  // Gán field cấu trúc để tạo object đúng contract.
  article: Article;
  // Gán field cấu trúc để tạo object đúng contract.
  topic: TopicKey;
}

/**
 * Interface `DigestEntry` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts:23`
 * - `src/services/digest.service.ts:126`
 * - `src/services/digest.service.ts:128`
 * - `src/services/digest.service.ts:332`
 * - `src/services/digest.service.ts:333`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface DigestEntry {
  // Gán field cấu trúc để tạo object đúng contract.
  article: Article;
  // Gán field cấu trúc để tạo object đúng contract.
  topic: TopicKey;
}

/**
 * Interface `RankedDigestEntry` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts:153`
 * - `src/services/digest.service.ts:154`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface RankedDigestEntry extends DigestEntry {
  // Gán field cấu trúc để tạo object đúng contract.
  index: number;
  // Gán field cấu trúc để tạo object đúng contract.
  score: number;
}

// Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
const sourceTopicAffinity: Record<string, TopicKey[]> = {
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'hn-rss': ['ai'],
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'github-ai-repos': ['ai'],
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'reddit-machine-learning': ['ai'],
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'reddit-local-llama': ['ai'],
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'reddit-openai': ['ai'],
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'reddit-artificial': ['ai'],
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'kubernetes-blog': ['k8s'],
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'reddit-kubernetes': ['k8s'],
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'google-security-blog': ['security'],
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'reddit-cybersecurity': ['security'],
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'aws-news-blog': ['cloud'],
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'reddit-aws': ['cloud'],
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'cncf-blog': ['k8s', 'devops', 'cloud'],
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'devops-dot-com': ['devops'],
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'reddit-devops': ['devops'],
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'the-hacker-news-html': ['security'],
};
// Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
const summaryMaxLength = 1000;

/**
 * Class `DigestService` đóng gói trách nhiệm chính của module.
 *
 * Được sử dụng tại:
 * - `src/controllers/news.controller.ts:10`
 * - `src/controllers/news.controller.ts:18`
 * - `src/controllers/telegram.controller.ts:9`
 * - `src/controllers/telegram.controller.ts:17`
 * - `src/services/article-editorial.types.ts:12`
 * - `tests/services/digest-message-editorial.service.test.ts:3`
 * - `tests/services/digest-message-editorial.service.test.ts:7`
 * - `tests/services/digest.service.test.ts:2`
 * - `tests/services/digest.service.test.ts:4`
 * - `tests/services/digest.service.test.ts:6`
 * - `tests/services/digest.service.test.ts:31`
 * - `tests/services/digest.service.test.ts:56`
 * - `tests/services/digest.service.test.ts:87`
 * - `tests/services/digest.service.test.ts:114`
 * - `tests/services/digest.service.test.ts:141`
 * - `tests/services/digest.service.test.ts:169`
 * - `tests/services/digest.service.test.ts:206`
 * - `tests/services/digest.service.test.ts:240`
 * - `tests/services/digest.service.test.ts:258`
 * - `tests/services/digest.service.test.ts:290`
 * - `tests/services/digest.service.test.ts:318`
 * - `tests/services/digest.service.test.ts:335`
 * - `tests/services/digest.service.test.ts:352`
 * - `tests/services/digest.service.test.ts:370`
 * - `tests/services/digest.service.test.ts:387`
 * - `tests/services/digest.service.test.ts:391`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
export class DigestService {
  /**
   * Hàm `constructor` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/crawlers/github-repos.crawler.ts:121`
   * - `src/crawlers/html.crawler.ts:110`
   * - `src/crawlers/rss.crawler.ts:194`
   * - `src/crawlers/x-search.crawler.ts:166`
   * - `src/services/article-editorial.service.ts:23`
   * - `src/services/codex-article-editorial.generator.ts:10`
   * - `src/services/google-article-editorial.generator.ts:12`
   * - `src/services/google-translation.service.ts:6`
   * - `src/services/openai-article-editorial.generator.ts:16`
   * - `src/services/source.service.ts:61`
   * - `src/services/telegram.service.ts:52`
   * - `src/services/translation.service.ts:9`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  constructor(private readonly maxArticlesPerTopic = env.MAX_ARTICLES_PER_TOPIC) {}

  /**
   * Hàm `buildDigest` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/controllers/news.controller.ts:59`
   * - `tests/services/digest.service.test.ts:6`
   * - `tests/services/digest.service.test.ts:31`
   * - `tests/services/digest.service.test.ts:56`
   * - `tests/services/digest.service.test.ts:87`
   * - `tests/services/digest.service.test.ts:114`
   * - `tests/services/digest.service.test.ts:391`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  buildDigest(articles: Article[]): string {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const selectedEntries = selectBalancedEntries(articles, this.maxArticlesPerTopic);
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const selectedArticles = selectedEntries.map((entry) => entry.article);

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (selectedEntries.length === 0) {
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return '🧠 BẢN TIN CÔNG NGHỆ\n\nChưa tìm thấy bài viết phù hợp.';
    }

    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const sourceNames = [...new Set(selectedArticles.map((article) => article.sourceName))].join(', ');
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const lines: string[] = [
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      '🧠 BẢN TIN CÔNG NGHỆ',
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      `⏱ ${formatVietnamTime(new Date())}`,
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      `📌 ${selectedEntries.length} bài mới | Nguồn: ${sourceNames}`,
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      '',
    ];
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const grouped = groupEntriesByAssignedTopic(selectedEntries);
    // Khởi tạo trạng thái cục bộ sẽ được cập nhật có kiểm soát.
    let articleNumber = 1;

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    for (const topic of topics) {
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const topicArticles = grouped.get(topic.key) ?? [];

      // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
      if (topicArticles.length === 0) {
        // Điều khiển vòng lặp sau khi nhánh hiện tại đã xử lý xong.
        continue;
      }

      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      lines.push('━━━━━━━━━━━━━━');
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      lines.push(`${topicIcon(topic.key)} ${topic.label.toUpperCase()}`);
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      lines.push('');

      // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
      for (const entry of topicArticles) {
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const { article } = entry;
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        lines.push(`${articleNumber}. ${article.title}`);
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        lines.push(`   📰 ${article.sourceName}`);
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const summary = formatSummary(article.summary);
        // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
        if (summary) {
          // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
          lines.push(`   📝 ${summary}`);
        }
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        lines.push(`   🔗 ${article.url}`);
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        lines.push('');
        // Cập nhật trạng thái cục bộ từ kết quả vừa tính.
        articleNumber += 1;
      }
    }

    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return lines.join('\n').trim();
  }

  /**
   * Hàm `buildDigestMessages` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/controllers/news.controller.ts:61`
   * - `src/controllers/telegram.controller.ts:33`
   * - `tests/services/digest-message-editorial.service.test.ts:7`
   * - `tests/services/digest.service.test.ts:141`
   * - `tests/services/digest.service.test.ts:169`
   * - `tests/services/digest.service.test.ts:206`
   * - `tests/services/digest.service.test.ts:240`
   * - `tests/services/digest.service.test.ts:258`
   * - `tests/services/digest.service.test.ts:290`
   * - `tests/services/digest.service.test.ts:318`
   * - `tests/services/digest.service.test.ts:335`
   * - `tests/services/digest.service.test.ts:352`
   * - `tests/services/digest.service.test.ts:370`
   * - `tests/services/digest.service.test.ts:387`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  buildDigestMessages(articles: Article[]): DigestMessage[] {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const selectedEntries = selectBalancedEntries(articles, this.maxArticlesPerTopic);

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (selectedEntries.length === 0) {
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return [];
    }

    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const grouped = groupEntriesByAssignedTopic(selectedEntries);
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const messages: DigestMessage[] = [];

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    for (const topic of topics) {
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const topicArticles = grouped.get(topic.key) ?? [];

      // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
      for (const entry of topicArticles) {
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const editorial = createFallbackEditorial(entry.article, topic.key);
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        messages.push({
          // Gán field cấu trúc để tạo object đúng contract.
          text: renderArticleMessage(entry.article, topic.key, editorial),
          // Gán field cấu trúc để tạo object đúng contract.
          url: entry.article.url,
          // Gán field cấu trúc để tạo object đúng contract.
          imageUrl: getMessageImageUrl(entry.article, topic.key),
          // Gán field cấu trúc để tạo object đúng contract.
          article: entry.article,
          // Gán field cấu trúc để tạo object đúng contract.
          topic: topic.key,
        });
      }
    }

    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return messages;
  }
}

/**
 * Hàm `selectBalancedEntries` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts:52`
 * - `src/services/digest.service.ts:98`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function selectBalancedEntries(articles: Article[], maxArticlesPerTopic: number): DigestEntry[] {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const selectedByUrl = new Set<string>();
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const result: DigestEntry[] = [];

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  for (const topic of topics) {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const candidates = articles
      // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
      .map((article, index) => ({ article, index }))
      // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
      .filter(({ article }) => article.topics.includes(topic.key) && !selectedByUrl.has(article.url))
      // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
      .map(({ article, index }) => ({
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        article,
        // Gán field cấu trúc để tạo object đúng contract.
        topic: topic.key,
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        index,
        // Gán field cấu trúc để tạo object đúng contract.
        score: scoreArticleForTopic(article, topic.key),
      }))
      // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
      .sort((left, right) => right.score - left.score || left.index - right.index);

    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const selectedForTopic = pickDiverseSources(candidates, maxArticlesPerTopic);

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    for (const entry of selectedForTopic) {
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      selectedByUrl.add(entry.article.url);
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      result.push({ article: entry.article, topic: entry.topic });
    }
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return result;
}

/**
 * Hàm `pickDiverseSources` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts:142`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function pickDiverseSources(candidates: RankedDigestEntry[], maxArticlesPerTopic: number): RankedDigestEntry[] {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const picked: RankedDigestEntry[] = [];
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const pickedUrls = new Set<string>();
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const pickedSources = new Set<string>();

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  for (const candidate of candidates) {
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (picked.length >= maxArticlesPerTopic) {
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return picked;
    }

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (pickedSources.has(candidate.article.sourceId)) {
      // Điều khiển vòng lặp sau khi nhánh hiện tại đã xử lý xong.
      continue;
    }

    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    picked.push(candidate);
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    pickedUrls.add(candidate.article.url);
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    pickedSources.add(candidate.article.sourceId);
  }

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  for (const candidate of candidates) {
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (picked.length >= maxArticlesPerTopic) {
      // Điều khiển vòng lặp sau khi nhánh hiện tại đã xử lý xong.
      break;
    }

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (pickedUrls.has(candidate.article.url)) {
      // Điều khiển vòng lặp sau khi nhánh hiện tại đã xử lý xong.
      continue;
    }

    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    picked.push(candidate);
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    pickedUrls.add(candidate.article.url);
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return picked.sort((left, right) => left.index - right.index);
}

/**
 * Hàm `scoreArticleForTopic` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts:138`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function scoreArticleForTopic(article: Article, topic: TopicKey): number {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const topicDefinition = topics.find((item) => item.key === topic);
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const affinities = sourceTopicAffinity[article.sourceId] ?? [];
  // Khởi tạo trạng thái cục bộ sẽ được cập nhật có kiểm soát.
  let score = 0;

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (affinities.includes(topic)) {
    // Cập nhật trạng thái cục bộ từ kết quả vừa tính.
    score += 100;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  } else if (affinities.length > 0) {
    // Cập nhật trạng thái cục bộ từ kết quả vừa tính.
    score -= 15;
  }

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (article.topics.length === 1) {
    // Cập nhật trạng thái cục bộ từ kết quả vừa tính.
    score += 8;
  }

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (article.topics[0] === topic) {
    // Cập nhật trạng thái cục bộ từ kết quả vừa tính.
    score += 4;
  }

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (!topicDefinition) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return score;
  }

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  for (const keyword of topicDefinition.keywords) {
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (includesKeyword(article.title, keyword)) {
      // Cập nhật trạng thái cục bộ từ kết quả vừa tính.
      score += 20;
    }

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (includesKeyword(article.url, keyword)) {
      // Cập nhật trạng thái cục bộ từ kết quả vừa tính.
      score += 8;
    }

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (article.summary && includesKeyword(article.summary, keyword)) {
      // Cập nhật trạng thái cục bộ từ kết quả vừa tính.
      score += 4;
    }
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return score;
}

/**
 * Hàm `renderArticleMessage` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/digest-message-editorial.service.ts:3`
 * - `src/services/digest-message-editorial.service.ts:19`
 * - `src/services/digest.service.ts:113`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
export function renderArticleMessage(
  // Gán field cấu trúc để tạo object đúng contract.
  article: Article,
  // Gán field cấu trúc để tạo object đúng contract.
  topic: TopicKey,
  // Gán field cấu trúc để tạo object đúng contract.
  editorial: ArticleEditorial,
// Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
): string {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const topicDefinition = topics.find((item) => item.key === topic);
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const topicLabel = (topicDefinition?.label ?? topic).toUpperCase();
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const summary = truncateText(compactText(editorial.summary), 360);
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const whyImportant = truncateText(compactText(editorial.whyImportant), 320);
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const actionText = truncateText(compactText(editorial.actionText), 240);
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const action = actionPresentation[editorial.actionLevel];

  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const lines: string[] = [
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    `${topicIcon(topic)}  <b>${escapeHtml(`${topicLabel} UPDATE`)}</b>`,
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    '━━━━━━━━━━━━━━━━',
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    '',
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    `📰  <b>${escapeHtml(editorial.title)}</b>`,
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    '',
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    `📅 <b>Công bố:</b> ${formatArticleDate(article)}`,
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    '',
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    '📝 <b>Tóm tắt</b>',
    /**
     * Hàm `escapeHtml` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - `src/services/digest.service.ts:6`
     * - `src/services/digest.service.ts:241`
     * - `src/services/digest.service.ts:244`
     * - `src/services/digest.service.ts:252`
     * - `src/services/digest.service.ts:255`
     * - `src/services/digest.service.ts:257`
     * - `src/utils/text.ts:5`
     */
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    escapeHtml(summary),
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    '',
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    '🎯 <b>Vì sao đáng chú ý?</b>',
    /**
     * Hàm `escapeHtml` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - `src/services/digest.service.ts:6`
     * - `src/services/digest.service.ts:241`
     * - `src/services/digest.service.ts:244`
     * - `src/services/digest.service.ts:249`
     * - `src/services/digest.service.ts:255`
     * - `src/services/digest.service.ts:257`
     * - `src/utils/text.ts:5`
     */
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    escapeHtml(whyImportant),
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    '',
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    '⚡ <b>Mức hành động</b>',
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    `${action.icon} <b>${action.label}</b> — ${escapeHtml(actionText)}`,
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    '',
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    `🏢 <i>Nguồn: ${escapeHtml(article.sourceName)}</i>`,
  ];

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return lines.join('\n').trim();
}

// Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
const actionPresentation = {
  // Gán field cấu trúc để tạo object đúng contract.
  urgent: { icon: '🔴', label: 'KHẨN CẤP' },
  // Gán field cấu trúc để tạo object đúng contract.
  high: { icon: '🟠', label: 'CAO' },
  // Gán field cấu trúc để tạo object đúng contract.
  monitor: { icon: '🟡', label: 'THEO DÕI' },
// Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
} as const;

/**
 * Hàm `formatArticleDate` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts:246`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function formatArticleDate(article: Article): string {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  for (const value of [article.publishedAt, article.collectedAt]) {
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (!value) {
      // Điều khiển vòng lặp sau khi nhánh hiện tại đã xử lý xong.
      continue;
    }

    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const date = new Date(value);
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (Number.isNaN(date.getTime())) {
      // Điều khiển vòng lặp sau khi nhánh hiện tại đã xử lý xong.
      continue;
    }

    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return new Intl.DateTimeFormat('vi-VN', {
      // Gán field cấu trúc để tạo object đúng contract.
      timeZone: 'Asia/Ho_Chi_Minh',
      // Gán field cấu trúc để tạo object đúng contract.
      day: '2-digit',
      // Gán field cấu trúc để tạo object đúng contract.
      month: '2-digit',
      // Gán field cấu trúc để tạo object đúng contract.
      year: 'numeric',
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    }).format(date);
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return 'Không rõ';
}

/**
 * Hàm `getMessageImageUrl` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts:115`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function getMessageImageUrl(article: Article, topic: TopicKey): string | undefined {
  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return normalizeImageUrl(article.imageUrl) ?? topicImageUrls[topic];
}

/**
 * Hàm `normalizeImageUrl` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts:381`
 * - `src/crawlers/github-repos.crawler.ts:477`
 * - `src/crawlers/html.crawler.ts:219`
 * - `src/crawlers/html.crawler.ts:307`
 * - `src/crawlers/rss.crawler.ts:410`
 * - `src/crawlers/rss.crawler.ts:480`
 * - `src/crawlers/rss.crawler.ts:613`
 * - `src/services/digest.service.ts:292`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function normalizeImageUrl(imageUrl?: string): string | undefined {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const trimmed = imageUrl?.trim();

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (!trimmed) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return undefined;
  }

  // Bắt đầu thao tác có thể lỗi để bảo vệ toàn bộ pipeline.
  try {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const url = new URL(trimmed);
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return url.protocol === 'https:' ? url.toString() : undefined;
  // Thu lỗi từ thao tác trước và chuyển sang fallback an toàn.
  } catch {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return undefined;
  }
}

/**
 * Hàm `formatSummary` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts:379`
 * - `src/crawlers/github-repos.crawler.ts:404`
 * - `src/crawlers/x-search.crawler.ts:465`
 * - `src/crawlers/x-search.crawler.ts:510`
 * - `src/services/digest.service.ts:84`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function formatSummary(summary?: string): string {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (!summary) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return '';
  }

  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const compacted = compactText(summary);

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (!compacted) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return '';
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return truncateText(compacted, summaryMaxLength);
}

/**
 * Hàm `truncateText` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/crawlers/x-search.crawler.ts:461`
 * - `src/crawlers/x-search.crawler.ts:542`
 * - `src/services/digest.service.ts:235`
 * - `src/services/digest.service.ts:236`
 * - `src/services/digest.service.ts:237`
 * - `src/services/digest.service.ts:321`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function truncateText(value: string, maxLength: number): string {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (value.length <= maxLength) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return value;
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Hàm `groupEntriesByAssignedTopic` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts:66`
 * - `src/services/digest.service.ts:104`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function groupEntriesByAssignedTopic(entries: DigestEntry[]): Map<TopicKey, DigestEntry[]> {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const result = new Map<TopicKey, DigestEntry[]>();

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  for (const entry of entries) {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const current = result.get(entry.topic) ?? [];
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    current.push(entry);
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    result.set(entry.topic, current);
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return result;
}

/**
 * Hàm `formatVietnamTime` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts:62`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function formatVietnamTime(date: Date): string {
  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return new Intl.DateTimeFormat('vi-VN', {
    // Gán field cấu trúc để tạo object đúng contract.
    timeZone: 'Asia/Ho_Chi_Minh',
    // Gán field cấu trúc để tạo object đúng contract.
    day: '2-digit',
    // Gán field cấu trúc để tạo object đúng contract.
    month: '2-digit',
    // Gán field cấu trúc để tạo object đúng contract.
    year: 'numeric',
    // Gán field cấu trúc để tạo object đúng contract.
    hour: '2-digit',
    // Gán field cấu trúc để tạo object đúng contract.
    minute: '2-digit',
    // Gán field cấu trúc để tạo object đúng contract.
    hour12: false,
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  }).format(date);
}

/**
 * Hàm `topicIcon` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts:77`
 * - `src/services/digest.service.ts:241`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function topicIcon(topic: TopicKey): string {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const icons: Record<TopicKey, string> = {
    // Gán field cấu trúc để tạo object đúng contract.
    ai: '🤖',
    // Gán field cấu trúc để tạo object đúng contract.
    k8s: '☸️',
    // Gán field cấu trúc để tạo object đúng contract.
    security: '🔐',
    // Gán field cấu trúc để tạo object đúng contract.
    devops: '🛠️',
    // Gán field cấu trúc để tạo object đúng contract.
    cloud: '☁️',
  };

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return icons[topic];
}
