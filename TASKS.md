# Kế hoạch hoàn thiện AniDoki

Cập nhật: 04/10/2026.

Checklist dựa trên code hiện tại. Các mục chưa đánh dấu là công việc cần triển khai hoặc hoàn thiện, không có nghĩa chức năng tương ứng hoàn toàn chưa tồn tại.

## Quy ước ưu tiên

- **P0:** Nền tảng cần hoàn thiện trước khi dùng dữ liệu cá nhân và mở trang quản trị.
- **P1:** Luồng sử dụng và vận hành cốt lõi.
- **P2:** Hoàn thiện trải nghiệm và công cụ quản lý.
- **P3:** Mở rộng sau khi các luồng chính ổn định.

## Hiện trạng

- Đã có trang chủ, danh sách phim theo thể loại, tìm kiếm, chi tiết phim và các mùa, trình phát, xem sau, tiếp tục xem và giao diện đăng nhập Google.
- Chi tiết phim, trình phát, tìm kiếm và xem sau chủ yếu mở bằng popup; chưa có hệ thống trang với URL riêng cho phim và tập.
- Chưa có giao diện quản trị riêng.
- API đang dùng bảng `kk_watchlist` và `kk_history` chung, chưa tách dữ liệu theo người dùng.
- Lịch sử hiện lưu tập phim, chưa lưu tiến độ xem thực tế.
- Token phiên hiện là chuỗi sinh từ thời gian; còn endpoint đăng nhập giả lập và thông tin người dùng cố định. Cần hoàn thiện xác thực và phân quyền phía server.
- Nội dung lấy từ nguồn ngoài; ưu tiên đồng bộ, sửa thông tin và ẩn/hiện phim, chưa đưa upload video vào phạm vi ban đầu.

## Giai đoạn 1 — Xác thực và dữ liệu cá nhân [P0]

### Đăng nhập và phiên làm việc

- [x] Hoàn thiện xác minh đăng nhập Google, bao gồm kiểm tra token hợp lệ và dành cho ứng dụng.
- [x] Lưu hoặc cập nhật tài khoản Google vào cơ sở dữ liệu.
- [x] Thay token giả lập bằng phiên xác thực có thể kiểm chứng, có thời hạn và cơ chế đăng xuất.
- [x] Loại bỏ luồng đăng nhập thành công bằng dữ liệu giả khi Google SDK chưa tải.
- [x] Đổi `/api/auth/me` để trả về người dùng của phiên hiện tại.
- [x] Khôi phục trạng thái đăng nhập từ phiên được server xác minh.
- [x] Xử lý phiên hết hạn, đăng nhập thất bại và trạng thái chưa đăng nhập trên giao diện.

### Phân quyền

- [x] Thêm vai trò `user` và `admin`; chỉ bổ sung vai trò khác khi có nhu cầu cụ thể.
- [x] Thiết lập cách cấp tài khoản admin đầu tiên có kiểm soát.
- [x] Bảo vệ toàn bộ API quản trị bằng kiểm tra quyền phía server.
- [x] Chặn truy cập giao diện quản trị khi chưa đăng nhập hoặc không đủ quyền.

### Watchlist và lịch sử

- [x] Bổ sung `user_id` và khóa duy nhất theo người dùng/phim cho các bảng đang được API sử dụng.
- [x] Chuẩn bị migration; xác định cách xử lý dữ liệu dùng chung cũ, không tự gán cho một người dùng bất kỳ.
- [x] Lấy danh tính từ phiên xác thực khi đọc hoặc ghi dữ liệu cá nhân.
- [x] Lưu tập, thời điểm đang xem, thời lượng và thời gian cập nhật lịch sử.
- [x] Gửi tiến độ định kỳ và khi tạm dừng hoặc đóng trình phát nếu nguồn phát hỗ trợ.
- [x] Với nguồn iframe không cung cấp tiến độ, chỉ hiển thị khả năng tiếp tục ở tập đã xem.
- [x] Làm mới hoặc xóa dữ liệu cá nhân trên giao diện khi đăng nhập, đăng xuất hoặc đổi tài khoản.

**Điều kiện hoàn thành:** Hai tài khoản có thư viện/lịch sử độc lập; phiên hết hạn không truy cập được dữ liệu cá nhân; user thường không gọi được API admin.


