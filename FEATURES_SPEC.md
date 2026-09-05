# ĐẶC TẢ CHI TIẾT TÍNH NĂNG HỆ THỐNG (FEATURES SPECIFICATION)
> **Dự án:** ORD Studio — Order & Stock OS  
> **Phiên bản:** 2.0 (Build: 2026-09-05)  

---

> [!CAUTION]
> ## 🚨 YÊU CẦU TỐI CAO DÀNH CHO TẤT CẢ AI & LẬP TRÌNH VIÊN (SUPREME DIRECTIVE)
> **BẤT KỲ KHI NÀO BẠN THỰC HIỆN BẤT CỨ SỬA ĐỔI, THÊM TÍNH NĂNG, TỐI ƯU GIAO DIỆN HOẶC SỬA LỖI (BUG FIX) TRONG SOURCE CODE, BẠN BẮT BUỘC PHẢI:**
> 1. **Cập nhật ngay lập tức file này (`FEATURES_SPEC.md`)** tại mục tương ứng của tính năng đó và ghi rõ vào **Nhật ký thay đổi (Changelog)** ở cuối file.
> 2. **Cập nhật file `BUSINESS_RULES.md`** nếu thay đổi có liên quan đến luồng nghiệp vụ, công thức tính toán, trạng thái đơn hàng hoặc cơ chế kho.
> 3. **Cập nhật file `SYSTEM_DESIGN.md`** nếu thay đổi có liên quan đến cấu trúc bảng cơ sở dữ liệu, API endpoint, hoặc kiến trúc phân quyền/bảo mật.
> 
> *Mục đích: Đảm bảo bất kỳ AI hay lập trình viên nào tiếp quản phiên làm việc tiếp theo đều nắm bắt chính xác 100% hiện trạng của hệ thống mà không cần phải dịch ngược lại code.*

---

## 1. PHÂN HỆ XÁC THỰC & BẢO MẬT (AUTHENTICATION & SESSIONS)

### 1.1. Đăng nhập (Login)
- **Phương thức:** Nhập `Email` và `Mật khẩu`.
- **Ghi nhớ đăng nhập (Remember Me):**
  - Checkbox tùy chọn trên form đăng nhập.
  - Khi được tích: Sinh cookie phiên HttpOnly với thời hạn **30 ngày**.
  - Khi không tích: Sinh **Session Cookie** (tự động xóa khi đóng trình duyệt).
- **Tự động tải dữ liệu sau đăng nhập:** Khi xác thực thành công, state `currentUser` được kích hoạt và tự động gọi API nạp dữ liệu dashboard lập tức (không cần tải lại trang).

### 1.2. Đăng ký Tài khoản (Register)
- Đăng ký qua Email và Mật khẩu.
- Mật khẩu được băm bảo mật bằng thuật toán `scrypt` với muối ngẫu nhiên 16 bytes.
- **Quy tắc Admin đầu tiên:** Người đăng ký tài khoản đầu tiên vào hệ thống sẽ được tự động trao quyền `ADMIN`. Các tài khoản đăng ký sau mang quyền `USER`.

### 1.3. Khóa Đăng ký Hai Tầng Realtime (Realtime Registration Lockdown)
- **Tầng Backend (Server-side):** Khi tính năng đăng ký bị khóa bởi Admin, mọi yêu cầu gọi tới API `/api/auth?action=register` lập tức bị chặn đứng với mã lỗi `403 Forbidden` kèm thông báo bảo mật. Kể cả can thiệp DevTools hay Postman đều không thể lọt qua.
- **Tầng Giao diện (Client-side Realtime):** Lắng nghe qua Supabase Realtime và polling 3s. Nút chuyển sang form "Đăng ký" sẽ lập tức biến mất trên mọi màn hình máy khách đang mở mà không cần reload.

---

## 2. PHÂN HỆ BẢNG ĐIỀU KHIỂN CHÍNH (TAB 1: TỔNG QUAN / OVERVIEW)

### 2.1. Thẻ Chỉ số Hiệu năng (Metric KPI Cards)
- **Tổng đơn hàng:** Số lượng đơn bán trong hệ thống kèm phân bổ theo trạng thái.
- **Doanh thu:** Doanh thu gộp tính trên các đơn hàng hợp lệ.
- **Lợi nhuận gộp:** Lợi nhuận ròng sau khi trừ giá vốn hàng bán và phí ship (nếu shop chịu ship).
- **Tồn kho khả dụng:** Tổng số kính và box có sẵn trong kho sẵn sàng xuất bán.
- **Đang giữ (Reserved):** Số lượng kính và box đang bị khóa cho các đơn cọc/đang xử lý.
- **Cảnh báo cần xử lý:** Số lượng đơn chờ giá vốn (`WAITING_STOCK`), đơn chưa hoàn tất nhập hàng, hoặc hộp đang chờ kính.

