# راه‌اندازی بات تلگرام نسخه v11

این نسخه بات را کامل‌تر می‌کند:

- منوی اصلی دکمه‌ای
- اتصال حساب وب‌اپ به تلگرام
- افزودن یادداشت با دکمه
- نمایش لیست یادداشت‌ها با دکمه
- مشاهده جزئیات هر یادداشت
- ویرایش متن یادداشت با دکمه
- پین و آن‌پین کردن یادداشت
- حذف یادداشت با تایید دکمه‌ای
- جستجو با دکمه
- باز کردن وب‌اپ داخل تلگرام با دکمه Web App
- ست‌کردن Command Menu کنار تکست‌باکس تلگرام

## Environment Variables در Vercel

در Vercel این مقدارها را تنظیم کن:

```env
TELEGRAM_BOT_TOKEN=توکن بات از BotFather
TELEGRAM_WEBHOOK_SECRET=یک متن دلخواه و محرمانه
SUPABASE_URL=https://qkhrzwrkcpeqbenntzpq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=کلید service_role یا secret از Supabase
PUBLIC_APP_URL=https://YOUR-VERCEL-DOMAIN.vercel.app
```

بعد از اضافه کردن Envها، حتماً Redeploy بگیر.

## اجرای SQL

اگر نسخه v10 را اجرا کرده‌ای، برای v11 نیازی به SQL جدید نداری؛ چون ستون‌های `bot_state` و `bot_payload` از قبل وجود دارند.

اگر از نسخه‌های قدیمی‌تر آمده‌ای، فایل `supabase.sql` را کامل داخل Supabase SQL Editor اجرا کن.

## تنظیم Webhook

بعد از deploy، وبهوک را تنظیم کن:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://YOUR-VERCEL-DOMAIN.vercel.app/api/telegram" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
  -d "drop_pending_updates=true"
```

## تنظیم Command Menu کنار تکست‌باکس

بعد از deploy و بعد از ست‌کردن Envها، این آدرس را در مرورگر باز کن:

```txt
https://YOUR-VERCEL-DOMAIN.vercel.app/api/telegram-setup?secret=TELEGRAM_WEBHOOK_SECRET
```

این کار دو چیز را تنظیم می‌کند:

1. دستورهای بات مثل `/start` و `/notes` و `/add`
2. منوی command کنار تکست‌باکس تلگرام، مثل بات‌های معمولی

اگر به‌جای command menu می‌خواهی همان دکمه پایین تلگرام مستقیماً وب‌اپ را باز کند، این نسخه را بزن:

```txt
https://YOUR-VERCEL-DOMAIN.vercel.app/api/telegram-setup?secret=TELEGRAM_WEBHOOK_SECRET&menu=webapp
```

پیشنهاد فعلی: حالت پیش‌فرض یعنی command menu بهتر است، چون وب‌اپ خودش داخل منوی بات دکمه دارد.

## تست داخل تلگرام

داخل تلگرام بزن:

```txt
/start
```

بعد حساب را وصل کن:

```txt
/connect ali_123 1234
```

برای ویرایش یادداشت:

1. دکمه «یادداشت‌ها» را بزن
2. یک یادداشت را باز کن
3. دکمه «ویرایش متن» را بزن
4. متن جدید را بفرست

برای تغییر عنوان و متن با هم، این فرمت را بفرست:

```txt
عنوان جدید | متن جدید یادداشت
```
