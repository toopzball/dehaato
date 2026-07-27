export default {
  async fetch(request, env, ctx) {
    const incomingUrl = new URL(request.url);

    // ورکر اصلی از طریق Service Binding صدا زده می‌شه (env.MAIN_WORKER) — نه یه دامنه‌ی عمومی.
    // یعنی ورکر اصلی اصلاً route/دامنه‌ی عمومی نداره و فقط از همین‌جا در دسترسه.
    if (!env.MAIN_WORKER) {
      return new Response("MAIN_WORKER binding تنظیم نشده", { status: 500 });
    }

    // آی‌پی واقعیِ کاربر رو همینجا نگه می‌داریم؛ چون داخل Binding هم Cloudflare هدر
    // CF-Connecting-IP رو با آی‌پیِ خودِ زیرساخت عوض نمی‌کنه (Service Binding سرور به سرور نیست،
    // در واقع Cloudflare خودش context درخواست اصلی رو منتقل می‌کنه)، ولی برای اطمینان و لاگ‌گیری
    // صریح، همچنان این هدر رو ست می‌کنیم.
    const forwardHeaders = new Headers(request.headers);
    forwardHeaders.set("X-Internal-Key", env.INTERNAL_KEY);
    forwardHeaders.set("X-Real-Client-IP", request.headers.get("CF-Connecting-IP") || "unknown");

    const proxiedRequest = new Request(request.url, {
      method: request.method,
      headers: forwardHeaders,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    });

    // فراخوانی مستقیم Worker اصلی از طریق Binding — بدون شبکه، بدون DNS، بدون TLS handshake اضافه
    const response = await env.MAIN_WORKER.fetch(proxiedRequest);

    // جواب رو عیناً برمی‌گردونیم (بدنه، استاتوس و همه‌ی هدرها دست‌نخورده)؛ همینه که Range/۲۰۶
    // برای سیک‌کردنِ پخش صدا و ویدیو هم بدون هیچ تغییری درست کار می‌کنه
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  },
};
