const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// ====================== RATE LIMITING ======================
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

// ====================== RESPONSE HELPERS ======================
function sendResponse(res, data, status = 200) {
  res.setHeader('Content-Type', 'application/json');
  const response = { creator: "@BJ_Devs on Telegram", ok: true, ...data };
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

// ====================== MAIL LOGIC ======================
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
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'Cookie': phpsessid }
    });
    return { email: inboxRes.data?.email || null, password: inboxRes.data?.heslo || null };
  } catch { return { email: null, password: null }; }
}

// ====================== ENDPOINTS ======================
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
  } catch { sendError(res, "Failed to generate mail", 500); }
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
    if (!latest) return sendResponse(res, {});
    const cleanMail = {
      predmetZkraceny: latest.predmetZkraceny || "",
      predmet: latest.predmet || "",
      od: latest.od || "",
      id: latest.id,
      kdy: latest.kdy || "",
      precteno: latest.precteno || "old"
    };
    sendResponse(res, cleanMail);
  } catch { sendError(res, "Failed to check mail", 500); }
});

app.get('/delete', async (req, res) => {
  const { mail, id } = req.query;
  if (!mail || !id) return sendError(res, "Missing mail or id", 400);
  try {
    const delRes = await axios.post(`https://www.disposablemail.com/delete-email/${id}`,
      new URLSearchParams({ id }),
      { headers: { 'x-requested-with': 'XMLHttpRequest', 'Cookie': `TMA=${encodeURIComponent(mail)}` } }
    );
    sendResponse(res, delRes.data);
  } catch { sendError(res, "Failed to delete mail", 500); }
});

