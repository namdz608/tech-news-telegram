/**
 * Chấm điểm, chọn bài cân bằng theo topic và render digest/message Telegram.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp { env } từ `../config/env` để dùng đúng dependency/type thay vì tự triển khai lại.
import { env } from '../config/env';
// Nạp { topicImageUrls } từ `../config/topic-images` để dùng đúng dependency/type thay vì tự triển khai lại.
import { topicImageUrls } from '../config/topic-images';
// Nạp { topics } từ `../config/topics` để dùng đúng dependency/type thay vì tự triển khai lại.
import { topics } from '../config/topics';
// Nạp { Article } từ `../types/article` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { Article } from '../types/article';
// Nạp { TopicKey } từ `../types/topic` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { TopicKey } from '../types/topic';
// Nạp { compactText, escapeHtml, includesKeyword } từ `../utils/text` để dùng đúng dependency/type thay vì tự triển khai lại.
import { compactText, escapeHtml, includesKeyword } from '../utils/text';
// Nạp { createFallbackEditorial } từ `./article-editorial.service` để dùng đúng dependency/type thay vì tự triển khai lại.
import { createFallbackEditorial } from './article-editorial.service';
// Nạp { ArticleEditorial } từ `./article-editorial.types` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { ArticleEditorial } from './article-editorial.types';

/**
 * Interface `DigestMessage` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/services/digest-message-editorial.service.ts`
 * - `src/services/digest.service.ts`
 * - `src/services/telegram.service.ts`
 */
// Mở khai báo `export interface DigestMessage` để compiler kiểm tra contract cho mọi consumer.
export interface DigestMessage {
  // Gán field `text` từ `string;` để object khớp contract.
  text: string;
  // Gán field `url` từ `string;` để object khớp contract.
  url: string;
  // Gán field `imageUrl?` từ `string;` để object khớp contract.
  imageUrl?: string;
  // Gán field `article` từ `Article;` để object khớp contract.
  article: Article;
  // Gán field `topic` từ `TopicKey;` để object khớp contract.
  topic: TopicKey;
}

/**
 * Interface `DigestEntry` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts`
 */
// Mở khai báo `interface DigestEntry` để compiler kiểm tra contract cho mọi consumer.
interface DigestEntry {
  // Gán field `article` từ `Article;` để object khớp contract.
  article: Article;
  // Gán field `topic` từ `TopicKey;` để object khớp contract.
  topic: TopicKey;
}

/**
 * Interface `RankedDigestEntry` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts`
 */
// Mở khai báo `interface RankedDigestEntry extends DigestEntry` để compiler kiểm tra contract cho mọi consumer.
interface RankedDigestEntry extends DigestEntry {
  // Gán field `index` từ `number;` để object khớp contract.
  index: number;
  // Gán field `score` từ `number;` để object khớp contract.
  score: number;
}

// Gán field `const sourceTopicAffinity` từ `Record<string, TopicKey[]> = {` để object khớp contract.
const sourceTopicAffinity: Record<string, TopicKey[]> = {
  // Gán field `hn-rss` từ `['ai'],` để object khớp contract.
  'hn-rss': ['ai'],
  // Gán field `github-ai-repos` từ `['ai'],` để object khớp contract.
  'github-ai-repos': ['ai'],
  // Gán field `reddit-machine-learning` từ `['ai'],` để object khớp contract.
  'reddit-machine-learning': ['ai'],
  // Gán field `reddit-local-llama` từ `['ai'],` để object khớp contract.
  'reddit-local-llama': ['ai'],
  // Gán field `reddit-openai` từ `['ai'],` để object khớp contract.
  'reddit-openai': ['ai'],
  // Gán field `reddit-artificial` từ `['ai'],` để object khớp contract.
  'reddit-artificial': ['ai'],
  // Gán field `kubernetes-blog` từ `['k8s'],` để object khớp contract.
  'kubernetes-blog': ['k8s'],
  // Gán field `reddit-kubernetes` từ `['k8s'],` để object khớp contract.
  'reddit-kubernetes': ['k8s'],
  // Gán field `google-security-blog` từ `['security'],` để object khớp contract.
  'google-security-blog': ['security'],
  // Gán field `reddit-cybersecurity` từ `['security'],` để object khớp contract.
  'reddit-cybersecurity': ['security'],
  // Gán field `aws-news-blog` từ `['cloud'],` để object khớp contract.
  'aws-news-blog': ['cloud'],
  // Gán field `reddit-aws` từ `['cloud'],` để object khớp contract.
  'reddit-aws': ['cloud'],
  // Gán field `cncf-blog` từ `['k8s', 'devops', 'cloud'],` để object khớp contract.
  'cncf-blog': ['k8s', 'devops', 'cloud'],
  // Gán field `devops-dot-com` từ `['devops'],` để object khớp contract.
  'devops-dot-com': ['devops'],
  // Gán field `reddit-devops` từ `['devops'],` để object khớp contract.
  'reddit-devops': ['devops'],
  // Gán field `the-hacker-news-html` từ `['security'],` để object khớp contract.
  'the-hacker-news-html': ['security'],
};
// Tính `summaryMaxLength` từ `1000;` và giữ bất biến trong phạm vi hiện tại.
const summaryMaxLength = 1000;

