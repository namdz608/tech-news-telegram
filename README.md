# Tech News Telegram

App Express + TypeScript dùng để gom tin công nghệ từ RSS, forum, HTML web, GitHub và X, sau đó tổng hợp, dịch sang tiếng Việt và gửi bản tin lên Telegram.

## Nguồn Tin

- RSS/blog: Hacker News, Kubernetes Blog, Google Security Blog, AWS News Blog, CNCF Blog, DevOps.com.
- Forum RSS: Reddit r/MachineLearning, r/LocalLLaMA, r/OpenAI, r/artificial, r/kubernetes, r/devops, r/cybersecurity, r/aws.
- HTML web: The Hacker News.
- X Search: tìm Post công nghệ bằng X API v2 Recent Search.
- GitHub Search: tìm repository AI mới hoặc mới cập nhật bằng GitHub Search API.

## Luồng Forum Reddit

App lấy bài Reddit qua RSS public của từng subreddit, ví dụ `https://www.reddit.com/r/LocalLLaMA/.rss?limit=10`. Mỗi subreddit có topic mặc định để các bài thảo luận tiêu đề ngắn vẫn vào đúng nhóm:

- AI: r/MachineLearning, r/LocalLLaMA, r/OpenAI, r/artificial.
- Kubernetes: r/kubernetes.
- DevOps: r/devops.
- Security: r/cybersecurity.
- Cloud: r/aws.

RSS parser gửi `USER_AGENT` và header RSS/XML để giảm lỗi bị Reddit chặn request. Bài Reddit vẫn đi qua lọc tuổi bài, dedupe, chọn digest, dịch tiếng Việt và gửi kèm ảnh như các nguồn khác.

## Luồng X Search

App dùng endpoint chính thức `GET https://api.x.com/2/tweets/search/recent` để lấy Post trong 7 ngày gần nhất theo query cấu hình. Mỗi Post được map thành `Article` với:

- `sourceName`: `X Search`
- `title`: nội dung Post rút gọn
- `summary`: nội dung Post, author và metrics nếu có
- `url`: `https://x.com/i/web/status/<tweet_id>`

Post từ X vẫn đi qua các bước lọc topic, lọc link rác, lọc bài quá cũ, tổng hợp digest, dịch tiếng Việt và gửi Telegram như các nguồn khác.

## Luồng GitHub AI Repos

App dùng endpoint chính thức `GET https://api.github.com/search/repositories` để lấy repo AI mới hoặc mới cập nhật. Mặc định, app lọc theo các topic AI như `llm`, `generative-ai`, `ai-agent`, `rag`, `machine-learning`, `artificial-intelligence`, giới hạn trong `GITHUB_AI_REPO_LOOKBACK_DAYS` ngày gần nhất và sắp theo stars.

Mỗi repo được map thành `Article` với:

- `sourceName`: `GitHub AI Repos`
- `title`: `owner/repo`
- `summary`: mô tả repo, stars, language, ngày tạo, ngày cập nhật và ngày push gần nhất
- `url`: URL repo GitHub

Nếu `GITHUB_TOKEN` trống, nguồn GitHub vẫn chạy với rate limit public của GitHub. Nên dùng fine-grained token chỉ cần quyền đọc public metadata để tăng rate limit.

## Ảnh Minh Họa Telegram

Mỗi tin Telegram dạng từng bài sẽ cố gửi kèm ảnh minh họa. App ưu tiên ảnh lấy từ nguồn tin, ví dụ ảnh trong RSS/HTML hoặc avatar owner của repo GitHub. Nếu bài không có ảnh, app dùng ảnh fallback theo topic như AI, Kubernetes, Security, DevOps hoặc Cloud. Nếu Telegram không tải được ảnh, app tự gửi lại tin dạng text để không mất bản tin.

## Nội Dung Mỗi Tin Telegram

Mỗi bài được gửi thành một tin riêng kèm ảnh và luôn có: header chủ đề, tiêu đề, ngày công bố, tóm tắt, lý do đáng chú ý, mức hành động, tên nguồn và nút `Xem bài gốc`. Các mục dùng emoji riêng để dễ quét trên Telegram. `EDITORIAL_PROVIDER` chọn Codex, OpenAI, Google hoặc tắt AI cho phần biên tập dữ liệu có cấu trúc; Google Translate luôn dịch digest sang ngôn ngữ đích; code dựng HTML cố định. Nếu provider lỗi hoặc dữ liệu nguồn chưa đủ, app dùng nội dung fallback ở mức `🟡 THEO DÕI` nên không bỏ trống mục nào và không tự gắn cảnh báo khẩn cấp.

## Env

```env
NODE_ENV=development
PORT=3000

TELEGRAM_BOT_TOKEN=123456789:replace_me
TELEGRAM_CHAT_ID=-1001234567890

X_BEARER_TOKEN=
X_SEARCH_QUERY=(AI OR "artificial intelligence" OR LLM OR Kubernetes OR DevOps OR cloud OR security OR CVE) lang:en -is:retweet -is:reply
X_SEARCH_MAX_RESULTS=20

GITHUB_TOKEN=
GITHUB_AI_REPO_QUERY=
GITHUB_AI_REPO_MAX_RESULTS=10
GITHUB_AI_REPO_LOOKBACK_DAYS=7

OPENAI_API_KEY=sk-replace-me
OPENAI_MODEL=gpt-4.1-mini

EDITORIAL_PROVIDER=google
TRANSLATION_TARGET_LANGUAGE=vi
CODEX_TRANSLATION_TIMEOUT_MS=120000

MAX_ARTICLES_PER_DIGEST=20
MAX_ARTICLES_PER_TOPIC=2
MAX_ARTICLE_AGE_DAYS=14
REQUEST_TIMEOUT_MS=12000
USER_AGENT=TechNewsTelegramBot/1.0
```

Nếu `X_BEARER_TOKEN` trống, nguồn X sẽ tự tắt và app vẫn chạy bình thường. Reddit không cần token vì dùng RSS public, nhưng nên giữ `USER_AGENT` có tên app rõ ràng.

## Lấy X Bearer Token

1. Vào X Developer Console.
2. Tạo Project/App hoặc dùng App có sẵn.
3. Mở phần `Keys and tokens`.
4. Copy `Bearer Token`.
5. Dán vào `.env`:

```env
X_BEARER_TOKEN=your_x_bearer_token
```

## Query X Gợi Ý

Rộng, lấy nhiều trend:

```env
X_SEARCH_QUERY=(AI OR "artificial intelligence" OR LLM OR Kubernetes OR DevOps OR cloud OR security OR CVE) lang:en -is:retweet -is:reply
```

Tập trung security:

```env
X_SEARCH_QUERY=(CVE OR zero-day OR exploit OR ransomware OR security) lang:en -is:retweet -is:reply
```

Tập trung cloud/devops:

```env
X_SEARCH_QUERY=(Kubernetes OR K8s OR DevOps OR AWS OR Azure OR GCP OR Terraform) lang:en -is:retweet -is:reply
```

## Chạy App

```bash
npm install
npm run dev
```

Gửi bản tin thủ công:

```bash
curl -X POST http://localhost:3000/telegram/send-digest
```

Kiểm tra build/test:

```bash
npm test
npm run build
```
