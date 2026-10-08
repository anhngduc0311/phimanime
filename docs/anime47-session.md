# Dùng phiên Anime47 của bạn

Máy chủ hỗ trợ access token của phiên Anime47, qua biến `ANIME47_ACCESS_TOKEN` trong `.env` ở thư mục gốc. Token chỉ gửi đến `https://anime47.love/api`; không đưa vào mã frontend hay phản hồi API.

1. Trong Chrome/Edge đã đăng nhập Anime47, mở DevTools (F12), chọn **Network**, rồi mở một tập phim.
2. Chọn request đến `anime47.love/api/anime/watch/episode/...` (hoặc `/anime/.../episodes`). Trong **Request Headers**, tìm `Authorization: Bearer ...`.
3. Sao chép phần sau `Bearer ` và lưu trực tiếp vào `D:\phimanime\.env`:

   ```dotenv
   ANIME47_ACCESS_TOKEN=token_cua_ban
   ```

4. Khởi động lại máy chủ. Nếu chạy `node --watch`, lưu thay đổi mã có thể kích hoạt khởi động lại, nhưng thay đổi `.env` riêng cần tự khởi động lại.

Không gửi token qua chat, không commit `.env`. Khi phiên hết hạn, lấy token mới theo các bước trên; xóa dòng cấu hình khi muốn ngừng dùng phiên.

Sau khi có token thật, cần kiểm tra lại phim và việc phát video. Danh sách tập dùng cấu trúc `teams[].groups[].episodes[]`; nguồn HLS lấy từ API xem tập. Nguồn nhúng ngoài danh sách hỗ trợ sẽ báo chưa tương thích. Phụ đề rời vẫn phụ thuộc định dạng và CORS của nguồn.

Máy chủ tải HLS qua các đường dẫn media có mã ngẫu nhiên để trình duyệt local tránh lỗi CORS. Chỉ cho phép các host video đã kiểm tra (`pl.vlogphim.net`, `cdn1` đến `cdn7.nonprofit.asia`), không chuyển token tài khoản đến CDN. Playlist con và phân đoạn dùng cùng đường dẫn local; lớp PNG bọc MPEG-TS được bỏ trước khi trả video cho trình phát.

## Deploy lên anidoki.com

Đặt `ANIME47_ACCESS_TOKEN` vào `.env` trên VPS, rồi chạy `docker compose up -d --build server web`. Docker Compose truyền token vào backend; image không chứa `.env` hay token. Nginx đã chuyển `/api/` tới backend, bao gồm các đường tải media.

Khi thay token, chạy `docker compose up -d --force-recreate server` để nạp giá trị mới. Token không tự gia hạn. Cần kiểm tra phát phim thực tế trên VPS vì Anime47 hoặc CDN có thể áp dụng hạn chế IP/phiên khác máy local. Mọi người xem nguồn này trên website đều dùng phiên cấu hình ở backend, và dữ liệu video đi qua băng thông VPS.
