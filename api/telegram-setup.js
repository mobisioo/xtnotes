const TELEGRAM_API = "https://api.telegram.org/bot";

const requiredEnv = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
];

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

async function telegram(method, payload) {
  const token = getEnv("TELEGRAM_BOT_TOKEN");
  const response = await fetch(`${TELEGRAM_API}${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(async () => ({ raw: await response.text() }));

  if (!response.ok || body?.ok === false) {
    throw new Error(`Telegram ${method} failed: ${JSON.stringify(body)}`);
  }

  return body;
}

function buildCommands() {
  return [
    { command: "start", description: "باز کردن منوی اصلی" },
    { command: "connect", description: "اتصال حساب وب‌اپ" },
    { command: "notes", description: "نمایش یادداشت‌ها" },
    { command: "add", description: "افزودن یادداشت" },
    { command: "search", description: "جستجو در یادداشت‌ها" },
    { command: "unlink", description: "قطع اتصال حساب" },
    { command: "help", description: "راهنمای بات" },
  ];
}

export default async function handler(req, res) {
  try {
    if (!["GET", "POST"].includes(req.method)) {
      res.status(405).json({ ok: false, message: "Method not allowed" });
      return;
    }

    const secret = req.query?.secret || req.body?.secret;
    const expectedSecret = getEnv("TELEGRAM_WEBHOOK_SECRET");

    if (!secret || secret !== expectedSecret) {
      res.status(401).json({ ok: false, message: "Invalid setup secret" });
      return;
    }

    const mode = String(req.query?.menu || req.body?.menu || "commands").toLowerCase();
    const appUrl = getAppUrl();

    const commandsResult = await telegram("setMyCommands", {
      commands: buildCommands(),
    });

    let menuPayload = { menu_button: { type: "commands" } };

    if (mode === "webapp") {
      if (!appUrl) {
        throw new Error("PUBLIC_APP_URL is required when menu=webapp");
      }

      menuPayload = {
        menu_button: {
          type: "web_app",
          text: "باز کردن دفترچه یادداشت",
          web_app: { url: appUrl },
        },
      };
    }

    const menuResult = await telegram("setChatMenuButton", menuPayload);

    res.status(200).json({
      ok: true,
      message: "Telegram commands/menu configured.",
      menuMode: mode,
      appUrl: appUrl || null,
      commandsResult,
      menuResult,
    });
  } catch (error) {
    console.error("Telegram setup error:", error);
    res.status(500).json({ ok: false, message: error?.message || "Unknown error" });
  }
}
