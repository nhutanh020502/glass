# BỘ QUY TẮC NGHIỆP VỤ HỆ THỐNG QUẢN LÝ BÁN LẺ & KHO (BUSINESS RULES)
> **Dự án:** ORD Studio — Optical Retail & Inventory Management OS  
> **Phiên bản:** 2.0 (Dual-Product: Glasses & Box Engine)  
> **Ngày cập nhật:** 2026-09-05  

---

## 1. NGUYÊN TẮC QUẢN TRỊ & MÔ HÌNH SẢN PHẨM KÉP (DUAL INVENTORY)

### 1.1. Thực thể Kính và Hộp Kính (Glasses vs Box)
1. Kính (`kind = 'GLASSES'`) và Hộp (`kind = 'BOX'`) là 2 thực thể sản phẩm độc lập trong danh mục (`products`), nhưng có quan hệ cộng sinh trong bán lẻ kính mắt.
2. Quản lý kho dựa trên **Lô hàng thực tế (Lot-based tracking)**:
   - Mỗi lần nhập kho tạo ra một lô mới với giá vốn (`unit_cost`), số lượng nhập (`received_qty`), số lượng còn lại (`remaining_qty`), số lượng đang giữ (`reserved_qty`), ngày nhập và nguồn gốc nhà cung cấp.

### 1.2. Phân loại Hộp Kính & Luật Khả Dụng (Box Segregation Rule)
Hộp kính được chia thành 2 loại với quy tắc tồn kho hoàn toàn khác nhau:
1. **Hộp rời (`LOOSE_BOX` / `LOOSE`)**:
   - Được nhập độc lập để bán kèm kính bất kỳ hoặc bán lẻ riêng hộp.
   - **Luật:** Ngay khi nhập kho, số lượng đạt chuẩn lập tức trở thành **Tồn kho khả dụng (Available to Sell)**.
2. **Hộp kèm theo kính (`ATTACHED_BOX` / `ATTACHED`)**:
   - Hộp đi kèm trọn bộ với chiếc kính từ cùng một nhà cung cấp (`FULL_BOX`).
   - **LUẬT TỐI CAO VỀ BOX KÈM:** *Hộp đi kèm không được phép tự do xuất bán nếu chiếc kính đi cùng trong lô chưa về kho hoặc bị lỗi.*
   - Nếu hộp về trước hoặc kính chưa kiểm định đạt chuẩn, số hộp này rơi vào trạng thái **Hộp chờ kính (`pending_attached_qty`)** và hệ thống **tuyệt đối không cho phép gán bán**.
   - Chỉ khi lô kính đi kèm được xác nhận nhập kho thành công (`goodQuantity > 0`), số lượng box kèm tương ứng mới chuyển từ "Chờ kính" sang "Khả dụng".

### 1.3. Công thức Tồn kho Khả dụng (Available Inventory Formula)
- **Tồn kho vật lý (Physical On-Hand):** `remaining_qty = SUM(lô_hàng.remaining_qty)`
- **Đang giữ cho đơn (Committed/Reserved):** `reserved_qty = SUM(lô_hàng.reserved_qty)`
- **Khả dụng thực tế để bán (Available to Sell):**
  $$\text{Available} = \text{remaining\_qty} - \text{reserved\_qty}$$
- **Quy tắc chặn bán âm (No Negative Stock):** Hệ thống không cho phép xác nhận giữ hàng nếu $\text{Available} < \text{Requested Quantity}$.

---

## 2. QUY TRÌNH MUA HÀNG & NHẬP KHO (PROCUREMENT & INBOUND)

### 2.1. Vòng đời Đơn Mua Hàng (`purchase_orders.status`)
- `DRAFT` (Nháp): Tạo nhu cầu mua hàng, có thể chỉnh sửa tự do.
- `ORDERED` (Đã đặt hàng NCC): Đã gửi đơn cho nhà cung cấp, chờ giao hàng.
- `PARTIAL` (Nhận một phần): Nhà cung cấp giao thiếu hoặc giao làm nhiều đợt.
- `RECEIVED` (Đã nhận đủ): Toàn bộ số lượng đặt đã được nhập kho và kiểm định.
- `MERGED` (Đã gom đơn): Đơn nháp đã được gộp vào một đơn mua hàng cha.
- `CANCELLED` (Đã hủy): Hủy giao dịch mua.

