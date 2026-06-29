import 'dotenv/config';
import express from 'express';
import * as wa from './wa.js';

const app = express();
app.use(express.json());

const API_KEY = process.env.API_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// FIX: Validate API_KEY is set and not using default value
if (!API_KEY || API_KEY === 'your-super-secret-random-key-change-this-12345') {
  console.error('❌ ERROR: API_KEY environment variable not set or using default value!');
  console.error('Set a strong API_KEY before deploying to production.');
  console.error('Example: export API_KEY="your-unique-secret-key"');
  process.exit(1);
}

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

    // FIX: Add validation for message/filePathUrl
    if (!message && !filePathUrl) {
      return res.status(400).json({ success: false, error: 'Either message or filePathUrl is required' });
    }

    const numbers = String(receiverMobileNo)
      .split(',')
      .map(n => n.trim())
      .filter(Boolean);

    if (numbers.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid phone numbers provided' });
    }

    const results = [];
    const errors = [];

    for (const n of numbers) {
      try {
        const r = filePathUrl
          ? await wa.sendMedia(n, filePathUrl, caption)
          : await wa.sendText(n, message);

        // FIX: Safe property access with fallback
        results.push({ 
          number: n, 
          messageId: r.key?.id || r.messageTimestamp || 'unknown',
          success: true
        });
      } catch (error) {
        errors.push({
          number: n,
          error: error.message,
          success: false
        });
      }
    }

    // FIX: Return both successful and failed sends
    const response = {
      success: errors.length === 0,
      results: results,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        total: numbers.length,
        successful: results.length,
        failed: errors.length
      }
    };

    res.status(errors.length === 0 ? 200 : 207).json(response);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Initialize WhatsApp connection and start server
try {
  await wa.start();
} catch (error) {
  console.error('Failed to start WhatsApp connection:', error);
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ Gateway running on http://localhost:${PORT}`);
  console.log(`📱 Scan QR code at http://localhost:${PORT}/qr`);
  console.log(`🔐 API Key configured: ${API_KEY.substring(0, 8)}...`);
  console.log(`🌐 Webhook URL: ${WEBHOOK_URL || 'Not configured'}\n`);
});
