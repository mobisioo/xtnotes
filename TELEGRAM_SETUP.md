# اتصال دیتابیس Supabase به بات تلگرام

این نسخه یک Webhook برای Telegram Bot روی Vercel اضافه کرده است:

```txt
api/telegram.js
```

بات از همان دیتابیس پروژه استفاده می‌کند و نوت‌ها را داخل جدول `app_notes` ذخیره می‌کند.

## 1. اجرای SQL جدید

داخل Supabase برو به:

```txt
SQL Editor → New query
```

کل فایل `supabase.sql` همین نسخه را اجرا کن. اگر قبلاً SQL نسخه‌های قبلی را اجرا کرده‌ای، مشکلی نیست؛ بخش جدید فقط جدول زیر را اضافه می‌کند:

```txt
app_telegram_links
```

این جدول اتصال بین `chat_id` تلگرام و کاربر داخلی پروژه را ذخیره می‌کند.

## 2. ساخت بات در تلگرام

در BotFather یک بات بساز و Bot Token را بگیر.

## 3. تنظیم Environment Variables در Vercel

در Vercel برو به:

```txt
Project → Settings → Environment Variables
```

این مقدارها را اضافه کن:

```env
TELEGRAM_BOT_TOKEN=توکن بات تلگرام
TELEGRAM_WEBHOOK_SECRET=یک متن رندوم مثل my_secret_2026
SUPABASE_URL=https://qkhrzwrkcpeqbenntzpq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=کلید Secret یا service_role از Supabase
```

نکته مهم: `SUPABASE_SERVICE_ROLE_KEY` را فقط در Vercel Environment Variable بگذار. این کلید نباید داخل `src/config.js` یا فایل‌های فرانت قرار بگیرد.

بعد از ذخیره Environment Variables، دوباره Deploy بگیر.

## 4. ست‌کردن Webhook تلگرام

بعد از اینکه پروژه روی Vercel بالا آمد، این دستور را اجرا کن. آدرس دامنه را با دامنه پروژه خودت عوض کن:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://YOUR-VERCEL-DOMAIN.vercel.app/api/telegram" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
  -d "drop_pending_updates=true"
```

اگر ویندوز داری و `curl` اذیت کرد، می‌توانی همین آدرس را در Postman به صورت POST بزنی.

## 5. استفاده از بات

اول در وب‌اپ یک حساب بساز، مثلاً:

```txt
username: ali_123
password: 1234
```

بعد در تلگرام به بات پیام بده:

```txt
/start
```

برای اتصال حساب:

```txt
/connect ali_123 1234
```

برای افزودن یادداشت:

```txt
/add ایده پروژه | برای پروژه جدید باید بات تلگرام را به دیتابیس وصل کنم
```

برای لیست یادداشت‌ها:

```txt
/notes
```

برای جستجو:

```txt
/search پروژه
```

برای قطع اتصال:

```txt
/unlink
```

بعد از اتصال، هر متن ساده‌ای که به بات بفرستی، به عنوان یادداشت جدید ذخیره می‌شود.

## نکته امنیتی

این نسخه برای پروژه دانشجویی و تستی مناسب است. چون دستور `/connect username password` رمز را داخل چت تلگرام می‌فرستد، برای پروژه واقعی بهتر است به‌جای رمز عبور، از کد اتصال یک‌بارمصرف داخل وب‌اپ استفاده شود.


## عیب‌یابی سریع بات تلگرام

اگر Webhook ست شد ولی بات جواب نمی‌دهد، اول آدرس زیر را در مرورگر باز کن:

```txt
https://YOUR-VERCEL-DOMAIN.vercel.app/api/telegram
```

باید `ok: true` و وضعیت Environment Variableها را ببینی. اگر هرکدام `false` بود، همان متغیر را در Vercel اضافه کن و Redeploy بگیر.

بعد در Vercel از بخش `Functions / Logs` خطاهای `/api/telegram` را ببین. نسخه جدید اگر خطای Supabase یا Telegram رخ بدهد، تلاش می‌کند متن خطا را داخل خود چت تلگرام هم بفرستد.