## Giai đoạn 2 — Các màn user cốt lõi [P1]

Các URL dưới đây là đề xuất, có thể điều chỉnh khi triển khai routing.

### Routing và điều hướng

- [x] Thiết lập routing cho các trang user và admin.
- [x] Hỗ trợ mở trực tiếp URL, tải lại trang, nút Back/Forward của trình duyệt.
- [x] Cấu hình server phục vụ đúng trang khi truy cập URL con.
- [x] Thêm trang không tìm thấy và trạng thái nội dung không còn khả dụng.

### Khám phá phim — `/browse`

- [x] Tách danh sách phim thành trang riêng, tái sử dụng thẻ phim hiện tại.
- [x] Bổ sung tìm kiếm, lọc thể loại, năm và trạng thái theo dữ liệu nguồn hỗ trợ.
- [x] Bổ sung sắp xếp và phân trang hoặc tải thêm.
- [x] Lưu từ khóa, bộ lọc và trang hiện tại trên URL.
- [x] Liên kết các nút “Xem tất cả” trên trang chủ đến danh sách tương ứng.
- [x] Hiển thị trạng thái đang tải, không có kết quả, lỗi và thử lại.

### Chi tiết phim — `/anime/:slug`

- [x] Chuyển nội dung popup hiện tại thành trang có URL riêng.
- [x] Giữ thông tin phim, ảnh, nội dung, các mùa và danh sách tập.
- [x] Hoàn thiện thao tác xem ngay, tiếp tục xem và thêm/bỏ xem sau.
- [x] Sửa nút chia sẻ để sao chép đúng URL phim.
- [x] Hoàn thiện nội dung liên quan hoặc ẩn phần chưa có dữ liệu.
- [x] Chỉ hiển thị đếm ngược tập mới khi có dữ liệu lịch phát hợp lệ.

### Xem phim — `/watch/:slug/:episode`

- [x] Chuyển trình phát hiện tại thành trang có URL riêng cho từng tập.
- [x] Hiển thị tập đang xem, danh sách tập, chuyển tập trước/sau và quay về chi tiết phim.
- [x] Cho phép đổi nguồn phát và ngôn ngữ khi có lựa chọn hợp lệ.
- [x] Khôi phục tiến độ xem với nguồn hỗ trợ.
- [x] Hoàn thiện tự chuyển tập với nguồn hỗ trợ sự kiện kết thúc video.
- [x] Thêm trạng thái tải video, tập không tồn tại, nguồn lỗi và thử lại.
- [x] Thêm hộp thoại báo lỗi, tự điền phim, tập và nguồn đang phát.

### Thư viện cá nhân — `/library`

- [x] Nâng cấp xem sau hiện tại thành trang thư viện.
- [x] Thêm các tab xem sau, đang xem và đã hoàn thành.
- [x] Bổ sung mô hình dữ liệu và API cho trạng thái theo dõi phim.
- [x] Cho phép đổi trạng thái, bỏ lưu và tìm kiếm trong thư viện.
- [x] Hiển thị yêu cầu đăng nhập hoặc trạng thái thư viện trống phù hợp.

### Lịch sử xem — `/history`

- [x] Hiển thị lịch sử theo lần xem gần nhất, có phân trang hoặc tải thêm.
- [x] Hiển thị tập đã xem và tiến độ thực tế nếu có.
- [x] Cho phép tiếp tục xem, xóa từng phim và xóa toàn bộ lịch sử.
- [x] Yêu cầu xác nhận trước khi xóa toàn bộ lịch sử.
- [x] Đồng bộ thay đổi với khu vực “Tiếp tục xem” trên trang chủ.

**Điều kiện hoàn thành:** Có thể tìm phim → mở chi tiết → xem tập → lưu thư viện → quay lại tiếp tục xem; URL phim/tập hoạt động khi mở trực tiếp và tải lại. (Đã hoàn thành và kiểm thử tự động đạt 10/10).

## Giai đoạn 3 — Admin phục vụ vận hành [P1]

### Khung quản trị — `/admin`

- [x] Xây layout sidebar, thanh tiêu đề và điều hướng quản trị.
- [x] Dùng phiên đăng nhập hiện có và kiểm tra quyền admin.
- [x] Hiển thị trạng thái không có quyền, hết phiên và lỗi tải dữ liệu.

### Tổng quan — `/admin/dashboard`

