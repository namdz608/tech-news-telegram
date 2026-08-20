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

# Consumer gadget news Telegram flow (POST /telegram/send-gadgets)
GADGET_TELEGRAM_BOT_TOKEN=replace_me
GADGET_TELEGRAM_CHAT_ID=replace_me
GADGET_MAX_ARTICLES=12
GADGET_HISTORY_RETENTION_DAYS=30
GADGET_HISTORY_PATH=data/gadget-sent-history.json

# Health and lifestyle Telegram flow (POST /telegram/send-health)
HEALTH_TELEGRAM_BOT_TOKEN=replace_me
HEALTH_TELEGRAM_CHAT_ID=replace_me
HEALTH_MAX_ARTICLES=12
HEALTH_HISTORY_RETENTION_DAYS=7
HEALTH_HISTORY_PATH=data/health-sent-history.json

# Gold and politics Telegram flow (POST /telegram/send-gold-politics)
GOLD_POLITICS_TELEGRAM_BOT_TOKEN=replace_me
GOLD_POLITICS_TELEGRAM_CHAT_ID=replace_me
GOLD_POLITICS_MAX_ARTICLES=15
GOLD_POLITICS_MAX_GOLD_NEWS=3
GOLD_POLITICS_MAX_AGE_HOURS=72
GOLD_POLITICS_MAX_PRICE_AGE_MINUTES=60
GOLD_POLITICS_HISTORY_RETENTION_DAYS=7
GOLD_POLITICS_HISTORY_PATH=data/gold-politics-sent-history.json
GOLD_PRICE_HISTORY_PATH=data/gold-price-history.json
GOLD_POLITICS_WEB_SEARCH_MAX_QUERIES=8
BRAVE_SEARCH_API_KEY=
GOLD_SPOT_API_URL=https://api.gold-api.com/price/XAU

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
MAX_JOBS_PER_DIGEST=10
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

### Bản tin đồ công nghệ

`POST /telegram/send-gadgets` là luồng riêng dành cho RAM, chip, GPU, điện thoại,
iPhone, MacBook, laptop, phụ kiện và thiết bị thông minh. API chỉ chạy khi được gọi;
trong code không có scheduler.

Luồng lấy tối đa 12 bài mới từ bảy RSS: VnExpress Công nghệ, Thanh Niên Sản phẩm,
Tuổi Trẻ Công nghệ, Ars Technica Gadgets, MacRumors, Tom's Hardware và Engadget.
Bài được cân bằng theo sáu nhóm: Điện thoại & Máy tính bảng, Apple, Laptop & Máy tính,
Linh kiện, Màn hình/Âm thanh/Phụ kiện và Thiết bị thông minh. URL đã gửi được lưu 30 ngày
để lần gọi sau không gửi trùng.

```bash
curl -X POST http://localhost:3000/telegram/send-gadgets
```

Khi gửi thành công, API trả `sent: true`, `messageCount` và các số liệu thu thập/lọc.
Khi không còn bài mới, API trả `sent: false`, `reason: "no_new_articles"` và
`messageCount: 0`. Nếu mọi nguồn RSS đều lỗi, API trả HTTP 503; nếu một lượt khác đang
chạy, API trả HTTP 409.

Khi chạy Docker, gắn volume bền vững để giữ lịch sử qua lần restart:

```bash
docker run -v tech-news-gadget-data:/app/data -p 3000:3000 --env-file .env tech-news-telegram
```

### Bản tin đời sống và sức khỏe

`POST /telegram/send-health` đọc bảy RSS đã duyệt: VnExpress Sức khỏe, Tuổi Trẻ
Sức khỏe, Thanh Niên Sức khỏe, MedlinePlus New Links, MedlinePlus Healthy Living,
FDA MedWatch và NIH/NIDDK News. Bài được biên tập sang tiếng Việt và cân bằng theo
sáu nhóm: giấc ngủ, dinh dưỡng, vận động, sức khỏe tinh thần, phòng bệnh, và bệnh
lý/thuốc/nghiên cứu.

Mỗi lần gọi gửi tối đa 12 bài, tối đa hai bài cho mỗi nhóm và hai bài cho mỗi
nguồn. URL đã gửi được lưu riêng trong 7 ngày tại
`data/health-sent-history.json`. Nội dung chỉ nhằm cung cấp thông tin:
`Thông tin tham khảo, không thay thế chẩn đoán hoặc điều trị y khoa.`

