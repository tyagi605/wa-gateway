import 'dotenv/config';
import express from 'express';
import * as wa from './wa.js';

const app = express();
app.use(express.json());

const API_KEY = process.env.API_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// Authentication middleware
function auth(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.apiKey;
  if (!API_KEY || key !== API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

// Webhook handler for incoming messages
wa.setIncomingHandler(async (msg) => {
  if (!WEBHOOK_URL) return;
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'message', data: msg })
    });
  } catch (e) {
    console.error('Webhook error:', e.message);
  }
});

// QR Code page (no auth needed for local development)
app.get('/qr', async (req, res) => {
  const dataUrl = await wa.qrDataUrl();
  const status = wa.status();

  if (!dataUrl) {
    return res.send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 20px;">
          <h2>WhatsApp Gateway Status</h2>
          <h3 style="color: ${status.connected ? 'green' : 'orange'};">
            ${status.connected ? '✅ Connected' : '⏳ Waiting for QR code...'}
          </h3>
          <p>Refresh in a few seconds.</p>
          <script>setTimeout(() => location.reload(), 3000);</script>
        </body>
      </html>
    `);
  }

  res.send(`
    <html>
      <body style="font-family: Arial; text-align: center; padding: 20px;">
        <h2>📱 Scan with WhatsApp Linked Devices</h2>
        <img src="${dataUrl}" style="width: 300px; height: 300px;" />
        <p>Open WhatsApp > Settings > Linked Devices > Link a Device</p>
        <p>Page auto-refreshes every 5 seconds.</p>
        <script>setTimeout(() => location.reload(), 5000);</script>
      </body>
    </html>
  `);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get account status
app.get('/api/v1/account/detail', auth, (req, res) => {
  res.json({ success: true, ...wa.status() });
});

// Send message
app.post('/api/v1/message/create', auth, async (req, res) => {
  try {
    const { receiverMobileNo, message, filePathUrl, caption } = req.body;

    if (!receiverMobileNo) {
      return res.status(400).json({ success: false, error: 'receiverMobileNo required' });
    }

    const numbers = String(receiverMobileNo)
      .split(',')
      .map(n => n.trim())
      .filter(Boolean);

    const results = [];

    for (const n of numbers) {
      const r = filePathUrl
        ? await wa.sendMedia(n, filePathUrl, caption)
        : await wa.sendText(n, message);

      results.push({ number: n, messageId: r.key.id });
    }

    res.json({ success: true, results });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Initialize WhatsApp connection and start server
await wa.start();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ Gateway running on http://localhost:${PORT}`);
  console.log(`📱 Scan QR code at http://localhost:${PORT}/qr`);
  console.log(`🔐 API Key: ${API_KEY}\n`);
});