/**
 * Class `DigestService` sở hữu vòng đời dependency và điều phối các bước digest service.
 *
 * Được sử dụng tại:
 * - `src/controllers/news.controller.ts`
 * - `src/controllers/telegram.controller.ts`
 * - `tests/services/digest-message-editorial.service.test.ts`
 * - `tests/services/digest.service.test.ts`
 */
// Mở khai báo `export class DigestService` để compiler kiểm tra contract cho mọi consumer.
export class DigestService {
  constructor(private readonly maxArticlesPerTopic = env.MAX_ARTICLES_PER_TOPIC) {}

  /**
   * Hàm `buildDigest` tạo cấu trúc đầu ra từ cấu hình/dữ liệu đầu vào; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `tests/services/digest.service.test.ts`
   * - `src/controllers/news.controller.ts`
   */
  // Mở method `buildDigest` để tạo cấu trúc đầu ra từ cấu hình/dữ liệu đầu vào.
  buildDigest(articles: Article[]): string {
    // Tính `selectedEntries` từ `selectBalancedEntries(articles, this.maxArticlesPerTopic);` và giữ bất biến trong phạm vi hiện tại.
    const selectedEntries = selectBalancedEntries(articles, this.maxArticlesPerTopic);
    // Tính `selectedArticles` từ `selectedEntries.map((entry) => entry.article);` và giữ bất biến trong phạm vi hiện tại.
    const selectedArticles = selectedEntries.map((entry) => entry.article);

    // Nếu `selectedEntries.length === 0` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (selectedEntries.length === 0) {
      // Trả `'🧠 BẢN TIN CÔNG NGHỆ\n\nChưa tìm thấy bài viết phù hợp.';` cho caller và kết thúc nhánh hiện tại.
      return '🧠 BẢN TIN CÔNG NGHỆ\n\nChưa tìm thấy bài viết phù hợp.';
    }

    // Tính `sourceNames` từ `[...new Set(selectedArticles.map((article) => article.sourceName))].join(', ');` và giữ bất biến trong phạm vi hiện tại.
    const sourceNames = [...new Set(selectedArticles.map((article) => article.sourceName))].join(', ');
    // Gán field `const lines` từ `string[] = [` để object khớp contract.
    const lines: string[] = [
      // Thêm giá trị `'🧠 BẢN TIN CÔNG NGHỆ',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
      '🧠 BẢN TIN CÔNG NGHỆ',
      // Thêm giá trị ``⏱ ${formatVietnamTime(new Date())}`,` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
      `⏱ ${formatVietnamTime(new Date())}`,
      // Thêm giá trị ``📌 ${selectedEntries.length} bài mới | Nguồn: ${sourceNames}`,` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
      `📌 ${selectedEntries.length} bài mới | Nguồn: ${sourceNames}`,
      // Thêm giá trị `'',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
      '',
    ];
    // Tính `grouped` từ `groupEntriesByAssignedTopic(selectedEntries);` và giữ bất biến trong phạm vi hiện tại.
    const grouped = groupEntriesByAssignedTopic(selectedEntries);
    // Khởi tạo trạng thái `articleNumber`; các nhánh bên dưới sẽ cập nhật nó có kiểm soát.
    let articleNumber = 1;

