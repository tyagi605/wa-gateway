import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import pino from 'pino';

let sock = null;
let currentQR = null;
let connected = false;
let onIncoming = () => {};

export function setIncomingHandler(fn) {
  onIncoming = fn;
}

export function status() {
  return { connected, hasQR: !!currentQR };
}

export async function qrDataUrl() {
  return currentQR ? QRCode.toDataURL(currentQR) : null;
}

export async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_state');
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' })
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      currentQR = qr;
      connected = false;
      console.log('📱 QR code generated. Scan it to link your WhatsApp.');
    }

    if (connection === 'open') {
      connected = true;
      currentQR = null;
      console.log('✅ WhatsApp connected successfully!');
    }

    if (connection === 'close') {
      connected = false;
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        // FIX: Use setTimeout instead of direct recursion to prevent stack overflow
        console.log('🔄 Reconnecting in 5 seconds...');
        setTimeout(() => start(), 5000);
      } else {
        console.log('❌ Logged out. Delete auth_state folder and scan QR again.');
      }
    }
  });

  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const m of messages) {
      if (!m.key.fromMe && m.message) {
        onIncoming({
          from: m.key.remoteJid,
          text: m.message.conversation || m.message.extendedTextMessage?.text || '',
          raw: m
        });
      }
    }
  });
}

// FIX: Corrected toJid logic - removed impossible @check on numeric string
function toJid(number) {
  if (!number) return null;
  const clean = String(number).replace(/[^0-9]/g, '');
  return clean.length > 0 ? `${clean}@s.whatsapp.net` : null;
}

// FIX: Added input validation
export async function sendText(number, text) {
  if (!connected) throw new Error('WhatsApp not connected');
  if (!text || typeof text !== 'string') {
    throw new Error('Message must be a non-empty string');
  }
  
  const jid = toJid(number);
  if (!jid) throw new Error('Invalid phone number');
  
  return sock.sendMessage(jid, { text });
}

// FIX: Improved media sending with proper buffer handling
export async function sendMedia(number, url, caption) {
  if (!connected) throw new Error('WhatsApp not connected');
  
  const jid = toJid(number);
  if (!jid) throw new Error('Invalid phone number');
  if (!url) throw new Error('URL is required for media');
  
  try {
    // Download the media
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.statusText}`);
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    // Determine media type and prepare message object
    let messageObj = {};
    
    if (contentType.includes('image')) {
      messageObj.image = buffer;
    } else if (contentType.includes('video')) {
      messageObj.video = buffer;
    } else if (contentType.includes('audio')) {
      messageObj.audio = buffer;
    } else if (contentType.includes('pdf') || contentType.includes('document')) {
      messageObj.document = buffer;
      messageObj.mimetype = contentType;
    } else {
      // Default to document
      messageObj.document = buffer;
      messageObj.mimetype = contentType;
    }
    
    if (caption) messageObj.caption = caption;
    
    return sock.sendMessage(jid, messageObj);
  } catch (error) {
    throw new Error(`Failed to send media: ${error.message}`);
  }
}
