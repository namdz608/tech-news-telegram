import type { HealthTopicDefinition, HealthTopicKey } from '../types/health';

const keywordSets = {
  'sleep-recovery': ['sleep', 'insomnia', 'circadian', 'fatigue', 'recovery', 'nap', 'ngủ', 'mất ngủ', 'thức khuya', 'mệt mỏi', 'phục hồi'],
  'nutrition-metabolism': ['nutrition', 'diet', 'food', 'protein', 'vitamin', 'obesity', 'diabetes', 'metabolism', 'dinh dưỡng', 'ăn uống', 'thực phẩm', 'béo phì', 'tiểu đường', 'chuyển hóa'],
  'movement-musculoskeletal': ['exercise', 'fitness', 'walking', 'running', 'muscle', 'joint', 'bone', 'posture', 'vận động', 'tập thể dục', 'đi bộ', 'chạy bộ', 'cơ bắp', 'xương khớp', 'tư thế'],
  'mental-wellbeing': ['mental health', 'stress', 'anxiety', 'depression', 'addiction', 'wellbeing', 'tâm lý', 'sức khỏe tinh thần', 'căng thẳng', 'lo âu', 'trầm cảm', 'nghiện'],
  'prevention-daily-life': ['prevention', 'screening', 'vaccine', 'vaccination', 'hygiene', 'infection', 'outbreak', 'healthy living', 'phòng bệnh', 'tầm soát', 'vắc xin', 'vệ sinh', 'lối sống', 'thói quen', 'dịch bệnh'],
  'conditions-medicine-research': ['disease', 'cancer', 'heart', 'kidney', 'liver', 'treatment', 'therapy', 'medicine', 'drug', 'medical device', 'device safety', 'clinical trial', 'study', 'research', 'bệnh', 'ung thư', 'tim mạch', 'thận', 'gan', 'điều trị', 'thuốc', 'thiết bị y tế', 'thử nghiệm', 'nghiên cứu'],
} satisfies Record<HealthTopicKey, string[]>;

export const healthTopics: HealthTopicDefinition[] = [
  {
    key: 'sleep-recovery', label: 'Giấc ngủ & Phục hồi', icon: '🌙',
    keywords: keywordSets['sleep-recovery'],
    fallbackImageUrl: 'https://placehold.co/1200x630/1e3a8a/ffffff.png?text=Sleep+Recovery',
    fallbackSafeTakeaway: 'Duy trì giờ ngủ đều và trao đổi với nhân viên y tế nếu vấn đề kéo dài.',
    fallbackEvidenceNote: 'Khuyến nghị về giấc ngủ có thể không phù hợp với mọi người và cần được hiểu theo hoàn cảnh cá nhân.',
  },
  {
    key: 'nutrition-metabolism', label: 'Dinh dưỡng & Chuyển hóa', icon: '🥗',
    keywords: keywordSets['nutrition-metabolism'],
    fallbackImageUrl: 'https://placehold.co/1200x630/166534/ffffff.png?text=Nutrition',
    fallbackSafeTakeaway: 'Ưu tiên chế độ ăn cân bằng; người có bệnh nền nên hỏi chuyên gia trước thay đổi lớn.',
    fallbackEvidenceNote: 'Thông tin dinh dưỡng có thể không áp dụng cho mọi cá nhân và cần xét bệnh nền, dị ứng cùng nhu cầu riêng.',
  },
  {
    key: 'movement-musculoskeletal', label: 'Vận động & Cơ xương khớp', icon: '🏃',
    keywords: keywordSets['movement-musculoskeletal'],
    fallbackImageUrl: 'https://placehold.co/1200x630/0f766e/ffffff.png?text=Movement',
    fallbackSafeTakeaway: 'Tăng vận động từ từ, phù hợp thể trạng và dừng lại nếu có dấu hiệu bất thường.',
    fallbackEvidenceNote: 'Bài tập có thể không phù hợp với mọi người và cần được điều chỉnh theo thể trạng, chấn thương hoặc bệnh nền.',
  },
  {
    key: 'mental-wellbeing', label: 'Sức khỏe tinh thần', icon: '🧠',
    keywords: keywordSets['mental-wellbeing'],
    fallbackImageUrl: 'https://placehold.co/1200x630/7e22ce/ffffff.png?text=Mental+Wellbeing',
    fallbackSafeTakeaway: 'Tìm hỗ trợ chuyên môn khi triệu chứng kéo dài, nặng lên hoặc ảnh hưởng sinh hoạt.',
    fallbackEvidenceNote: 'Thông tin sức khỏe tinh thần không thay thế đánh giá cá nhân và có thể cần được diễn giải bởi chuyên gia.',
  },
  {
    key: 'prevention-daily-life', label: 'Phòng bệnh & Thói quen sinh hoạt', icon: '🛡️',
    keywords: keywordSets['prevention-daily-life'],
    fallbackImageUrl: 'https://placehold.co/1200x630/b45309/ffffff.png?text=Prevention',
    fallbackSafeTakeaway: 'Đối chiếu khuyến cáo chính thức và áp dụng biện pháp phù hợp với hoàn cảnh cá nhân.',
    fallbackEvidenceNote: 'Khuyến cáo phòng bệnh có thể thay đổi theo tuổi, khu vực và nguy cơ cá nhân nên cần đặt trong đúng bối cảnh.',
  },
  {
    key: 'conditions-medicine-research', label: 'Bệnh lý, Thuốc & Nghiên cứu', icon: '🔬',
    keywords: keywordSets['conditions-medicine-research'],
    fallbackImageUrl: 'https://placehold.co/1200x630/991b1b/ffffff.png?text=Medical+Research',
    fallbackSafeTakeaway: 'Không tự thay đổi điều trị; trao đổi với bác sĩ hoặc dược sĩ về thông tin liên quan.',
    fallbackEvidenceNote: 'Kết quả y khoa có thể còn sơ bộ hoặc không áp dụng cho mọi người và cần được hiểu theo thiết kế nghiên cứu.',
  },
];

const allHealthTopics = healthTopics.map((topic) => topic.key);

export const healthSourceAffinity: Record<string, HealthTopicKey[]> = {
  'vnexpress-health': allHealthTopics,
  'tuoitre-health': allHealthTopics,
  'thanhnien-health': allHealthTopics,
  'medlineplus-new': allHealthTopics,
  'medlineplus-healthy-living': [
    'sleep-recovery', 'nutrition-metabolism', 'movement-musculoskeletal',
    'mental-wellbeing', 'prevention-daily-life',
  ],
  'fda-medwatch': ['conditions-medicine-research'],
  'niddk-news': ['nutrition-metabolism', 'conditions-medicine-research'],
};