- [x] Hiển thị số phim/tập hệ thống đang quản lý hoặc đã đồng bộ, ghi rõ phạm vi số liệu.
- [x] Hiển thị phim/tập mới cập nhật và số báo lỗi chưa xử lý.
- [x] Hiển thị trạng thái nguồn dữ liệu và lần đồng bộ gần nhất.
- [x] Dùng số liệu thực; bổ sung API thống kê cần thiết.

### Quản lý phim — `/admin/anime`

- [x] Xây danh sách có tìm kiếm, lọc và phân trang.
- [x] Xây màn chỉnh tên, mô tả, ảnh, thể loại và trạng thái phim.
- [x] Cho phép ẩn/hiện phim trên website.
- [x] Quản lý liên kết các mùa và sửa trường hợp gộp nhầm phim.
- [x] Lưu riêng chỉnh sửa của admin để đồng bộ nguồn không tự ghi đè.
- [x] Áp dụng thông tin chỉnh sửa và trạng thái ẩn/hiện vào API phía user.

### Quản lý tập và nguồn phát — `/admin/anime/:slug/episodes`

- [x] Hiển thị danh sách tập, nguồn phát và ngôn ngữ/phụ đề.
- [x] Cho phép kiểm tra, sửa liên kết sai và ẩn tập hoặc nguồn lỗi.
- [x] Hiển thị kết quả kiểm tra nguồn với thời gian kiểm tra.
- [x] Kiểm tra dữ liệu đầu vào trước khi lưu thay đổi.

### Nguồn dữ liệu và đồng bộ — `/admin/sync`

- [x] Theo dõi cấu hình nguồn hiện có, lần chạy gần nhất và kết quả đồng bộ.
- [x] Cho phép cập nhật một phim hoặc chạy tác vụ đồng bộ có giới hạn.
- [x] Hiển thị tiến độ, số mục thành công/thất bại và nguyên nhân lỗi.
- [x] Cho phép chạy lại tác vụ lỗi; ngăn tạo tác vụ trùng đang chạy.
- [x] Giữ chỉnh sửa thủ công của admin trong quá trình đồng bộ.

### Báo lỗi — `/admin/reports`

- [x] Tạo dữ liệu và API tiếp nhận báo lỗi từ trình phát.
- [x] Giới hạn tần suất gửi báo lỗi để tránh spam.
- [x] Xây danh sách lọc theo phim, tập, loại lỗi và trạng thái.
- [x] Hiển thị nội dung báo lỗi, nguồn phát và thời gian gửi.
- [x] Cho phép chuyển trạng thái mới → đang xử lý → đã xử lý hoặc đóng.
- [x] Lưu ghi chú xử lý nội bộ.

**Điều kiện hoàn thành:** Admin có thể tìm phim, sửa thông tin, kiểm tra tập lỗi, cập nhật nguồn và xử lý báo lỗi; thay đổi hiển thị đúng ở phía user. (Đã hoàn thành và kiểm thử tự động đạt 14/14 tests).

## Giai đoạn 4 — Hoàn thiện user và admin [P2]

### User: Tài khoản và cài đặt — `/account`

- [x] Hiển thị thông tin tài khoản và phương thức đăng nhập.
- [x] Cho phép chỉnh tên hiển thị và avatar nếu hỗ trợ hồ sơ riêng.
- [x] Lưu tùy chọn phát phim và tự chuyển tập.
- [x] Bổ sung quản lý phiên và đăng xuất các phiên khác nếu có hỗ trợ phía server.
- [x] Chưa cần đăng ký hoặc quên mật khẩu nếu chỉ dùng Google.

### User: Trợ giúp và liên hệ — `/help`

- [x] Viết hướng dẫn xử lý các lỗi phát phổ biến.
- [x] Bổ sung biểu mẫu phản hồi và thông báo gửi thành công/thất bại.
- [x] Thiết lập nơi tiếp nhận phản hồi trong quản trị.

### Admin: Trang chủ — `/admin/homepage`

- [x] Cho phép chọn phim nổi bật và banner.
- [x] Cho phép sắp xếp hoặc ẩn/hiện các khu vực trang chủ.
- [x] Có xem trước trước khi áp dụng thay đổi.

### Admin: Người dùng — `/admin/users`