    // Lặp theo `const topic of topics` để xử lý đủ từng phần tử/trạng thái.
    for (const topic of topics) {
      // Tính `topicArticles` từ `grouped.get(topic.key) ?? [];` và giữ bất biến trong phạm vi hiện tại.
      const topicArticles = grouped.get(topic.key) ?? [];

      // Nếu `topicArticles.length === 0` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
      if (topicArticles.length === 0) {
        // Dùng `continue;` để bỏ qua/kết thúc vòng lặp sau khi điều kiện hiện tại đã rõ.
        continue;
      }

      // Gọi `lines.push` với `'━━━━━━━━━━━━━━'` để hoàn tất side effect/bước xử lý hiện tại.
      lines.push('━━━━━━━━━━━━━━');
      // Gọi `lines.push` với ``${topicIcon(topic.key)} ${topic.label.toUpperCase()}`` để hoàn tất side effect/bước xử lý hiện tại.
      lines.push(`${topicIcon(topic.key)} ${topic.label.toUpperCase()}`);
      // Gọi `lines.push` với `''` để hoàn tất side effect/bước xử lý hiện tại.
      lines.push('');

      // Lặp theo `const entry of topicArticles` để xử lý đủ từng phần tử/trạng thái.
      for (const entry of topicArticles) {
        const { article } = entry;
        // Gọi `lines.push` với ``${articleNumber}. ${article.title}`` để hoàn tất side effect/bước xử lý hiện tại.
        lines.push(`${articleNumber}. ${article.title}`);
        // Gọi `lines.push` với `` 📰 ${article.sourceName}`` để hoàn tất side effect/bước xử lý hiện tại.
        lines.push(`   📰 ${article.sourceName}`);
        // Tính `summary` từ `formatSummary(article.summary);` và giữ bất biến trong phạm vi hiện tại.
        const summary = formatSummary(article.summary);
        // Nếu `summary` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
        if (summary) {
          // Gọi `lines.push` với `` 📝 ${summary}`` để hoàn tất side effect/bước xử lý hiện tại.
          lines.push(`   📝 ${summary}`);
        }
        // Gọi `lines.push` với `` 🔗 ${article.url}`` để hoàn tất side effect/bước xử lý hiện tại.
        lines.push(`   🔗 ${article.url}`);
        // Gọi `lines.push` với `''` để hoàn tất side effect/bước xử lý hiện tại.
        lines.push('');
        // Cập nhật `articleNumber` bằng `1;` cho bước kế tiếp.
        articleNumber += 1;
      }
    }

    // Trả `lines.join('\n').trim();` cho caller và kết thúc nhánh hiện tại.
    return lines.join('\n').trim();
  }

  /**
   * Hàm `buildDigestMessages` tạo cấu trúc đầu ra từ cấu hình/dữ liệu đầu vào; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `tests/services/digest.service.test.ts`
   * - `src/controllers/news.controller.ts`
   * - `src/controllers/telegram.controller.ts`
   */
  // Mở method `buildDigestMessages` để tạo cấu trúc đầu ra từ cấu hình/dữ liệu đầu vào.
  buildDigestMessages(articles: Article[]): DigestMessage[] {
    // Tính `selectedEntries` từ `selectBalancedEntries(articles, this.maxArticlesPerTopic);` và giữ bất biến trong phạm vi hiện tại.
    const selectedEntries = selectBalancedEntries(articles, this.maxArticlesPerTopic);

    // Nếu `selectedEntries.length === 0` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (selectedEntries.length === 0) {
      // Trả `[];` cho caller và kết thúc nhánh hiện tại.
      return [];
    }

    // Tính `grouped` từ `groupEntriesByAssignedTopic(selectedEntries);` và giữ bất biến trong phạm vi hiện tại.
    const grouped = groupEntriesByAssignedTopic(selectedEntries);
    // Gán field `const messages` từ `DigestMessage[] = [];` để object khớp contract.
    const messages: DigestMessage[] = [];

    // Lặp theo `const topic of topics` để xử lý đủ từng phần tử/trạng thái.
    for (const topic of topics) {
      // Tính `topicArticles` từ `grouped.get(topic.key) ?? [];` và giữ bất biến trong phạm vi hiện tại.
      const topicArticles = grouped.get(topic.key) ?? [];

      // Lặp theo `const entry of topicArticles` để xử lý đủ từng phần tử/trạng thái.
      for (const entry of topicArticles) {
        // Tính `editorial` từ `createFallbackEditorial(entry.article, topic.key);` và giữ bất biến trong phạm vi hiện tại.
        const editorial = createFallbackEditorial(entry.article, topic.key);
        messages.push({
          // Gán field `text` từ `renderArticleMessage(entry.article, topic.key, editorial),` để object khớp contract.
          text: renderArticleMessage(entry.article, topic.key, editorial),
          // Gán field `url` từ `entry.article.url,` để object khớp contract.
          url: entry.article.url,
          // Gán field `imageUrl` từ `getMessageImageUrl(entry.article, topic.key),` để object khớp contract.
          imageUrl: getMessageImageUrl(entry.article, topic.key),
          // Gán field `article` từ `entry.article,` để object khớp contract.
          article: entry.article,
          // Gán field `topic` từ `topic.key,` để object khớp contract.
          topic: topic.key,
        });
      }
    }

    // Trả `messages;` cho caller và kết thúc nhánh hiện tại.
    return messages;
  }
}

