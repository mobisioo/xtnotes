# راه‌اندازی بات تلگرام دکمه‌ای

این نسخه، بات تلگرام را به‌صورت دکمه‌ای پیاده می‌کند.

## امکانات بات

- منوی اصلی دکمه‌ای
- اتصال حساب وب‌اپ به تلگرام
- افزودن یادداشت با دکمه
- نمایش لیست یادداشت‌ها با دکمه
- مشاهده جزئیات هر یادداشت
- پین و آن‌پین کردن یادداشت
- حذف یادداشت با تایید دکمه‌ای
- جستجو با دکمه
- قطع اتصال با تایید

فقط دو مورد هنوز پیام متنی لازم دارند:

1. اتصال حساب:

```txt
/connect username password
```

مثال:

```txt
/connect ali_123 1234
```

2. متن یادداشت یا کلمه جستجو، چون محتوای دلخواه باید از کاربر گرفته شود.

## Environment Variables در Vercel

در Vercel این مقدارها را تنظیم کن:

```env
TELEGRAM_BOT_TOKEN=توکن بات از BotFather
TELEGRAM_WEBHOOK_SECRET=یک متن دلخواه و محرمانه
SUPABASE_URL=https://qkhrzwrkcpeqbenntzpq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=کلید service_role یا secret از Supabase
```

بعد از اضافه کردن Envها، حتماً Redeploy بگیر.

## اجرای SQL

فایل `supabase.sql` نسخه جدید را داخل Supabase SQL Editor اجرا کن.

این نسخه دو ستون جدید به جدول اتصال تلگرام اضافه می‌کند:

```sql
bot_state text
bot_payload jsonb
```

اگر نسخه قبلی را داری، اجرای دوباره SQL مشکلی ایجاد نمی‌کند.

## تنظیم Webhook

بعد از deploy، وبهوک را تنظیم کن:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://YOUR-VERCEL-DOMAIN.vercel.app/api/telegram" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
  -d "drop_pending_updates=true"
```

## تست

داخل تلگرام بزن:

```txt
/start
```

بعد حساب را وصل کن:

```txt
/connect ali_123 1234
```

بعد از اتصال، بیشتر کارها از دکمه‌ها انجام می‌شود.