### 2.2. Cơ chế Gom Đơn Nháp (PO Batching / Consolidation Rule)
1. Chỉ các đơn mua có trạng thái `DRAFT` mới được phép gom đơn.
2. Khi gom nhiều đơn nháp thành 1 đơn mua hàng cha:
   - Các đơn nháp con chuyển trạng thái sang `MERGED`, lưu vết `merged_into_order_id = <ID_đơn_cha>`.
   - Các dòng sản phẩm (`items`) của đơn con được copy vào đơn cha, nhưng **bắt buộc giữ nguyên `source_supplier`** để đối soát nguồn gốc từng món hàng.
   - Đơn cha tiếp tục tiến trình đặt hàng với nhà cung cấp tổng.

### 2.3. Quy trình Kiểm hàng (QC) & Tách hàng Lỗi (Defect Handling)
1. Khi tạo phiếu nhập kho (`goods_receipts`), nhân viên kho phải phân tách rõ:
   - `goodQuantity` (Số lượng đạt chuẩn): Tạo lô hàng mới trong kho (`glasses_lots` / `box_lots`), cộng vào tồn vật lý khả dụng.
   - `defectiveQuantity` (Số lượng lỗi/hỏng): **Không được cộng vào kho bán!** Lập tức tạo bản ghi trong `defective_products` kèm: mã lỗi, mô tả chi tiết, ảnh chứng từ, nhà cung cấp chịu trách nhiệm để khiếu nại bồi thường.
2. Nếu `goodQuantity + defectiveQuantity < ordered_qty`: Đơn mua chuyển sang `PARTIAL` để tiếp tục theo dõi số còn lại.
3. Nếu tổng nhận bằng số lượng đặt: Đơn mua chuyển sang `RECEIVED`.

### 2.4. Công nợ Nhà cung cấp (Vendor Debt & Payment Rules)
- **Tổng giá trị mua:** $\text{Total Purchase} = \text{total\_amount} + \text{ship\_cost}$
- **Đã thanh toán:** $\text{Paid Amount} = \sum (\text{supplier\_payments.amount})$
- **Loại thanh toán:**
  - `DEPOSIT`: Tiền đặt cọc trước cho xưởng/NCC.
  - `PAYMENT`: Tiền thanh toán nốt khi nhận hàng hoặc theo kỳ công nợ.
- **Còn nợ NCC:** $\text{Outstanding} = \text{Total Purchase} - \text{Paid Amount}$.

---

## 3. QUY TRÌNH BÁN HÀNG & MÁY TRẠNG THÁI ĐƠN HÀNG (SALES ORDER WORKFLOW)

### 3.1. Các Trạng thái Đơn Bán (`orders.status`)
1. `DRAFT`: Đơn nháp vừa tạo, chưa có cam kết tài chính từ khách.
2. `WAITING_STOCK`: Khách đặt mẫu đang hết hàng, chờ đặt hàng NCC (Backorder).
3. `DEPOSIT_RECEIVED`: Khách đã cọc tiền -> **Kích hoạt tự động Thuật toán Giữ hàng (Reservation Engine)**.
4. `ORDERING_SUPPLIER`: Đơn đã được chuyển thành đơn mua hàng sang NCC.
5. `GOODS_RECEIVED`: Hàng từ NCC đã về tới kho của shop, khớp với đơn chờ của khách.
6. `READY_TO_SHIP`: Kính và hộp đã kiểm tra đạt chuẩn, đóng gói, in vận đơn.
7. `SHIPPING`: Đã giao cho đơn vị vận chuyển (GHN, Viettel Post, GHTK...).
8. `COMPLETED`: Khách nhận hàng thành công, tiền đã thu đủ, đơn đóng.
9. `CANCELLED`: Khách hủy đơn hoặc quá hạn cọc -> Nhả hàng giữ về kho.
10. `RETURNED`: Khách hoàn hàng về kho -> Xử lý kiểm hàng và nhập lại kho hoặc chuyển kho lỗi.
11. `REFUNDED`: Hoàn trả tiền cọc/tiền hàng cho khách.