/**
 * Hàm `selectBalancedEntries` chọn tập bài cân bằng trong giới hạn; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts`
 */
// Mở thân hàm `selectBalancedEntries` với input/output được TypeScript kiểm tra.
function selectBalancedEntries(articles: Article[], maxArticlesPerTopic: number): DigestEntry[] {
  // Tính `selectedByUrl` từ `new Set<string>();` và giữ bất biến trong phạm vi hiện tại.
  const selectedByUrl = new Set<string>();
  // Gán field `const result` từ `DigestEntry[] = [];` để object khớp contract.
  const result: DigestEntry[] = [];

  // Lặp theo `const topic of topics` để xử lý đủ từng phần tử/trạng thái.
  for (const topic of topics) {
    // Tính `candidates` từ `articles` và giữ bất biến trong phạm vi hiện tại.
    const candidates = articles
      // Áp dụng `map` để tiếp tục biến đổi kết quả trung gian mà không đổi input gốc.
      .map((article, index) => ({ article, index }))
      // Áp dụng `filter` để tiếp tục biến đổi kết quả trung gian mà không đổi input gốc.
      .filter(({ article }) => article.topics.includes(topic.key) && !selectedByUrl.has(article.url))
      // Áp dụng `map` để tiếp tục biến đổi kết quả trung gian mà không đổi input gốc.
      .map(({ article, index }) => ({
        // Đưa giá trị `article` vào field cùng tên của object đang tạo.
        article,
        // Gán field `topic` từ `topic.key,` để object khớp contract.
        topic: topic.key,
        // Đưa giá trị `index` vào field cùng tên của object đang tạo.
        index,
        // Gán field `score` từ `scoreArticleForTopic(article, topic.key),` để object khớp contract.
        score: scoreArticleForTopic(article, topic.key),
      }))
      // Áp dụng `sort` để tiếp tục biến đổi kết quả trung gian mà không đổi input gốc.
      .sort((left, right) => right.score - left.score || left.index - right.index);

    // Tính `selectedForTopic` từ `pickDiverseSources(candidates, maxArticlesPerTopic);` và giữ bất biến trong phạm vi hiện tại.
    const selectedForTopic = pickDiverseSources(candidates, maxArticlesPerTopic);

    // Lặp theo `const entry of selectedForTopic` để xử lý đủ từng phần tử/trạng thái.
    for (const entry of selectedForTopic) {
      // Gọi `selectedByUrl.add` với `entry.article.url` để hoàn tất side effect/bước xử lý hiện tại.
      selectedByUrl.add(entry.article.url);
      // Gán field `result.push({ article` từ `entry.article, topic: entry.topic });` để object khớp contract.
      result.push({ article: entry.article, topic: entry.topic });
    }
  }

  // Trả `result;` cho caller và kết thúc nhánh hiện tại.
  return result;
}

/**
 * Hàm `pickDiverseSources` chọn tập bài cân bằng trong giới hạn; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts`
 */