### 2.2. Bảng Đơn Hàng Mới Nhất (Recent Orders Table)
- **Giao diện chuẩn hóa Responsive:**
  - Cột Mã đơn và Ngày tháng (`.th-code`, `.td-code`): Ép hiển thị trên một dòng duy nhất (`white-space: nowrap !important`), tuyệt đối không bị ngắt quãng gạch nối xấu (ví dụ `DN-CU-208`).
  - Cột Sản phẩm (`.th-prod`, `.td-prod`): Độ rộng co giãn hài hòa (`min-width: 130px; max-width: 240px`), loại bỏ khoảng trống thừa thãi.
  - Cột Hành động nhanh: Chiều rộng cố định gọn gàng (`280px`).
- **Thanh Phân trang Động (Dynamic Pagination Bar):**
  - Hỗ trợ chọn số lượng dòng trên 1 trang: `[5, 10, 15, 20, 25, 50, 100]`.
  - Nút chuyển trang trước/sau (`Trang X / Y`) và hiển thị tổng số bản ghi.

---

## 3. PHÂN HỆ ĐƠN BÁN HÀNG (TAB 2: ĐƠN BÁN / SALES ORDERS)

### 3.1. Danh sách & Bộ Lọc Đơn Hàng
- Tìm kiếm nhanh theo: Mã đơn (`SO-...`), Tên khách hàng, Số điện thoại, SKU sản phẩm.
- Lọc theo Trạng thái đơn (`DRAFT`, `WAITING_STOCK`, `DEPOSIT_RECEIVED`, `GOODS_RECEIVED`, `READY_TO_SHIP`, `SHIPPING`, `COMPLETED`, `CANCELLED`, `RETURNED`, `REFUNDED`).
- Tích hợp thanh phân trang động tùy chọn số lượng hiển thị (5, 10, 20, 50...).

### 3.2. Tạo & Sửa Đơn Bán Hàng
- Chọn khách hàng có sẵn hoặc tạo nhanh khách hàng mới.
- Thêm nhiều dòng sản phẩm với cấu hình loại dòng (`line_type`):
  - `GLASSES_WITH_ATTACHED`: Kính kèm Box nguyên bộ từ cùng một lô.
  - `GLASSES_WITH_LOOSE`: Kính ghép với Box rời.
  - `GLASSES_ONLY`: Khách chỉ mua kính.
  - `BOX_ONLY`: Khách chỉ mua hộp phụ kiện.
- Thiết lập tiền cọc (`deposit_amount`).
- **Cơ chế Phí Ship (`ship_payer`):**
  - Chọn `RECIPIENT` (Khách trả): Cộng phí ship vào tổng đơn khách thanh toán.
  - Chọn `SELLER` (Shop freeship): Trừ phí ship vào lợi nhuận của shop.
- Hiển thị tự động: Tổng giá trị hàng, Tiền khách cần trả, Tiền khách còn nợ, Giá vốn lô, Lợi nhuận dự tính.

### 3.3. Xem Chi tiết & Chuyển Trạng thái Đơn (Modal Detail)
- Hiển thị toàn bộ lịch sử giữ hàng (Reservations) từ những lô nào.
- Các nút hành động chuyển đổi trạng thái một chạm:
  - *Nhận cọc* -> Tự động kích hoạt thuật toán FIFO khóa hàng trong kho.
  - *Sẵn sàng giao* -> Kiểm tra đủ điều kiện đóng gói.
  - *Đang giao* -> Cập nhật trạng thái vận chuyển.
  - *Hoàn thành* -> Trừ trực tiếp tồn kho vật lý và chuyển trạng thái giữ hàng sang `CONSUMED`.
  - *Hủy đơn / Hoàn hàng* -> Tự động nhả hàng giữ về kho khả dụng và ghi log.

---

## 4. PHÂN HỆ MUA HÀNG & NHẬP KHO (TAB 3: MUA HÀNG / PROCUREMENT)

### 4.1. Quản lý Đơn Đặt Hàng Nhà Cung Cấp (Purchase Orders)
- Lập đơn đặt hàng mua kính và hộp từ các xưởng/NCC.
- Khai báo chi tiết giá nhập dự kiến và chi phí vận chuyển NCC.
- Trạng thái đơn mua: `DRAFT`, `ORDERED`, `PARTIAL`, `RECEIVED`, `MERGED`, `CANCELLED`.

### 4.2. Tính năng Gom Đơn Nháp (Draft Consolidation / Batching)
- Cho phép tích chọn nhiều đơn mua hàng ở trạng thái `DRAFT`.
- Nhấn nút **"Gom đơn"** để gộp toàn bộ sản phẩm vào một đơn mua hàng cha duy nhất gửi cho NCC tổng.
- Đơn nháp cũ chuyển sang `MERGED`, lưu vết mã đơn cha và bảo toàn nguồn NCC ban đầu của từng món hàng.

