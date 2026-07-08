import { createClient } from "@supabase/supabase-js";

const TELEGRAM_API = "https://api.telegram.org/bot";

const requiredEnv = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const optionalEnv = ["PUBLIC_APP_URL"];

function getSafeDiagnostics() {
  return {
    ok: true,
    endpoint: "telegram webhook",
    message: "Endpoint is deployed. Telegram must call this URL with POST.",
    env: Object.fromEntries([
      ...requiredEnv.map((name) => [name, Boolean(process.env[name])]),
      ...optionalEnv.map((name) => [name, Boolean(process.env[name])]),
    ]),
    ui: "button-based v11 edit + webapp",
  };
}

function getEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function getAppUrl() {
  const explicit = String(process.env.PUBLIC_APP_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercelUrl = String(process.env.VERCEL_URL || "").trim();
  if (vercelUrl) return `https://${vercelUrl}`.replace(/\/$/, "");

  return "";
}

function webAppButton() {
  const url = getAppUrl();
  if (!url) return { text: "🌐 وب‌اپ", callback_data: "webapp_missing" };
  return { text: "🌐 باز کردن وب‌اپ", web_app: { url } };
}

function getSupabase() {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function normalizeUsername(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getMessage(update) {
  return update?.message || update?.edited_message || null;
}

function getText(update) {
  return getMessage(update)?.text?.trim() || "";
}

function cleanPreview(value, limit = 90) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

function truncate(value, limit = 3600) {
  const text = String(value || "").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

function mainKeyboard(isLinked = false) {
  if (!isLinked) {
    return {
      inline_keyboard: [
        [{ text: "🔗 اتصال حساب", callback_data: "connect" }],
        [webAppButton()],
        [{ text: "ℹ️ راهنما", callback_data: "help" }],
      ],
    };
  }

  return {
    inline_keyboard: [
      [
        { text: "➕ افزودن یادداشت", callback_data: "add" },
        { text: "📝 یادداشت‌ها", callback_data: "notes" },
      ],
      [
        { text: "🔎 جستجو", callback_data: "search" },
        { text: "ℹ️ راهنما", callback_data: "help" },
      ],
      [webAppButton()],
      [{ text: "🔌 قطع اتصال", callback_data: "unlink" }],
    ],
  };
}

function backKeyboard() {
  return {
    inline_keyboard: [[{ text: "🏠 منوی اصلی", callback_data: "menu" }]],
  };
}

function cancelKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "لغو", callback_data: "cancel" }],
      [{ text: "🏠 منوی اصلی", callback_data: "menu" }],
    ],
  };
}

function buildHelp() {
  return [
    "دفترچه یادداشت تلگرام آماده است 👋",
    "",
    "از دکمه‌های پایین استفاده کن:",
    "➕ افزودن یادداشت",
    "📝 دیدن لیست یادداشت‌ها",
    "🔎 جستجو داخل یادداشت‌ها",
    "✏️ ویرایش متن یادداشت",
    "📌 پین/آن‌پین یادداشت",
    "🗑 حذف یادداشت با تأیید",
    "🌐 باز کردن وب‌اپ داخل تلگرام",
    "",
    "برای اتصال حساب، فقط یک بار این دستور را بفرست:",
    "/connect username password",
    "مثال:",
    "/connect ali_123 1234",
  ].join("\n");
}

function splitAddCommand(text) {
  const raw = text.replace(/^\/add(@\w+)?\s*/i, "").trim();
  if (!raw) return null;

  const parts = raw.split("|");
  const title = (parts[0] || "").trim();
  const content = parts.slice(1).join("|").trim() || title;

  return {
    title: title.slice(0, 120) || "یادداشت تلگرام",
    content,
  };
}

async function telegram(method, payload) {
  const token = getEnv("TELEGRAM_BOT_TOKEN");
  const response = await fetch(`${TELEGRAM_API}${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram ${method} failed: ${errorText}`);
  }

  return response.json();
}

async function sendMessage(chatId, text, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };

  if (replyMarkup) payload.reply_markup = replyMarkup;

  return telegram("sendMessage", payload);
}

async function editMessage(chatId, messageId, text, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
  };

  if (replyMarkup) payload.reply_markup = replyMarkup;

  try {
    return await telegram("editMessageText", payload);
  } catch (error) {
    // If Telegram refuses editing an old message, fall back to sending a new one.
    return sendMessage(chatId, text, replyMarkup);
  }
}