// Mở thân hàm `pickDiverseSources` với input/output được TypeScript kiểm tra.
function pickDiverseSources(candidates: RankedDigestEntry[], maxArticlesPerTopic: number): RankedDigestEntry[] {
  // Gán field `const picked` từ `RankedDigestEntry[] = [];` để object khớp contract.
  const picked: RankedDigestEntry[] = [];
  // Tính `pickedUrls` từ `new Set<string>();` và giữ bất biến trong phạm vi hiện tại.
  const pickedUrls = new Set<string>();
  // Tính `pickedSources` từ `new Set<string>();` và giữ bất biến trong phạm vi hiện tại.
  const pickedSources = new Set<string>();

  // Lặp theo `const candidate of candidates` để xử lý đủ từng phần tử/trạng thái.
  for (const candidate of candidates) {
    // Nếu `picked.length >= maxArticlesPerTopic` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (picked.length >= maxArticlesPerTopic) {
      // Trả `picked;` cho caller và kết thúc nhánh hiện tại.
      return picked;
    }

    // Nếu `pickedSources.has(candidate.article.sourceId)` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (pickedSources.has(candidate.article.sourceId)) {
      // Dùng `continue;` để bỏ qua/kết thúc vòng lặp sau khi điều kiện hiện tại đã rõ.
      continue;
    }

    // Gọi `picked.push` với `candidate` để hoàn tất side effect/bước xử lý hiện tại.
    picked.push(candidate);
    // Gọi `pickedUrls.add` với `candidate.article.url` để hoàn tất side effect/bước xử lý hiện tại.
    pickedUrls.add(candidate.article.url);
    // Gọi `pickedSources.add` với `candidate.article.sourceId` để hoàn tất side effect/bước xử lý hiện tại.
    pickedSources.add(candidate.article.sourceId);
  }

  // Lặp theo `const candidate of candidates` để xử lý đủ từng phần tử/trạng thái.
  for (const candidate of candidates) {
    // Nếu `picked.length >= maxArticlesPerTopic` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (picked.length >= maxArticlesPerTopic) {
      // Dùng `break;` để bỏ qua/kết thúc vòng lặp sau khi điều kiện hiện tại đã rõ.
      break;
    }

    // Nếu `pickedUrls.has(candidate.article.url)` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (pickedUrls.has(candidate.article.url)) {
      // Dùng `continue;` để bỏ qua/kết thúc vòng lặp sau khi điều kiện hiện tại đã rõ.
      continue;
    }

    // Gọi `picked.push` với `candidate` để hoàn tất side effect/bước xử lý hiện tại.
    picked.push(candidate);
    // Gọi `pickedUrls.add` với `candidate.article.url` để hoàn tất side effect/bước xử lý hiện tại.
    pickedUrls.add(candidate.article.url);
  }

  // Trả `picked.sort((left, right) => left.index - right.index);` cho caller và kết thúc nhánh hiện tại.
  return picked.sort((left, right) => left.index - right.index);
}

/**
 * Hàm `scoreArticleForTopic` tính điểm ưu tiên theo topic và nguồn; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts`
 */
// Mở thân hàm `scoreArticleForTopic` với input/output được TypeScript kiểm tra.
function scoreArticleForTopic(article: Article, topic: TopicKey): number {
  // Tính `topicDefinition` từ `topics.find((item) => item.key === topic);` và giữ bất biến trong phạm vi hiện tại.
  const topicDefinition = topics.find((item) => item.key === topic);
  // Tính `affinities` từ `sourceTopicAffinity[article.sourceId] ?? [];` và giữ bất biến trong phạm vi hiện tại.
  const affinities = sourceTopicAffinity[article.sourceId] ?? [];
  // Khởi tạo trạng thái `score`; các nhánh bên dưới sẽ cập nhật nó có kiểm soát.
  let score = 0;

  // Nếu `affinities.includes(topic)` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (affinities.includes(topic)) {
    // Cập nhật `score` bằng `100;` cho bước kế tiếp.
    score += 100;
  } else if (affinities.length > 0) {
    // Cập nhật `score` bằng `15;` cho bước kế tiếp.
    score -= 15;
  }

  // Nếu `article.topics.length === 1` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (article.topics.length === 1) {
    // Cập nhật `score` bằng `8;` cho bước kế tiếp.
    score += 8;
  }

  // Nếu `article.topics[0] === topic` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (article.topics[0] === topic) {
    // Cập nhật `score` bằng `4;` cho bước kế tiếp.
    score += 4;
  }

  // Nếu `!topicDefinition` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (!topicDefinition) {
    // Trả `score;` cho caller và kết thúc nhánh hiện tại.
    return score;
  }

  // Lặp theo `const keyword of topicDefinition.keywords` để xử lý đủ từng phần tử/trạng thái.
  for (const keyword of topicDefinition.keywords) {
    // Nếu `includesKeyword(article.title, keyword)` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (includesKeyword(article.title, keyword)) {
      // Cập nhật `score` bằng `20;` cho bước kế tiếp.
      score += 20;
    }

    // Nếu `includesKeyword(article.url, keyword)` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (includesKeyword(article.url, keyword)) {
      // Cập nhật `score` bằng `8;` cho bước kế tiếp.
      score += 8;
    }

    // Nếu `article.summary && includesKeyword(article.summary, keyword)` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (article.summary && includesKeyword(article.summary, keyword)) {
      // Cập nhật `score` bằng `4;` cho bước kế tiếp.
      score += 4;
    }
  }

  // Trả `score;` cho caller và kết thúc nhánh hiện tại.
  return score;
}