### 3.2. Phân loại Dòng Sản Phẩm Bán (`order_items.line_type`)
- `GLASSES_WITH_ATTACHED`: Kính bán cùng Box đi kèm từ **cùng một lô nhập ban đầu**.
- `GLASSES_WITH_LOOSE`: Kính bán ghép với Box rời (2 lô độc lập).
- `GLASSES_ONLY`: Chỉ mua gọng/kính, không lấy hộp.
- `BOX_ONLY`: Chỉ mua hộp rời hoặc phụ kiện.

---

## 4. THUẬT TOÁN GIỮ HÀNG FIFO & KIỂM TOÁN TỒN KHO (RESERVATION & AUDIT)

### 4.1. Kích hoạt Giữ hàng (Reservation Trigger Points)
- **Tập trạng thái kích hoạt giữ hàng (`RESERVED_STATUSES`):**  
  `['DEPOSIT_RECEIVED', 'GOODS_RECEIVED', 'READY_TO_SHIP', 'SHIPPING']`.
- Khi đơn hàng chuyển vào một trong các trạng thái trên:
  1. Hệ thống duyệt qua từng dòng sản phẩm (`order_items`).
  2. Quét các lô còn hàng theo nguyên tắc **FIFO (Nhập trước - Xuất trước)**: Sắp xếp theo ngày nhập `received_at ASC`.
  3. Khóa số lượng cần thiết vào bảng `inventory_reservations` với `status = 'RESERVED'`.
  4. Tăng trường `reserved_qty` trên lô hàng tương ứng.
  5. Ghi nhận sự kiện vào sổ nhật ký kho `inventory_movements` với:
     - `movement_type = 'RESERVATION'`
     - `reserved_delta = +quantity`
     - `physical_delta = 0`

### 4.2. Hoàn tất Xuất Kho (Consumption on Completion)
- Khi đơn hàng chuyển sang `COMPLETED`:
  1. Toàn bộ các bản ghi giữ hàng `inventory_reservations` của đơn chuyển sang `status = 'CONSUMED'`.
  2. Trừ trực tiếp số lượng vật lý trên lô: `remaining_qty -= reserved_qty`.
  3. Trừ số lượng giữ: `reserved_qty -= reserved_qty` (về 0).
  4. Ghi nhận sự kiện vào `inventory_movements`:
     - `movement_type = 'CONSUMPTION'`
     - `physical_delta = -quantity`
     - `reserved_delta = -quantity`

### 4.3. Hủy Giữ Hàng (Release on Cancel/Return)
- Khi đơn hàng chuyển sang `CANCELLED` hoặc `RETURNED`:
  1. Các bản ghi `inventory_reservations` chuyển sang `status = 'RELEASED'`.
  2. Trả lại quyền bán cho lô hàng: `reserved_qty -= quantity`.
  3. Ghi nhận sự kiện vào `inventory_movements`:
     - `movement_type = 'RELEASE'`
     - `reserved_delta = -quantity`
     - `physical_delta = 0`

### 4.4. Tính Bất biến của Sổ Nhật Ký Kho (Immutable Audit Trail)
- **QUY TẮC CỐT LÕI:** Bảng `inventory_movements` là **bất biến (Append-Only)**.
- Nghiêm cấm mọi câu lệnh `UPDATE` hoặc `DELETE` trên bảng này.
- Mọi điều chỉnh kho thủ công phải được thực hiện bằng cách tạo một bản ghi `ADJUSTMENT` mới với delta dương hoặc âm kèm lý do điều chỉnh rõ ràng.

---

## 5. CÔNG THỨC TÀI CHÍNH, GIÁ VỐN & LỢI NHUẬN (FINANCIAL RULES)

### 5.1. Quy tắc Người trả Phí Ship (`ship_payer`)
- **`RECIPIENT` (Khách trả ship):**
  - Khách tự trả tiền vận chuyển cho bên giao nhận khi nhận hàng (hoặc trả kèm đơn).
  - Phí ship được cộng vào tổng tiền khách phải thanh toán.
  - Phí ship **KHÔNG** làm giảm lợi nhuận của shop.
