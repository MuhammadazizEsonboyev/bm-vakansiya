/**
 * Vacancy / Anketa qabul qiluvchi Telegram bot (node-telegram-bot-api)
 * - Siz bergan tartibda anketa to‘ldiradi
 * - Oxirida rasm qabul qiladi
 * - Yakunda ADMIN (guruh/kanal) ga rasm + chiroyli formatlangan anketa yuboradi
 * - Mijozga “Tez orada bog‘lanamiz” degan javob qaytaradi
 */

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

const token = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

if (!token) {
  console.error("❌ BOT_TOKEN topilmadi. .env faylga BOT_TOKEN yozing.");
  process.exit(1);
}
if (!ADMIN_CHAT_ID) {
  console.error("❌ ADMIN_CHAT_ID topilmadi. .env faylga ADMIN_CHAT_ID yozing.");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Har bir foydalanuvchi uchun session
const sessions = new Map();

/** HTML xavfsizligi uchun */
function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Siz aytgan aniq tartib:
 * 1) fullName
 * 2) birthDate
 * 3) phone
 * 4) address
 * 5) education
 * 6) university
 * 7) experience
 * 8) languages
 * 9) certificates
 * 10) photo
 */
const steps = [
  {
    key: "fullName",
    ask: "1) ✅ <b>To‘liq ismingizni (F.I.Sh)</b> yozing:",
    validate: (t) => (t || "").trim().length >= 5,
    error: "❗️F.I.Sh ni to‘liq kiriting (kamida 5 ta belgi).",
  },
  {
    key: "birthDate",
    ask: "2) 🎂 <b>Tug‘ilgan sana</b> (masalan: <code>2004-05-17</code> yoki <code>17.05.2004</code>):",
    validate: (t) =>
      /^(\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})$/.test((t || "").trim()),
    error: "❗️Sana format xato. Masalan: 2004-05-17 yoki 17.05.2004",
  },
  {
    key: "phone",
    ask: "3) 📞 <b>Telefon raqami</b> (masalan: <code>+998901234567</code>):",
    validate: (t) => /^\+?\d[\d\s()-]{8,}$/.test((t || "").trim()),
    error: "❗️Telefon raqam noto‘g‘ri. Masalan: +998901234567",
  },
  {
    key: "address",
    ask: "4) 📍 <b>Yashash manzili</b> (Shahar/Tuman):",
    validate: (t) => (t || "").trim().length >= 2,
    error: "❗️Manzilni kiriting (kamida 2 ta belgi).",
  },
  {
    key: "education",
    ask: "5) 🎓 <b>Ma’lumotingiz</b> (masalan: Oliy / O‘rta-maxsus / O‘rta):",
    validate: (t) => (t || "").trim().length >= 2,
    error: "❗️Ma’lumot turini kiriting.",
  },
  {
    key: "university",
    ask: "6) 🏛 <b>Qaysi universitetni tamomlagansiz?</b>\nAgar tamomlamagan bo‘lsangiz: <code>O‘qiyapman</code> deb yozing.",
    validate: (t) => (t || "").trim().length >= 2,
    error: "❗️Universitet nomini yozing yoki `O‘qiyapman` deb yozing.",
  },
  {
    key: "experience",
    ask: "7) 💼 <b>Oldin qaysi korxonada ishlagansiz?</b>\n(Nomi + necha yil)\nMasalan: <code>ABC MCHJ — 2 yil</code>\nAgar ishlamagan bo‘lsangiz: <code>-</code> deb yozing.",
    validate: (t) => (t || "").trim().length >= 1,
    error: "❗️Ma’lumot kiriting yoki `-` yozing.",
  },
  {
    key: "languages",
    ask: "8) 🌍 <b>Qaysi chet tillarini bilasiz va qaysi darajada?</b>\nMasalan: <code>Ingliz — B2, Rus — B1</code>\nBo‘lmasa: <code>-</code> deb yozing.",
    validate: (t) => (t || "").trim().length >= 1,
    error: "❗️Ma’lumot kiriting yoki `-` yozing.",
  },
  {
    key: "certificates",
    ask: "9) 🏅 <b>Milliy yoki Xalqaro sertifikatlaringiz bormi?</b>\nMasalan: <code>CEFR B2 (2025), IELTS 6.0</code>\nBo‘lmasa: <code>-</code> deb yozing.",
    validate: (t) => (t || "").trim().length >= 1,
    error: "❗️Ma’lumot kiriting yoki `-` yozing.",
  },
  {
    key: "photo",
    ask: "10) 🖼 Endi <b>rasmingizni</b> yuboring (Photo qilib).",
    type: "photo",
  },
];

