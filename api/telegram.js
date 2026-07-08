import { createClient } from "@supabase/supabase-js";

const TELEGRAM_API = "https://api.telegram.org/bot";

const requiredEnv = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function getSafeDiagnostics() {
  return {
    ok: true,
    endpoint: "telegram webhook",
    message: "Endpoint is deployed. Telegram must call this URL with POST.",
    env: Object.fromEntries(
      requiredEnv.map((name) => [name, Boolean(process.env[name])]),
    ),
  };
}

function getEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
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

function getText(update) {
  return update?.message?.text?.trim() || update?.edited_message?.text?.trim() || "";
}

function getMessage(update) {
  return update?.message || update?.edited_message || null;
}

function buildHelp() {
  return [
    "سلام 👋",
    "بات دفترچه یادداشت آماده است.",
    "",
    "اول حساب وب‌اپت را وصل کن:",
    "/connect username password",
    "مثال:",
    "/connect ali_123 1234",
    "",
    "دستورها:",
    "/notes — نمایش آخرین یادداشت‌ها",
    "/add عنوان | متن — افزودن یادداشت",
    "/search کلمه — جستجو در یادداشت‌ها",
    "/unlink — قطع اتصال تلگرام",
    "",
    "بعد از اتصال، هر متن ساده‌ای بفرستی به عنوان یادداشت جدید ذخیره می‌شود.",
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

async function sendMessage(chatId, text) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
}

async function getLinkedUser(supabase, chatId) {
  const { data, error } = await supabase
    .from("app_telegram_links")
    .select("user_id, app_users(username)")
    .eq("chat_id", chatId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function handleConnect({ supabase, chatId, from, text }) {
  const args = text.replace(/^\/connect(@\w+)?\s*/i, "").trim().split(/\s+/);
  const username = normalizeUsername(args[0]);
  const password = args[1];

  if (!username || !password) {
    await sendMessage(chatId, "فرمت درست:\n/connect username password\nمثال:\n/connect ali_123 1234");
    return;
  }

  const { data: loginData, error: loginError } = await supabase.rpc("app_login", {
    p_username: username,
    p_password: password,
  });

  if (loginError || !loginData?.userId) {
    await sendMessage(chatId, "یوزرنیم یا رمز عبور اشتباه است.");
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
    },
    { onConflict: "chat_id" },
  );

  if (linkError) throw linkError;

  await sendMessage(chatId, `حساب ${loginData.username} با موفقیت به تلگرام وصل شد ✅`);
}

async function handleNotes({ supabase, chatId }) {
  const linked = await getLinkedUser(supabase, chatId);
  if (!linked?.user_id) {
    await sendMessage(chatId, "اول حساب را وصل کن:\n/connect username password");
    return;
  }

  const { data, error } = await supabase
    .from("app_notes")
    .select("id,title,content,is_pinned,updated_at")
    .eq("user_id", linked.user_id)
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) throw error;

  if (!data?.length) {
    await sendMessage(chatId, "هنوز یادداشتی نداری.");
    return;
  }

  const lines = data.map((note, index) => {
    const title = note.title?.trim() || "بدون عنوان";
    const preview = note.content?.trim()?.slice(0, 80) || "بدون متن";
    return `${index + 1}. ${note.is_pinned ? "★ " : ""}${title}\n${preview}`;
  });

  await sendMessage(chatId, `آخرین یادداشت‌ها:\n\n${lines.join("\n\n")}`);
}

async function createTelegramNote({ supabase, chatId, title, content }) {
  const linked = await getLinkedUser(supabase, chatId);
  if (!linked?.user_id) {
    await sendMessage(chatId, "اول حساب را وصل کن:\n/connect username password");
    return;
  }

  const { error } = await supabase.from("app_notes").insert({
    user_id: linked.user_id,
    title: title || "یادداشت تلگرام",
    content: content || "",
  });

  if (error) throw error;

  await supabase
    .from("app_telegram_links")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("chat_id", chatId);

  await sendMessage(chatId, "یادداشت ذخیره شد ✅");
}

async function handleSearch({ supabase, chatId, text }) {
  const linked = await getLinkedUser(supabase, chatId);
  if (!linked?.user_id) {
    await sendMessage(chatId, "اول حساب را وصل کن:\n/connect username password");
    return;
  }

  const keyword = text.replace(/^\/search(@\w+)?\s*/i, "").trim();
  const safeKeyword = keyword.replace(/[%,()]/g, " ").trim();
  if (!safeKeyword) {
    await sendMessage(chatId, "بعد از /search یک کلمه بنویس. مثال:\n/search پروژه");
    return;
  }

  const { data, error } = await supabase
    .from("app_notes")
    .select("title,content,is_pinned,updated_at")
    .eq("user_id", linked.user_id)
    .or(`title.ilike.%${safeKeyword}%,content.ilike.%${safeKeyword}%`)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) throw error;

  if (!data?.length) {
    await sendMessage(chatId, "چیزی پیدا نشد.");
    return;
  }

  const lines = data.map((note, index) => {
    const title = note.title?.trim() || "بدون عنوان";
    const preview = note.content?.trim()?.slice(0, 80) || "بدون متن";
    return `${index + 1}. ${note.is_pinned ? "★ " : ""}${title}\n${preview}`;
  });

  await sendMessage(chatId, `نتیجه جستجو برای «${safeKeyword}»:\n\n${lines.join("\n\n")}`);
}

