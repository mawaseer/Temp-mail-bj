const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// ======================
// RATE LIMITING
// ======================

const rateLimit = new Map();
const RATE_LIMIT = 60;
const WINDOW_MS = 60 * 1000;

function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  if (!rateLimit.has(ip)) {
    rateLimit.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    return next();
  }

  const data = rateLimit.get(ip);

  if (now > data.resetTime) {
    rateLimit.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    return next();
  }

  if (data.count >= RATE_LIMIT) {
    const retryAfter = Math.ceil((data.resetTime - now) / 1000);
    return res.status(429).json({
      creator: "@BJ_Devs on Telegram",
      ok: false,
      error: "Too many requests",
      retry_after: retryAfter
    });
  }

  data.count++;
  rateLimit.set(ip, data);
  next();
}

app.use(rateLimiter);

// ======================
// RESPONSE HELPERS
// ======================

function sendResponse(res, data, status = 200) {
  res.setHeader('Content-Type', 'application/json');
  const response = {
    creator: "@BJ_Devs on Telegram",
    ok: true,
    ...data
  };
  res.status(status).send(JSON.stringify(response, null, 2));
}

function sendError(res, message, status = 400) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).send(JSON.stringify({
    creator: "@BJ_Devs on Telegram",
    ok: false,
    error: message
  }, null, 2));
}

// ======================
// DISPOSABLE MAIL LOGIC
// ======================

async function getCustomMail(name) {
  try {
    const checkRes = await axios.post(
      'https://www.disposablemail.com/index/email-check/',
      new URLSearchParams({ email: name, format: 'json' }),
      { headers: { 'x-requested-with': 'XMLHttpRequest', origin: 'https://www.disposablemail.com' } }
    );

    if (checkRes.data !== 'ok') return null;

    const createRes = await axios.post(
      'https://www.disposablemail.com/index/new-email/',
      new URLSearchParams({ emailInput: name, format: 'json' }),
      { headers: { 'x-requested-with': 'XMLHttpRequest', origin: 'https://www.disposablemail.com' } }
    );

    const cookie = createRes.headers['set-cookie']?.find(c => c.includes('TMA='))?.split(';')[0];
    const email = decodeURIComponent(cookie?.split('=')[1]);
    return { email, session: cookie };
  } catch { return null; }
}

async function getDefaultMail() {
  try {
    const homeRes = await axios.get('https://www.disposablemail.com', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'gzip, deflate, br', decompress: true }
    });

    const phpsessid = homeRes.headers['set-cookie']?.find(c => c.includes('PHPSESSID'))?.split(';')[0];
    const csrf = homeRes.data.match(/const CSRF\s*=\s*"(.+?)"/)?.[1];

    const inboxRes = await axios.get(`https://www.disposablemail.com/index/index?csrf_token=${csrf}`, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': phpsessid
      }
    });

    return {
      email: inboxRes.data?.email || null,
      password: inboxRes.data?.heslo || null,
    };
  } catch { return { email: null, password: null }; }
}

// ======================
// ENDPOINTS
// ======================

app.get('/getmail', async (req, res) => {
  try {
    const name = req.query.name;
    if (name) {
      const result = await getCustomMail(name);
      if (!result) return sendError(res, "Mail not available", 400);
      sendResponse(res, result);
    } else {
      const data = await getDefaultMail();
      sendResponse(res, data);
    }
  } catch {
    sendError(res, "Failed to generate mail", 500);
  }
});

app.get('/chkmail', async (req, res) => {
  const mail = req.query.mail;
  if (!mail) return sendError(res, "Missing mail query parameter", 400);

  try {
    const response = await axios.get('https://www.disposablemail.com/index/refresh', {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'x-requested-with': 'XMLHttpRequest',
        'referer': 'https://www.disposablemail.com/',
        'Cookie': `TMA=${encodeURIComponent(mail)}`
      }
    });

    const raw = response.data;
    const cleaned = {};

    if (raw && typeof raw === 'object') {
      const items = Array.isArray(raw) ? raw : Object.values(raw);
      items.forEach(item => {
        if (item?.id) {
          cleaned[item.id] = {
            predmetZkraceny: item.predmetZkraceny || "",
            predmet: item.predmet || "",
            od: item.od || "",
            id: item.id,
            kdy: item.kdy || "",
            precteno: item.precteno || "old"
          };
        }
      });
    }

    sendResponse(res, cleaned);
  } catch {
    sendError(res, "Failed to check mail", 500);
  }
});

