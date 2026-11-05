// Ngân hàng 40 câu hỏi trắc nghiệm ngắn gọn, súc tích CỦNG CỐ BÀI 30: KIỂM THỬ VÀ GỠ LỖI (Tin học 10)
// Thiết kế đặc biệt cho game hành động: câu hỏi ngắn, đáp án 2-5 chữ, đọc nhanh dưới 2 giây!

const QUESTIONS_BANK = [
  {
    id: 1,
    question: "Mục đích chính của kiểm thử chương trình (Testing) là gì?",
    options: ["A. Tìm lỗi và phòng ngừa lỗi", "B. Đổi màu giao diện", "C. Tăng tốc độ gõ phím", "D. Xóa bớt mã nguồn"],
    correct: 0,
    explain: "Kiểm thử nhằm tìm lỗi (bug) và ngăn ngừa lỗi phát sinh trong tương lai."
  },
  {
    id: 2,
    question: "Trong lập trình, thuật ngữ 'Bug' chỉ loại lỗi nào?",
    options: ["A. Lỗi phần cứng bàn phím", "B. Lỗi ngữ nghĩa làm sai kết quả", "C. Virus máy tính từ USB", "D. Mất kết nối Internet"],
    correct: 1,
    explain: "Bug là lỗi không tường minh: chương trình chạy không dừng nhưng kết quả sai."
  },
  {
    id: 3,
    question: "Gỡ lỗi chương trình (Debugging) là quá trình gì?",
    options: ["A. Cài lại hệ điều hành", "B. Xóa toàn bộ phần mềm", "C. Tìm vị trí lỗi và sửa lỗi", "D. Nâng cấp bộ nhớ RAM"],
    correct: 2,
    explain: "Gỡ lỗi (debug) là xác định vị trí nguyên nhân lỗi và tiến hành sửa lỗi."
  },
  {
    id: 4,
    question: "Lỗi cú pháp (SyntaxError) xảy ra khi nào?",
    options: ["A. Viết sai quy tắc ngôn ngữ", "B. Chia một số cho số 0", "C. Nhập dữ liệu quá lớn", "D. Máy tính bị mất điện"],
    correct: 0,
    explain: "Lỗi cú pháp xảy ra khi câu lệnh viết sai ngữ pháp của ngôn ngữ lập trình."
  },
  {
    id: 5,
    question: "Lỗi ngoại lệ khi chạy (Runtime Error) làm chương trình thế nào?",
    options: ["A. Tự động sửa lỗi", "B. Dừng lại bất thường khi chạy", "C. Chạy nhanh gấp hai lần", "D. Tự lưu ra file mới"],
    correct: 1,
    explain: "Lỗi Runtime xuất hiện khi đang chạy khiến chương trình dừng lại đột ngột."
  },
  {
    id: 6,
    question: "Lỗi chia cho số 0 trong Python thuộc loại lỗi nào?",
    options: ["A. ZeroDivisionError", "B. SyntaxError", "C. NameError", "D. IndentationError"],
    correct: 0,
    explain: "Python ném ngoại lệ ZeroDivisionError khi thực hiện phép chia cho 0."
  },
  {
    id: 7,
    question: "Lỗi logic (ngữ nghĩa) có đặc điểm gì?",
    options: ["A. Báo lỗi cú pháp ngay", "B. Chạy xong nhưng kết quả sai", "C. Làm máy tính bị đơ chuột", "D. Không thể lưu file mã"],
    correct: 1,
    explain: "Lỗi logic: chương trình chạy hoàn thành nhưng kết quả không đúng yêu cầu."
  },
  {
    id: 8,
    question: "Để quan sát giá trị biến khi gỡ lỗi đơn giản, ta dùng lệnh gì?",
    options: ["A. input()", "B. print()", "C. exit()", "D. clear()"],
    correct: 1,
    explain: "Dùng lệnh print() để in giá trị các biến trung gian nhằm tìm lỗi."
  },
  {
    id: 9,
    question: "Lợi ích chính của việc dùng lệnh print() để gỡ lỗi là gì?",
    options: ["A. In tài liệu ra máy in", "B. Kiểm tra giá trị trung gian", "C. Xóa các biến bị lỗi", "D. Tự động đổi font chữ"],
    correct: 1,
    explain: "Giúp lập trình viên theo dõi sự biến đổi của dữ liệu qua từng bước."
  },
  {
    id: 10,
    question: "Công cụ chuyên dụng hỗ trợ tìm và sửa lỗi gọi là gì?",
    options: ["A. Compiler", "B. Debugger", "C. Browser", "D. Anti-virus"],
    correct: 1,
    explain: "Debugger (công cụ gỡ lỗi) được tích hợp trong các môi trường lập trình."
  },
  {
    id: 11,
    question: "Trong Debugger, 'Điểm dừng' (Breakpoint) có tác dụng gì?",
    options: ["A. Tắt hẳn máy tính", "B. Tạm dừng chương trình tại đó", "C. Xóa dòng lệnh được chọn", "D. Bỏ qua toàn bộ hàm"],
    correct: 1,
    explain: "Breakpoint là vị trí chỉ định để chương trình tạm dừng cho người dùng kiểm tra."
  },
  {
    id: 12,
    question: "Chế độ 'Chạy từng bước' (Step) trong gỡ lỗi giúp ích gì?",
    options: ["A. Theo dõi từng dòng lệnh chạy", "B. Làm chương trình chạy nhanh", "C. Khóa màn hình làm việc", "D. Tự động dịch sang tiếng Anh"],
    correct: 0,
    explain: "Step cho phép thực thi từng dòng lệnh để quan sát trạng thái các biến."
  },
  {
    id: 13,
    question: "Bộ dữ liệu thử nghiệm (Test case) bao gồm những gì?",
    options: ["A. Dữ liệu vào và kết quả kỳ vọng", "B. Tên và tuổi lập trình viên", "C. Mã nguồn và cấu hình máy", "D. Lịch sử duyệt web"],
    correct: 0,
    explain: "Test case gồm dữ liệu đầu vào (input) và kết quả mong muốn (expected output)."
  },
  {
    id: 14,
    question: "Bộ dữ liệu thử 'ở vùng biên' là các giá trị nào?",
    options: ["A. Giá trị ranh giới (0, 1, min, max)", "B. Các ký tự đặc biệt", "C. File âm thanh và video", "D. Địa chỉ IP của máy"],
    correct: 0,
    explain: "Dữ liệu vùng biên là các giá trị ranh giới của miền xác định (0, 1, biên trên/dưới)."
  },
  {
    id: 15,
    question: "Tác dụng của việc thử nghiệm với dữ liệu ngẫu nhiên là gì?",
    options: ["A. Tăng khả năng tìm lỗi tiềm ẩn", "B. Giảm dung lượng ổ cứng", "C. Tự động tạo bài tập mới", "D. Tăng tốc độ mạng Internet"],
    correct: 0,
    explain: "Dữ liệu ngẫu nhiên giúp phát hiện các tình huống ngoại lệ chưa lường trước."
  },
  {
    id: 16,
    question: "Lỗi 'IndentationError' trong Python thường do nguyên nhân nào?",
    options: ["A. Thụt lề đầu dòng không đúng", "B. Chia cho số 0", "C. Nhập sai mật khẩu", "D. Thiếu dấu ngoặc kép"],
    correct: 0,
    explain: "Python dùng thụt lề để phân khối lệnh, sai thụt lề gây IndentationError."
  },
  {
    id: 17,
    question: "Lệnh int('abc') trong Python sẽ gây ra lỗi gì?",
    options: ["A. ValueError", "B. ZeroDivisionError", "C. IndexError", "D. SyntaxError"],
    correct: 0,
    explain: "Chuỗi 'abc' không thể chuyển đổi thành số nguyên nên gây ra ValueError."
  },
  {
    id: 18,
    question: "Lỗi 'IndexError' xuất hiện khi nào?",
    options: ["A. Truy cập chỉ số ngoài mảng", "B. Tên biến bị trùng nhau", "C. Quên đóng dấu ngoặc", "D. Chia một số cho số âm"],
    correct: 0,
    explain: "IndexError xảy ra khi gọi chỉ mục vượt quá phạm vi danh sách/mảng."
  },
  {
    id: 19,
    question: "Lỗi 'NameError' xảy ra khi nào?",
    options: ["A. Dùng biến chưa được định nghĩa", "B. Gõ đúng từ khóa ngôn ngữ", "C. Đổi tên tệp mã nguồn", "D. In ra màn hình quá nhiều"],
    correct: 0,
    explain: "NameError xuất hiện khi truy cập biến hoặc hàm chưa từng được gán hay tạo."
  },
  {
    id: 20,
    question: "Phép toán '5' + 3 trong Python gây lỗi gì?",
    options: ["A. TypeError (sai kiểu dữ liệu)", "B. ZeroDivisionError", "C. SyntaxError", "D. IndexError"],
    correct: 0,
    explain: "Không thể dùng toán tử + giữa chuỗi ký tự (str) và số nguyên (int)."
  },
  {
    id: 21,
    question: "Vòng lặp vô tận (Infinite loop) thường là lỗi thuộc loại nào?",
    options: ["A. Lỗi logic", "B. Lỗi cú pháp", "C. Lỗi phần cứng", "D. Lỗi đường truyền mạng"],
    correct: 0,
    explain: "Vòng lặp vô tận là lỗi logic do điều kiện dừng không bao giờ đạt được."
  },
  {
    id: 22,
    question: "Thuật toán tìm ƯCLN bằng phép trừ trong SGK Bài 30 kết thúc khi nào?",
    options: ["A. Khi m == n", "B. Khi m + n == 0", "C. Khi m * n == 0", "D. Khi m > n"],
    correct: 0,
    explain: "Vòng lặp while m != n lặp liên tục và kết thúc khi hai số bằng nhau (m == n)."
  },
  {
    id: 23,
    question: "Trong thuật toán trừ tìm ƯCLN, nếu nhập m=0 hoặc n=0 thì sao?",
    options: ["A. Vòng lặp chạy vô tận", "B. Tự động in ra số 1", "C. Máy tính tự tắt nguồn", "D. Báo lỗi cú pháp"],
    correct: 0,
    explain: "Phép trừ với 0 sẽ không bao giờ làm hai số bằng nhau, dẫn tới lặp vô tận."
  },
  {
    id: 24,
    question: "Nếu quên câu lệnh m = m - n trong vòng lặp while, điều gì xảy ra?",
    options: ["A. Vòng lặp chạy vô tận", "B. Báo lỗi SyntaxError", "C. Chương trình tự thoát", "D. In ra số 0 ngay"],
    correct: 0,
    explain: "Giá trị m không thay đổi dẫn đến điều kiện while luôn đúng vĩnh viễn."
  },
  {
    id: 25,
    question: "Khi kiểm thử một chương trình tính toán, ta nên thử với:",
    options: ["A. Nhiều bộ test đa dạng và biên", "B. Chỉ một số bất kỳ", "C. Chỉ số 10", "D. Không cần dữ liệu thử"],
    correct: 0,
    explain: "Cần nhiều bộ test đa dạng và bao quát các trường hợp biên để chắc chắn đúng."
  },
  {
    id: 26,
    question: "Lỗi cú pháp (SyntaxError) được phát hiện vào thời điểm nào?",
    options: ["A. Trước khi chương trình chạy", "B. Sau khi chạy xong kết quả", "C. Khi in tài liệu ra giấy", "D. Khi tắt máy tính"],
    correct: 0,
    explain: "Bộ thông dịch phát hiện lỗi cú pháp ngay khi phân tích mã trước khi chạy."
  },
  {
    id: 27,
    question: "Dòng lệnh print('Hello) thiếu dấu nháy đơn đóng sẽ gây lỗi gì?",
    options: ["A. SyntaxError", "B. ZeroDivisionError", "C. IndexError", "D. TypeError"],
    correct: 0,
    explain: "Thiếu dấu đóng nháy chuỗi là lỗi cú pháp (SyntaxError)."
  },
  {
    id: 28,
    question: "Chương trình chạy trơn tru nhưng ra kết quả sai là lỗi gì?",
    options: ["A. Lỗi ngữ nghĩa (Logic error)", "B. Lỗi cú pháp (Syntax error)", "C. Lỗi ngoại lệ (Runtime error)", "D. Lỗi hệ thống mạng"],
    correct: 0,
    explain: "Chương trình không dừng nhưng kết quả sai chính là lỗi ngữ nghĩa / logic."
  },
  {
    id: 29,
    question: "Khi gặp lỗi ngoại lệ, thông báo nào quan trọng nhất để sửa?",
    options: ["A. Tên lỗi và số dòng báo lỗi", "B. Màu sắc của cửa sổ mã", "C. Tên hệ điều hành máy", "D. Dung lượng RAM trống"],
    correct: 0,
    explain: "Tên loại lỗi và số dòng lệnh chỉ ra vị trí chính xác cần khắc phục."
  },
  {
    id: 30,
    question: "Trong công cụ gỡ lỗi, Step Into có tác dụng gì?",
    options: ["A. Đi vào bên trong hàm con", "B. Bỏ qua hàm con", "C. Dừng chương trình ngay", "D. Xóa hàm con"],
    correct: 0,
    explain: "Step Into đưa con trỏ gỡ lỗi đi vào từng lệnh bên trong hàm đang gọi."
  },
  {
    id: 31,
    question: "Trong công cụ gỡ lỗi, Step Over có tác dụng gì?",
    options: ["A. Chạy qua hàm con không vào trong", "B. Đi vào từng dòng trong hàm", "C. Thoát khỏi trình soạn thảo", "D. Xóa dòng lệnh kế tiếp"],
    correct: 0,
    explain: "Step Over thực thi hàm như một lệnh đơn và chuyển đến dòng kế tiếp."
  },
  {
    id: 32,
    question: "Tại sao thông thường không thể thử nghiệm hết mọi đầu vào?",
    options: ["A. Vì tập dữ liệu có thể vô hạn", "B. Do máy tính không có bộ nhớ", "C. Do ngôn ngữ Python cấm", "D. Do tốc độ mạng chậm"],
    correct: 0,
    explain: "Miền dữ liệu đầu vào thường rất lớn hoặc vô hạn nên không thể thử hết mọi ca."
  },
  {
    id: 33,
    question: "Chiến lược chọn dữ liệu thử nghiệm tối ưu là gì?",
    options: ["A. Chọn mẫu đại diện và vùng biên", "B. Thử hết toàn bộ số tự nhiên", "C. Chỉ chọn duy nhất số 0", "D. Chọn ngẫu nhiên không kiểm soát"],
    correct: 0,
    explain: "Chọn các tập mẫu đặc trưng đại diện và các giá trị biên nhạy cảm."
  },
  {
    id: 34,
    question: "Khi một phép tính bị chia cho 0, chương trình Python sẽ:",
    options: ["A. Báo ngoại lệ và dừng chạy", "B. Tự coi kết quả là vô cùng", "C. Tiếp tục chạy bình thường", "D. Tự xóa file mã nguồn"],
    correct: 0,
    explain: "Python lập tức dừng chương trình và quăng ra lỗi ZeroDivisionError."
  },
  {
    id: 35,
    question: "Danh sách a = [1, 2, 3], lệnh a[5] sẽ gây ra lỗi gì?",
    options: ["A. IndexError", "B. ValueError", "C. SyntaxError", "D. NameError"],
    correct: 0,
    explain: "Danh sách chỉ có 3 phần tử (chỉ số 0, 1, 2), truy cập a[5] bị IndexError."
  },
  {
    id: 36,
    question: "Lệnh x = input('Nhập số: ') trả về dữ liệu kiểu gì?",
    options: ["A. Kiểu chuỗi ký tự (str)", "B. Kiểu số nguyên (int)", "C. Kiểu số thực (float)", "D. Kiểu logic (bool)"],
    correct: 0,
    explain: "Hàm input() trong Python luôn trả về kiểu dữ liệu chuỗi (str)."
  },
  {
    id: 37,
    question: "Nếu quên ép kiểu int() khi tính x + 5 từ input(), lỗi gì xảy ra?",
    options: ["A. TypeError (cộng chuỗi với số)", "B. ZeroDivisionError", "C. SyntaxError", "D. IndexError"],
    correct: 0,
    explain: "Cộng chuỗi str với số int trong Python bị cấm và gây TypeError."
  },
  {
    id: 38,
    question: "Sau khi gỡ lỗi xong, ta nên làm gì với các lệnh print() phụ trợ?",
    options: ["A. Xóa bỏ hoặc chú thích lại", "B. Nhân đôi số lượng lên", "C. Chuyển thành lệnh input()", "D. Để nguyên làm chậm máy"],
    correct: 0,
    explain: "Cần xóa bỏ các lệnh print() tạm thời để chương trình sạch và tối ưu."
  },
  {
    id: 39,
    question: "Khái niệm 'Test Case' trong bài 30 tương đương với từ nào?",
    options: ["A. Bộ dữ liệu thử nghiệm", "B. Vỏ bọc máy tính", "C. Hộp đựng đĩa mềm", "D. Tủ tài liệu phòng Lab"],
    correct: 0,
    explain: "Test case là trường hợp kiểm thử / bộ dữ liệu thử nghiệm của bài toán."
  },
  {
    id: 40,
    question: "Mục tiêu cuối cùng của kiểm thử và gỡ lỗi là tạo ra chương trình:",
    options: ["A. Chạy đúng và tin cậy", "B. Có nhiều dòng code nhất", "C. Dung lượng lớn nhất", "D. Đổi màu chữ liên tục"],
    correct: 0,
    explain: "Đảm bảo chương trình hoạt động chính xác theo đúng yêu cầu đề bài."
  }
];

function getRandomQuestion(excludeId = null) {
  let available = QUESTIONS_BANK;
  if (excludeId !== null) {
    available = QUESTIONS_BANK.filter(q => q.id !== excludeId);
  }
  if (available.length === 0) available = QUESTIONS_BANK;
  const idx = Math.floor(Math.random() * available.length);
  return available[idx];
}

module.exports = {
  QUESTIONS_BANK,
  getRandomQuestion
};
