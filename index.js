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
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * { font-family: Inter, sans-serif; }
    pre { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace; }
  </style>
</head>
<body class="bg-zinc-950 text-zinc-100 min-h-screen">
  <div class="fixed inset-0 -z-10 bg-gradient-to-br from-zinc-900 via-black to-zinc-950"></div>

  <header class="sticky top-0 z-50 backdrop-blur border-b border-white/5">
    <div class="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
      <a href="#" class="flex items-center gap-2"><span class="w-8 h-8 rounded bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-xs font-bold">DM</span><span class="font-semibold">Disposable Mail</span></a>
      <nav class="hidden md:flex gap-6 text-sm">
        <a href="#quick-start" class="text-zinc-400 hover:text-white transition scroll-link">Quick Start</a>
        <a href="#endpoints" class="text-zinc-400 hover:text-white transition scroll-link">Endpoints</a>
        <a href="#examples" class="text-zinc-400 hover:text-white transition scroll-link">Examples</a>
      </nav>
      <div class="flex items-center gap-3">
        <div id="healthBadge" class="hidden items-center gap-1.5 px-2.5 py-1 text-xs border border-white/10 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Live</div>
        <a href="https://t.me/BJ_Devs" target="_blank" class="text-xs px-3 py-1.5 border border-white/10 rounded-md hover:bg-white/10">BJ Tricks</a>
        <button id="menuBtn" class="md:hidden"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg></button>
      </div>
    </div>
  </header>

  <div id="mobileMenu" class="hidden fixed inset-0 z-40 bg-black/50" onclick="this.classList.add('hidden')">
    <div class="bg-zinc-950 p-6 space-y-4" onclick="event.stopPropagation()">
      <a href="#quick-start" class="block py-2 text-zinc-300 scroll-link">Quick Start</a>
      <a href="#endpoints" class="block py-2 text-zinc-300 scroll-link">Endpoints</a>
      <a href="#examples" class="block py-2 text-zinc-300 scroll-link">Examples</a>
    </div>
  </div>

  <main class="max-w-7xl mx-auto px-4 py-12 space-y-16">
    <section class="text-center">
      <h1 class="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-violet-400">Disposable Mail API</h1>
      <p class="mt-4 text-zinc-400">Generate, check, delete — instant & free.</p>
      <div class="mt-8 flex justify-center gap-4 flex-wrap">
        <a href="#quick-start" class="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-lg font-medium text-sm scroll-link">Get Started</a>
        <a href="https://t.me/BJ_Devs" target="_blank" class="px-5 py-2.5 border border-white/10 rounded-lg text-sm">Join Channel</a>
      </div>
    </section>

    <section id="quick-start" class="bg-white/5 border border-white/10 rounded-2xl p-8">
      <h2 class="text-2xl font-bold flex items-center gap-3"><span class="w-8 h-8 rounded bg-indigo-600/20 flex items-center justify-center"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg></span> Quick Start</h2>
      <p class="mt-3 text-zinc-400">Generate a random email:</p>
      <div class="mt-5 bg-zinc-900/50 border border-white/10 rounded-xl p-5">
        <div class="flex items-center gap-3"><span class="px-3 py-1 text-xs font-bold bg-gradient-to-r from-indigo-600 to-violet-600 rounded-full">GET</span><code>/getmail</code><button data-copy="curl https://temp-mail-bj.vercel.app/getmail" class="ml-auto text-xs px-2.5 py-1 border border-white/10 rounded hover:bg-white/10">Copy</button></div>
        <pre class="mt-3 bg-black/30 p-4 rounded-lg overflow-x-auto text-sm"><code>curl https://temp-mail-bj.vercel.app/getmail</code></pre>
      </div>
    </section>

    <section id="endpoints" class="space-y-6">
      <h2 class="text-2xl font-bold flex items-center gap-3"><span class="w-8 h-8 rounded bg-indigo-600/20 flex items-center justify-center"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a8 8 0 018-8v0a8 8 0 018 8v0m-8 8h8"></path></svg></span> Endpoints</h2>
      ${['/getmail', '/getmail?name=xyz', '/chkmail?mail=...', '/delete?mail=...&id=...', '/health'].map((ep, i) => `
      <div class="bg-white/5 border border-white/10 rounded-xl p-5 flex items-center gap-4">
        <span class="px-3 py-1 text-xs font-bold bg-gradient-to-r from-indigo-600 to-violet-600 rounded-full">GET</span>
        <code class="flex-1">${ep}</code>
        <button data-copy="https://temp-mail-bj.vercel.app${ep.includes('?') ? ep.split('?')[0] + '?...' : ep}" class="text-xs px-2.5 py-1 border border-white/10 rounded hover:bg-white/10">Copy URL</button>
      </div>`).join('')}
    </section>

    <section id="examples" class="bg-white/5 border border-white/10 rounded-2xl p-8">
      <h2 class="text-2xl font-bold flex items-center gap-3"><span class="w-8 h-8 rounded bg-indigo-600/20 flex items-center justify-center"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg></span> Examples</h2>
      <div class="mt-6 grid md:grid-cols-2 gap-6">
        <div class="bg-zinc-900/50 border border-white/10 rounded-xl p-5">
          <h3 class="font-medium text-zinc-300">Random Email</h3>
          <pre class="mt-3 bg-black/30 p-4 rounded-lg overflow-x-auto text-sm"><code>curl https://temp-mail-bj.vercel.app/getmail</code></pre>
        </div>
        <div class="bg-zinc-900/50 border border-white/10 rounded-xl p-5">
          <h3 class="font-medium text-zinc-300">Check Inbox</h3>
          <pre class="mt-3 bg-black/30 p-4 rounded-lg overflow-x-auto text-sm"><code>curl "https://temp-mail-bj.vercel.app/chkmail?mail=user%40mail.com"</code></pre>
        </div>
      </div>
    </section>

    <footer class="text-center py-8 border-t border-white/10">
      <p class="text-zinc-500 text-sm">Made with <span class="text-red-500">♥</span> by <a href="https://t.me/BJ_Devs" class="underline">BJ Tricks</a></p>
    </footer>
  </main>

  <div id="toast" class="fixed bottom-4 right-4 bg-zinc-900 border border-white/10 rounded-lg px-4 py-2 text-sm shadow-xl hidden"><span id="toastMsg"></span></div>

  <script>
    // Health Check
    fetch('/health').then(r => r.ok && document.getElementById('healthBadge').classList.remove('hidden'));

    // Smooth Scroll
    document.querySelectorAll('.scroll-link').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        const target = document.querySelector(a.getAttribute('href'));
        window.scrollTo({ top: target.offsetTop - 80, behavior: 'smooth' });
      });
    });

    // Mobile Menu
    document.getElementById('menuBtn').onclick = () => document.getElementById('mobileMenu').classList.toggle('hidden');

    // Copy to Clipboard
    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.onclick = () => {
        navigator.clipboard.writeText(btn.dataset.copy).then(() => {
          const msg = document.getElementById('toastMsg');
          msg.textContent = 'Copied!';
          const toast = document.getElementById('toast');
          toast.classList.remove('hidden');
          setTimeout(() => toast.classList.add('hidden'), 2000);
        });
      };
    });
  </script>
</body>
</html>`);
});

module.exports = app;