function resetSession(chatId) {
  sessions.delete(chatId);
}

function menu(chatId) {
  return bot.sendMessage(chatId, "👇 Menyu:", {
    reply_markup: {
      keyboard: [[{ text: "📝 Anketa to‘ldirish" }], [{ text: "ℹ️ Ma’lumot" }]],
      resize_keyboard: true,
    },
  });
}

async function startForm(chatId) {
  sessions.set(chatId, { stepIndex: 0, data: {} });
  await bot.sendMessage(
    chatId,
    "✅ <b>Anketa boshlandi.</b>\nSavollarga ketma-ket javob bering.\nBekor qilish: /cancel",
    { parse_mode: "HTML" }
  );
  return askNext(chatId);
}

function askNext(chatId) {
  const session = sessions.get(chatId);
  if (!session) return;

  const step = steps[session.stepIndex];
  bot.sendMessage(chatId, step.ask, { parse_mode: "HTML" });
}

function formatAdminText(d, msg) {
  const username = msg?.from?.username ? `@${msg.from.username}` : "-";
  const tgName = [msg?.from?.first_name, msg?.from?.last_name].filter(Boolean).join(" ");
  const userLink = msg?.from?.id
    ? `<a href="tg://user?id=${msg.from.id}">${escapeHtml(tgName || "Foydalanuvchi")}</a>`
    : "Foydalanuvchi";

  return (
    "📥 <b>Yangi anketa</b>\n" +
    "━━━━━━━━━━━━━━━━━━\n" +
    `👤 <b>F.I.Sh:</b> ${escapeHtml(d.fullName)}\n` +
    `🎂 <b>Tug‘ilgan sana:</b> ${escapeHtml(d.birthDate)}\n` +
    `📞 <b>Telefon:</b> ${escapeHtml(d.phone)}\n` +
    `📍 <b>Manzil:</b> ${escapeHtml(d.address)}\n` +
    "━━━━━━━━━━━━━━━━━━\n" +
    `🎓 <b>Ma’lumoti:</b> ${escapeHtml(d.education)}\n` +
    `🏛 <b>Universitet:</b> ${escapeHtml(d.university)}\n` +
    "━━━━━━━━━━━━━━━━━━\n" +
    `💼 <b>Ish tajribasi:</b> ${escapeHtml(d.experience)}\n` +
    `🌍 <b>Chet tillari:</b> ${escapeHtml(d.languages)}\n` +
    `🏅 <b>Sertifikatlar:</b> ${escapeHtml(d.certificates)}\n` +
    "━━━━━━━━━━━━━━━━━━\n" +
    `👤 <b>Telegram:</b> ${userLink}\n` +
    `🔖 <b>Username:</b> ${escapeHtml(username)}`
  );
}