/**
 * Hàm `renderArticleMessage` thực hiện trách nhiệm `render article message` của module; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/digest-message-editorial.service.ts`
 * - `src/services/digest.service.ts`
 */
// Mở thân hàm `renderArticleMessage` với input/output được TypeScript kiểm tra.
export function renderArticleMessage(
  // Gán field `article` từ `Article,` để object khớp contract.
  article: Article,
  // Gán field `topic` từ `TopicKey,` để object khớp contract.
  topic: TopicKey,
  // Gán field `editorial` từ `ArticleEditorial,` để object khớp contract.
  editorial: ArticleEditorial,
): string {
  // Tính `topicDefinition` từ `topics.find((item) => item.key === topic);` và giữ bất biến trong phạm vi hiện tại.
  const topicDefinition = topics.find((item) => item.key === topic);
  // Tính `topicLabel` từ `(topicDefinition?.label ?? topic).toUpperCase();` và giữ bất biến trong phạm vi hiện tại.
  const topicLabel = (topicDefinition?.label ?? topic).toUpperCase();
  // Tính `summary` từ `truncateText(compactText(editorial.summary), 360);` và giữ bất biến trong phạm vi hiện tại.
  const summary = truncateText(compactText(editorial.summary), 360);
  // Tính `whyImportant` từ `truncateText(compactText(editorial.whyImportant), 320);` và giữ bất biến trong phạm vi hiện tại.
  const whyImportant = truncateText(compactText(editorial.whyImportant), 320);
  // Tính `actionText` từ `truncateText(compactText(editorial.actionText), 240);` và giữ bất biến trong phạm vi hiện tại.
  const actionText = truncateText(compactText(editorial.actionText), 240);
  // Tính `action` từ `actionPresentation[editorial.actionLevel];` và giữ bất biến trong phạm vi hiện tại.
  const action = actionPresentation[editorial.actionLevel];

  // Gán field `const lines` từ `string[] = [` để object khớp contract.
  const lines: string[] = [
    // Thêm giá trị ``${topicIcon(topic)} <b>${escapeHtml(`${topicLabel} UPDATE`)}</b>`,` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
    `${topicIcon(topic)}  <b>${escapeHtml(`${topicLabel} UPDATE`)}</b>`,
    // Thêm giá trị `'━━━━━━━━━━━━━━━━',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
    '━━━━━━━━━━━━━━━━',
    // Thêm giá trị `'',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
    '',
    // Thêm giá trị ``📰 <b>${escapeHtml(editorial.title)}</b>`,` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
    `📰  <b>${escapeHtml(editorial.title)}</b>`,
    // Thêm giá trị `'',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
    '',
    // Thêm giá trị ``📅 <b>Công bố:</b> ${formatArticleDate(article)}`,` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
    `📅 <b>Công bố:</b> ${formatArticleDate(article)}`,
    // Thêm giá trị `'',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
    '',
    // Thêm giá trị `'📝 <b>Tóm tắt</b>',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
    '📝 <b>Tóm tắt</b>',
    escapeHtml(summary),
    // Thêm giá trị `'',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
    '',
    // Thêm giá trị `'🎯 <b>Vì sao đáng chú ý?</b>',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
    '🎯 <b>Vì sao đáng chú ý?</b>',
    escapeHtml(whyImportant),
    // Thêm giá trị `'',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
    '',
    // Thêm giá trị `'⚡ <b>Mức hành động</b>',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
    '⚡ <b>Mức hành động</b>',
    // Thêm giá trị ``${action.icon} <b>${action.label}</b> — ${escapeHtml(actionText)}`,` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
    `${action.icon} <b>${action.label}</b> — ${escapeHtml(actionText)}`,
    // Thêm giá trị `'',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
    '',
    // Thêm giá trị ``🏢 <i>Nguồn: ${escapeHtml(article.sourceName)}</i>`,` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
    `🏢 <i>Nguồn: ${escapeHtml(article.sourceName)}</i>`,
  ];

  // Trả `lines.join('\n').trim();` cho caller và kết thúc nhánh hiện tại.
  return lines.join('\n').trim();
}

