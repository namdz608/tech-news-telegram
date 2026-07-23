/**
 * Contract phân loại chủ đề dùng từ lúc crawl tới lúc render Telegram.
 *
 * Được config topic/image, Article/Source types, article/digest/editorial
 * services và tests tương ứng sử dụng.
 */
/**
 * Tập khóa đóng bảo đảm config và Record không bỏ sót topic.
 * Được dùng bởi config source/topic/image, Article/Source types và các service article/digest/editorial.
 */
export type TopicKey = 'ai' | 'k8s' | 'security' | 'devops' | 'cloud';

/**
 * Định nghĩa tên hiển thị và keyword dùng để nhận diện một topic.
 * Được tạo tại `config/topics.ts`, rồi đọc bởi `article.service.ts` và `digest.service.ts`.
 */
export interface TopicDefinition {
  // Khóa máy đọc, nhãn người đọc và danh sách từ khóa match.
  key: TopicKey;
  label: string;
  keywords: string[];
}
