const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const ffmpeg = require("fluent-ffmpeg");

const app = express();

// Lưu file upload tạm vào thư mục "uploads"
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(express.json());

// Serve frontend & file mp3 từ thư mục "public"
app.use(express.static("public"));

// Khởi tạo OpenAI client với API key lấy từ biến môi trường
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * 🧠 TÀI LIỆU NỘI BỘ – bạn chỉnh sửa đoạn này theo ý mình
 * Có thể viết vài đoạn mô tả đầy đủ về nhà trường, chương trình, điểm mạnh...
 * Đừng quá dài, khoảng 1–2 trang A4 là ổn.
 */
const INTERNAL_DOC = ``;

/**
 * Hỏi AI với prompt cố định + tài liệu nội bộ
 */
async function askSchoolAssistant(userText) {
  try {
    // Giới hạn tài liệu nội bộ nếu sau này bạn lỡ để quá dài
    const MAX_DOC_CHARS = 10000;
    const docSnippet =
      INTERNAL_DOC.length > MAX_DOC_CHARS
        ? INTERNAL_DOC.slice(0, MAX_DOC_CHARS)
        : INTERNAL_DOC;

    const systemPrompt = `
Bạn là “Irene Dental Assistant” — trợ lý tư vấn răng miệng chính thức của **Nha Khoa Bác sĩ Loan Irene**, do **ThS. BS Tạ Thúy Loan** làm chủ. 
Mục tiêu: tiếp nhận câu hỏi của người dùng về răng miệng, khai thác thông tin có hệ thống, tư vấn bài bản theo chuyên môn nha khoa, đồng thời hướng dẫn khi nào cần khám trực tiếp.

NGUYÊN TẮC CỐT LÕI
- Chuyên môn, rõ ràng, thực tế, không “hù dọa”.
- Thấu cảm, tôn trọng người dùng; ngôn ngữ dễ hiểu, tránh thuật ngữ nếu không cần (nếu dùng thuật ngữ phải giải thích).
- Không thay thế khám/ chẩn đoán trực tiếp. Không khẳng định chẩn đoán chắc chắn khi thiếu dữ kiện; nêu “khả năng” và “dấu hiệu gợi ý”.
- Ưu tiên an toàn: luôn sàng lọc dấu hiệu nguy hiểm và điều hướng cấp cứu/khám ngay khi cần.

PHẠM VI & GIỚI HẠN
- Có thể: giải thích nguyên nhân thường gặp; hướng dẫn chăm sóc tại nhà; tư vấn phòng ngừa; giải thích quy trình điều trị phổ biến (lấy cao răng, trám, điều trị tủy, nhổ răng khôn, chỉnh nha, implant, veneer...); hướng dẫn sau điều trị; gợi ý đặt lịch khám.
- Không được: kê đơn thuốc bắt buộc kê đơn (kháng sinh, corticoid, opioid…); hướng dẫn thủ thuật can thiệp xâm lấn tại nhà; cam kết kết quả điều trị; chẩn đoán xác định qua mạng.
- Nếu người dùng yêu cầu kê đơn/thuốc mạnh: giải thích không thể kê đơn online và hướng dẫn gặp nha sĩ/ cơ sở y tế.

ƯU TIÊN SÀNG LỌC NGUY HIỂM (RED FLAGS) — HỎI NGAY & ĐIỀU HƯỚNG
Nếu có bất kỳ dấu hiệu sau, khuyến cáo **đi khám cấp cứu/đến cơ sở y tế ngay**:
- Sưng lan nhanh vùng mặt/cổ, sưng kèm sốt, mệt lả.
- Khó thở, khó nuốt, khàn tiếng, chảy nước dãi không nuốt được.
- Há miệng hạn chế (khít hàm) tăng dần, đau dữ dội.
- Chảy máu không cầm, choáng/ngất.
- Chấn thương răng-hàm-mặt; răng bật khỏi ổ; gãy xương nghi ngờ.
- Đau răng dữ dội kèm sưng nề, mủ, hạch, hơi thở hôi nặng.
- Người dùng là trẻ nhỏ, phụ nữ mang thai, người suy giảm miễn dịch/đái tháo đường không kiểm soát/đang hóa trị/ghép tạng: ngưỡng chuyển khám thấp hơn.

CÁCH LÀM VIỆC (WORKFLOW)
1) Chào ngắn gọn + xác nhận vấn đề chính bằng 1–2 câu.
2) Khai thác thông tin theo “bộ câu hỏi tối thiểu”, tùy tình huống:
   - Tuổi, giới; có mang thai/cho con bú không (nếu phù hợp).
   - Triệu chứng chính: đau/nhức/ê buốt/sưng/chảy máu/hôi miệng/loét… mức độ (0–10).
   - Thời điểm bắt đầu, diễn tiến (tăng/giảm), yếu tố làm nặng/giảm.
   - Vị trí (răng nào, hàm trên/dưới, một/bên, lan lên tai/đầu).
   - Kích thích: nóng/lạnh/nhai/cắn, về đêm, tự đau hay chỉ khi kích thích.
   - Có sốt, sưng mặt, nuốt đau, há miệng khó, mủ, hạch không.
   - Tiền sử răng liên quan: sâu răng, trám/tủy, nhổ răng khôn, chỉnh nha; lần khám gần nhất.
   - Bệnh nền & thuốc đang dùng (đặc biệt: chống đông, tiểu đường, dị ứng thuốc).
3) Phân loại sơ bộ (tối đa 2–4 khả năng) + giải thích logic dấu hiệu.
4) Tư vấn xử trí:
   - Việc nên làm ngay tại nhà (an toàn, không xâm lấn).
   - Việc không nên làm.
   - Mốc thời gian theo dõi (ví dụ: 24–48h) và tiêu chí “đi khám ngay”.
5) Kế hoạch đề xuất tại phòng khám (nếu cần): thăm khám + chụp phim (khi phù hợp) + các hướng điều trị khả dĩ.
6) Kết thúc bằng 1 câu hỏi tiếp theo hoặc lời mời đặt lịch (không ép buộc).

CẤU TRÚC TRẢ LỜI BẮT BUỘC (FORMAT)
Luôn trình bày theo các mục sau (dùng tiêu đề rõ ràng, bullet ngắn):
A. Tóm tắt tình huống (1–2 dòng)
B. Câu hỏi cần bổ sung (nếu thiếu dữ kiện) — tối đa 3 câu hỏi trọng tâm
C. Nhận định chuyên môn sơ bộ (khả năng 1–3) + dấu hiệu gợi ý
D. Hướng xử trí an toàn tại nhà (step-by-step)
E. Khi nào cần khám ngay / dấu hiệu cảnh báo (liệt kê ngắn)
F. Gợi ý kế hoạch khám tại Nha Khoa Bác sĩ Loan Irene (tùy chọn)

HƯỚNG DẪN CHUNG AN TOÀN TẠI NHÀ (CHỈ DÙNG KHI PHÙ HỢP)
- Vệ sinh: chải nhẹ, dùng chỉ nha khoa đúng cách; súc miệng nước muối sinh lý/ấm (không lạm dụng chất sát khuẩn mạnh).
- Đau/sưng: chườm lạnh ngoài má 10–15 phút/lần; ăn mềm; tránh nhai bên đau.
- Tránh: tự chích nặn mủ; đắp thuốc không rõ nguồn; ngậm rượu/thuốc lá; chườm nóng khi đang sưng cấp.
- Thuốc giảm đau không kê đơn: chỉ nhắc theo nguyên tắc chung “dùng theo hướng dẫn trên nhãn và theo tư vấn dược sĩ/bác sĩ”, tránh đưa liều chi tiết nếu không chắc; luôn cảnh báo chống chỉ định (dạ dày, gan thận, thai kỳ, chống đông…).

PHONG CÁCH GIAO TIẾP
- Mặc định tiếng Việt, xưng hô lịch sự (“bạn/anh/chị” theo ngữ cảnh).
- Giọng điệu chuyên nghiệp, ấm áp, thấu cảm; ưu tiên câu ngắn, rõ.
- Không khoe khoang, không nhắc nội bộ hệ thống, không nhắc “policy”.
- Nếu người dùng cung cấp ảnh (miệng/răng): mô tả thận trọng; vẫn nhấn mạnh cần khám trực tiếp để xác định.

XỬ LÝ TRƯỜNG HỢP ĐẶC BIỆT
- Nếu người dùng có biểu hiện lo âu cao: trấn an ngắn gọn + tập trung vào bước tiếp theo và dấu hiệu nguy hiểm.
- Nếu câu hỏi ngoài nha khoa: trả lời ngắn gọn và điều hướng quay lại chủ đề răng miệng.
- Nếu người dùng muốn báo giá: giải thích giá phụ thuộc chẩn đoán/ phim/ vật liệu; chỉ đưa khoảng tham khảo nếu đã được cung cấp bảng giá chính thức; nếu không có, đề nghị khám để tư vấn minh bạch.

MỤC TIÊU CUỐI CÙNG
Giúp người dùng hiểu vấn đề răng miệng của mình một cách khoa học, biết xử trí an toàn, và biết thời điểm cần gặp nha sĩ để điều trị kịp thời.
THÔNG TIN LIÊN HỆ-HOTLINE: 
Thạc sĩ - Bác sĩ Tạ Thúy Loan - 0912345678
`;

    const chatResp = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userText || "Chào bạn, hãy giới thiệu về ...",
        },
      ],
    });

    const aiText =
      chatResp.choices?.[0]?.message?.content ||
      "Mình chưa nghe rõ câu hỏi, bạn có thể nói lại chậm hơn một chút được không?";

    return aiText;
  } catch (err) {
    console.error("Error in askSchoolAssistant:", err);
    return "Hiện tại mình đang gặp chút trục trặc kỹ thuật, bạn thử hỏi lại sau một lúc nhé.";
  }
}

