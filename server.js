'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const https = require('https');
const crypto = require('crypto');
const cron = require('node-cron');

const db = require('./src/db');
const { tryHandleHealth } = require('./src/handlers');
const pwaApi = require('./src/pwaApi');

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');

const ACCESS_TOKEN = (
  process.env.CHANNEL_Daily_Health_Check_ACCESS_TOKEN
  || process.env.LINE_CHANNEL_ACCESS_TOKEN
  || ''
).trim();
const CHANNEL_SECRET = (
  process.env.CHANNEL_Daily_Health_Check_SECRET
  || process.env.LINE_CHANNEL_SECRET
  || ''
).trim();

app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Web-User-Id');
  if (_req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use('/api/pwa', pwaApi);
app.use(express.static(publicDir, {
  index: 'index.html',
  extensions: ['html'],
  setHeaders(res, filePath) {
    const norm = String(filePath || '').replace(/\\/g, '/').toLowerCase();
    if (norm.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (norm.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    } else if (norm.endsWith('manifest.webmanifest')) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
  },
}));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'daily-health-check' }));

app.post('/webhook', (req, res) => {
  if (CHANNEL_SECRET) {
    const sig = crypto.createHmac('sha256', CHANNEL_SECRET)
      .update(req.rawBody).digest('base64');
    if (req.headers['x-line-signature'] !== sig) return res.sendStatus(403);
  }
  res.sendStatus(200);

  const events = req.body?.events || [];
  for (const ev of events) {
    if (ev.type === 'message') handleMessage(ev).catch((e) => console.error('[webhook]', e));
  }
});

async function handleMessage(ev) {
  const userId = ev.source?.userId;
  if (!userId || !ev.replyToken) return;

  if (ev.message?.type === 'text') {
    const text = String(ev.message.text || '').trim();
    const handled = await tryHandleHealth({
      userId,
      text,
      reply: (messages) => lineReply(ev.replyToken, messages),
    });
    if (handled) return;
  }

  await lineReply(ev.replyToken, [{
    type: 'text',
    text: [
      '請輸入「健康」查看說明。',
      '或輸入「開始打卡」逐步填寫。',
    ].join('\n'),
  }]);
}

function lineRequest(path, body) {
  if (!ACCESS_TOKEN) {
    console.error('[line] 缺少 CHANNEL_Daily_Health_Check_ACCESS_TOKEN（或 LINE_CHANNEL_ACCESS_TOKEN）');
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request({
      hostname: 'api.line.me',
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function lineReply(replyToken, messages) {
  return lineRequest('/v2/bot/message/reply', { replyToken, messages });
}

function linePush(to, messages) {
  return lineRequest('/v2/bot/message/push', { to, messages });
}

cron.schedule('* * * * *', () => {
  if (!ACCESS_TOKEN) return;
  try {
    const hhmm = db.taipeiHHmm();
    const today = db.taipeiYmd();
    const users = db.listUsersDueReminder(hhmm, today);
    for (const row of users) {
      if (String(row.user_id || '').startsWith('web:')) continue;
      linePush(row.user_id, [{
        type: 'text',
        text: [
          '⏰ 該健康打卡囉！',
          '輸入「開始打卡」逐步填寫，或一次輸入「打卡 …」。',
          '輸入「健康」可看完整說明。',
        ].join('\n'),
      }]).then((res) => {
        if (res && res.status >= 200 && res.status < 300) {
          db.markReminderSent(row.user_id, today);
        } else {
          console.error('[reminder] push failed', res && res.status, res && res.body);
        }
      }).catch((e) => console.error('[reminder]', e));
    }
  } catch (e) {
    console.error('[reminder cron]', e);
  }
});

app.listen(PORT, () => {
  console.log(`[daily-health-check] listening on ${PORT}`);
  console.log(`[daily-health-check] PWA: http://localhost:${PORT}/`);
});