### 4.3. Phiếu Nhập Kho & Kiểm Định Hàng Hóa (Goods Receipt & QC Split)
- Hỗ trợ nhập hàng nhiều đợt (Partial Inbound).
- Bắt buộc phân tách số lượng khi nhận hàng:
  - `Số lượng đạt chuẩn`: Tạo lô hàng mới (`glasses_lots` / `box_lots`), tính giá vốn đơn vị và cộng vào tồn kho bán hàng.
  - `Số lượng lỗi/hỏng`: Lập tức đưa vào danh sách hàng lỗi (`defective_products`) kèm lý do để đòi bồi thường, **tuyệt đối không nhập kho bán**.

### 4.4. Quản lý Công nợ Nhà Cung Cấp
- Ghi nhận các khoản thanh toán cho NCC:
  - `DEPOSIT`: Tiền đặt cọc xưởng trước khi sản xuất/giao hàng.
  - `PAYMENT`: Thanh toán tiền hàng khi nhận hoặc theo chu kỳ.
- Báo cáo chi tiết: Tổng giá trị mua, Đã thanh toán, Còn nợ NCC.

---

## 5. PHÂN HỆ TỒN KHO & LÔ HÀNG (TAB 4: TỒN KHO / INVENTORY)

### 5.1. Bảng Tồn Kho Kép (Kính & Hộp)
- Chế độ xem phân tách trực quan: Tab Kính (`GLASSES`) và Tab Hộp (`BOX`).
- Thống kê chi tiết từng sản phẩm:
  - Tồn kho vật lý (`remaining_qty`).
  - Đang giữ cho đơn (`reserved_qty`).
  - Khả dụng thực tế (`available = remaining - reserved`).
  - **Hộp chờ kính (`pending_attached_qty`):** Số lượng hộp kèm đang tạm giữ vì kính chưa đạt chuẩn.

### 5.2. Danh sách Lô Hàng Chi Tiết (Lot Breakdown)
- Xem từng lô nhập: Mã lô, Ngày nhập, Nhà cung cấp, Giá vốn nhập, Số lượng ban đầu, Số lượng còn lại, Số lượng giữ.

### 5.3. Quản lý Hàng Lỗi / Khiếu Nại NCC (Defective Products)
- Danh sách sản phẩm bị lỗi phát hiện khi nhập kho.
- Theo dõi trạng thái khiếu nại: Chờ xử lý, Đã bồi thường, Đã hủy tiêu hủy.

### 5.4. Điều Chỉnh Tồn Kho Thủ Công (Manual Stock Adjustment)
- Cho phép kiểm kê và điều chỉnh tăng/giảm tồn kho khi có hao hụt, mất mát hoặc thừa hàng.
- **Bắt buộc nhập lý do điều chỉnh.**
- Tự động ghi nhận 1 bản ghi điều chỉnh `ADJUSTMENT` vào Sổ nhật ký kho.

---

## 6. PHÂN HỆ SỔ NHẬT KÝ KHO (TAB 5: SỔ NHẬT KÝ KHO / MOVEMENTS AUDIT)

- **Bản chất:** Bảng lưu vết bất biến (Append-Only Audit Log) ghi lại 100% biến động kho.
- **Dữ liệu hiển thị:**
  - Thời gian chính xác (`occurred_at`).
  - Mã sản phẩm (SKU) & Mã lô hàng.
  - Loại biến động:
    - `RECEIPT`: Nhập kho từ đơn mua (+ tồn vật lý).
    - `RESERVATION`: Giữ hàng cho đơn bán (+ số lượng giữ).
    - `CONSUMPTION`: Xuất kho hoàn tất đơn (- tồn vật lý, - số lượng giữ).
    - `RELEASE`: Hủy đơn/nhả giữ (- số lượng giữ).
    - `ADJUSTMENT`: Điều chỉnh kiểm kê (+/- tồn vật lý).
  - Biến động vật lý (`physical_delta`) và Biến động giữ (`reserved_delta`).
  - Đơn tham chiếu liên quan (Mã PO hoặc Mã SO).
  - Tài khoản thực hiện (Actor).
- Hỗ trợ lọc theo SKU, Loại biến động, và phân trang số lượng linh hoạt.

---

## 7. PHÂN HỆ KHÁCH HÀNG & NHÀ CUNG CẤP (TAB 6 & 7: CRM & SRM)