Ứng dụng không có scheduler và không tự chạy lịch. Ứng dụng cũng không cung cấp
endpoint lấy chat ID; hãy gửi tin cho bot rồi lấy chat ID bằng quy trình vận hành
của Telegram. Kích hoạt thủ công bằng API:

```bash
curl -X POST http://localhost:3000/telegram/send-health
```

HTTP 200 trả kết quả gửi hoặc `reason: "no_new_articles"`; HTTP 409 nghĩa là
luồng sức khỏe đang chạy; HTTP 503 nghĩa là toàn bộ nguồn sức khỏe đều lỗi.
Gadget và sức khỏe dùng lock, bot/chat, lịch sử và cấu hình độc lập. Volume
`/app/data` trong lệnh Docker phía trên cũng lưu bền vững lịch sử sức khỏe.

### Bản tin giá vàng và chính trị

`POST /telegram/send-gold-politics` là luồng riêng: one price snapshot plus
at most 15 news messages (tối đa 15 tin), trong đó maximum three gold-news
items (tối đa 3 tin vàng). Tin phải nằm trong cửa sổ 72-hour freshness
(72 giờ). URL tin đã gửi được lưu seven-day URL history (7 ngày) tại
`GOLD_POLITICS_HISTORY_PATH`. Triggering is API-only: API chỉ chạy khi được
gọi; ứng dụng không có scheduler và không tự chạy lịch cho endpoint này.

Bot/chat là credential riêng (`GOLD_POLITICS_TELEGRAM_*`), khác tech/gadget/health.
Ứng dụng không cung cấp endpoint lấy chat ID và không thực hiện handshake;
hãy gửi tin cho bot rồi lấy chat ID bằng quy trình vận hành của Telegram.
Missing/placeholder dedicated Telegram credentials (`replace_me`,
`test-gold-politics-*`, hoặc trống) fail before crawling, trước mọi
provider/editorial call, hoặc history mutation.

X and Brave are optional when their keys are empty (`X_BEARER_TOKEN`,
`BRAVE_SEARCH_API_KEY`); direct RSS and Reddit remain available.

```bash
curl -X POST http://localhost:3000/telegram/send-gold-politics
```

Snapshot giá gồm SJC, DOJI, PNJ (buy/sell, đơn vị hiển thị `million VND/tael`)
và XAU/USD (spot, `USD/troy ounce`). Chỉ đổi đơn vị khi nguồn ghi rõ unit.
Quote **stale** (source timestamp già hơn `GOLD_POLITICS_MAX_PRICE_AGE_MINUTES`)
vẫn hiện kèm cảnh báo stale. Quote **unavailable** (parse/unit/timestamp lỗi)
không kèm số. Gold-history failure (`gold-price-history`) suppresses deltas
nhưng vẫn gửi current quotes và đánh `partial: true`.

Endpoint này **sends messages** và incurs provider use. Có **no application-level authentication** và **no rate limiter**. Chỉ expose sau **private network** hoặc authenticated/rate-limited **reverse proxy**. Output is **not investment advice**.

Public Facebook/TikTok/Telegram links are **web-search discoveries**. Private,
login, hoặc CAPTCHA access is not attempted.

Huy hiệu xác minh (đặt trước tiêu đề, kèm source attribution):

- `ĐÃ XÁC NHẬN` — confirmed: hồ sơ chính thức/tòa án/primary evidence.
- `ĐANG ĐƯỢC ĐƯA TIN` — reported: nguồn nhận diện được đưa tin, chưa có kết luận cuối.
- `CHƯA KIỂM CHỨNG` — unverified: rumor/ẩn danh/thiếu corroboration.

Rumors are not facts. V1's live adapters can currently produce only
reported/unverified news; the **confirmed badge** is reserved for a future
vetted **final-record adapter**.

HTTP 200 có thể là full success hoặc **partial** (gửi nội dung còn lại).
`failedSources` chỉ chứa stable source keys, không raw errors. Ví dụ:

```json
{
  "sent": true,
  "channel": "telegram-gold-politics",
  "priceMessageCount": 1,
  "newsMessageCount": 2,
  "collectedCount": 7,
  "eligibleCount": 4,
  "skippedSeenCount": 1,
  "partial": true,
  "failedSources": ["pnj", "xau-usd", "gold-price-history", "x-search", "web-search"],
  "language": "vi"
}
```