// Tính `actionPresentation` từ `{` và giữ bất biến trong phạm vi hiện tại.
const actionPresentation = {
  // Gán field `urgent` từ `{ icon: '🔴', label: 'KHẨN CẤP' },` để object khớp contract.
  urgent: { icon: '🔴', label: 'KHẨN CẤP' },
  // Gán field `high` từ `{ icon: '🟠', label: 'CAO' },` để object khớp contract.
  high: { icon: '🟠', label: 'CAO' },
  // Gán field `monitor` từ `{ icon: '🟡', label: 'THEO DÕI' },` để object khớp contract.
  monitor: { icon: '🟡', label: 'THEO DÕI' },
} as const;

/**
 * Hàm `formatArticleDate` định dạng dữ liệu thành chuỗi hiển thị ổn định; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts`
 */
// Mở thân hàm `formatArticleDate` với input/output được TypeScript kiểm tra.
function formatArticleDate(article: Article): string {
  // Lặp theo `const value of [article.publishedAt, article.collectedAt]` để xử lý đủ từng phần tử/trạng thái.
  for (const value of [article.publishedAt, article.collectedAt]) {
    // Nếu `!value` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (!value) {
      // Dùng `continue;` để bỏ qua/kết thúc vòng lặp sau khi điều kiện hiện tại đã rõ.
      continue;
    }

    // Tính `date` từ `new Date(value);` và giữ bất biến trong phạm vi hiện tại.
    const date = new Date(value);
    // Nếu `Number.isNaN(date.getTime())` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (Number.isNaN(date.getTime())) {
      // Dùng `continue;` để bỏ qua/kết thúc vòng lặp sau khi điều kiện hiện tại đã rõ.
      continue;
    }

    // Trả `new Intl.DateTimeFormat('vi-VN', {` cho caller và kết thúc nhánh hiện tại.
    return new Intl.DateTimeFormat('vi-VN', {
      // Gán field `timeZone` từ `'Asia/Ho_Chi_Minh',` để object khớp contract.
      timeZone: 'Asia/Ho_Chi_Minh',
      // Gán field `day` từ `'2-digit',` để object khớp contract.
      day: '2-digit',
      // Gán field `month` từ `'2-digit',` để object khớp contract.
      month: '2-digit',
      // Gán field `year` từ `'numeric',` để object khớp contract.
      year: 'numeric',
    }).format(date);
  }

  // Trả `'Không rõ';` cho caller và kết thúc nhánh hiện tại.
  return 'Không rõ';
}

/**
 * Hàm `getMessageImageUrl` lấy giá trị dẫn xuất an toàn; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts`
 */
// Mở thân hàm `getMessageImageUrl` với input/output được TypeScript kiểm tra.
function getMessageImageUrl(article: Article, topic: TopicKey): string | undefined {
  // Trả `normalizeImageUrl(article.imageUrl) ?? topicImageUrls[topic];` cho caller và kết thúc nhánh hiện tại.
  return normalizeImageUrl(article.imageUrl) ?? topicImageUrls[topic];
}

/**
 * Hàm `normalizeImageUrl` chuẩn hóa giá trị theo rule của hàm; input sai được giữ nguyên, bỏ qua hoặc throw đúng như implementation; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts`
 */
// Mở thân hàm `normalizeImageUrl` với input/output được TypeScript kiểm tra.
function normalizeImageUrl(imageUrl?: string): string | undefined {
  // Tính `trimmed` từ `imageUrl?.trim();` và giữ bất biến trong phạm vi hiện tại.
  const trimmed = imageUrl?.trim();

  // Nếu `!trimmed` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (!trimmed) {
    // Trả `undefined;` cho caller và kết thúc nhánh hiện tại.
    return undefined;
  }

  // Cô lập thao tác có thể lỗi để module còn cơ hội log và trả fallback an toàn.
  try {
    // Tính `url` từ `new URL(trimmed);` và giữ bất biến trong phạm vi hiện tại.
    const url = new URL(trimmed);
    // Trả `url.protocol === 'https:' ? url.toString() : undefined;` cho caller và kết thúc nhánh hiện tại.
    return url.protocol === 'https:' ? url.toString() : undefined;
  // Bắt lỗi từ khối try, không để một dependency ngoài làm hỏng toàn bộ đợt xử lý.
  } catch {
    // Trả `undefined;` cho caller và kết thúc nhánh hiện tại.
    return undefined;
  }
}

/**
 * Hàm `formatSummary` định dạng dữ liệu thành chuỗi hiển thị ổn định; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts`
 */