- [x] Xây danh sách và chi tiết người dùng, có tìm kiếm và phân trang.
- [x] Cho phép khóa/mở khóa tài khoản và thực thi trạng thái khóa ở server.
- [x] Cho phép cấp/thu hồi quyền quản trị với kiểm tra quyền phù hợp.
- [x] Ngăn thao tác làm hệ thống không còn admin hoạt động.

### Admin: Cài đặt và nhật ký — `/admin/settings`, `/admin/audit-logs`

- [x] Quản lý tên website, logo và thông tin liên hệ.
- [x] Ghi nhật ký thao tác quản trị ngay khi xây các API thay đổi dữ liệu ở giai đoạn 3.
- [x] Xây màn tra cứu ai thực hiện, thao tác gì, đối tượng nào và thời gian thực hiện.
- [x] Không hiển thị hoặc ghi log token, mật khẩu và bí mật cấu hình.

**Điều kiện hoàn thành:** Hoàn thiện đầy đủ trang cá nhân & tùy chọn trình phát, trung tâm trợ giúp FAQ, phản hồi người dùng, cấu hình trang chủ spotlight/sections, quản trị người dùng (tìm kiếm, phân quyền RBAC, ban/unban + ràng buộc an toàn), cài đặt hệ thống và nhật ký kiểm toán (Audit Logs); kiểm thử tự động đạt 18/18 tests.

## Giai đoạn 5 — Mở rộng có điều kiện [P3]

### Lịch phát sóng — `/schedule`

- [ ] Xác định nguồn lịch phát đáng tin cậy trước khi triển khai.
- [ ] Hiển thị lịch theo ngày/tuần và múi giờ phù hợp.
- [ ] Phân biệt lịch phát dự kiến với tập thực tế đã có trên website.

### Thông báo — `/notifications`

- [ ] Thông báo khi phim đang theo dõi có tập mới.
- [ ] Thông báo kết quả xử lý báo lỗi cho người gửi đã đăng nhập.
- [ ] Hỗ trợ đã đọc/chưa đọc và tùy chọn nhận thông báo.
- [ ] Chống gửi trùng thông báo khi chạy lại đồng bộ.

### Bình luận và đánh giá

- [ ] Bổ sung bình luận/đánh giá trong trang chi tiết phim khi quyết định triển khai tính năng cộng đồng.
- [ ] Thêm báo cáo bình luận và giới hạn tần suất gửi.
- [ ] Xây màn kiểm duyệt `/admin/comments` cùng thời điểm mở bình luận.
- [ ] Hỗ trợ ẩn/xóa nội dung vi phạm và lưu nhật ký kiểm duyệt.

## Kiểm tra nghiệm thu

- [ ] Kiểm thử xác thực: token sai/hết hạn, đăng xuất, tài khoản bị khóa và truy cập trái quyền.
- [ ] Kiểm thử dữ liệu riêng của ít nhất hai user trên watchlist, lịch sử và thư viện.
- [ ] Kiểm thử migration trên dữ liệu mẫu hiện có trước khi áp dụng thực tế.
- [ ] Kiểm thử URL trực tiếp, tải lại trang và Back/Forward.
- [ ] Kiểm tra phát video, đổi nguồn, chuyển tập và tiếp tục xem theo khả năng từng nguồn phát.
- [ ] Kiểm thử sửa thông tin phim rồi đồng bộ lại để bảo đảm chỉnh sửa được giữ.
- [ ] Kiểm tra luồng báo lỗi từ user đến admin.
- [ ] Kiểm tra giao diện desktop/mobile, điều hướng bàn phím và nhãn của nút/biểu mẫu.
- [ ] Kiểm tra trạng thái đang tải, dữ liệu rỗng, mất kết nối và lỗi API trên từng màn mới.
- [ ] Chạy các bài kiểm thử phù hợp và build dự án trước khi bàn giao từng giai đoạn.

## Thứ tự triển khai đề xuất

1. Xác thực, phân quyền và tách dữ liệu người dùng.
2. Routing, trang chi tiết và trang xem phim có URL riêng.
3. Khám phá, thư viện và lịch sử xem.
4. Admin quản lý phim, tập, đồng bộ và báo lỗi.
5. Tài khoản, trợ giúp, quản lý trang chủ, người dùng và nhật ký.
6. Lịch phát sóng, thông báo, bình luận khi có đủ dữ liệu và nhu cầu.