async function sendToAdmin(userChatId, data, userMsg) {
  const text = formatAdminText(data, userMsg);

  try {
    // Rasm bo‘lsa: rasm + caption qilib yuboramiz
    if (data.photoFileId) {
      await bot.sendPhoto(ADMIN_CHAT_ID, data.photoFileId, {
        caption: text,
        parse_mode: "HTML",
      });
    } else {
      // bo‘lmasa: faqat matn
      await bot.sendMessage(ADMIN_CHAT_ID, text, { parse_mode: "HTML" });
    }

    // Admin tugmalar
    await bot.sendMessage(ADMIN_CHAT_ID, "👇 <b>Admin amali:</b>", {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Qabul qilindi", callback_data: `accept:${userChatId}` },
            { text: "❌ Rad etildi", callback_data: `reject:${userChatId}` },
          ],
        ],
      },
    });
  } catch (e) {
    console.log("❌ Guruhga yuborishda xato:", e.response?.body || e.message);
    await bot.sendMessage(
      userChatId,
      "❗️Anketa admin guruhga yuborilmadi.\nADMIN_CHAT_ID yoki bot guruh ruxsatlarini tekshiring."
    );
  }
}

// /start
bot.onText(/\/start/, (msg) => menu(msg.chat.id));

// /cancel
bot.onText(/\/cancel/, (msg) => {
  resetSession(msg.chat.id);
  bot.sendMessage(msg.chat.id, "❌ Bekor qilindi.");
  menu(msg.chat.id);
});

// (Ixtiyoriy) Guruh ID ni terminalga chiqarib beradi — faqat guruhda xabar bo‘lsa
bot.on("message", (msg) => {
  if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
    console.log("✅ GROUP CHAT ID:", msg.chat.id);
  }
});

// Asosiy message handler
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Menyu
  if (text === "📝 Anketa to‘ldirish") return startForm(chatId);

  if (text === "ℹ️ Ma’lumot") {
    return bot.sendMessage(
      chatId,
      "Bu bot vakansiya/ish uchun anketa qabul qiladi.\n📝 <b>Anketa to‘ldirish</b> tugmasini bosing.",
      { parse_mode: "HTML" }
    );
  }

  // Session bormi?
  const session = sessions.get(chatId);
  if (!session) return;

  const step = steps[session.stepIndex];
  if (!step) return;

  // Photo bosqichi
  if (step.type === "photo") {
    if (!msg.photo || msg.photo.length === 0) {
      return bot.sendMessage(chatId, "❗️Iltimos, rasmni <b>Photo</b> qilib yuboring.", {
        parse_mode: "HTML",
      });
    }

    const best = msg.photo[msg.photo.length - 1];
    session.data.photoFileId = best.file_id;

    // Yakun
    await bot.sendMessage(
      chatId,
      "✅ <b>Anketangiz qabul qilindi!</b>\nRahmat. Tez orada siz bilan bog‘lanamiz. 📞",
      { parse_mode: "HTML" }
    );

    await sendToAdmin(chatId, session.data, msg);

    resetSession(chatId);
    return menu(chatId);
  }

  // Text bosqichlari
  if (!text) return;

  if (step.validate && !step.validate(text)) {
    return bot.sendMessage(chatId, step.error);
  }

  session.data[step.key] = text.trim();
  session.stepIndex++;
  sessions.set(chatId, session);

  // Keyingi savol
  return askNext(chatId);
});

// Admin callback: accept/reject
bot.on("callback_query", async (q) => {
  const data = q.data || "";
  const [action, userChatId] = data.split(":");

  if (!action || !userChatId) return bot.answerCallbackQuery(q.id);

  let msgToUser = "";
  if (action === "accept")
    msgToUser = "✅ Anketangiz ko‘rib chiqildi. Siz bilan tez orada bog‘lanamiz!";
  if (action === "reject")
    msgToUser = "❌ Anketangiz ko‘rib chiqildi. Afsus, hozircha rad etildi.";

  try {
    if (msgToUser) await bot.sendMessage(userChatId, msgToUser);
    await bot.answerCallbackQuery(q.id, { text: "Bajarildi ✅" });
  } catch (e) {
    await bot.answerCallbackQuery(q.id, { text: "Userga yuborib bo‘lmadi" });
  }
});