### 7.1. Quản lý Khách Hàng (Customers)
- Danh bạ khách hàng: Tên, Số điện thoại, Địa chỉ giao hàng, Kênh tiếp cận (Facebook, Instagram, Zalo, Trực tiếp).
- Lịch sử mua hàng: Danh sách toàn bộ các đơn hàng khách đã đặt.
- Chỉ số tài chính khách hàng: Tổng số đơn hoàn thành, Tổng số tiền đã chi tiêu (Customer Lifetime Value).

### 7.2. Quản lý Nhà Cung Cấp (Suppliers)
- Hồ sơ nhà cung cấp: Tên đơn vị, Kênh liên lạc (WeChat, 1688, Hotline), Địa chỉ.
- Thống kê lịch sử đặt hàng và trạng thái công nợ hiện tại.
- Lịch sử các đợt thanh toán cọc và tiền hàng.

---

## 8. PHÂN HỆ QUẢN TRỊ NGƯỜI DÙNG (TAB 8: QUẢN LÝ USER / USER MANAGEMENT)

### 8.1. Danh sách Người dùng Hệ thống
- Hiển thị danh sách tài khoản: Email, Ngày đăng ký, Vai trò hiện tại (`ADMIN` hoặc `USER`).

### 8.2. Chuyển giao Quyền Quản trị Viên (Transfer Admin Role)
- Admin có nút hành động: **"Chuyển Admin"** trên từng tài khoản User.
- Khi xác nhận: Tài khoản được chọn trở thành Admin, tài khoản cũ tự động chuyển thành User.
- **Quy tắc:** Luôn luôn duy trì tối thiểu một Admin có hiệu lực.

### 8.3. Quy tắc Không Xóa Tài khoản (Non-Deletion Integrity)
- Hệ thống **hoàn toàn không có nút xóa User**.
- Mọi lịch sử thao tác của User được bảo toàn vĩnh viễn cho mục đích đối soát kế toán và kiểm toán vận hành.

### 8.4. Công tắc Khóa Đăng ký Realtime (Realtime Registration Toggle)
- Switch bật/tắt quyền đăng ký tài khoản mới:
  - Khi bật (ON): Cho phép người dùng mới đăng ký.
  - Khi tắt (OFF): Khóa ngay lập tức trên Database và truyền tín hiệu Realtime ẩn nút đăng ký ở tất cả các máy khác.

---

## 9. PHÒNG THÍ NGHIỆM KIỂM THỬ NGHIỆP VỤ (TAB 9: TEST LAB / SIMULATOR)

- Môi trường giả lập dành cho kiểm thử và đánh giá hệ thống:
  - **Tạo dữ liệu mẫu (Seed Mock Data):** Tạo nhanh khách hàng, nhà cung cấp, kính, hộp, đơn mua và đơn bán mẫu.
  - **Giả lập Kịch bản FIFO & Lock hàng:** Kích hoạt đồng thời nhiều đơn cọc để kiểm tra khả năng khóa hàng không bị trùng lặp hoặc âm kho.
  - **Giả lập Nhận hàng từng phần:** Test nghiệp vụ Box chờ kính (`pending_attached_qty`).
  - **Làm sạch Dữ liệu Kiểm thử (Safe Purge):** Reset dữ liệu giả lập về trạng thái chuẩn mà không ảnh hưởng đến cấu hình hệ thống.

---

## 10. NHẬT KÝ THAY ĐỔI HỆ THỐNG (SYSTEM CHANGELOG)

> *Ghi chú: Khi có bất kỳ thay đổi nào trong code, lập trình viên/AI phải ghi thêm 1 mục vào đây.*

- **2026-09-05 (Bản cập nhật v2.0.4):**
  - **UI/UX:** Khắc phục lỗi ngắt dòng mã đơn & ngày tháng (`white-space: nowrap !important`), căn chỉnh lại độ rộng cột Sản phẩm (`min-width: 130px; max-width: 240px`) và cột Hành động nhanh (`280px`), loại bỏ hoàn toàn khoảng trống vô lý trên Dashboard.
  - **Pagination:** Bổ sung thanh phân trang đồng bộ trên toàn bộ các bảng dữ liệu với bộ chọn số lượng bản ghi trên một trang (`5, 10, 15, 20, 25, 50, 100`).
  - **Auth & Lifecycle:** Sửa lỗi phải reload sau đăng nhập bằng cách thêm cơ chế tự động nạp dữ liệu khi `currentUser` thay đổi.
  - **Bảo mật:** Khóa chặt API đăng ký ở tầng Database (`db/auth.ts`) trả về HTTP 403 Forbidden khi tính năng đăng ký bị tắt, ngăn chặn triệt để tấn công qua DevTools/Postman.
  - **Tài liệu:** Khởi tạo bộ 3 tài liệu chuẩn mực: `BUSINESS_RULES.md`, `SYSTEM_DESIGN.md`, `FEATURES_SPEC.md`.
