const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public'));

// For custom mail create (if name given)
async function getCustomMail(name) {
  try {
    const checkRes = await axios.post(
      'https://www.disposablemail.com/index/email-check/',
      new URLSearchParams({ email: name, format: 'json' }),
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
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
          'x-requested-with': 'XMLHttpRequest',
          'origin': 'https://www.disposablemail.com',
        }
      }
    );

    const cookie = createRes.headers['set-cookie']?.find(c => c.includes('TMA='))?.split(';')[0];
    const email = decodeURIComponent(cookie?.split('=')[1]);

    return { email, session: cookie };
  } catch {
    return null;
  }
}

// For default mail
async function getDefaultMail() {
  try {
    const homeRes = await axios.get('https://www.disposablemail.com', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
      },
      decompress: true
    });

    const setCookie = homeRes.headers['set-cookie'];
    const phpsessid = setCookie?.find(c => c.includes('PHPSESSID'))?.split(';')[0];
    const csrf = homeRes.data.match(/const CSRF\s*=\s*"(.+?)"/)?.[1];

    const inboxRes = await axios.get(`https://www.disposablemail.com/index/index?csrf_token=${csrf}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': phpsessid
      },
      decompress: true
    });

    return {
      email: inboxRes.data?.email || null,
      password: inboxRes.data?.heslo || null,
    };
  } catch {
    return { email: null, password: null };
  }
}

// API Routes
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
  } catch {
    res.status(500).json({ error: 'Failed to generate mail' });
  }
});

app.get('/chkmail', async (req, res) => {
  const mail = req.query.mail;
  if (!mail) return res.status(400).json({ error: 'Missing mail parameter' });

  try {
    const response = await axios.get('https://www.disposablemail.com/index/refresh', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
        'x-requested-with': 'XMLHttpRequest',
        'Cookie': `TMA=${encodeURIComponent(mail)}`
      }
    });
    res.json(response.data);
  } catch {
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
          'x-requested-with': 'XMLHttpRequest',
          'Cookie': `TMA=${encodeURIComponent(mail)}`
        }
      }
    );
    res.json(delRes.data);
  } catch {
    res.status(500).json({ error: 'Failed to delete mail' });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'healthy', uptime: process.uptime() }));

// Serve docs at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

module.exports = app;
