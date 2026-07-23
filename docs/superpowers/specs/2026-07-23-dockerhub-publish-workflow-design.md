# Thiết kế workflow phát hành Docker Hub

## Mục tiêu

Tự động build Docker image của ứng dụng `tech-news-telegram` và đẩy lên Docker Hub repository `brucewayne2610/tech-news-telegram`. Thông tin đăng nhập chỉ được lưu trong GitHub Actions repository secrets.

## Phạm vi

- Thêm workflow `.github/workflows/docker-publish.yml`.
- Tạo repository secrets `DOCKER_USERNAME` và `DOCKER_PASSWORD` trên repository GitHub hiện tại.
- Không thay đổi mã nguồn ứng dụng hoặc `Dockerfile` hiện có.

## Sự kiện kích hoạt

Workflow chạy trong ba trường hợp:

- Push vào nhánh `main`.
- Push Git tag khớp mẫu `v*`, ví dụ `v1.2.3`.
- Chạy thủ công bằng `workflow_dispatch`.

## Luồng xử lý

Một job trên Ubuntu sẽ checkout source, cài QEMU và Docker Buildx, đăng nhập Docker Hub bằng secrets, sinh metadata/tag, sau đó build và push image cho hai nền tảng `linux/amd64` và `linux/arm64`.

Build cache dùng GitHub Actions cache backend để các lần build sau nhanh hơn. Mật khẩu được truyền trực tiếp từ secrets vào action đăng nhập và không được ghi vào repository hoặc output thông thường.

## Quy tắc gắn tag

- Push `main`: gắn tag `latest`.
- Push tag `v1.2.3`: gắn các tag `v1.2.3`, `1.2` và `1`.
- Chạy thủ công trên `main`: gắn tag `latest`.

Tên image cố định là `brucewayne2610/tech-news-telegram`.

## Quyền và secrets

Workflow chỉ cần quyền đọc nội dung repository. Hai repository secrets được tạo bằng GitHub CLI:

- `DOCKER_USERNAME`: tài khoản Docker Hub.
- `DOCKER_PASSWORD`: mật khẩu hoặc access token Docker Hub.

Giá trị secret không xuất hiện trong workflow. Việc tạo secrets cần tài khoản GitHub có quyền quản trị repository `namdz608/tech-news-telegram`.

## Xử lý lỗi

Workflow dừng ngay nếu checkout, thiết lập builder, đăng nhập, build hoặc push thất bại. Không phát hành manifest/tag nếu build đa kiến trúc không hoàn tất.

## Kiểm chứng

- Kiểm tra cú pháp YAML và cấu trúc GitHub Actions workflow.
- Chạy Docker build cục bộ cho Dockerfile hiện tại.
- Kiểm tra hai secret tồn tại trên GitHub mà không đọc lại giá trị.
- Sau khi workflow được đẩy lên GitHub, xác nhận run thành công và image/tag xuất hiện trên Docker Hub.

