# 🎮 HƯỚNG DẪN TRIỂN KHAI LÊN RENDER.COM (MIỄN PHÍ 100%)
**Đấu Trường Bom: Kiểm thử và gỡ lỗi chương trình (Tin học 10 - Bài 30)**

Thư mục này chứa đầy đủ toàn bộ mã nguồn sạch của game, đã được tối ưu hóa 100% tài nguyên để chạy mượt mà trên gói máy chủ Free (512MB RAM) của Render.com.

---

## 🚀 CÁCH 1: TRIỂN KHAI NHANH QUA GITHUB (KHUYÊN DÙNG - 3 PHÚT)

### Bước 1: Tạo Repository mới trên GitHub
1. Đăng nhập vào [github.com](https://github.com).
2. Bấm nút **New repository** (hoặc dấu `+` ở góc trên bên phải).
3. Đặt tên Repo (ví dụ: `dau-truong-bom-bai-30`).
4. Để chế độ **Public** (hoặc **Private** đều được) -> Bấm **Create repository**.

### Bước 2: Tải code từ thư mục này lên GitHub
Mở terminal / PowerShell tại thư mục `render-deploy` này và chạy các lệnh sau:
```bash
git init
git add .
git commit -m "Khoi tao dau truong bom Tin hoc 10"
git branch -M main
git remote add origin https://github.com/<tai-khoan-cua-ban>/dau-truong-bom-bai-30.git
git push -u origin main
```
*(Hoặc bạn có thể kéo thả toàn bộ các file trong thư mục này vào giao diện web của GitHub bằng nút "uploading an existing file")*.

---

### Bước 3: Tạo Web Service trên Render.com
1. Đăng nhập vào [render.com](https://dashboard.render.com/) (đăng nhập bằng tài khoản GitHub cho nhanh).
2. Tại Dashboard, bấm nút **New +** -> Chọn **Web Service**.
3. Chọn Repository `dau-truong-bom-bai-30` vừa tạo ở Bước 2 -> Bấm **Connect**.
4. Điền các thông số cơ bản (nếu Render chưa tự điền):
   * **Name**: `dau-truong-bom-bai-30` (hoặc tên tùy thích).
   * **Region**: Chọn **Singapore** (gần Việt Nam nhất, độ trễ mạng cực thấp chỉ ~30ms).
   * **Branch**: `main`.
   * **Runtime**: `Node`.
   * **Build Command**: `npm install`
   * **Start Command**: `node server.js`
   * **Instance Type**: Chọn **Free** ($0/tháng).
5. Bấm nút **Deploy Web Service** ở cuối trang!

---

## 🎯 CÁCH SỬ DỤNG TRONG TIẾT HỌC

Sau khi Render build xong (khoảng 1 - 2 phút), Render sẽ cấp cho bạn một đường link HTTPS có dạng:
👉 **`https://dau-truong-bom-bai-30.onrender.com`**

1. **Trên Máy chiếu / TV Giáo viên**:
   * Mở trình duyệt và truy cập: `https://dau-truong-bom-bai-30.onrender.com/spectator`
   * Màn hình sảnh chờ sẽ **tự động vẽ mã QR** chứa đúng link Render này!
   * Có sẵn nút **🔍 Phóng to mã QR** để học sinh cuối lớp dễ quét.

2. **Trên Điện thoại Học sinh**:
   * Dùng Camera điện thoại hoặc Zalo quét mã QR trên máy chiếu.
   * Hoặc truy cập trực tiếp: `https://dau-truong-bom-bai-30.onrender.com`
   * **Ưu điểm khi lên Render**: Học sinh dùng **4G, 5G hay bất kỳ mạng Wi-Fi nào** đều vào thi đấu mượt mà, không bao giờ bị lỗi do tường lửa máy tính cá nhân!