// Mở thân hàm `formatSummary` với input/output được TypeScript kiểm tra.
function formatSummary(summary?: string): string {
  // Nếu `!summary` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (!summary) {
    // Trả `'';` cho caller và kết thúc nhánh hiện tại.
    return '';
  }

  // Tính `compacted` từ `compactText(summary);` và giữ bất biến trong phạm vi hiện tại.
  const compacted = compactText(summary);

  // Nếu `!compacted` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (!compacted) {
    // Trả `'';` cho caller và kết thúc nhánh hiện tại.
    return '';
  }

  // Trả `truncateText(compacted, summaryMaxLength);` cho caller và kết thúc nhánh hiện tại.
  return truncateText(compacted, summaryMaxLength);
}

/**
 * Hàm `truncateText` cắt chuỗi mà không vượt giới hạn hiển thị; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts`
 */
// Mở thân hàm `truncateText` với input/output được TypeScript kiểm tra.
function truncateText(value: string, maxLength: number): string {
  // Nếu `value.length <= maxLength` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (value.length <= maxLength) {
    // Trả `value;` cho caller và kết thúc nhánh hiện tại.
    return value;
  }

  // Trả ``${value.slice(0, maxLength - 1).trimEnd()}…`;` cho caller và kết thúc nhánh hiện tại.
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Hàm `groupEntriesByAssignedTopic` thực hiện trách nhiệm `group entries by assigned topic` của module; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts`
 */
// Mở thân hàm `groupEntriesByAssignedTopic` với input/output được TypeScript kiểm tra.
function groupEntriesByAssignedTopic(entries: DigestEntry[]): Map<TopicKey, DigestEntry[]> {
  // Tính `result` từ `new Map<TopicKey, DigestEntry[]>();` và giữ bất biến trong phạm vi hiện tại.
  const result = new Map<TopicKey, DigestEntry[]>();

  // Lặp theo `const entry of entries` để xử lý đủ từng phần tử/trạng thái.
  for (const entry of entries) {
    // Tính `current` từ `result.get(entry.topic) ?? [];` và giữ bất biến trong phạm vi hiện tại.
    const current = result.get(entry.topic) ?? [];
    // Gọi `current.push` với `entry` để hoàn tất side effect/bước xử lý hiện tại.
    current.push(entry);
    // Gọi `result.set` với `entry.topic, current` để hoàn tất side effect/bước xử lý hiện tại.
    result.set(entry.topic, current);
  }

  // Trả `result;` cho caller và kết thúc nhánh hiện tại.
  return result;
}

/**
 * Hàm `formatVietnamTime` định dạng dữ liệu thành chuỗi hiển thị ổn định; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts`
 */
// Mở thân hàm `formatVietnamTime` với input/output được TypeScript kiểm tra.
function formatVietnamTime(date: Date): string {
  // Trả `new Intl.DateTimeFormat('vi-VN', {` cho caller và kết thúc nhánh hiện tại.
  return new Intl.DateTimeFormat('vi-VN', {
    // Gán field `timeZone` từ `'Asia/Ho_Chi_Minh',` để object khớp contract.
    timeZone: 'Asia/Ho_Chi_Minh',
    // Gán field `day` từ `'2-digit',` để object khớp contract.
    day: '2-digit',
    // Gán field `month` từ `'2-digit',` để object khớp contract.
    month: '2-digit',
    // Gán field `year` từ `'numeric',` để object khớp contract.
    year: 'numeric',
    // Gán field `hour` từ `'2-digit',` để object khớp contract.
    hour: '2-digit',
    // Gán field `minute` từ `'2-digit',` để object khớp contract.
    minute: '2-digit',
    // Gán field `hour12` từ `false,` để object khớp contract.
    hour12: false,
  }).format(date);
}

/**
 * Hàm `topicIcon` thực hiện trách nhiệm `topic icon` của module; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts`
 */
// Mở thân hàm `topicIcon` với input/output được TypeScript kiểm tra.
function topicIcon(topic: TopicKey): string {
  // Gán field `const icons` từ `Record<TopicKey, string> = {` để object khớp contract.
  const icons: Record<TopicKey, string> = {
    // Gán field `ai` từ `'🤖',` để object khớp contract.
    ai: '🤖',
    // Gán field `k8s` từ `'☸️',` để object khớp contract.
    k8s: '☸️',
    // Gán field `security` từ `'🔐',` để object khớp contract.
    security: '🔐',
    // Gán field `devops` từ `'🛠️',` để object khớp contract.
    devops: '🛠️',
    // Gán field `cloud` từ `'☁️',` để object khớp contract.
    cloud: '☁️',
  };

  // Trả `icons[topic];` cho caller và kết thúc nhánh hiện tại.
  return icons[topic];
}