app.get('/health', (req, res) => {
  sendResponse(res, { status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ====================== FINAL COMPACT DOCS ======================
app.get('/', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Disposable Mail API - BJ Tricks</title>
  <meta name="theme-color" content="#09090b">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    * { font-family: Inter, sans-serif; }
    pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .compact-card { @apply rounded-xl border border-white/10 bg-gradient-to-b from-zinc-900/60 to-zinc-900/30 p-4 shadow-md; }
  </style>
</head>
<body class="bg-zinc-950 text-zinc-100 min-h-screen">
  <div class="fixed inset-0 -z-10 bg-[radial-gradient(1200px_600px_at_80%_-20%,rgba(99,102,241,.12),transparent)]"></div>

  <!-- Header -->
  <header class="sticky top-0 z-50 backdrop-blur bg-zinc-950/80 border-b border-white/5">
    <div class="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
      <a href="#" class="flex items-center gap-2">
        <div class="w-7 h-7 rounded bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-xs font-bold">DM</div>
        <span class="font-semibold text-sm">Disposable Mail</span>
      </a>
      <nav class="hidden md:flex gap-5 text-sm">
        <a href="#quick-start" class="text-zinc-400 hover:text-white scroll-link">Quick Start</a>
        <a href="#endpoints" class="text-zinc-400 hover:text-white scroll-link">Endpoints</a>
        <a href="#examples" class="text-zinc-400 hover:text-white scroll-link">Examples</a>
      </nav>
      <div class="flex items-center gap-2">
        <div id="healthBadge" class="hidden items-center gap-1 px-2 py-0.5 text-xs border border-white/10 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Live</div>
        <a href="https://t.me/BJ_Devs" target="_blank" class="text-xs px-2.5 py-1 border border-white/10 rounded hover:bg-white/10">BJ Tricks</a>
        <button id="menuBtn" class="md:hidden"><i data-lucide="menu" class="w-5 h-5"></i></button>
      </div>
    </div>
  </header>

  <!-- Mobile Menu -->
  <div id="mobileMenu" class="hidden fixed inset-0 z-40 bg-black/50" onclick="this.classList.add('hidden')">
    <div class="bg-zinc-950 p-5 space-y-3" onclick="event.stopPropagation()">
      <a href="#quick-start" class="block py-2 text-zinc-300 scroll-link">Quick Start</a>
      <a href="#endpoints" class="block py-2 text-zinc-300 scroll-link">Endpoints</a>
      <a href="#examples" class="block py-2 text-zinc-300 scroll-link">Examples</a>
    </div>
  </div>

  <!-- Hero + Preview -->
  <section class="max-w-7xl mx-auto px-4 py-10">
    <div class="grid md:grid-cols-2 gap-6">
      <div>
        <h1 class="text-3xl md:text-4xl font-bold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">Disposable Mail API</h1>
        <p class="mt-2 text-zinc-400 text-sm">Instant temporary emails. No signup. 60 RPM.</p>
        <div class="mt-5 flex gap-3">
          <a href="#quick-start" class="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 rounded text-sm font-medium scroll-link">Get Started</a>
          <a href="https://t.me/BJ_Devs" target="_blank" class="px-4 py-2 border border-white/10 rounded text-sm">Join Channel</a>
        </div>
      </div>

      <!-- Preview Box (Reference Size) -->
      <div class="compact-card">
        <div class="flex justify-between text-xs text-zinc-300 mb-3">
          <div class="flex items-center gap-1.5"><i data-lucide="mail" class="w-3.5 h-3.5"></i> Example</div>
          <span class="text-zinc-500">Real-time inbox</span>
        </div>
        <div class="bg-zinc-900/50 rounded-lg p-3 space-y-1.5 text-xs border border-white/5">
          <div class="flex justify-between"><span class="text-zinc-500">From:</span> <span class="text-indigo-400">verify@telegram.org</span></div>
          <div class="flex justify-between"><span class="text-zinc-500">Subject:</span> <span class="text-zinc-300 truncate">Your login code: 123456</span></div>
          <div class="flex justify-between"><span class="text-zinc-500">Time:</span> <span class="text-zinc-400">2 min ago</span></div>
        </div>
        <div class="mt-3 grid grid-cols-3 gap-1.5 text-[10px] text-zinc-400">
          <div class="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-center"><span class="font-medium text-zinc-200">60</span> RPM</div>
          <div class="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-center"><span class="font-medium text-zinc-200">Custom</span> Names</div>
          <div class="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-center"><span class="font-medium text-zinc-200">Auto</span> Delete</div>
        </div>
      </div>
    </div>
  </section>

  <!-- Main Content -->
  <main class="max-w-7xl mx-auto px-4 space-y-6 pb-16">

    <!-- Quick Start -->
    <section id="quick-start" class="compact-card">
      <h2 class="text-lg font-bold mb-3 flex items-center gap-2"><i data-lucide="zap" class="w-5 h-5 text-indigo-400"></i> Quick Start</h2>
      <div class="bg-zinc-900/50 rounded-lg p-3 border border-white/5">
        <div class="flex items-center gap-2 text-xs mb-2">
          <span class="bg-gradient-to-r from-indigo-600 to-violet-600 px-2 py-0.5 rounded text-white text-[10px] font-bold">GET</span>
          <code class="text-xs">/getmail</code>
          <button data-copy="curl ${baseUrl}/getmail" class="ml-auto text-xs"><i data-lucide="copy" class="w-3.5 h-3.5"></i></button>
        </div>
        <pre class="text-xs bg-black/30 p-2 rounded overflow-x-auto"><code>curl ${baseUrl}/getmail</code></pre>
      </div>
    </section>

    <!-- Endpoints -->
    <section id="endpoints" class="compact-card">
      <h2 class="text-lg font-bold mb-3 flex items-center gap-2"><i data-lucide="server" class="w-5 h-5 text-indigo-400"></i> Endpoints</h2>
      <div class="space-y-2">
        ${['/getmail', '/getmail?name=xyz', '/chkmail?mail=...', '/delete?mail=...&id=...', '/health'].map(ep => `
        <div class="bg-zinc-900/50 rounded-lg p-2.5 border border-white/5 flex items-center gap-2 text-xs">
          <span class="bg-gradient-to-r from-indigo-600 to-violet-600 px-2 py-0.5 rounded text-[10px] font-bold text-white">GET</span>
          <code class="flex-1 text-xs">${ep}</code>
          <button data-copy="${baseUrl}${ep.includes('?') ? ep.split('?')[0] : ep}" class="text-xs"><i data-lucide="copy" class="w-3.5 h-3.5"></i></button>
        </div>`).join('')}
      </div>
    </section>

    <!-- Examples -->
    <section id="examples" class="compact-card">
      <h2 class="text-lg font-bold mb-3 flex items-center gap-2"><i data-lucide="code-2" class="w-5 h-5 text-indigo-400"></i> Examples</h2>
      <div class="grid sm:grid-cols-2 gap-3">
        <div class="bg-zinc-900/50 rounded-lg p-3 border border-white/5">
          <div class="text-xs font-medium text-zinc-300 mb-2">Random Email</div>
          <pre class="text-xs bg-black/30 p-2 rounded overflow-x-auto"><code>curl ${baseUrl}/getmail</code></pre>
        </div>
        <div class="bg-zinc-900/50 rounded-lg p-3 border border-white/5">
          <div class="text-xs font-medium text-zinc-300 mb-2">Check Inbox</div>
          <pre class="text-xs bg-black/30 p-2 rounded overflow-x-auto"><code>curl "${baseUrl}/chkmail?mail=xyz%40domain.com"</code></pre>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="compact-card text-center py-4">
      <p class="text-xs text-zinc-500">Made with <span class="text-red-500">♥</span> by <a href="https://t.me/BJ_Devs" class="underline text-indigo-400">BJ Tricks</a></p>
    </footer>
  </main>

  <!-- Toast -->
  <div id="toast" class="fixed bottom-4 right-4 bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs shadow-xl hidden"><span id="toastMsg"></span></div>

  <script>
    lucide.createIcons();
    fetch('/health').then(r => r.ok && document.getElementById('healthBadge').classList.remove('hidden'));
    document.getElementById('menuBtn').onclick = () => document.getElementById('mobileMenu').classList.toggle('hidden');
    document.querySelectorAll('.scroll-link').forEach(a => a.onclick = e => { e.preventDefault(); document.querySelector(a.getAttribute('href')).scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    document.querySelectorAll('[data-copy]').forEach(btn => btn.onclick = () => {
      const text = btn.getAttribute('data-copy');
      navigator.clipboard.writeText(text).then(() => {
        const msg = document.getElementById('toastMsg'); msg.textContent = 'Copied!';
        const toast = document.getElementById('toast'); toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 1800);
      });
    });
  </script>
</body>
</html>`);
});

module.exports = app;
