const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// CORS for docs
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Custom mail function
async function getCustomMail(name) {
  try {
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
    const email = decodeURIComponent(cookie?.split('=')[1] || '');

    return { email, session: cookie };
  } catch (error) {
    console.error('Custom mail error:', error.message);
    return null;
  }
}

// Default mail function
async function getDefaultMail() {
  try {
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

    if (!csrf) throw new Error('CSRF not found');

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
  } catch (error) {
    console.error('Default mail error:', error.message);
    throw error;
  }
}

// Get mail route
app.get('/getmail', async (req, res) => {
  try {
    const name = req.query.name;
    if (name) {
      const result = await getCustomMail(name);
      if (!result) return res.status(400).json({ error: 'Custom mail not available. Try another name.' });
      return res.json(result);
    } else {
      const data = await getDefaultMail();
      if (!data.email) throw new Error('Failed to generate default mail');
      return res.json(data);
    }
  } catch (error) {
    console.error('Getmail error:', error.message);
    res.status(500).json({ error: 'Failed to generate mail. Try again.' });
  }
});

// Check inbox route
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
  } catch (error) {
    console.error('Chkmail error:', error.message);
    res.status(500).json({ error: 'Failed to check mail' });
  }
});

// Delete mail route
app.get('/delete', async (req, res) => {
  const { mail, id } = req.query;
  if (!mail || !id) return res.status(400).json({ error: 'Missing mail or id parameter' });

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

    res.json({ success: true, data: delRes.data });
  } catch (error) {
    console.error('Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete mail' });
  }
});

// Root route with updated docs link
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Disposable Mail API - By BJ Tricks</title>
      <style>
        body { font-family: Arial, sans-serif; background: #f9f9f9; color: #333; padding: 2rem; text-align: center; }
        h1 { color: #444; }
        code { background: #eee; padding: 2px 6px; border-radius: 4px; }
        ul { line-height: 1.8; list-style: none; padding: 0; }
        a { color: #007bff; text-decoration: none; }
        .credit { background: #f0f8ff; padding: 1rem; border-radius: 8px; margin-top: 2rem; }
      </style>
    </head>
    <body>
      <h1>Disposable Mail API - By BJ Tricks</h1>
      <p>Generate temporary emails for testing. Join my channel for more: <a href="https://t.me/BJ_Devs" target="_blank">@BJ_Devs</a></p>
      <h3>Endpoints:</h3>
      <ul>
        <li><strong>GET <code>/getmail</code></strong> – Random email</li>
        <li><strong>GET <code>/getmail?name=yourname</code></strong> – Custom email</li>
        <li><strong>GET <code>/chkmail?mail=encoded_mail</code></strong> – Check inbox</li>
        <li><strong>GET <code>/delete?mail=encoded_mail&id=msgid</code></strong> – Delete message</li>
      </ul>
      <h4>Example:</h4>
      <pre><code>curl "https://YOUR_API.vercel.app/getmail?name=bjtest"</code></pre>
      <div class="credit">
        <p>Powered by <a href="https://t.me/BJ_Devs" target="_blank">BJ Tricks</a> | Learn Bot APIs</p>
      </div>
    </body>
    </html>
  `);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Disposable Mail API running on port ${port} - By BJ Tricks`);
});

module.exports = app;
