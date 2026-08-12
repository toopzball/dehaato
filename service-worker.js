// ---------- سرویس‌ورکر دهات: پوش نوتیفیکیشن + کش برای کارِ آفلاین ----------
// نسخه رو هر بار که لیستِ فایل‌های کش‌شونده یا استراتژیِ کش عوض شد، دستی بالا ببر (مثلاً v2, v3, ...)
// تا مرورگرها مجبور بشن کشِ قدیمی رو دور بریزن و نسخه‌ی جدید رو بگیرن.
const CACHE_VERSION = "v1";
const SHELL_CACHE = `dehaat-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `dehaat-runtime-${CACHE_VERSION}`;
const ALL_CACHES = [SHELL_CACHE, RUNTIME_CACHE];

// اسکلتِ اصلیِ اپ: صفحاتِ HTML و آیکون‌هایی که برای بالا اومدنِ اپ (حتی آفلاین) لازمن.
// اینا رو موقعِ نصبِ سرویس‌ورکر از قبل دانلود و کش می‌کنیم (precache).
const SHELL_URLS = [
  "/",
  "index.html",
  "login.html",
  "onboarding.html",
  "radio.html",
  "manifest.json",
  "icon-192.png",
  "apple-touch-icon.png",
  "favicon-dark.png",
  "favicon-light.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // هر URL رو جدا جدا اضافه می‌کنیم (نه با cache.addAll که با یه ۴۰۴ کلِ نصب رو fail می‌کنه)؛
      // اگه یکی‌شون (مثلاً یه فایلِ اختیاری) رویِ سرور نبود، بقیه‌ی کش خراب نشه
      Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(url).catch(() => {})
        )
      )
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // کشِ نسخه‌های قدیمی (که اسمشون تویِ ALL_CACHES نیست) رو پاک می‌کنیم
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !ALL_CACHES.includes(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// درخواست‌های API هیچ‌وقت کش نمی‌شن (باید همیشه دیتای زنده باشن) — با return زودهنگام
// اصلاً respondWith صدا زده نمی‌شه و رفتارِ عادیِ شبکه‌ی مرورگر اجرا می‌شه.
function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

// ایموجی/استیکر: چون فایلِ جدید = اسمِ جدیده (هیچ‌وقت overwrite نمی‌شه)، کش-اول همیشه امنه؛
// اگه تویِ کش بود همونو بده (سریع + آفلاین)، وگرنه از شبکه بگیر و برایِ دفعه‌ی بعد کش کن.
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    return cached || Response.error();
  }
}

// صفحاتِ HTML (index/login/radio/...): شبکه-اول، تا همیشه آخرین نسخه‌ی سایت لود بشه؛
// اگه شبکه نبود (آفلاینه)، از رویِ کشِ همون فایل که موقعِ آخرین بازدید ذخیره شده برمی‌گردونیم.
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // نه شبکه بود نه کش — یه پیامِ سبکِ آفلاین بجایِ صفحه‌ی خطایِ خودِ مرورگر نشون بده
    return new Response(
      `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>آفلاین</title>
      <style>
        body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
        background:#1a0a31;color:#fff;font-family:sans-serif;text-align:center;padding:24px;box-sizing:border-box;}
        .box{max-width:320px;}
        h1{font-size:18px;margin:0 0 8px;}
        p{font-size:13.5px;color:rgba(255,255,255,0.7);line-height:1.8;margin:0;}
      </style></head><body>
      <div class="box"><h1>اتصال به اینترنت برقرار نیست</h1>
      <p>این صفحه هنوز تویِ کشِ گوشیت ذخیره نشده. یه‌بار با اینترنت وصل شو و بازش کن، بعدش دفعه‌های بعدی آفلاین هم در دسترسه.</p></div>
      </body></html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

// بقیه‌ی فایل‌های استاتیک (مانیفست، آیکون‌ها، و غیره): کش رو فوری برمی‌گردونیم (اگه بود) تا سریع باشه،
// همزمان یه فچِ پس‌زمینه می‌زنیم که نسخه‌ی کش برایِ دفعه‌ی بعد تازه بمونه (stale-while-revalidate)
async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        caches.open(cacheName).then((cache) => cache.put(request, response.clone()));
      }
      return response;
    })
    .catch(() => null);
  return cached || (await networkPromise) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // فقط درخواست‌های همین دامنه رو دست می‌زنیم
  if (isApiRequest(url)) return; // API همیشه مستقیم از شبکه

  if (url.pathname.startsWith("/emojis/")) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  const isHtmlPage =
    request.mode === "navigate" ||
    /\.html$/.test(url.pathname) ||
    url.pathname === "/";
  if (isHtmlPage) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  // بقیه: مانیفست، آیکون‌ها، فونت‌ها و امثالِ اون
  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "دهات", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "دهات";
  const options = {
    body: data.body || "",
    icon: data.icon || "icon-192.png",
    badge: "icon-192.png",
    dir: "rtl",
    lang: "fa",
    tag: data.tag || undefined,
    data: { url: data.url || "index.html" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// با لمس نوتیفیکیشن، اگه تب سایت باز بود بهش فوکوس کن، وگرنه یه تب جدید باز کن
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "index.html";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("index.html") && "focus" in client) {
          if ("navigate" in client) client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
