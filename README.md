# Animeweb — Turborepo Monorepo

Dự án anime web được tổ chức dưới dạng Monorepo sử dụng **Turborepo** và **npm workspaces**.

## Cấu trúc thư mục (Monorepo Layout)

```
animeweb/
├── apps/
│   ├── web/               # Frontend (Vite + Vanilla JS + CSS)
│   │   ├── src/
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.js
│   │   └── package.json
│   │
│   └── server/            # Backend (Node.js Express API + KKPhim + PostgreSQL)
│       ├── db/
│       ├── server.js
│       ├── kkphim.js
│       ├── *.test.js
│       └── package.json
│
├── .env                   # Biến môi trường chung (PostgreSQL, Port, ...)
├── turbo.json             # Cấu hình Turborepo pipeline
└── package.json           # Root package.json & workspaces config
```

---

## Hướng dẫn cài đặt & Chạy dự án

### 1. Cài đặt dependencies
```bash
npm install
```

### 2. Chạy môi trường phát triển (Dev)
- Chạy toàn bộ hệ thống (cả Web frontend và Server API song song qua Turborepo):
  ```bash
  npm run dev
  # hoặc
  npx turbo dev
  ```
- Chỉ chạy Web Frontend:
  ```bash
  npm run dev:web
  ```
- Chỉ chạy Backend Server:
  ```bash
  npm run dev:server
  ```

### 3. Build & Test
- Build toàn bộ dự án (có caching siêu tốc với Turborepo):
  ```bash
  npm run build
  ```
- Chạy bộ kiểm thử (Tests):
  ```bash
  npm run test
  ```

---

## Chi tiết kỹ thuật & Tính năng

### Mã hoá HTML giao diện khi build

`npm run build` tự động mã hoá phần thân trang bằng Base64 UTF-8. Bản `dist/index.html` chứa chuỗi mã hoá và đoạn khôi phục giao diện trước khi ứng dụng khởi chạy; các thẻ SEO và bundle JS/CSS vẫn ở phần head. Môi trường dev giữ HTML bình thường để chỉnh sửa.

Đây là cách làm rối mã, không phải mã hoá bảo mật: trình duyệt có thể giải mã và người dùng vẫn xem được DOM trong Elements. Nội dung giao diện cần JavaScript để hiển thị; công cụ chỉ đọc HTML thô sẽ không thấy các liên kết và nội dung trong body. Không đặt mật khẩu hoặc dữ liệu bí mật trong HTML này.

### Tự làm mới phiên Anime47

Đặt `ANIME47_REFRESH_TOKEN` trong `.env` từ Local Storage của phiên Anime47 đang đăng nhập. `ANIME47_ACCESS_TOKEN` là tùy chọn khi có refresh token. Máy chủ gọi `POST https://anime47.love/api/auth/refresh-token` trước khi access token hết hạn một phút, hoặc thử làm mới và gửi lại đúng một lần khi API trả 401. Các yêu cầu đồng thời dùng chung một lần làm mới.

Docker lưu access token và refresh token được xoay vòng trong volume `anidoki_anime47_session`, để khởi động lại container không quay về token cũ. Giữ volume này khi cập nhật máy chủ. Khi đổi token cấu hình trong `.env`, phiên lưu cũ được bỏ qua. Với môi trường local, đặt `ANIME47_SESSION_FILE` trỏ tới một file trong thư mục riêng không commit, ví dụ `D:/phimanime/scratch/anime47/session.json`.

Sau khi cập nhật mã nguồn và `.env` trên VPS:

```bash
docker compose up -d --build --no-deps --force-recreate server
docker compose exec server node scripts/diagnoseAnime47.js 11322
```

Nếu refresh token bị thu hồi hoặc hết hạn, cần đăng nhập Anime47 và cập nhật token mới. Không đưa các token vào mã frontend, Git hay log.

### Tách tài nguyên sang static.anidoki.com

Nginx đã có host riêng `static.anidoki.com` phục vụ cùng thư mục `dist`, có CORS cho JS modules và trả 404 cho trang HTML/API. Trong DevTools, JS/CSS và tài nguyên tĩnh sẽ nằm dưới host này; các trang và API vẫn dùng `anidoki.com`. Đây là cách phân phối tài nguyên, không phải cơ chế giấu mã frontend.

1. Tạo DNS A/AAAA cho `static.anidoki.com` trỏ về máy chủ web (hoặc CNAME phù hợp với CDN đang dùng).
2. Bật HTTPS cho subdomain ở reverse proxy/CDN. Nếu dùng Cloudflare, dùng chứng chỉ origin bao gồm subdomain và Full (strict); cấu hình Nginx trong container chỉ lắng nghe HTTP cổng 80.
3. Kiểm tra `https://static.anidoki.com/startup-loader.js` và `https://static.anidoki.com/favicon.svg` trả 200 qua HTTPS.
4. Thêm `WEB_ASSET_BASE=https://static.anidoki.com/` vào `.env` ở thư mục gốc trên server, rồi chạy `docker compose up -d --build web`.
5. Mở DevTools trước khi tải lại trang và kiểm tra JS/CSS tải từ `static.anidoki.com` không có lỗi CORS.

Nếu build trực tiếp, đặt biến môi trường `WEB_ASSET_BASE=https://static.anidoki.com/` khi chạy `npm run build`. Biến này được ghi vào bản build; đổi giá trị cần build lại. Mặc định `/` giữ tài nguyên cùng host để web hoạt động trước khi subdomain sẵn sàng. Để quay lại cùng host, đặt `WEB_ASSET_BASE=/` và build lại. API, đường dẫn trang, canonical URL và Google OAuth vẫn dùng tên miền chính.

- **Frontend (`apps/web`)**: Chạy tại `http://localhost:5173`, tích hợp proxy tự động `/api` sang backend `http://localhost:3000`.
- **Backend API (`apps/server`)**: Cung cấp dữ liệu anime qua KKPhim API (`https://phimapi.com`), quản lý watchlist và watch history bằng PostgreSQL.
- **Turborepo Pipelines (`turbo.json`)**: Tối ưu hóa build cache, song song hóa dev/build/test pipelines.


sudo apt update && sudo apt install -y git && sudo apt install nano -y