app.get('/delete', async (req, res) => {
  const { mail, id } = req.query;
  if (!mail || !id) return sendError(res, "Missing mail or id", 400);

  try {
    const delRes = await axios.post(`https://www.disposablemail.com/delete-email/${id}`,
      new URLSearchParams({ id }),
      {
        headers: {
          'x-requested-with': 'XMLHttpRequest',
          'Cookie': `TMA=${encodeURIComponent(mail)}`
        }
      }
    );
    sendResponse(res, delRes.data);
  } catch {
    sendError(res, "Failed to delete mail", 500);
  }
});

app.get('/health', (req, res) => {
  sendResponse(res, { status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ======================
// DOCS (ROOT)
// ======================

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Disposable Mail API - BJ Tricks</title>
  <meta name="theme-color" content="#09090b">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-zinc-950 text-zinc-100 antialiased min-h-screen overflow-x-hidden [font-family:Inter,ui-sans-serif,system-ui] selection:bg-indigo-500/30 selection:text-white">
  <div class="pointer-events-none fixed inset-0 -z-10">
    <div class="absolute inset-0 bg-[radial-gradient(1200px_600px_at_80%_-20%,rgba(99,102,241,.15),transparent),radial-gradient(800px_400px_at_0%_120%,rgba(168,85,247,.12),transparent)]"></div>
    <div class="absolute inset-0 opacity-[0.03] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:48px_48px]"></div>
  </div>

  <header class="sticky top-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/60 border-b border-white/5">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
      <a href="#" class="inline-flex items-center gap-2"><span class="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/5 ring-1 ring-white/10 text-xs font-semibold">DM</span><span class="text-sm font-semibold text-zinc-200">Disposable Mail API</span></a>
      <nav class="hidden lg:flex items-center gap-6">
        <a href="#quick-start" class="scroll-link text-sm text-zinc-400 hover:text-zinc-100">Quick Start</a>
        <a href="#endpoints" class="scroll-link text-sm text-zinc-400 hover:text-zinc-100">Endpoints</a>
        <a href="#examples" class="scroll-link text-sm text-zinc-400 hover:text-zinc-100">Examples</a>
      </nav>
      <div class="flex items-center gap-2">
        <div id="healthBadge" class="hidden md:inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs text-zinc-300"><span class="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>Healthy</div>
        <a href="https://t.me/BJ_Devs" target="_blank" class="hidden sm:inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold hover:bg-white/10">BJ Tricks</a>
        <button id="mobileMenuButton" class="lg:hidden p-2"><i id="iconMenu" data-lucide="menu" class="h-5 w-5"></i><i id="iconClose" data-lucide="x" class="h-5 w-5 hidden"></i></button>
      </div>
    </div>
    <div id="mobileOverlay" class="fixed inset-0 z-40 bg-black/50 opacity-0 pointer-events-none transition-opacity md:hidden"></div>
    <div id="mobileMenu" class="md:hidden fixed inset-x-0 top-14 z-50 border-b border-white/10 bg-zinc-950/95 backdrop-blur px-4 py-4 opacity-0 -translate-y-2 hidden transition-all">
      <nav class="space-y-1">
        <a href="#quick-start" class="mobile-link scroll-link flex items-center justify-between px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"><span class="flex items-center gap-2">Quick Start</span><i data-lucide="chevron-right" class="h-4 w-4"></i></a>
        <a href="#endpoints" class="mobile-link scroll-link flex items-center justify-between px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"><span class="flex items-center gap-2">Endpoints</span><i data-lucide="chevron-right" class="h-4 w-4"></i></a>
        <a href="#examples" class="mobile-link scroll-link flex items-center justify-between px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"><span class="flex items-center gap-2">Examples</span><i data-lucide="chevron-right" class="h-4 w-4"></i></a>
      </nav>
      <div class="my-4 h-px bg-white/10"></div>
      <div class="flex items-center justify-between">
        <div id="healthBadgeMobile" class="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs text-zinc-300"><span class="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>Healthy</div>
        <a href="https://t.me/BJ_Devs" target="_blank" class="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold">BJ Tricks</a>
      </div>
    </div>
  </header>

  <section class="relative py-12 sm:py-20">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="grid lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        <div class="lg:col-span-7">
          <div class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 mb-4"><span class="inline-flex h-1.5 w-1.5 rounded-full bg-indigo-500"></span>v1.0.0 • 4 Endpoints</div>
          <h1 class="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-tight"><span class="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-indigo-300 to-violet-300">Disposable Mail API</span></h1>
          <p class="mt-4 text-base sm:text-lg text-zinc-400 max-w-2xl">Generate, check, delete — zero auth, instant access.</p>
          <div class="mt-6 flex flex-wrap items-center gap-3">
            <a href="#quick-start" class="scroll-link inline-flex items-center gap-2 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 active:scale-95 transition">Quick Start</a>
            <a href="https://t.me/BJ_Devs" target="_blank" class="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-100 hover:bg-white/10 active:scale-95 transition">Join Telegram</a>
          </div>
        </div>
        <div class="lg:col-span-5">
          <div class="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/60 to-zinc-900/30 p-4 sm:p-6 shadow-2xl">
            <div class="flex items-center justify-between text-sm text-zinc-300"><span>Preview</span><span class="text-xs text-zinc-400">Real-time</span></div>
            <div class="mt-4 aspect-[16/10] rounded-lg border border-white/10 overflow-hidden"><img src="https://images.unsplash.com/photo-1555066931-4365d14bab6d?q=80&w=1200" class="w-full h-full object-cover" loading="lazy"></div>
            <div class="mt-4 grid grid-cols-3 gap-3 text-xs text-zinc-400">
              <div class="rounded-md border border-white/10 bg-white/5 p-3 text-center"><span class="text-zinc-200 font-medium">4</span><div>Endpoints</div></div>
              <div class="rounded-md border border-white/10 bg-white/5 p-3 text-center"><span class="text-zinc-200 font-medium">Unlimited</span><div>Mails</div></div>
              <div class="rounded-md border border-white/10 bg-white/5 p-3 text-center"><span class="text-zinc-200 font-medium">0</span><div>Auth</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <main class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-20">
    <div class="grid lg:grid-cols-12 gap-8 lg:gap-10">
      <aside class="hidden xl:col-span-3 xl:block sticky top-20">
        <div class="rounded-xl border border-white/10 bg-white/5 p-4">
          <div class="text-sm font-semibold text-zinc-200 mb-2">On this page</div>
          <nav class="space-y-1">
            <a href="#quick-start" class="scroll-link group flex items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition">Quick Start</a>
            <a href="#endpoints" class="scroll-link group flex items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition">Endpoints</a>
            <a href="#examples" class="scroll-link group flex items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition">Examples</a>
          </nav>
        </div>
      </aside>

      <div class="min-w-0 lg:col-span-12 xl:col-span-9 space-y-10">

        <section id="quick-start" class="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/60 to-zinc-900/30 p-5 sm:p-8">
          <div class="flex items-center gap-3"><div class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20"><i data-lucide="rocket" class="h-5 w-5 text-indigo-400"></i></div><h2 class="text-2xl font-bold">Quick Start</h2></div>
          <p class="mt-3 text-zinc-400">Generate a random email:</p>
          <div class="mt-5 rounded-xl border border-white/10 bg-zinc-950/60 p-5">
            <div class="flex items-center gap-2"><span class="inline-flex items-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 px-3 py-1 text-xs font-semibold">GET</span><code class="px-3 py-1.5 text-sm">/getmail</code><button data-copy="#curl1" class="ml-auto inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs hover:bg-white/10 active:scale-95"><i data-lucide="copy" class="h-4 w-4"></i>Copy</button></div>
            <pre id="curl1" class="mt-4 overflow-x-auto rounded-lg border border-white/10 bg-zinc-900 p-4 text-sm text-zinc-200"><code>curl https://temp-mail-bj.vercel.app/getmail</code></pre>
          </div>
        </section>

        <section id="endpoints" class="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/60 to-zinc-900/30 p-5 sm:p-8">
          <div class="flex items-center gap-3"><div class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20"><i data-lucide="server" class="h-5 w-5 text-indigo-400"></i></div><h2 class="text-2xl font-bold">API Endpoints</h2></div>
          <div class="mt-5 space-y-4">
            <div class="group rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"><div class="flex items-center gap-2"><span class="inline-flex items-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 px-3 py-1 text-xs font-semibold">GET</span><code class="px-3 py-1.5 text-sm">/getmail</code><span class="text-xs text-zinc-400">Random email</span><button data-endpoint="/getmail" class="ml-auto inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-zinc-950/60 px-2.5 py-1.5 text-xs hover:bg-zinc-900 active:scale-95"><i data-lucide="copy" class="h-4 w-4"></i>Copy</button></div></div>
            <div class="group rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"><div class="flex items-center gap-2"><span class="inline-flex items-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 px-3 py-1 text-xs font-semibold">GET</span><code class="px-3 py-1.5 text-sm">/getmail?name=xyz</code><span class="text-xs text-zinc-400">Custom email</span><button data-endpoint="/getmail?name=xyz" class="ml-auto inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-zinc-950/60 px-2.5 py-1.5 text-xs hover:bg-zinc-900 active:scale-95"><i data-lucide="copy" class="h-4 w-4"></i>Copy</button></div></div>
            <div class="group rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"><div class="flex items-center gap-2"><span class="inline-flex items-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 px-3 py-1 text-xs font-semibold">GET</span><code class="px-3 py-1.5 text-sm">/chkmail?mail=...</code><span class="text-xs text-zinc-400">Check inbox</span><button data-endpoint="/chkmail?mail=example%40mail.com" class="ml-auto inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-zinc-950/60 px-2.5 py-1.5 text-xs hover:bg-zinc-900 active:scale-95"><i data-lucide="copy" class="h-4 w-4"></i>Copy</button></div></div>
            <div class="group rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"><div class="flex items-center gap-2"><span class="inline-flex items-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 px-3 py-1 text-xs font-semibold">GET</span><code class="px-3 py-1.5 text-sm">/delete?mail=...&id=...</code><span class="text-xs text-zinc-400">Delete message</span><button data-endpoint="/delete?mail=example%40mail.com&id=1" class="ml-auto inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-zinc-950/60 px-2.5 py-1.5 text-xs hover:bg-zinc-900 active:scale-95"><i data-lucide="copy" class="h-4 w-4"></i>Copy</button></div></div>
            <div class="group rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"><div class="flex items-center gap-2"><span class="inline-flex items-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 px-3 py-1 text-xs font-semibold">GET</span><code class="px-3 py-1.5 text-sm">/health</code><span class="text-xs text-zinc-400">Health check</span><button data-endpoint="/health" class="ml-auto inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-zinc-950/60 px-2.5 py-1.5 text-xs hover:bg-zinc-900 active:scale-95"><i data-lucide="copy" class="h-4 w-4"></i>Copy</button></div></div>
          </div>
        </section>

        <section id="examples" class="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/60 to-zinc-900/30 p-5 sm:p-8">
          <div class="flex items-center gap-3"><div class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20"><i data-lucide="lightbulb" class="h-5 w-5 text-indigo-400"></i></div><h2 class="text-2xl font-bold">Examples</h2></div>
          <div class="mt-6 flex gap-5 overflow-x-auto snap-x snap-mandatory pb-2 lg:grid lg:grid-cols-2 lg:gap-6 lg:overflow-visible lg:snap-none">
            <div class="min-w-[85%] sm:min-w-[70%] lg:min-w-0 snap-start rounded-xl border border-white/10 bg-white/5 p-5 hover:bg-white/10"><h3 class="text-sm font-semibold text-zinc-300 mb-3">Random Email</h3><pre class="overflow-x-auto rounded-lg border border-white/10 bg-zinc-900 p-4 text-sm text-zinc-200"><code>curl https://temp-mail-bj.vercel.app/getmail</code></pre></div>
            <div class="min-w-[85%] sm:min-w-[70%] lg:min-w-0 snap-start rounded-xl border border-white/10 bg-white/5 p-5 hover:bg-white/10"><h3 class="text-sm font-semibold text-zinc-300 mb-3">Check Inbox</h3><pre class="overflow-x-auto rounded-lg border border-white/10 bg-zinc-900 p-4 text-sm text-zinc-200"><code>curl "https://temp-mail-bj.vercel.app/chkmail?mail=user%40mail.com"</code></pre></div>
          </div>
        </section>

        <section class="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/60 to-zinc-900/30 p-5 sm:p-8 text-center">
          <h3 class="text-xl font-bold">Disposable Mail API v1.0.0</h3>
          <p class="mt-2 text-zinc-400">Powered by BJ Tricks</p>
          <div class="mt-6 flex justify-center"><a href="https://t.me/BJ_Devs" target="_blank" class="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold hover:bg-white/10">Join Channel</a></div>
        </section>
      </div>
    </div>
  </main>

  <div id="toast" class="pointer-events-none fixed bottom-4 right-4 z-[60] hidden"><div class="flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900 px-4 py-2 text-sm shadow-xl"><i data-lucide="check-circle-2" class="h-4 w-4 text-emerald-400"></i><span id="toastMessage" class="text-zinc-100"></span></div></div>

  <script src="https://unpkg.com/lucide@latest"></script>
  <script src="https://cdn.jsdelivr.net/npm/@studio-freight/lenis@1.0.38/dist/lenis.min.js"></script>
  <script>
    lucide.createIcons({ attrs: { 'stroke-width': 1.5 } });
    let lenis = null; try { if (window.Lenis) { lenis = new Lenis({ duration: 1.1, smoothWheel: true }); function raf(t){ lenis.raf(t); requestAnimationFrame(raf); } requestAnimationFrame(raf); } } catch(e){}
    function scrollTo(t) { const e = document.querySelector(t.getAttribute('href')); if(e) lenis ? lenis.scrollTo(e, { offset: -72 }) : window.scrollTo({ top: e.getBoundingClientRect().top + window.scrollY - 72, behavior: 'smooth' }); }
    document.querySelectorAll('.scroll-link').forEach(l => l.addEventListener('click', e => { e.preventDefault(); scrollTo(l); }));
    const base = window.location.origin;
    const toast = document.getElementById('toast'), msg = document.getElementById('toastMessage');
    fetch(base + '/health').then(r=>r.ok&&document.querySelectorAll('#healthBadge, #healthBadgeMobile').forEach(b=>b.classList.remove('hidden')));
    function show(m){ msg.textContent=m; toast.classList.remove('hidden'); clearTimeout(window.tt); window.tt=setTimeout(()=>toast.classList.add('hidden'),2800); }
    function copy(t){ navigator.clipboard.writeText(t).then(()=>show('Copied!')).catch(()=>show('Failed')); }
    document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',()=>{ const e=document.querySelector(b.dataset.copy); if(e)copy(e.innerText.trim()); }));
    document.querySelectorAll('[data-endpoint]').forEach(b=>b.addEventListener('click',()=>copy(base + b.dataset.endpoint)));
    const mb = document.getElementById('mobileMenuButton'), mm = document.getElementById('mobileMenu'), mo = document.getElementById('mobileOverlay'), im = document.getElementById('iconMenu'), ic = document.getElementById('iconClose');
    let a=false; function openM(){ if(a)return; a=true; mm.classList.remove('hidden'); mo.classList.remove('pointer-events-none','opacity-0'); void mm.offsetHeight; mm.classList.remove('opacity-0','-translate-y-2'); mm.classList.add('opacity-100','translate-y-0'); mo.classList.add('opacity-100'); im.classList.add('hidden'); ic.classList.remove('hidden'); mb.setAttribute('aria-expanded','true'); setTimeout(()=>a=false,220); }
    function closeM(){ if(a)return; a=true; mm.classList.remove('opacity-100','translate-y-0'); mm.classList.add('opacity-0','-translate-y-2'); mo.classList.remove('opacity-100'); mo.classList.add('opacity-0'); im.classList.remove('hidden'); ic.classList.add('hidden'); mb.setAttribute('aria-expanded','false'); setTimeout(()=>{ mm.classList.add('hidden'); mo.classList.add('pointer-events-none'); a=false; },220); }
    mb?.addEventListener('click',() => mm.classList.contains('hidden')?openM():closeM());
    mo?.addEventListener('click',closeM);
    window.addEventListener('keydown',e=>e.key==='Escape'&&closeM());
    document.querySelectorAll('#mobileMenu .mobile-link').forEach(a=>a.addEventListener('click',closeM));
  </script>
</body>
</html>`);
});

module.exports = app;
