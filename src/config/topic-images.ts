/**
 * Ảnh fallback theo chủ đề khi Article không cung cấp ảnh HTTPS hợp lệ.
 *
 * Được `src/services/digest.service.ts` đọc khi tạo DigestMessage;
 * các test digest gián tiếp kiểm tra việc chọn ảnh.
 */
import type { TopicKey } from '../types/topic';

// Record bắt buộc mỗi TopicKey có đúng một URL fallback.
export const topicImageUrls: Record<TopicKey, string> = {
  // Mỗi URL dùng màu/text riêng để người đọc nhận biết topic.
  ai: 'https://placehold.co/1200x630/312e81/ffffff.png?text=AI',
  k8s: 'https://placehold.co/1200x630/075985/ffffff.png?text=Kubernetes',
  security: 'https://placehold.co/1200x630/991b1b/ffffff.png?text=Security',
  devops: 'https://placehold.co/1200x630/166534/ffffff.png?text=DevOps',
  cloud: 'https://placehold.co/1200x630/0369a1/ffffff.png?text=Cloud',
};
