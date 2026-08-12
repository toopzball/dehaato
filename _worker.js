export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // فقط مسیرهای API (که همه‌شون با /api/ شروع می‌شن) پروکسی می‌شن؛ بقیه‌ی درخواست‌ها
    // (index.html, login.html, عکس‌ها، مانیفست، سرویس‌ورکر، و...) مستقیم از فایل‌های
    // استاتیکِ همین پروژه‌ی Pages سرو می‌شن.
    if (!url.pathname.startsWith("/api/")) {
      const assetResponse = await env.ASSETS.fetch(request);
      return withStaticCacheHeaders(url.pathname, assetResponse);
    }

    // آدرس ورکر اصلی (حالا خودش یه پروژه‌ی Pages با آدرس رایگان xxx.pages.dev) به‌صورت
    // Secret تو Environment Variables همین پروژه ذخیره شده — نه تو کد. چون این فراخوانی
    // سرور-به-سرور و داخل خودِ شبکه‌ی Cloudflareست، فیلترینگ ایران روش اثر نداره؛ پس
    // ورکر اصلی اصلاً نیازی به دامنه‌ی شخصی/CNAME نداره.
    if (!env.MAIN_WORKER_URL) {
      return new Response("MAIN_WORKER_URL تنظیم نشده", { status: 500 });
    }

    // اسلش اضافه‌ی احتمالی انتهای MAIN_WORKER_URL رو حذف می‌کنیم تا اسلش دوتایی تو مسیر
    // نهایی ایجاد نشه (که باعث می‌شد مسیرهایی مثل /api/login دقیقاً مچ نشن)
    const baseUrl = env.MAIN_WORKER_URL.replace(/\/+$/, "");
    const targetUrl = baseUrl + url.pathname + url.search;

    const forwardHeaders = new Headers(request.headers);
    forwardHeaders.set("X-Internal-Key", env.INTERNAL_KEY);
    forwardHeaders.set("X-Real-Client-IP", request.headers.get("CF-Connecting-IP") || "unknown");
    // هدر Host رو حذف می‌کنیم؛ fetch خودش Host درستِ (مالِ ورکر اصلی) رو ست می‌کنه
    forwardHeaders.delete("Host");

    const proxiedRequest = new Request(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    });

    const response = await fetch(proxiedRequest);

    // جواب رو عیناً برمی‌گردونیم (بدنه، استاتوس و همه‌ی هدرها دست‌نخورده)؛ همینه که Range/۲۰۶
    // برای سیک‌کردنِ پخش صدا و ویدیو هم بدون هیچ تغییری درست کار می‌کنه
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  },
};

// روی جوابِ فایل‌های استاتیک، هدرِ Cache-Control مناسب اضافه می‌کنه تا مرورگر واقعاً کِششون کنه.
// این کار رو مستقیم تو خودِ ورکر انجام می‌دیم (نه فقط با فایل _headers) چون وقتی _worker.js
// (حالتِ Advanced) هست، اینجا صد در صد تضمین‌شده اجرا می‌شه؛ فایل _headers هم کنارش می‌مونه
// به‌عنوانِ لایه‌ی دومِ اطمینان، ولی این تابع همیشه هدرِ نهایی رو ست می‌کنه.
function withStaticCacheHeaders(pathname, response) {
  let cacheControl = null;

  if (pathname.startsWith("/emojis/")) {
    // فایل‌های ایموجی/استیکر عوض نمی‌شن (فایلِ جدید = اسمِ جدید تویِ ریپو)؛ کشِ طولانی + immutable
    // یعنی مرورگر حتی برای چک‌کردنِ تغییر هم دوباره درخواست نمی‌زنه
    cacheControl = "public, max-age=31536000, immutable";
  } else if (pathname === "/radio.html") {
    cacheControl = "public, max-age=86400";
  } else if (pathname === "/manifest.json") {
    cacheControl = "public, max-age=86400";
  } else if (pathname === "/service-worker.js") {
    // سرویس‌ورکر عمداً کش نمی‌شه تا مرورگر همیشه نسخه‌ی جدیدش رو موقعِ آپدیتِ سایت بگیره
    cacheControl = "no-cache";
  }

  if (!cacheControl) return response;

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", cacheControl);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