async function handleUnlink({ supabase, chatId }) {
  const { error } = await supabase.from("app_telegram_links").delete().eq("chat_id", chatId);
  if (error) throw error;
  await sendMessage(chatId, "اتصال تلگرام از حساب قطع شد.");
}

async function processUpdate(update) {
  const message = getMessage(update);
  const text = getText(update);
  const chatId = message?.chat?.id;
  const from = message?.from;

  if (!chatId || !text) return;

  const supabase = getSupabase();

  if (/^\/start/i.test(text) || /^\/help/i.test(text)) {
    await sendMessage(chatId, buildHelp());
    return;
  }

  if (/^\/connect/i.test(text)) {
    await handleConnect({ supabase, chatId, from, text });
    return;
  }

  if (/^\/notes/i.test(text)) {
    await handleNotes({ supabase, chatId });
    return;
  }

  if (/^\/add/i.test(text)) {
    const note = splitAddCommand(text);
    if (!note) {
      await sendMessage(chatId, "فرمت درست:\n/add عنوان | متن یادداشت");
      return;
    }
    await createTelegramNote({ supabase, chatId, title: note.title, content: note.content });
    return;
  }

  if (/^\/search/i.test(text)) {
    await handleSearch({ supabase, chatId, text });
    return;
  }

  if (/^\/unlink/i.test(text)) {
    await handleUnlink({ supabase, chatId });
    return;
  }

  if (text.startsWith("/")) {
    await sendMessage(chatId, "این دستور را نمی‌شناسم. برای راهنما /help را بفرست.");
    return;
  }

  await createTelegramNote({
    supabase,
    chatId,
    title: text.slice(0, 60),
    content: text,
  });
}

export default async function handler(req, res) {
  let update = null;

  try {
    // GET is only for human diagnostics in browser/Vercel, not for Telegram.
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

    // Try to show the error to the tester inside Telegram instead of failing silently.
    try {
      const chatId = getMessage(update)?.chat?.id;
      if (chatId) {
        await sendMessage(
          chatId,
          `خطای داخلی بات رخ داد.\nجزئیات کوتاه: ${error?.message || "Unknown error"}`.slice(0, 900),
        );
      }
    } catch (sendError) {
      console.error("Could not send Telegram error message:", sendError);
    }

    // Telegram should still receive 200 so it does not retry the same broken update forever.
    res.status(200).json({ ok: true });
  }
}
