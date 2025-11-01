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
    let latest = null;

    if (raw && typeof raw === 'object') {
      const items = Array.isArray(raw) ? raw : Object.values(raw);
      items.sort((a, b) => (b.id || 0) - (a.id || 0));
      latest = items[0];
    }

    if (!latest) {
      return sendResponse(res, {});
    }

    const cleanMail = {
      predmetZkraceny: latest.predmetZkraceny || "",
      predmet: latest.predmet || "",
      od: latest.od || "",
      id: latest.id,
      kdy: latest.kdy || "",
      precteno: latest.precteno || "old"
    };

    sendResponse(res, cleanMail);

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
// DOCS – FULLY WORKING
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
  <link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    * { font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
    pre { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace; }
    [data-copy]:hover { background-color: rgba(255,255,255,0.1); }
  </style>
</head>
<body class="bg-zinc-950 text-zinc-100 antialiased min-h-screen overflow-x-hidden selection:bg-indigo-500/30 selection:text-white">
  <!-- Background -->
  <div class="pointer-events-none fixed inset-0 -z-10">
    <div class="absolute inset-0 bg-[radial-gradient(1200px_600px_at_80%_-20%,rgba(99,102,241,.15),transparent),radial-gradient(800px_400px_at_0%_120%,rgba(168,85,247,.12),transparent)]"></div>
    <div class="absolute inset-0 opacity-[0.03] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:48px_48px]"></div>
  </div>

  <!-- Header -->
  <header class="sticky top-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/60 border-b border-white/5">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between min-w-0">
      <a href="#" class="inline-flex items-center gap-2 min-w-0">
        <span class="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-tr from-indigo-600 to-violet-600 text-xs font-bold text-white">DM</span>
        <span class="text-sm font-semibold tracking-tight text-zinc-200 truncate">Disposable Mail</span>
      </a>
      <nav class="hidden lg:flex items-center gap-6">
        <a href="#quick-start" class="text-sm text-zinc-400 hover:text-zinc-100 transition-colors scroll-link">Quick Start</a>
        <a href="#endpoints" class="text-sm text-zinc-400 hover:text-zinc-100 transition-colors scroll-link">Endpoints</a>
        <a href="#examples" class="text-sm text-zinc-400 hover:text-zinc-100 transition-colors scroll-link">Examples</a>
      </nav>
      <div class="flex items-center gap-2">
        <div id="healthBadge" class="hidden md:inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs text-zinc-300">
          <span class="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Live
        </div>
        <a href="https://t.me/BJ_Devs" target="_blank" class="hidden sm:inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold tracking-tight hover:bg-white/10 hover:border-white/20 transition">
          <i data-lucide="telegram" class="h-4 w-4"></i> BJ Tricks
        </a>
        <button id="mobileMenuButton" class="lg:hidden inline-flex items-center justify-center rounded-md border border-white/10 bg-white/5 p-2 text-zinc-200 hover:bg-white/10 hover:border-white/20 transition">
          <i data-lucide="menu" class="h-5 w-5"></i>
        </button>
      </div>
    </div>

    <!-- Mobile Menu -->
    <div id="mobileMenu" class="lg:hidden fixed inset-x-0 top-14 z-50 border-b border-white/10 bg-zinc-950/95 backdrop-blur px-4 py-4 hidden transition-all duration-200">
      <nav class="space-y-1">
        <a href="#quick-start" class="scroll-link flex items-center justify-between rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-zinc-100 transition">
          <span class="inline-flex items-center gap-2"><i data-lucide="zap" class="h-4 w-4"></i> Quick Start</span>
          <i data-lucide="chevron-right" class="h-4 w-4 text-zinc-500"></i>
        </a>
        <a href="#endpoints" class="scroll-link flex items-center justify-between rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-zinc-100 transition">
          <span class="inline-flex items-center gap-2"><i data-lucide="server" class="h-4 w-4"></i> Endpoints</span>
          <i data-lucide="chevron-right" class="h-4 w-4 text-zinc-500"></i>
        </a>
        <a href="#examples" class="scroll-link flex items-center justify-between rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-zinc-100 transition">
          <span class="inline-flex items-center gap-2"><i data-lucide="code-2" class="h-4 w-4"></i> Examples</span>
          <i data-lucide="chevron-right" class="h-4 w-4 text-zinc-500"></i>
        </a>
      </nav>
      <div class="my-4 h-px bg-white/10"></div>
      <a href="https://t.me/BJ_Devs" target="_blank" class="inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold tracking-tight text-zinc-100 hover:bg-white/10 hover:border-white/20 transition">
        <i data-lucide="telegram" class="h-4 w-4"></i> BJ Tricks
      </a>
    </div>
  </header>

  <!-- Hero -->
  <section class="relative py-12 sm:py-20">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        <div class="lg:col-span-7">
          <div class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 mb-4">
            <span class="inline-flex h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
            60 RPM • Custom Names • Auto Delete
          </div>
          <h1 class="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-tight">
            <span class="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-indigo-300 to-violet-300">Disposable Mail API</span>
          </h1>
          <p class="mt-4 text-base sm:text-lg text-zinc-400 max-w-2xl">Generate temporary emails, check inbox, delete messages — instantly & securely. No login. No limits.</p>
          <div class="mt-6 flex flex-wrap gap-3">
            <a href="#quick-start" class="scroll-link inline-flex items-center gap-2 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 active:scale-[0.98] transition">
              <i data-lucide="zap" class="h-4 w-4"></i> Get Started
            </a>
            <a href="https://t.me/BJ_Devs" target="_blank" class="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-100 hover:bg-white/10 hover:border-white/20 transition">
              <i data-lucide="telegram" class="h-4 w-4"></i> Join Channel
            </a>
          </div>
        </div>
        <div class="lg:col-span-5">
          <div class="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/60 to-zinc-900/30 p-5 shadow-2xl">
            <div class="flex items-center justify-between text-sm text-zinc-300">
              <div class="flex items-center gap-2"><i data-lucide="mail" class="h-4 w-4"></i> Live Preview</div>
              <span class="text-xs text-zinc-400">Real-time inbox</span>
            </div>
            <div class="mt-4 rounded-lg border border-white/10 bg-zinc-900 p-4">
              <div class="space-y-2 text-xs">
                <div class="flex justify-between"><span class="text-zinc-500">From:</span> <span class="text-indigo-400">verify@telegram.org</span></div>
                <div class="flex justify-between"><span class="text-zinc-500">Subject:</span> <span class="text-zinc-300 truncate">Your login code: 123456</span></div>
                <div class="flex justify-between"><span class="text-zinc-500">Time:</span> <span class="text-zinc-400">2 min ago</span></div>
              </div>
            </div>
            <div class="mt-4 grid grid-cols-3 gap-2 text-[11px] text-zinc-400">
              <div class="rounded-md border border-white/10 bg-white/5 px-2.5 py-2 text-center"><span class="text-zinc-200 font-medium">60</span><br>RPM</div>
              <div class="rounded-md border border-white/10 bg-white/5 px-2.5 py-2 text-center"><span class="text-zinc-200 font-medium">Custom</span><br>Names</div>
              <div class="rounded-md border border-white/10 bg-white/5 px-2.5 py-2 text-center"><span class="text-zinc-200 font-medium">Auto</span><br>Delete</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Main Content -->
  <main class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-20">
    <div class="grid lg:grid-cols-12 gap-8 lg:gap-10">
      <!-- Sidebar TOC -->
      <aside class="hidden xl:col-span-3 xl:block">
        <div class="sticky top-20">
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="text-sm font-semibold tracking-tight text-zinc-200 mb-2">On this page</div>
            <nav class="space-y-1">
              <a href="#quick-start" class="scroll-link group flex items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition">
                <i data-lucide="zap" class="h-4 w-4"></i> Quick Start
              </a>
              <a href="#endpoints" class="scroll-link group flex items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition">
                <i data-lucide="server" class="h-4 w-4"></i> Endpoints
              </a>
              <a href="#examples" class="scroll-link group flex items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition">
                <i data-lucide="code-2" class="h-4 w-4"></i> Examples
              </a>
            </nav>
          </div>
        </div>
      </aside>

      <!-- Content -->
      <div class="lg:col-span-12 xl:col-span-9 space-y-10">

        <!-- Quick Start -->
        <section id="quick-start" class="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/60 to-zinc-900/30 p-6 sm:p-8">
          <div class="flex items-center gap-3">
            <div class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20">
              <i data-lucide="zap" class="h-5 w-5 text-indigo-400"></i>
            </div>
            <h2 class="text-2xl sm:text-3xl font-bold tracking-tight">Quick Start</h2>
          </div>
          <p class="mt-3 text-zinc-400">Generate a random disposable email instantly:</p>
          <div class="mt-5 rounded-xl border border-white/10 bg-zinc-950/60 p-5">
            <div class="flex flex-wrap items-center gap-2">
              <span class="inline-flex items-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 px-3 py-1 text-xs font-semibold">GET</span>
              <code class="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm">/getmail</code>
              <button data-copy="curl {{BASE_URL}}/getmail" class="ml-auto inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/10 transition">
                <i data-lucide="copy" class="h-4 w-4"></i> Copy
              </button>
            </div>
            <pre class="mt-4 overflow-x-auto rounded-lg border border-white/10 bg-zinc-900 p-4 text-sm text-zinc-200"><code id="curl-getmail">curl {{BASE_URL}}/getmail</code></pre>
          </div>
        </section>

        <!-- Endpoints -->
        <section id="endpoints" class="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/60 to-zinc-900/30 p-6 sm:p-8">
          <div class="flex items-center gap-3">
            <div class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20">
              <i data-lucide="server" class="h-5 w-5 text-indigo-400"></i>
            </div>
            <h2 class="text-2xl sm:text-3xl font-bold tracking-tight">API Endpoints</h2>
          </div>
          <div class="mt-6 space-y-4">
            ${[
              { method: 'GET', path: '/getmail', desc: 'Generate random email', example: 'curl {{BASE_URL}}/getmail' },
              { method: 'GET', path: '/getmail?name=xyz', desc: 'Custom name (xyz@domain)', example: 'curl "{{BASE_URL}}/getmail?name=xyz"' },
              { method: 'GET', path: '/chkmail?mail=...', desc: 'Check inbox', example: 'curl "{{BASE_URL}}/chkmail?mail=xyz%40domain.com"' },
              { method: 'GET', path: '/delete?mail=...&id=...', desc: 'Delete message', example: 'curl "{{BASE_URL}}/delete?mail=xyz%40domain.com&id=123"' },
              { method: 'GET', path: '/health', desc: 'Health check', example: 'curl {{BASE_URL}}/health' }
            ].map(ep => `
            <div class="group rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition">
              <div class="flex flex-wrap items-center gap-2">
                <span class="inline-flex items-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 px-3 py-1 text-xs font-semibold">${ep.method}</span>
                <code class="rounded-md border border-white/10 bg-zinc-950/60 px-3 py-1.5 text-sm">${ep.path}</code>
                <span class="text-xs text-zinc-400">${ep.desc}</span>
                <button data-copy="${ep.example}" class="ml-auto inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-zinc-950/60 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900 transition">
                  <i data-lucide="copy" class="h-4 w-4"></i> Copy
                </button>
              </div>
            </div>`).join('')}
          </div>
        </section>

        <!-- Examples -->
        <section id="examples" class="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/60 to-zinc-900/30 p-6 sm:p-8">
          <div class="flex items-center gap-3">
            <div class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20">
              <i data-lucide="code-2" class="h-5 w-5 text-indigo-400"></i>
            </div>
            <h2 class="text-2xl sm:text-3xl font-bold tracking-tight">Examples</h2>
          </div>
          <div class="mt-6 grid md:grid-cols-2 gap-6">
            <div class="rounded-xl border border-white/10 bg-white/5 p-5 hover:bg-white/10 transition">
              <h3 class="text-sm font-semibold text-zinc-300 mb-3">Random Email</h3>
              <pre class="overflow-x-auto rounded-lg border border-white/10 bg-zinc-900 p-4 text-[13px] text-zinc-200"><code>curl {{BASE_URL}}/getmail</code></pre>
            </div>
            <div class="rounded-xl border border-white/10 bg-white/5 p-5 hover:bg-white/10 transition">
              <h3 class="text-sm font-semibold text-zinc-300 mb-3">Check Inbox</h3>
              <pre class="overflow-x-auto rounded-lg border border-white/10 bg-zinc-900 p-4 text-[13px] text-zinc-200"><code>curl "{{BASE_URL}}/chkmail?mail=xyz%40domain.com"</code></pre>
            </div>
          </div>
        </section>

        <!-- Footer -->
        <section class="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/60 to-zinc-900/30 p-6 sm:p-8 text-center">
          <h3 class="text-xl font-bold tracking-tight">Disposable Mail API</h3>
          <p class="mt-2 text-zinc-400">Free, fast, and anonymous temporary email service.</p>
          <div class="mt-6 flex items-center justify-center gap-2">
            <span class="text-sm text-zinc-400">Made with</span>
            <span class="text-red-500">♥</span>
            <span class="text-sm text-zinc-400">by</span>
            <a href="https://t.me/BJ_Devs" target="_blank" class="text-sm font-semibold text-indigo-400 hover:text-indigo-300 transition">BJ Tricks</a>
          </div>
        </section>
      </div>
    </div>
  </main>

  <!-- Toast -->
  <div id="toast" class="fixed bottom-4 right-4 z-50 hidden">
    <div class="flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900 px-4 py-2 text-sm shadow-xl">
      <i data-lucide="check-circle-2" class="h-4 w-4 text-emerald-400"></i>
      <span id="toastMsg" class="text-zinc-100">Copied!</span>
    </div>
  </div>

  <script>
    // Initialize Lucide Icons
    lucide.createIcons({ attrs: { 'stroke-width': 1.5 } });

    // Get Base URL
    const BASE_URL = window.location.origin;

    // Replace {{BASE_URL}} in all code blocks
    document.querySelectorAll('code').forEach(el => {
      el.innerHTML = el.innerHTML.replace(/{{BASE_URL}}/g, BASE_URL);
    });

    // Health Check
    fetch('/health')
      .then(r => r.ok && document.getElementById('healthBadge').classList.remove('hidden'))
      .catch(() => {});

    // Mobile Menu Toggle
    const menuBtn = document.getElementById('mobileMenuButton');
    const mobileMenu = document.getElementById('mobileMenu');
    menuBtn?.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });

    // Smooth Scroll
    document.querySelectorAll('.scroll-link').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        const target = document.querySelector(a.getAttribute('href'));
        if (target) {
          window.scrollTo({ top: target.offsetTop - 80, behavior: 'smooth' });
        }
      });
    });

    // Copy to Clipboard
    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => {
        let text = btn.getAttribute('data-copy');
        text = text.replace(/{{BASE_URL}}/g, BASE_URL);
        navigator.clipboard.writeText(text).then(() => {
          const toast = document.getElementById('toast');
          const msg = document.getElementById('toastMsg');
          msg.textContent = 'Copied!';
          toast.classList.remove('hidden');
          setTimeout(() => toast.classList.add('hidden'), 2000);
        }).catch(() => {
          const toast = document.getElementById('toast');
          const msg = document.getElementById('toastMsg');
          msg.textContent = 'Failed!';
          toast.classList.remove('hidden');
          setTimeout(() => toast.classList.add('hidden'), 2000);
        });
      });
    });
  </script>
</body>
</html>`);
});