- **`SELLER` (Shop chịu ship / Freeship):**
  - Khách chỉ thanh toán đúng tiền hàng.
  - Phí ship là chi phí bán hàng của shop và **TRỪ TRỰC TIẾP VÀO LỢI NHUẬN RÒNG** của đơn.

### 5.2. Công thức Doanh thu, Phải thu và Lợi nhuận
1. **Doanh thu bán hàng (`revenue`):**
   $$\text{Revenue} = \sum (\text{order\_items.selling\_price} \times \text{order\_items.quantity})$$
2. **Tổng tiền khách phải trả (`customer_total`):**
   $$\text{Customer Total} = \text{Revenue} + (\text{ship\_payer} == \text{'RECIPIENT'} ? \text{ship\_cost} : 0)$$
3. **Tiền khách còn nợ (Outstanding Receivable):**
   $$\text{Customer Balance} = \text{Customer Total} - \text{deposit\_amount}$$
4. **Giá vốn hàng bán (COGS - Cost of Goods Sold):**
   - Giá vốn lấy chính xác từ các lô hàng đã được gán giữ (Reservation FIFO):
   $$\text{COGS} = \text{glasses\_unit\_cost} + \text{box\_unit\_cost}$$
   - *Quy tắc:* Nếu đơn đang ở trạng thái `WAITING_STOCK` (chưa nhập được hàng từ NCC), giá vốn chưa xác định, hệ thống phải hiển thị trạng thái *"Chờ giá vốn"* thay vì tạm tính sai lệch.
5. **Lợi nhuận ròng của đơn hàng (`profit`):**
   $$\text{Profit} = \text{Revenue} - \text{COGS} - (\text{ship\_payer} == \text{'SELLER'} ? \text{ship\_cost} : 0)$$

---

## 6. QUY TẮC BẢO MẬT, TÀI KHOẢN & PHÂN QUYỀN (SECURITY & USER RULES)

### 6.1. Phân quyền Người dùng (`app_users.role`)
1. Hệ thống có 2 cấp quyền: `ADMIN` (Quản trị viên) và `USER` (Nhân viên).
2. **Luật Người Đầu Tiên:** Người đăng ký tài khoản đầu tiên vào hệ thống sẽ **tự động trở thành ADMIN**. Mọi tài khoản đăng ký sau đó đều mặc định mang quyền `USER`.
3. **Chuyển giao quyền Admin (Transfer Admin Role):**
   - Chỉ Admin đương nhiệm mới có quyền chọn một tài khoản `USER` khác và chuyển giao quyền Admin.
   - Khi chuyển giao thành công, tài khoản cũ tự động hạ cấp về `USER`.
4. **LUẬT BẤT KHẢ HỦY USER (Non-Deletion Integrity Rule):**
   - **Nghiêm cấm xóa người dùng (`DELETE FROM app_users`).**
   - Toàn bộ lịch sử tạo đơn, duyệt nhập kho, thay đổi trạng thái đều liên kết với `user_id`. Việc xóa user sẽ phá hủy tính toàn vẹn của lịch sử kiểm toán.

### 6.2. Cơ chế Khóa Đăng ký Realtime (Realtime Registration Lock)
1. Admin có quyền bật/tắt công tắc cho phép đăng ký tài khoản mới (`app_settings.allow_registration`).
2. **Bảo mật Server-side:** Khi `allow_registration = false`, toàn bộ request gọi đến API đăng ký (`/api/auth?action=register`) lập tức bị chặn với mã `403 Forbidden`. Không ai có thể bypass qua DevTools hay Postman.
3. **Đồng bộ Realtime Client-side:** Trạng thái khóa đăng ký được đồng bộ tức thì tới tất cả các trình duyệt đang mở trang đăng nhập qua kênh Supabase Realtime và cơ chế kiểm tra định kỳ 3 giây. Nút "Đăng ký" biến mất ngay lập tức mà không cần người dùng tải lại trang.
