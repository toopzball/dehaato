export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // فقط مسیرهای API (که همه‌شون با /api/ شروع می‌شن) پروکسی می‌شن؛ بقیه‌ی درخواست‌ها
    // (index.html, login.html, عکس‌ها، مانیفست، سرویس‌ورکر، و...) مستقیم از فایل‌های
    // استاتیکِ همین پروژه‌ی Pages سرو می‌شن.
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    // آدرس ورکر اصلی (حالا خودش یه پروژه‌ی Pages با آدرس رایگان xxx.pages.dev) به‌صورت
    // Secret تو Environment Variables همین پروژه ذخیره شده — نه تو کد. چون این فراخوانی
    // سرور-به-سرور و داخل خودِ شبکه‌ی Cloudflareست، فیلترینگ ایران روش اثر نداره؛ پس
    // ورکر اصلی اصلاً نیازی به دامنه‌ی شخصی/CNAME نداره.
    if (!env.MAIN_WORKER_URL) {
      return new Response("MAIN_WORKER_URL تنظیم نشده", { status: 500 });
    }

    const targetUrl = env.MAIN_WORKER_URL + url.pathname + url.search;

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
