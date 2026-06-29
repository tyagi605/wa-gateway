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
        console.log('🔄 Reconnecting...');
        start();
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

function toJid(number) {
  const clean = String(number).replace(/[^0-9]/g, '');
  return clean.includes('@') ? number : `${clean}@s.whatsapp.net`;
}

export async function sendText(number, text) {
  if (!connected) throw new Error('WhatsApp not connected');
  return sock.sendMessage(toJid(number), { text });
}

export async function sendMedia(number, url, caption) {
  if (!connected) throw new Error('WhatsApp not connected');
  return sock.sendMessage(toJid(number), { image: { url }, caption: caption || '' });
}