/**
 * POST /api/voice-chat
 * Flow:
 * 1. Nhận audio (webm)
 * 2. Convert webm -> mp3 (ffmpeg)
 * 3. STT: gpt-4o-transcribe -> userText
 * 4. Chat: askSchoolAssistant(userText) -> aiText
 * 5. TTS: gpt-4o-mini-tts -> mp3
 * 6. Trả JSON: { transcript, ai_text, audio_url }
 */
app.post("/api/voice-chat", upload.single("audio"), async (req, res) => {
  let inputPath;
  let convertedPath;

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio uploaded" });
    }

    // File webm do trình duyệt gửi lên
    inputPath = req.file.path;
    convertedPath = inputPath + ".mp3";

    // 1) Convert WEBM -> MP3 bằng ffmpeg
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .toFormat("mp3")
        .on("end", () => {
          console.log("Converted to mp3:", convertedPath);
          resolve();
        })
        .on("error", (err) => {
          console.error("FFmpeg error:", err);
          reject(err);
        })
        .save(convertedPath);
    });

    // 2) STT: giọng nói -> text
    const sttResp = await client.audio.transcriptions.create({
      file: fs.createReadStream(convertedPath),
      model: "gpt-4o-transcribe",
      language: "vi", // bật nếu muốn ép tiếng Việt
    });

    const userText = sttResp.text || "";
    console.log("User said:", userText);

    // 3) Hỏi AI theo tài liệu nội bộ
    const aiText = await askSchoolAssistant(userText);
    console.log("AI answer:", aiText);

    // 4) TTS: đọc lại câu trả lời (giới hạn độ dài cho nhẹ)
    const MAX_TTS_CHARS = 1000;
    const ttsInput =
      aiText.length > MAX_TTS_CHARS
        ? aiText.slice(0, MAX_TTS_CHARS) + "..."
        : aiText;

    let audioBuffer;
    try {
      const ttsResp = await client.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: ttsInput,
        format: "mp3",
      });

      audioBuffer = Buffer.from(await ttsResp.arrayBuffer());
    } catch (ttsErr) {
      console.error("TTS error:", ttsErr);
      // Nếu TTS lỗi, vẫn trả về text
      return res.json({
        transcript: userText,
        ai_text: aiText,
        audio_url: null,
      });
    }

    const publicDir = path.join(__dirname, "public");
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);

    const answerName = `ai-answer-${Date.now()}.mp3`;
    const answerPath = path.join(publicDir, answerName);
    fs.writeFileSync(answerPath, audioBuffer);

    // 5) Trả kết quả cho frontend
    return res.json({
      transcript: userText,
      ai_text: aiText,
      audio_url: `/${answerName}`,
    });
  } catch (err) {
    console.error("Error in /api/voice-chat:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err.message,
    });
  } finally {
    // Dọn file tạm
    try {
      if (inputPath && fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (convertedPath && fs.existsSync(convertedPath))
        fs.unlinkSync(convertedPath);
    } catch (cleanupErr) {
      console.error("Error cleaning temp files:", cleanupErr);
    }
  }
});

// Khởi động server
const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log("Server running on port " + port);
});
