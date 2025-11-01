const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// ======================
// DISPOSABLE MAIL FUNCTIONS
// ======================

async function getCustomMail(name) {
  const checkRes = await axios.post(
    'https://www.disposablemail.com/index/email-check/',
    new URLSearchParams({ email: name, format: 'json' }),
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'x-requested-with': 'XMLHttpRequest',
        'origin': 'https://www.disposablemail.com',
      }
    }
  );

  if (checkRes.data !== 'ok') return null;

  const createRes = await axios.post(
    'https://www.disposablemail.com/index/new-email/',
    new URLSearchParams({ emailInput: name, format: 'json' }),
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'x-requested-with': 'XMLHttpRequest',
        'origin': 'https://www.disposablemail.com',
      }
    }
  );

  const cookie = createRes.headers['set-cookie']?.find(c => c.includes('TMA='))?.split(';')[0];
  const email = decodeURIComponent(cookie?.split('=')[1]);

  return { email, session: cookie };
}

async function getDefaultMail() {
  const homeRes = await axios.get('https://www.disposablemail.com', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9',
      'DNT': '1',
      'Referer': 'https://www.disposablemail.com/',
    },
    decompress: true
  });

  const setCookie = homeRes.headers['set-cookie'];
  const phpsessid = setCookie?.find(c => c.includes('PHPSESSID'))?.split(';')[0];
  const csrf = homeRes.data.match(/const CSRF\s*=\s*"(.+?)"/)?.[1];

  const inboxRes = await axios.get(`https://www.disposablemail.com/index/index?csrf_token=${csrf}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://www.disposablemail.com/',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': phpsessid
    },
    decompress: true
  });

  return {
    email: inboxRes.data?.email || null,
    password: inboxRes.data?.heslo || null,
  };
}

// ======================
// API ENDPOINTS
// ======================

app.get('/getmail', async (req, res) => {
  try {
    const name = req.query.name;
    if (name) {
      const result = await getCustomMail(name);
      if (!result) return res.status(400).json({ error: 'Mail not available' });
      return res.json(result);
    } else {
      const data = await getDefaultMail();
      return res.json(data);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate mail' });
  }
});

app.get('/chkmail', async (req, res) => {
  const mail = req.query.mail;
  if (!mail) return res.status(400).json({ error: 'Missing mail query parameter' });

  try {
    const response = await axios.get('https://www.disposablemail.com/index/refresh', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'sec-ch-ua-platform': '"Android"',
        'x-requested-with': 'XMLHttpRequest',
        'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        'sec-fetch-site': 'same-origin',
        'referer': 'https://www.disposablemail.com/',
        'accept-language': 'en-US,en;q=0.9',
        'Cookie': `TMA=${encodeURIComponent(mail)}`
      }
    });

    res.json(response.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to check mail' });
  }
});

app.get('/delete', async (req, res) => {
  const { mail, id } = req.query;
  if (!mail || !id) return res.status(400).json({ error: 'Missing mail or id' });

  try {
    const delRes = await axios.post(`https://www.disposablemail.com/delete-email/${id}`,
      new URLSearchParams({ id }),
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'sec-ch-ua-platform': '"Android"',
          'sec-ch-ua-mobile': '?1',
          'x-requested-with': 'XMLHttpRequest',
          'sec-fetch-mode': 'cors',
          'Cookie': `TMA=${encodeURIComponent(mail)}`
        }
      }
    );

    res.json(delRes.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete mail' });
  }
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ======================
// NEW DOCS PAGE (Root Route)
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
</head>
<body class="bg-zinc-950 text-zinc-100 antialiased min-h-screen overflow-x-hidden [font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Noto Sans,Ubuntu,Cantarell,Helvetica Neue,sans-serif] selection:bg-indigo-500/30 selection:text-white">
  <!-- Background -->
  <div class="pointer-events-none fixed inset-0 -z-10">
    <div class="absolute inset-0 bg-[radial-gradient(1200px_600px_at_80%_-20%,rgba(99,102,241,.15),transparent),radial-gradient(800px_400px_at_0%_120%,rgba(168,85,247,.12),transparent)]"></div>
    <div class="absolute inset-0 opacity-[0.03] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:48px_48px]"></div>
  </div>

  <!-- Top bar -->
  <header class="sticky top-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-zinc-950министра/60 border-b border-white/5">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between min-w-0">
      <a href="#" class="inline-flex items-center gap-2 min-w-0">
        <span class="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/5 ring-1 ring-white/10 text-xs font-semibold tracking-tight">DM</span>
        <span class="text-sm font-semibold tracking-tight text-zinc-200 truncate">Disposable Mail API</span>
      </a>
      <nav class="hidden lg:flex items-center gap-6">
        <a href="#quick-start" class="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">Quick Start</a>
        <a href="#endpoints" class="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">Endpoints</a>
        <a href="#examples" class="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">Examples</a>
      </nav>
      <div class="flex items-center gap-2">
        <div id="healthBadge" class="hidden md:inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs text-zinc-300">
          <span class="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
          Healthy
        </div>
        <a href="https://t.me/BJ_Devs" target="_blank" class="hidden sm:inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold tracking-tight hover:bg-white/10 hover:border-white/20 transition-colors">
          <i data-lucide="rocket" class="h-4 w-4"></i>
          BJ Tricks
        </a>
        <button id="mobileMenuButton" aria-expanded="false" class="md:inline-flex lg:hidden inline-flex items-center justify-center rounded-md border border-white/10 bg-white/5 p-2 text-zinc-200 hover:bg-white/10 hover:border-white/20 active:scale-95 transition">
          <i id="iconMenu" data-lucide="menu" class="h-5 w-5"></i>
          <i id="iconClose" data-lucide="x" class="h-5 w-5 hidden"></i>
        </button>
      </div>
    </div>

    <!-- Mobile Menu -->
    <div id="mobileOverlay" class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm opacity-0 pointer-events-none transition-opacity duration-200 md:hidden"></div>
    <div id="mobileMenu" class="md:hidden fixed inset-x-0 top-14 z-50 border-b border-white/10 bg-zinc-950/95 backdrop-blur px-4 sm:px-6 py-4 opacity-0 -translate-y-2 hidden transition-all duration-200">
      <nav class="space-y-1">
        <a href="#quick-start" class="mobile-link scroll-link flex items-center justify-between rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-zinc-100 transition">
          <span class="inline-flex items-center gap-2"><i data-lucide="rocket" class="h-4 w-4"></i> Quick Start</span>
          <i data-lucide="chevron-right" class="h-4 w-4 text-zinc-500"></i>
        </a>
        <a href="#endpoints" class="mobile-link scroll-link flex items-center justify-between rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-zinc-100 transition">
          <span class="inline-flex items-center gap-2"><i data-lucide="server" class="h-4 w-4"></i> Endpoints</span>
          <i data-lucide="chevron-right" class="h-4 w-4 text-zinc-500"></i>
        </a>
        <a href="#examples" class="mobile-link scroll-link flex items-center justify-between rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-zinc-100 transition">
          <span class="inline-flex items-center gap-2"><i data-lucide="lightbulb" class="h-4 w-4"></i> Examples</span>
          <i data-lucide="chevron-right" class="h-4 w-4 text-zinc-500"></i>
        </a>
      </nav>
      <div class="my-4 h-px bg-white/10"></div>
      <div class="flex items-center justify-between">
        <div id="healthBadgeMobile" class="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs text-zinc-300">
          <span class="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
          Healthy
        </div>
        <a href="https://t.me/BJ_Devs" target="_blank" class="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold tracking-tight text-zinc-100 hover:bg-white/10 hover:border-white/20 transition">
          <i data-lucide="rocket" class="h-4 w-4"></i> BJ Tricks
        </a>
      </div>
    </div>
  </header>

  <!-- Hero -->
  <section class="relative">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
      <div class="grid lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        <div class="min-w-0 lg:col-span-7">
          <div class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 mb-4">
            <span class="inline-flex h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
            v1.0.0 • 4 Endpoints • Custom & Random
          </div>
          <h1 class="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-tight">
            <span class="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-indigo-300 to-violet-300">Disposable Mail API</span>
          </h1>
          <p class="mt-4 sm:mt-5 text-base sm:text-lg text-zinc-400 max-w-2xl">Generate temporary emails, check inbox, delete messages — instantly.</p>
          <div class="mt-5 sm:mt-6 flex flex-wrap items-center gap-3">
            <a href="#quick-start" class="scroll-link inline-flex items-center gap-2 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold tracking-tight text-white shadow-sm hover:brightness-110 active:scale-[0.98] transition">
              <i data-lucide="book-open" class="h-4 w-4"></i> Quick Start
            </a>
            <a href="https://t.me/BJ_Devs" target="_blank" class="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold tracking-tight text-zinc-100 hover:bg-white/10 hover:border-white/20 active:scale-[0.98] transition">
              <i data-lucide="message-circle" class="h-4 w-4"></i> Join Telegram
            </a>
          </div>
        </div>
        <div class="min-w-0 lg:col-span-5">
          <div class="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/60 to-zinc-900/30 p-4 sm:p-6 shadow-2xl">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-sm text-zinc-300">
                <i data-lucide="mail" class="h-4 w-4"></i> Preview
              </div>
              <span class="text-xs text-zinc-400">Real-time inbox</span>
            </div>
            <div class="mt-3 sm:mt-4 aspect-[16/10] w-full overflow-hidden rounded-lg border border-white/10">
              <img alt="Inbox" src="https://images.unsplash.com/photo-1555066931-4365d14bab6d?q=80&w=1200&auto=format&fit=crop" class="h-full w-full object-cover" loading="lazy">
            </div>
            <div class="mt-3 sm:mt-4 grid grid-cols-3 gap-2 sm:gap-3 text-[11px] sm:text-xs text-zinc-400">
              <div class="rounded-md border border-white/10 bg-white/5 px-2.5 py-2 sm:px-3"><span class="text-zinc-200 font-medium">4</span> Endpoints</div>
              <div class="rounded-md border border-white/10 bg-white/5 px-2.5 py-2 sm:px-3"><span class="text-zinc-200 font-medium">Unlimited</span> Mails</div>
              <div class="rounded-md border border-white/10 bg-white/5 px-2.5 py-2 sm:px-3"><span class="text-zinc-200 font-medium">0</span> Auth</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Main Content -->
  <main class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-20">
    <div class="grid lg:grid-cols-12 gap-8 lg:gap-10">
      <aside class="hidden xl:col-span-3 xl:block">
        <div class="sticky top-20 space-y-3">
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="text-sm font-semibold tracking-tight text-zinc-200 mb-2">On this page</div>
            <nav class="space-y-1">
              <a href="#quick-start" class="scroll-link group flex items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition"><i data-lucide="rocket" class="h-4 w-4"></i> Quick Start</a>
              <a href="#endpoints" class="scroll-link group flex items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition"><i data-lucide="server" class="h-4 w-4"></i> Endpoints</a>
              <a href="#examples" class="scroll-link group flex items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition"><i data-lucide="code-2" class="h-4 w-4"></i> Examples</a>
            </nav>
          </div>
        </div>
      </aside>

      <div class="min-w-0 lg:col-span-12 xl:col-span-9 space-y-8 lg:space-y-10">

        <!-- Quick Start -->
        <section id="quick-start" class="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/60 to-zinc-900/30 p-5 sm:p-8">
          <div class="flex items-center gap-3">
            <div class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20"><i data-lucide="rocket" class="h-5 w-5 text-indigo-400"></i></div>
            <h2 class="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">Quick Start</h2>
          </div>
          <p class="mt-3 text-zinc-400">Generate a disposable email instantly:</p>
          <div class="mt-5 rounded-xl border border-white/10 bg-zinc-950/60 p-4 sm:p-5">
            <div class="flex flex-wrap items-center gap-2">
              <span class="inline-flex items-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 px-3 py-1 text-xs font-semibold">GET</span>
              <code class="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm">/getmail</code>
              <button type="button" data-copy="#curlGetmail" class="ml-auto inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/10 active:scale-[0.98] transition"><i data-lucide="copy" class="h-4 w-4"></i> Copy</button>
            </div>
            <pre id="curlGetmail" class="mt-4 overflow-x-auto rounded-lg border border-white/10 bg-zinc-900 p-4 text-[13px] sm:text-sm leading-relaxed text-zinc-200 [font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace]" style="scrollbar-width: thin;"><code>curl https://your-api.vercel.app/getmail</code></pre>
          </div>
        </section>

        <!-- Endpoints -->
        <section id="endpoints" class="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/60 to-zinc-900/30 p-5 sm:p-8">
          <div class="flex items-center gap-3">
            <div class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20"><i data-lucide="server" class="h-5 w-5 text-indigo-400"></i></div>
            <h2 class="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">API Endpoints</h2>
          </div>
          <div class="mt-5 space-y-4">
            <div class="group rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition"><div class="flex flex-wrap items-center gap-2"><span class="inline-flex items-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 px-3 py-1 text-xs font-semibold">GET</span><code class="rounded-md border border-white/10 bg-zinc-950/60 px-3 py-1.5 text-sm">/getmail</code><span class="text-xs text-zinc-400">Random email</span><button type="button" data-endpoint="/getmail" class="ml-auto inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-zinc-950/60 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900 active:scale-[0.98] transition"><i data-lucide="copy" class="h-4 w-4"></i> Copy</button></div></div>
            <div class="group rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition"><div class="flex flex-wrap items-center gap-2"><span class="inline-flex items-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 px-3 py-1 text-xs font-semibold">GET</span><code class="rounded-md border border-white/10 bg-zinc-950/60 px-3 py-1.5 text-sm">/getmail?name=xyz</code><span class="text-xs text-zinc-400">Custom email</span><button type="button" data-endpoint="/getmail?name=xyz" class="ml-auto inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-zinc-950/60 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900 active:scale-[0.98] transition"><i data-lucide="copy" class="h-4 w-4"></i> Copy</button></div></div>
            <div class="group rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition"><div class="flex flex-wrap items-center gap-2"><span class="inline-flex items-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 px-3 py-1 text-xs font-semibold">GET</span><code class="rounded-md border border-white/10 bg-zinc-950/60 px-3 py-1.5 text-sm">/chkmail?mail=...</code><span class="text-xs text-zinc-400">Check inbox</span><button type="button" data-endpoint="/chkmail?mail=example%40mail.com" class="ml-auto inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-zinc-950/60 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900 active:scale-[0.98] transition"><i data-lucide="copy" class="h-4 w-4"></i> Copy</button></div></div>
            <div class="group rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition"><div class="flex flex-wrap items-center gap-2"><span class="inline-flex items-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 px-3 py-1 text-xs font-semibold">GET</span><code class="rounded-md border border-white/10 bg-zinc-950/60 px-3 py-1.5 text-sm">/delete?mail=...&id=...</code><span class="text-xs text-zinc-400">Delete message</span><button type="button" data-endpoint="/delete?mail=example%40mail.com&id=123" class="ml-auto inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-zinc-950/60 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900 active:scale-[0.98] transition"><i data-lucide="copy" class="h-4 w-4"></i> Copy</button></div></div>
            <div class="group rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition"><div class="flex flex-wrap items-center gap-2"><span class="inline-flex items-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 px-3 py-1 text-xs font-semibold">GET</span><code class="rounded-md border border-white/10 bg-zinc-950/60 px-3 py-1.5 text-sm">/health</code><span class="text-xs text-zinc-400">Health check</span><button type="button" data-endpoint="/health" class="ml-auto inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-zinc-950/60 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900 active:scale-[0.98] transition"><i data-lucide="copy" class="h-4 w-4"></i> Copy</button></div></div>
          </div>
        </section>

        <!-- Examples -->
        <section id="examples" class="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/60 to-zinc-900/30 p-5 sm:p-8">
          <div class="flex items-center gap-3">
            <div class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20"><i data-lucide="lightbulb" class="h-5 w-5 text-indigo-400"></i></div>
            <h2 class="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">Examples</h2>
          </div>
          <div class="mt-6 flex gap-5 overflow-x-auto snap-x snap-mandatory pb-2 lg:grid lg:grid-cols-2 lg:gap-6 lg:overflow-visible lg:snap-none">
            <div class="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 min-w-[85%] sm:min-w-[70%] snap-start lg:min-w-0 hover:bg-white/10 transition"><h3 class="text-sm font-semibold tracking-tight text-zinc-300 mb-3">Random Email</h3><pre class="overflow-x-auto rounded-lg border border-white/10 bg-zinc-900 p-4 text-[13px] sm:text-sm leading-relaxed text-zinc-200 [font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace]" style="scrollbar-width: thin;"><code>curl https://your-api.vercel.app/getmail</code></pre></div>
            <div class="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 min-w-[85%] sm:min-w-[70%] snap-start lg:min-w-0 hover:bg-white/10 transition"><h3 class="text-sm font-semibold tracking-tight text-zinc-300 mb-3">Custom Email</h3><pre class="overflow-x-auto rounded-lg border border-white/10 bg-zinc-900 p-4 text-[13px] sm:text-sm leading-relaxed text-zinc-200 [font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace]" style="scrollbar-width: thin;"><code>curl "https://your-api.vercel.app/getmail?name=bjtricks"</code></pre></div>
            <div class="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 min-w-[85%] sm:min-w-[70%] snap-start lg:min-w-0 hover:bg-white/10 transition"><h3 class="text-sm font-semibold tracking-tight text-zinc-300 mb-3">Check Inbox</h3><pre class="overflow-x-auto rounded-lg border border-white/10 bg-zinc-900 p-4 text-[13px] sm:text-sm leading-relaxed text-zinc-200 [font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace]" style="scrollbar-width: thin;"><code>curl "https://your-api.vercel.app/chkmail?mail=user%40mail.com"</code></pre></div>
            <div class="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 min-w-[85%] sm:min-w-[70%] snap-start lg:min-w-0 hover:bg-white/10 transition"><h3 class="text-sm font-semibold tracking-tight text-zinc-300 mb-3">Delete Message</h3><pre class="overflow-x-auto rounded-lg border border-white/10 bg-zinc-900 p-4 text-[13px] sm:text-sm leading-relaxed text-zinc-200 [font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace]" style="scrollbar-width: thin;"><code>curl "https://your-api.vercel.app/delete?mail=user%40mail.com&id=123"</code></pre></div>
          </div>
        </section>

        <!-- Footer -->
        <section class="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/60 to-zinc-900/30 p-5 sm:p-8">
          <div class="text-center">
            <h3 class="text-xl font-bold tracking-tight">Disposable Mail API v1.0.0</h3>
            <p class="mt-2 text-zinc-400">Powered by BJ Tricks</p>
            <div class="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition"><div class="text-2xl font-extrabold tracking-tight text-zinc-100">4</div><div class="text-xs text-zinc-400">Endpoints</div></div>
              <div class="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition"><div class="text-2xl font-extrabold tracking-tight text-zinc-100">Unlimited</div><div class="text-xs text-zinc-400">Emails</div></div>
              <div class="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition"><div class="text-2xl font-extrabold tracking-tight text-zinc-100">0</div><div class="text-xs text-zinc-400">Auth</div></div>
            </div>
            <div class="mt-6 flex items-center justify-center gap-2">
              <a href="https://t.me/BJ_Devs" target="_blank" class="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold tracking-tight text-zinc-100 hover:bg-white/10 hover:border-white/20 transition">
                <i data-lucide="rocket" class="h-4 w-4"></i> Join Channel
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  </main>

  <!-- Toast -->
  <div id="toast" class="pointer-events-none fixed bottom-4 right-4 z-[60] hidden">
    <div class="flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900 px-4 py-2 text-sm shadow-xl">
      <i data-lucide="check-circle-2" class="h-4 w-4 text-emerald-400"></i>
      <span id="toastMessage" class="text-zinc-100"></span>
    </div>
  </div>

  <!-- Scripts -->
  <script src="https://unpkg.com/lucide@latest"></script>
  <script src="https://cdn.jsdelivr.net/npm/@studio-freight/lenis@1.0.38/dist/lenis.min.js"></script>
  <script>
    lucide.createIcons({ attrs: { 'stroke-width': 1.5 } });
    let lenis = null;
    try { if (window.Lenis) { lenis = new Lenis({ duration: 1.1, smoothWheel: true, smoothTouch: false }); function raf(t){ lenis.raf(t); requestAnimationFrame(raf); } requestAnimationFrame(raf); } } catch(e){}
    function scrollTo(t, o = -72) { const e = document.querySelector(typeof t === 'string' ? t : t.getAttribute('href')); if(!e)return; lenis ? lenis.scrollTo(e, { offset: o }) : window.scrollTo({ top: e.getBoundingClientRect().top + window.scrollY + o, behavior: 'smooth' }); }
    document.querySelectorAll('.scroll-link').forEach(e => e.addEventListener('click', ev => { const h = e.getAttribute('href'); if(h?.startsWith('#')){ ev.preventDefault(); scrollTo(h); } }));
    const base = window.location.origin;
    const toast = document.getElementById('toast'), msg = document.getElementById('toastMessage');
    const hb = document.getElementById('healthBadge'), hbm = document.getElementById('healthBadgeMobile');
    fetch(\`\${base}/health\`).then(r=>r.ok&&hb&&hbm&&(hb.classList.remove('hidden'), hbm.classList.remove('hidden'))).catch(()=>{});
    function show(m,t='success'){ msg.textContent=m; const i=document.createElement('i'); i.setAttribute('data-lucide',t==='error'?'x-circle':'check-circle-2'); i.className=t==='error'?'h-4 w-4 text-rose-400':'h-4 w-4 text-emerald-400'; toast.firstElementChild.prepend(i); lucide.createIcons(); toast.classList.remove('hidden'); clearTimeout(window.tt); window.tt=setTimeout(()=>toast.classList.add('hidden'),2800); }
    function copy(t){ navigator.clipboard.writeText(t).then(()=>show('Copied!')).catch(()=>show('Failed','error')); }
    document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',()=>{ const e=document.querySelector(b.dataset.copy); if(e)copy(e.innerText.trim()); }));
    document.querySelectorAll('[data-endpoint]').forEach(b=>b.addEventListener('click',()=>copy(base + b.dataset.endpoint)));
    // Mobile Menu
    const mb = document.getElementById('mobileMenuButton'), mm = document.getElementById('mobileMenu'), mo = document.getElementById('mobileOverlay'), im = document.getElementById('iconMenu'), ic = document.getElementById('iconClose');
    let a=false; function openM(){ if(a)return; a=true; mm.classList.remove('hidden'); mo.classList.remove('pointer-events-none','opacity-0'); void mm.offsetHeight; mm.classList.remove('opacity-0','-translate-y-2'); mm.classList.add('opacity-100','translate-y-0'); mo.classList.add('opacity-100'); im.classList.add('hidden'); ic.classList.remove('hidden'); mb.setAttribute('aria-expanded','true'); setTimeout(()=>a=false,220); }
    function closeM(){ if(a)return; a=true; mm.classList.remove('opacity-100','translate-y-0'); mm.classList.add('opacity-0','-translate-y-2'); mo.classList.remove('opacity-100'); mo.classList.add('opacity-0'); im.classList.remove('hidden'); ic.classList.add('hidden'); mb.setAttribute('aria-expanded','false'); setTimeout(()=>{ mm.classList.add('hidden'); mo.classList.add('pointer-events-none'); a=false; },220); }
    mb?.addEventListener('click',() => mm.classList.contains('hidden')?openM():closeM());
    mo?.addEventListener('click',closeM);
    window.addEventListener('keydown',e=>e.key==='Escape'&&closeM());
    document.querySelectorAll('#mobileMenu .mobile-link').forEach(a=>a.addEventListener('click',closeM));
    window.matchMedia('(min-width: 1024px)').addEventListener('change',e=>e.matches&&closeM());
  </script>
</body>
</html>`);
});

module.exports = app;
