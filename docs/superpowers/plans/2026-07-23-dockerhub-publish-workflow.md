# Docker Hub Publish Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tự động build image đa kiến trúc của `tech-news-telegram` và đẩy các tag quy định lên `brucewayne2610/tech-news-telegram` trên Docker Hub.

**Architecture:** Một GitHub Actions workflow duy nhất phản ứng với push vào `main`, push tag `v*`, hoặc chạy thủ công trên `main`. Workflow dùng các official Docker actions để thiết lập QEMU/Buildx, đăng nhập bằng repository secrets, sinh tag, dùng GitHub Actions cache, rồi build và push một manifest đa kiến trúc.

**Tech Stack:** GitHub Actions, Docker Buildx, QEMU, Docker Hub, GitHub CLI, actionlint

---

## Cấu trúc file

- Create: `.github/workflows/docker-publish.yml` — định nghĩa trigger, quyền, tag metadata, build cache và việc push image.
- Existing: `Dockerfile` — đầu vào build; không chỉnh sửa.
- Existing: `docs/superpowers/specs/2026-07-23-dockerhub-publish-workflow-design.md` — đặc tả đã duyệt; không chỉnh sửa.

### Task 1: Tạo và kiểm tra workflow

**Files:**
- Create: `.github/workflows/docker-publish.yml`

- [ ] **Step 1: Chạy kiểm tra khi workflow chưa tồn tại**

Run:

```bash
test -f .github/workflows/docker-publish.yml
```

Expected: FAIL với exit code `1` vì workflow chưa được tạo.

- [ ] **Step 2: Tạo workflow tối thiểu hoàn chỉnh**

Tạo `.github/workflows/docker-publish.yml` với nội dung chính xác:

```yaml
name: Publish Docker image

on:
  push:
    branches:
      - main
    tags:
      - 'v*'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  publish:
    if: github.event_name != 'workflow_dispatch' || github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest

    steps:
      - name: Check out repository
        uses: actions/checkout@v6

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v4

      - name: Log in to Docker Hub
        uses: docker/login-action@v4
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Extract Docker metadata
        id: meta
        uses: docker/metadata-action@v6
        with:
          images: brucewayne2610/tech-news-telegram
          tags: |
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}
            type=semver,pattern={{raw}}
            type=semver,pattern={{major}}.{{minor}}
            type=semver,pattern={{major}}

      - name: Build and push Docker image
        uses: docker/build-push-action@v7
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 3: Kiểm tra cú pháp và semantics của GitHub Actions**

Run:

```bash
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest
```

Expected: exit code `0`, không có diagnostic.

- [ ] **Step 4: Build Dockerfile cục bộ**

Run:

```bash
docker build --tag tech-news-telegram:workflow-test .
```

Expected: exit code `0`, kết thúc bằng việc tạo image `tech-news-telegram:workflow-test`.

- [ ] **Step 5: Kiểm tra thay đổi và commit workflow**

Run:

```bash
git diff --check -- .github/workflows/docker-publish.yml
git add .github/workflows/docker-publish.yml
git commit -m "ci: publish Docker image to Docker Hub"
```

Expected: `git diff --check` không có output và commit chỉ chứa workflow mới.

### Task 2: Cấu hình GitHub repository secrets

**Files:**
- Không tạo hoặc chỉnh sửa file; secrets được lưu mã hóa trong GitHub repository settings.

- [ ] **Step 1: Chuyển GitHub CLI sang tài khoản có quyền quản trị repo**

Run:

```bash
gh auth switch --hostname github.com --user namdz608
gh repo view namdz608/tech-news-telegram --json viewerPermission --jq .viewerPermission
```

Expected: output là `ADMIN` hoặc `MAINTAIN`.

- [ ] **Step 2: Tạo secret username**

Run:

```bash
printf '%s' 'brucewayne2610' | gh secret set DOCKER_USERNAME --repo namdz608/tech-news-telegram
```

Expected: exit code `0`, giá trị không được in lại.

- [ ] **Step 3: Tạo secret password từ prompt ẩn**

Run:

```bash
gh secret set DOCKER_PASSWORD --repo namdz608/tech-news-telegram
```

Nhập credential Docker Hub mà bố đã cung cấp qua standard input, rồi kết thúc input. Expected: exit code `0`, credential không xuất hiện trong command, file hoặc output.

- [ ] **Step 4: Xác nhận tên hai secrets**

Run:

```bash
gh secret list --repo namdz608/tech-news-telegram
```

Expected: danh sách có `DOCKER_USERNAME` và `DOCKER_PASSWORD`; GitHub không trả về giá trị secrets.

### Task 3: Đẩy workflow và xác nhận phát hành

**Files:**
- Không tạo hoặc chỉnh sửa file.

- [ ] **Step 1: Đẩy các commit của nhánh `main` lên origin**

Run:

```bash
git push origin main
```

Expected: push thành công và tạo một workflow run cho commit mới nhất.

- [ ] **Step 2: Theo dõi workflow run tới khi kết thúc**

Run:

```bash
gh run list --repo namdz608/tech-news-telegram --workflow docker-publish.yml --limit 1
gh run watch --repo namdz608/tech-news-telegram "$(gh run list --repo namdz608/tech-news-telegram --workflow docker-publish.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

Expected: run kết thúc với trạng thái `success`.

- [ ] **Step 3: Kiểm tra manifest đa kiến trúc trên Docker Hub**

Run:

```bash
docker buildx imagetools inspect brucewayne2610/tech-news-telegram:latest
```

Expected: manifest có platform `linux/amd64` và `linux/arm64`.

- [ ] **Step 4: Kiểm tra trạng thái cuối cùng**

Run:

```bash
git status --short
git log -3 --oneline
```

Expected: workflow và tài liệu đã được commit; chỉ còn các thay đổi có sẵn từ trước của bố nếu có.

