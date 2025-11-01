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
// FINAL ODS-STYLE DOCS (EXAMPLES 100% FIXED)
// ======================

app.get('/', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Disposable Mail API - BJ Tricks</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Ubuntu+Mono:wght@400;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"/>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            mono: ['Ubuntu Mono', 'monospace'],
            sans: ['Inter', 'system-ui', 'sans-serif'],
          },
          colors: {
            slate: {
              50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1',
              400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155',
              800: '#1e293b', 900: '#0f172a',
            },
          },
        },
      },
    };
  </script>
  <style>
    ::-webkit-scrollbar { display: none !important; }
    .obf-card {
      background:#fff;
      border:1px solid #e5e7eb;
      transition:all .2s ease;
    }
    .obf-card:hover { border-color:#9ca3af; }
    .toast {
      padding: 1rem 1.5rem;
      border-radius: 0.5rem;
      border: 1px solid #e5e7eb;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      font-weight: 600;
      font-size: 0.875rem;
      max-width: 90%;
      animation: slideDown 0.3s ease forwards;
      opacity: 0;
      pointer-events: auto;
    }
    .toast.success { background-color: #ecfdf5; border-color: #86efac; color: #166534; }
    .toast.error   { background-color: #fee2e2; border-color: #fca5a5; color: #991b1b; }
    @keyframes slideDown {
      from { transform: translateY(-20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .popup-overlay {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.5); z-index: 10000; display: none;
      align-items: center; justify-content: center;
    }
    .popup-content {
      background: #fff; padding: 1.5rem; border: 1px solid #e5e7eb;
      border-radius: 0; max-width: 400px; width: 90%; text-align: center;
      box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
    }
  </style>
</head>
<body class="bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-800 antialiased font-sans min-h-screen">

  <!-- Telegram Popup -->
  <div class="popup-overlay" id="telegram-popup">
    <div class="popup-content">
      <h3 class="text-lg font-bold text-slate-900">Join Our Community!</h3>
      <p class="text-sm text-slate-600 mt-1">Connect with us on Telegram for updates and support.</p>
      <div class="flex gap-3 mt-4">
        <button id="open-link-btn" class="flex-1 bg-slate-900 text-white py-2 rounded-lg text-sm font-medium">Open Link</button>
        <button id="close-popup-btn" class="flex-1 bg-white border border-gray-300 py-2 rounded-lg text-sm font-medium">Close</button>
      </div>
    </div>
  </div>

  <!-- Header -->
  <header class="sticky top-0 z-40 bg-white border-b border-gray-200 py-5 shadow-sm">
    <div class="max-w-2xl mx-auto px-6 flex justify-between items-center">
      <div class="flex items-center space-x-2">
        <i class="fas fa-envelope text-slate-900"></i>
        <h1 class="text-xl font-bold text-slate-900">Disposable Mail API</h1>
      </div>
      <div class="flex items-center space-x-4">
        <a href="https://t.me/BJ_Devs" target="_blank" class="text-sm text-slate-600 hover:text-slate-900">
          <i class="fab fa-telegram-plane"></i>
        </a>
      </div>
    </div>
  </header>

  <!-- Main -->
  <main class="max-w-2xl mx-auto px-6 py-10">

    <!-- Intro -->
    <section class="text-center mb-8">
      <p class="text-slate-600 text-xs mb-2">Generate temporary emails instantly</p>
      <h2 class="text-3xl font-bold text-slate-900">BJ Disposable Mail API</h2>
      <p class="mt-2 text-slate-700 text-sm">Free, fast, and anonymous. No login required.</p>
    </section>

    <!-- Quick Start -->
    <div class="obf-card p-6 mb-6">
      <h3 class="flex items-center gap-2 font-bold text-lg text-slate-900 mb-4">
        <i class="fas fa-bolt text-slate-900"></i> Quick Start
      </h3>
      <div class="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <div class="flex items-center justify-between mb-2">
          <code class="text-sm font-mono text-slate-700">GET /getmail</code>
          <button data-copy="${baseUrl}/getmail" class="text-xs text-slate-600 hover:text-slate-900">
            <i class="fas fa-copy"></i> Copy
          </button>
        </div>
        <pre class="text-xs font-mono text-slate-600 overflow-x-auto">curl ${baseUrl}/getmail</pre>
      </div>
    </div>

    <!-- Endpoints -->
    <div class="obf-card p-6 mb-6">
      <h3 class="flex items-center gap-2 font-bold text-lg text-slate-900 mb-5">
        <i class="fas fa-server text-slate-900"></i> API Endpoints
      </h3>
      <div class="space-y-3">
        ${[
          { method: 'GET', path: '/getmail', desc: 'Generate random email' },
          { method: 'GET', path: '/getmail?name=xyz', desc: 'Custom name (xyz@domain)' },
          { method: 'GET', path: '/chkmail?mail=...', desc: 'Check inbox' },
          { method: 'GET', path: '/delete?mail=...&id=...', desc: 'Delete message' },
          { method: 'GET', path: '/health', desc: 'Health check' }
        ].map(ep => `
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div class="flex items-center gap-3">
            <span class="text-xs font-bold text-pink-600">${ep.method}</span>
            <code class="text-sm font-mono text-slate-700">${ep.path}</code>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-600">${ep.desc}</span>
            <button data-copy="${baseUrl}${ep.path.includes('?') ? ep.path.split('?')[0] : ep.path}" class="text-xs text-slate-600 hover:text-slate-900">
              <i class="fas fa-copy"></i>
            </button>
          </div>
        </div>`).join('')}
      </div>
    </div>

    <!-- EXAMPLES - 100% FIXED (NO OVERFLOW) -->
    <div class="obf-card p-6 mb-6">
      <h3 class="flex items-center gap-2 font-bold text-lg text-slate-900 mb-5">
        <i class="fas fa-code text-slate-900"></i> Examples
      </h3>
      <div class="grid md:grid-cols-2 gap-4">
        <!-- Random Email -->
        <div class="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h4 class="text-sm font-bold text-slate-900 mb-2">Random Email</h4>
          <div class="flex items-center justify-between">
            <pre class="text-xs font-mono text-slate-600 overflow-x-auto whitespace-nowrap"><code id="random-curl">curl ${baseUrl}/getmail</code></pre>
            <button data-copy="${baseUrl}/getmail" class="ml-2 text-xs text-slate-600 hover:text-slate-900">
              <i class="fas fa-copy"></i>
            </button>
          </div>
        </div>

        <!-- Check Inbox -->
        <div class="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h4 class="text-sm font-bold text-slate-900 mb-2">Check Inbox</h4>
          <div class="flex items-center justify-between">
            <pre class="text-xs font-mono text-slate-600 overflow-x-auto whitespace-nowrap"><code id="check-curl">curl "${baseUrl}/chkmail?mail=xyz%40domain.com"</code></pre>
            <button data-copy="${baseUrl}/chkmail?mail=xyz%40domain.com" class="ml-2 text-xs text-slate-600 hover:text-slate-900">
              <i class="fas fa-copy"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Health Badge -->
    <div class="obf-card p-4 mb-6 text-center">
      <div id="healthBadge" class="hidden inline-flex items-center gap-2 text-xs font-medium text-green-700 bg-green-50 px-3 py-1 rounded-full">
        <i class="fas fa-circle text-green-500"></i> API is Live
      </div>
    </div>

    <!-- Footer -->
    <footer class="mt-12 text-center text-xs text-slate-600">
      <p>developer <a href="https://t.me/BJ_Devs" target="_blank" class="underline hover:text-slate-900">BJ Tricks</a></p>
      <p>Thanks to all users and contributors.</p>
      <p class="mt-1">© 2025 BJ Tricks. All rights reserved.</p>
    </footer>
  </main>

  <!-- Donate Button -->
  <button id="donateBtn"
          onclick="window.open('https://t.me/BJ_Devs', '_blank')"
          class="fixed bottom-6 right-6 z-30 bg-slate-900 text-white border-none py-3 px-4 rounded-full text-sm cursor-pointer flex items-center gap-2 shadow-lg hover:bg-slate-800 transition">
    <i class="fas fa-hand-holding-heart"></i> Donate
  </button>

  <!-- Notification Container -->
  <div id="notification-container"></div>

  <!-- Scripts -->
  <script>
    // Auto domain detection
    const baseUrl = window.location.origin;

    // Update curl commands
    document.getElementById('random-curl').textContent = \`curl \${baseUrl}/getmail\`;
    document.getElementById('check-curl').textContent = \`curl "\${baseUrl}/chkmail?mail=xyz%40domain.com"\`;

    // Health Check
    fetch('/health')
      .then(r => r.ok && document.getElementById('healthBadge').classList.remove('hidden'))
      .catch(() => {});

    // Copy to Clipboard
    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-copy');
        navigator.clipboard.writeText(text).then(() => {
          const toast = document.createElement('div');
          toast.className = 'toast success';
          toast.innerHTML = '<i class="fas fa-check mr-2"></i> Copied!';
          document.getElementById('notification-container').appendChild(toast);
          setTimeout(() => toast.remove(), 2000);
        }).catch(() => {
          const toast = document.createElement('div');
          toast.className = 'toast error';
          toast.innerHTML = '<i class="fas fa-times mr-2"></i> Failed!';
          document.getElementById('notification-container').appendChild(toast);
          setTimeout(() => toast.remove(), 2000);
        });
      });
    });

    // Telegram Popup
    document.getElementById('open-link-btn').addEventListener('click', () => {
      window.open('https://t.me/BJ_Devs', '_blank');
      document.getElementById('telegram-popup').style.display = 'none';
    });
    document.getElementById('close-popup-btn').addEventListener('click', () => {
      document.getElementById('telegram-popup').style.display = 'none';
      localStorage.setItem('popupClosed', 'true');
    });

    setTimeout(() => {
      if (!localStorage.getItem('popupClosed')) {
        document.getElementById('telegram-popup').style.display = 'flex';
      }
    }, 3000);

    document.getElementById('telegram-popup').addEventListener('click', (e) => {
      if (e.target === document.getElementById('telegram-popup')) {
        e.target.style.display = 'none';
        localStorage.setItem('popupClosed', 'true');
      }
    });
  </script>
</body>
</html>`);
});

module.exports = app;
