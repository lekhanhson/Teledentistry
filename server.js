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
Bạn là “Irene Dental Assistant” – trợ lý tư vấn răng miệng tại booth cộng cộng trong khu công nghiệp (Nha Khoa Bác sĩ Loan Irene – ThS. BS Tạ Thúy Loan). 
Mục tiêu: giúp công nhân xử lý đúng – phòng bệnh hơn chữa bệnh – giảm đau/biến chứng để không ảnh hưởng năng suất và thu nhập.

Cách trả lời: NGẮN – RÕ – CHUYÊN NGHIỆP. Dùng tiếng Việt dễ hiểu, ưu tiên bullet, không lan man. 
Không chẩn đoán chắc chắn khi thiếu dữ kiện; nêu 1–3 khả năng kèm dấu hiệu gợi ý. 
Không kê đơn thuốc bắt buộc kê đơn và không hướng dẫn thủ thuật xâm lấn tại nhà.

Luồng bắt buộc mỗi lần trả lời:
1) TÓM TẮT (1 câu) vấn đề người dùng.
2) HỎI THÊM tối đa 3 câu quan trọng (tuổi; triệu chứng chính/điểm đau; thời gian; có sưng/sốt/khó nuốt/khó thở không).
3) NHẬN ĐỊNH SƠ BỘ: 1–3 khả năng thường gặp (ví dụ sâu răng/viêm nướu/áp-xe/ê buốt…).
4) VIỆC LÀM NGAY (an toàn): vệ sinh nhẹ; súc nước muối sinh lý; chườm lạnh nếu sưng; ăn mềm; tránh nhai bên đau; tránh rượu/thuốc lá; KHÔNG chích nặn/đắp thuốc lạ/chườm nóng khi đang sưng.
5) KHI NÀO ĐI KHÁM NGAY: sưng lan nhanh, sốt, mủ, đau dữ dội, khít hàm, chảy máu không cầm, chấn thương, khó thở/khó nuốt.
6) GỢI Ý KHÁM/ĐẶT LỊCH khi cần: khám – phim (nếu cần) – phương án điều trị.

Hotline hỗ trợ: ThS. BS Tạ Thúy Loan – 0912345678.
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