HTTP **409** `{ "error": "Gold-politics digest is already running" }` nghĩa là
in-process lock: một lượt gold-politics đang chạy. **409 is not rate limiting.**
HTTP **503** `{ "error": "All gold-politics sources failed" }` khi mọi price
provider và mọi news source đều lỗi — không gửi gì.

Sent-history read **fails closed** before sending (không gửi khi không đọc được
lịch sử). Persistent sentinel `${GOLD_POLITICS_HISTORY_PATH}.blocked` prevents
later requests from silently reopening after quarantine. A mark failure after
Telegram acceptance creates **at-least-once** retry semantics (tin đã nhận trên
Telegram có thể được gửi lại vì URL chưa được mark).

Operator recovery cho sent history:

1. Stop/serialize triggers (đừng gọi endpoint song song).
2. Inspect the `.corrupt-*` file cạnh JSON lịch sử.
3. Repair or replace the versioned JSON atomically.
4. Verify ownership/permissions trên file và thư mục `data/`.
5. Deliberately remove the `.blocked` sentinel.

Merely recreating the JSON while the sentinel exists must not resume sending.
Volume `/app/data` cũng lưu `data/gold-politics-sent-history.json` và
`data/gold-price-history.json`.

Gửi tin tuyển dụng Việt Nam (TopCV, ITviec, VietnamWorks) — **gom 1 PDF gửi email** (không Telegram):

```bash
curl -X POST 'http://localhost:3000/telegram/send-jobs?role=devops'
curl -X POST 'http://localhost:3000/telegram/send-jobs?role=devops&experienceYears=2-5&limit=25'
curl -X POST 'http://localhost:3000/telegram/send-jobs?role=english-teacher&experienceYears=1-2'
```

- `role` (bắt buộc): `english-teacher` | `devops`
- `experienceYears` (tuỳ chọn): `0` | `1-2` | `2-5` | `3-5` | `5+`
- `limit` (tuỳ chọn): số tin trong PDF (1–100). Mặc định = `50` với `english-teacher`, `MAX_JOBS_PER_DIGEST` với `devops`
- Response:
  - `channel`: `"email"`
  - `crawledCounts`: số job thô từng board (chưa lọc)
  - `boardCounts`: số còn lại sau lọc role / Hà Nội / kinh nghiệm
  - `matchedCount`: tổng hợp lệ sau lọc + dedupe (trước `limit`)
  - `articleCount`: số tin trong PDF / đã gửi mail
  - `pdfFileName`, `mailTo`
- Địa điểm mặc định: **Hà Nội**
- PDF gồm: mô tả, kỹ năng, lương, địa điểm, nguồn, link
- **Email SMTP** (bắt buộc để gửi):
  ```bash
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_SECURE=false
  SMTP_USER=you@gmail.com
  SMTP_PASS=app-password
  MAIL_FROM=you@gmail.com
  MAIL_TO=you@gmail.com
  ```
- **TopCV**: bị Cloudflare chặn khi gọi trực tiếp. Bật bằng FlareSolverr:
  ```bash
  docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest
  # .env
  FLARESOLVERR_URL=http://127.0.0.1:8191/v1
  ```
  Không cấu hình `FLARESOLVERR_URL` → `crawledCounts.topcv` / `boardCounts.topcv` = 0; ITviec + VietnamWorks vẫn chạy.

Kiểm tra build/test:

```bash
npm test
npm run build
```

## GitOps Deployment

Mỗi lần `main` build thành công, workflow `.github/workflows/docker-publish.yml`:

1. Push image `brucewayne2610/tech-news-telegram:<full-git-sha>` lên Docker Hub.
2. Checkout repo `namdz608/helm-chart`.
3. Cập nhật `tech-news-telegram/values.yaml` để `image.tag` bằng đúng Git SHA vừa build.
4. Commit và push desired state mới; Argo CD phát hiện commit và tự sync vào Kubernetes.

Repository source cần GitHub Actions secret `GITOPS_REPO_TOKEN`. Nên dùng fine-grained
personal access token hoặc GitHub App token chỉ có quyền **Contents: Read and write**
trên repo `namdz608/helm-chart`. Không cấp token quyền truy cập Kubernetes hoặc Argo CD.

Tag `latest` vẫn được publish để tiện tra cứu, nhưng workload GitOps luôn deploy bằng
tag Git SHA bất biến. Push tag release `v*` chỉ publish các tag SemVer và không tự đổi
desired state đang chạy.