async function answerCallback(callbackQueryId, text = "") {
  if (!callbackQueryId) return;
  return telegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  });
}

async function getLinkedUser(supabase, chatId) {
  const { data, error } = await supabase
    .from("app_telegram_links")
    .select("user_id, bot_state, bot_payload, app_users(username)")
    .eq("chat_id", chatId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function setBotState(supabase, chatId, state, payload = null) {
  const { error } = await supabase
    .from("app_telegram_links")
    .update({
      bot_state: state,
      bot_payload: payload,
      last_seen_at: new Date().toISOString(),
    })
    .eq("chat_id", chatId);

  if (error) throw error;
}

async function clearBotState(supabase, chatId) {
  await setBotState(supabase, chatId, null, null);
}

async function updateLastSeen(supabase, chatId) {
  const { error } = await supabase
    .from("app_telegram_links")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("chat_id", chatId);

  if (error) throw error;
}

async function showMainMenu({ supabase, chatId, messageId = null }) {
  const linked = await getLinkedUser(supabase, chatId);
  const username = linked?.app_users?.username || linked?.app_users?.[0]?.username || "";
  const text = linked?.user_id
    ? `منوی اصلی دفترچه یادداشت\n${username ? `حساب متصل: ${username}\n` : ""}\nیکی از گزینه‌ها را انتخاب کن:`
    : "برای استفاده از بات، اول حساب وب‌اپت را وصل کن:";

  if (messageId) return editMessage(chatId, messageId, text, mainKeyboard(Boolean(linked?.user_id)));
  return sendMessage(chatId, text, mainKeyboard(Boolean(linked?.user_id)));
}

async function handleConnect({ supabase, chatId, from, text }) {
  const args = text.replace(/^\/connect(@\w+)?\s*/i, "").trim().split(/\s+/);
  const username = normalizeUsername(args[0]);
  const password = args[1];

  if (!username || !password) {
    await sendMessage(
      chatId,
      "برای اتصال، این دستور را با یوزرنیم و رمز بفرست:\n/connect username password\n\nمثال:\n/connect ali_123 1234",
      backKeyboard(),
    );
    return;
  }

  const { data: loginData, error: loginError } = await supabase.rpc("app_login", {
    p_username: username,
    p_password: password,
  });

  if (loginError || !loginData?.userId) {
    await sendMessage(chatId, "یوزرنیم یا رمز عبور اشتباه است.", backKeyboard());
    return;
  }

  const { error: linkError } = await supabase.from("app_telegram_links").upsert(
    {
      chat_id: chatId,
      telegram_user_id: from?.id ?? chatId,
      telegram_username: from?.username ?? null,
      first_name: from?.first_name ?? null,
      user_id: loginData.userId,
      linked_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      bot_state: null,
      bot_payload: null,
    },
    { onConflict: "chat_id" },
  );

  if (linkError) throw linkError;

  await sendMessage(chatId, `حساب ${loginData.username} با موفقیت وصل شد ✅`, mainKeyboard(true));
}

async function requireLinked(supabase, chatId) {
  const linked = await getLinkedUser(supabase, chatId);
  if (!linked?.user_id) {
    await sendMessage(chatId, "اول حساب را وصل کن:", mainKeyboard(false));
    return null;
  }
  return linked;
}

async function fetchNotes(supabase, userId, limit = 10) {
  const { data, error } = await supabase
    .from("app_notes")
    .select("id,title,content,is_pinned,updated_at")
    .eq("user_id", userId)
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

function notesKeyboard(notes) {
  const rows = notes.map((note, index) => {
    const pin = note.is_pinned ? "📌 " : "";
    return [{ text: `${index + 1}. ${pin}${cleanPreview(note.title || "بدون عنوان", 28)}`, callback_data: `view:${note.id}` }];
  });

  rows.push([{ text: "➕ افزودن یادداشت", callback_data: "add" }]);
  rows.push([{ text: "🏠 منوی اصلی", callback_data: "menu" }]);

  return { inline_keyboard: rows };
}

async function showNotes({ supabase, chatId, messageId = null }) {
  const linked = await requireLinked(supabase, chatId);
  if (!linked) return;

  await clearBotState(supabase, chatId);
  const notes = await fetchNotes(supabase, linked.user_id, 10);

  if (!notes.length) {
    const text = "هنوز یادداشتی نداری. با دکمه زیر اولین یادداشتت را بساز.";
    const keyboard = {
      inline_keyboard: [
        [{ text: "➕ افزودن یادداشت", callback_data: "add" }],
        [{ text: "🏠 منوی اصلی", callback_data: "menu" }],
      ],
    };
    if (messageId) return editMessage(chatId, messageId, text, keyboard);
    return sendMessage(chatId, text, keyboard);
  }

  const text = "یادداشت‌هایت را انتخاب کن:";
  if (messageId) return editMessage(chatId, messageId, text, notesKeyboard(notes));
  return sendMessage(chatId, text, notesKeyboard(notes));
}

async function fetchNoteById(supabase, userId, noteId) {
  const { data, error } = await supabase
    .from("app_notes")
    .select("id,title,content,is_pinned,updated_at")
    .eq("user_id", userId)
    .eq("id", noteId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function noteActionKeyboard(note) {
  return {
    inline_keyboard: [
      [
        { text: "✏️ ویرایش متن", callback_data: `edit:${note.id}` },
        { text: note.is_pinned ? "📍 برداشتن پین" : "📌 پین کردن", callback_data: `pin:${note.id}` },
      ],
      [
        { text: "🗑 حذف", callback_data: `del:${note.id}` },
        webAppButton(),
      ],
      [{ text: "📝 برگشت به لیست", callback_data: "notes" }],
      [{ text: "🏠 منوی اصلی", callback_data: "menu" }],
    ],
  };
}

async function showNote({ supabase, chatId, messageId, noteId }) {
  const linked = await requireLinked(supabase, chatId);
  if (!linked) return;

  await clearBotState(supabase, chatId);
  const note = await fetchNoteById(supabase, linked.user_id, noteId);

  if (!note) {
    await editMessage(chatId, messageId, "این یادداشت پیدا نشد یا حذف شده است.", backKeyboard());
    return;
  }

  const title = note.title?.trim() || "بدون عنوان";
  const content = note.content?.trim() || "بدون متن";
  const text = `${note.is_pinned ? "📌 " : ""}${title}\n\n${truncate(content)}`;
  await editMessage(chatId, messageId, text, noteActionKeyboard(note));
}

async function createTelegramNote({ supabase, chatId, title, content }) {
  const linked = await requireLinked(supabase, chatId);
  if (!linked) return;

  const { data, error } = await supabase
    .from("app_notes")
    .insert({
      user_id: linked.user_id,
      title: title || "یادداشت تلگرام",
      content: content || "",
    })
    .select("id,title,content,is_pinned,updated_at")
    .single();

  if (error) throw error;

  await clearBotState(supabase, chatId);
  await updateLastSeen(supabase, chatId);

  await sendMessage(chatId, "یادداشت ذخیره شد ✅", {
    inline_keyboard: [
      [{ text: "مشاهده یادداشت", callback_data: `view:${data.id}` }],
      [
        { text: "➕ افزودن بعدی", callback_data: "add" },
        { text: "📝 لیست یادداشت‌ها", callback_data: "notes" },
      ],
      [{ text: "🏠 منوی اصلی", callback_data: "menu" }],
    ],
  });
}

async function updateTelegramNote({ supabase, chatId, noteId, text }) {
  const linked = await requireLinked(supabase, chatId);
  if (!linked) return;

  const note = await fetchNoteById(supabase, linked.user_id, noteId);
  if (!note) {
    await clearBotState(supabase, chatId);
    await sendMessage(chatId, "این یادداشت پیدا نشد یا حذف شده است.", backKeyboard());
    return;
  }

  const raw = String(text || "").trim();
  if (!raw) {
    await setBotState(supabase, chatId, "awaiting_edit_note", { noteId });
    await sendMessage(chatId, "متن جدید خالی است. دوباره متن یادداشت را بفرست:", cancelKeyboard());
    return;
  }

  let title = note.title || "بدون عنوان";
  let content = raw;

  if (raw.includes("|")) {
    const parts = raw.split("|");
    title = (parts[0] || "").trim() || title;
    content = parts.slice(1).join("|").trim() || "";
  }

  const { data, error } = await supabase
    .from("app_notes")
    .update({
      title: title.slice(0, 120),
      content,
      updated_at: new Date().toISOString(),
    })
    .eq("id", note.id)
    .eq("user_id", linked.user_id)
    .select("id,title,content,is_pinned,updated_at")
    .single();

  if (error) throw error;

  await clearBotState(supabase, chatId);
  await updateLastSeen(supabase, chatId);

  await sendMessage(chatId, "یادداشت ویرایش شد ✅", {
    inline_keyboard: [
      [{ text: "مشاهده یادداشت", callback_data: `view:${data.id}` }],
      [
        { text: "✏️ ویرایش دوباره", callback_data: `edit:${data.id}` },
        { text: "📝 لیست یادداشت‌ها", callback_data: "notes" },
      ],
      [{ text: "🏠 منوی اصلی", callback_data: "menu" }],
    ],
  });
}

async function askEditNote({ supabase, chatId, messageId, noteId }) {
  const linked = await requireLinked(supabase, chatId);
  if (!linked) return;

  const note = await fetchNoteById(supabase, linked.user_id, noteId);
  if (!note) {
    await editMessage(chatId, messageId, "این یادداشت پیدا نشد یا حذف شده است.", backKeyboard());
    return;
  }

  await setBotState(supabase, chatId, "awaiting_edit_note", { noteId });
  const text = [
    `در حال ویرایش: ${note.title || "بدون عنوان"}`,
    "",
    "متن جدید یادداشت را بفرست.",
    "اگر می‌خواهی عنوان هم تغییر کند، این فرمت را بفرست:",
    "عنوان جدید | متن جدید",
    "",
    "متن فعلی:",
    truncate(note.content || "بدون متن", 900),
  ].join("\n");

  await editMessage(chatId, messageId, text, cancelKeyboard());
}

async function handleSearchText({ supabase, chatId, keyword, messageId = null }) {
  const linked = await requireLinked(supabase, chatId);
  if (!linked) return;

  const safeKeyword = String(keyword || "").replace(/[%,()]/g, " ").trim();
  if (!safeKeyword) {
    await setBotState(supabase, chatId, "awaiting_search");
    await sendMessage(chatId, "کلمه جستجو را بفرست:", cancelKeyboard());
    return;
  }

  const { data, error } = await supabase
    .from("app_notes")
    .select("id,title,content,is_pinned,updated_at")
    .eq("user_id", linked.user_id)
    .or(`title.ilike.%${safeKeyword}%,content.ilike.%${safeKeyword}%`)
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) throw error;

  await clearBotState(supabase, chatId);

  if (!data?.length) {
    const text = `برای «${safeKeyword}» چیزی پیدا نشد.`;
    if (messageId) return editMessage(chatId, messageId, text, backKeyboard());
    return sendMessage(chatId, text, backKeyboard());
  }

  const text = `نتیجه جستجو برای «${safeKeyword}»:‌\nیکی را انتخاب کن:`;
  if (messageId) return editMessage(chatId, messageId, text, notesKeyboard(data));
  return sendMessage(chatId, text, notesKeyboard(data));
}

async function togglePin({ supabase, chatId, messageId, noteId }) {
  const linked = await requireLinked(supabase, chatId);
  if (!linked) return;

  const note = await fetchNoteById(supabase, linked.user_id, noteId);
  if (!note) {
    await editMessage(chatId, messageId, "این یادداشت پیدا نشد.", backKeyboard());
    return;
  }

  const { error } = await supabase
    .from("app_notes")
    .update({ is_pinned: !note.is_pinned, updated_at: new Date().toISOString() })
    .eq("id", note.id)
    .eq("user_id", linked.user_id);

  if (error) throw error;

  await showNote({ supabase, chatId, messageId, noteId });
}

async function confirmDelete({ supabase, chatId, messageId, noteId }) {
  const linked = await requireLinked(supabase, chatId);
  if (!linked) return;
  const note = await fetchNoteById(supabase, linked.user_id, noteId);

  if (!note) {
    await editMessage(chatId, messageId, "این یادداشت پیدا نشد.", backKeyboard());
    return;
  }

  await editMessage(chatId, messageId, `یادداشت «${note.title || "بدون عنوان"}» حذف شود؟`, {
    inline_keyboard: [
      [
        { text: "بله، حذف کن", callback_data: `delok:${note.id}` },
        { text: "لغو", callback_data: `view:${note.id}` },
      ],
      [{ text: "🏠 منوی اصلی", callback_data: "menu" }],
    ],
  });
}

async function deleteNote({ supabase, chatId, messageId, noteId }) {
  const linked = await requireLinked(supabase, chatId);
  if (!linked) return;

  const { error } = await supabase.from("app_notes").delete().eq("id", noteId).eq("user_id", linked.user_id);
  if (error) throw error;

  await editMessage(chatId, messageId, "یادداشت حذف شد ✅", {
    inline_keyboard: [
      [{ text: "📝 برگشت به لیست", callback_data: "notes" }],
      [{ text: "🏠 منوی اصلی", callback_data: "menu" }],
    ],
  });
}

async function confirmUnlink({ chatId, messageId }) {
  await editMessage(chatId, messageId, "اتصال تلگرام از حساب قطع شود؟", {
    inline_keyboard: [
      [
        { text: "بله، قطع کن", callback_data: "unlinkok" },
        { text: "لغو", callback_data: "menu" },
      ],
    ],
  });
}

async function handleUnlink({ supabase, chatId, messageId = null }) {
  const { error } = await supabase.from("app_telegram_links").delete().eq("chat_id", chatId);
  if (error) throw error;

  const text = "اتصال تلگرام از حساب قطع شد.";
  if (messageId) return editMessage(chatId, messageId, text, mainKeyboard(false));
  return sendMessage(chatId, text, mainKeyboard(false));
}

async function handleCallback(update) {
  const callback = update.callback_query;
  const data = callback?.data || "";
  const chatId = callback?.message?.chat?.id;
  const messageId = callback?.message?.message_id;

  if (!chatId || !messageId) return;

  const supabase = getSupabase();
  await answerCallback(callback.id);

  if (data === "menu") {
    await clearBotState(supabase, chatId).catch(() => {});
    await showMainMenu({ supabase, chatId, messageId });
    return;
  }

  if (data === "help") {
    const linked = await getLinkedUser(supabase, chatId);
    await editMessage(chatId, messageId, buildHelp(), mainKeyboard(Boolean(linked?.user_id)));
    return;
  }

  if (data === "connect") {
    await editMessage(
      chatId,
      messageId,
      "برای اتصال حساب وب‌اپ، این دستور را همینجا بفرست:\n\n/connect username password\n\nمثال:\n/connect ali_123 1234",
      backKeyboard(),
    );
    return;
  }

  if (data === "add") {
    const linked = await requireLinked(supabase, chatId);
    if (!linked) return;
    await setBotState(supabase, chatId, "awaiting_note");
    await editMessage(
      chatId,
      messageId,
      "متن یادداشت جدید را بفرست.\n\nاگر خواستی عنوان جدا داشته باشد، این فرمت را بفرست:\nعنوان | متن یادداشت",
      cancelKeyboard(),
    );
    return;
  }

  if (data === "search") {
    const linked = await requireLinked(supabase, chatId);
    if (!linked) return;
    await setBotState(supabase, chatId, "awaiting_search");
    await editMessage(chatId, messageId, "کلمه‌ای که می‌خواهی جستجو شود را بفرست:", cancelKeyboard());
    return;
  }

  if (data === "notes") {
    await showNotes({ supabase, chatId, messageId });
    return;
  }

  if (data === "cancel") {
    await clearBotState(supabase, chatId).catch(() => {});
    await showMainMenu({ supabase, chatId, messageId });
    return;
  }

  if (data === "unlink") {
    await confirmUnlink({ chatId, messageId });
    return;
  }

  if (data === "unlinkok") {
    await handleUnlink({ supabase, chatId, messageId });
    return;
  }

  if (data === "webapp_missing") {
    await editMessage(
      chatId,
      messageId,
      "آدرس وب‌اپ تنظیم نشده است. داخل Vercel مقدار PUBLIC_APP_URL را بگذار و Redeploy بگیر.",
      backKeyboard(),
    );
    return;
  }

  const [action, noteId] = data.split(":");

  if (action === "view" && noteId) {
    await showNote({ supabase, chatId, messageId, noteId });
    return;
  }

  if (action === "edit" && noteId) {
    await askEditNote({ supabase, chatId, messageId, noteId });
    return;
  }

  if (action === "pin" && noteId) {
    await togglePin({ supabase, chatId, messageId, noteId });
    return;
  }

  if (action === "del" && noteId) {
    await confirmDelete({ supabase, chatId, messageId, noteId });
    return;
  }

  if (action === "delok" && noteId) {
    await deleteNote({ supabase, chatId, messageId, noteId });
    return;
  }

  await editMessage(chatId, messageId, "این گزینه معتبر نیست.", backKeyboard());
}

async function handleMessage(update) {
  const message = getMessage(update);
  const text = getText(update);
  const chatId = message?.chat?.id;
  const from = message?.from;

  if (!chatId || !text) return;

  const supabase = getSupabase();

  if (/^\/start/i.test(text) || /^\/help/i.test(text)) {
    await showMainMenu({ supabase, chatId });
    return;
  }

  if (/^\/connect/i.test(text)) {
    await handleConnect({ supabase, chatId, from, text });
    return;
  }

  if (/^\/notes/i.test(text)) {
    await showNotes({ supabase, chatId });
    return;
  }

  if (/^\/add/i.test(text)) {
    const note = splitAddCommand(text);
    if (!note) {
      await setBotState(supabase, chatId, "awaiting_note");
      await sendMessage(chatId, "متن یادداشت را بفرست:", cancelKeyboard());
      return;
    }
    await createTelegramNote({ supabase, chatId, title: note.title, content: note.content });
    return;
  }

  if (/^\/search/i.test(text)) {
    const keyword = text.replace(/^\/search(@\w+)?\s*/i, "").trim();
    await handleSearchText({ supabase, chatId, keyword });
    return;
  }

  if (/^\/unlink/i.test(text)) {
    await sendMessage(chatId, "برای قطع اتصال تأیید کن:", {
      inline_keyboard: [[{ text: "بله، قطع کن", callback_data: "unlinkok" }, { text: "لغو", callback_data: "menu" }]],
    });
    return;
  }

  if (text.startsWith("/")) {
    await sendMessage(chatId, "این دستور را نمی‌شناسم. از دکمه‌های منو استفاده کن:", backKeyboard());
    return;
  }

  const linked = await requireLinked(supabase, chatId);
  if (!linked) return;

  if (linked.bot_state === "awaiting_search") {
    await handleSearchText({ supabase, chatId, keyword: text });
    return;
  }

  if (linked.bot_state === "awaiting_edit_note") {
    const noteId = linked.bot_payload?.noteId;
    if (!noteId) {
      await clearBotState(supabase, chatId);
      await sendMessage(chatId, "شناسه یادداشت برای ویرایش پیدا نشد. دوباره از لیست یادداشت‌ها انتخاب کن.", backKeyboard());
      return;
    }
    await updateTelegramNote({ supabase, chatId, noteId, text });
    return;
  }

  const note = text.includes("|") ? splitAddCommand(`/add ${text}`) : null;
  const title = note?.title || text.split("\n")[0].slice(0, 60) || "یادداشت تلگرام";
  const content = note?.content || text;

  await createTelegramNote({ supabase, chatId, title, content });
}

async function processUpdate(update) {
  if (update?.callback_query) {
    await handleCallback(update);
    return;
  }

  await handleMessage(update);
}

export default async function handler(req, res) {
  let update = null;

  try {
    if (req.method === "GET") {
      res.status(200).json(getSafeDiagnostics());
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ ok: false, message: "Method not allowed" });
      return;
    }

    const expectedSecret = getEnv("TELEGRAM_WEBHOOK_SECRET");
    const receivedSecret = req.headers["x-telegram-bot-api-secret-token"];

    if (!receivedSecret || receivedSecret !== expectedSecret) {
      console.error("Invalid webhook secret", { hasReceivedSecret: Boolean(receivedSecret) });
      res.status(401).json({ ok: false, message: "Invalid webhook secret" });
      return;
    }

    update = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    await processUpdate(update);

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", {
      message: error?.message,
      stack: error?.stack,
      update,
    });

    try {
      const chatId = update?.callback_query?.message?.chat?.id || getMessage(update)?.chat?.id;
      if (chatId) {
        await sendMessage(
          chatId,
          `خطای داخلی بات رخ داد.\nجزئیات کوتاه: ${error?.message || "Unknown error"}`.slice(0, 900),
          backKeyboard(),
        );
      }
    } catch (sendError) {
      console.error("Could not send Telegram error message:", sendError);
    }

    res.status(200).json({ ok: true });
  }
}
